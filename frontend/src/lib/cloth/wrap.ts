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
	side: 1 | -1
): WrappedPiece {
	const world: number[] = [];
	const xs = verts.map((v) => v.x);
	const ys = verts.map((v) => v.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
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
