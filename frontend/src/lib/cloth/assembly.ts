/**
 * Сборка изделия для 3D-превью.
 *
 * Здесь детали лекала превращаются в мягкие тела, а швы между ними
 * превращаются в рёбра симуляции. Логика вынесена из компонента, потому
 * что её приходится считать и проверять числами, а не глазами.
 *
 * Ключевые решения:
 *
 * 1. **Пройма - это петля на теле.** У проймы есть форма: петля вокруг
 *    плеча и подмышки (`armholePoint` в `body.ts`). Перед, спинка и рукав
 *    идут по одной и той же петле, поэтому швы сходятся в одной точке.
 *    Если разложить детали по各自 «своим» кривым, швы стягивают их в
 *    разные стороны, и изделие рвётся на части.
 *
 * 2. **Спинка зеркалится относительно переда.** Обе детали вычерчены
 *    одинаково (сгиб по центру, пройма справа), поэтому край с проймой у
 *    них должен попадать на одну сторону тела.
 *
 * 3. **Рукав - это конус от проймы к запястью.** Окат рукава в раскладке -
 *    это арка над плечом, а не кольцо вокруг руки, поэтому развернуть
 *    рукав «как трубу» нельзя: получится плоский диск поперёк тела. Рукав
 *    строится как поверхность между петлёй проймы и кругом запястья.
 */
import {
	armFrame,
    armPoint,
	armSemiAxis,
	bodyRadius,
	armholeLoop,
	armSurfaceRadius,
	buildBodyModel,
	legProfile,
    torsoPoint,
    trunkRadius,
    drapePoint,
	shoulderEdgePoint,
	type ArmholeHalf,
	type BodyGender,
	type BodyModel,
	type Vec3
} from './body';
import { earClip, refineLongEdges, subdivide, uniformMesh, type Vec2 } from './geometry';
import { bodyField, fieldDistance, snapTo } from './field';
import { wrapOnTorso } from './wrap';
import type { Piece } from '$lib/types';

export interface Part {
	id: string;
	/** Плоские вершины детали, см. */
	verts: Vec2[];
	tris: number[];
	/** Мировые координаты, м. */
	world: number[];
}

export interface Seam {
	a: string;
	b: string;
	/** Пары индексов вершин: a[i] соответствует b[i]. */
	pairs: [number, number][];
}

export interface Pin {
	piece: string;
	vertex: number;
	position: [number, number, number];
}

export interface Garment {
	parts: Part[];
	seams: Seam[];
	pins: Pin[];
	/** верх без рукава: при отрисовке ткань не уходит на внешнюю сторону руки */
	sleeveless?: boolean;
}

/** Сколько точек берём на шов. */
const SEAM_POINTS = 10;

/** Сколько колец у рукава: от проймы к запястью. */
const SLEEVE_ROWS = 6;
/**
 * Шаг сетки ткани, см. На процессоре - 3 см (регрессии, браузер без
 * WebGPU), на видеокарте - мельче: buildGarment({ resolution }).
 */
let meshStep = 3;

/** Зазор между тканью рукава и рукой, м. */
const SLEEVE_GAP = 0.004;

/**
 * Собрать изделие из деталей лекала.
 *
 * `pieces` - детали в координатах API: контур в миллиметрах, швы -
 * подписанные отрезки в тех же миллиметрах.
 */
export type GarmentKind = 'upper' | 'skirt' | 'trousers';

/** Тип изделия по модели: платье и жилет - верх без рукавов, а не низ. */
export function garmentKind(model: string | undefined, pieces: Piece[]): GarmentKind {
	if (model === 'skirt' || pieces.some((p) => p.id === 'skirt')) return 'skirt';
	if (model === 'trousers') return 'trousers';
	if (model) return 'upper';
	// Без модели: по деталям, как раньше (скрипты регрессий ткани).
	return pieces.some((p) => p.id === 'sleeve') ? 'upper' : 'trousers';
}

/**
 * Полочка с бортом кроится половинкой (cut = 2). Для 3D её разворачивают в
 * цельный перед по середине переда: борт уходит под застёжку и форму не
 * меняет, а обёртка торса ждёт симметричную деталь.
 */
function foldedFront(source: Piece): Piece {
	const piece = closedDarts(source);
	if (piece.id !== 'front' || piece.cut !== 2 || !piece.mirrored) return piece;
	const right = piece.outline.filter((p) => p.x >= -1e-6);
	// Замыкающая точка контура не входит в половину: иначе по середине
	// переда получается разрез от низа до горловины.
	const last = right[right.length - 1];
	if (right.length > 1 && last.x === right[0].x && last.y === right[0].y) right.pop();
	if (right.length < 3) return piece;
	const mirrored = right
		.slice(1, -1)
		.reverse()
		.map((p) => ({ x: -p.x, y: p.y }));
	return { ...piece, outline: [...right, ...mirrored, right[0]], cut: 1, mirrored: false };
}

/**
 * Вырезанная вытачка (клин в контуре) в сшитом изделии закрыта. В 3D её
 * вершину убирают из контура: иначе на боку зияет треугольная дыра.
 * Вершина клина - точка, от которой оба соседа уходят наружу больше чем на
 * 3 см при близкой высоте.
 */
function closedDarts(piece: Piece): Piece {
	const pts = piece.outline;
	const darts: { apex: { x: number; y: number }; upper: { x: number; y: number }; lower: { x: number; y: number } }[] = [];
	const kept = pts.filter((p, i) => {
		if (i === 0 || i === pts.length - 1) return true;
		const prev = pts[i - 1];
		const next = pts[i + 1];
		const inward = Math.abs(prev.x) - Math.abs(p.x) > 30 && Math.abs(next.x) - Math.abs(p.x) > 30;
		const dart = inward && Math.abs(prev.y - next.y) < 120 && Math.sign(prev.x) === Math.sign(next.x);
		if (dart) darts.push({ apex: p, upper: prev.y <= next.y ? prev : next, lower: prev.y <= next.y ? next : prev });
		return !dart;
	});
	if (kept.length === pts.length) return piece;
	// Вытачку закрывают поворотом: всё ниже её нижней стороны поднимается
	// на раствор. У бока - на весь раствор, к вершине - на нет, середина
	// переда остаётся на месте (так перед становится выпуклым на груди).
	// Без этого бок переда ниже вытачки длиннее бока спинки, и шов
	// сшивал точки, разнесённые на десятки сантиметров.
	const lift = (p: { x: number; y: number }) => {
		let dy = 0;
		for (const d of darts) {
			if (Math.sign(p.x) !== Math.sign(d.lower.x) || p.y < d.lower.y - 1e-6) continue;
			const span = Math.abs(d.lower.x) - Math.abs(d.apex.x);
			const w = span > 0 ? Math.max(0, Math.min(1, (Math.abs(p.x) - Math.abs(d.apex.x)) / span)) : 1;
			dy += (d.lower.y - d.upper.y) * w;
		}
		return dy;
	};
	const keep = kept
		.map((p) => ({ ...p, y: p.y - lift(p) }))
		.filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > 1);
	if (Math.hypot(keep[0].x - keep[keep.length - 1].x, keep[0].y - keep[keep.length - 1].y) > 1e-6) keep.push({ ...keep[0] });
	// Бок с вытачкой в лекале подписан «сшитым» (нижняя часть поднята на
	// раствор) - для сравнения длин. В 3D шов сшивается по самой детали,
	// поэтому бок берётся из контура: от угла проймы до низа.
	const notch = (label: string) => piece.notches.find((n) => n.label === label);
	const armhole = notch('пройма');
	const hemNotch = notch('бок');
	const hem = hemNotch ? { ...hemNotch, y: hemNotch.y - lift(hemNotch) } : undefined;
	const nearest = (x: number, y: number) =>
		keep.reduce((best, p, i) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(keep[best].x - x, keep[best].y - y) ? i : best), 0);
	let seamEdges = piece.seam_edges;
	if (armhole && hem) {
		const from = nearest(armhole.x, armhole.y);
		const to = nearest(hem.x, hem.y);
		if (from < to) {
			const side = keep.slice(from, to + 1);
			seamEdges = piece.seam_edges.map((e) => (e.label === 'бок' ? { ...e, points: side } : e));
		}
	}
	return { ...piece, outline: keep, seam_edges: seamEdges };
}

export function buildGarment(
	sourcePieces: Piece[],
	measurements: Record<string, number>,
	options: { model?: string; gender?: BodyGender; body?: BodyModel; resolution?: number } = {}
): Garment {
	meshStep = options.resolution ?? 3;
	// Тело можно передать готовым: его поле расстояний считается полсекунды,
	// и превью не должно строить его второй раз.
	const model = options.body ?? buildBodyModel(measurements, { gender: options.gender });
	const pieces = sourcePieces.map(foldedFront);
	const kind = garmentKind(options.model, pieces);
	if (kind !== 'upper') return buildLowerGarment(pieces, model, kind === 'skirt');
	const parts: Part[] = [];
	const seams: Seam[] = [];
	const pins: Pin[] = [];

	/** Кэш цепочек швов: ключ - идентификатор ребра. */
	const chains = new Map<string, { index: number; t: number }[]>();

	for (const piece of pieces) {
		if (piece.outline.length < 3) continue;
		// На торс ложатся только перед и спинка: рукав и воротник строятся
		// отдельно, резинки, капюшон и карман в превью не участвуют.
		if (piece.id !== 'front' && piece.id !== 'back') continue;
		const outline: Vec2[] = piece.outline.map((p) => ({ x: p.x / 10, y: p.y / 10 }));
		// Равномерная сетка: у ушной триангуляции контура были узкие
		// треугольники через всю деталь, и ткань ломалась по ним заломами.
		const mesh = uniformMesh(outline, meshStep);
        const boundary = boundaryVertices(mesh.tris);

		const side: 1 | -1 = piece.id === 'back' ? -1 : 1;
		const world = wrapOnTorso(model, mesh.verts, side).world;
		const part: Part = { id: piece.id, verts: mesh.verts, tris: mesh.tris, world };
		parts.push(part);

		// Швы детали: подписанный отрезок и его зеркало на другой стороне.
		for (const edge of piece.seam_edges ?? []) {
			const points = (edge.points ?? []).map((p) => ({ x: p.x / 10, y: p.y / 10 }));
			if (points.length < 2) continue;
			chains.set(
				`${piece.id}:${edge.label}`,
				findEdgeVertices(mesh.verts, [{ label: edge.label, points }], false, boundary)
			);
			chains.set(
				`${piece.id}:${edge.label}:mirror`,
				findEdgeVertices(mesh.verts, [{ label: edge.label, points }], true, boundary)
			);
		}
	}

	// Полость проймы кладём на тело: перед, спинка и рукав идут по одной
	// петле, поэтому швы сходятся точно. Длина петли берётся из лекала:
	// ткань в пройме не может растянуться, иначе рукав распухает.
	const frontPiece = pieces.find((p) => p.id === 'front');
	const backPiece = pieces.find((p) => p.id === 'back');



	const loopPoints = new Map<string, { point: Vec3; index: number; psi: number }[]>();
	const sleeveless = !pieces.some((p) => p.id === 'sleeve');
	for (const side of [1, -1] as const) {
		const loop = armholeLoop(model, side, 32, sleeveless);
		for (const front of [true, false] as const) {
			const panelId = front ? 'front' : 'back';
			const part = parts.find((p) => p.id === panelId);
			const chain = chains.get(`${panelId}:пройма${side > 0 ? '' : ':mirror'}`);
			if (!part || !chain || chain.length === 0) continue;

			const half = front ? loop.front : loop.back;
			const before = chain.map((v) => [0, 1, 2].map((k) => part.world[v.index * 3 + k]));
			const placed = placeOnLoop(part, chain, half);
			// Без рукава срез проймы переезжает с внешней стороны руки к её стыку
			// с торсом; соседняя ткань должна уехать вместе с ним, иначе она
			// остаётся снаружи руки и треугольники лифа проходят сквозь руку.
			followBoundary(part, chain, before, 5);
			loopPoints.set(
				`${panelId}:${side}`,
				chain.map((vertex, i) => ({
					point: {
						x: part.world[vertex.index * 3],
						y: part.world[vertex.index * 3 + 1],
						z: part.world[vertex.index * 3 + 2]
					},
					index: vertex.index,
					psi: placed[i]
				}))
			);
		}
	}

	// Рукав: поверхность от петли проймы к кругу запястья. Его верх состоит из
	// самих вершин проймы, поэтому шов получается нулевым.
	const sleevePiece = pieces.find((p) => p.id === 'sleeve');
	const hemWidth = sleevePiece ? hemWidthCm(sleevePiece) : 32;
	for (const side of [1, -1] as const) {
		const frontChain = loopPoints.get(`front:${side}`);
		const backChain = loopPoints.get(`back:${side}`);
		if (!frontChain || !backChain) continue;

		if (!sleevePiece) continue;
        const sleeveLength = (Math.max(...sleevePiece.outline.map(p => p.y)) - Math.min(...sleevePiece.outline.map(p => p.y))) / 1000;
        const sleeve = buildSleeve(model, side, frontChain, backChain, hemWidth, sleeveLength);
		parts.push(sleeve.part);

		const frontPart = parts.find((p) => p.id === 'front');
		const backPart = parts.find((p) => p.id === 'back');
		if (!frontPart || !backPart) continue;
		seams.push({ a: sleeve.part.id, b: 'front', pairs: sleeve.frontPairs });
		seams.push({ a: sleeve.part.id, b: 'back', pairs: sleeve.backPairs });
	}

	// Плечевой шов: перед и спинка сшиваются по плечу. Обе детали кладутся
	// на одну и ту же кривую плеча тела - иначе шов разрывается, потому что
	// вырез горловины у переда и у спинки разной глубины.
	for (const side of [1, -1] as const) {
		const loop = shoulderCurve(model, side, SEAM_POINTS);
		for (const id of ['front', 'back']) {
			const part = parts.find((p) => p.id === id);
			const chain = chains.get(`${id}:плечо${side > 0 ? '' : ':mirror'}`);
			if (!part || !chain || chain.length === 0) continue;
			const before = chain.map((v) => [0, 1, 2].map((k) => part.world[v.index * 3 + k]));
			placeOnCurve(part, chain, loop);
			// Ткань у плеча опускается вслед за швом: иначе верх детали висел
			// на 2 см над плечом, сползал и собирался складкой на груди.
			followBoundary(part, chain, before, 6);
		}

		const frontChain = chains.get(`front:плечо${side > 0 ? '' : ':mirror'}`);
		const backChain = chains.get(`back:плечо${side > 0 ? '' : ':mirror'}`);
		if (!frontChain || !backChain) continue;
		const frontPart = parts.find((p) => p.id === 'front');
		const backPart = parts.find((p) => p.id === 'back');
		if (!frontPart || !backPart) continue;
		// Оба плеча лежат на одной кривой по доле длины: сшиваются по ней же.
		// По ближайшему расстоянию при разной разметке контура пары переда и
		// спинки разъезжались на несколько сантиметров.
		const shoulderPairs = pairByParameter(frontChain, backChain);
		seams.push({ a: 'front', b: 'back', pairs: shoulderPairs });
	}

    for (const mirrored of [false, true]) {
        const suffix = mirrored ? ':mirror' : '';
        const a = chains.get(`front:бок${suffix}`);
        const b = chains.get(`back:бок${suffix}`);
        const front = parts.find(p => p.id === 'front');
        const back = parts.find(p => p.id === 'back');
        if (a && b && front && back) {
            for (const [part,chain] of [[front,a],[back,b]] as const) {
                for (const vertex of chain) {
                    if(vertex.t < 1e-6) continue; // shared armhole endpoint
                    const y=model.shoulderY-part.verts[vertex.index].y/100;
                    const point=drapePoint(model,mirrored ? -Math.PI/2:Math.PI/2,y);
                    part.world[vertex.index*3]=point.x+(mirrored ? -0.005:0.005);
                    part.world[vertex.index*3+1]=point.y;
                    part.world[vertex.index*3+2]=0;
                }
            }
            seams.push({ a: 'front', b: 'back', pairs: pairByParameter(a, b) });
        }
    }

	// Выше подмышки ткань лежит на плечах: точки переда и спинки, которые
	// после раскладки висят над телом дальше 1,2 см, опускаются на тело.
	// Иначе у передней проймы оставалась «палатка» над дельтой, и ткань
	// собиралась складкой-козырьком.
	const field = bodyField(model);
	for (const part of parts.filter((p) => p.id === 'front' || p.id === 'back')) {
		// Край детали (швы, подгибы) уже на своих местах и сшит с соседями.
		const edge = partEdge(part);
		for (let i = 0; i < part.verts.length; i++) {
			if (edge.has(i)) continue;
			const y = part.world[i * 3 + 1];
			if (y < model.armpitY) continue;
			const p = { x: part.world[i * 3], y, z: part.world[i * 3 + 2] };
			if (fieldDistance(field, p.x, p.y, p.z) <= 0.012) continue;
			const q = snapTo(field, p, 0.006);
			part.world[i * 3] = q.x;
			part.world[i * 3 + 1] = q.y;
			part.world[i * 3 + 2] = q.z;
		}
	}

	// Плечи держат ткань: без закрепления деталь висит на одной точке и
	// распахивается. Закрепляется плечо переда: спинка пришита к нему швом.
	// Плечо спинки бывает другой длины (наклон переда круче), и две
	// закреплённые вершины одного узла тянули бы его в разные стороны.
	for (const id of ['front']) {
		const part = parts.find((p) => p.id === id);
		if (!part) continue;
		// Закреплены только концы плечевого шва: у шеи и в плечевой точке.
		// Закреплённое целиком плечо держало край горловины на весу, и она
		// стояла вокруг шеи стойкой; теперь ткань между точками ложится на
		// плечо и шею сама.
		const ends = (chain: { index: number; t: number }[] | undefined) => {
			if (!chain || chain.length === 0) return [];
			const sorted = [...chain].sort((a, b) => a.t - b.t);
			return [sorted[0].index, sorted[sorted.length - 1].index];
		};
		for (const vertex of new Set([...ends(chains.get(`${id}:плечо`)), ...ends(chains.get(`${id}:плечо:mirror`))])) {
			pins.push({
				piece: id,
				vertex,
				position: [
					part.world[vertex * 3],
					part.world[vertex * 3 + 1],
					part.world[vertex * 3 + 2]
				]
			});
		}
	}

    const collar = pieces.find(p => p.id === 'collar');
    if (collar) {
        for (const side of [1, -1] as const) {
            // Контур воротника - длинная полоса: без измельчения триангуляция
            // даёт треугольники во всю длину, и вокруг шеи они шли хордой
            // через шею на 4 см.
            const clipped = earClip(collar.outline.map(p => ({ x: p.x / 10, y: p.y / 10 })));
            const mesh = refineLongEdges(clipped.verts, clipped.tris, 1.5);
            const width = Math.max(...mesh.verts.map(v => v.x));
            const world = mesh.verts.flatMap(v => {
                // Сгиб воротника (x = 0) - середина спинки, конец - у середины
                // переда. Раньше было наоборот: широкая часть торчала спереди.
                const theta = side * Math.PI * (1 - v.x / width);
                const radius = model.neckR + Math.max(0, v.y) / 100 * 0.65 + 0.004;
                // Линия притачивания - у горловины, чуть выше основания шеи: шея
                // манекена обрезана под шляпку, и на прежней высоте воротник
                // висел над ней.
                const collarY = model.shoulderY + 0.012;
                return [radius * Math.sin(theta), collarY - v.y / 100 * 0.5, radius * Math.cos(theta)];
            });
            const id = `collar-${side}`;
            parts.push({ id, ...mesh, world });
            mesh.verts.forEach((v, i) => { if (v.y <= 0.1) pins.push({ piece: id, vertex: i, position: [world[i*3], world[i*3+1], world[i*3+2]] }); });
        }
    }
    addTrims(pieces, model, parts, pins);
    return { parts, seams, pins, sleeveless };
}

/** Сетка-прямоугольник columns x rows: вершины в долях 0..1. */
function grid(columns: number, rows: number): { verts: Vec2[]; tris: number[] } {
	const verts: Vec2[] = [];
	const tris: number[] = [];
	for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) verts.push({ x: c / columns, y: r / rows });
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < columns; c++) {
			const a = r * (columns + 1) + c;
			tris.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
		}
	return { verts, tris };
}

/**
 * Отделка трикотажных кофт: пояс, манжеты, капюшон и карман.
 *
 * Это не ткань под гравитацией, а неподвижные детали, закреплённые всеми
 * вершинами (как воротник у горловины): резинка обтягивает тело, капюшон
 * держит форму головы, карман пришит к переду. Имена начинаются с trim-:
 * в отверстиях сшитого изделия они не участвуют.
 */
function addTrims(pieces: Piece[], model: BodyModel, parts: Part[], pins: Pin[]) {
	const pinAll = (part: Part) => {
		parts.push(part);
		for (let i = 0; i < part.verts.length; i++)
			pins.push({ piece: part.id, vertex: i, position: [part.world[i * 3], part.world[i * 3 + 1], part.world[i * 3 + 2]] });
	};
	const front = parts.find((p) => p.id === 'front');
	const frontPiece = pieces.find((p) => p.id === 'front');
	const height = (piece: Piece) => {
		const ys = piece.outline.map((p) => p.y / 10);
		return Math.max(...ys) - Math.min(...ys);
	};

	const band = pieces.find((p) => p.id === 'waistband');
	if (band && frontPiece) {
		// Пояс - кольцо под низом изделия; готовая высота - половина детали.
		const hemY = model.shoulderY - height(frontPiece) / 100;
		const tall = height(band) / 2 / 100;
		const mesh = grid(48, 2);
		const world = mesh.verts.flatMap((v) => {
			const theta = v.x * Math.PI * 2;
			const y = hemY - v.y * tall;
			const r = bodyRadius(model, y, theta);
			return [(r.a + 0.012) * Math.sin(theta), y, (r.b + 0.012) * Math.cos(theta)];
		});
		pinAll({ id: 'trim-waistband', verts: mesh.verts, tris: mesh.tris, world });
	}

	const cuff = pieces.find((p) => p.id === 'cuff');
	const sleeve = pieces.find((p) => p.id === 'sleeve');
	if (cuff && sleeve) {
		const start = Math.min(model.armLength - 0.02, height(sleeve) / 100);
		const tall = Math.min(height(cuff) / 2 / 100, model.armLength - start);
		for (const side of [1, -1] as const) {
			const frame = armFrame(model, side);
			const mesh = grid(24, 2);
			const world = mesh.verts.flatMap((v) => {
				const s = start + v.y * tall;
				const centre = armPoint(model, side, s);
				const axes = armSemiAxis(model.armProfile, model.armR, s);
				const phi = v.x * Math.PI * 2;
				const a = axes.a + 0.007;
				const b = axes.b + 0.007;
				return [
					centre.x + frame.out.x * a * Math.cos(phi),
					centre.y,
					centre.z + frame.forward.z * b * Math.sin(phi)
				];
			});
			pinAll({ id: `trim-cuff-${side}`, verts: mesh.verts, tris: mesh.tris, world });
		}
	}

	const hood = pieces.find((p) => p.id === 'hood');
	if (hood) {
		// Капюшон опущен на спину: у портновского манекена нет головы. Линия
		// притачивания - вокруг основания шеи (лицевой край у переда шеи),
		// дальше сложенный вдвое капюшон лежит на спине, пухлый посередине.
		const field = bodyField(model);
		const mesh = grid(16, 12);
		const length = model.height * 0.17;
		for (const side of [1, -1] as const) {
			const world = mesh.verts.flatMap((v) => {
				const u = v.x;
				const s = 1 - v.y;
				const az = side * (0.3 + 0.7 * u) * Math.PI;
				const r = model.neckR * 1.3;
				const ring = { x: r * Math.sin(az), y: model.shoulderY + 0.012, z: r * Math.cos(az) };
				const width = model.height * 0.075 * (1 - 0.35 * s);
				const y = model.shoulderY - s * length;
				// Точка спины берётся изнутри торса и выводится на поверхность.
				const inside = -trunkRadius(model, Math.min(y, model.neckY), Math.PI) * 0.6;
				const lay = snapTo(
					field,
					{ x: side * (1 - u) * width, y, z: inside },
					0.03 + 0.02 * Math.sin(Math.PI * s)
				);
				const t = Math.min(1, s / 0.3);
				const e = t * t * (3 - 2 * t);
				return [ring.x + (lay.x - ring.x) * e, ring.y + (lay.y - ring.y) * e, ring.z + (lay.z - ring.z) * e];
			});
			pinAll({ id: `trim-hood-${side}`, verts: mesh.verts, tris: mesh.tris, world });
		}
	}

	const pocket = pieces.find((p) => p.id === 'pocket');
	const mark = frontPiece?.internal_lines.find((l) => l.label === 'карман');
	if (pocket && front && mark) {
		// Карман кладётся на перед по разметке и чуть поверх ткани.
		const outline = mark.points.map((p) => ({ x: p.x / 10, y: p.y / 10 }));
		const mesh = subdivide(earClip(outline).verts, earClip(outline).tris, 1);
		const wrapped = wrapOnTorso(model, [...front.verts, ...mesh.verts], 1).world.slice(front.verts.length * 3);
		const world: number[] = [];
		for (let i = 0; i < wrapped.length; i += 3) {
			const scale = 1 + 0.01 / Math.max(0.05, Math.hypot(wrapped[i], wrapped[i + 2]));
			world.push(wrapped[i] * scale, wrapped[i + 1], wrapped[i + 2] * scale);
		}
		pinAll({ id: 'trim-pocket', verts: mesh.verts, tris: mesh.tris, world });
	}
}

/**
 * Кривая плеча тела: от шеи к плечевой точке.
 *
 * Перед и спинка кладутся на неё обе: у них вырез горловины разной
 * глубины, поэтому шов по плечу иначе разошёлся бы.
 */
function shoulderCurve(model: BodyModel, side: 1 | -1, count: number): Vec3[] {
	const points: Vec3[] = [];
	for (let i = 0; i < count; i++) {
		points.push(shoulderEdgePoint(model, side, count === 1 ? 0 : i / (count - 1)));
	}
	return points;
}

/**
 * Перенести вершины детали на кривую.
 *
 * Вершины шва раскладываются по кривой по длине: иначе шов сойдётся не
 * везде.
 */
function placeOnCurve(part: Part, chain: { index: number; t: number }[], curve: Vec3[]): void {
	if (chain.length === 0 || curve.length === 0) return;
	for (const vertex of chain) {
		const point = samplePolyline(curve, vertex.t);
		part.world[vertex.index * 3] = point.x;
		part.world[vertex.index * 3 + 1] = point.y;
		part.world[vertex.index * 3 + 2] = point.z;
	}
}

/**
 * Длина подписанного шва детали, м.
 *
 * Швы лекала приходят в миллиметрах, тело - в метрах.
 */
function seamLengthM(piece: Piece | undefined, label: string): number {
	if (!piece) return 0;
	for (const edge of piece.seam_edges ?? []) {
		if (edge.label !== label || !edge.points || edge.points.length < 2) continue;
		let sum = 0;
		for (let i = 0; i < edge.points.length - 1; i++) {
			sum += Math.hypot(
				edge.points[i + 1].x - edge.points[i].x,
				edge.points[i + 1].y - edge.points[i].y
			);
		}
		return sum / 1000;
	}
	return 0;
}

/**
 * Построить рукав: поверхность от петли проймы к кругу запястья.
 *
 * Рукав строится в цилиндрических координатах вокруг оси руки: у каждого
 * столбца свой угол, и столбец идёт вниз по оси. Иначе ткань перекручивается
 * и рукав распухает в плоский веер.
 *
 * Верх рукава состоит из самих вершин проймы переда и спинки, уже
 * разложенных на тело: тогда шов получается нулевым по построению, а не
 * сшиванием близких точек.
 */
function buildSleeve(
	model: BodyModel,
	side: 1 | -1,
	frontChain: { point: Vec3; index: number; psi: number }[],
	backChain: { point: Vec3; index: number; psi: number }[],
	hemWidth: number,
	sleeveLength: number
): { part: Part; frontPairs: [number, number][]; backPairs: [number, number][] } {
	const id = side > 0 ? 'sleeve-right' : 'sleeve-left';
	const frame = armFrame(model, side);

	// Столбцы рукава: пройма переда (плечо -> подмышка), затем пройма
	// спинки в обратном порядке (подмышка -> плечо). Вместе это замкнутая
	// петля вокруг плеча.
	const columns = frontChain.length + backChain.length;
	const top: Vec3[] = [
		...frontChain.map((v) => v.point),
		...backChain
			.slice()
			.reverse()
			.map((v) => v.point)
	];
	// Угол каждого столбца вокруг оси руки. Пройма спинки идёт зеркально
	// пройме переда, поэтому её углы отрицательные: столбцы рукава в итоге
	// обходят руку по кругу, без перекрутки.
	const psi: number[] = [
		...frontChain.map((v) => v.psi),
		...backChain
			.slice()
			.reverse()
			.map((v) => -v.psi)
	];

	// Радиус манжеты: ширина низа рукава в раскладке - это длина окружности,
	// которую обходит манжета, поэтому делим на 2*pi, а не на pi.
	// Ряды рукава - с шагом сетки ткани: шесть рядов на всю длину давали
	// полосы по 10 см, и рукав ломался гранями.
	const rowCount = Math.max(SLEEVE_ROWS, Math.round((sleeveLength * 100) / meshStep));
	const hemRadius = Math.max(0.03, hemWidth / 100 / (2 * Math.PI));
	const sHem = sleeveLength;

	// Кольца рукава: от проймы к запястью.
	const rings: Vec3[][] = [];
	for (let row = 0; row <= rowCount; row++) {
		const t = row / rowCount;
		const ring: Vec3[] = [];
		for (let c = 0; c < columns; c++) {
			const from = top[c];
			const angle = psi[c];
			const c2 = Math.cos(angle);
			const s2 = Math.sin(angle);
			// Радиус столбца на этой высоте: ткань идёт от проймы к манжете,
			// но не может пройти сквозь руку. Столбец стартует на своей
			// станции проймы: у плечевой точки она выше, у подмышки ниже.
			const s0 = (model.shoulderTipY - model.armpitY) * (1 - Math.cos(angle)) / 2;
			const s = s0 + (sHem - s0) * t;
			const armR = armSurfaceRadius(model, s, angle);
			const target = Math.max(hemRadius, armR + SLEEVE_GAP);
			// Радиус проймы берём с самой петли: столбец стартует ровно на ней.
			const capCentre=armPoint(model,side,s0);
            const centre=armPoint(model,side,s);
            const r0 = Math.hypot(from.x - capCentre.x, from.z - capCentre.z);
			const r = r0 + (target - r0) * t;
			// Петля проймы доведена до поверхности тела (у плеча - дельта), и
			// по углу и радиусу её точка восстанавливается не точно: верхний
			// ряд берётся с самой петли, поправка сходит на нет к манжете.
			const at0 = {
				x: capCentre.x + frame.out.x * r0 * c2 + frame.forward.x * r0 * s2,
				y: capCentre.y,
				z: frame.origin.z + frame.out.z * r0 * c2 + frame.forward.z * r0 * s2
			};
			const fade = (1 - t) * (1 - t);
			ring.push({
				x: centre.x + frame.out.x * r * c2 + frame.forward.x * r * s2 + (from.x - at0.x) * fade,
				y: centre.y + (from.y - at0.y) * fade,
				z: frame.origin.z + frame.out.z * r * c2 + frame.forward.z * r * s2 + (from.z - at0.z) * fade
			});
		}
		rings.push(ring);
	}

	// Сетка рукава: вершины и треугольники.
	const verts: Vec2[] = [];
	const world: number[] = [];
	const tris: number[] = [];
	for (let row = 0; row <= rowCount; row++) {
		for (let c = 0; c < columns; c++) {
			const point = rings[row][c];
			verts.push({ x: c, y: row });
			world.push(point.x, point.y, point.z);
		}
	}
	for (let row = 0; row < rowCount; row++) {
		for (let c = 0; c < columns; c++) {
			const c2 = (c + 1) % columns;
			const a = row * columns + c;
			const b = row * columns + c2;
			const d = (row + 1) * columns + c;
			const e = (row + 1) * columns + c2;
			tris.push(a, d, b, b, d, e);
		}
	}

	const part: Part = { id, verts, tris, world };

	// Швы: столбец рукава с той же вершиной детали.
	const frontPairs: [number, number][] = frontChain.map((vertex, c) => [c, vertex.index]);
	const backPairs: [number, number][] = backChain.map((vertex, j) => [
		frontChain.length + (backChain.length - 1 - j),
		vertex.index
	]);

	return { part, frontPairs, backPairs };
}

/**
 * Ширина низа рукава, см.
 *
 * Низ - самая нижняя часть контура рукава; её ширина и есть длина
 * окружности, которую обходит манжета.
 */
function hemWidthCm(piece: Piece): number {
	let maxY = -Infinity;
	for (const point of piece.outline) maxY = Math.max(maxY, point.y);
	let min = Infinity;
	let max = -Infinity;
	for (const point of piece.outline) {
		if (point.y < maxY - 1) continue;
		min = Math.min(min, point.x);
		max = Math.max(max, point.x);
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) return 30;
	return (max - min) / 10;
}

/**
 * Перенести вершины детали на петлю.
 *
 * `chain` - вершины шва в порядке обхода: от плеча к подмышке. Петля
 * задана в том же порядке, и вершины детали раскладываются по ней по
 * длине - иначе шов с рукавом сойдётся не везде.
 *
 * Возвращает угол вокруг оси руки для каждой вершины: он нужен, чтобы
 * построить рукав в тех же цилиндрических координатах.
 */
function placeOnLoop(
	part: Part,
	chain: { index: number; t: number }[],
	half: ArmholeHalf
): number[] {
	if (chain.length === 0 || half.points.length === 0) return [];
	const params: number[] = [];
	for (const vertex of chain) {
		const point = samplePolyline(half.points, vertex.t);
		part.world[vertex.index * 3] = point.x;
		part.world[vertex.index * 3 + 1] = point.y;
		part.world[vertex.index * 3 + 2] = point.z;
		params.push(psiAt(half, vertex.t));
	}
	return params;
}

/** Вершины края детали: рёбра, которые входят в один треугольник. */
function partEdge(part: Part): Set<number> {
	const count = new Map<string, number>();
	for (let i = 0; i < part.tris.length; i += 3)
		for (let j = 0; j < 3; j++) {
			const a = part.tris[i + j];
			const b = part.tris[i + ((j + 1) % 3)];
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			count.set(key, (count.get(key) ?? 0) + 1);
		}
	const edge = new Set<number>();
	for (const [key, n] of count) if (n === 1) key.split(':').forEach((v) => edge.add(Number(v)));
	return edge;
}

/**
 * Сдвинуть ткань у края вслед за краем.
 *
 * Каждая вершина ближе radius см (по лекалу) к цепочке получает средний
 * сдвиг цепочки, взвешенный по расстоянию, и плавно затухающий к radius.
 */
function followBoundary(
	part: Part,
	chain: { index: number }[],
	before: number[][],
	radius: number
): void {
	const onChain = new Set(chain.map((v) => v.index));
	// Другие края детали (соседние швы) уже разложены и сшиты: их не трогаем.
	const edge = partEdge(part);
	const deltas = chain.map((v, i) => [0, 1, 2].map((k) => part.world[v.index * 3 + k] - before[i][k]));
	for (let i = 0; i < part.verts.length; i++) {
		if (onChain.has(i) || edge.has(i)) continue;
		const p = part.verts[i];
		let nearest = Infinity;
		let total = 0;
		const sum = [0, 0, 0];
		chain.forEach((v, j) => {
			const q = part.verts[v.index];
			const d = Math.hypot(p.x - q.x, p.y - q.y);
			nearest = Math.min(nearest, d);
			const w = 1 / (d * d + 1e-6);
			total += w;
			for (let k = 0; k < 3; k++) sum[k] += deltas[j][k] * w;
		});
		if (nearest >= radius) continue;
		const t = 1 - nearest / radius;
		const fade = t * t * (3 - 2 * t);
		for (let k = 0; k < 3; k++) part.world[i * 3 + k] += (sum[k] / total) * fade;
	}
}

/** Угол вокруг оси руки в доле длины половины петли. */
function psiAt(half: ArmholeHalf, t: number): number {
	const points = half.points;
	if (points.length < 2) return half.psi[0] ?? 0;
	const lengths = chainLengths(points);
	const total = lengths[lengths.length - 1];
	const target = total * Math.min(1, Math.max(0, t));
	for (let i = 1; i < points.length; i++) {
		if (lengths[i] >= target) {
			const span = lengths[i] - lengths[i - 1];
			const local = span > 0 ? (target - lengths[i - 1]) / span : 0;
			return half.psi[i - 1] + (half.psi[i] - half.psi[i - 1]) * local;
		}
	}
	return half.psi[half.psi.length - 1];
}

/**
 * Спаровать вершины двух деталей по близости в пространстве.
 *
 * Порядок обхода у швов может отличаться, поэтому пары ищутся по
 * расстоянию, а не по индексу.
 */
/**
 * Сшить две цепочки по доле длины шва, по порядку.
 *
 * Жадный подбор ближайших точек ломался, когда на одной детали точек на шве
 * больше: точки другой детали кончались раньше, и последние склеивались с
 * точками в десятках сантиметров. Здесь каждая точка редкой цепочки берёт
 * ближайшую по доле длины точку плотной, не возвращаясь назад; лишние
 * точки плотной цепочки лежат между сшитыми и держатся тканью.
 */
function pairByParameter(aChain: { index: number; t: number }[], bChain: { index: number; t: number }[]): [number, number][] {
	const swap = aChain.length > bChain.length;
	const few = swap ? bChain : aChain;
	const many = swap ? aChain : bChain;
	const pairs: [number, number][] = [];
	let j = 0;
	for (let i = 0; i < few.length; i++) {
		const last = many.length - (few.length - i);
		let best = j;
		for (let k = j; k <= last; k++) {
			if (Math.abs(many[k].t - few[i].t) < Math.abs(many[best].t - few[i].t)) best = k;
		}
		pairs.push(swap ? [many[best].index, few[i].index] : [few[i].index, many[best].index]);
		j = best + 1;
	}
	// Оставшиеся точки плотной цепочки пришиваются к ближайшей по доле длины
	// точке редкой: иначе между сшитыми узлами остаётся щель.
	const used = new Set(pairs.map((pair) => (swap ? pair[0] : pair[1])));
	for (const vertex of many) {
		if (used.has(vertex.index)) continue;
		const near = few.reduce((best, v) => (Math.abs(v.t - vertex.t) < Math.abs(best.t - vertex.t) ? v : best), few[0]);
		if (near) pairs.push(swap ? [vertex.index, near.index] : [near.index, vertex.index]);
	}
	return pairs;
}

function pairByDistance(a: Part, aChain: number[], b: Part, bChain: number[]): [number, number][] {
	const pairs: [number, number][] = [];
	const used = new Set<number>();
	for (const ia of aChain) {
		const ax = a.world[ia * 3];
		const ay = a.world[ia * 3 + 1];
		const az = a.world[ia * 3 + 2];
		let best = -1;
		let bestDist = Infinity;
		for (const ib of bChain) {
			if (used.has(ib)) continue;
			const d = Math.hypot(ax - b.world[ib * 3], ay - b.world[ib * 3 + 1], az - b.world[ib * 3 + 2]);
			if (d < bestDist) {
				bestDist = d;
				best = ib;
			}
		}
		if (best >= 0) {
			used.add(best);
			pairs.push([ia, best]);
		}
	}
	return pairs;
}

/**
 * Найти вершины сетки, лежащие на шве.
 *
 * Возвращает для каждой вершины её параметр на шве: долю длины шва от
 * начала. Параметр нужен, чтобы положить вершины на петлю тела и сшить
 * их с рукавом по той же петле.
 *
 * `mirrored` - шов лежит на зеркальной стороне детали: тогда вершины
 * ищутся с обратным знаком X, а точки шва остаются исходными. Иначе вершина
 * ищется не на своём шве, а на симметричном ему.
 *
 * Точки шва и вершины сетки заданы в одних единицах - сантиметрах.
 */
function findEdgeVertices(
    verts: Vec2[],
    edges: { label: string; points: { x: number; y: number }[] }[],
    mirrored = false,
    boundary?: Set<number>
): { index: number; t: number }[] {
    const result: {index:number;t:number}[] = [];
    const sign = mirrored ? -1:1;
    for (let index=0;index<verts.length;index++) {
        if (boundary && !boundary.has(index)) continue;
        const point={x:verts[index].x*sign,y:verts[index].y};
        for (const edge of edges) {
            let distance=Infinity;
            for(let i=1;i<edge.points.length;i++) {
                const a=edge.points[i-1],b=edge.points[i];
                const dx=b.x-a.x,dy=b.y-a.y;
                const length=dx*dx+dy*dy;
                const t=length>0 ? Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
                distance=Math.min(distance,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));
            }
            if(distance<1e-4) { result.push({index,t:projectOnPolyline(point,edge.points)});break; }
        }
    }
    return result.sort((a,b)=>a.t-b.t);
}

/**
 * Доля длины ломаной, в которой проекция точки лежит.
 *
 * Точки ломаной заданы в сантиметрах, как и вершина.
 */
function projectOnPolyline(point: Vec2, polyline: Vec2[]): number {
	if (polyline.length < 2) return 0;
	const lengths = [0];
	for (let i = 1; i < polyline.length; i++) {
		lengths.push(
			lengths[i - 1] + Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y)
		);
	}
	const total = lengths[lengths.length - 1];
	if (total <= 0) return 0;

	let best = 0;
	let bestDist = Infinity;
	for (let i = 1; i < polyline.length; i++) {
		const a = polyline[i - 1];
		const b = polyline[i];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lenSq = dx * dx + dy * dy;
		const local = lenSq > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq)) : 0;
		const px = a.x + dx * local;
		const py = a.y + dy * local;
		const d = Math.hypot(point.x - px, point.y - py);
		if (d < bestDist) {
			bestDist = d;
			best = (lengths[i - 1] + local * (lengths[i] - lengths[i - 1])) / total;
		}
	}
	return best;
}

/**
 * Точки плечевого шва детали: все точки верхней четверти.
 *
 * Именно они держат ткань на плече - если закрепить низ детали, она
 * провиснет и упадёт.
 */
function shoulderVertices(verts: Vec2[]): number[] {
	const ys = verts.map((v) => v.y);
	const minY = Math.min(...ys);
	const height = Math.max(...ys) - minY;
	return verts
		.map((v, i) => ({ v, i }))
		.filter(({ v }) => v.y <= minY + height * 0.25)
		.map(({ i }) => i);
}

/** Длины участков ломаной, накопленные от начала. */
function chainLengths(points: { x: number; y: number; z: number }[]): number[] {
	const lengths = [0];
	for (let i = 1; i < points.length; i++) {
		const d = Math.hypot(
			points[i].x - points[i - 1].x,
			points[i].y - points[i - 1].y,
			points[i].z - points[i - 1].z
		);
		lengths.push(lengths[i - 1] + d);
	}
	return lengths;
}

/** Точка ломаной на расстоянии t (0..1) от начала. */
function samplePolyline(points: Vec3[], t: number): Vec3 {
	if (points.length === 0) return { x: 0, y: 0, z: 0 };
	if (points.length === 1) return points[0];
	const lengths = chainLengths(points);
	const total = lengths[lengths.length - 1];
	const target = total * Math.min(1, Math.max(0, t));
	for (let i = 1; i < points.length; i++) {
		if (lengths[i] >= target) {
			const span = lengths[i] - lengths[i - 1];
			const local = span > 0 ? (target - lengths[i - 1]) / span : 0;
			const a = points[i - 1];
			const b = points[i];
			return {
				x: a.x + (b.x - a.x) * local,
				y: a.y + (b.y - a.y) * local,
				z: a.z + (b.z - a.z) * local
			};
		}
	}
	return points[points.length - 1];
}

/** Bounds of the original outline at a height, in centimetres. */
function sectionBounds(outline: Vec2[], y: number): [number, number] {
    const xs: number[] = [];
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        if (Math.abs(a.y - y) < 1e-7) xs.push(a.x);
        if ((a.y < y && b.y > y) || (b.y < y && a.y > y)) xs.push(a.x + (b.x-a.x) * (y-a.y)/(b.y-a.y));
    }
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
}

/** Lower garments are anchored at the waist, with a mesh for each cut panel. */
function buildLowerGarment(pieces: Piece[], model: BodyModel, skirt: boolean): Garment {
    const parts: Part[] = [];
    const pins: Pin[] = [];
    const seams: Seam[] = [];
    if (!skirt) return buildTrouserPreview(pieces, model);
    const boundaries = new Map<string, number[]>();
    for (const piece of pieces) {
        const outline = piece.outline.map(p => ({x:p.x/10,y:p.y/10}));
        // Юбка из переда и спинки: каждая деталь - своя половина цилиндра.
        // Старое цельное полотнище кроится дважды и даёт обе половины.
        const sides = piece.id === 'front' ? [1] as const : piece.id === 'back' ? [-1] as const : [1, -1] as const;
        for (const side of sides) {
            const mesh = uniformMesh(outline, meshStep);
            const front = piece.id !== 'back';
            const boundary: number[] = [];
            const meshBoundary = boundaryVertices(mesh.tris);
            const world = mesh.verts.flatMap((v,i) => {
                const [lo,hi] = sectionBounds(outline,v.y);
                const width = Math.max(hi-lo,0.01);
                const t = Math.max(0,Math.min(1,(v.x-lo)/width));
                if (meshBoundary.has(i) && v.y > 0.1 && (t < 1e-5 || t > 1-1e-5)) boundary.push(i);
                const y = model.waistY - v.y / 100;
                if (skirt) {
                    const theta = side > 0 ? (t*2-1)*Math.PI/2 : Math.PI-(t*2-1)*Math.PI/2;
                    const radius = width/100/Math.PI;
                    return [Math.sin(theta)*radius,y,Math.cos(theta)*radius];
                }
                const crotch = Math.max(0.01, model.waistY - model.hipY + 0.1);
                const blend = Math.max(0, Math.min(1, (v.y/100) / crotch));
                const pelvisAngle = (1-t)*Math.PI/2;
                const pelvisX = side * model.rings[1].a * Math.sin(pelvisAngle);
                const pelvisZ = (front ? 1:-1) * model.rings[1].b * Math.cos(pelvisAngle);
                const theta = t*Math.PI;
                const radius = width/100/Math.PI;
                const legX = side*(model.rings[0].a*0.42 + Math.cos(theta)*radius);
                const legZ = (front ? 1:-1)*Math.sin(theta)*radius;
                return [pelvisX*(1-blend)+legX*blend,y,pelvisZ*(1-blend)+legZ*blend];
            });
            const id = `${piece.id}-${side}`;
            parts.push({ id, ...mesh, world });
            boundaries.set(id,boundary);
            mesh.verts.forEach((v,i) => { if (v.y <= 0.1) pins.push({piece:id,vertex:i,position:[world[i*3],world[i*3+1],world[i*3+2]]}); });
        }
    }
    const pair = (a: Part | undefined,b: Part | undefined) => {
        if (a && b) seams.push({a:a.id,b:b.id,pairs:pairByDistance(a,boundaries.get(a.id) ?? [],b,boundaries.get(b.id) ?? [])});
    };
    if (skirt) pair(parts[0],parts[1]);
    else for (const side of [1,-1]) pair(parts.find(p=>p.id===`front-${side}`),parts.find(p=>p.id===`back-${side}`));
    return {parts,seams,pins};
}

/** Shared ring stations keep trouser panel seams aligned despite unequal flat widths. */
function buildTrouserPreview(pieces: Piece[], model: BodyModel): Garment {
    const front=pieces.find(p=>p.id==='front'),back=pieces.find(p=>p.id==='back');
    if(!front || !back) return {parts:[],seams:[],pins:[]};
    const outlines=[front,back].map(p=>p.outline.map(v=>({x:v.x/10,y:v.y/10})));
    const height=Math.min(front.bbox.height,back.bbox.height)/10;
    const crotch=(front.seam_edges.find(e=>e.label==='шаг')?.points[0].y ?? height*10*0.28)/10;
    // Плотность сетки штанины - от шага сетки ткани (3 см - как раньше).
    const along=Math.max(32,Math.round(96/meshStep)),columns=Math.max(20,Math.round(60/meshStep));
    const stations=[...new Set([...Array.from({length:along+1},(_,i)=>height*i/along),...Array.from({length:13},(_,i)=>crotch*(0.6+0.4*i/12)),(model.waistY-model.rings[0].y)*100,crotch])].sort((a,b)=>a-b);
    const rows=stations.length-1;
    const parts:Part[]=[],pins:Pin[]=[],seams:Seam[]=[];
    const legs=legProfile(model);
    for(const side of [1,-1] as const) for(const isFront of [true,false]) {
        const id=`${isFront?'front':'back'}-${side}`;
        const verts:Vec2[]=[],world:number[]=[],tris:number[]=[];
        for(let row=0;row<=rows;row++) {
            const yCm=stations[row];
            const bounds=outlines.map(outline=>sectionBounds(outline,yCm));
            const girth=(bounds[0][1]-bounds[0][0]+bounds[1][1]-bounds[1][0])/100;
            const radius=girth/(2*Math.PI);
            // Таз следует за телом на своей высоте: у пояса - талия, ниже -
            // бёдра. Постоянное кольцо бёдер делало верх брюк коробкой.
            const pelvis=bodyRadius(model,model.waistY-yCm/100,0);
            // Штанины начинаются от линии бёдер: выше брюки облегают таз, иначе
            // у пояса верх уже бёдер и ткань вминается в тело.
            const hipCm=Math.max(0,Math.min(crotch-4,(model.waistY-model.hipY)*100));
            const blend=Math.max(0,Math.min(1,(yCm-hipCm)/Math.max(crotch-hipCm,1)));
            const smooth=blend*blend*(3-2*blend);
            for(let column=0;column<=columns;column++) {
                const t=column/columns;
                const angle=(1-t)*Math.PI/2;
                const pelvisX=side*(pelvis.a+0.008)*Math.sin(angle);
                const pelvisZ=(isFront?1:-1)*(pelvis.b+0.008)*Math.cos(angle);
                const legFraction=Math.max(0,(yCm-crotch)/Math.max(1,height-crotch));
                // Под шагом штанина начинается во всю ширину таза и за 12 см
                // сходит к своей ширине: иначе на линии шага ступенька, как у
                // подола юбки над лосинами.
                const seat=bodyRadius(model,model.waistY-crotch/100,0).a+0.008;
                const below=Math.max(0,Math.min(1,(yCm-crotch)/12));
                const leg=trouserLeg(legs,model.waistY-yCm/100,radius,legFraction,seat*(1-below*below*(3-2*below)));
                const legX=side*(leg.x+Math.cos(t*Math.PI)*leg.a);
                const legZ=(isFront?1:-1)*Math.sin(t*Math.PI)*leg.b;
                const index=verts.length;
                verts.push({x:t*girth*100/2,y:yCm});
                const atCrotch=column===columns && Math.abs(yCm-crotch)<1e-7;
                world.push(column===columns && yCm<=crotch ? 0 : pelvisX*(1-smooth)+legX*smooth,model.waistY-yCm/100,atCrotch ? 0 : pelvisZ*(1-smooth)+legZ*smooth);
                if(row===0) pins.push({piece:id,vertex:index,position:[world[index*3],world[index*3+1],world[index*3+2]]});
                if(row<rows && column<columns) {
                    const a=index,b=index+1,c=index+columns+1,d=c+1;
                    tris.push(a,c,b,b,c,d);
                }
            }
        }
        parts.push({id,verts,world,tris});
    }
    for(const side of [1,-1]) {
        const pairs:[number,number][]=[];
        for(let row=0;row<=rows;row++) {
            const outside=row*(columns+1);
            pairs.push([outside,outside]);
            if(stations[row]>=crotch) pairs.push([outside+columns,outside+columns]);
        }
        seams.push({a:`front-${side}`,b:`back-${side}`,pairs});
    }
    for(const panel of ['front','back']) {
        const pairs:[number,number][]=[];
        for(let row=0;row<=rows;row++) {
            if(stations[row]>crotch) break;
            const index=row*(columns+1)+columns;
            pairs.push([index,index]);
        }
        seams.push({a:`${panel}-1`,b:`${panel}--1`,pairs});
    }
    return {parts,seams,pins};
}

/** Perimeter of an ellipse (Ramanujan), m. */
export function ellipsePerimeter(a: number, b: number): number {
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * Сечение штанины на высоте y.
 *
 * Раньше штанина была кругом с центром, отодвинутым на радиус: на бедре
 * ткань уходила в стороны на 6 см дальше ноги, брюки раздувались
 * галифе. Настоящая штанина висит у ноги, а свобода по бедру уходит вперёд
 * и назад - туда, где у брюк стрелка. Поэтому сечение - эллипс с центром на
 * оси ноги манекена: ширина не больше, чем позволяет промежуток между
 * ногами, глубина подобрана так, чтобы обхват совпал с шириной лекала.
 */
export function trouserLeg(
    legs: { x: number; rings: { y: number; a: number; b: number }[] },
    y: number,
    radius: number,
    legFraction: number,
    minOuter = 0
): { x: number; a: number; b: number } {
    const rings = legs.rings;
    const ring = rings.find((r, k) => k === rings.length - 1 || rings[k + 1].y < y) ?? rings[0];
    const gap = 0.003 + 0.004 * legFraction;
    // Внешний край не уже minOuter: внутренний остаётся у промежутка между
    // ногами, а эллипс расширяется наружу.
    const half = Math.max(Math.min(radius, Math.max(0.02, legs.x - gap)), Math.min(radius * 1.05, (minOuter - gap) / 2));
    const centre = Math.max(legs.x, gap + half);
    const a = half;
    const perimeter = 2 * Math.PI * radius;
    let lo = a, hi = Math.max(a, perimeter / 2);
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (ellipsePerimeter(a, mid) < perimeter) lo = mid; else hi = mid;
    }
    return { x: centre, a, b: Math.max(lo, ring.b + 0.004) };
}

/** Boundary membership comes from topology, never proximity to a sampled curve. */
function boundaryVertices(tris: number[]): Set<number> {
    const edges = new Map<string, {a:number;b:number;count:number}>();
    for (let i=0;i<tris.length;i+=3) for (let j=0;j<3;j++) {
        const a=tris[i+j],b=tris[i+(j+1)%3];
        const key=`${Math.min(a,b)}:${Math.max(a,b)}`;
        const edge=edges.get(key);
        if(edge) edge.count++; else edges.set(key,{a,b,count:1});
    }
    return new Set([...edges.values()].filter(e=>e.count===1).flatMap(e=>[e.a,e.b]));
}
