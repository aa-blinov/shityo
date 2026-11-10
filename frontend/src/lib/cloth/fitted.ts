/**
 * Облегающее бельё в 3D: трусы и бралетт.
 *
 * Бельё из эластичного трикотажа меньше тела и лежит на нём вплотную:
 * свободно оседающей ткани здесь нечего показывать, а складки тянутся
 * растяжением, которого солвер не знает. Поэтому детали раскладываются
 * прямо по поверхности манекена и закрепляются целиком, как отделка.
 *
 * Раскладка: грубая точка по сечению торса (угол от середины переда,
 * высота от верхнего среза), затем вывод на поверхность поля тела с малым
 * зазором - деталь повторяет рельеф, не проходя сквозь него.
 */
import type { Piece } from '$lib/types';
import { trunkRadius, type BodyModel } from './body';
import { bodyField, fieldDistance, snapTo, type BodyField } from './field';
import { uniformMesh, type Vec2 } from './geometry';
import type { Garment, Part, Pin } from './assembly';

const STEP = 1.5;
const GAP = 0.003;

function outlineCm(piece: Piece): Vec2[] {
	return piece.outline.map((p) => ({ x: p.x / 10, y: p.y / 10 }));
}

function halfWidthAtTop(outline: Vec2[]): number {
	const top = Math.min(...outline.map((p) => p.y));
	const near = outline.filter((p) => p.y <= top + 1.5);
	return Math.max(...near.map((p) => Math.abs(p.x)), 1);
}

function pinned(id: string, verts: Vec2[], tris: number[], world: number[], parts: Part[], pins: Pin[]) {
	parts.push({ id, verts, tris, world });
	for (let i = 0; i < verts.length; i++) pins.push({ piece: id, vertex: i, position: [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]] });
}

function onBody(field: BodyField, x: number, y: number, z: number, gap = GAP): [number, number, number] {
	const p = snapTo(field, { x, y, z }, gap);
	return [p.x, p.y, p.z];
}

/** Точка на сечении торса: угол от середины переда (0 - перед, π - спинка). */
function around(model: BodyModel, y: number, phi: number): { x: number; z: number } {
	const r = trunkRadius(model, Math.max(y, model.crotchY + 0.02), Math.abs(phi));
	return { x: r * Math.sin(phi), z: r * Math.cos(phi) };
}

export function buildBriefs(pieces: Piece[], model: BodyModel): Garment {
	const field = bodyField(model);
	const parts: Part[] = [];
	const pins: Pin[] = [];
	// Средняя посадка: верх на 4 см ниже талии (как в каталоге по умолчанию).
	const top = model.waistY - 0.04;
	const crotch = model.crotchY + 0.006;
	const front = pieces.find((p) => p.id === 'front');
	const back = pieces.find((p) => p.id === 'back');
	const gusset = pieces.find((p) => p.id === 'gusset');
	const frontEdge = { z: 0 };
	const backEdge = { z: 0 };

	for (const [piece, isFront] of [[front, true], [back, false]] as const) {
		if (!piece) continue;
		const outline = outlineCm(piece);
		const mesh = uniformMesh(outline, STEP);
		const half = halfWidthAtTop(outline);
		const minY = Math.min(...outline.map((p) => p.y));
		const drop = (top - crotch) * 100;
		const length = Math.max(...outline.map((p) => p.y)) - minY;
		const surfaceZ = (isFront ? 1 : -1) * trunkRadius(model, crotch + 0.03, isFront ? 0 : Math.PI);
		// Ниже уровня шага деталь уходит под тело к ластовице.
		const under = Math.max(0, length - drop) / 100;
		if (isFront) frontEdge.z = surfaceZ - under;
		else backEdge.z = surfaceZ + under;
		const world = mesh.verts.flatMap((v) => {
			const s = v.y - minY;
			// Боковые швы переда и спинки сходятся на боку: верх детали - четверть круга.
			const phi = (isFront ? 0 : Math.PI) + (isFront ? 1 : -1) * (v.x / half) * (Math.PI / 2);
			if (s <= drop) {
				const y = top - s / 100;
				const p = around(model, y, phi);
				return onBody(field, p.x, y, p.z);
			}
			const along = (s - drop) / 100;
			const z = surfaceZ + (isFront ? -along : along);
			return onBody(field, v.x / 100, crotch, z);
		});
		pinned(piece.id, mesh.verts, mesh.tris, world, parts, pins);
	}

	if (gusset) {
		const outline = outlineCm(gusset);
		const mesh = uniformMesh(outline, 1);
		const length = Math.max(...outline.map((p) => p.y)) || 1;
		const world = mesh.verts.flatMap((v) => {
			const t = v.y / length;
			// Ластовица - под пахом, между концами переда и спинки, чуть ниже.
			return onBody(field, v.x / 100, crotch - 0.002, frontEdge.z + (backEdge.z - frontEdge.z) * t, GAP + 0.001);
		});
		pinned('gusset', mesh.verts, mesh.tris, world, parts, pins);
	}
	return { parts, seams: [], pins };
}

export function buildBralette(pieces: Piece[], model: BodyModel): Garment {
	const field = bodyField(model);
	const parts: Part[] = [];
	const pins: Pin[] = [];
	const lower = pieces.find((p) => p.id === 'cup_lower');
	const upper = pieces.find((p) => p.id === 'cup_upper');
	const band = pieces.find((p) => p.id === 'band');
	const strap = pieces.find((p) => p.id === 'strap');
	const bandHeight = band ? Math.max(...band.outline.map((p) => p.y)) / 1000 : 0.04;
	const lowerHeight = lower ? Math.max(...lower.outline.map((p) => p.y)) / 1000 : 0.06;
	const upperHeight = upper ? -Math.min(...upper.outline.map((p) => p.y)) / 1000 : 0.09;
	const cupTop = lower ? Math.max(...lower.outline.map((p) => p.x)) / 10 : 18;
	// Пояс - под грудью: верх пояса на высоту нижней чашки ниже вершины груди.
	const apexY = model.bustY;
	const bandTop = apexY - lowerHeight * 0.85;
	const bustR = trunkRadius(model, apexY, 0);
	const gore = band?.notches.find((n) => n.label === 'чашка' && n.x > 0)?.x ?? 15;
	const goreCm = gore / 10;

	if (band) {
		const outline = outlineCm(band);
		const mesh = uniformMesh(outline, STEP);
		const half = Math.max(...outline.map((p) => p.x));
		const world = mesh.verts.flatMap((v) => {
			const phi = (v.x / half) * Math.PI;
			const y = bandTop - v.y / 100;
			const p = around(model, y, phi);
			return onBody(field, p.x, y, p.z);
		});
		pinned('band', mesh.verts, mesh.tris, world, parts, pins);
	}

	/** Угол точки чашки: от перемычки к боку по дуге груди. */
	const cupAngle = (side: number, x: number) => side * ((goreCm + x * 0.9) / 100 / bustR);

	for (const side of [1, -1] as const) {
		if (lower) {
			const outline = outlineCm(lower);
			const mesh = uniformMesh(outline, 1);
			const world = mesh.verts.flatMap((v) => {
				const t = Math.max(0, Math.min(1, v.y / (lowerHeight * 100)));
				const y = apexY - t * (apexY - bandTop);
				const p = around(model, y, cupAngle(side, v.x));
				return onBody(field, p.x, y, p.z, GAP + 0.001);
			});
			pinned(`cup_lower-${side}`, mesh.verts, mesh.tris, world, parts, pins);
		}
		if (upper) {
			const outline = outlineCm(upper);
			const mesh = uniformMesh(outline, 1);
			const world = mesh.verts.flatMap((v) => {
				const y = apexY + (-v.y / 100) * 0.85;
				const p = around(model, y, cupAngle(side, v.x));
				return onBody(field, p.x, y, p.z, GAP + 0.001);
			});
			pinned(`cup_upper-${side}`, mesh.verts, mesh.tris, world, parts, pins);
		}
		if (strap && upper) {
			const outline = outlineCm(strap);
			// Узкая полоса на вогнутой спине: мелкая сетка и зазор побольше, иначе
			// середина треугольника уходит в тело между выведенными вершинами.
			const mesh = uniformMesh(outline, 0.6);
			const length = Math.max(...outline.map((p) => p.y)) || 1;
			const strapX = (upper.notches.find((n) => n.label === 'бретель')?.x ?? cupTop * 6.2) / 10;
			const startY = apexY + upperHeight * 0.85;
			const start = around(model, startY, cupAngle(side, strapX));
			const normal = (p: [number, number, number]) => {
				const e = 0.004;
				const d = (dx: number, dy: number, dz: number) => fieldDistance(field, p[0] + dx, p[1] + dy, p[2] + dz);
				const n = [d(e, 0, 0) - d(-e, 0, 0), d(0, e, 0) - d(0, -e, 0), d(0, 0, e) - d(0, 0, -e)];
				const l = Math.hypot(n[0], n[1], n[2]) || 1;
				return n.map((v) => v / l);
			};
			// Опорные точки бретели лежат на теле: чашка, перед плеча, верх плеча
			// (на середине плеча, не у шеи и не у среза манекена), лопатка, пояс на
			// спине. Прямая между чашкой и поясом шла сквозь грудную клетку.
			const sx = side * (model.neckR + Math.max(0.05, (model.shoulderR - model.neckR) * 0.45));
			const knots: [number, number, number][] = [
				onBody(field, start.x, startY, start.z, GAP + 0.003),
				onBody(field, sx, model.shoulderY - 0.02, 0.2, GAP + 0.003),
				onBody(field, sx, model.shoulderY + 0.03, -0.01, GAP + 0.003),
				onBody(field, sx * 1.1, model.shoulderY - 0.06, -0.2, GAP + 0.003),
				(() => {
					const e = around(model, bandTop, side * (Math.PI - 0.35));
					return onBody(field, e.x, bandTop, e.z, GAP + 0.003);
				})()
			];
			const lengths = knots.slice(1).map((k, n) => Math.hypot(k[0] - knots[n][0], k[1] - knots[n][1], k[2] - knots[n][2]));
			const total = lengths.reduce((a, b) => a + b, 0) || 1;
			const centre = (t: number): [number, number, number] => {
				let at = Math.max(0, Math.min(1, t)) * total;
				let n = 0;
				while (n < lengths.length - 1 && at > lengths[n]) at -= lengths[n++];
				const u = lengths[n] ? at / lengths[n] : 0;
				const a = knots[n], b = knots[n + 1];
				const q: [number, number, number] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
				// Точка между опорными может уйти в тело: выводим её наружу по
				// нормали поля и только потом на поверхность.
				const nq = normal(q);
				return onBody(field, q[0] + nq[0] * 0.02, q[1] + nq[1] * 0.02, q[2] + nq[2] * 0.02, GAP + 0.003);
			};
			// Ширина откладывается по касательной к телу поперёк хода бретели:
			// вдоль оси X на боку спины она смотрела в тело, и полоса схлопывалась.
			const world = mesh.verts.flatMap((v) => {
				const t = Math.max(0, Math.min(1, v.y / length));
				const c = centre(t);
				const ahead = centre(Math.min(1, t + 0.02));
				const behind = centre(Math.max(0, t - 0.02));
				const dir = [ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]];
				const n = normal(c);
				let lat = [dir[1] * n[2] - dir[2] * n[1], dir[2] * n[0] - dir[0] * n[2], dir[0] * n[1] - dir[1] * n[0]];
				const ll = Math.hypot(lat[0], lat[1], lat[2]) || 1;
				lat = lat.map((x) => (x / ll) * side);
				const w = v.x / 100;
				return onBody(field, c[0] + lat[0] * w, c[1] + lat[1] * w, c[2] + lat[2] * w, GAP + 0.003);
			});
			pinned(`strap-${side}`, mesh.verts, mesh.tris, world, parts, pins);
		}
	}
	return { parts, seams: [], pins };
}
