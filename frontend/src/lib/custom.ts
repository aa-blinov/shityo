/** Конструктор с нуля: детали, заготовки и локальные проекты.
 *
 * Геометрия хранится в миллиметрах: так же, как её отдаёт и принимает API.
 * Редактор показывает сантиметры, поэтому перевод делается на границе
 * интерфейса, а не в модели. Проекты хранятся на сервере ателье.
 */
import { call } from './api';

export interface CustomPoint {
	x: number;
	y: number;
}

export interface CustomNotch {
	x: number;
	y: number;
	label: string;
}

export interface CustomGrainline {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface CustomInternalLine {
	type: string;
	points: CustomPoint[];
	label?: string;
	/** Вытачка, построенная в конструкторе: точка контура, раствор и длина, мм. */
	anchor?: number;
	width?: number;
	depth?: number;
}

/**
 * Срез детали: участок контура от точки from до точки to по ходу обхода.
 * takeUpMm - сколько длины участка не входит в шов (вытачка, заложенная в
 * контур основы); считается при переносе основы и дальше не меняется.
 */
export interface CustomEdge {
	id: string;
	label: string;
	from: number;
	to: number;
	takeUpMm: number;
	/** Свой припуск среза, мм (низ на подгибку); null - общий припуск детали. */
	allowanceMm?: number | null;
}

export interface EdgeRef {
	piece: string;
	edge: string;
}

/**
 * Пара сшиваемых срезов: сторона A и сторона B, каждая из одного или
 * нескольких срезов (окат против двух пройм). easeMm - задуманная посадка:
 * A длиннее B на столько, и это не ошибка.
 */
export interface CustomSeam {
	id: string;
	a: EdgeRef[];
	b: EdgeRef[];
	easeMm: number;
}

export interface CustomBinding {
	/** Мерка в сантиметрах, задающая ширину детали. */
	widthMeasurement: string | null;
	widthFactor: number;
	widthOffsetMm: number;
	/** Мерка в сантиметрах, задающая высоту детали. */
	heightMeasurement: string | null;
	heightFactor: number;
	heightOffsetMm: number;
}

export interface CustomPiece {
	id: string;
	name: string;
	outline: CustomPoint[];
	cut: number;
	seam_allowance_mm: number;
	mirrored: boolean;
	notches: CustomNotch[];
	grainline: CustomGrainline | null;
	internal_lines: CustomInternalLine[];
	/** Сглаживать контур Catmull-Rom или оставить прямыми отрезками. */
	smooth: boolean;
	/** Привязка размеров детали к меркам клиента. */
	binding: CustomBinding;
	/** Подписанные срезы для сверки швов. */
	edges?: CustomEdge[];
	/** Сдвиг детали на поле конструктора, мм: только для показа. */
	offset?: CustomPoint;
	/** Id детали в основе (collar_stand): по нему деталь собирается в 3D. */
	sourceId?: string;
}

/** Откуда выкройка: основа и мерки, по которым её построили (для 3D). */
export interface CustomSource {
	model: string;
	measurements: Record<string, number>;
	gender?: 'female' | 'male';
}

export function defaultBinding(): CustomBinding {
	return {
		widthMeasurement: null,
		widthFactor: 1,
		widthOffsetMm: 0,
		heightMeasurement: null,
		heightFactor: 1,
		heightOffsetMm: 0
	};
}

export interface CustomProject {
	version: 1;
	id: string;
	name: string;
	updated: string;
	pieces: CustomPiece[];
	seams?: CustomSeam[];
	source?: CustomSource;
}

export type TemplateId = 'rectangle' | 'trapezoid' | 'half-circle' | 'corner';

const MAX_NAME = 120;
const MAX_PIECES = 32;
const MAX_POINTS = 2000;
const MAX_COORD_MM = 20_000;
const MIN_AREA_MM2 = 1;
const MAX_SEAM_MM = 50;
const MAX_CUT = 8;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const TEMPLATES: { id: TemplateId; labelKey: string; widthMm: number; heightMm: number }[] = [
	{ id: 'rectangle', labelKey: 'custom.template.rectangle', widthMm: 600, heightMm: 800 },
	{ id: 'trapezoid', labelKey: 'custom.template.trapezoid', widthMm: 600, heightMm: 800 },
	{ id: 'half-circle', labelKey: 'custom.template.halfCircle', widthMm: 600, heightMm: 300 },
	{ id: 'corner', labelKey: 'custom.template.corner', widthMm: 400, heightMm: 400 }
];

function newId(): string {
	return crypto.randomUUID();
}

function pieceId(index: number): string {
	return `piece-${index + 1}`;
}

export function rectangle(widthMm = 600, heightMm = 800): CustomPoint[] {
	return [
		{ x: 0, y: 0 },
		{ x: widthMm, y: 0 },
		{ x: widthMm, y: heightMm },
		{ x: 0, y: heightMm }
	];
}

export function trapezoid(widthMm = 600, heightMm = 800): CustomPoint[] {
	const inset = widthMm * 0.2;
	return [
		{ x: inset, y: 0 },
		{ x: widthMm - inset, y: 0 },
		{ x: widthMm, y: heightMm },
		{ x: 0, y: heightMm }
	];
}

export function halfCircle(radiusMm = 300): CustomPoint[] {
	const steps = 24;
	const points: CustomPoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = Math.PI - (Math.PI * i) / steps;
		points.push({
			x: Math.round((radiusMm + radiusMm * Math.cos(angle)) * 100) / 100,
			y: Math.round((radiusMm - radiusMm * Math.sin(angle)) * 100) / 100
		});
	}
	return points;
}

export function corner(widthMm = 400, heightMm = 400): CustomPoint[] {
	return [
		{ x: 0, y: 0 },
		{ x: widthMm, y: heightMm },
		{ x: 0, y: heightMm }
	];
}

export function templateOutline(template: TemplateId, widthMm = 600, heightMm = 800): CustomPoint[] {
	switch (template) {
		case 'trapezoid':
			return trapezoid(widthMm, heightMm);
		case 'half-circle':
			return halfCircle(widthMm / 2);
		case 'corner':
			return corner(widthMm, heightMm);
		default:
			return rectangle(widthMm, heightMm);
	}
}

function catmullRomPoint(
	p0: CustomPoint,
	p1: CustomPoint,
	p2: CustomPoint,
	p3: CustomPoint,
	t: number
): CustomPoint {
	const t2 = t * t;
	const t3 = t2 * t;
	return {
		x:
			0.5 *
			(2 * p1.x +
				(-p0.x + p2.x) * t +
				(2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
				(-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
		y:
			0.5 *
			(2 * p1.y +
				(-p0.y + p2.y) * t +
				(2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
				(-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
	};
}

/** Развернуть контур в ломаную: прямые отрезки или сглаженные Catmull-Rom. */
export function outlinePoints(piece: CustomPiece, segments = 10): CustomPoint[] {
	if (!piece.smooth || piece.outline.length < 3) return piece.outline.map((p) => ({ ...p }));
	const points = piece.outline;
	const result: CustomPoint[] = [];
	const n = points.length;
	for (let i = 0; i < n; i++) {
		const p0 = points[(i - 1 + n) % n];
		const p1 = points[i];
		const p2 = points[(i + 1) % n];
		const p3 = points[(i + 2) % n];
		for (let j = 0; j < segments; j++) {
			result.push(catmullRomPoint(p0, p1, p2, p3, j / segments));
		}
	}
	return result;
}

export function createPiece(template: TemplateId = 'rectangle', index = 0): CustomPiece {
	const widthMm = 600;
	const heightMm = 800;
	const outline = templateOutline(template, widthMm, heightMm);
	const top = outline.reduce((min, p) => Math.min(min, p.y), Infinity);
	const bottom = outline.reduce((max, p) => Math.max(max, p.y), -Infinity);
	const left = outline.reduce((min, p) => Math.min(min, p.x), Infinity);
	const right = outline.reduce((max, p) => Math.max(max, p.x), -Infinity);
	return {
		id: pieceId(index),
		name: `Деталь ${index + 1}`,
		outline,
		cut: 1,
		seam_allowance_mm: 10,
		mirrored: false,
		notches: [],
		grainline: {
			x1: Math.round((left + right) / 2),
			y1: Math.round(top + 20),
			x2: Math.round((left + right) / 2),
			y2: Math.round(bottom - 20)
		},
		internal_lines: [],
		smooth: template === 'half-circle',
		binding: defaultBinding()
	};
}

export function createProject(name = '', pieces: CustomPiece[] = [createPiece()]): CustomProject {
	return {
		version: 1,
		id: newId(),
		name: name.trim() || 'Новая выкройка',
		updated: new Date().toISOString(),
		pieces
	};
}

function isPoint(value: unknown): value is CustomPoint {
	return (
		!!value &&
		typeof value === 'object' &&
		Number.isFinite((value as CustomPoint).x) &&
		Number.isFinite((value as CustomPoint).y)
	);
}

function normalizeBinding(raw: unknown): CustomBinding {
	if (!raw || typeof raw !== 'object') return defaultBinding();
	const value = raw as Partial<CustomBinding>;
	const widthMeasurement =
		typeof value.widthMeasurement === 'string' && value.widthMeasurement.trim()
			? value.widthMeasurement
			: null;
	const heightMeasurement =
		typeof value.heightMeasurement === 'string' && value.heightMeasurement.trim()
			? value.heightMeasurement
			: null;
	const widthFactor = Number(value.widthFactor ?? 1);
	const heightFactor = Number(value.heightFactor ?? 1);
	const widthOffsetMm = Number(value.widthOffsetMm ?? 0);
	const heightOffsetMm = Number(value.heightOffsetMm ?? 0);
	if (
		!Number.isFinite(widthFactor) ||
		widthFactor <= 0 ||
		!Number.isFinite(heightFactor) ||
		heightFactor <= 0 ||
		!Number.isFinite(widthOffsetMm) ||
		!Number.isFinite(heightOffsetMm)
	) {
		throw new Error('custom.invalid');
	}
	return {
		widthMeasurement,
		widthFactor,
		widthOffsetMm,
		heightMeasurement,
		heightFactor,
		heightOffsetMm
	};
}

export function validateProject(raw: unknown): CustomProject {
	if (!raw || typeof raw !== 'object') throw new Error('custom.invalid');
	const project = raw as CustomProject;
	if (
		project.version !== 1 ||
		typeof project.id !== 'string' ||
		typeof project.name !== 'string' ||
		!project.name.trim() ||
		project.name.length > MAX_NAME ||
		typeof project.updated !== 'string' ||
		!Number.isFinite(Date.parse(project.updated)) ||
		!Array.isArray(project.pieces) ||
		project.pieces.length === 0 ||
		project.pieces.length > MAX_PIECES
	) {
		throw new Error('custom.invalid');
	}
	const seen = new Set<string>();
	project.pieces = project.pieces.map((piece) => {
		if (!piece || typeof piece !== 'object' || !ID_PATTERN.test(piece.id) || seen.has(piece.id)) {
			throw new Error('custom.invalid');
		}
		seen.add(piece.id);
		if (typeof piece.name !== 'string' || !piece.name.trim() || piece.name.length > 80) {
			throw new Error('custom.invalid');
		}
		if (!Array.isArray(piece.outline) || piece.outline.length < 3 || piece.outline.length > MAX_POINTS) {
			throw new Error('custom.invalid');
		}
		for (const point of piece.outline) {
			if (!isPoint(point) || Math.abs(point.x) > MAX_COORD_MM || Math.abs(point.y) > MAX_COORD_MM) {
				throw new Error('custom.invalid');
			}
		}
		if (!Number.isInteger(piece.cut) || piece.cut < 1 || piece.cut > MAX_CUT) {
			throw new Error('custom.invalid');
		}
		if (
			!Number.isFinite(piece.seam_allowance_mm) ||
			piece.seam_allowance_mm < 0 ||
			piece.seam_allowance_mm > MAX_SEAM_MM
		) {
			throw new Error('custom.invalid');
		}
		if (!Array.isArray(piece.notches) || !Array.isArray(piece.internal_lines)) {
			throw new Error('custom.invalid');
		}
		if (piece.grainline !== null) {
			const grain = piece.grainline;
			if (
				!grain ||
				![grain.x1, grain.y1, grain.x2, grain.y2].every((value) => Number.isFinite(value))
			) {
				throw new Error('custom.invalid');
			}
		}
		piece.binding = normalizeBinding(piece.binding);
		piece.edges = normalizeEdges(piece.edges, piece.outline.length);
		piece.offset = isPoint(piece.offset) ? { x: piece.offset.x, y: piece.offset.y } : { x: 0, y: 0 };
		return piece;
	});
	project.seams = normalizeSeams(project.seams, project.pieces);
	project.source = normalizeSource(project.source);
	return structuredClone(project);
}

/** Свои выкройки ателье. Повреждённая запись пропускается, остальные видны. */
export async function loadProjects(): Promise<CustomProject[]> {
	const raw = await call<unknown[]>('GET', '/custom-projects');
	return raw
		.map((item) => {
			try {
				return validateProject(item);
			} catch {
				return null;
			}
		})
		.filter((item): item is CustomProject => item !== null);
}

export async function saveProject(project: CustomProject): Promise<CustomProject> {
	const valid = validateProject(project);
	return validateProject(
		await call<unknown>('PUT', `/custom-projects/${encodeURIComponent(valid.id)}`, valid)
	);
}

export async function deleteProject(id: string): Promise<void> {
	await call('DELETE', `/custom-projects/${encodeURIComponent(id)}`);
}

export function downloadProject(project: CustomProject): void {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
	);
	const link = document.createElement('a');
	link.href = url;
	link.download = `shityo-custom-${project.id}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Полезная нагрузка для API: контур уже развёрнут в ломаную. */
export function toApiPiece(piece: CustomPiece) {
	return {
		id: piece.id,
		name: piece.name,
		outline: outlinePoints(piece).map((point) => ({
			x: Math.round(point.x * 100) / 100,
			y: Math.round(point.y * 100) / 100
		})),
		cut: piece.cut,
		seam_allowance_mm: piece.seam_allowance_mm,
		mirrored: piece.mirrored,
		notches: piece.notches,
		grainline: piece.grainline,
		internal_lines: piece.internal_lines.map((line) => ({
			type: line.type,
			points: line.points,
			label: line.label ?? ''
		})),
		// Срезы со своим припуском: подпись - id среза, она уникальна в детали.
		seam_edges: (piece.edges ?? [])
			.filter((edge) => edge.allowanceMm !== null && edge.allowanceMm !== undefined)
			.map((edge) => ({ label: edge.id, points: edgePolyline(piece, edge) })),
		edge_allowances_mm: Object.fromEntries(
			(piece.edges ?? [])
				.filter((edge) => edge.allowanceMm !== null && edge.allowanceMm !== undefined)
				.map((edge) => [edge.id, edge.allowanceMm as number])
		)
	};
}

export function projectPayload(project: CustomProject) {
	return { pieces: project.pieces.map(toApiPiece) };
}

/** Проверка контура в браузере до отправки: сервер всё равно проверит. */
export function outlineArea(points: CustomPoint[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
}

export function outlineIsValid(points: CustomPoint[]): boolean {
	return points.length >= 3 && outlineArea(points) >= MIN_AREA_MM2;
}

function bounds(points: CustomPoint[]) {
	let left = Infinity;
	let right = -Infinity;
	let top = Infinity;
	let bottom = -Infinity;
	for (const point of points) {
		left = Math.min(left, point.x);
		right = Math.max(right, point.x);
		top = Math.min(top, point.y);
		bottom = Math.max(bottom, point.y);
	}
	return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function makeGrainline(points: CustomPoint[]): CustomGrainline | null {
	if (points.length < 2) return null;
	const box = bounds(points);
	const x = Math.round((box.left + box.right) / 2);
	return {
		x1: x,
		y1: Math.round(box.top + 20),
		x2: x,
		y2: Math.round(box.bottom - 20)
	};
}

export function pieceSizeMm(piece: CustomPiece): { width: number; height: number } {
	const box = bounds(piece.outline);
	return { width: box.width, height: box.height };
}

/**
 * Подогнать деталь под мерки. Мерки приходят в сантиметрах, геометрия
 * остаётся в миллиметрах. Масштаб считается от текущего контура, поэтому
 * повторное применение не накапливает искажение.
 */
export function applyBinding(piece: CustomPiece, values: Record<string, number>): boolean {
	const box = bounds(piece.outline);
	if (box.width <= 0 || box.height <= 0) return false;
	const binding = piece.binding;
	let sx = 1;
	let sy = 1;
	if (binding.widthMeasurement) {
		const value = values[binding.widthMeasurement];
		if (Number.isFinite(value)) {
			const target = value * 10 * binding.widthFactor + binding.widthOffsetMm;
			if (target > 0) sx = target / box.width;
		}
	}
	if (binding.heightMeasurement) {
		const value = values[binding.heightMeasurement];
		if (Number.isFinite(value)) {
			const target = value * 10 * binding.heightFactor + binding.heightOffsetMm;
			if (target > 0) sy = target / box.height;
		}
	}
	if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return false;
	const scale = (point: CustomPoint): CustomPoint => ({
		x: box.left + (point.x - box.left) * sx,
		y: box.top + (point.y - box.top) * sy
	});
	piece.outline = piece.outline.map(scale);
	piece.notches = piece.notches.map((notch) => ({ ...notch, ...scale(notch) }));
	if (piece.grainline) {
		piece.grainline = {
			...piece.grainline,
			...(() => {
				const a = scale({ x: piece.grainline!.x1, y: piece.grainline!.y1 });
				const b = scale({ x: piece.grainline!.x2, y: piece.grainline!.y2 });
				return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
			})()
		};
	}
	piece.internal_lines = piece.internal_lines.map((line) => ({
		...line,
		points: line.points.map(scale)
	}));
	return true;
}

const SHORT_ID = /^[a-z0-9-]{1,40}$/;
const MODEL_ID = /^[a-z][a-z0-9_]{0,31}$/;

function normalizeSource(raw: unknown): CustomSource | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const source = raw as CustomSource;
	if (typeof source.model !== 'string' || !MODEL_ID.test(source.model)) return undefined;
	if (!source.measurements || typeof source.measurements !== 'object') return undefined;
	const measurements: Record<string, number> = {};
	for (const [key, value] of Object.entries(source.measurements)) {
		if (/^[a-z_]{1,40}$/.test(key) && Number.isFinite(value)) measurements[key] = value;
	}
	return {
		model: source.model,
		measurements,
		...(source.gender === 'female' || source.gender === 'male' ? { gender: source.gender } : {})
	};
}

function normalizeEdges(raw: unknown, points: number): CustomEdge[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const edges: CustomEdge[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const edge = item as CustomEdge;
		if (typeof edge.id !== 'string' || !SHORT_ID.test(edge.id) || seen.has(edge.id)) continue;
		if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to)) continue;
		if (edge.from < 0 || edge.to < 0 || edge.from >= points || edge.to >= points || edge.from === edge.to) continue;
		seen.add(edge.id);
		edges.push({
			id: edge.id,
			label: typeof edge.label === 'string' ? edge.label.slice(0, 60) : '',
			from: edge.from,
			to: edge.to,
			takeUpMm: Number.isFinite(edge.takeUpMm) ? Math.max(-1000, Math.min(1000, edge.takeUpMm)) : 0,
			allowanceMm:
				typeof edge.allowanceMm === 'number' && Number.isFinite(edge.allowanceMm)
					? Math.max(0, Math.min(MAX_SEAM_MM, edge.allowanceMm))
					: null
		});
	}
	return edges;
}

function normalizeSeams(raw: unknown, pieces: CustomPiece[]): CustomSeam[] {
	if (!Array.isArray(raw)) return [];
	const known = (ref: EdgeRef) =>
		!!ref &&
		pieces.some((piece) => piece.id === ref.piece && piece.edges?.some((edge) => edge.id === ref.edge));
	const seams: CustomSeam[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const seam = item as CustomSeam;
		if (typeof seam.id !== 'string' || !SHORT_ID.test(seam.id)) continue;
		const a = Array.isArray(seam.a) ? seam.a.filter(known) : [];
		const b = Array.isArray(seam.b) ? seam.b.filter(known) : [];
		if (!a.length || !b.length) continue;
		seams.push({ id: seam.id, a, b, easeMm: Number.isFinite(seam.easeMm) ? seam.easeMm : 0 });
	}
	return seams;
}

export function shortId(): string {
	return Math.random().toString(36).slice(2, 10);
}

// ------------------------------------------------------------ срезы и швы

/** Индексы точек контура среза по ходу обхода: from, ..., to. */
export function edgeIndices(edge: CustomEdge, count: number): number[] {
	const result = [edge.from];
	let i = edge.from;
	while (i !== edge.to && result.length <= count) {
		i = (i + 1) % count;
		result.push(i);
	}
	return result;
}

function polylineLength(points: CustomPoint[]): number {
	let sum = 0;
	for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	return sum;
}

/** Ломаная среза: для сглаженной детали - по кривой, как она печатается. */
export function edgePolyline(piece: CustomPiece, edge: CustomEdge, segments = 10): CustomPoint[] {
	const count = piece.outline.length;
	const indices = edgeIndices(edge, count);
	if (!piece.smooth || count < 3) return indices.map((i) => piece.outline[i]);
	const curve = outlinePoints(piece, segments);
	const result: CustomPoint[] = [];
	for (let k = 0; k < indices.length - 1; k++) {
		const start = indices[k] * segments;
		for (let j = 0; j < segments; j++) result.push(curve[(start + j) % curve.length]);
	}
	result.push(curve[(indices[indices.length - 1] * segments) % curve.length]);
	return result;
}

function onPolyline(point: CustomPoint, line: CustomPoint[], tol = 1): boolean {
	for (let i = 1; i < line.length; i++) {
		const a = line[i - 1];
		const b = line[i];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
		if (Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y) <= tol) return true;
	}
	return false;
}

/**
 * Длина среза, которая войдёт в шов: по контуру минус вытачки. Вытачка,
 * у которой обе стороны выходят на срез, забирает свой раствор.
 */
export function edgeLength(piece: CustomPiece, edge: CustomEdge): number {
	const line = edgePolyline(piece, edge);
	let length = polylineLength(line) - edge.takeUpMm;
	for (const dart of piece.internal_lines) {
		if (dart.type !== 'dart' || dart.points.length !== 3) continue;
		const [a, , b] = dart.points;
		if (onPolyline(a, line) && onPolyline(b, line)) length -= Math.hypot(b.x - a.x, b.y - a.y);
	}
	return Math.max(0, length);
}

export function sideLength(project: CustomProject, refs: EdgeRef[]): number | null {
	let sum = 0;
	for (const ref of refs) {
		const piece = project.pieces.find((item) => item.id === ref.piece);
		const edge = piece?.edges?.find((item) => item.id === ref.edge);
		if (!piece || !edge) return null;
		sum += edgeLength(piece, edge);
	}
	return sum;
}

/** Допуск сверки швов, как в основах: 5 мм. */
export const SEAM_TOLERANCE_MM = 5;

export function seamCheck(project: CustomProject, seam: CustomSeam) {
	const a = sideLength(project, seam.a);
	const b = sideLength(project, seam.b);
	if (a === null || b === null) return null;
	const diff = a - b - seam.easeMm;
	return { a, b, diff, ok: Math.abs(diff) <= SEAM_TOLERANCE_MM };
}

/** Точку вставили после index: индексы срезов и вытачек сдвигаются. */
export function shiftAfterInsert(piece: CustomPiece, inserted: number): void {
	const bump = (i: number) => (i >= inserted ? i + 1 : i);
	piece.edges = (piece.edges ?? []).map((edge) => ({ ...edge, from: bump(edge.from), to: bump(edge.to) }));
	for (const line of piece.internal_lines) if (line.anchor !== undefined) line.anchor = bump(line.anchor);
}

/** Точку удалили: срезы и вытачки на ней пропадают, остальные сдвигаются. */
export function shiftAfterRemove(piece: CustomPiece, removed: number): void {
	const drop = (i: number) => (i > removed ? i - 1 : i);
	piece.edges = (piece.edges ?? [])
		.filter((edge) => edge.from !== removed && edge.to !== removed)
		.map((edge) => ({ ...edge, from: drop(edge.from), to: drop(edge.to) }))
		.filter((edge) => edge.from !== edge.to);
	piece.internal_lines = piece.internal_lines
		.filter((line) => line.anchor !== removed)
		.map((line) => (line.anchor === undefined ? line : { ...line, anchor: drop(line.anchor) }));
}

// ------------------------------------------------------------ вытачки и сгиб

function signedArea(points: CustomPoint[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
}

/** Точка на контуре в distance мм от точки контура index (знак - направление). */
function walk(points: CustomPoint[], index: number, distance: number): CustomPoint {
	const n = points.length;
	const step = distance >= 0 ? 1 : -1;
	let left = Math.abs(distance);
	let i = index;
	for (let guard = 0; guard < n; guard++) {
		const a = points[i];
		const j = (i + step + n) % n;
		const b = points[j];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len >= left && len > 0) {
			const t = left / len;
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		}
		left -= len;
		i = j;
	}
	return points[index];
}

/**
 * Вытачка от точки контура: стороны на контуре по половине раствора в обе
 * стороны, вершина внутрь детали на длину вытачки. Контур не меняется: на
 * печати линия реза идёт через раствор, а длина шва уменьшается на раствор.
 */
export function dartAt(piece: CustomPiece, anchor: number, width: number, depth: number): CustomInternalLine | null {
	const points = piece.outline;
	if (!points[anchor] || width <= 0 || depth <= 0) return null;
	const a = walk(points, anchor, -width / 2);
	const b = walk(points, anchor, width / 2);
	const p = points[anchor];
	const tx = b.x - a.x;
	const ty = b.y - a.y;
	const len = Math.hypot(tx, ty) || 1;
	// Внутренняя нормаль: контур по часовой (экран, y вниз) - вправо от хода.
	const sign = signedArea(points) > 0 ? 1 : -1;
	const nx = (-ty / len) * sign;
	const ny = (tx / len) * sign;
	const round = (v: number) => Math.round(v * 10) / 10;
	return {
		type: 'dart',
		label: 'вытачка',
		points: [
			{ x: round(a.x), y: round(a.y) },
			{ x: round(p.x + nx * depth), y: round(p.y + ny * depth) },
			{ x: round(b.x), y: round(b.y) }
		],
		anchor,
		width,
		depth
	};
}

/** Вытачки конструктора идут за своей точкой контура. */
export function refreshDarts(piece: CustomPiece): void {
	piece.internal_lines = piece.internal_lines.map((line) => {
		if (line.type !== 'dart' || line.anchor === undefined) return line;
		return dartAt(piece, line.anchor, line.width ?? 20, line.depth ?? 100) ?? line;
	});
}

/** Сдвинуть всю геометрию детали по x (контур, надсечки, нить, линии). */
function shiftX(piece: CustomPiece, dx: number): void {
	const move = (p: CustomPoint) => ({ ...p, x: Math.round((p.x + dx) * 10) / 10 });
	piece.outline = piece.outline.map(move);
	piece.notches = piece.notches.map((notch) => ({ ...notch, x: Math.round((notch.x + dx) * 10) / 10 }));
	if (piece.grainline) piece.grainline = { ...piece.grainline, x1: piece.grainline.x1 + dx, x2: piece.grainline.x2 + dx };
	piece.internal_lines = piece.internal_lines.map((line) => ({ ...line, points: line.points.map(move) }));
	piece.offset = { x: (piece.offset?.x ?? 0) - dx, y: piece.offset?.y ?? 0 };
}

/**
 * Сгиб по отрезку контура от точки index до следующей. Сгиб должен быть
 * вертикальным: деталь сдвигается так, чтобы он лёг на ось x = 0, - так его
 * узнаёт печать (без припуска по сгибу, пометка «сгиб»).
 */
export function setFold(piece: CustomPiece, index: number): boolean {
	const points = piece.outline;
	const a = points[index];
	const b = points[(index + 1) % points.length];
	if (!a || !b || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) < 10) return false;
	shiftX(piece, -a.x);
	const x = 0;
	piece.outline[index] = { ...piece.outline[index], x };
	piece.outline[(index + 1) % points.length] = { ...piece.outline[(index + 1) % points.length], x };
	piece.internal_lines = piece.internal_lines.filter((line) => line.type !== 'fold');
	piece.internal_lines.push({
		type: 'fold',
		label: 'сгиб',
		points: [
			{ x, y: Math.min(a.y, b.y) },
			{ x, y: Math.max(a.y, b.y) }
		]
	});
	piece.cut = 1;
	piece.mirrored = false;
	return true;
}

export function clearFold(piece: CustomPiece): void {
	piece.internal_lines = piece.internal_lines.filter((line) => line.type !== 'fold');
}

// ------------------------------------------------------------ раскладка и перенос основы

function pieceBounds(piece: CustomPiece) {
	return bounds(piece.outline);
}

/** Разложить детали в ряд слева направо без наложений. */
export function arrangePieces(pieces: CustomPiece[], gap = 80): void {
	let x = 0;
	for (const piece of pieces) {
		const box = pieceBounds(piece);
		piece.offset = { x: x - box.left, y: -box.top };
		x += box.width + gap;
	}
}

export interface BlockPiece {
	id: string;
	name: string;
	outline: CustomPoint[];
	cut: number;
	seam_allowance_mm: number;
	mirrored: boolean;
	notches: CustomNotch[];
	grainline: CustomGrainline | null;
	internal_lines: { type: string; points: CustomPoint[]; label?: string }[];
	seam_edges?: { label: string; points: CustomPoint[] }[];
	edge_allowances_mm?: Record<string, number>;
	hem_allowance_mm?: number | null;
}

function nearestIndex(points: CustomPoint[], target: CustomPoint): number {
	let best = 0;
	let bestD = Infinity;
	points.forEach((p, i) => {
		const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	});
	return best;
}

/** Срез основы на контуре: ближайшие точки концов, обход в ту сторону, что ближе по длине. */
function edgeFromSeam(outline: CustomPoint[], seam: { label: string; points: CustomPoint[] }): CustomEdge | null {
	if (seam.points.length < 2) return null;
	const first = nearestIndex(outline, seam.points[0]);
	const last = nearestIndex(outline, seam.points[seam.points.length - 1]);
	if (first === last) return null;
	const target = polylineLength(seam.points);
	const along = (from: number, to: number) =>
		polylineLength(edgeIndices({ id: 'x', label: '', from, to, takeUpMm: 0 }, outline.length).map((i) => outline[i]));
	const forward = along(first, last);
	const backward = along(last, first);
	const [from, to] = Math.abs(forward - target) <= Math.abs(backward - target) ? [first, last] : [last, first];
	return { id: shortId(), label: seam.label, from, to, takeUpMm: 0 };
}

/**
 * Низ детали, как его находит печать: срезы, которые смотрят вниз и лежат в
 * нижней части детали; берётся самая длинная непрерывная цепочка.
 */
function hemEdge(outline: CustomPoint[]): CustomEdge | null {
	const n = outline.length;
	const box = bounds(outline);
	const orientation = signedArea(outline) > 0 ? 1 : -1;
	const down = outline.map((a, i) => {
		const b = outline[(i + 1) % n];
		const dx = b.x - a.x;
		const len = Math.hypot(dx, b.y - a.y) || 1;
		return orientation * (-dx / len) > 0.6 && (a.y + b.y) / 2 > box.top + 0.6 * box.height;
	});
	if (down.every(Boolean) || !down.some(Boolean)) return null;
	let best: [number, number] | null = null;
	for (let i = 0; i < n; i++) {
		if (!down[i] || down[(i - 1 + n) % n]) continue;
		let j = i;
		while (down[(j + 1) % n]) j = (j + 1) % n;
		const length = (j - i + n) % n;
		if (!best || length > (best[1] - best[0] + n) % n) best = [i, j];
	}
	if (!best) return null;
	return { id: shortId(), label: 'низ', from: best[0], to: (best[1] + 1) % n, takeUpMm: 0 };
}

const SAFE_ID = (id: string, index: number) => {
	const clean = id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
	return clean || pieceId(index);
};

/**
 * Основа в конструктор: детали построенного лекала становятся деталями по
 * точкам, подписанные швы - срезами, а пары одинаковых швов (бок переда и
 * бок спинки, окат и две проймы) - готовой сверкой. Задуманная посадка
 * основы переносится в пару, чтобы сверка начиналась без ошибок.
 */
export function projectFromBlock(
	name: string,
	block: BlockPiece[],
	pieceName: (id: string, fallback: string) => string,
	source?: CustomSource,
	passportSeams?: { a: string[]; b: string[]; ease: [number, number] }[]
): CustomProject {
	const pieces: CustomPiece[] = block.slice(0, MAX_PIECES).map((item, index) => {
		const outline = item.outline.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
		const edges = (item.seam_edges ?? [])
			.map((seam) => edgeFromSeam(outline, seam))
			.filter((edge): edge is CustomEdge => edge !== null);
		return {
			id: SAFE_ID(item.id, index),
			name: pieceName(item.id, item.name).slice(0, 80) || `Деталь ${index + 1}`,
			outline,
			cut: Math.min(MAX_CUT, Math.max(1, item.cut || 1)),
			seam_allowance_mm: Math.min(MAX_SEAM_MM, Math.max(0, item.seam_allowance_mm ?? 10)),
			mirrored: !!item.mirrored,
			notches: item.notches.map((n) => ({ x: n.x, y: n.y, label: n.label ?? '' })),
			grainline: item.grainline,
			internal_lines: item.internal_lines.map((line) => ({ type: line.type, points: line.points, label: line.label ?? '' })),
			smooth: false,
			binding: defaultBinding(),
			edges,
			sourceId: item.id
		};
	});
	// Припуски срезов основы: свои по подписи и низ на подгибку.
	pieces.forEach((piece, index) => {
		const source = block[index];
		for (const edge of piece.edges ?? []) {
			const mm = source.edge_allowances_mm?.[edge.label];
			if (typeof mm === 'number') edge.allowanceMm = mm;
		}
		if (typeof source.hem_allowance_mm === 'number') {
			const hem = hemEdge(piece.outline);
			if (hem) piece.edges = [...(piece.edges ?? []), { ...hem, allowanceMm: source.hem_allowance_mm }];
		}
	});
	// Поправка срезов: длина основы - эталон, вытачки на срезе уже учтены в ней.
	pieces.forEach((piece, index) => {
		const seamsOf = block[index].seam_edges ?? [];
		for (const edge of piece.edges ?? []) {
			const source = seamsOf.find((seam) => seam.label === edge.label);
			if (!source) continue;
			const delta = edgeLength(piece, edge) - polylineLength(source.points);
			edge.takeUpMm = Math.round(delta * 10) / 10;
		}
	});
	arrangePieces(pieces);
	const project = createProject(name.slice(0, MAX_NAME), pieces);
	project.seams = passportSeams?.length ? seamsFromPassport(project, passportSeams) : autoSeams(project);
	if (source) project.source = normalizeSource(source);
	return project;
}

function refsByLabel(pieces: CustomPiece[], label: string): EdgeRef[] {
	const refs: EdgeRef[] = [];
	for (const piece of pieces) for (const edge of piece.edges ?? []) if (edge.label === label) refs.push({ piece: piece.id, edge: edge.id });
	return refs;
}

/**
 * Пары швов из паспорта основы («front.бок» против «back.бок»). Посадка в
 * паспорте - диапазон; в паре конструктора - фактическая посадка основы,
 * ограниченная этим диапазоном.
 */
export function seamsFromPassport(
	project: CustomProject,
	specs: { a: string[]; b: string[]; ease: [number, number] }[]
): CustomSeam[] {
	const ref = (spec: string): EdgeRef | null => {
		const dot = spec.indexOf('.');
		const sourceId = spec.slice(0, dot);
		const label = spec.slice(dot + 1);
		const piece = project.pieces.find((item) => (item.sourceId ?? item.id) === sourceId);
		const edge = piece?.edges?.find((item) => item.label === label);
		return piece && edge ? { piece: piece.id, edge: edge.id } : null;
	};
	const seams: CustomSeam[] = [];
	for (const spec of specs) {
		const a = spec.a.map(ref);
		const b = spec.b.map(ref);
		if (a.some((item) => !item) || b.some((item) => !item)) continue;
		const seam: CustomSeam = { id: shortId(), a: a as EdgeRef[], b: b as EdgeRef[], easeMm: 0 };
		const check = seamCheck(project, seam);
		if (check) seam.easeMm = Math.round(Math.max(spec.ease[0], Math.min(spec.ease[1], check.diff)));
		seams.push(seam);
	}
	return seams;
}

const PAIRED = new Set(['бок', 'плечо', 'шаг', 'шов чашки']);
const ATTACHED = new Set(['горловина', 'пояс']);

/** Пары швов основы: одинаковые подписи у двух деталей; окат - против двух пройм. */
export function autoSeams(project: CustomProject): CustomSeam[] {
	const seams: CustomSeam[] = [];
	const labels = new Set(project.pieces.flatMap((piece) => (piece.edges ?? []).map((edge) => edge.label)));
	const add = (a: EdgeRef[], b: EdgeRef[]) => {
		const seam: CustomSeam = { id: shortId(), a, b, easeMm: 0 };
		const check = seamCheck(project, seam);
		// Разница больше 3 см - не пара, а совпадение подписей.
		if (!check || Math.abs(check.diff) > 30) return;
		seam.easeMm = Math.abs(check.diff) > SEAM_TOLERANCE_MM ? Math.round(check.diff) : 0;
		seams.push(seam);
	};
	for (const label of labels) {
		const refs = refsByLabel(project.pieces, label);
		// Сшиваются друг с другом только эти срезы; вырез и средний шов - нет.
		if (refs.length === 2 && PAIRED.has(label) && refs[0].piece !== refs[1].piece) add([refs[0]], [refs[1]]);
		else if (refs.length === 3 && ATTACHED.has(label)) {
			// Воротник или пояс против переда и спинки.
			const base = refs.filter((ref) => ref.piece === 'front' || ref.piece === 'back');
			const other = refs.filter((ref) => ref.piece !== 'front' && ref.piece !== 'back');
			if (base.length === 2 && other.length === 1) add(other, base);
		}
	}
	const stand = refsByLabel(project.pieces, 'стойка');
	const standTop = refsByLabel(project.pieces, 'верх стойки');
	if (stand.length === 1 && standTop.length === 1) add(stand, standTop);
	const cap = refsByLabel(project.pieces, 'окат');
	const armholes = refsByLabel(project.pieces, 'пройма');
	if (cap.length === 1 && armholes.length === 2) add(cap, armholes);
	return seams;
}

// ------------------------------------------------------------ линия реза

/**
 * Линия реза детали, как на печати: каждый срез отступает на свой припуск
 * (низ на подгибку, сгиб без припуска), остальные - на общий.
 */
export function cutOutline(piece: CustomPiece, segments = 10): CustomPoint[] {
	const ring = outlinePoints(piece, segments);
	const n = ring.length;
	if (n < 3) return ring;
	const step = piece.smooth && piece.outline.length >= 3 ? segments : 1;
	const distances = new Array(n).fill(piece.seam_allowance_mm);
	for (const edge of piece.edges ?? []) {
		if (edge.allowanceMm === null || edge.allowanceMm === undefined) continue;
		const indices = edgeIndices(edge, piece.outline.length);
		for (let k = 0; k < indices.length - 1; k++) {
			for (let j = 0; j < step; j++) distances[(indices[k] * step + j) % n] = edge.allowanceMm;
		}
	}
	const fold = piece.internal_lines.some((line) => line.type === 'fold' && line.points.every((p) => Math.abs(p.x) <= 0.5));
	if (fold) {
		for (let i = 0; i < n; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % n];
			if (Math.abs(a.x) <= 0.5 && Math.abs(b.x) <= 0.5) distances[i] = 0;
		}
	}
	const orientation = signedArea(ring) > 0 ? 1 : -1;
	const normals = ring.map((a, i) => {
		const b = ring[(i + 1) % n];
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		// Внешняя нормаль, как в cutplan.offset_edges на сервере.
		return { x: (orientation * (b.y - a.y)) / len, y: (orientation * -(b.x - a.x)) / len };
	});
	const limit = 4 * Math.max(1, ...distances);
	const out: CustomPoint[] = [];
	for (let j = 0; j < n; j++) {
		const i = (j - 1 + n) % n;
		const p = ring[j];
		const na = normals[i];
		const nb = normals[j];
		const da = distances[i];
		const db = distances[j];
		const a0 = { x: ring[i].x + na.x * da, y: ring[i].y + na.y * da };
		const a1 = { x: p.x + na.x * da, y: p.y + na.y * da };
		const b0 = { x: p.x + nb.x * db, y: p.y + nb.y * db };
		const next = ring[(j + 1) % n];
		const b1 = { x: next.x + nb.x * db, y: next.y + nb.y * db };
		const rx = a1.x - a0.x;
		const ry = a1.y - a0.y;
		const sx = b1.x - b0.x;
		const sy = b1.y - b0.y;
		const cross = rx * sy - ry * sx;
		if (Math.abs(cross) < 1e-9 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) {
			if (Math.abs(da - db) < 1e-9) out.push(b0);
			else out.push(a1, b0);
			continue;
		}
		const t = ((b0.x - a0.x) * sy - (b0.y - a0.y) * sx) / cross;
		const x = { x: a0.x + rx * t, y: a0.y + ry * t };
		if (Math.hypot(x.x - p.x, x.y - p.y) > limit) out.push(a1, b0);
		else out.push(x);
	}
	return out;
}

// ------------------------------------------------------------ 3D

/**
 * Детали выкройки в формате построенной основы: id основы, подписанные швы
 * по срезам. По ним 3D собирает изделие той же сборкой, что и основу.
 */
export function piecesFor3d(project: CustomProject) {
	return project.pieces.map((piece) => {
		const outline = outlinePoints(piece);
		const box = bounds(outline);
		return {
			id: piece.sourceId ?? piece.id,
			name: piece.name,
			mirrored: piece.mirrored,
			outline,
			cut: piece.cut,
			seam_line: outline,
			seam_allowance_mm: piece.seam_allowance_mm,
			notches: piece.notches,
			grainline: piece.grainline ?? { x1: box.left, y1: box.top, x2: box.left, y2: box.bottom },
			internal_lines: piece.internal_lines.map((line) => ({ type: line.type, points: line.points })),
			seam_edges: (piece.edges ?? [])
				.filter((edge) => edge.label)
				.map((edge) => ({ label: edge.label, points: edgePolyline(piece, edge) })),
			bbox: { x: box.left, y: box.top, width: box.width, height: box.height },
			area_mm2: outlineArea(outline)
		};
	});
}
