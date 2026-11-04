import type { BBox, Piece, Point } from './types';

export const MM_PER_CM = 10;

/** Build an SVG path `d` attribute from a list of points. */
export function pathFromPoints(points: readonly Point[], close = true): string {
	if (points.length === 0) return '';
	const head = points[0];
	let d = `M ${round(head.x)} ${round(head.y)}`;
	for (let i = 1; i < points.length; i++) {
		d += ` L ${round(points[i].x)} ${round(points[i].y)}`;
	}
	return close ? `${d} Z` : d;
}

/** Round to sub-millimetre precision: SVG strings stay short but exact enough. */
export function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function bboxOfPoints(points: readonly Point[]): BBox {
	if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBBox(boxes: readonly BBox[]): BBox {
	if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const b of boxes) {
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.width);
		maxY = Math.max(maxY, b.y + b.height);
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Axis-aligned viewBox string covering every piece, with a margin in mm. */
export function viewBoxFor(pieces: readonly Piece[], marginMm = 40): string {
	const box = unionBBox(pieces.map((p) => p.bbox));
	const x = box.x - marginMm;
	const y = box.y - marginMm;
	const width = Math.max(box.width + marginMm * 2, 1);
	const height = Math.max(box.height + marginMm * 2, 1);
	return `${round(x)} ${round(y)} ${round(width)} ${round(height)}`;
}

/** Convert millimetres to centimetres. */
export function mmToCm(mm: number): number {
	return mm / MM_PER_CM;
}

/** Format a millimetre value as a centimetre string, e.g. 720 -> "72". */
export function formatMmAsCm(mm: number, digits = 1): string {
	return mmToCm(mm).toFixed(digits).replace(/\.0+$/, '');
}

/** Format a square-millimetre area as centimetres squared. */
export function formatAreaAsCm2(mm2: number, digits = 1): string {
	return (mm2 / (MM_PER_CM * MM_PER_CM)).toFixed(digits);
}

export function polygonArea(points: readonly Point[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.y - b.x * a.y;
	}
	return Math.abs(sum) / 2;
}

export function centroid(points: readonly Point[]): Point {
	if (points.length === 0) return { x: 0, y: 0 };
	let x = 0;
	let y = 0;
	for (const p of points) {
		x += p.x;
		y += p.y;
	}
	return { x: x / points.length, y: y / points.length };
}

/**
 * Offset a closed polygon outwards by `distance` using per-edge normals and
 * miter joins. Concave corners are clamped so the offset never self-intersects
 * into the interior. Good enough for a visual seam-allowance preview.
 */
export function offsetPolygon(points: readonly Point[], distance: number): Point[] {
	const n = points.length;
	if (n < 3 || distance === 0) return points.map((p) => ({ ...p }));

	// Signed area decides the outward direction of the edge normals.
	let signed = 0;
	for (let i = 0; i < n; i++) {
		const a = points[i];
		const b = points[(i + 1) % n];
		signed += a.x * b.y - b.x * a.y;
	}
	const sign = signed >= 0 ? 1 : -1;

	const normals: Point[] = [];
	for (let i = 0; i < n; i++) {
		const a = points[i];
		const b = points[(i + 1) % n];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		normals.push({ x: (dy / len) * sign, y: (-dx / len) * sign });
	}

	const out: Point[] = [];
	for (let i = 0; i < n; i++) {
		const prev = normals[(i - 1 + n) % n];
		const next = normals[i];
		let mx = prev.x + next.x;
		let my = prev.y + next.y;
		const mLen = Math.hypot(mx, my);
		if (mLen < 1e-9) {
			mx = next.x;
			my = next.y;
		} else {
			mx /= mLen;
			my /= mLen;
		}
		// Miter scale; clamped so sharp corners do not shoot away.
		const cosHalf = Math.max(Math.abs(mx * next.x + my * next.y), 0.35);
		const scale = Math.min(1 / cosHalf, 3);
		out.push({
			x: points[i].x + mx * distance * scale,
			y: points[i].y + my * distance * scale
		});
	}
	return out;
}

export interface NotchTick {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Notch marks are short ticks perpendicular to the contour they sit on.
 * The direction is derived from the closest outline edge.
 */
export function notchTicks(piece: Piece, lengthMm = 12): NotchTick[] {
	const outline = piece.outline;
	if (outline.length < 2) return [];
	return piece.notches.map((notch) => {
		const { nx, ny } = nearestEdgeNormal(outline, notch.x, notch.y);
		return {
			x1: notch.x - nx * (lengthMm / 2),
			y1: notch.y - ny * (lengthMm / 2),
			x2: notch.x + nx * (lengthMm / 2),
			y2: notch.y + ny * (lengthMm / 2)
		};
	});
}

function nearestEdgeNormal(points: readonly Point[], x: number, y: number) {
	let best = { d2: Infinity, nx: 0, ny: -1 };
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy || 1;
		let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const px = a.x + dx * t;
		const py = a.y + dy * t;
		const d2 = (px - x) ** 2 + (py - y) ** 2;
		if (d2 < best.d2) {
			const len = Math.sqrt(len2);
			// Outward normal for a clockwise (screen-space) contour.
			best = { d2, nx: dy / len, ny: -dx / len };
		}
	}
	return { nx: best.nx, ny: best.ny };
}

/**
 * Darts come from the API as two points (base on the seam, tip inside the
 * piece). A dart is drawn as a filled triangle: the base point plus a second
 * base point on the seam, closed by the tip.
 */
export function dartTriangle(base: Point, tip: Point, baseWidthMm = 40): Point[] {
	const dx = tip.x - base.x;
	const dy = tip.y - base.y;
	const len = Math.hypot(dx, dy) || 1;
	// Perpendicular to the dart axis, scaled to a plausible leg length.
	const px = (-dy / len) * (baseWidthMm / 2);
	const py = (dx / len) * (baseWidthMm / 2);
	return [
		{ x: base.x - px, y: base.y - py },
		{ x: base.x + px, y: base.y + py },
		tip
	];
}

/** Arrow head triangle points for a grainline end. */
export function arrowHead(x: number, y: number, dx: number, dy: number, size = 14): Point[] {
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	return [
		{ x: x + ux * size, y: y + uy * size },
		{ x: x + px * (size / 3), y: y + py * (size / 3) },
		{ x: x - px * (size / 3), y: y - py * (size / 3) }
	];
}

/** Translate a piece outline set by an offset (used for piece layout). */
export function translatePoints(points: readonly Point[], dx: number, dy: number): Point[] {
	return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Scale factor to fit `box` inside a viewport of the given pixel size. */
export function fitScale(box: BBox, viewportW: number, viewportH: number): number {
	if (box.width <= 0 || box.height <= 0) return 1;
	return Math.min(viewportW / box.width, viewportH / box.height);
}

export interface PlacedPiece {
	piece: Piece;
	/** Offset applied to the piece's own coordinates to place it on the sheet. */
	offset: Point;
	/** Bounding box of the placed piece, in sheet coordinates. */
	bbox: BBox;
}

/**
 * Arrange pieces in a grid on the sheet.
 *
 * The API returns each piece in its own local coordinate system, so pieces
 * have to be placed side by side before they can be drawn together.
 */
export function layoutPieces(pieces: readonly Piece[], gapMm = 60, maxColumns = 3): PlacedPiece[] {
	const columns = Math.max(1, Math.min(maxColumns, pieces.length));
	const rows: number[][] = [];
	for (let i = 0; i < pieces.length; i += columns) {
		rows.push(Array.from({ length: columns }, (_, c) => i + c).filter((idx) => idx < pieces.length));
	}

	const placed: PlacedPiece[] = [];
	let rowY = 0;
	for (const row of rows) {
		let rowHeight = 0;
		let colX = 0;
		for (const index of row) {
			const piece = pieces[index];
			placed.push({
				piece,
				offset: { x: colX - piece.bbox.x, y: rowY - piece.bbox.y },
				bbox: {
					x: colX,
					y: rowY,
					width: piece.bbox.width,
					height: piece.bbox.height
				}
			});
			rowHeight = Math.max(rowHeight, piece.bbox.height);
			colX += piece.bbox.width + gapMm;
		}
		rowY += rowHeight + gapMm;
	}
	return placed;
}
