import type { CatalogItem } from './types';

/**
 * Готовые посадки. Пресет выставляет вариант посадки, возвращает прибавки к
 * значениям основы и, если нужно, задаёт параметры силуэта (длину, клёш).
 * Ручная правка прибавок после пресета не сбрасывает его выбор: панель
 * показывает, что посадка «подогнана вручную».
 */
export interface FitPreset {
	id: string;
	/** Параметры, которые пресет задаёт кроме прибавок. */
	params: Record<string, string | number>;
}

const COMMON: FitPreset[] = [
	{ id: 'slim', params: { fit: 'slim' } },
	{ id: 'regular', params: { fit: 'regular' } },
	{ id: 'loose', params: { fit: 'loose' } },
	{ id: 'oversize', params: { fit: 'oversize' } }
];

/**
 * Длина: классическая посадка, изделие длиннее или короче основы. Брюки
 * «укороченные» - это 7/8, юбка и платье - на ладонь выше или ниже.
 */
const LENGTH: FitPreset[] = [
	{ id: 'lengthened', params: { fit: 'regular', length_delta: 10 } },
	{ id: 'shortened', params: { fit: 'regular', length_delta: -8 } }
];

const BY_MODEL: Record<string, FitPreset[]> = {
	tee: [...COMMON, ...LENGTH, { id: 'cropped', params: { fit: 'oversize', length_delta: -10 } }],
	shirt: [...COMMON, ...LENGTH, { id: 'boyfriend', params: { fit: 'oversize', length_delta: 6 } }],
	skirt: [
		{ id: 'pencil', params: { fit: 'slim', flare_ratio: 0 } },
		{ id: 'straight', params: { fit: 'regular', flare_ratio: 0.05 } },
		{ id: 'aline', params: { fit: 'regular', flare_ratio: 0.2 } },
		{ id: 'flared', params: { fit: 'loose', flare_ratio: 0.4 } },
		{ id: 'lengthened', params: { fit: 'regular', flare_ratio: 0.05, length_delta: 10 } },
		{ id: 'shortened', params: { fit: 'regular', flare_ratio: 0.05, length_delta: -8 } }
	]
};

export function presetsFor(item: CatalogItem): FitPreset[] {
	const list = BY_MODEL[item.id] ?? [...COMMON, ...LENGTH];
	// Пресет имеет смысл, только если у модели есть все его параметры.
	return list.filter((preset) => Object.keys(preset.params).every((key) => key in item.params));
}

/** Параметры-прибавки модели: ease_bust, ease_waist и так далее. */
export function easeKeys(item: CatalogItem): string[] {
	return Object.keys(item.params).filter((key) => key.startsWith('ease_'));
}

/** Ключи силуэта, которые меняет хотя бы один пресет модели (кроме посадки). */
function silhouetteKeys(item: CatalogItem): string[] {
	const keys = new Set<string>();
	for (const preset of presetsFor(item)) {
		for (const key of Object.keys(preset.params)) if (key !== 'fit') keys.add(key);
	}
	return [...keys];
}

/**
 * Полный набор значений, которые выставляет пресет: посадка, прибавки
 * основы и параметры силуэта. Ключи силуэта, которых пресет не задаёт,
 * возвращаются к значениям основы, иначе «Классический» после «Укороченного»
 * остался бы коротким.
 */
export function presetValues(item: CatalogItem, preset: FitPreset): Record<string, string | number> {
	const values: Record<string, string | number> = {};
	for (const key of [...easeKeys(item), ...silhouetteKeys(item)]) {
		values[key] = item.params[key].default;
	}
	return { ...values, ...preset.params };
}

export interface PresetMatch {
	preset: FitPreset | null;
	/** Прибавки отличаются от значений основы. */
	tuned: boolean;
}

/** Какой пресет сейчас выбран и правились ли прибавки вручную. */
export function matchPreset(
	item: CatalogItem,
	params: Record<string, string | number>
): PresetMatch {
	const silhouette = silhouetteKeys(item);
	const preset =
		presetsFor(item).find((candidate) => {
			const expected = presetValues(item, candidate);
			return ['fit', ...silhouette].every((key) => same(params[key], expected[key]));
		}) ?? null;
	const tuned = easeKeys(item).some((key) => !same(params[key], item.params[key].default));
	return { preset, tuned };
}

function same(a: unknown, b: unknown): boolean {
	if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
	return a === b;
}

/** Коэффициент прибавок выбранной посадки или null, если сервер его не сообщил. */
export function easeFactor(item: CatalogItem, fit: string | number | undefined): number | null {
	const option = item.params.fit?.options?.find((o) => o.value === fit);
	return typeof option?.ease_factor === 'number' ? option.ease_factor : null;
}

/** Итоговая прибавка к обхвату изделия, см, или null, если коэффициент неизвестен. */
export function effectiveEase(
	item: CatalogItem,
	params: Record<string, string | number>,
	key: string
): number | null {
	const factor = easeFactor(item, params.fit);
	const base = Number(params[key] ?? item.params[key]?.default);
	if (factor === null || !Number.isFinite(base)) return null;
	return Math.round(base * factor * 10) / 10;
}

/** Итоговые прибавки, которые даст пресет. */
export function presetEase(item: CatalogItem, preset: FitPreset): Record<string, number | null> {
	const values = presetValues(item, preset);
	return Object.fromEntries(easeKeys(item).map((key) => [key, effectiveEase(item, values, key)]));
}
