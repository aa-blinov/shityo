/**
 * Внешний вид ткани в 3D-превью: цвет, фактура и принт.
 *
 * Модуль без three.js: здесь только данные и расчёт пикселей, чтобы их
 * можно было проверить в Node. Текстуры собирает studio.ts.
 *
 * Развёртка ткани идёт по плоскому лекалу, в сантиметрах: полоска и клетка
 * ложатся в реальном масштабе и вдоль долевой нити, как при раскрое, а не
 * проецируются на фигуру спереди.
 */
import type { Fabric } from './fabrics';

export type FinishId = 'plain' | 'twill' | 'jersey' | 'stripe' | 'check';

export interface Finish {
	id: FinishId;
	/** принт поверх цвета (полоска, клетка) или только рельеф переплетения */
	print: boolean;
	/** период рисунка на ткани, см: для рельефа - раппорт переплетения */
	periodCm: number;
	/** рельеф переплетения под принтом */
	relief: 'plain' | 'twill' | 'jersey';
}

export const FINISHES: Finish[] = [
	{ id: 'plain', print: false, periodCm: 1.6, relief: 'plain' },
	{ id: 'twill', print: false, periodCm: 1.6, relief: 'twill' },
	{ id: 'jersey', print: false, periodCm: 1.2, relief: 'jersey' },
	{ id: 'stripe', print: true, periodCm: 2.5, relief: 'plain' },
	{ id: 'check', print: true, periodCm: 8, relief: 'twill' }
];

export function finishById(id: string | null | undefined): Finish | undefined {
	return FINISHES.find((f) => f.id === id);
}

/** Фактура по классу полотна: трикотаж - гладь, тканая - полотно, костюмная - саржа. */
export function defaultFinish(fabric: Fabric['id']): FinishId {
	return fabric === 'knit' ? 'jersey' : fabric === 'heavy' ? 'twill' : 'plain';
}

/** Цвета ткани: спокойные, ходовые для пошива на заказ. */
export const COLOURS: { id: string; hex: string }[] = [
	{ id: 'graphite', hex: '#414b52' },
	{ id: 'black', hex: '#24272a' },
	{ id: 'navy', hex: '#2c3a55' },
	{ id: 'denim', hex: '#4a6382' },
	{ id: 'teal', hex: '#617c7d' },
	{ id: 'olive', hex: '#5d6448' },
	{ id: 'camel', hex: '#b08a5f' },
	{ id: 'terracotta', hex: '#a4573f' },
	{ id: 'burgundy', hex: '#6e2f36' },
	{ id: 'ecru', hex: '#e3dccb' }
];

/** Цвет по умолчанию: тот, что превью показывало до выбора. */
export function defaultColour(model: string | undefined, hasCollar: boolean, hasSleeve: boolean): string {
	if (hasCollar) return '#d1c4ad';
	if (hasSleeve) return '#617c7d';
	if (model === 'skirt') return '#927b69';
	return '#414b52';
}

export function isHex(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Рельеф переплетения: карта высот size x size (0..255).
 *
 * Полотняное - нити поочерёдно сверху и снизу, шахматкой. Саржа - косой
 * рубчик. Трикотажная гладь - столбики петель «ёлочкой».
 */
export function finishHeights(id: FinishId, size = 128): Uint8Array {
	const relief = finishById(id)?.relief ?? 'plain';
	const data = new Uint8Array(size * size);
	const cell = Math.max(2, size / 16);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			let v: number;
			if (relief === 'twill') {
				v = 0.5 + 0.5 * Math.sin(((x + y) / cell) * Math.PI);
			} else if (relief === 'jersey') {
				const w = cell * 2;
				const xl = (x % w) / w;
				const d = Math.abs(xl - 0.5) * 2;
				v = 0.5 + 0.5 * Math.cos((y / w + d * 0.5) * Math.PI * 2) * (1 - d * 0.6);
			} else {
				const across = Math.sin((x * Math.PI) / cell);
				const down = Math.sin((y * Math.PI) / cell);
				const over = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
				v = 0.5 + ((over ? across : down) * 0.55 + (over ? down : across) * 0.15) * 0.5;
			}
			data[y * size + x] = Math.max(0, Math.min(255, Math.round(60 + v * 190)));
		}
	return data;
}

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Светлая нить принта: на тёмной ткани - сливочная, на светлой - тёмная. */
function accentThread(base: [number, number, number]): [number, number, number] {
	const light = (base[0] * 0.3 + base[1] * 0.59 + base[2] * 0.11) / 255;
	return light > 0.6 ? [70, 66, 60] : [236, 228, 212];
}

/**
 * Раппорт принта в цвете ткани: RGBA size x size, sRGB.
 *
 * Полоска идёт вдоль долевой (ось y лекала), клетка - в обе стороны.
 */
export function printColours(id: FinishId, hex: string, size = 64): Uint8Array {
	const base = rgb(isHex(hex) ? hex : '#414b52');
	const thread = accentThread(base);
	const data = new Uint8Array(size * size * 4);
	const band = size / 4;
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			let mix = 0;
			if (id === 'stripe') mix = x < band ? 0.75 : 0;
			else if (id === 'check') {
				const across = x < band ? 1 : 0;
				const down = y < band ? 1 : 0;
				mix = (across + down) * 0.3;
				if (x === Math.floor(size * 0.62) || y === Math.floor(size * 0.62)) mix = 0.85;
			}
			const i = (y * size + x) * 4;
			for (let k = 0; k < 3; k++) data[i + k] = Math.round(base[k] * (1 - mix) + thread[k] * mix);
			data[i + 3] = 255;
		}
	return data;
}

/**
 * Развёртка поверхности по плоскому лекалу, см.
 *
 * Первые вершины поверхности - вершины детали; остальные - середины рёбер
 * при измельчении сетки (`parents`), каждая ссылается на две предыдущие.
 */
export function surfaceUVs(flat: { x: number; y: number }[], parents: [number, number][]): Float32Array {
	const uv = new Float32Array((flat.length + parents.length) * 2);
	flat.forEach((p, i) => {
		uv[i * 2] = p.x;
		uv[i * 2 + 1] = p.y;
	});
	parents.forEach(([a, b], i) => {
		const k = flat.length + i;
		uv[k * 2] = (uv[a * 2] + uv[b * 2]) / 2;
		uv[k * 2 + 1] = (uv[a * 2 + 1] + uv[b * 2 + 1]) / 2;
	});
	return uv;
}
