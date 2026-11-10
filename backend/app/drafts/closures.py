"""Застёжки и пояса: без них изделие не надеть.

Юбку и платье-футляр кроят со сгибом по середине, поэтому застёжка - в
левом боковом шве (на лекале - сторона x > 0): потайная молния 18 см у
юбки, 40 см у платья от проймы вниз. У юбки и брюк - притачной пояс с
заходом под пуговицу; у мужских брюк - гульфик (откоска и полугульфик)
под молнию.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import Piece, bezier, to_mm
from .common import build_piece, symmetric

SKIRT_ZIP = 18.0
DRESS_ZIP = 40.0
WAISTBAND_HEIGHT = {"skirt": 3.5, "trousers": 4.0}
WAISTBAND_OVERLAP = {"skirt": 3.0, "trousers": 4.0}
FLY_WIDTH = 4.5


def side_point(piece: Piece, y_mm: float) -> Point | None:
    """Точка бокового среза детали (сторона x > 0) на высоте y, мм."""
    best: Point | None = None
    pts = piece.outline
    for a, b in zip(pts, pts[1:]):
        if (a.y - y_mm) * (b.y - y_mm) > 0 or a.y == b.y:
            continue
        t = (y_mm - a.y) / (b.y - a.y)
        x = a.x + (b.x - a.x) * t
        if x > 0 and (best is None or x > best.x):
            best = Point(x, y_mm)
    return best


def _notch(piece: Piece, y_mm: float, label: str) -> None:
    point = side_point(piece, y_mm)
    if point is not None:
        piece.notches.append({"x": point.x, "y": point.y, "label": label})


def waistband(model: str, girth_cm: float) -> Piece:
    """Пояс: длина по талии изделия плюс заход, складывается вдвое."""
    height = WAISTBAND_HEIGHT[model]
    overlap = WAISTBAND_OVERLAP[model]
    half = (girth_cm + overlap) / 2.0
    right = [Point(0.0, 0.0), Point(half, 0.0), Point(half, height * 2.0), Point(0.0, height * 2.0)]
    piece = build_piece(
        "waistband",
        "Пояс",
        to_mm(symmetric(right)),
        grainline=(Point(-half * 8.0, height * 10.0), Point(half * 8.0, height * 10.0)),
        notches=[
            {"x": 0.0, "y": 0.0, "label": "середина"},
            {"x": (half - overlap) * 10.0, "y": 0.0, "label": "заход"},
            {"x": (half - overlap / 2.0) * 10.0, "y": height * 5.0, "label": "петля"},
        ],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(-half, height), Point(half, height)]),
                "label": "сгиб пояса",
            }
        ],
        cut=1,
        # Пояс - не панель изделия: в сумме обхватов кроя он не участвует.
        girth_cm=0.0,
        seam_edges=[
            {"label": "пояс", "points": to_mm([Point(-half, 0.0), Point(half - overlap, 0.0)])}
        ],
    )
    piece.grain_axis = "width"
    return piece


def skirt_closure(front: Piece, back: Piece) -> list[Piece]:
    top = min(p.y for p in front.outline)
    for piece in (front, back):
        _notch(piece, top + SKIRT_ZIP * 10.0, "низ молнии")
    return [waistband("skirt", front.girth_cm + back.girth_cm)]


def dress_closure(front: Piece, back: Piece) -> None:
    """Потайная молния в левом боковом шве платья от проймы вниз."""
    armhole = {
        p.id: next((n for n in p.notches if n["label"] == "пройма"), None) for p in (front, back)
    }
    if not armhole["front"] or not armhole["back"]:
        return
    # Перед длиннее спинки на баланс: ниже нагрудной вытачки его бок опущен.
    balance = max(p.y for p in front.outline) - max(p.y for p in back.outline)
    start_back = armhole["back"]["y"] + 20.0
    start_front = armhole["front"]["y"] + 20.0
    _notch(back, start_back, "молния")
    _notch(front, start_front, "молния")
    _notch(back, start_back + DRESS_ZIP * 10.0, "низ молнии")
    _notch(front, start_back + DRESS_ZIP * 10.0 + balance, "низ молнии")


def fly(length_cm: float) -> Piece:
    """Гульфик: откоска и полугульфик кроятся одной деталью парой."""
    width = FLY_WIDTH
    bottom = bezier(
        (width, length_cm - 3.0),
        (width, length_cm),
        (width * 0.4, length_cm),
        (0.0, length_cm),
        segments=8,
    )
    outline = [Point(0.0, 0.0), Point(width, 0.0), *bottom, Point(0.0, 0.0)]
    return build_piece(
        "fly",
        "Гульфик",
        to_mm(outline),
        grainline=(Point(width * 5.0, 20.0), Point(width * 5.0, (length_cm - 4.0) * 10.0)),
        notches=[{"x": 0.0, "y": (length_cm - 3.0) * 10.0, "label": "низ молнии"}],
        cut=2,
        seam_edges=[
            {"label": "средний", "points": to_mm([Point(0.0, 0.0), Point(0.0, length_cm)])}
        ],
    )
