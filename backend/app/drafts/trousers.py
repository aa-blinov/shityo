"""Брюки: передняя и задняя половинки.

Методика ЕМКО СЭВ в упрощённом виде:

- ширина половинки на линии бёдер - четверть обхвата бёдер с прибавкой,
  поделённая между передом и спинкой (спинка шире: ягодицы);
- линия бёдер - две трети глубины сидения от талии, колено - мерка «длина
  до колена» от талии;
- разница талии и бёдер делится на боковой шов (одинаково у переда и
  спинки, иначе швы не сойдутся), средний шов и вытачку; у спинки вытачка
  глубже и средний шов поднят, чтобы брюки не тянули при посадке;
- шаг: у переда 0,1 полуобхвата бёдер, у спинки - в полтора раза больше;
- колено переда стоит по линии стрелки посередине; колено спинки сдвинуто
  так, что бок уходит внутрь на ту же величину, что и у переда - иначе
  боковые швы разной длины;
- точка шага спинки опускается ровно настолько, чтобы шаговые швы переда
  и спинки были одной длины;
- у мужских брюк на переде размечается гульфик.

Раскладка половинки (сантиметры черчения): x = 0 - боковой шов, верх -
пояс, справа - средний шов и шаг; каждая деталь кроится парой (cut = 2).
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import DraftError, Piece, bezier, require, to_mm
from .closures import fly, waistband
from .common import build_piece, fit_multiplier, rise_top

# Доля ширины на линии бёдер, приходящаяся на спинку.
LEG_BALANCE_BACK = 0.55
# Прибавка к обхвату колена: колено сгибается.
KNEE_EASE = 8.0
# Линия бёдер: доля глубины сидения от талии.
HIP_LINE_SHARE = 2.0 / 3.0
# Шаг переда и спинки: доля полуобхвата бёдер с прибавкой.
FRONT_CROTCH_SHARE = 0.1
BACK_CROTCH_SHARE = 0.15
# Прибавка к глубине сидения: линия шага ниже тела.
RISE_EASE = 1.5
# Подъём середины спинки у пояса.
BACK_RISE = 2.5
# Распределение сужения к талии: бок (общий), середина, вытачка.
SIDE_SHARE = 0.3
FRONT_CENTER_MAX, FRONT_DART_MAX = 1.0, 2.0
BACK_CENTER_MAX, BACK_DART_MAX = 2.0, 3.0
FRONT_DART_LENGTH, BACK_DART_LENGTH = 8.0, 12.0
FLY_WIDTH, FLY_LENGTH = 3.5, 18.0


def build_trousers(measurements: dict, params: dict) -> list[Piece]:
    (
        waist,
        hip,
        height,
        crotch_depth,
        inseam_length,
        knee_length,
        knee_circumference,
    ) = require(
        measurements,
        "waist",
        "hip",
        "height",
        "crotch_depth",
        "inseam_length",
        "knee_length",
        "knee_circumference",
    )

    mult = fit_multiplier(str(params.get("fit", "regular")))
    ease_waist = float(params.get("ease_waist", 2.0)) * mult
    ease_hip = float(params.get("ease_hip", 4.0)) * mult
    length_delta = float(params.get("length_delta", 0.0))
    gender = str(params.get("gender", "male"))

    # Посадка по высоте: верхний срез ниже или выше талии. Сидение, бёдра и
    # колено остаются на своих местах на теле, поэтому все вертикали от
    # верхнего среза сдвигаются на ту же величину.
    top_girth, drop = rise_top(
        waist, hip, crotch_depth * HIP_LINE_SHARE, str(params.get("rise", "natural"))
    )
    half_waist = (top_girth + ease_waist) / 2.0
    half_hip = (hip + ease_hip) / 2.0
    back_hip = half_hip * LEG_BALANCE_BACK
    front_hip = half_hip - back_hip
    # Талия делится как бёдра: середина брюк остаётся на месте.
    back_waist = half_waist * LEG_BALANCE_BACK
    front_waist = half_waist - back_waist

    knee_total = (knee_circumference + KNEE_EASE * mult**0.5) / 2.0
    knee_front = knee_total * (1.0 - LEG_BALANCE_BACK)
    knee_back = knee_total * LEG_BALANCE_BACK

    # Линия шага ниже плоскости сидения на прибавку: иначе шов шага
    # врезается в тело (ЕМКО: глубина сидения + 1-1,5 см). Линия бёдер
    # считается от мерки тела.
    hip_y = crotch_depth * HIP_LINE_SHARE - drop
    crotch_depth = crotch_depth + RISE_EASE - drop
    knee_y = knee_length - drop
    total_length = crotch_depth + inseam_length + length_delta
    if not crotch_depth + 5.0 < knee_y < total_length - 5.0:
        raise DraftError("Колено должно находиться между линией шага и низом брюк")

    # Бок общий для переда и спинки: одинаковое сужение - равные швы.
    front_reduction = max(0.0, front_hip - front_waist)
    back_reduction = max(0.0, back_hip - back_waist)
    side_take = SIDE_SHARE * min(front_reduction, back_reduction)

    def split(reduction: float, center_max: float, dart_max: float) -> tuple[float, float]:
        rest = max(0.0, reduction - side_take)
        center = min(center_max, rest * 0.4)
        dart = min(dart_max, rest - center)
        # Что не влезло в вытачку, уходит в середину.
        center = rest - dart
        return center, dart if dart >= 0.5 else 0.0

    front_center, front_dart = split(front_reduction, FRONT_CENTER_MAX, FRONT_DART_MAX)
    back_center, back_dart = split(back_reduction, BACK_CENTER_MAX, BACK_DART_MAX)

    front_ext = half_hip * FRONT_CROTCH_SHARE
    back_ext = half_hip * BACK_CROTCH_SHARE

    # Насколько бок уходит внутрь от бёдер к колену: колено переда по центру.
    knee_offset = max(0.0, (front_hip + front_ext - knee_front) / 2.0)
    common = dict(
        crotch_depth=crotch_depth,
        hip_y=hip_y,
        knee_y=knee_y,
        side_take=side_take,
        knee_offset=knee_offset,
    )
    front_inseam, total = _inseam(
        crotch=Point(front_hip + front_ext, crotch_depth),
        knee_width=knee_offset + knee_front,
        knee_y=knee_y,
        inseam_length=inseam_length + length_delta,
    )
    front = _leg(
        "front",
        "Перед",
        waist_width=front_waist,
        hip_width=front_hip,
        center_take=front_center,
        dart=front_dart,
        dart_length=FRONT_DART_LENGTH,
        rise=0.0,
        inseam=front_inseam,
        knee_width=knee_front,
        total_length=total,
        fly=gender == "male",
        **common,
    )
    # Точка шага спинки опускается, пока шаговые швы не сравняются.
    target = polyline_length(front_inseam)
    drop = _solve_drop(
        back_hip + back_ext, crotch_depth, knee_offset + knee_back, knee_y, total, target
    )
    # На очень полной фигуре опускания не хватает: шаг спинки уменьшают
    # (не меньше шага переда), пока шаговые швы не сравняются.
    while back_ext > front_ext and _too_long(
        back_hip + back_ext, crotch_depth + drop, knee_offset + knee_back, knee_y, total, target
    ):
        back_ext = max(front_ext, back_ext - 0.25)
        drop = _solve_drop(
            back_hip + back_ext, crotch_depth, knee_offset + knee_back, knee_y, total, target
        )
    back_inseam, _ = _inseam(
        crotch=Point(back_hip + back_ext, crotch_depth + drop),
        knee_width=knee_offset + knee_back,
        knee_y=knee_y,
        total_length=total,
    )
    back = _leg(
        "back",
        "Спинка",
        waist_width=back_waist,
        hip_width=back_hip,
        center_take=back_center,
        dart=back_dart,
        dart_length=BACK_DART_LENGTH,
        rise=BACK_RISE,
        inseam=back_inseam,
        knee_width=knee_back,
        total_length=total,
        fly=False,
        **common,
    )
    # Притачной пояс с заходом; у мужских брюк - гульфик под молнию.
    extra = [waistband("trousers", front.girth_cm + back.girth_cm)]
    if gender == "male":
        extra.append(fly(FLY_LENGTH))
    return [front, back, *extra]


def _knee_curve(crotch: Point, knee_width: float, knee_y: float) -> list[Point]:
    return bezier(
        (crotch.x, crotch.y),
        (crotch.x - 0.5, crotch.y + (knee_y - crotch.y) * 0.35),
        (knee_width, knee_y - (knee_y - crotch.y) * 0.35),
        (knee_width, knee_y),
        segments=12,
    )


def _inseam(
    *,
    crotch: Point,
    knee_width: float,
    knee_y: float,
    inseam_length: float | None = None,
    total_length: float | None = None,
) -> tuple[list[Point], float]:
    """Шаговый шов от точки шага до низа и низ брюк.

    Мерка «шаговый шов» - длина по шву, а не проекция по высоте, поэтому
    низ брюк ставится так, чтобы длина шва совпала с меркой.
    """
    curve = _knee_curve(crotch, knee_width, knee_y)
    if total_length is None:
        assert inseam_length is not None
        total_length = knee_y + inseam_length - polyline_length(curve)
    if total_length <= knee_y + 2.0:
        raise DraftError("Длины шагового шва недостаточно для заданного положения колена")
    return [*curve, Point(knee_width, total_length)], total_length


def _too_long(
    crotch_x: float, crotch_y: float, knee_width: float, knee_y: float, total: float, target: float
) -> bool:
    """Шаговый шов спинки длиннее переда больше допуска проверки (5 мм)."""
    curve, _ = _inseam(
        crotch=Point(crotch_x, crotch_y), knee_width=knee_width, knee_y=knee_y, total_length=total
    )
    return polyline_length(curve) > target + 0.3


def _solve_drop(
    crotch_x: float, crotch_y: float, knee_width: float, knee_y: float, total: float, target: float
) -> float:
    """Насколько опустить шаг спинки, чтобы её шаговый шов был длины target."""

    def length(drop: float) -> float:
        curve, _ = _inseam(
            crotch=Point(crotch_x, crotch_y + drop),
            knee_width=knee_width,
            knee_y=knee_y,
            total_length=total,
        )
        return polyline_length(curve)

    if length(0.0) <= target:
        return 0.0
    low, high = 0.0, min(8.0, knee_y - crotch_y - 3.0)
    if length(high) > target:
        return high
    for _ in range(40):
        mid = (low + high) / 2.0
        if length(mid) > target:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def _leg(
    piece_id: str,
    name: str,
    *,
    waist_width: float,
    hip_width: float,
    center_take: float,
    dart: float,
    dart_length: float,
    rise: float,
    inseam: list[Point],
    knee_width: float,
    total_length: float,
    crotch_depth: float,
    hip_y: float,
    knee_y: float,
    side_take: float,
    knee_offset: float,
    fly: bool,
) -> Piece:
    crotch = inseam[0]
    waist_side = Point(side_take, 0.0)
    waist_center = Point(hip_width - center_take, -rise)

    side_curve = bezier(
        (0.0, hip_y),
        (0.0, hip_y * 0.5),
        (side_take * 0.6, hip_y * 0.15),
        (waist_side.x, waist_side.y),
        segments=10,
    )
    center = bezier(
        (waist_center.x, waist_center.y),
        (waist_center.x + center_take * 0.3, hip_y * 0.4),
        (hip_width, hip_y * 0.8),
        (hip_width, hip_y),
        segments=10,
    )
    seat = bezier(
        (hip_width, hip_y),
        (hip_width, hip_y + (crotch.y - hip_y) * 0.55),
        (crotch.x - (crotch.x - hip_width) * 0.6, crotch.y),
        (crotch.x, crotch.y),
        segments=12,
    )
    # Бок от бёдер к колену уходит внутрь, ниже колена - прямо.
    leg_side = bezier(
        (knee_offset, total_length),
        (knee_offset, knee_y),
        (0.0, hip_y + (knee_y - hip_y) * 0.45),
        (0.0, hip_y),
        segments=12,
    )
    points: list[Point] = [
        waist_side,
        waist_center,
        *center[1:],
        *seat[1:],
        *inseam[1:],
        *leg_side,
        *side_curve[1:],
    ]

    internal: list[dict] = [
        {
            "type": "center_line",
            "points": to_mm(
                [
                    Point(knee_offset + knee_width * 0.5, hip_y),
                    Point(knee_offset + knee_width * 0.5, total_length),
                ]
            ),
            "label": "линия стрелки",
        }
    ]
    if dart > 0:
        x = (waist_side.x + waist_center.x) / 2.0
        y = -rise * (x - waist_side.x) / max(waist_center.x - waist_side.x, 1e-6)
        internal.append(
            {
                "type": "dart",
                "points": to_mm(
                    [
                        Point(x - dart / 2.0, y),
                        Point(x, y + dart_length),
                        Point(x + dart / 2.0, y),
                    ]
                ),
                "label": "вытачка",
            }
        )
    if fly:
        internal.append(
            {
                "type": "stitch",
                "points": to_mm(
                    [
                        Point(waist_center.x - FLY_WIDTH, 0.0),
                        Point(waist_center.x - FLY_WIDTH, FLY_LENGTH - 2.0),
                        Point(hip_width - 0.5, FLY_LENGTH),
                    ]
                ),
                "label": "гульфик",
            }
        )

    side_edge = [*leg_side, *side_curve[1:]]
    return build_piece(
        piece_id,
        name,
        to_mm([*points, points[0]]),
        grainline=(
            Point((knee_offset + knee_width * 0.5) * 10.0, (hip_y + 2.0) * 10.0),
            Point((knee_offset + knee_width * 0.5) * 10.0, (total_length - 5.0) * 10.0),
        ),
        notches=[
            {"x": 0.0, "y": hip_y * 10.0, "label": "бок"},
            {"x": crotch.x * 10.0, "y": crotch.y * 10.0, "label": "шаг"},
            {"x": (knee_offset + knee_width) * 10.0, "y": knee_y * 10.0, "label": "колено"},
        ],
        internal_lines=internal,
        cut=2,
        mirrored=False,
        # Половинка закрывает свою долю полуобхвата талии; пар две.
        girth_cm=(waist_center.x - waist_side.x - dart) * 2.0,
        seam_edges=[
            {"label": "шаг", "points": to_mm(inseam)},
            {"label": "средний", "points": to_mm(center + seat[1:])},
            {"label": "бок", "points": to_mm(side_edge)},
        ],
    )
