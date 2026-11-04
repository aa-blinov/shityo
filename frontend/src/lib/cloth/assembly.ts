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
	armholeLoop,
	armSurfaceRadius,
	buildBodyModel,
    torsoPoint,
	shoulderEdgePoint,
	type ArmholeHalf,
	type BodyModel,
	type Vec3
} from './body';
import { earClip, subdivide, type Vec2 } from './geometry';
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
}

/** Сколько точек берём на шов. */
const SEAM_POINTS = 10;

/** Сколько колец у рукава: от проймы к запястью. */
const SLEEVE_ROWS = 6;

/** Зазор между тканью рукава и рукой, м. */
const SLEEVE_GAP = 0.004;

/**
 * Собрать изделие из деталей лекала.
 *
 * `pieces` - детали в координатах API: контур в миллиметрах, швы -
 * подписанные отрезки в тех же миллиметрах.
 */
export function buildGarment(pieces: Piece[], measurements: Record<string, number>): Garment {
	const model = buildBodyModel(measurements);
    if (pieces.some(p => p.id === 'skirt') || !pieces.some(p => p.id === 'sleeve')) {
        return buildLowerGarment(pieces, model);
    }
	const parts: Part[] = [];
	const seams: Seam[] = [];
	const pins: Pin[] = [];

	/** Кэш цепочек швов: ключ - идентификатор ребра. */
	const chains = new Map<string, { index: number; t: number }[]>();

	for (const piece of pieces) {
		if (piece.outline.length < 3) continue;
		if (piece.id === 'sleeve' || piece.id === 'collar') continue; // рукав строится отдельно
		const outline: Vec2[] = piece.outline.map((p) => ({ x: p.x / 10, y: p.y / 10 }));
		const clipped = earClip(outline);
		const mesh = subdivide(clipped.verts, clipped.tris, 2);
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
	for (const side of [1, -1] as const) {
		const loop = armholeLoop(model, side);
		for (const front of [true, false] as const) {
			const panelId = front ? 'front' : 'back';
			const part = parts.find((p) => p.id === panelId);
			const chain = chains.get(`${panelId}:пройма${side > 0 ? '' : ':mirror'}`);
			if (!part || !chain || chain.length === 0) continue;

			const half = front ? loop.front : loop.back;
			const placed = placeOnLoop(part, chain, half);
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
			placeOnCurve(part, chain, loop);
		}

		const frontChain = chains.get(`front:плечо${side > 0 ? '' : ':mirror'}`);
		const backChain = chains.get(`back:плечо${side > 0 ? '' : ':mirror'}`);
		if (!frontChain || !backChain) continue;
		const frontPart = parts.find((p) => p.id === 'front');
		const backPart = parts.find((p) => p.id === 'back');
		if (!frontPart || !backPart) continue;
		seams.push({
			a: 'front',
			b: 'back',
			pairs: pairByDistance(
				frontPart,
				frontChain.map((v) => v.index),
				backPart,
				backChain.map((v) => v.index)
			)
		});
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
                    const point=torsoPoint(model,mirrored ? -Math.PI/2:Math.PI/2,y);
                    part.world[vertex.index*3]=point.x+(mirrored ? -0.005:0.005);
                    part.world[vertex.index*3+1]=point.y;
                    part.world[vertex.index*3+2]=0;
                }
            }
            seams.push({ a: 'front', b: 'back', pairs: pairByDistance(front, a.map(v => v.index), back, b.map(v => v.index)) });
        }
    }

	// Плечи держат ткань: без закрепления деталь висит на одной точке и
	// распахивается.
	for (const id of ['front', 'back']) {
		const part = parts.find((p) => p.id === id);
		if (!part) continue;
		for (const vertex of new Set([...(chains.get(`${id}:плечо`) ?? []), ...(chains.get(`${id}:плечо:mirror`) ?? [])].map(v => v.index))) {
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
            const mesh = earClip(collar.outline.map(p => ({ x: p.x / 10, y: p.y / 10 })));
            const width = Math.max(...mesh.verts.map(v => v.x));
            const world = mesh.verts.flatMap(v => {
                const theta = side * Math.PI * v.x / width;
                const radius = model.neckR + Math.max(0, v.y) / 100 * 0.65 + 0.004;
                return [radius * Math.sin(theta), model.neckY - v.y / 100 * 0.5, radius * Math.cos(theta)];
            });
            const id = `collar-${side}`;
            parts.push({ id, ...mesh, world });
            mesh.verts.forEach((v, i) => { if (v.y <= 0.1) pins.push({ piece: id, vertex: i, position: [world[i*3], world[i*3+1], world[i*3+2]] }); });
        }
    }
    return { parts, seams, pins };
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
	const hemRadius = Math.max(0.03, hemWidth / 100 / (2 * Math.PI));
	const sHem = sleeveLength;

	// Кольца рукава: от проймы к запястью.
	const rings: Vec3[][] = [];
	for (let row = 0; row <= SLEEVE_ROWS; row++) {
		const t = row / SLEEVE_ROWS;
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
			ring.push({
				x: centre.x + frame.out.x * r * c2 + frame.forward.x * r * s2,
				y: centre.y,
				z: frame.origin.z + frame.out.z * r * c2 + frame.forward.z * r * s2
			});
		}
		rings.push(ring);
	}

	// Сетка рукава: вершины и треугольники.
	const verts: Vec2[] = [];
	const world: number[] = [];
	const tris: number[] = [];
	for (let row = 0; row <= SLEEVE_ROWS; row++) {
		for (let c = 0; c < columns; c++) {
			const point = rings[row][c];
			verts.push({ x: c, y: row });
			world.push(point.x, point.y, point.z);
		}
	}
	for (let row = 0; row < SLEEVE_ROWS; row++) {
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
function buildLowerGarment(pieces: Piece[], model: BodyModel): Garment {
    const parts: Part[] = [];
    const pins: Pin[] = [];
    const seams: Seam[] = [];
    const skirt = pieces.some(p => p.id === 'skirt');
    if (!skirt) return buildTrouserPreview(pieces, model);
    const boundaries = new Map<string, number[]>();
    for (const piece of pieces) {
        const outline = piece.outline.map(p => ({x:p.x/10,y:p.y/10}));
        for (const side of [1,-1] as const) {
            const clipped = earClip(outline);
            const mesh = subdivide(clipped.verts, clipped.tris, 2);
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
    const stations=[...new Set([...Array.from({length:33},(_,i)=>height*i/32),...Array.from({length:13},(_,i)=>crotch*(0.6+0.4*i/12)),(model.waistY-model.rings[0].y)*100,crotch])].sort((a,b)=>a-b);
    const rows=stations.length-1,columns=20;
    const parts:Part[]=[],pins:Pin[]=[],seams:Seam[]=[];
    for(const side of [1,-1] as const) for(const isFront of [true,false]) {
        const id=`${isFront?'front':'back'}-${side}`;
        const verts:Vec2[]=[],world:number[]=[],tris:number[]=[];
        for(let row=0;row<=rows;row++) {
            const yCm=stations[row];
            const bounds=outlines.map(outline=>sectionBounds(outline,yCm));
            const girth=(bounds[0][1]-bounds[0][0]+bounds[1][1]-bounds[1][0])/100;
            const radius=girth/(2*Math.PI);
            const blend=Math.min(1,yCm/Math.max(crotch,1));
            const smooth=blend*blend*(3-2*blend);
            for(let column=0;column<=columns;column++) {
                const t=column/columns;
                const angle=(1-t)*Math.PI/2;
                const pelvisX=side*model.rings[1].a*Math.sin(angle);
                const pelvisZ=(isFront?1:-1)*model.rings[1].b*Math.cos(angle);
                const legFraction=Math.max(0,(yCm-crotch)/Math.max(1,height-crotch));
                const legGap=0.003+0.009*legFraction;
                const legX=side*(Math.max(model.rings[0].a*0.42,radius+legGap)+Math.cos(t*Math.PI)*radius);
                const legZ=(isFront?1:-1)*Math.sin(t*Math.PI)*radius;
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
