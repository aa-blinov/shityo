/**
 * Развёртка деталей лекала по поверхности тела.
 *
 * Плоская деталь не может висеть на теле: если её просто поставить
 * вертикально, она упадёт полоской. Поэтому каждая вершина детали
 * переносится на поверхность торса или руки, и ткань уже лежит на фигуре,
 * а физический движок только добавляет провисание и складки.
 *
 * Раскладка детали переда идёт по X (поперёк тела): край детали, который
 * на плоскости лежит у центра переда, встаёт к телу спереди, а
 * противоположный край - по бокам.
 *
 * Единицы: детали приходят в сантиметрах, тело - в метрах.
 */
import { bodyRadius, drapePoint, type BodyModel } from './body';
import type { Vec2 } from './geometry';

export interface WrappedPiece {
	/** Мировые координаты вершин, см. */
	world: number[];
}

/**
 * Развернуть деталь по поверхности торса.
 *
 * `side` задаёт сторону: 1 - перед, -1 - спинка.
 *
 * Края детали кладутся на бок тела (угол ±90°), а середина - на перед
 * или спину. Иначе перед и спинка расходятся: их боковые швы должны
 * встретиться в одной точке, а если края лежат на разных углах, изделие
 * распадается на две половины.
 *
 * Спинка зеркалится относительно переда: обе детали вычерчены одинаково
 * (сгиб по центру, пройма справа), поэтому край со швом у них должен
 * попадать на одну сторону тела.
 */
export function wrapOnTorso(
	model: BodyModel,
	verts: Vec2[],
	side: 1 | -1,
	/**
	 * Контуры переда и спинки, см. С ними деталь ложится по обхвату без
	 * искажения (см. wrapByGirth); без них - по углу, как раньше.
	 */
	panels?: { front: Vec2[]; back: Vec2[] }
): WrappedPiece {
	if (panels) return wrapByGirth(model, verts, side, panels);
	const world: number[] = [];
	const xs = verts.map((v) => v.x);
	const ys = verts.map((v) => v.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const width = Math.max(maxX - minX, 1e-6);

	// Угол, на котором лежит край детали: бок тела.
	const edge = Math.PI / 2;

	for (const v of verts) {
		// Доля поперёк детали: 0 в центре, ±1 по краям.
		const t = (v.x - minX) / width; // 0..1
		const signed = t * 2 - 1; // -1..1
		const theta = side > 0 ? signed * edge : Math.PI - signed * edge;
		// Верх детали - на уровне плеча, дальше вниз. Мерки в сантиметрах,
		// тело - в метрах.
		const y = model.shoulderY - (v.y - minY) / 100;
		const point = drapePoint(model, theta, y);
		const radius = Math.hypot(point.x,point.z) || 1;
        const gap = 1 + 0.005 / radius;
        world.push(point.x*gap, point.y, point.z*gap);
	}
	return { world };
}

/** Ширина контура детали на высоте y (по плоскости детали), см. */
function rowWidth(outline: Vec2[], y: number): number {
	let lo = Infinity;
	let hi = -Infinity;
	for (let i = 0; i < outline.length; i++) {
		const a = outline[i];
		const b = outline[(i + 1) % outline.length];
		if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
			const x = Math.abs(b.y - a.y) < 1e-9 ? a.x : a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
			lo = Math.min(lo, x);
			hi = Math.max(hi, x);
		}
	}
	return hi > lo ? hi - lo : 0;
}

/** Сечение тела на высоте y, отодвинутое наружу на off, с длинами дуг от середины переда. */
interface Section {
	points: { x: number; z: number }[];
	/** длина дуги от середины переда (theta = 0) до точки i, м */
	arc: number[];
	length: number;
}

const SECTION_SAMPLES = 96;
/** зазор между раскладкой и телом, м */
const WRAP_GAP = 0.005;

function section(model: BodyModel, y: number, girth: number | null): Section {
	const base = Array.from({ length: SECTION_SAMPLES }, (_, i) => {
		const p = drapePoint(model, (i / SECTION_SAMPLES) * Math.PI * 2, y);
		return { x: p.x, z: p.z };
	});
	const perimeter = (pts: { x: number; z: number }[]) =>
		pts.reduce((sum, p, i) => sum + Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].z - p.z), 0);
	// Запас по обхвату (прибавка) - отступ сечения наружу: у выпуклого
	// контура длина растёт на 2*pi*off.
	const off = girth === null ? WRAP_GAP : Math.max(WRAP_GAP, (girth - perimeter(base)) / (2 * Math.PI));
	const points = base.map((p, i) => {
		const prev = base[(i - 1 + SECTION_SAMPLES) % SECTION_SAMPLES];
		const next = base[(i + 1) % SECTION_SAMPLES];
		// Наружная нормаль: обход идёт от +z к +x (по часовой при взгляде сверху).
		let nx = next.z - prev.z;
		let nz = -(next.x - prev.x);
		const len = Math.hypot(nx, nz) || 1;
		nx /= len;
		nz /= len;
		if (nx * p.x + nz * p.z < 0) {
			nx = -nx;
			nz = -nz;
		}
		return { x: p.x + nx * off, z: p.z + nz * off };
	});
	const arc = [0];
	for (let i = 1; i <= SECTION_SAMPLES; i++) {
		const a = points[i - 1];
		const b = points[i % SECTION_SAMPLES];
		arc.push(arc[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
	}
	return { points, arc, length: arc[SECTION_SAMPLES] };
}

/** Точка сечения на длине дуги s от середины переда (по ходу к +x). */
function pointAtArc(sec: Section, s: number): { x: number; z: number } {
	const L = sec.length;
	const t = ((s % L) + L) % L;
	let i = 0;
	while (i < SECTION_SAMPLES - 1 && sec.arc[i + 1] < t) i++;
	const span = sec.arc[i + 1] - sec.arc[i] || 1;
	const f = (t - sec.arc[i]) / span;
	const a = sec.points[i];
	const b = sec.points[(i + 1) % SECTION_SAMPLES];
	return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

/**
 * Раскладка по обхвату: каждый ряд детали ложится на сечение тела своей
 * длиной с лекала. Сечение отступает от тела на прибавку: перед и спинка
 * вместе дают обхват изделия, а не тела. Середина переда - спереди,
 * середина спинки - сзади, боковые швы встречаются там, где кончаются
 * ширины деталей.
 *
 * Раскладка по углу (спинка от -90 до 90 градусов сзади) сжимала широкую
 * спинку поперёк до 0,7, а у узкой детали растягивала: ткань с длинами с
 * лекала потом сминалась рябью на месте сжатия.
 *
 * Выше подмышки ряды деталей уже, пройма - разрыв между ними; сечение и
 * масштаб там берутся с ряда подмышки.
 */
function wrapByGirth(model: BodyModel, verts: Vec2[], side: 1 | -1, panels: { front: Vec2[]; back: Vec2[] }): WrappedPiece {
	const top = (outline: Vec2[]) => Math.min(...outline.map((p) => p.y));
	const frontTop = top(panels.front);
	const backTop = top(panels.back);
	const minY = Math.min(...verts.map((v) => v.y));
	// Высота мира по плоскости детали: верх детали - на уровне плеча.
	const worldY = (flatY: number) => model.shoulderY - (flatY - minY) / 100;
	const girthAt = (y: number) => {
		const depth = (model.shoulderY - y) * 100;
		return (rowWidth(panels.front, frontTop + depth) + rowWidth(panels.back, backTop + depth)) / 100;
	};
	const armpitGirth = girthAt(model.armpitY);
	const armpitLength = section(model, model.armpitY, armpitGirth > 0 ? armpitGirth : null).length;
	const cache = new Map<number, { sec: Section; scale: number }>();
	const sectionAt = (y: number) => {
		const key = Math.round(y * 1000);
		let entry = cache.get(key);
		if (!entry) {
			const above = y > model.armpitY;
			const girth = above ? armpitGirth : girthAt(y);
			const sec = section(model, y, girth > 0 ? girth : null);
			const reference = above ? armpitLength : sec.length;
			const g = above ? armpitGirth : girth;
			// Детали покрывают всё сечение: дуга масштабируется под обхват
			// изделия (у тугого трикотажа прибавка отрицательная - ткань тянется).
			entry = { sec, scale: g > 0 ? reference / g : 1 };
			cache.set(key, entry);
		}
		return entry;
	};
	const world: number[] = [];
	for (const v of verts) {
		const y = worldY(v.y);
		const { sec, scale } = sectionAt(y);
		// x детали отсчитывается от середины (сгиб - x = 0); у спинки дуга
		// идёт от середины спинки (половина длины сечения) к той же стороне +x.
		// Тело симметрично слева направо: середина спинки - ровно на половине
		// длины сечения, и боковые швы переда и спинки сходятся.
		const s = side > 0 ? (v.x / 100) * scale : sec.length / 2 - (v.x / 100) * scale;
		const p = pointAtArc(sec, s);
		world.push(p.x, y, p.z);
	}
	return { world };
}

/**
 * Насколько деталь обходит тело.
 *
 * Передняя деталь закрывает всю переднюю половину, спинка - заднюю.
 * Ширина детали приходит в сантиметрах, тело - в метрах.
 */
export function torsoSpan(model: BodyModel, widthCm: number): number {
	const r = bodyRadius(model, model.bustY, 0);
	const meanRadius = (r.a + r.b) / 2;
	// Угол, который деталь занимает на теле: дуга делится на средний радиус.
	return Math.min(Math.PI * 1.05, widthCm / 100 / meanRadius);
}
