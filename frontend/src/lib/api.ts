import type { PaperOptions, PrintPlan } from './types';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type {
	CatalogResponse,
	ExportFormat,
	GenerateRequest,
	GenerateResponse,
	HealthResponse,

	SizeGridRow,
	ValidateResponse
} from './types';

/**
 * Base URL of the backend API.
 *
 * In the browser the request stays relative: the Vite dev/preview proxy and
 * the production server both forward `/api` to the backend, so the app is
 * always same-origin and CORS never applies.
 *
 * During SSR a relative URL would be resolved inside the app itself, so the
 * server talks to the backend directly. `PUBLIC_API_BASE` overrides the
 * address in every environment; it is read at runtime, not baked into the
 * bundle.
 */
export function apiBase(): string {
	const configured = env.PUBLIC_API_BASE;
	if (configured) return configured;
	if (browser) return '/api';
	return `${(process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000').replace(/\/$/, '')}/api`;
}

/**
 * Fetcher used for the requests.
 *
 * The global `fetch` is used on purpose: SvelteKit's injected `load` fetch
 * resolves relative URLs inside the app, which is not what an API client
 * needs. Every environment routes `/api` to the backend anyway - the Vite
 * dev/preview proxies and the production server do the proxying.
 */
export type Fetcher = typeof fetch;

export class ApiError extends Error {
	readonly status: number;
	readonly details: string[];

	constructor(status: number, message: string, details: string[] = []) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.details = details;
	}
}

interface ErrorBody {
	detail?: unknown;
}

function normaliseDetails(body: unknown): string[] {
	if (!body || typeof body !== 'object') return [];
	const detail = (body as ErrorBody).detail;
	if (typeof detail === 'string') return [detail];
	if (Array.isArray(detail)) {
		return detail.map((item) => {
			if (typeof item === 'string') return item;
			if (item && typeof item === 'object') {
				const record = item as Record<string, unknown>;
				const msg = record.msg ?? record.message;
				const loc = Array.isArray(record.loc) ? record.loc.join('.') : undefined;
				return loc
					? `${loc}: ${String(msg ?? JSON.stringify(item))}`
					: String(msg ?? JSON.stringify(item));
			}
			return String(item);
		});
	}
	return [];
}

async function request<T>(
	path: string,
	init?: RequestInit,
	fetcher: Fetcher = fetch
): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(`${apiBase()}${path}`, {
			...init,
			headers: {
				Accept: 'application/json',
				...(init?.body ? { 'Content-Type': 'application/json' } : {}),
				...(init?.headers ?? {})
			}
		});
	} catch (cause) {
		throw new ApiError(0, `Сеть недоступна: ${(cause as Error).message}`);
	}

	if (!response.ok) {
		let body: unknown = null;
		try {
			body = await response.json();
		} catch {
			body = null;
		}
		const details = normaliseDetails(body);
		throw new ApiError(
			response.status,
			details.length > 0 ? details.join('; ') : `Ошибка ${response.status}`,
			details
		);
	}

	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export function getHealth(fetcher?: Fetcher): Promise<HealthResponse> {
	return request<HealthResponse>('/health', undefined, fetcher);
}

export function getCatalog(fetcher?: Fetcher): Promise<CatalogResponse> {
	return request<CatalogResponse>('/catalog', undefined, fetcher);
}

export function generate(req: GenerateRequest, fetcher?: Fetcher): Promise<GenerateResponse> {
	return request<GenerateResponse>(
		'/generate',
		{ method: 'POST', body: JSON.stringify(req) },
		fetcher
	);
}

export function validate(req: GenerateRequest, fetcher?: Fetcher): Promise<ValidateResponse> {
	return request<ValidateResponse>(
		'/validate',
		{ method: 'POST', body: JSON.stringify(req) },
		fetcher
	);
}

export function getSizeGrid(model: string, fetcher?: Fetcher): Promise<SizeGridRow[]> {
	return request<SizeGridRow[]>(
		`/validate/sizes?model=${encodeURIComponent(model)}`,
		undefined,
		fetcher
	);
}

/** Query payload for the export endpoints: URL-encoded JSON. */
export function exportQuery(
	measurements: Record<string, number>,
	params: Record<string, string | number>,
	overrides: Record<string, number> = {}
): string {
	const m = encodeURIComponent(JSON.stringify(measurements));
	const p = encodeURIComponent(JSON.stringify({ ...params, overrides }));
	return `measurements=${m}&params=${p}`;
}

/**
 * Download URL for an export format. Uses the same base as the API client so
 * the link works in dev, in preview and in the production server.
 */
export function exportUrl(
	model: string,
	format: ExportFormat,
	measurements: Record<string, number>,
	params: Record<string, string | number>,
	overrides: Record<string, number> = {},
    paper?: PaperOptions
): string {
    const settings=paper && format!=='dxf' ? `&${new URLSearchParams({page:paper.page,orientation:paper.orientation,...(format==='pdf'?{calibration:String(paper.calibration)}:{})})}`:'';
	return `${apiBase()}/export/${encodeURIComponent(model)}.${format}?${exportQuery(measurements, params, overrides)}${settings}`;
}


export function getPrintPlan(req:GenerateRequest,paper:PaperOptions):Promise<PrintPlan> {
 return request<PrintPlan>('/print-plan',{method:'POST',body:JSON.stringify({...req,paper})});
}

/** Пользовательские детали: payload уже в миллиметрах. */
export interface CustomPayload {
	pieces: {
		id: string;
		name: string;
		outline: { x: number; y: number }[];
		cut: number;
		seam_allowance_mm: number;
		mirrored: boolean;
		notches: { x: number; y: number; label: string }[];
		grainline: { x1: number; y1: number; x2: number; y2: number } | null;
		internal_lines: { type: string; points: { x: number; y: number }[] }[];
	}[];
}

export function customGenerate(payload: CustomPayload): Promise<GenerateResponse> {
	return request<GenerateResponse>('/custom/generate', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export function customPrintPlan(payload: CustomPayload, paper: PaperOptions): Promise<PrintPlan> {
	return request<PrintPlan>('/custom/print-plan', {
		method: 'POST',
		body: JSON.stringify({ ...payload, paper })
	});
}

export async function customExport(
	payload: CustomPayload,
	format: ExportFormat,
	paper: PaperOptions
): Promise<Blob> {
	const response = await fetch(`${apiBase()}/custom/export/${format}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...payload, paper })
	});
	if (!response.ok) {
		let message = `Ошибка ${response.status}`;
		try {
			const body = await response.json();
			const details = normaliseDetails(body);
			if (details.length) message = details.join('; ');
		} catch {
			// тело не JSON: оставляем статус
		}
		throw new ApiError(response.status, message);
	}
	return response.blob();
}
