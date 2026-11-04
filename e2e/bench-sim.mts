import { readFileSync } from 'node:fs';
import { buildGarment } from '../frontend/src/lib/cloth/assembly.ts';
import { buildBodyModel } from '../frontend/src/lib/cloth/body.ts';
import { createSimulation, type ClothPiece } from '../frontend/src/lib/cloth/physics.ts';

const generated = JSON.parse(
	readFileSync('../frontend/src/lib/fixtures/generate-tee.json', 'utf-8')
);
const measurements = {
	bust: 96, waist: 84, hip: 98, height: 176, shoulder_width: 46, shoulder_slope: 13,
	neck_to_waist: 44, waist_to_armpit: 22, biceps: 32, back_length: 72,
	sleeve_length: 62, neck_circumference: 40
};

const model = buildBodyModel(measurements);
const garment = buildGarment(generated.pieces, measurements);
const built: ClothPiece[] = garment.parts.map((part) => ({
	id: part.id,
	verts: part.verts,
	tris: part.tris,
	world: part.world
}));
const seams = garment.seams.map((seam) => ({
	a: seam.a,
	b: seam.b,
	pair: { a: seam.pairs.map((p) => p[0]), b: seam.pairs.map((p) => p[1]) }
}));

const particles = built.reduce((sum, p) => sum + p.verts.length, 0);
const tris = built.reduce((sum, p) => sum + p.tris.length / 3, 0);
console.log(`вершин ${particles}, треугольников ${tris}`);

const sim = await createSimulation(built, seams, garment.pins, model);
for (let i = 0; i < 5; i++) sim.step(1 / 60);
const start = performance.now();
const steps = 60;
for (let i = 0; i < steps; i++) sim.step(1 / 60);
const ms = (performance.now() - start) / steps;
console.log(`шаг физики: ${ms.toFixed(2)} мс  ->  ${(1000 / ms).toFixed(0)} шагов в секунду`);
