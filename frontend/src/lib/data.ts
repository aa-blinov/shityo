import {
	ApiError,
	type Fetcher,
	generate as apiGenerate,
	getCatalog as apiGetCatalog,
	getSizeGrid as apiGetSizeGrid,
	validate as apiValidate
} from './api';
import type {
	CatalogItem,
	CatalogResponse,
	GenerateResponse,

	SizeGridRow,
	ValidateResponse
} from './types';

import catalogFixture from './fixtures/catalog.json';
import sizesTee from './fixtures/sizes-tee.json';
import sizesLongsleeve from './fixtures/sizes-longsleeve.json';
import sizesShirt from './fixtures/sizes-shirt.json';
import sizesTrousers from './fixtures/sizes-trousers.json';
import sizesSkirt from './fixtures/sizes-skirt.json';
import generateTee from './fixtures/generate-tee.json';
import generateShirt from './fixtures/generate-shirt.json';
import generateTrousers from './fixtures/generate-trousers.json';
import generateSkirt from './fixtures/generate-skirt.json';

/**
 * The backend may be offline while the UI is developed. Every accessor falls
 * back to the JSON fixtures in that case, so the app is always usable.
 */

export type DataSource = 'api' | 'fixture';

export interface Loaded<T> {
	data: T;
	source: DataSource;
}

const GENERATE_FIXTURES: Record<string, GenerateResponse> = {
	tee: generateTee as GenerateResponse,
	shirt: generateShirt as GenerateResponse,
	trousers: generateTrousers as GenerateResponse,
	skirt: generateSkirt as GenerateResponse
};

const SIZE_FIXTURES: Record<string, SizeGridRow[]> = {
	tee: sizesTee as SizeGridRow[],
	longsleeve: sizesLongsleeve as SizeGridRow[],
	shirt: sizesShirt as SizeGridRow[],
	trousers: sizesTrousers as SizeGridRow[],
	skirt: sizesSkirt as SizeGridRow[]
};

/**
 * Default measurement and parameter values of a catalogue entry.
 *
 * A parameter may shadow a measurement of the same name (sleeve_length);
 * the parameter description is then the authoritative control.
 */
export function modelDefaults(item: CatalogItem): {
	measurements: Record<string, number>;
	params: Record<string, string | number>;
} {
	const measurements: Record<string, number> = {};
	for (const key of item.measurements) {
		measurements[key] = item.default_measurements[key] ?? 0;
	}
	const params: Record<string, string | number> = {};
	for (const [key, descriptor] of Object.entries(item.params)) {
		params[key] = descriptor.default;
	}
	for (const key of item.measurements) {
		const descriptor = item.params[key];
		if (descriptor?.type === 'number') measurements[key] = Number(descriptor.default);
	}
	return { measurements, params };
}

export async function loadCatalog(fetcher?: Fetcher): Promise<Loaded<CatalogItem[]>> {
	try {
		const res = await apiGetCatalog(fetcher);
		return { data: res.items, source: 'api' };
	} catch (err) {
		if (err instanceof ApiError) {
			const fixture = catalogFixture as unknown as CatalogResponse;
			return { data: fixture.items, source: 'fixture' };
		}
		throw err;
	}
}

export async function loadSizeGrid(
	model: string,
	gender?: string,
	fetcher?: Fetcher
): Promise<Loaded<SizeGridRow[]>> {
	try {
		const rows = await apiGetSizeGrid(model, gender, fetcher);
		return { data: rows, source: 'api' };
	} catch {
		// Offline fixtures hold every row of the model; the row is per gender.
		const rows = SIZE_FIXTURES[model] ?? [];
		const wanted = gender ?? rows[0]?.gender;
		return { data: rows.filter((row) => !row.gender || row.gender === wanted), source: 'fixture' };
	}
}

/** Offline samples are only used for the unedited initial preview. */
function fixtureGenerate(model: string): GenerateResponse | null {
    const base = GENERATE_FIXTURES[model];
    return base ? structuredClone(base) : null;
}

export async function validatePattern(
	model: string,
	measurements: Record<string, number>,
	params: Record<string, string | number>,
	overrides: Record<string, number> = {}
): Promise<Loaded<ValidateResponse | null>> {
	try {
		const res = await apiValidate({ model, measurements, params, overrides });
		return { data: res, source: 'api' };
	} catch {
		return { data: null, source: 'fixture' };
	}
}

export async function generatePattern(
	model: string,
	measurements: Record<string, number>,
	params: Record<string, string | number>,
	item?: CatalogItem,
	fetcher?: Fetcher,
	overrides: Record<string, number> = {}
): Promise<Loaded<GenerateResponse>> {
	try {
		const res = await apiGenerate({ model, measurements, params, overrides }, fetcher);
		return { data: res, source: 'api' };
	} catch (err) {
		if (!(err instanceof ApiError) || err.status !== 0 || !item) throw err;
		// Offline samples are only suitable for the initial, unedited preview.
		if (Object.keys(overrides).length || (item && (
			Object.entries(measurements).some(([key, value]) => value !== modelDefaults(item).measurements[key]) ||
			Object.entries(params).some(([key, value]) => value !== modelDefaults(item).params[key])
		))) throw err;
		const fallback = fixtureGenerate(model);
		if (!fallback) throw err;
		return { data: fallback, source: 'fixture' };
	}
}
