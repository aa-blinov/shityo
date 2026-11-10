"""Бельё: женские трусы, мужские боксеры и бралетт без косточек.

Бельё шьют из эластичного трикотажа и сетки, поэтому все обхваты строятся
с отрицательной прибавкой: деталь меньше тела на долю растяжимости
полотна (параметр «Растяжение», %). ЕМКО СЭВ бельё не описывает; принципы
ниже - общие для конструирования трикотажного белья, а доли и константы -
упрощение проекта (см. docs/SIZING.md, раздел «Бельё»):

- трусы: перед, спинка и ластовица; общая длина промежности (от верха
  переда через пах до верха спинки) делится как 36 % перед, 20 %
  ластовица, 44 % спинка; спинка шире переда на 1 см по четверти обхвата;
- боксеры: половинки как у брюк (ЕМКО: линия бёдер на 2/3 глубины
  сидения, спинка шире переда, шаг спинки длиннее), но без вытачек и с
  короткой штаниной; обхват бедра - доля обхвата бёдер (0,58);
- бралетт: двухчастная чашка с горизонтальным швом. Длина низа чашки и
  высоты чашки зависят от разницы обхватов груди и под грудью; верх
  нижней чашки короче низа - это и даёт объём. Ширина перемычки - из
  центра груди: вершина чашки стоит на половине Цг от середины.

Раскладка деталей - сантиметры черчения, y вниз; в детали - миллиметры.
"""

from __future__ import annotations

import math

from ..core.geometry import Point, polyline_length
from .base import DraftError, Piece, bezier, require, to_mm
from .common import build_piece, rise_top, symmetric

# Трусы: доли общей длины промежности.
BRIEFS_FRONT_SHARE = 0.36
BRIEFS_BACK_SHARE = 0.44
# Полуширина ластовицы у переда и у спинки, см.
GUSSET_FRONT_HALF = 3.25
GUSSET_BACK_HALF = 4.0
GUSSET_WAIST_HALF = 3.0
# Подъём середины спинки над боком, см.
BRIEFS_BACK_RISE = 1.0

# Боксеры.
BOXER_BACK_SHARE = 0.55
BOXER_FRONT_CROTCH = 0.12
BOXER_BACK_CROTCH = 0.15
BOXER_RISE_EASE = 1.0
BOXER_BACK_RISE = 2.0
THIGH_SHARE = 0.58
# Резинка пояса короче верха трусов на эту долю.
WAISTBAND_REDUCTION = 0.12

# Бралетт.
CUP_BASE_U, CUP_BASE_D = 0.22, 0.4
CUP_DART = 0.35
LOWER_CUP = (0.25, 3.5)
UPPER_CUP = (0.3, 5.0)
APEX_SHARE = 0.45
HOOK_OVERLAP = 1.5


def _stretch(params: dict, default: float) -> float:
    """Доля, на которую деталь меньше тела по обхвату."""
    value = float(params.get("stretch", default))
    return max(0.0, min(30.0, value)) / 100.0


def _closed(points: list[Point]) -> list[Point]:
    return [*points, points[0]]


# ------------------------------------------------------------------ трусы


def build_briefs(measurements: dict, params: dict) -> list[Piece]:
    waist, hip, waist_to_hip, crotch_length = require(
        measurements, "waist", "hip", "waist_to_hip", "crotch_length"
    )
    stretch = _stretch(params, 8.0)
    leg_height = float(params.get("leg_height", 7.0))
    top_girth, drop = rise_top(waist, hip, waist_to_hip, str(params.get("rise", "mid")))

    top_q = top_girth * (1.0 - stretch) / 4.0
    hip_q = hip * (1.0 - stretch) / 4.0
    hip_y = max(waist_to_hip - drop, 6.0)
    # Ширина у низа бока: между верхом и линией бёдер, по высоте бока.
    side_q = top_q + (hip_q - top_q) * min(1.0, leg_height / hip_y)

    front_len = crotch_length * BRIEFS_FRONT_SHARE - drop
    back_len = crotch_length * BRIEFS_BACK_SHARE - drop
    gusset_len = crotch_length * (1.0 - BRIEFS_FRONT_SHARE - BRIEFS_BACK_SHARE)
    if front_len <= leg_height + 3.0:
        raise DraftError("Перед трусов короче бока: уменьшите высоту бока или посадку")

    front = _briefs_panel(
        "front",
        "Перед трусов",
        top=top_q - 0.5,
        side=side_q - 0.5,
        leg_height=leg_height,
        length=front_len,
        crotch_half=GUSSET_FRONT_HALF,
        rise=0.0,
        full=False,
    )
    back = _briefs_panel(
        "back",
        "Спинка трусов",
        top=top_q + 0.5,
        side=side_q + 0.5,
        leg_height=leg_height,
        length=back_len,
        crotch_half=GUSSET_BACK_HALF,
        rise=BRIEFS_BACK_RISE,
        full=True,
    )
    return [front, back, _gusset(gusset_len)]


def _briefs_panel(
    piece_id: str,
    name: str,
    *,
    top: float,
    side: float,
    leg_height: float,
    length: float,
    crotch_half: float,
    rise: float,
    full: bool,
) -> Piece:
    waist = bezier(
        (0.0, -rise), (top * 0.5, -rise), (top * 0.85, -rise * 0.2), (top, 0.0), segments=8
    )
    side_line = [Point(top, 0.0), Point(side, leg_height)]
    depth = length - leg_height
    # Спинка закрывает ягодицу: вырез ноги уходит вниз почти вертикально и
    # заворачивает к ластовице у самого низа. Перед вырезан глубже.
    if full:
        leg = bezier(
            (side, leg_height),
            (side + 0.5, leg_height + depth * 0.45),
            (crotch_half + (side - crotch_half) * 0.55, length - depth * 0.1),
            (crotch_half, length),
            segments=16,
        )
    else:
        leg = bezier(
            (side, leg_height),
            (side - (side - crotch_half) * 0.35, leg_height + depth * 0.55),
            (crotch_half + 3.0, length - 1.0),
            (crotch_half, length),
            segments=16,
        )
    right = [*waist, side_line[1], *leg[1:], Point(0.0, length)]
    outline = to_mm(symmetric(right))
    return build_piece(
        piece_id,
        name,
        outline,
        grainline=(Point(0.0, 20.0), Point(0.0, (length - 2.0) * 10.0)),
        notches=[
            {"x": top * 10.0, "y": 0.0, "label": "бок"},
            {"x": side * 10.0, "y": leg_height * 10.0, "label": "бок"},
            {"x": 0.0, "y": length * 10.0, "label": "середина"},
        ],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(0.0, -rise), Point(0.0, length)]),
                "label": "середина",
            }
        ],
        cut=1,
        girth_cm=2.0 * top,
        seam_edges=[
            {"label": "бок", "points": to_mm(side_line)},
            {
                "label": "пояс",
                "points": to_mm([Point(-p.x, p.y) for p in reversed(waist)] + waist[1:]),
            },
            {"label": "вырез", "points": to_mm(leg)},
            {
                "label": "ластовица",
                "points": to_mm([Point(-crotch_half, length), Point(crotch_half, length)]),
            },
        ],
    )


def _gusset(length: float) -> Piece:
    side = bezier(
        (GUSSET_FRONT_HALF, 0.0),
        (GUSSET_WAIST_HALF, length * 0.35),
        (GUSSET_WAIST_HALF, length * 0.6),
        (GUSSET_BACK_HALF, length),
        segments=10,
    )
    right = [Point(0.0, 0.0), *side, Point(0.0, length)]
    return build_piece(
        "gusset",
        "Ластовица",
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 15.0), Point(0.0, (length - 1.5) * 10.0)),
        notches=[
            {"x": 0.0, "y": 0.0, "label": "перед"},
            {"x": 0.0, "y": length * 10.0, "label": "спинка"},
        ],
        # Верхняя ластовица и подкладка из хлопка.
        cut=2,
        seam_edges=[
            {
                "label": "перед",
                "points": to_mm([Point(-GUSSET_FRONT_HALF, 0.0), Point(GUSSET_FRONT_HALF, 0.0)]),
            },
            {
                "label": "спинка",
                "points": to_mm(
                    [Point(-GUSSET_BACK_HALF, length), Point(GUSSET_BACK_HALF, length)]
                ),
            },
        ],
    )


# ------------------------------------------------------------------ боксеры


def build_boxers(measurements: dict, params: dict) -> list[Piece]:
    waist, hip, height, crotch_depth = require(
        measurements, "waist", "hip", "height", "crotch_depth"
    )
    stretch = _stretch(params, 6.0)
    leg_length = float(params.get("leg_length", 10.0))
    band_height = float(params.get("band_height", 4.0))
    hip_line = crotch_depth * 2.0 / 3.0
    top_girth, drop = rise_top(waist, hip, hip_line, str(params.get("rise", "mid")))

    half_hip = hip * (1.0 - stretch) / 2.0
    half_top = top_girth * (1.0 - stretch) / 2.0
    back_hip, back_top = half_hip * BOXER_BACK_SHARE, half_top * BOXER_BACK_SHARE
    front_hip, front_top = half_hip - back_hip, half_top - back_top
    thigh = hip * THIGH_SHARE * (1.0 - stretch)
    front_leg, back_leg = thigh * (1.0 - BOXER_BACK_SHARE), thigh * BOXER_BACK_SHARE

    hip_y = hip_line - drop
    crotch_y = crotch_depth + BOXER_RISE_EASE - drop
    hem_y = crotch_y + leg_length
    front_crotch_x = front_hip + half_hip * BOXER_FRONT_CROTCH
    back_crotch_x = back_hip + half_hip * BOXER_BACK_CROTCH
    if front_leg >= front_crotch_x or back_leg >= back_crotch_x:
        raise DraftError("Штанина шире верха: проверьте обхват бёдер")

    # Шаговый шов спинки длиннее переда на разницу шагов; точка шага спинки
    # опускается, пока швы не сравняются, низ остаётся на одной высоте -
    # боковые швы тоже равны.
    front_inseam = math.hypot(front_crotch_x - front_leg, leg_length)
    dx_back = back_crotch_x - back_leg
    back_drop = leg_length - math.sqrt(max(front_inseam**2 - dx_back**2, 0.0))
    back_drop = max(0.0, min(back_drop, leg_length - 2.0))

    front = _boxer_leg(
        "front",
        "Перед боксеров",
        top=front_top,
        hip=front_hip,
        crotch=Point(front_crotch_x, crotch_y),
        leg=front_leg,
        hip_y=hip_y,
        hem_y=hem_y,
        rise=0.0,
        pouch=True,
    )
    back = _boxer_leg(
        "back",
        "Спинка боксеров",
        top=back_top,
        hip=back_hip,
        crotch=Point(back_crotch_x, crotch_y + back_drop),
        leg=back_leg,
        hip_y=hip_y,
        hem_y=hem_y,
        rise=BOXER_BACK_RISE,
        pouch=False,
    )
    return [front, back, _waistband(top_girth * (1.0 - WAISTBAND_REDUCTION), band_height)]


def _boxer_leg(
    piece_id: str,
    name: str,
    *,
    top: float,
    hip: float,
    crotch: Point,
    leg: float,
    hip_y: float,
    hem_y: float,
    rise: float,
    pouch: bool,
) -> Piece:
    take = max(0.0, hip - top)
    center = bezier(
        (top, -rise),
        (top + take * 0.3, hip_y * 0.4),
        (hip, hip_y * 0.8),
        (hip, hip_y),
        segments=10,
    )
    seat = bezier(
        (hip, hip_y),
        (hip, hip_y + (crotch.y - hip_y) * 0.55),
        (crotch.x - (crotch.x - hip) * 0.6, crotch.y),
        (crotch.x, crotch.y),
        segments=12,
    )
    inseam = [crotch, Point(leg, hem_y)]
    side = [Point(0.0, hem_y), Point(0.0, 0.0)]
    waist = [Point(0.0, 0.0), Point(top, -rise)]
    points = [*waist, *center[1:], *seat[1:], *inseam[1:], *side]
    internal: list[dict] = []
    if pouch:
        # Двойной перед под гульфик: строчка отделки, деталь та же.
        internal.append(
            {
                "type": "stitch",
                "points": to_mm(
                    [
                        Point(top - 4.0, 2.0),
                        Point(hip - 3.0, hip_y),
                        Point(crotch.x - 1.0, crotch.y - 0.5),
                    ]
                ),
                "label": "гульфик",
            }
        )
    return build_piece(
        piece_id,
        name,
        to_mm(_closed(points[:-1])),
        grainline=(Point(leg * 0.5 * 10.0, 30.0), Point(leg * 0.5 * 10.0, (hem_y - 1.5) * 10.0)),
        notches=[
            {"x": 0.0, "y": hip_y * 10.0, "label": "бок"},
            {"x": crotch.x * 10.0, "y": crotch.y * 10.0, "label": "шаг"},
        ],
        internal_lines=internal,
        cut=2,
        girth_cm=top * 2.0,
        seam_edges=[
            {"label": "шаг", "points": to_mm(inseam)},
            {"label": "средний", "points": to_mm(center + seat[1:])},
            {"label": "бок", "points": to_mm([Point(0.0, 0.0), Point(0.0, hem_y)])},
            {"label": "пояс", "points": to_mm(waist)},
        ],
    )


def _waistband(length: float, height: float) -> Piece:
    half = length / 2.0
    # Пояс складывается вдвое по длине: ширина детали - две высоты.
    right = [Point(0.0, 0.0), Point(half, 0.0), Point(half, height * 2.0), Point(0.0, height * 2.0)]
    piece = build_piece(
        "waistband",
        "Пояс",
        to_mm(symmetric(right)),
        grainline=(Point(-half * 8.0, height * 10.0), Point(half * 8.0, height * 10.0)),
        notches=[{"x": 0.0, "y": 0.0, "label": "середина"}],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(-half, height), Point(half, height)]),
                "label": "сгиб пояса",
            }
        ],
        cut=1,
        girth_cm=length,
        seam_edges=[{"label": "пояс", "points": to_mm([Point(-half, 0.0), Point(half, 0.0)])}],
    )
    piece.grain_axis = "width"
    return piece


# ------------------------------------------------------------------ бралетт


def build_bralette(measurements: dict, params: dict) -> list[Piece]:
    bust, underbust, bust_center, bust_height, back_waist_length = require(
        measurements, "bust", "underbust", "bust_center", "bust_height", "back_waist_length"
    )
    stretch = _stretch(params, 10.0)
    band_height = float(params.get("band_height", 4.0))
    strap_delta = float(params.get("strap_delta", 0.0))
    # Мельче 6 см разницы чашка бралетта не строится: берётся минимальная
    # (почти плоская) чашка, как у спортивного топа.
    difference = max(bust - underbust, 6.0)

    base = CUP_BASE_U * underbust + CUP_BASE_D * difference
    dart = CUP_DART * difference
    top = base - dart
    lower_h = LOWER_CUP[0] * difference + LOWER_CUP[1]
    upper_h = UPPER_CUP[0] * difference + UPPER_CUP[1]
    gore = max(0.5, min(4.0, bust_center / 2.0 - APEX_SHARE * top))

    band_length = underbust * (1.0 - stretch) + 2.0 * HOOK_OVERLAP
    if band_length / 2.0 < gore + base:
        raise DraftError("Чашка не помещается на пояс: проверьте обхват под грудью")
    strap = bust_height + back_waist_length * 0.5 - 4.0 + strap_delta

    return [
        _lower_cup(top, base, dart, lower_h),
        _upper_cup(top, upper_h),
        _band(band_length, band_height, gore, base),
        _strap(strap),
    ]


def _lower_cup(top: float, base: float, dart: float, height: float) -> Piece:
    # Концы низа почти над концами верха: разницу длин добирает изгиб низа,
    # как у полумесяца нижней чашки.
    shift = dart * 0.1
    # Нижняя чашка - полумесяц: концы высоко, середина низа на глубине чашки.
    cf_h, side_h = height * 0.3, height * 0.25

    def bottom(sag: float) -> list[Point]:
        return bezier(
            (-shift, cf_h),
            (top * 0.15, sag),
            (top * 0.8, sag),
            (top + shift, side_h),
            segments=18,
        )

    # Глубина низа подбирается так, чтобы его длина была равна длине низа
    # чашки по поясу: верх короче низа на «вытачку» - это и даёт объём.
    low, high = height * 0.3, height * 3.0
    for _ in range(40):
        mid = (low + high) / 2.0
        if polyline_length(bottom(mid)) < base:
            low = mid
        else:
            high = mid
    lower = bottom((low + high) / 2.0)
    seam = [Point(0.0, 0.0), Point(top, 0.0)]
    outline = [*seam, *reversed(lower), Point(0.0, 0.0)]
    apex = top * APEX_SHARE
    return build_piece(
        "cup_lower",
        "Нижняя чашка",
        to_mm(outline),
        grainline=(Point(apex * 10.0, 10.0), Point(apex * 10.0, (height - 1.0) * 10.0)),
        notches=[{"x": apex * 10.0, "y": 0.0, "label": "вершина"}],
        cut=2,
        seam_edges=[
            {"label": "шов чашки", "points": to_mm(seam)},
            {"label": "низ чашки", "points": to_mm(lower)},
        ],
    )


def _upper_cup(top: float, height: float) -> Piece:
    apex = top * APEX_SHARE
    strap_x = top * 0.62
    neckline = bezier(
        (top * 0.08, -height * 0.35),
        (top * 0.25, -height * 0.55),
        (strap_x - 1.5, -height * 0.95),
        (strap_x, -height),
        segments=12,
    )
    armhole = bezier(
        (strap_x, -height),
        (strap_x + 1.5, -height * 0.7),
        (top + 0.5, -height * 0.5),
        (top, 0.0),
        segments=12,
    )
    seam = [Point(0.0, 0.0), Point(top, 0.0)]
    outline = [
        Point(0.0, 0.0),
        Point(top * 0.08, -height * 0.35),
        *neckline[1:],
        *armhole[1:],
        Point(0.0, 0.0),
    ]
    return build_piece(
        "cup_upper",
        "Верхняя чашка",
        to_mm(outline),
        grainline=(Point(apex * 10.0, -10.0), Point(apex * 10.0, -(height - 1.5) * 10.0)),
        notches=[
            {"x": apex * 10.0, "y": 0.0, "label": "вершина"},
            {"x": strap_x * 10.0, "y": -height * 10.0, "label": "бретель"},
        ],
        cut=2,
        seam_edges=[
            {"label": "шов чашки", "points": to_mm(seam)},
            {"label": "вырез", "points": to_mm(neckline)},
            {"label": "пройма", "points": to_mm(armhole)},
        ],
    )


# Перемычка между чашками выше пояса: она держит чашки на месте.
GORE_RISE = 1.5


def _band(length: float, height: float, gore: float, cup: float) -> Piece:
    half = length / 2.0
    right = [
        Point(0.0, -GORE_RISE),
        Point(gore, -GORE_RISE),
        Point(gore + 0.6, 0.0),
        Point(half, 0.0),
        Point(half, height),
        Point(0.0, height),
    ]
    piece = build_piece(
        "band",
        "Пояс под грудью",
        to_mm(symmetric(right)),
        grainline=(Point(-half * 8.0, height * 5.0), Point(half * 8.0, height * 5.0)),
        notches=[
            {"x": gore * 10.0, "y": 0.0, "label": "чашка"},
            {"x": (gore + cup) * 10.0, "y": 0.0, "label": "чашка"},
            {"x": -gore * 10.0, "y": 0.0, "label": "чашка"},
            {"x": -(gore + cup) * 10.0, "y": 0.0, "label": "чашка"},
            {"x": half * 10.0, "y": height * 5.0, "label": "застёжка"},
            {"x": -half * 10.0, "y": height * 5.0, "label": "застёжка"},
        ],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(0.0, -GORE_RISE), Point(0.0, height)]),
                "label": "середина",
            }
        ],
        cut=1,
        girth_cm=length - 2.0 * HOOK_OVERLAP,
        seam_edges=[{"label": "верх", "points": to_mm([Point(-half, 0.0), Point(half, 0.0)])}],
    )
    # Пояс длиннее своей высоты: долевая нить поперёк оси построения.
    piece.grain_axis = "width"
    return piece


def _strap(length: float) -> Piece:
    width = 2.4
    right = [
        Point(0.0, 0.0),
        Point(width / 2.0, 0.0),
        Point(width / 2.0, length),
        Point(0.0, length),
    ]
    return build_piece(
        "strap",
        "Бретель",
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 20.0), Point(0.0, (length - 2.0) * 10.0)),
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(0.0, 0.0), Point(0.0, length)]),
                "label": "сгиб бретели",
            }
        ],
        cut=2,
    )
