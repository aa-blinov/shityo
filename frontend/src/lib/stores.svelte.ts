import { getContext, setContext } from 'svelte';
import { generatePattern } from './data';
import type { CatalogItem, GenerateResponse, Issue, SizeGridRow, ValidateResponse } from './types';

export interface ViewToggles {
	seam: boolean;
	grain: boolean;
	notches: boolean;
	internal: boolean;
}

/**
 * State of the pattern workspace.
 *
 * The route loader already ships the defaults of the current model, so the
 * store only keeps what the user changed. Values are stored per model and per
 * name: a name can be both a measurement and a parameter (sleeve_length), and
 * then both panels edit the same number, which is what the API expects.
 */
export class PatternStore {
	edits = $state<Record<string, Record<string, string | number>>>({});
	/**
	 * Переопределения точек чертежа из редактора: модель -> имя точки ->
	 * значение в сантиметрах.
	 *
	 * Это не правки мерок: мерки описывают фигуру, а здесь двигают саму
	 * геометрию лекала (плечевую точку, глубину проймы). Значения уходят на
	 * сервер в параметрах фасона, и чертёж строится по ним.
	 */
	overrides = $state<Record<string, Record<string, number>>>({});
	results = $state<Record<string, GenerateResponse>>({});
	sizeGrids = $state<Record<string, SizeGridRow[]>>({});
	validations = $state<Record<string, ValidateResponse>>({});
	selectedPieceId = $state<string | null>(null);
	loading = $state(false);
	error = $state<Issue | null>(null);
	/** Data source of the last client-side generation; null until then. */
	source = $state<'api' | 'fixture' | null>(null);
	show3d = $state(false);
	toggles = $state<ViewToggles>({ seam: true, grain: true, notches: true, internal: true });

	editsFor(model: string): Record<string, string | number> {
		return this.edits[model] ?? {};
	}

	/**
	 * Measurements of a model: server defaults plus the user's edits.
	 * A name shared with a parameter takes the edited value.
	 */
	measurementsFor(
		model: string,
		keys: string[],
		defaults: Record<string, number>
	): Record<string, number> {
		const edits = this.editsFor(model);
		const out: Record<string, number> = {};
		for (const key of keys) {
			const edited = edits[key];
			out[key] = typeof edited === 'number' ? edited : (defaults[key] ?? 0);
		}
		return out;
	}

	/** Parameters of a model: server defaults plus the user's edits. */
	paramsFor(
		model: string,
		keys: string[],
		defaults: Record<string, string | number>
	): Record<string, string | number> {
		const edits = this.editsFor(model);
		const out: Record<string, string | number> = {};
		for (const key of keys) {
			const edited = edits[key];
			if (typeof edited === 'number' || typeof edited === 'string') out[key] = edited;
			else if (key in defaults) out[key] = defaults[key];
		}
		return out;
	}

	setValue(model: string, key: string, value: string | number): void {
		this.edits = {
			...this.edits,
			[model]: { ...this.editsFor(model), [key]: value }
		};
	}

	/** Переопределения точек чертежа модели. */
	overridesFor(model: string): Record<string, number> {
		return this.overrides[model] ?? {};
	}

	/** Сдвинуть точку чертежа. */
	setOverride(model: string, key: string, value: number): void {
		this.overrides = {
			...this.overrides,
			[model]: { ...this.overridesFor(model), [key]: value }
		};
	}

	/** Вернуть точку чертежа к построенной по меркам. */
	clearOverride(model: string, key: string): void {
		const current = { ...this.overridesFor(model) };
		delete current[key];
		this.overrides = { ...this.overrides, [model]: current };
	}

	/** Apply a row of the size grid to the current measurements. */
	applySizeRow(model: string, row: SizeGridRow): void {
		const edits = { ...this.editsFor(model) };
		for (const [key, value] of Object.entries(row.measurements)) {
			edits[key] = value;
		}
		this.edits = { ...this.edits, [model]: edits };
	}

	private generation = 0;

	cancel(): void { this.generation++; this.loading = false; }

	async regenerate(
		model: string,
		measurements: Record<string, number>,
		params: Record<string, string | number>,
		item: CatalogItem,
		overrides: Record<string, number> = {}
	): Promise<void> {
		const generation = ++this.generation;
		this.loading = true;
		this.error = null;
		try {
			const loaded = await generatePattern(model, measurements, params, item, undefined, overrides);
			if (generation !== this.generation) return;
			this.results = { ...this.results, [model]: loaded.data };
			this.source = loaded.source;
			if (!this.selectedPieceId && loaded.data.pieces.length > 0) {
				this.selectedPieceId = loaded.data.pieces[0].id;
			}
            // /generate already validates the same geometry; keep one report
            // and avoid a second construction request for every edit.
            this.validations = { ...this.validations, [model]: {
                ok: !(loaded.data.errors?.length),
                errors: loaded.data.errors ?? [],
                warnings: loaded.data.warnings
            }};
		} catch (err) {
			if (generation !== this.generation) return;
			const reason = err instanceof Error ? err.message : String(err);
			this.error = {
				code: 'app.request_failed',
				params: { reason },
				text: reason
			};
		} finally {
			if (generation === this.generation) this.loading = false;
		}
	}

	selectPiece(id: string | null): void {
		this.selectedPieceId = id;
	}
}

const CONTEXT_KEY = 'shityo.pattern-store';

/** Provide a store to the components of the current page. */
export function providePatternStore(store: PatternStore): PatternStore {
	setContext(CONTEXT_KEY, store);
	return store;
}

/** Read the store provided by the page that hosts the component. */
export function usePatternStore(): PatternStore {
	const store = getContext<PatternStore>(CONTEXT_KEY);
	if (!store) throw new Error('Pattern store is missing in the component tree');
	return store;
}
