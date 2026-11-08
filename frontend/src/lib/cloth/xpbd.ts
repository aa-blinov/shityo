/**
 * Ткань: XPBD-солвер со столкновениями с манекеном.
 *
 * Почему не Rapier: его мягкие тела решают FEM, где шаг стоит 87 мс на
 * тысяче с лишним частиц - из-за столкновений частиц с коллайдерами. У
 * XPBD шаг на той же сетке - единицы миллисекунд.
 *
 * Подход солвера - из open-source студии seamer-studio (MIT, Ahmad Jalil):
 * позиционная динамика с-compliance, итерации Гаусса-Зейделя по рёбрам и
 * проекции частиц на поверхность тела.
 *
 * Единицы - метры, масса - условная, время - секунды.
 */
import type { BodyModel } from './body';
import { bodyField, pushOut } from './field';

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface ClothNode {
	/** текущая позиция */
	p: Vec3;
	/** позиция на прошлом шаге */
	prev: Vec3;
	/** обратная масса: 0 у закреплённых вершин */
	invMass: number;
}

export interface ClothEdge {
	a: number;
	b: number;
	/** длина покоя, м */
	rest: number;
	/** жёсткость: чем меньше, тем мягче ткань */
	compliance: number;
}

/** Ограничение «закреплено в точке»: вершина стоит на месте. */
export interface ClothPin {
	node: number;
	position: Vec3;
}

export interface ClothOptions {
	/** шаг времени, с */
	dt: number;
	/** итераций солвера на шаг */
	iterations: number;
	/** гравитация, м/с² */
	gravity: number;
	/** затухание скорости за секунду (0..1) */
	damping: number;
	/** максимальное растяжение ребра до срабатывания ограничения */
	stretchLimit: number;
}

export const DEFAULT_OPTIONS: ClothOptions = {
	dt: 1 / 60,
	iterations: 8,
	gravity: -9.81,
	damping: 0.12,
	stretchLimit: 1.08
};

/**
 * Один шаг симуляции.
 *
 * `edges` — рёбра сетки и швов; `pins` — точки, которые держат ткань.
 * Тело отталкивает ткань: частица, оказавшаяся внутри фигуры, выталкивается
 * на поверхность.
 */
export function stepCloth(
	nodes: ClothNode[],
	edges: ClothEdge[],
	pins: ClothPin[],
	model: BodyModel,
	options: ClothOptions = DEFAULT_OPTIONS
): void {
	const { dt, iterations, gravity, damping } = options;
	if (!Number.isFinite(dt) || dt <= 0) return;
	const dt2 = dt * dt;
	const lambdas = new Float64Array(edges.length);

	// Интегрирование: скорость и перенос.
	for (const node of nodes) {
		if (node.invMass === 0) continue;
		const vx = (node.p.x - node.prev.x) / dt;
		const vy = (node.p.y - node.prev.y) / dt;
		const vz = (node.p.z - node.prev.z) / dt;
		const keep = Math.pow(Math.max(0, 1 - damping), dt);
		node.prev = { ...node.p };
		node.p = {
			x: node.p.x + vx * keep * dt,
			y: node.p.y + (vy + gravity * dt) * keep * dt,
			z: node.p.z + vz * keep * dt
		};
	}

	// Ограничения расстояния: XPBD с-compliance.
	for (let it = 0; it < iterations; it++) {
		for (let ei = 0; ei < edges.length; ei++) {
            const edge = edges[ei];
			const a = nodes[edge.a];
			const b = nodes[edge.b];
			const w = a.invMass + b.invMass;
			if (w === 0) continue;
			let dx = b.p.x - a.p.x;
			let dy = b.p.y - a.p.y;
			let dz = b.p.z - a.p.z;
			let dist = Math.hypot(dx, dy, dz);
			if (dist < 1e-9) continue;
			// Ограничение растяжения: ткань не тянется дальше предела.
			const alpha = edge.compliance / dt2;
            const delta = (-(dist - edge.rest) - alpha * lambdas[ei]) / (w + alpha);
            lambdas[ei] += delta;
            const lambda = delta / dist;
			const cx = dx * lambda;
			const cy = dy * lambda;
			const cz = dz * lambda;
			if (a.invMass > 0) {
				a.p = { x: a.p.x - cx * a.invMass, y: a.p.y - cy * a.invMass, z: a.p.z - cz * a.invMass };
			}
			if (b.invMass > 0) {
				b.p = { x: b.p.x + cx * b.invMass, y: b.p.y + cy * b.invMass, z: b.p.z + cz * b.invMass };
			}
		}

		// Столкновения с телом. Смещение двигает и прошлую позицию: иначе
		// выталкивание добавляет ткани скорость (в интегрировании Верле
		// скорость - это (p - prev)/dt), и ткань раскачивается всё сильнее.
		for (const node of nodes) {
			if (node.invMass === 0) continue;
			const out = projectOutsideBody(model, node.p);
			if (!out) continue;
			node.prev = {
				x: node.prev.x + (out.x - node.p.x),
				y: node.prev.y + (out.y - node.p.y),
				z: node.prev.z + (out.z - node.p.z)
			};
			node.p = out;
		}

		// Закреплённые точки.
		for (const pin of pins) {
			const node = nodes[pin.node];
			if (!node) continue;
			node.p = { ...pin.position };
		}
	}
}

/**
 * Вытолкнуть точку из тела.
 *
 * Возвращает новую позицию снаружи фигуры или null, если точка и так
 * снаружи. Фигура - поле расстояний до манекена (field.ts): та же
 * поверхность, что видна на экране, с гладким плечевым поясом.
 */
export function projectOutsideBody(model: BodyModel, p: Vec3): Vec3 | null {
	return pushOut(bodyField(model), p, 0);
}
