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

// Цепочки швов: сколько вершин и с каким параметром.
const part = garment.parts.find((p) => p.id === 'front')!;
const chain = part.verts.length;

console.log('деталей:', garment.parts.map((p) => p.id).join(', '));
console.log('швов:', garment.seams.length, 'закреплений:', garment.pins.length, 'вершин front:', chain);

for (const part of garment.parts) {
	const xs = part.world.filter((_, i) => i % 3 === 0);
	const ys = part.world.filter((_, i) => i % 3 === 1);
	const zs = part.world.filter((_, i) => i % 3 === 2);
	console.log(
		`${part.id}: вершин ${part.verts.length}`,
		`X ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)}`,
		`Y ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}`,
		`Z ${Math.min(...zs).toFixed(3)}..${Math.max(...zs).toFixed(3)}`
	);
}

	for (const seam of garment.seams) {
		const a = garment.parts.find((p) => p.id === seam.a)!;
		const b = garment.parts.find((p) => p.id === seam.b)!;
		const dists = seam.pairs.map(([ia, ib]) =>
		Math.hypot(
			a.world[ia * 3] - b.world[ib * 3],
			a.world[ia * 3 + 1] - b.world[ib * 3 + 1],
			a.world[ia * 3 + 2] - b.world[ib * 3 + 2]
		)
		);
		const max = dists.length ? Math.max(...dists) : 0;
		const avg = dists.length ? dists.reduce((s, d) => s + d, 0) / dists.length : 0;
		console.log(
			`шов ${seam.a} -> ${seam.b}: пар ${seam.pairs.length}, среднее ${(avg * 1000).toFixed(1)} мм, максимум ${(max * 1000).toFixed(1)} мм`
		);
		if (max > 0.06) {
			seam.pairs.forEach(([ia, ib], i) => {
				console.log(
					`  пара ${i}: ${(dists[i] * 1000).toFixed(1)} мм`,
					`a=(${a.world[ia * 3].toFixed(3)},${a.world[ia * 3 + 1].toFixed(3)},${a.world[ia * 3 + 2].toFixed(3)})`,
					`b=(${b.world[ib * 3].toFixed(3)},${b.world[ib * 3 + 1].toFixed(3)},${b.world[ib * 3 + 2].toFixed(3)})`
				);
			});
		}
	}
