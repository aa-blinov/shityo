"""Общие примитивы построения: симметричные детали, зерно, надсечки.

Правило раскладки, которому подчинены все конструкции:

    ширина детали, разложенной от центра до бокового шва,
    равна (обхват + прибавка) / 4.

Деталь передней или задней панели рисуется от центра (сгиб) до бокового
шва с одной стороны; полная ширина детали вдвое больше. Поэтому:

- футболка и рубашка: полная ширина панели = (обхват груди + прибавка) / 2,
  и обе панели вместе дают ровно обхват с прибавкой;
- брюки: одна штанина закрывает четверть обхвата, две штанины - половину;
- юбка: полная ширина полотнища = (обхват талии + прибавка) / 2.

Это правило проверяется тестом на сходимость обхвата, а не только
на формулы.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import Piece, notch


def quarter(girth: float, ease: float) -> float:
    """Ширина от центра до бокового шва: четверть обхвата с прибавкой."""
    return (girth + ease) / 4.0


def half(girth: float, ease: float) -> float:
    """Полная ширина панели: половина обхвата с прибавкой."""
    return (girth + ease) / 2.0


def symmetric(right_half: list[Point]) -> list[Point]:
    """Собрать симметричную деталь из правой половины.

    right_half идёт от верхней центральной точки к нижней центральной
    точке по правому краю. Зеркальная половина добавляется в обратном
    порядке, поэтому контур детали замкнут и симметричен.
    """
    if len(right_half) < 2:
        return list(right_half)
    mirrored = [Point(-p.x, p.y) for p in reversed(right_half[1:-1])]
    # Контур замыкается явно: экспорт и проверка самопересечений требуют
    # совпадения первой и последней точки.
    return list(right_half) + mirrored + [right_half[0]]


def grainline_vertical(x: float, y1: float, y2: float) -> tuple[Point, Point]:
    return Point(x, y1), Point(x, y2)


def grainline_horizontal(y: float, x1: float, x2: float) -> tuple[Point, Point]:
    return Point(x1, y), Point(x2, y)


def fold_line(x1: float, y1: float, x2: float, y2: float) -> dict:
    return {"type": "fold", "points": [Point(x1, y1), Point(x2, y2)]}


def dart_line(base: Point, tip: Point, label: str = "вытачка") -> dict:
    return {"type": "dart", "points": [base, tip], "label": label}


def side_notches(piece_side: Point, label: str) -> dict:
    return notch(piece_side, label)


def fit_multiplier(fit: str) -> float:
    """Множитель прибавок по посадке."""
    return {"slim": 0.55, "regular": 1.0, "loose": 1.7, "oversize": 2.4}.get(fit, 1.0)


def overrides_of(params: dict) -> dict[str, float]:
    """Переопределения точек чертежа из редактора: имя точки -> значение в см.

    Редактор двигает ключевые точки лекала (плечевая точка, глубина проймы),
    и чертеж должен уважать эти значения, а не считать их заново от мерок.
    """
    raw = params.get("overrides")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, float] = {}
    for key, value in raw.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        out[str(key)] = float(value)
    return out


def build_piece(
    piece_id: str,
    name: str,
    outline: list[Point],
    *,
    grainline: tuple[Point, Point] | None = None,
    seam_allowance: float = 10.0,
    notches: list[dict] | None = None,
    internal_lines: list[dict] | None = None,
    cut: int = 1,
    mirrored: bool = False,
    girth_cm: float = 0.0,
    seam_edges: list[dict] | None = None,
) -> Piece:
    return Piece(
        id=piece_id,
        name=name,
        outline=outline,
        seam_allowance=seam_allowance,
        notches=notches or [],
        grainline=grainline,
        internal_lines=internal_lines or [],
        cut=cut,
        mirrored=mirrored,
        girth_cm=girth_cm,
        seam_edges=seam_edges or [],
    )


def body_side(
    bust_width: float,
    waist_width: float,
    hip_width: float,
    armhole_y: float,
    waist_y: float,
    hip_y: float,
    length: float,
) -> list[Point]:
    """Fixed anatomical levels; shortening the garment clips the same side curve."""
    from .base import bezier

    first = bezier(
        (bust_width, armhole_y),
        (bust_width, armhole_y + (waist_y - armhole_y) / 3),
        (waist_width, waist_y - (waist_y - armhole_y) / 3),
        (waist_width, waist_y),
    )
    second = bezier(
        (waist_width, waist_y),
        (waist_width, waist_y + (hip_y - waist_y) / 3),
        (hip_width, hip_y - (hip_y - waist_y) / 3),
        (hip_width, hip_y),
    )
    full = first + second[1:]
    if length > hip_y:
        full.append(Point(hip_width, length))
    result = [full[0]]
    for a, b in zip(full, full[1:]):
        if b.y >= length:
            fraction = (length - a.y) / (b.y - a.y)
            result.append(Point(a.x + (b.x - a.x) * fraction, length))
            break
        result.append(b)
    return result
