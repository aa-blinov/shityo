"""SVG export of pattern pieces.

The output is a standalone SVG document measured in millimetres: ``width`` and
``height`` carry the ``mm`` unit and the viewBox uses the same millimetre
coordinates, so a viewer prints the pattern at 1:1.

``render_svg`` returns one sheet, which is what a preview needs.
``render_svg_pages`` returns every sheet of a tiled layout, one document per
sheet, for the cases where a piece does not fit the page and has to be cut
into overlapping tiles.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from .layout import Page, Segment, Text, build_page, build_pages

# Stroke widths in millimetres: the cutting line is the dominant one.
STROKE_WIDTHS = {
    "cut": 0.35,
    "seam": 0.2,
    "grain": 0.25,
    "notch": 0.3,
    "internal": 0.2,
    "mark": 0.2,
}

STROKE_COLORS = {
    "cut": "#000000",
    "seam": "#000000",
    "grain": "#000000",
    "notch": "#000000",
    "internal": "#666666",
    "mark": "#999999",
}

DASH_PATTERNS = {
    "seam": "2 1.5",
    "internal": "1.5 1.5",
    "mark": "3 2",
}


def _fmt(value: float) -> str:
    """Format a coordinate without trailing zeros."""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def _segment_markup(segment: Segment) -> str:
    width = STROKE_WIDTHS.get(segment.kind, 0.25)
    color = STROKE_COLORS.get(segment.kind, "#000000")
    dash = DASH_PATTERNS.get(segment.kind) if segment.dash else None
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    # The class names the kind of the line, so that the drawing can be read
    # programmatically: cut, seam, grain, notch, internal, mark.
    return (
        f'<line class="{segment.kind}" x1="{_fmt(segment.p0[0])}" y1="{_fmt(segment.p0[1])}" '
        f'x2="{_fmt(segment.p1[0])}" y2="{_fmt(segment.p1[1])}" '
        f'stroke="{color}" stroke-width="{width}"{dash_attr} />'
    )


def _text_markup(text: Text) -> str:
    anchor = {"start": "start", "middle": "middle", "end": "end"}.get(text.anchor, "start")
    weight = ' font-weight="bold"' if text.bold else ""
    return (
        f'<text x="{_fmt(text.x)}" y="{_fmt(text.y)}" font-family="sans-serif" '
        f'font-size="{_fmt(text.size)}" text-anchor="{anchor}"{weight} '
        f'fill="#000000">{escape(text.content)}</text>'
    )


def _sheet_markup(sheet: Page) -> str:
    """Markup of the content of one sheet."""
    parts = [
        f'<rect x="0" y="0" width="{_fmt(sheet.width)}" height="{_fmt(sheet.height)}" '
        f'fill="none" stroke="#cccccc" stroke-width="0.2" />'
    ]
    for segment in sheet.segments:
        parts.append(_segment_markup(segment))
    for text in sheet.texts:
        parts.append(_text_markup(text))
    return "".join(parts)


def _document(sheet: Page, title: str) -> str:
    """Wrap the content of one sheet into a standalone SVG document."""
    header = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{_fmt(sheet.width)}mm" height="{_fmt(sheet.height)}mm" '
        f'viewBox="0 0 {_fmt(sheet.width)} {_fmt(sheet.height)}">\n'
    )
    if title:
        header += f"<title>{escape(title)}</title>\n"
    return header + _sheet_markup(sheet) + "\n</svg>\n"


def render_svg(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    title: str = "",
) -> str:
    """Render pattern pieces to a standalone one-sheet SVG document.

    The pieces share the sheet; a piece that does not fit is cut off at the
    cell edge, and the cut is marked with a registration tick. Use
    ``render_svg_pages`` to get the tiled layout, where every piece is
    printed in full.
    """
    sheet = build_page(
        pieces,
        page=page,
        orientation=orientation,
        seam_allowance_mm=seam_allowance_mm,
        title=title,
    )
    return _document(sheet, title)


def render_svg_pages(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    title: str = "",
) -> list[str]:
    """Render every sheet of the tiled layout as a separate SVG document."""
    sheets = build_pages(
        pieces,
        page=page,
        orientation=orientation,
        seam_allowance_mm=seam_allowance_mm,
        title=title,
    )
    return [_document(sheet, title) for sheet in sheets]


def render_svg_tiled(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    title: str = "",
) -> str:
    """One SVG document with every sheet of the layout, stacked vertically.

    This is what the user opens from the browser: the whole pattern, cut into
    printable sheets, in a single file that any vector editor can read. A
    single-sheet render would cut the pieces off at the page edge, and a
    pattern with a truncated piece is useless.
    """
    sheets = build_pages(
        pieces,
        page=page,
        orientation=orientation,
        seam_allowance_mm=seam_allowance_mm,
        title=title,
    )
    if not sheets:
        return _document(Page(1.0, 1.0), title)

    width = max(sheet.width for sheet in sheets)
    height = sum(sheet.height for sheet in sheets)

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{_fmt(width)}mm" height="{_fmt(height)}mm" '
        f'viewBox="0 0 {_fmt(width)} {_fmt(height)}">\n'
    ]
    if title:
        parts.append(f"<title>{escape(title)}</title>\n")

    offset_y = 0.0
    for index, sheet in enumerate(sheets, start=1):
        parts.append(f'<g class="sheet" data-sheet="{index}" transform="translate(0 {_fmt(offset_y)})">\n')
        parts.append(_sheet_markup(sheet))
        parts.append("</g>\n")
        offset_y += sheet.height

    parts.append("</svg>\n")
    return "".join(parts)



