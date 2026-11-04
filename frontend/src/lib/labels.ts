import catalog from './fixtures/catalog.json';
/**
 * Диапазоны ввода для мерок и ключи перевода для названий.
 *
 * Каталог решает, какие идентификаторы мерок существуют; здесь только
 * границы ввода. Названия берутся из словаря i18n по ключу `measure.<id>`,
 * `param.<id>`, `piece.<id>`, `category.<id>`, `gender.<id>`.
 */

export interface MeasurementRange {
	min: number;
	max: number;
	step: number;
}

/** Границы полей ввода мерок, в сантиметрах. */
export const MEASUREMENT_RANGES: Record<string, MeasurementRange> = catalog.measurement_ranges;

export function measurementRange(key: string): MeasurementRange {
	return MEASUREMENT_RANGES[key] ?? { min: 0, max: 250, step: 1 };
}
