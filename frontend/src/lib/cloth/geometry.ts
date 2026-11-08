import { ShapeUtils, Vector2 } from 'three';
/**
 * Плоская геометрия деталей: триангуляция, разрезание контура на цепи,
 * сопоставление швов по геометрии.
 *
 * Все координаты - в миллиметрах, в системе координат лекала (y вниз).
 */

export interface Vec2 {
	x: number;
	y: number;
}

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Edge {
	/** индексы вершин в общем массиве */
	a: number;
	b: number;
}

export function dist2(a: Vec2, b: Vec2): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

export function cross2(a: Vec2, b: Vec2): number {
	return a.x * b.y - a.y * b.x;
}

export function signedArea(pts: Vec2[]): number {
	let s = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		s += a.x * b.y - b.x * a.y;
	}
	return s / 2;
}

/** Точка внутри треугольника (с допуском на границе). */
function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
	const d1 = cross2(sub2(p, a), sub2(b, a));
	const d2 = cross2(sub2(p, b), sub2(c, b));
	const d3 = cross2(sub2(p, c), sub2(a, c));
	const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
	const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
	return !(neg && pos);
}

/**
 * Триангуляция выпуклой/невыпуклой простой многоугольности методом отсечения
 * ушей. Возвращает вершины (с weld-ом) и треугольники.
 */
export function earClip(points: Vec2[]): { verts: Vec2[]; tris: number[] } {
    const verts = points.filter((point, i) => i === 0 || dist2(point, points[i - 1]) > 1e-12);
    if (verts.length > 1 && dist2(verts[0], verts[verts.length - 1]) < 1e-12) verts.pop();
    if (verts.length < 3) return { verts: [], tris: [] };
    const triangles = ShapeUtils.triangulateShape(verts.map(p => new Vector2(p.x, p.y)), []);
    return { verts, tris: triangles.flat() };
}

/** Разбиение треугольников на более мелкие (midpoint subdivision). */
export function subdivide(
	verts: Vec2[],
	tris: number[],
	levels: number
): { verts: Vec2[]; tris: number[] } {
	let v = verts;
	let t = tris;
	for (let l = 0; l < levels; l++) {
		const mid = new Map<string, number>();
		const nv: Vec2[] = v.slice();
		const nt: number[] = [];
		const midpoint = (a: number, b: number): number => {
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			let m = mid.get(key);
			if (m === undefined) {
				m = nv.length;
				nv.push({ x: (v[a].x + v[b].x) / 2, y: (v[a].y + v[b].y) / 2 });
				mid.set(key, m);
			}
			return m;
		};
		for (let i = 0; i < t.length; i += 3) {
			const a = t[i];
			const b = t[i + 1];
			const c = t[i + 2];
			const ab = midpoint(a, b);
			const bc = midpoint(b, c);
			const ca = midpoint(c, a);
			nt.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
		}
		v = nv;
		t = nt;
	}
	return { verts: v, tris: t };
}

/**
 * Индексы "углов" контура: точки, где направление обхода меняется резко.
 * По ним контур режется на цепи - кандидаты в швы.
 */
export function cornerIndices(pts: Vec2[], thresholdDeg = 22): number[] {
	const n = pts.length;
	const corners: number[] = [];
	for (let i = 0; i < n; i++) {
		const p = pts[(i - 1 + n) % n];
		const c = pts[i];
		const q = pts[(i + 1) % n];
		const a = sub2(c, p);
		const b = sub2(q, c);
		const la = Math.hypot(a.x, a.y);
		const lb = Math.hypot(b.x, b.y);
		if (la < 1e-9 || lb < 1e-9) continue;
		const cos = (a.x * b.x + a.y * b.y) / (la * lb);
		const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
		if (ang >= thresholdDeg) corners.push(i);
	}
	return corners;
}

export interface Chain {
	/** индекс первой вершины цепи в контуре */
	from: number;
	/** индекс последней вершины цепи (включительно) */
	to: number;
	/** вершины цепи по порядку обхода контура */
	indices: number[];
	/** длина цепи в мм */
	length: number;
}

/**
 * Цепи контура: между соседними углами. Контур замкнут, поэтому цепь может
 * переходить через индекс 0.
 */
export function extractChains(pts: Vec2[], corners: number[]): Chain[] {
	const n = pts.length;
	if (corners.length === 0) {
		const indices: number[] = [];
		for (let i = 0; i < n; i++) indices.push(i);
		return [{ from: 0, to: n - 1, indices, length: polylineLength(pts, indices) }];
	}
	const chains: Chain[] = [];
	for (let c = 0; c < corners.length; c++) {
		const from = corners[c];
		const to = corners[(c + 1) % corners.length];
		const indices: number[] = [];
		let i = from;
		while (true) {
			indices.push(i);
			if (i === to) break;
			i = (i + 1) % n;
			if (indices.length > n) break;
		}
		chains.push({ from, to, indices, length: polylineLength(pts, indices) });
	}
	return chains;
}

export function polylineLength(pts: Vec2[], indices: number[]): number {
	let s = 0;
	for (let i = 1; i < indices.length; i++) s += Math.hypot(pts[indices[i]].x - pts[indices[i - 1]].x, pts[indices[i]].y - pts[indices[i - 1]].y);
	return s;
}

/** Точка на цепи по параметру длины дуги (0..1). */
export function chainPoint(pts: Vec2[], indices: number[], t: number): Vec2 {
	const total = polylineLength(pts, indices);
	let target = Math.max(0, Math.min(1, t)) * total;
	for (let i = 1; i < indices.length; i++) {
		const a = pts[indices[i - 1]];
		const b = pts[indices[i]];
		const d = Math.hypot(b.x - a.x, b.y - a.y);
		if (target <= d || i === indices.length - 1) {
			const f = d > 1e-9 ? target / d : 0;
			return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
		}
		target -= d;
	}
	return { ...pts[indices[0]] };
}

/** Пере采样 цепи: n точек, равномерно по длине дуги. */
export function resampleChain(pts: Vec2[], indices: number[], n: number): Vec2[] {
	const out: Vec2[] = [];
	for (let i = 0; i < n; i++) out.push(chainPoint(pts, indices, i / (n - 1)));
	return out;
}

/** Ближайшая точка контура к заданной (в мм). */
export function closestOnContour(pts: Vec2[], p: Vec2): { point: Vec2; index: number; distance: number } {
	let best = { point: pts[0], index: 0, distance: Infinity };
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		const ab = sub2(b, a);
		const l2 = ab.x * ab.x + ab.y * ab.y;
		let t = 0;
		if (l2 > 1e-9) t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2;
		t = Math.max(0, Math.min(1, t));
		const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
		const d = Math.hypot(q.x - p.x, q.y - p.y);
		if (d < best.distance) best = { point: q, index: i, distance: d };
	}
	return best;
}

/**
 * Дробить длинные рёбра пополам, пока все не станут короче maxLen.
 *
 * Разбиение контура даёт длинные узкие треугольники вдоль боков; на теле
 * диагональ такого треугольника ложится косой складкой. Делится самое
 * длинное ребро вместе с обоими соседними треугольниками, поэтому сетка
 * остаётся связной, а новые узлы на контуре лежат на его отрезках.
 */
export function refineLongEdges(
	verts: Vec2[],
	tris: number[],
	maxLen: number,
	maxVerts = 3000
): { verts: Vec2[]; tris: number[] } {
	const v = verts.slice();
	let t = tris.slice();
	const len = (a: number, b: number) => Math.hypot(v[a].x - v[b].x, v[a].y - v[b].y);
	while (v.length < maxVerts) {
		let best = -1;
		let bestA = 0;
		let bestB = 0;
		for (let i = 0; i < t.length; i += 3) {
			for (let k = 0; k < 3; k++) {
				const a = t[i + k];
				const b = t[i + ((k + 1) % 3)];
				const l = len(a, b);
				if (l > maxLen && l > best) {
					best = l;
					bestA = a;
					bestB = b;
				}
			}
		}
		if (best < 0) break;
		const m = v.length;
		v.push({ x: (v[bestA].x + v[bestB].x) / 2, y: (v[bestA].y + v[bestB].y) / 2 });
		const next: number[] = [];
		for (let i = 0; i < t.length; i += 3) {
			const tri = [t[i], t[i + 1], t[i + 2]];
			if (tri.includes(bestA) && tri.includes(bestB)) {
				next.push(...tri.map((x) => (x === bestB ? m : x)), ...tri.map((x) => (x === bestA ? m : x)));
			} else next.push(...tri);
		}
		t = next;
	}
	return { verts: v, tris: t };
}
