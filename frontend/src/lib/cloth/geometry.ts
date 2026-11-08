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

/**
 * Равномерная сетка детали: треугольники близки к правильным, сторона ~h.
 *
 * Ушная триангуляция контура даёт длинные узкие треугольники через всю
 * деталь, и измельчение их узость сохраняет: ткань гнулась по этим рёбрам
 * косыми заломами. Здесь контур размечается с шагом h (углы сохраняются),
 * внутри ставится треугольная решётка того же шага, точки соединяются по
 * Делоне (Боуэр - Уотсон), треугольники вне детали отбрасываются. Обход
 * треугольников - как у earClip.
 */
export function uniformMesh(outline: Vec2[], h: number): { verts: Vec2[]; tris: number[] } {
	const ring = outline.filter((p, i) => i === 0 || dist2(p, outline[i - 1]) > 1e-12);
	if (ring.length > 1 && dist2(ring[0], ring[ring.length - 1]) < 1e-12) ring.pop();
	if (ring.length < 3) return { verts: [], tris: [] };
	const n = ring.length;
	// Контур: углы (поворот больше 12°) остаются, длинные отрезки делятся.
	const corner = ring.map((p, i) => {
		const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n];
		const u = sub2(p, a), v = sub2(b, p);
		const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
		if (lu < 1e-9 || lv < 1e-9) return false;
		const cos = (u.x * v.x + u.y * v.y) / (lu * lv);
		return cos < Math.cos((12 * Math.PI) / 180);
	});
	// Контур: исходные точки выкройки сохраняются (на них сходятся швы
	// соседних деталей - у переда и спинки одинаковая разметка), кроме
	// слишком близких (рёбра короче 0,3 h неустойчивы в солвере); углы
	// остаются всегда; отрезки длиннее h делятся.
	const boundary: Vec2[] = [];
	for (let i = 0; i < n; i++) {
		const a = ring[i];
		const last = boundary[boundary.length - 1];
		if (!last || corner[i] || dist2(last, a) >= (h * 0.3) ** 2) {
			if (last && corner[i] && dist2(last, a) < (h * 0.3) ** 2 && boundary.length > 1) boundary[boundary.length - 1] = a;
			else boundary.push(a);
		}
		const b = ring[(i + 1) % n];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const pieces = Math.floor(length / h);
		for (let k = 1; k <= pieces; k++) {
			const s = k / (pieces + 1);
			boundary.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
		}
	}
	// Замыкание: последняя точка не ближе 0,3 h к первой.
	while (boundary.length > 3 && dist2(boundary[boundary.length - 1], boundary[0]) < (h * 0.3) ** 2) boundary.pop();
	// Внутри: треугольная решётка, не ближе 0,6 h к контуру.
	const inside = (p: Vec2) => {
		let wind = false;
		for (let i = 0, j = n - 1; i < n; j = i++) {
			const a = ring[i], b = ring[j];
			if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) wind = !wind;
		}
		return wind;
	};
	const edgeDistance = (p: Vec2) => {
		let best = Infinity;
		for (let i = 0; i < n; i++) {
			const a = ring[i], b = ring[(i + 1) % n];
			const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
			const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
			best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
		}
		return best;
	};
	const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
	const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
	const rowH = (h * Math.sqrt(3)) / 2;
	const points = [...boundary];
	for (let row = 0, y = minY + rowH / 2; y < maxY; row++, y += rowH) {
		for (let x = minX + (row % 2 ? h / 2 : 0); x < maxX; x += h) {
			const p = { x, y };
			if (inside(p) && edgeDistance(p) > h * 0.6) points.push(p);
		}
	}
	// Делоне: Боуэр - Уотсон с большим охватывающим треугольником.
	const span = Math.max(maxX - minX, maxY - minY) * 20 + 1;
	const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
	const verts = [...points, { x: cx - span, y: cy - span }, { x: cx + span, y: cy - span }, { x: cx, y: cy + span }];
	const superA = points.length, superB = superA + 1, superC = superA + 2;
	type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number };
	const circum = (a: number, b: number, c: number): Tri => {
		const A = verts[a], B = verts[b], C = verts[c];
		const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
		if (Math.abs(d) < 1e-12) return { a, b, c, x: 0, y: 0, r2: Infinity };
		const a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
		const x = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d;
		const y = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d;
		return { a, b, c, x, y, r2: (A.x - x) ** 2 + (A.y - y) ** 2 };
	};
	let tris: Tri[] = [circum(superA, superB, superC)];
	for (let i = 0; i < points.length; i++) {
		const p = verts[i];
		const bad: Tri[] = [], keep: Tri[] = [];
		for (const t of tris) ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r2 - 1e-12 ? bad : keep).push(t);
		const edges = new Map<string, [number, number]>();
		for (const t of bad)
			for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
				const key = u < v ? `${u}:${v}` : `${v}:${u}`;
				if (edges.has(key)) edges.delete(key);
				else edges.set(key, [u, v]);
			}
		for (const [u, v] of edges.values()) keep.push(circum(u, v, i));
		tris = keep;
	}
	// Ориентация - как у earClip: знак площади контура.
	const outer = signedArea(ring) >= 0 ? 1 : -1;
	const out: number[] = [];
	for (const t of tris) {
		if (t.a >= superA || t.b >= superA || t.c >= superA) continue;
		const A = verts[t.a], B = verts[t.b], C = verts[t.c];
		const centre = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
		if (!inside(centre)) continue;
		const area = cross2(sub2(B, A), sub2(C, A));
		if (Math.abs(area) < 1e-9) continue;
		out.push(...(Math.sign(area) === outer ? [t.a, t.b, t.c] : [t.a, t.c, t.b]));
	}
	return { verts: points, tris: out };
}
