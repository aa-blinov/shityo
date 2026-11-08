"""Втачной рукав: окат под пройму, ширина под бицепс.

Правила, общие для футболки, рубашки и пальто:

- концы оката - это точки подмышки рукава. Весь шов от подмышки через
  вершину до подмышки втачивается в пройму, поэтому длина оката считается
  от точки до точки, без участков вне шва;
- длина оката равна длине проймы (перед + спинка) плюс посадка рукава:
  у трикотажа почти ноль, у рубашки 1-2 см, у пальто 3-5 см;
- ширина рукава на уровне подмышки - обхват бицепса с прибавкой; если
  пройма для такой ширины слишком коротка, окат стал бы плоским, и
  построение останавливается с понятной ошибкой;
- длина рукава отсчитывается от вершины оката.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import DraftError, Piece, bezier, to_mm
from .common import build_piece

# Ширина оката не больше этой доли его длины: иначе окат почти плоский.
MAX_CAP_WIDTH_SHARE = 0.88
# Предел для узкой проймы: окат пологий, но рукав ещё налезает на руку.
FLAT_CAP_WIDTH_SHARE = 0.96


def cap_curve(cap_half: float, cap_rise: float) -> list[Point]:
    """Окат: дуга от левой подмышки через вершину к правой.

    Подмышки лежат на y = cap_rise, вершина - на y = -0.4 * cap_rise, так
    что полная высота оката 1.4 * cap_rise. Вершина - точная точка, иначе
    контур проходит по самому себе.
    """
    apex = Point(0.0, -cap_rise * 0.4)
    left = bezier(
        (-cap_half, cap_rise),
        (-cap_half * 0.62, -cap_rise * 0.25),
        (-cap_half * 0.22, -cap_rise * 0.4),
        (apex.x, apex.y),
        segments=12,
    )
    right = bezier(
        (apex.x, apex.y),
        (cap_half * 0.22, -cap_rise * 0.4),
        (cap_half * 0.62, -cap_rise * 0.25),
        (cap_half, cap_rise),
        segments=12,
    )
    return left + right[1:]


def solve_cap_rise(cap_half: float, target_length: float) -> float:
    """Высота оката, при которой длина дуги равна target_length."""
    if cap_half <= 0 or target_length <= cap_half * 2:
        raise DraftError("Длина оката должна быть больше ширины рукава")
    low, high = 0.0, max(cap_half * 2.0, target_length)
    while polyline_length(cap_curve(cap_half, high)) < target_length:
        high *= 2
    rise = 0.0
    for _ in range(60):
        rise = (low + high) / 2.0
        if polyline_length(cap_curve(cap_half, rise)) < target_length:
            low = rise
        else:
            high = rise
    return rise


def sleeve_fits(
    *,
    biceps: float,
    min_ease: float,
    armhole_length: float,
    cap_ease: float,
    share: float = FLAT_CAP_WIDTH_SHARE,
) -> bool:
    """Помещается ли рукав шириной biceps + min_ease в пройму такой длины."""
    return (biceps + min_ease) / 2.0 <= (armhole_length + cap_ease) * share / 2.0


def deepen_for_sleeve(
    depth: float, armhole_length, *, biceps: float, min_ease: float, cap_ease: float
) -> float:
    """Углубить пройму, пока в неё не встанет рукав с полной прибавкой.

    Так поступает конструктор: если рука полная, а пройма по меркам мала,
    пройму опускают, а не сужают рукав. min_ease - прибавка по бицепсу
    изделия; окат при этом сохраняет нормальную высоту. Шаг 1 см, не больше
    20 см.
    """
    for _ in range(20):
        if sleeve_fits(
            biceps=biceps,
            min_ease=min_ease,
            armhole_length=armhole_length(depth),
            cap_ease=cap_ease,
            share=MAX_CAP_WIDTH_SHARE,
        ):
            break
        depth += 1.0
    return depth


def set_in_sleeve(
    *,
    sleeve_length: float,
    biceps: float,
    biceps_ease: float,
    armhole_length: float,
    cap_ease: float,
    hem_narrowing: float,
    cuff_length: float = 0.0,
    min_ease: float = 2.0,
    wrist_girth: float | None = None,
) -> Piece:
    """min_ease - наименьший запас по бицепсу, см: у трикотажа 0, он тянется.

    wrist_girth - обхват низа длинного рукава с прибавкой, см. Короткий
    рукав сужается на hem_narrowing; чем длиннее рукав, тем ближе его низ к
    запястью (от 25 см длины до 55 см - плавный переход), как у настоящей
    руки, которая сужается от бицепса к запястью.
    """
    target = armhole_length + cap_ease
    cap_half = (biceps + biceps_ease) / 2.0
    cap_half = min(cap_half, target * MAX_CAP_WIDTH_SHARE / 2.0)
    needed = (biceps + min_ease) / 2.0
    if cap_half < needed:
        # Пройма мала для руки: окат делается пологим, но рукав не уже
        # руки. Совсем плоский окат не строится.
        cap_half = min(needed, target * FLAT_CAP_WIDTH_SHARE / 2.0)
    if cap_half < needed:
        raise DraftError("Пройма слишком мала для рукава: увеличьте глубину проймы или прибавку")
    cap_rise = solve_cap_rise(cap_half, target)
    cap = cap_curve(cap_half, cap_rise)
    top = cap[len(cap) // 2].y
    # Короче оката с 2 см шва под мышкой втачной рукав не сшить: такая
    # длина доводится до этого минимума.
    hem_y = max(top + sleeve_length, cap_rise + 2.0)
    hem_half = max(cap_half - hem_narrowing, cap_half * 0.6)
    if wrist_girth:
        long_half = min(hem_half, max(wrist_girth / 2.0, cap_half * 0.45))
        share = min(1.0, max(0.0, (sleeve_length - 25.0) / 30.0))
        hem_half += (long_half - hem_half) * share

    points: list[Point] = [
        *cap,
        Point(hem_half, hem_y),
        Point(-hem_half, hem_y),
        cap[0],
    ]
    internal: list[dict] = []
    if cuff_length > 0:
        internal.append(
            {
                "type": "cuff",
                "points": to_mm(
                    [Point(-hem_half, hem_y - cuff_length), Point(hem_half, hem_y - cuff_length)]
                ),
                "label": "манжета",
            }
        )
    return build_piece(
        "sleeve",
        "Рукав",
        to_mm(points),
        grainline=(
            Point(0.0, (cap_rise + 2.0) * 10.0),
            Point(0.0, (hem_y - cuff_length - 3.0) * 10.0),
        ),
        notches=[
            {"x": cap_half * 10.0, "y": cap_rise * 10.0, "label": "подмышка"},
            {"x": hem_half * 10.0, "y": hem_y * 10.0, "label": "манжета" if cuff_length else "низ"},
        ],
        internal_lines=internal,
        cut=2,
        mirrored=False,
        seam_edges=[{"label": "окат", "points": to_mm(cap)}],
    )
