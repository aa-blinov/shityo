"""Page layout shared by the SVG and PDF exporters.

Both formats need the same decisions: which piece goes where, what is drawn
for each piece and how a piece that does not fit the sheet is cut. Keeping
that logic here means the two renderers only differ in how they emit
primitives.

Draft geometry and page coordinates both use millimetres with Y pointing
downwards. Every piece is therefore first mapped into a local box whose origin
is the top left corner of its bounding box, and only then translated onto the
sheet.

Two layouts exist:

``build_page``
    one sheet with every piece; a piece that reaches beyond the printable area
    is cut off at the page edge and the cut is marked, so the drawing still
    shows where the piece continues.
``build_pages``
    a tiled layout: a piece larger than the printable area is split into
    overlapping tiles, one per sheet, and the overlap band is marked so that
    the tiles can be stacked back together.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .contour import (
    Rect,
    bbox_of,
    clip_polyline,
    nearest_edge_normal,
    offset_outward,
    ring_to_polyline,
    to_xy_list,
)

# Sheet sizes in millimetres, given as width x height in landscape orientation.
PAGE_SIZES: dict[str, tuple[float, float]] = {
    "A4": (297.0, 210.0),
    "A3": (420.0, 297.0),
    "A2": (594.0, 420.0),
    "A1": (841.0, 594.0),
    "A0": (1189.0, 841.0),
    "LETTER": (279.4, 215.9),
    "LEGAL": (355.6, 215.9),
}

MARGIN_MM = 10.0
# A piece that does not fit the sheet is cut into tiles that overlap, so that a
# cut line continues across the page break. The tiles are spread evenly over
# the piece, so the overlap is at least this wide.
MIN_OVERLAP_MM = 8.0
PIECE_GAP_MM = 10.0

LABEL_SIZE_MM = 3.2
SMALL_SIZE_MM = 2.4
GRAIN_ARROW_MM = 3.0
GRAIN_ARROW_HALF_WIDTH_MM = 1.0
NOTCH_HALF_LENGTH_MM = 2.0
# How far outside a tile a notch may lie and still be drawn on the tile edge.
NOTCH_EDGE_TOLERANCE_MM = 6.0
# Half length of the registration tick drawn where a piece is cut by the page.
CUT_MARK_MM = 2.5


@dataclass
class Segment:
    """A straight primitive in page coordinates (millimetres, Y downwards)."""

    p0: tuple[float, float]
    p1: tuple[float, float]
    kind: str = "cut"
    dash: bool = False


@dataclass
class Text:
    """A label in page coordinates."""

    x: float
    y: float
    content: str
    size: float = LABEL_SIZE_MM
    anchor: str = "start"
    bold: bool = False


@dataclass
class Page:
    width: float
    height: float
    segments: list[Segment] = field(default_factory=list)
    texts: list[Text] = field(default_factory=list)
    meta: dict = field(default_factory=dict)


@dataclass
class PieceGeometry:
    """Everything the renderers need to know about one piece."""

    piece: object
    outline: list[tuple[float, float]]
    cut: list[tuple[float, float]]
    bbox: Rect
    label: str

    def to_local(self, point: tuple[float, float]) -> tuple[float, float]:
        """Map a point of the piece into its local box (origin top left)."""
        return (point[0] - self.bbox.x, point[1] - self.bbox.y)


def page_size(page: str, orientation: str) -> tuple[float, float]:
    """Sheet size in millimetres for a page name and orientation."""
    key = (page or "A4").upper()
    if key not in PAGE_SIZES:
        raise ValueError(f"unknown page size: {page!r}")
    width, height = PAGE_SIZES[key]
    if orientation.lower() not in ("portrait", "landscape"):
        raise ValueError(f"unknown orientation: {orientation!r}")
    if orientation.lower() == "portrait":
        width, height = height, width
    return width, height


def printable_area(page_w: float, page_h: float) -> Rect:
    """The area of the sheet that carries the drawing."""
    return Rect(MARGIN_MM, MARGIN_MM, page_w - 2 * MARGIN_MM, page_h - 2 * MARGIN_MM)


def _piece_label(piece) -> str:
    name = str(getattr(piece, "name", "") or getattr(piece, "id", "")).strip()
    cut = int(getattr(piece, "cut", 1) or 1)
    return f"{name} - cut {cut}"


def build_geometry(piece, seam_allowance_mm: float | None) -> PieceGeometry:
    """Normalise a piece into contours and a label."""
    outline = ring_to_polyline(getattr(piece, "outline", []) or [])
    allowance = getattr(piece, "seam_allowance", 10.0) if seam_allowance_mm is None else seam_allowance_mm
    cut = offset_outward(outline, float(allowance))
    if len(cut) > 1 and cut[0] == cut[-1]:
        cut = cut[:-1]
    box = bbox_of(cut if cut else outline)
    return PieceGeometry(
        piece=piece,
        outline=outline,
        cut=cut,
        bbox=box,
        label=_piece_label(piece),
    )


def _arrow_head(
    tip: tuple[float, float], direction: tuple[float, float]
) -> list[tuple[float, float]]:
    """Triangle arrow head pointing along ``direction`` with its tip at ``tip``."""
    dx, dy = direction
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    base = (tip[0] - ux * GRAIN_ARROW_MM, tip[1] - uy * GRAIN_ARROW_MM)
    return [
        tip,
        (base[0] + px * GRAIN_ARROW_HALF_WIDTH_MM, base[1] + py * GRAIN_ARROW_HALF_WIDTH_MM),
        (base[0] - px * GRAIN_ARROW_HALF_WIDTH_MM, base[1] - py * GRAIN_ARROW_HALF_WIDTH_MM),
    ]


def _piece_primitives(
    geometry: PieceGeometry,
    clip: Rect | None,
) -> tuple[list[Segment], list[Text]]:
    """Primitives of one piece in local coordinates (Y downwards)."""
    piece = geometry.piece
    segments: list[Segment] = []
    texts: list[Text] = []

    def add_polyline(points, kind: str, dash: bool = False, close: bool = False) -> None:
        ring = [geometry.to_local(p) for p in points]
        if close and len(ring) > 2 and ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        if clip is not None:
            for part in clip_polyline(ring, clip):
                for a, b in zip(part, part[1:]):
                    segments.append(Segment(a, b, kind, dash))
            return
        for a, b in zip(ring, ring[1:]):
            segments.append(Segment(a, b, kind, dash))

    add_polyline(geometry.cut, "cut", close=True)
    add_polyline(geometry.outline, "seam", dash=True, close=True)

    for internal in getattr(piece, "internal_lines", []) or []:
        pts = to_xy_list(internal.get("points", []) or [])
        if len(pts) >= 2:
            add_polyline(pts, "internal", dash=True)

    grainline = getattr(piece, "grainline", None)
    if grainline:
        a = geometry.to_local((float(grainline[0].x), float(grainline[0].y)))
        b = geometry.to_local((float(grainline[1].x), float(grainline[1].y)))
        if clip is None:
            segments.append(Segment(a, b, "grain"))
        else:
            # The grainline is drawn wherever it crosses the visible window,
            # even if both of its ends are cut off.
            for part in clip_polyline([a, b], clip):
                for start, end in zip(part, part[1:]):
                    segments.append(Segment(start, end, "grain"))
        for tip, direction in (
            (a, (a[0] - b[0], a[1] - b[1])),
            (b, (b[0] - a[0], b[1] - a[1])),
        ):
            if clip is not None and not clip.contains(tip, tol=1.0):
                continue
            head = _arrow_head(tip, direction)
            # Arrow vertices are already local: converting them a second time
            # moves the arrows away from their grainline.
            for start, end in zip(head, head[1:] + head[:1]):
                if clip is None:
                    segments.append(Segment(start, end, "grain"))
                else:
                    for part in clip_polyline([start, end], clip):
                        for a, b in zip(part, part[1:]):
                            segments.append(Segment(a, b, "grain"))

    for notch in getattr(piece, "notches", []) or []:
        point = geometry.to_local((float(notch["x"]), float(notch["y"])))
        normal = nearest_edge_normal(
            [geometry.to_local(p) for p in geometry.outline], point
        )
        # A notch that falls just outside the tile still belongs to the seam
        # the tile shows: it is drawn at the edge of the tile instead of being
        # lost, so that the notch can be cut on the right sheet.
        anchor = point
        if clip is not None and not clip.contains(point):
            anchor = _clamp_to_rect(point, clip)
            if _distance_to_rect(point, clip) > NOTCH_EDGE_TOLERANCE_MM:
                continue
            normal = _normal_at(
                [geometry.to_local(p) for p in geometry.outline], anchor
            )
        p0 = (
            anchor[0] - normal[0] * NOTCH_HALF_LENGTH_MM,
            anchor[1] - normal[1] * NOTCH_HALF_LENGTH_MM,
        )
        p1 = (
            anchor[0] + normal[0] * NOTCH_HALF_LENGTH_MM,
            anchor[1] + normal[1] * NOTCH_HALF_LENGTH_MM,
        )
        segments.append(Segment(p0, p1, "notch"))
        label = str(notch.get("label", "") or "")
        if label:
            texts.append(
                Text(
                    x=anchor[0] + normal[0] * (NOTCH_HALF_LENGTH_MM + 0.8),
                    y=anchor[1] + normal[1] * (NOTCH_HALF_LENGTH_MM + 0.8),
                    content=label,
                    size=SMALL_SIZE_MM,
                )
            )

    return segments, texts


def _clamp_to_rect(point: tuple[float, float], rect: Rect) -> tuple[float, float]:
    """Nearest point of the rectangle to the given point."""
    x = min(max(point[0], rect.x1), rect.x2)
    y = min(max(point[1], rect.y1), rect.y2)
    return (x, y)


def _distance_to_rect(point: tuple[float, float], rect: Rect) -> float:
    """Distance from a point to the rectangle."""
    clamped = _clamp_to_rect(point, rect)
    return math.hypot(point[0] - clamped[0], point[1] - clamped[1])


def _normal_at(
    contour: list[tuple[float, float]],
    point: tuple[float, float],
) -> tuple[float, float]:
    """Unit normal of the contour at the point closest to ``point``."""
    best: tuple[float, tuple[float, float]] | None = None
    for a, b in zip(contour, contour[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length_sq = dx * dx + dy * dy
        if length_sq < 1e-9:
            continue
        t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length_sq
        t = max(0.0, min(1.0, t))
        px, py = a[0] + t * dx, a[1] + t * dy
        distance = math.hypot(point[0] - px, point[1] - py)
        if best is None or distance < best[0]:
            length = length_sq**0.5
            best = (distance, (-dy / length, dx / length))
    if best is None:
        return (0.0, 1.0)
    return best[1]


def _shift_segments(segments: list[Segment], dx: float, dy: float) -> None:
    for segment in segments:
        segment.p0 = (segment.p0[0] + dx, segment.p0[1] + dy)
        segment.p1 = (segment.p1[0] + dx, segment.p1[1] + dy)


def _shift_texts(texts: list[Text], dx: float, dy: float) -> None:
    for text in texts:
        text.x += dx
        text.y += dy


def _edge_crossings(
    points: list[tuple[float, float]],
    rect: Rect,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Where a polyline crosses the border of a rectangle.

    Each crossing is returned together with the direction of the border, so
    that a registration tick can be drawn across the cut.
    """
    crossings: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for a, b in zip(points, points[1:]):
        for axis, value in (("x", rect.x1), ("x", rect.x2), ("y", rect.y1), ("y", rect.y2)):
            if axis == "x":
                if (a[0] - value) * (b[0] - value) > 0:
                    continue
                if abs(b[0] - a[0]) < 1e-12:
                    continue
                t = (value - a[0]) / (b[0] - a[0])
                if not 0.0 <= t <= 1.0:
                    continue
                y = a[1] + t * (b[1] - a[1])
                if not rect.y1 - 1e-6 <= y <= rect.y2 + 1e-6:
                    continue
                crossings.append(((value, y), (0.0, 1.0)))
            else:
                if (a[1] - value) * (b[1] - value) > 0:
                    continue
                if abs(b[1] - a[1]) < 1e-12:
                    continue
                t = (value - a[1]) / (b[1] - a[1])
                if not 0.0 <= t <= 1.0:
                    continue
                x = a[0] + t * (b[0] - a[0])
                if not rect.x1 - 1e-6 <= x <= rect.x2 + 1e-6:
                    continue
                crossings.append(((x, value), (1.0, 0.0)))
    return crossings


def _cut_marks(
    geometry: PieceGeometry,
    clip: Rect,
) -> list[Segment]:
    """Registration ticks where the piece is cut by the edge of a tile.

    The ticks are returned in the local coordinates of the piece, so they can
    be shifted together with the rest of the drawing.
    """
    marks: list[Segment] = []
    for contour in (geometry.cut, geometry.outline):
        local = [geometry.to_local(p) for p in contour]
        if len(local) > 2 and local[0] != local[-1]:
            local = local + [local[0]]
        for point, border in _edge_crossings(local, clip):
            nx, ny = border
            marks.append(
                Segment(
                    (point[0] - nx * CUT_MARK_MM, point[1] - ny * CUT_MARK_MM),
                    (point[0] + nx * CUT_MARK_MM, point[1] + ny * CUT_MARK_MM),
                    "mark",
                    False,
                )
            )
    return marks


def _tile_positions(size: float, usable: float) -> list[float]:
    """Offsets of the tiles along one axis.

    The tiles overlap so that a cut line continues across the page break.
    They are spread evenly over the piece, so the last tile ends exactly at
    the edge of the piece instead of leaving a nearly empty page behind.
    """
    if not math.isfinite(size) or not math.isfinite(usable) or size < 0 or usable <= MIN_OVERLAP_MM:
        raise ValueError("invalid tile dimensions")
    if size <= usable + 1e-7:
        return [0.0]
    step = usable - MIN_OVERLAP_MM
    count = math.ceil((size - usable - 1e-7) / step) + 1
    return [index * step for index in range(count)]


def _tile_regions(
    width: float,
    height: float,
    usable_w: float,
    usable_h: float,
) -> list[tuple[Rect, float, float]]:
    """Split a too large piece into overlapping tiles.

    Each tile comes with the width of the overlap band it shares with the
    previous tile, so that the band can be marked exactly.
    """
    xs = _tile_positions(width, usable_w)
    ys = _tile_positions(height, usable_h)
    regions: list[tuple[Rect, float, float]] = []
    for row, y in enumerate(ys):
        overlap_y = (ys[row - 1] + usable_h - y) if row > 0 else 0.0
        for col, x in enumerate(xs):
            overlap_x = (xs[col - 1] + usable_w - x) if col > 0 else 0.0
            regions.append((Rect(x, y, usable_w, usable_h), overlap_x, overlap_y))
    return regions


def _overlap_marks(region: Rect, overlap_x: float, overlap_y: float) -> list[Segment]:
    """Dashed lines that mark the overlap band of a tiled piece."""
    marks: list[Segment] = []
    if overlap_x > 0:
        marks.append(Segment((region.x, region.y), (region.x, region.y + region.height), "mark", True))
        marks.append(
            Segment(
                (region.x + overlap_x, region.y),
                (region.x + overlap_x, region.y + region.height),
                "mark",
                True,
            )
        )
    if overlap_y > 0:
        marks.append(Segment((region.x, region.y), (region.x + region.width, region.y), "mark", True))
        marks.append(
            Segment(
                (region.x, region.y + overlap_y),
                (region.x + region.width, region.y + overlap_y),
                "mark",
                True,
            )
        )
    return marks


def _footer(sheet: Page, page: str, orientation: str, index: int, total: int) -> None:
    sheet.texts.append(
        Text(
            sheet.width - MARGIN_MM,
            sheet.height - MARGIN_MM / 2,
            f"{page.upper()} {orientation} - 1:1 - page {index + 1}/{total}",
            SMALL_SIZE_MM,
            anchor="end",
        )
    )


def _mark_points(geometry: PieceGeometry) -> list[tuple[float, float]]:
    """Local points of the marks that must be visible on the sheet.

    These are the notches, the ends of the grainline and the ends of the
    internal lines: a sheet that cuts a piece off must still show them,
    otherwise the cut piece cannot be identified.
    """
    points: list[tuple[float, float]] = []
    for notch in getattr(geometry.piece, "notches", []) or []:
        points.append(geometry.to_local((float(notch["x"]), float(notch["y"]))))
    grainline = getattr(geometry.piece, "grainline", None)
    if grainline:
        points.append(geometry.to_local((float(grainline[0].x), float(grainline[0].y))))
        points.append(geometry.to_local((float(grainline[1].x), float(grainline[1].y))))
    for internal in getattr(geometry.piece, "internal_lines", []) or []:
        for point in internal.get("points", []) or []:
            points.append(geometry.to_local((float(point.x), float(point.y))))
    return points


def _crop_window(
    geometry: PieceGeometry,
    cell_w: float,
    cell_h: float,
) -> tuple[float, float]:
    """Origin of the visible window in the local coordinates of the piece.

    A piece bigger than its cell can only be shown in part, so the window is
    placed where the drawing is worth looking at: the candidate positions are
    scored by how many marks they show and by how much of the contour falls
    inside them. That keeps the notches and the grainline on the sheet
    whenever the piece is at all close to the cell.
    """
    width = geometry.bbox.width
    height = geometry.bbox.height
    window_w = min(cell_w, width)
    window_h = min(cell_h, height)

    def clamp(value: float, limit: float) -> float:
        return min(max(value, 0.0), max(0.0, limit))

    contour = [geometry.to_local(p) for p in geometry.cut]
    marks = _mark_points(geometry)

    def score(x: float, y: float) -> tuple[int, float, float]:
        """Marks shown, contour length shown, contour length in total."""
        window = Rect(x, y, window_w, window_h)
        shown_marks = sum(1 for point in marks if window.contains(point, tol=1.0))
        shown_contour = 0.0
        for part in clip_polyline(contour, window):
            for a, b in zip(part, part[1:]):
                shown_contour += math.hypot(b[0] - a[0], b[1] - a[1])
        return shown_marks, shown_contour, -shown_marks

    candidates_x = [clamp((width - window_w) / 2, width - window_w)]
    candidates_y = [clamp((height - window_h) / 2, height - window_h)]
    for point in marks:
        candidates_x.append(clamp(point[0] - window_w / 2, width - window_w))
        candidates_y.append(clamp(point[1] - window_h / 2, height - window_h))

    best = (-1, -1.0, -1.0)
    best_window = (candidates_x[0], candidates_y[0])
    for x in candidates_x:
        for y in candidates_y:
            current = score(x, y)
            if current > best:
                best = current
                best_window = (x, y)
    return best_window


def build_page(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    title: str = "",
) -> Page:
    """Lay every piece out on a single sheet.

    The pieces share the sheet in a grid, one cell each. A piece that does not
    fit its cell is cut off, and the cut is marked with a registration tick, so
    the sheet shows where the piece continues. Use ``build_pages`` for the
    tiled layout, where every piece is printed in full.
    """
    page_w, page_h = page_size(page, orientation)
    area = printable_area(page_w, page_h)
    sheet = Page(page_w, page_h)

    geometries = [build_geometry(piece, seam_allowance_mm) for piece in pieces]
    if not geometries:
        if title:
            sheet.texts.append(Text(MARGIN_MM, MARGIN_MM - 4.0, title, LABEL_SIZE_MM, bold=True))
        _footer(sheet, page, orientation, 0, 1)
        return sheet

    columns = max(1, math.ceil(math.sqrt(len(geometries))))
    rows = math.ceil(len(geometries) / columns)
    cell_w = area.width / columns
    cell_h = area.height / rows

    for index, geometry in enumerate(geometries):
        column = index % columns
        row = index // columns
        cell_x = area.x1 + column * cell_w
        cell_y = area.y1 + row * cell_h

        # The visible window of the piece is placed over its marks.
        window_x, window_y = _crop_window(geometry, cell_w, cell_h)
        offset = (cell_x - window_x, cell_y - window_y)
        local_clip = Rect(window_x, window_y, cell_w, cell_h)

        segments, texts = _piece_primitives(geometry, local_clip)
        _shift_segments(segments, *offset)
        _shift_texts(texts, *offset)
        sheet.segments.extend(segments)
        sheet.texts.extend(texts)
        marks = _cut_marks(geometry, local_clip)
        _shift_segments(marks, *offset)
        sheet.segments.extend(marks)
        sheet.texts.append(
            Text(
                cell_x,
                cell_y + cell_h - 1.0,
                geometry.label,
                LABEL_SIZE_MM,
                bold=True,
            )
        )

    if title:
        sheet.texts.append(Text(MARGIN_MM, MARGIN_MM - 4.0, title, LABEL_SIZE_MM, bold=True))
    _footer(sheet, page, orientation, 0, 1)
    return sheet


def build_pages(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    title: str = "",
) -> list[Page]:
    """Lay pieces out on sheets and return the drawing primitives of each sheet.

    A piece that fits the printable area shares a sheet with the other pieces;
    a piece that does not fit gets its own tiles, one per sheet, cut with an
    overlap band.
    """
    pieces = list(pieces)
    if page.upper() == "FULL":
        return _full_sheet(pieces, seam_allowance_mm, title)
    page_w, page_h = page_size(page, orientation)
    area = printable_area(page_w, page_h)
    usable_w = area.width
    usable_h = area.height

    geometries = [build_geometry(piece, seam_allowance_mm) for piece in pieces]

    pages: list[Page] = []
    current = Page(page_w, page_h)
    cursor = (area.x1, area.y1)
    row_height = 0.0
    placed_anything = False

    def flush() -> None:
        nonlocal current, cursor, row_height, placed_anything
        if placed_anything:
            pages.append(current)
        current = Page(page_w, page_h)
        cursor = (area.x1, area.y1)
        row_height = 0.0
        placed_anything = False

    for geometry in geometries:
        width = geometry.bbox.width
        height = geometry.bbox.height

        if width > usable_w or height > usable_h:
            # The piece does not fit on one sheet: give it dedicated tiled pages.
            flush()
            regions = _tile_regions(width, height, usable_w, usable_h)
            columns = len(_tile_positions(width, usable_w))
            rows = len(_tile_positions(height, usable_h))
            for tile_index, (region, overlap_x, overlap_y) in enumerate(regions):
                row, column = divmod(tile_index, columns)
                tile = f"{chr(65 + column)}{row + 1}"
                tiled = Page(page_w, page_h, meta={"piece_ids": [geometry.piece.id], "label": geometry.piece.name, "row": row, "column": column, "rows": rows, "columns": columns, "tile": tile})
                # The visible part of the tile must land in the printable area.
                offset = (area.x1 - region.x, area.y1 - region.y)
                segments, texts = _piece_primitives(geometry, region)
                _shift_segments(segments, *offset)
                _shift_texts(texts, *offset)
                tiled.segments.extend(segments)
                tiled.texts.extend(texts)
                marks = _overlap_marks(region, overlap_x, overlap_y)
                marks += _cut_marks(geometry, region)
                _shift_segments(marks, *offset)
                tiled.segments.extend(marks)
                tiled.texts.append(
                    Text(area.x1, area.y1 - 2.0, f"{geometry.label} - {tile}", LABEL_SIZE_MM, bold=True)
                )
                pages.append(tiled)
            continue

        if cursor[0] + width > area.x2 and cursor[0] > area.x1:
            cursor = (area.x1, cursor[1] + row_height + PIECE_GAP_MM)
            row_height = 0.0
        if cursor[1] + height > area.y2:
            flush()
            cursor = (area.x1, area.y1)

        segments, texts = _piece_primitives(geometry, None)
        _shift_segments(segments, *cursor)
        _shift_texts(texts, *cursor)
        current.segments.extend(segments)
        current.texts.extend(texts)
        current.texts.append(
            Text(cursor[0], cursor[1] - 2.0, geometry.label, LABEL_SIZE_MM, bold=True)
        )
        current.meta.setdefault("piece_ids", []).append(geometry.piece.id)
        placed_anything = True
        cursor = (cursor[0] + width + PIECE_GAP_MM, cursor[1])
        row_height = max(row_height, height)

    flush()

    total = len(pages)
    for index, sheet in enumerate(pages):
        if title:
            sheet.texts.append(Text(MARGIN_MM, MARGIN_MM - 4.0, title, LABEL_SIZE_MM, bold=True))
        _footer(sheet, page, orientation, index, total)
    return pages


def _full_sheet(pieces, seam_allowance_mm, title) -> list[Page]:
    geometries = [build_geometry(piece, seam_allowance_mm) for piece in pieces]
    width = max(900.0, max((g.bbox.width for g in geometries), default=0) + 2*MARGIN_MM)
    sheet = Page(width, 1, meta={"piece_ids": [g.piece.id for g in geometries]})
    x, y, row_height = MARGIN_MM, MARGIN_MM, 0.0
    for geometry in geometries:
        if x > MARGIN_MM and x + geometry.bbox.width > width-MARGIN_MM:
            x=MARGIN_MM; y+=row_height+PIECE_GAP_MM; row_height=0
        segments,texts=_piece_primitives(geometry,None)
        _shift_segments(segments,x,y); _shift_texts(texts,x,y)
        sheet.segments.extend(segments);sheet.texts.extend(texts)
        sheet.texts.append(Text(x,y-2,geometry.label,LABEL_SIZE_MM,bold=True))
        x+=geometry.bbox.width+PIECE_GAP_MM;row_height=max(row_height,geometry.bbox.height)
    sheet.height=y+row_height+MARGIN_MM
    _footer(sheet,"FULL","plotter",0,1)
    return [sheet]


def calibration_sheet(page: str, orientation: str, sheets: list[Page]) -> Page:
    width,height=page_size(page,orientation)
    sheet=Page(width,height,meta={"kind":"calibration","piece_ids":[]})
    sheet.texts.extend([
        Text(10,17,"Проверка масштаба и сборка лекал",5,bold=True),
        Text(10,26,f"{page.upper()} - 100% - 1:1",3.2),
        Text(10,93,"Квадрат 50 x 50 мм",3.2,bold=True),
        Text(80,40,"1. Распечатайте этот лист в масштабе 100%.",3.2),
        Text(80,48,"2. Отключите «Вписать» и «Уменьшить».",3.2),
        Text(80,56,"3. Измерьте обе стороны квадрата: ровно 50 мм.",3.2),
        Text(80,70,f"Листов с деталями: {len(sheets)}",3.2,bold=True),
        Text(80,78,"Совмещайте буквы и цифры плиток. Нахлёст 8 мм.",3.2),
        Text(10,110,"Схема склейки (числа - страницы PDF)",3.5,bold=True),
    ])
    corners=[(10,35),(60,35),(60,85),(10,85),(10,35)]
    sheet.segments.extend(Segment(a,b,"cut") for a,b in zip(corners,corners[1:]))
    x,y=10.0,120.0;row_height=0.0
    groups:dict[str,list[tuple[int,Page]]]={}
    for index,part in enumerate(sheets,start=2):
        for piece_id in part.meta.get("piece_ids",[]):groups.setdefault(piece_id,[]).append((index,part))
    for piece_id,group in groups.items():
        columns=max(p.meta.get("columns",1) for _,p in group)
        rows=max(p.meta.get("rows",1) for _,p in group)
        block_width=max(48,columns*7+8)
        block_height=rows*7+13
        if x+block_width>width-10:x=10;y+=row_height+8;row_height=0
        sheet.texts.append(Text(x,y,group[0][1].meta.get("label",piece_id),3.0,bold=True))
        for index,part in group:
            px=x+part.meta.get("column",0)*7;py=y+4+part.meta.get("row",0)*7
            rect=[(px,py),(px+7,py),(px+7,py+7),(px,py+7),(px,py)]
            sheet.segments.extend(Segment(a,b,"mark") for a,b in zip(rect,rect[1:]))
            sheet.texts.append(Text(px+3.5,py+4.5,str(index),2.3,anchor="middle"))
        x+=block_width;row_height=max(row_height,block_height)
    _footer(sheet,page,orientation,0,len(sheets)+1)
    return sheet


def print_pages(pieces, *, page="A4", orientation="landscape", seam_allowance_mm=None, calibration=False) -> list[Page]:
    sheets=build_pages(pieces,page=page,orientation=orientation,seam_allowance_mm=seam_allowance_mm)
    if calibration and page.upper()!="FULL":
        sheets.insert(0,calibration_sheet(page,orientation,sheets))
        # Replace page numbers in the footer after adding the calibration sheet.
        for index,sheet in enumerate(sheets):
            sheet.texts=[t for t in sheet.texts if " - page " not in t.content]
            _footer(sheet,page,orientation,index,len(sheets))
    return sheets
