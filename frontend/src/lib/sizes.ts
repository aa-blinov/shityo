import type { SizeGridRow } from './types';

/** Обхваты, по которым подбирается размер: грудь для плечевых, бёдра для поясных. */
const KEYS = ['bust', 'half_bust', 'hip', 'half_hip', 'waist'] as const;

/** Рост строки: из поля ряда или из мерок. */
export function rowHeight(row: SizeGridRow): number {
	return row.height ?? row.measurements.height ?? 0;
}

/** Ростовые группы ряда по возрастанию. */
export function heightsOf(rows: SizeGridRow[]): number[] {
	return [...new Set(rows.map(rowHeight))].filter((h) => h > 0).sort((a, b) => a - b);
}

/** Строки ряда для роста, ближайшего к заданному. */
export function rowsForHeight(rows: SizeGridRow[], height: number | undefined): SizeGridRow[] {
	const heights = heightsOf(rows);
	if (heights.length <= 1) return rows;
	const wanted =
		height === undefined
			? heights[Math.floor(heights.length / 2)]
			: heights.reduce((best, h) => (Math.abs(h - height) < Math.abs(best - height) ? h : best));
	return rows.filter((row) => rowHeight(row) === wanted);
}

/**
 * Размер ряда, ближайший к текущим меркам.
 *
 * Сначала выбирается ростовая группа, ближайшая к росту, потом размер по
 * первому обхвату, который есть и в ряду, и в мерках: размер по ГОСТ
 * определяется обхватом груди (у поясных изделий - бёдрами).
 */
export function nearestSize(
	rows: SizeGridRow[],
	measurements: Record<string, number>
): SizeGridRow | null {
	const pool = rowsForHeight(rows, measurements.height);
	if (!pool.length) return null;
	const key = KEYS.find((k) => k in pool[0].measurements && Number.isFinite(measurements[k]));
	if (!key) return pool[Math.floor(pool.length / 2)];
	return pool.reduce((best, row) =>
		Math.abs(row.measurements[key] - measurements[key]) <
		Math.abs(best.measurements[key] - measurements[key])
			? row
			: best
	);
}
