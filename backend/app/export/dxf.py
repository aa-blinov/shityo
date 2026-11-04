"""DXF export of pattern pieces.

The DXF is meant to be read by common apparel CAD tools, so it uses the
R2000 (AC1015) header with millimetre units and the layer names that such
tools expect by default:

``CUT``
    cutting contours (the outline grown by the seam allowance)
``SEAM``
    sewing lines (the outline itself)
``GRAINLINE``
    grain direction with arrow heads
``NOTCH``
    notch ticks
``LABEL``
    piece names and cut counts
"""

from __future__ import annotations

import io
import math

import ezdxf
from ezdxf import bbox
from ezdxf.math import Vec3

from .contour import nearest_edge_normal
from .layout import PieceGeometry, build_geometry

LAYER_COLORS = {
    "CUT": 7,
    "SEAM": 3,
    "GRAINLINE": 5,
    "NOTCH": 1,
    "LABEL": 2,
}

# Pieces are placed next to each other in rows of this width (millimetres).
ROW_WIDTH_MM = 800.0
PIECE_GAP_MM = 20.0

NOTCH_HALF_LENGTH_MM = 2.0
GRAIN_ARROW_MM = 4.0
GRAIN_ARROW_HALF_WIDTH_MM = 1.5
TEXT_HEIGHT_MM = 3.0


def _arrange(geometries: list[PieceGeometry]) -> list[tuple[PieceGeometry, tuple[float, float]]]:
    """Place pieces in rows so that they never overlap."""
    placements: list[tuple[PieceGeometry, tuple[float, float]]] = []
    cursor_x = 0.0
    cursor_y = 0.0
    row_height = 0.0
    for geometry in geometries:
        width = geometry.bbox.width
        height = geometry.bbox.height
        if cursor_x > 0 and cursor_x + width > ROW_WIDTH_MM:
            cursor_x = 0.0
            cursor_y += row_height + PIECE_GAP_MM
            row_height = 0.0
        offset = (cursor_x - geometry.bbox.x, cursor_y - geometry.bbox.y2)
        placements.append((geometry, offset))
        cursor_x += width + PIECE_GAP_MM
        row_height = max(row_height, height)
    return placements


def _add_polyline(msp, points, layer: str, close: bool = True) -> None:
    msp.add_lwpolyline(points, format="xy", close=close, dxfattribs={"layer": layer})


def _add_arrow_head(msp, tip, direction, layer: str) -> None:
    dx, dy = direction
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    base = (tip[0] - ux * GRAIN_ARROW_MM, tip[1] - uy * GRAIN_ARROW_MM)
    msp.add_line(
        base,
        (base[0] + px * GRAIN_ARROW_HALF_WIDTH_MM, base[1] + py * GRAIN_ARROW_HALF_WIDTH_MM),
        dxfattribs={"layer": layer},
    )
    msp.add_line(
        base,
        (base[0] - px * GRAIN_ARROW_HALF_WIDTH_MM, base[1] - py * GRAIN_ARROW_HALF_WIDTH_MM),
        dxfattribs={"layer": layer},
    )


def render_dxf(pieces, *, seam_allowance_mm: float | None = None) -> bytes:
    """Render pattern pieces to a DXF document with millimetre units."""
    doc = ezdxf.new("R2000")
    # The labels of the pieces are in Russian, and R2000 has no UTF-8, so the
    # document is written in the Cyrillic code page.
    doc.encoding = "cp1251"
    doc.header["$DWGCODEPAGE"] = "ANSI_1251"
    doc.header["$INSUNITS"] = 4  # millimetres
    doc.header["$MEASUREMENT"] = 1  # metric
    doc.header["$LUNITS"] = 2  # decimal
    doc.header["$LUPREC"] = 4

    for name, color in LAYER_COLORS.items():
        doc.layers.add(name, color=color)

    msp = doc.modelspace()
    geometries = [build_geometry(piece, seam_allowance_mm) for piece in pieces]

    for geometry, offset in _arrange(geometries):
        piece = geometry.piece
        ox, oy = offset

        def shift(point):
            return (point[0] + ox, point[1] + oy)

        cut = [shift(p) for p in geometry.cut]
        outline = [shift(p) for p in geometry.outline]
        if len(cut) >= 3:
            _add_polyline(msp, cut, "CUT")
        if len(outline) >= 3:
            _add_polyline(msp, outline, "SEAM")

        for internal in getattr(piece, "internal_lines", []) or []:
            points = [shift((float(p.x), float(p.y))) for p in (internal.get("points", []) or [])]
            if len(points) >= 2:
                _add_polyline(msp, points, "SEAM", close=False)

        grainline = getattr(piece, "grainline", None)
        if grainline:
            a = shift((float(grainline[0].x), float(grainline[0].y)))
            b = shift((float(grainline[1].x), float(grainline[1].y)))
            msp.add_line(a, b, dxfattribs={"layer": "GRAINLINE"})
            _add_arrow_head(msp, a, (a[0] - b[0], a[1] - b[1]), "GRAINLINE")
            _add_arrow_head(msp, b, (b[0] - a[0], b[1] - a[1]), "GRAINLINE")

        for notch in getattr(piece, "notches", []) or []:
            point = shift((float(notch["x"]), float(notch["y"])))
            normal = nearest_edge_normal(outline, point)
            p0 = (
                point[0] - normal[0] * NOTCH_HALF_LENGTH_MM,
                point[1] - normal[1] * NOTCH_HALF_LENGTH_MM,
            )
            p1 = (
                point[0] + normal[0] * NOTCH_HALF_LENGTH_MM,
                point[1] + normal[1] * NOTCH_HALF_LENGTH_MM,
            )
            msp.add_line(p0, p1, dxfattribs={"layer": "NOTCH"})
            label = str(notch.get("label", "") or "")
            if label:
                msp.add_text(
                    label,
                    height=TEXT_HEIGHT_MM * 0.6,
                    dxfattribs={"layer": "LABEL", "insert": p1},
                )

        name = str(getattr(piece, "name", "") or getattr(piece, "id", "")).strip()
        cut_count = int(getattr(piece, "cut", 1) or 1)
        label_x = geometry.bbox.x + ox
        label_y = geometry.bbox.y + oy - 4.0
        msp.add_text(
            f"{name} - cut {cut_count}",
            height=TEXT_HEIGHT_MM,
            dxfattribs={"layer": "LABEL", "insert": (label_x, label_y)},
        )

    # Границы чертежа: без них файл открывается с пустым зумом, потому что
    # приложения верят заголовку. ezdxf пересчитывает $EXTMIN/$EXTMAX при
    # записи по данным modelspace, а нулевые границы считает «пустыми» и
    # оставляет дефолт 1e20 - поэтому значения кладём и туда, и в заголовок.
    bounds = bbox.extents(msp, fast=True)
    if bounds.has_data:
        extmin = (bounds.extmin.x, bounds.extmin.y)
        extmax = (bounds.extmax.x, bounds.extmax.y)
        doc.header["$EXTMIN"] = (extmin[0], extmin[1], 0.0)
        doc.header["$EXTMAX"] = (extmax[0], extmax[1], 0.0)
        msp.dxf.extmin = Vec3(extmin[0], extmin[1], 0.0)
        msp.dxf.extmax = Vec3(extmax[0], extmax[1], 0.0)
        doc.header["$LIMMIN"] = extmin
        doc.header["$LIMMAX"] = extmax
        msp.dxf.limmin = extmin
        msp.dxf.limmax = extmax

    stream = io.StringIO()
    doc.write(stream)
    # Файл отдаётся байтами в той же кодовой странице, что объявлена в
    # заголовке. Без этого FastAPI закодил бы строку в UTF-8, а CAD, читая
    # файл по $DWGCODEPAGE, показал бы русские подписи нечитаемыми.
    return doc.encode(stream.getvalue())
