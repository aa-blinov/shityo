/**
 * Поле расстояний до тела манекена (signed distance field).
 *
 * Одна поверхность для всего: по нулевому уровню поля строится сетка
 * манекена (surfaceMesh), к нему же выталкивается ткань в солвере и при
 * отрисовке (pushOut). Поэтому то, что видно, и то, обо что ударяется
 * ткань, совпадают.
 *
 * Тело собрано из частей, слитых гладким минимумом (smooth-min): ядро торса
 * по срезам MakeHuman (body.ts, Sculpt.core), шея, руки, ноги и плечевой
 * пояс - трапеция от основания шеи к плечевой точке и дельта на головке
 * руки. Раньше плечо было срезом торса по ширине плеч с овалом сбоку, и
 * получалась плоская полка с прямыми углами, а рука - приставленная
 * трубка. Гладкий минимум даёт один переход шея - плечо - рука без шва.
 *
 * Поле считается один раз на мерки в узлах сетки с шагом 7 мм; между
 * узлами - трилинейная интерполяция.
 */
import { armPoint, armSemiAxis, coreRow, legProfile, neckProfile, type BodyModel, type Ring } from './body';

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface BodyField {
	/** угол сетки, м */
	x0: number;
	y0: number;
	z0: number;
	/** шаг сетки, м */
	step: number;
	nx: number;
	ny: number;
	nz: number;
	/** расстояние в узлах, м; отрицательное - внутри тела */
	data: Float32Array;
}

const STEP = 0.007;
const FAR = 1;

/** Гладкий минимум: стык двух фигур скругляется радиусом около k. */
export function smin(a: number, b: number, k: number): number {
	if (k <= 0) return Math.min(a, b);
	const h = Math.max(k - Math.abs(a - b), 0) / k;
	return Math.min(a, b) - (h * h * k) / 4;
}

/** Гладкий максимум: пересечение со скруглённой кромкой. */
function smax(a: number, b: number, k: number): number {
	return -smin(-a, -b, k);
}

/** Приближённое расстояние до эллипса с полуосями a, b (первый порядок). */
function ellipseDistance(dx: number, dz: number, a: number, b: number): number {
	const k0 = Math.hypot(dx / a, dz / b);
	const k1 = Math.hypot(dx / (a * a), dz / (b * b));
	if (k1 < 1e-9) return -Math.min(a, b);
	return (k0 * (k0 - 1)) / k1;
}

/** Приближённое расстояние до эллипсоида. */
function ellipsoidDistance(dx: number, dy: number, dz: number, rx: number, ry: number, rz: number): number {
	const k0 = Math.hypot(dx / rx, dy / ry, dz / rz);
	const k1 = Math.hypot(dx / (rx * rx), dy / (ry * ry), dz / (rz * rz));
	if (k1 < 1e-9) return -Math.min(rx, ry, rz);
	return (k0 * (k0 - 1)) / k1;
}

/** Расстояние до конуса со скруглёнными концами (капсулы с разными радиусами). */
function roundCone(p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const abz = b.z - a.z;
	const len2 = abx * abx + aby * aby + abz * abz;
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
	const cx = a.x + abx * t - p.x;
	const cy = a.y + aby * t - p.y;
	const cz = a.z + abz * t - p.z;
	return Math.hypot(cx, cy, cz) - (ra + (rb - ra) * t);
}

/** Эллипс сечения по кольцам на высоте y (кольца по убыванию или возрастанию y). */
function ringAt(rings: Ring[], y: number): { a: number; b: number; z: number } | null {
	for (let i = 1; i < rings.length; i++) {
		const r0 = rings[i - 1];
		const r1 = rings[i];
		const lo = Math.min(r0.y, r1.y);
		const hi = Math.max(r0.y, r1.y);
		if (y < lo || y > hi) continue;
		const t = (y - r0.y) / (r1.y - r0.y || 1);
		return { a: r0.a + (r1.a - r0.a) * t, b: r0.b + (r1.b - r0.b) * t, z: (r0.z ?? 0) + ((r1.z ?? 0) - (r0.z ?? 0)) * t };
	}
	return null;
}

/** Плечевой пояс одной стороны: трапеция и дельта. */
function shoulderShapes(model: BodyModel, side: 1 | -1) {
	const H = model.height;
	const deltoid = armSemiAxis(model.armProfile, model.armR, 0.12);
	const ry = H * 0.04;
	const rx = deltoid.a * 1.2;
	return {
		// Верх трапеции у шеи - на основании шеи (shoulderY), у плеча - на
		// плечевой точке.
		trapezius: {
			a: { x: side * model.neckR * 0.75, y: model.shoulderY - H * 0.019, z: -0.012 },
			b: { x: side * (model.shoulderR - 0.03), y: model.shoulderTipY - H * 0.016, z: -0.004 },
			ra: H * 0.019,
			rb: H * 0.016
		},
		deltoid: {
			x: side * (model.shoulderR + 0.004 - rx),
			y: model.shoulderTipY - ry * 0.75,
			z: 0,
			rx,
			ry,
			rz: deltoid.b * 1.02
		}
	};
}

/** Всё, что в поле зависит только от высоты среза. */
interface RowParams {
	y: number;
	core: Float64Array;
	cap: number;
	/** срез шеи сверху (под шляпку манекена): y - верх шеи */
	topCap: number;
	neck: { a: number; b: number; z: number } | null;
	leg: { a: number; b: number; z: number; cap: number } | null;
	arm: { a: number; b: number; x: number; cap: number } | null;
	armK: number;
	useTrapezius: boolean;
	useDeltoid: boolean;
}

function rowParams(model: BodyModel, y: number): RowParams {
	// Сверху ядро не обрезается крышкой: выше основания шеи оно - круг шеи и
	// уходит в голову. Крышка у верха шеи с гладким минимумом давала кольцо.
	const neckRings = neckProfile(model);
	const top = neckRings[neckRings.length - 1].y;
	// Без ног торс манекена, как у портновского, ниже линии бёдер идёт почти
	// прямо вниз до верха бедра: иначе низ изделия подворачивался под
	// скруглённое дно торса складкой-«карманом».
	const bottom = model.parts.legs ? model.crotchY : formBottom(model);
	let core: Float64Array;
	if (!model.parts.legs && y < model.hipY) {
		const t = Math.min(1, (model.hipY - y) / Math.max(1e-6, model.hipY - bottom));
		const shrink = 1 - 0.1 * t * t;
		core = coreRow(model, model.hipY).map((r) => r * shrink);
	} else {
		core = coreRow(model, Math.max(bottom, Math.min(top, y)));
	}
	const cap = Math.max(bottom - y, y - top);
	const neck = ringAt(neckRings, y);
	// Портновский манекен без головы: шея обрезана под шляпку.
	const topCap = y - neckTop(model);
	// Чего у манекена нет (руки - только под рукав, ноги - только под брюки),
	// того нет и в поле: ткань там висит свободно.
	const legs = legProfile(model);
	const legBottom = legs.rings[legs.rings.length - 1];
	const legRing = model.parts.legs ? ringAt(legs.rings, y) : null;
	const leg = legRing ? { ...legRing, z: legRing.z ?? 0, cap: Math.max(y - legs.rings[0].y, legBottom.y - y) } : null;
	const s = model.armOrigin.y - y;
	const arm =
		model.parts.arms && s >= 0 && s <= model.armLength
			? { ...armSemiAxis(model.armProfile, model.armR, s), x: armPoint(model, 1, s).x, cap: Math.max(-s, s - model.armLength) }
			: null;
	// Стык руки с телом скругляется только у плеча; ниже подмышки рука
	// висит отдельно, и гладкий минимум затянул бы щель перепонкой.
	const armK = Math.max(0, Math.min(1, (y - (model.armpitY + 0.02)) / 0.08)) * 0.03;
	// Плечевой пояс влияет только на своих высотах (с запасом на гладкий
	// минимум): на остальных срезах его не считаем.
	const s0 = shoulderShapes(model, 1);
	const tr = s0.trapezius;
	const reach = Math.max(tr.ra, tr.rb) + 0.06;
	const useTrapezius = y > Math.min(tr.a.y, tr.b.y) - reach && y < Math.max(tr.a.y, tr.b.y) + reach;
	const useDeltoid = Math.abs(y - s0.deltoid.y) < s0.deltoid.ry + 0.08;
	return { y, core, cap, topCap, neck, leg, arm, armK, useTrapezius, useDeltoid };
}

/**
 * Низ торса портновского манекена без ног: на 12 см выше колена, как у
 * манекена для платьев. Короче нельзя: юбка, платье и пальто ниже края
 * висели в пустоте и подворачивались под него складкой.
 */
export function formBottom(model: BodyModel): number {
	return model.kneeY + 0.12;
}

/**
 * Верх шеи манекена под шляпку: на 2,2 % роста выше основания шеи, ниже
 * подбородка (голова - восьмая часть роста сверху), как у манекенов ателье.
 */
export function neckTop(model: BodyModel): number {
	return model.shoulderY + model.height * 0.022;
}

/** Поле тела на одной высоте: функция от (x, z). */
function rowEvaluator(model: BodyModel, y: number): (x: number, z: number) => number {
	const row = rowParams(model, y);
	const { core, cap, topCap, neck, leg, arm, armK, useTrapezius, useDeltoid } = row;
	const angles = model.sculpt.angles;
	const legsX = legProfile(model).x;
	const shapes = [shoulderShapes(model, 1), shoulderShapes(model, -1)];
	return (x, z) => {
		// Ядро торса: звёздное сечение, расстояние по лучу из центра с
		// поправкой на наклон края.
		const rho = Math.hypot(x, z);
		const u = ((((Math.atan2(x, z) / (2 * Math.PI)) % 1) + 1) % 1) * angles;
		const k0 = Math.floor(u) % angles;
		const k1 = (k0 + 1) % angles;
		const f = u - Math.floor(u);
		const R = core[k0] * (1 - f) + core[k1] * f;
		const slope = (core[k1] - core[k0]) / ((2 * Math.PI) / angles) / Math.max(R, 1e-3);
		// Дно торса (у манекена без ног) скруглено.
		let d = smax((rho - R) / Math.sqrt(1 + slope * slope), cap, 0.03);
		if (neck) d = smin(d, ellipseDistance(x, z - neck.z, neck.a, neck.b), 0.02);
		const p = { x, y, z };
		for (const side of [1, -1] as const) {
			const shape = shapes[side > 0 ? 0 : 1];
			const t = shape.trapezius;
			if (useTrapezius) d = smin(d, roundCone(p, t.a, t.b, t.ra, t.rb), 0.045);
			const dl = shape.deltoid;
			if (useDeltoid) d = smin(d, ellipsoidDistance(x - dl.x, y - dl.y, z - dl.z, dl.rx, dl.ry, dl.rz), 0.06);
			if (arm) {
				// Верх руки скруглён: плоский торец у плечевой точки выступал
				// кромкой из-за дельты, и плечо в силуэте получалось с углом.
				const da = smax(ellipseDistance(x - side * arm.x, z, arm.a, arm.b), arm.cap, 0.04);
				d = smin(d, da, armK);
			}
			if (leg) d = Math.min(d, smax(ellipseDistance(x - side * legsX, z - leg.z, leg.a, leg.b), leg.cap, 0.03));
		}
		if (topCap > -0.03) d = smax(d, topCap, 0.012);
		return d;
	};
}

/** Размеры сетки поля: от стоп до головы, на размах рук. */
function fieldGrid(model: BodyModel) {
	const step = STEP;
	const wrist = armPoint(model, 1, model.armLength).x;
	const reach = Math.max(model.parts.arms ? wrist + model.armR * 1.5 : 0, model.shoulderR + 0.06) + 0.03;
	const x0 = -reach;
	const y0 = Math.max(0.002, (model.parts.legs ? legProfile(model).rings.at(-1)!.y : formBottom(model)) - 0.06);
	const y1 = neckTop(model) + 0.03;
	const z0 = -0.24;
	return {
		x0,
		y0,
		z0,
		step,
		nx: Math.ceil((2 * reach) / step) + 1,
		ny: Math.ceil((y1 - y0) / step) + 1,
		nz: Math.ceil(0.48 / step) + 1
	};
}

const fields = new WeakMap<BodyModel, BodyField>();

/** Поле тела на сетке; считается один раз на модель (или заранее на видеокарте). */
export function bodyField(model: BodyModel): BodyField {
	const cached = fields.get(model);
	if (cached) return cached;
	const grid = fieldGrid(model);
	const { x0, y0, z0, step, nx, ny, nz } = grid;
	const data = new Float32Array(nx * ny * nz);
	for (let j = 0; j < ny; j++) {
		const evaluate = rowEvaluator(model, y0 + j * step);
		for (let k = 0; k < nz; k++) {
			const z = z0 + k * step;
			for (let i = 0; i < nx; i++) data[(k * ny + j) * nx + i] = evaluate(x0 + i * step, z);
		}
	}
	const field = { ...grid, data };
	fields.set(model, field);
	return field;
}

/** Поле уже посчитано (на процессоре или видеокарте) - положить в кэш модели. */
export function storeBodyField(model: BodyModel, field: BodyField): void {
	fields.set(model, field);
}

/** Параметры срезов для расчёта поля на видеокарте (gpu.ts). */
export const ROW_STRIDE = 96;

export function fieldGpuInputs(model: BodyModel) {
	const grid = fieldGrid(model);
	const rows = new Float32Array(grid.ny * ROW_STRIDE);
	for (let j = 0; j < grid.ny; j++) {
		const r = rowParams(model, grid.y0 + j * grid.step);
		const o = j * ROW_STRIDE;
		rows.set(r.core, o);
		rows[o + 72] = r.cap;
		rows[o + 90] = r.topCap;
		if (r.neck) rows.set([1, r.neck.a, r.neck.b, r.neck.z], o + 73);
		if (r.leg) rows.set([1, r.leg.a, r.leg.b, r.leg.z, r.leg.cap], o + 77);
		if (r.arm) rows.set([1, r.arm.a, r.arm.b, r.arm.x, r.arm.cap], o + 82);
		rows[o + 87] = r.armK;
		rows[o + 88] = r.useTrapezius ? 1 : 0;
		rows[o + 89] = r.useDeltoid ? 1 : 0;
	}
	const s = shoulderShapes(model, 1);
	const shapes = new Float32Array([
		s.trapezius.a.x, s.trapezius.a.y, s.trapezius.a.z, s.trapezius.ra,
		s.trapezius.b.x, s.trapezius.b.y, s.trapezius.b.z, s.trapezius.rb,
		s.deltoid.x, s.deltoid.y, s.deltoid.z, 0,
		s.deltoid.rx, s.deltoid.ry, s.deltoid.rz, legProfile(model).x
	]);
	return { grid, rows, shapes, angles: model.sculpt.angles };
}

/** Расстояние до тела в точке (трилинейно); вне сетки - далеко. */
export function fieldDistance(field: BodyField, x: number, y: number, z: number): number {
	const fx = (x - field.x0) / field.step;
	const fy = (y - field.y0) / field.step;
	const fz = (z - field.z0) / field.step;
	if (fx < 0 || fy < 0 || fz < 0 || fx >= field.nx - 1 || fy >= field.ny - 1 || fz >= field.nz - 1) return FAR;
	const i = Math.floor(fx);
	const j = Math.floor(fy);
	const k = Math.floor(fz);
	const tx = fx - i;
	const ty = fy - j;
	const tz = fz - k;
	const { nx, ny, data } = field;
	const at = (di: number, dj: number, dk: number) => data[((k + dk) * ny + (j + dj)) * nx + (i + di)];
	const c00 = at(0, 0, 0) * (1 - tx) + at(1, 0, 0) * tx;
	const c10 = at(0, 1, 0) * (1 - tx) + at(1, 1, 0) * tx;
	const c01 = at(0, 0, 1) * (1 - tx) + at(1, 0, 1) * tx;
	const c11 = at(0, 1, 1) * (1 - tx) + at(1, 1, 1) * tx;
	const c0 = c00 * (1 - ty) + c10 * ty;
	const c1 = c01 * (1 - ty) + c11 * ty;
	return c0 * (1 - tz) + c1 * tz;
}

/** Градиент поля (центральные разности на шаг сетки). */
export function fieldGradient(field: BodyField, x: number, y: number, z: number): Vec3 {
	const h = field.step;
	return {
		x: (fieldDistance(field, x + h, y, z) - fieldDistance(field, x - h, y, z)) / (2 * h),
		y: (fieldDistance(field, x, y + h, z) - fieldDistance(field, x, y - h, z)) / (2 * h),
		z: (fieldDistance(field, x, y, z + h) - fieldDistance(field, x, y, z - h)) / (2 * h)
	};
}

/** Нормаль поля, единичная. */
export function fieldNormal(field: BodyField, x: number, y: number, z: number): Vec3 {
	const g = fieldGradient(field, x, y, z);
	const len = Math.hypot(g.x, g.y, g.z);
	if (len < 1e-9) return { x: x >= 0 ? 1 : -1, y: 0, z: 0 };
	return { x: g.x / len, y: g.y / len, z: g.z / len };
}

/**
 * Расстояние и градиент трилинейной интерполяции в одной ячейке - за один
 * проход по восьми узлам. Это быстрый путь столкновений: в солвере его
 * вызывают для каждой точки ткани на каждой итерации.
 */
function sample(field: BodyField, x: number, y: number, z: number): { d: number; gx: number; gy: number; gz: number } | null {
	const fx = (x - field.x0) / field.step;
	const fy = (y - field.y0) / field.step;
	const fz = (z - field.z0) / field.step;
	if (fx < 0 || fy < 0 || fz < 0 || fx >= field.nx - 1 || fy >= field.ny - 1 || fz >= field.nz - 1) return null;
	const i = Math.floor(fx);
	const j = Math.floor(fy);
	const k = Math.floor(fz);
	const tx = fx - i;
	const ty = fy - j;
	const tz = fz - k;
	const { nx, ny, data } = field;
	const base = (k * ny + j) * nx + i;
	const sy = nx;
	const sz = nx * ny;
	const c000 = data[base];
	const c100 = data[base + 1];
	const c010 = data[base + sy];
	const c110 = data[base + sy + 1];
	const c001 = data[base + sz];
	const c101 = data[base + sz + 1];
	const c011 = data[base + sz + sy];
	const c111 = data[base + sz + sy + 1];
	const x00 = c000 + (c100 - c000) * tx;
	const x10 = c010 + (c110 - c010) * tx;
	const x01 = c001 + (c101 - c001) * tx;
	const x11 = c011 + (c111 - c011) * tx;
	const y0 = x00 + (x10 - x00) * ty;
	const y1 = x01 + (x11 - x01) * ty;
	const dx0 = c100 - c000 + (c110 - c010 - (c100 - c000)) * ty;
	const dx1 = c101 - c001 + (c111 - c011 - (c101 - c001)) * ty;
	return {
		d: y0 + (y1 - y0) * tz,
		gx: (dx0 + (dx1 - dx0) * tz) / field.step,
		gy: (x10 - x00 + (x11 - x01 - (x10 - x00)) * tz) / field.step,
		gz: (y1 - y0) / field.step
	};
}

/**
 * Довести точку до уровня gap шагами Ньютона по градиенту трилинейной
 * интерполяции. Поле не точное расстояние (гладкий минимум, приближения
 * эллипсов), поэтому шаг делится на длину градиента. На стыках (подмышка,
 * где рука и торс слиты резко) полный шаг может перескочить складку: шаг,
 * который ухудшил результат, делится пополам. Если уровень не достигнут,
 * берётся лучшая найденная точка снаружи.
 */
function solveLevel(field: BodyField, p: Vec3, gap: number): Vec3 {
	let q = { ...p };
	const first = sample(field, q.x, q.y, q.z);
	if (!first) return q;
	let s = first;
	let best: Vec3 | null = s.d >= gap - 1e-4 ? q : null;
	let bestErr = best ? Math.abs(s.d - gap) : Infinity;
	for (let it = 0; it < 12 && Math.abs(s.d - gap) > 1e-4; it++) {
		const len = Math.hypot(s.gx, s.gy, s.gz);
		const ux = len > 1e-9 ? s.gx / len : q.x >= 0 ? 1 : -1;
		const uy = len > 1e-9 ? s.gy / len : 0;
		const uz = len > 1e-9 ? s.gz / len : 0;
		let move = Math.max(-0.05, Math.min(0.05, (gap - s.d) / Math.max(len, 0.2)));
		let next: Vec3 = q;
		let sn = s;
		for (let tries = 0; tries < 5; tries++) {
			next = { x: q.x + ux * move, y: q.y + uy * move, z: q.z + uz * move };
			const probe = sample(field, next.x, next.y, next.z);
			if (!probe) return next;
			sn = probe;
			if (Math.abs(sn.d - gap) < Math.abs(s.d - gap)) break;
			move /= 2;
		}
		q = next;
		s = sn;
		const err = Math.abs(s.d - gap);
		if (s.d >= gap - 1e-4 && err < bestErr) {
			best = q;
			bestErr = err;
		}
	}
	if (Math.abs(s.d - gap) <= 1e-4) return q;
	if (best) return best;
	// Не сошлось и снаружи точки нет: выход по нормали с запасом.
	const n = fieldNormal(field, q.x, q.y, q.z);
	const extra = gap - s.d + 1e-4;
	return { x: q.x + n.x * extra, y: q.y + n.y * extra, z: q.z + n.z * extra };
}

/**
 * Вытолкнуть точку из тела на расстояние gap от поверхности, по нормали
 * поля. Возвращает null, если точка и так снаружи.
 */
export function pushOut(field: BodyField, p: Vec3, gap = 0): Vec3 | null {
	if (fieldDistance(field, p.x, p.y, p.z) >= gap) return null;
	return solveLevel(field, p, gap);
}

/**
 * Столкновение с телом с учётом пути частицы за шаг.
 *
 * Если на начало шага (from) частица была снаружи, а теперь внутри, она
 * возвращается назад по своему пути до уровня gap: так ткань не проходит
 * тело насквозь. Выталкивание по нормали поля из глубины выводило частицу
 * к ближайшей поверхности, а центр торса близко к спине - и ткань спинки
 * выходила спереди. Если частица была внутри и раньше - выталкивание по
 * нормали (pushOut).
 */
export function collideAlongPath(field: BodyField, p: Vec3, from: Vec3, gap = 0): Vec3 | null {
	const d = fieldDistance(field, p.x, p.y, p.z);
	if (d >= gap) return null;
	if (fieldDistance(field, from.x, from.y, from.z) < gap) return pushOut(field, p, gap);
	let lo = 0;
	let hi = 1;
	for (let it = 0; it < 12; it++) {
		const t = (lo + hi) / 2;
		const q = { x: from.x + (p.x - from.x) * t, y: from.y + (p.y - from.y) * t, z: from.z + (p.z - from.z) * t };
		if (fieldDistance(field, q.x, q.y, q.z) >= gap) lo = t;
		else hi = t;
	}
	return { x: from.x + (p.x - from.x) * lo, y: from.y + (p.y - from.y) * lo, z: from.z + (p.z - from.z) * lo };
}

/** Положить точку на расстояние gap от поверхности тела: снаружи или изнутри. */
export function snapTo(field: BodyField, p: Vec3, gap = 0): Vec3 {
	if (fieldDistance(field, p.x, p.y, p.z) >= 0.5) return { ...p };
	return solveLevel(field, p, gap);
}

/**
 * Сетка поверхности тела по нулевому уровню поля (surface nets): вершина в
 * каждой ячейке, через которую проходит поверхность, - среднее точек
 * пересечения рёбер ячейки; четырёхугольник на каждое пересечённое ребро
 * сетки. Затем вершины доводятся до нулевого уровня по нормали.
 */
export function surfaceMesh(field: BodyField): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
	const { nx, ny, nz, data, step, x0, y0, z0 } = field;
	const index = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
	const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
	const cell = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
	const positions: number[] = [];
	const corners = [
		[0, 0, 0],
		[1, 0, 0],
		[0, 1, 0],
		[1, 1, 0],
		[0, 0, 1],
		[1, 0, 1],
		[0, 1, 1],
		[1, 1, 1]
	];
	const edges = [
		[0, 1],
		[2, 3],
		[4, 5],
		[6, 7],
		[0, 2],
		[1, 3],
		[4, 6],
		[5, 7],
		[0, 4],
		[1, 5],
		[2, 6],
		[3, 7]
	];
	const values = new Float64Array(8);
	for (let k = 0; k < nz - 1; k++)
		for (let j = 0; j < ny - 1; j++)
			for (let i = 0; i < nx - 1; i++) {
				let inside = 0;
				for (let c = 0; c < 8; c++) {
					const [di, dj, dk] = corners[c];
					values[c] = data[index(i + di, j + dj, k + dk)];
					if (values[c] < 0) inside++;
				}
				if (inside === 0 || inside === 8) continue;
				let sx = 0;
				let sy = 0;
				let sz = 0;
				let count = 0;
				for (const [a, b] of edges) {
					const va = values[a];
					const vb = values[b];
					if (va < 0 === vb < 0) continue;
					const t = va / (va - vb);
					sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
					sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
					sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
					count++;
				}
				cellVertex[cell(i, j, k)] = positions.length / 3;
				positions.push(x0 + (i + sx / count) * step, y0 + (j + sy / count) * step, z0 + (k + sz / count) * step);
			}
	const indices: number[] = [];
	const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
		if (a < 0 || b < 0 || c < 0 || d < 0) return;
		if (flip) indices.push(a, b, c, a, c, d);
		else indices.push(a, c, b, a, d, c);
	};
	for (let k = 1; k < nz - 1; k++)
		for (let j = 1; j < ny - 1; j++)
			for (let i = 1; i < nx - 1; i++) {
				const v = data[index(i, j, k)] < 0;
				// Ребро вдоль x от (i,j,k): четыре ячейки вокруг него в плоскости yz.
				if (i < nx - 1 && v !== data[index(i + 1, j, k)] < 0)
					quad(
						cellVertex[cell(i, j - 1, k - 1)],
						cellVertex[cell(i, j, k - 1)],
						cellVertex[cell(i, j, k)],
						cellVertex[cell(i, j - 1, k)],
						v
					);
				if (j < ny - 1 && v !== data[index(i, j + 1, k)] < 0)
					quad(
						cellVertex[cell(i - 1, j, k - 1)],
						cellVertex[cell(i - 1, j, k)],
						cellVertex[cell(i, j, k)],
						cellVertex[cell(i, j, k - 1)],
						v
					);
				if (k < nz - 1 && v !== data[index(i, j, k + 1)] < 0)
					quad(
						cellVertex[cell(i - 1, j - 1, k)],
						cellVertex[cell(i, j - 1, k)],
						cellVertex[cell(i, j, k)],
						cellVertex[cell(i - 1, j, k)],
						v
					);
			}
	const out = new Float32Array(positions);
	const normals = new Float32Array(positions.length);
	for (let v = 0; v < out.length; v += 3) {
		let x = out[v];
		let y = out[v + 1];
		let z = out[v + 2];
		const q = solveLevel(field, { x, y, z }, 0);
		x = q.x;
		y = q.y;
		z = q.z;
		const n = fieldNormal(field, x, y, z);
		out[v] = x;
		out[v + 1] = y;
		out[v + 2] = z;
		normals[v] = n.x;
		normals[v + 1] = n.y;
		normals[v + 2] = n.z;
	}
	return { positions: out, normals, indices: new Uint32Array(indices) };
}
