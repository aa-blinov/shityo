/** Конструктор с нуля: детали, заготовки и локальные проекты.
 *
 * Геометрия хранится в миллиметрах: так же, как её отдаёт и принимает API.
 * Редактор показывает сантиметры, поэтому перевод делается на границе
 * интерфейса, а не в модели.
 */

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
}

export type TemplateId = 'rectangle' | 'trapezoid' | 'half-circle' | 'corner';

const STORAGE_KEY = 'shityo.custom-projects.v1';
const MAX_PROJECTS = 50;
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
		return piece;
	});
	return structuredClone(project);
}

export function loadProjects(): CustomProject[] {
	try {
		const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		if (!Array.isArray(raw)) return [];
		return raw
			.map((item) => {
				try {
					return validateProject(item);
				} catch {
					return null;
				}
			})
			.filter((item): item is CustomProject => item !== null);
	} catch {
		return [];
	}
}

export function saveProject(project: CustomProject): CustomProject {
	const valid = validateProject(project);
	const all = loadProjects();
	const next = [valid, ...all.filter((item) => item.id !== valid.id)].slice(0, MAX_PROJECTS);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	return valid;
}

export function deleteProject(id: string): void {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(loadProjects().filter((item) => item.id !== id))
	);
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
		internal_lines: piece.internal_lines
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
