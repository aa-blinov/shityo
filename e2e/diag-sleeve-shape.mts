import { readFileSync } from 'node:fs';
import { buildGarment } from '../frontend/src/lib/cloth/assembly.ts';

const generated = JSON.parse(
	readFileSync('../frontend/src/lib/fixtures/generate-tee.json', 'utf-8')
);

const measurements = {
	bust: 96, waist: 84, hip: 98, height: 176, shoulder_width: 46, shoulder_slope: 13,
	neck_to_waist: 44, waist_to_armpit: 22, biceps: 32, back_length: 72,
	sleeve_length: 62, neck_circumference: 40
};

const garment = buildGarment(generated.pieces, measurements);

/** Рисует точки в прямоугольнике вида (u, v) символами. */
function plot(
	title: string,
	points: { u: number; v: number }[],
	uRange: [number, number],
	vRange: [number, number],
	width = 96,
	height = 40
) {
	const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
	const [u0, u1] = uRange;
	const [v0, v1] = vRange;
	for (const p of points) {
		const x = Math.round(((p.u - u0) / (u1 - u0)) * (width - 1));
		const y = Math.round((1 - (p.v - v0) / (v1 - v0)) * (height - 1));
		if (x < 0 || x >= width || y < 0 || y >= height) continue;
		grid[y][x] = '#';
	}
	console.log(`\n=== ${title} ===`);
	for (const row of grid) console.log(row.join(''));
}

for (const id of ['sleeve-right', 'sleeve-left', 'front']) {
	const part = garment.parts.find((p) => p.id === id)!;
	const pts = part.verts.map((_, i) => ({
		u: part.world[i * 3],
		v: part.world[i * 3 + 1]
	}));
	plot(`${id}: вид спереди (X вправо, Y вверх)`, pts, [-0.4, 0.4], [0.7, 1.5]);
	const side = part.verts.map((_, i) => ({
		u: part.world[i * 3 + 2],
		v: part.world[i * 3 + 1]
	}));
	plot(`${id}: вид сбоку (Z, Y)`, side, [-0.25, 0.25], [0.7, 1.5]);
}
