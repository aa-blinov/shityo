/** Types mirroring docs/API-CONTRACT.md (v1). */

export interface Point {
	x: number;
	y: number;
}

export interface ParamOption {
	value: string;
	label: string;
	/** Fit options only: multiplier the drafting engine applies to every ease. */
	ease_factor?: number;
}

/** Description of a pattern parameter, as returned by GET /api/catalog. */
export interface ParamDescriptor {
	type: 'select' | 'number';
	options?: ParamOption[];
	default: string | number;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
}

export interface CatalogItem {
	id: string;
	name: string;
	category: string;
	category_label?: string;
	description?: string;
	genders: string[];
	/** Piece ids this model consists of. */
	pieces: string[];
	/** Measurement ids the model consumes. */
	measurements: string[];
	/** Parameter descriptions (not values). */
	params: Record<string, ParamDescriptor>;
	default_measurements: Record<string, number>;
}

export interface CatalogResponse {
	items: CatalogItem[];
}

export interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Notch {
	x: number;
	y: number;
	label?: string;
}

export interface Grainline {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface InternalLine {
	type: string;
	points: Point[];
	/** Название линии: «вытачка», «карман», «сгиб». */
	label?: string;
}

export interface SeamEdge {
	/** Имя ребра: швы сшивают детали по совпадающим именам. */
	label: string;
	points: Point[];
}

export interface Piece {
	id: string;
	name: string;
	mirrored: boolean;
	/** Closed contour without seam allowance, in mm. */
	outline: Point[];
	cut: number;
	seam_line: Point[];
	/** Seam allowance in mm; the screen must show what will be printed. */
	seam_allowance_mm: number;
	notches: Notch[];
	grainline: Grainline;
	internal_lines: InternalLine[];
	/** Подписанные швы: 3D-сборка сшивает детали по ним. */
	seam_edges: SeamEdge[];
	bbox: BBox;
	area_mm2: number;
}

export interface GenerateRequest {
	model: string;
	measurements: Record<string, number>;
	params: Record<string, string | number>;
	/** Переопределения точек чертежа из редактора, см. */
	overrides?: Record<string, number>;
}

/**
 * Замечание валидатора: код, параметры и текст по умолчанию на русском.
 * Фронтенд строит перевод по коду, а `text` берёт как запасной вариант.
 */
export interface Issue {
	code: string;
	params: Record<string, string | number>;
	text: string;
}

export interface GenerateResponse {
	model: string;
	size: Record<string, number>;
	scale_mm: number;
	units: string;
	pieces: Piece[];
	warnings: Issue[];
	errors?: Issue[];
	warning_texts?: string[];
	error_texts?: string[];
	metrics: Record<string, number>;
}

export interface ValidateResponse {
	ok: boolean;
	errors: Issue[];
	warnings: Issue[];
	error_texts?: string[];
	warning_texts?: string[];
}

export interface SizeGridRow {
	size: string;
	/** female / male: the size rows follow different standards. */
	gender?: string;
	/** Height group of the typical figure, cm (GOST: 6 cm steps). */
	height?: number;
	/** GOST designation: height-bust-hip (women) or height-bust-waist (men). */
	designation?: string;
	measurements: Record<string, number>;
	dimensions: Record<string, number>;
}

export interface HealthResponse {
	status: string;
	version: string;
}

export type ExportFormat = 'svg' | 'dxf' | 'pdf';


export interface PaperOptions {
 page: 'A4'|'A3'|'A2'|'A1'|'A0'|'LETTER'|'LEGAL'|'FULL';
 orientation: 'portrait'|'landscape';
 calibration: boolean;
}
export interface PrintPlan {
 page_count:number;pattern_page_count:number;
 page:PaperOptions['page'];orientation:PaperOptions['orientation'];calibration:boolean;
 width_mm:number;height_mm:number;overlap_mm:number;margin_mm:number;
 pieces:{id:string;name:string;pages:number[];rows:number;columns:number}[];
 sheets:{number:number;kind?:string;piece_ids:string[];row?:number;column?:number;tile?:string}[];
}
