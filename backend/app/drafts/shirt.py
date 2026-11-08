"""Рубашка: параметрическая конструкция.

Методика сверена с MIT-эталоном FreeSewing
(`docs/research/05-extracted-rules.json`):

- ширина панели: (обхват груди + прибавка) / 4 от центра до бокового шва;
- глубина проймы: из вертикальных мерок, а не из обхвата груди;
- горловина: подгоняется итеративно под обхват шеи;
- вытачка: глубина вычисляется из разности обхватов груди и талии плюс
  прибавки, а не берётся константой по посадке - иначе на полной фигуре
  вытачка окажется лишней, а на худой - недостаточной;
- ширина рукава: из обхвата бицепса; длина оката: из длины проймы.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, require, to_mm
from .common import body_side, build_piece, fit_multiplier, overrides_of, symmetric
from .sleeve import deepen_for_sleeve, set_in_sleeve
from .tee import (
    ARMHOLE_EASE_SHARE,
    NECK_EASE,
    _armhole_length,
    _neck_depth_ratio,
    _neckline_points,
    _solve_neck,
    _tan,
    shoulder_tip,
)


# Борт рубашки: заход полочки за середину переда под пуговицы диаметром до
# 1,2 см (диаметр пуговицы плюс 0,3 см), см.
FRONT_EXTENSION = 1.5


def build_shirt(measurements: dict, params: dict) -> list[Piece]:
    (
        bust,
        waist,
        hip,
        height,
        shoulder_width,
        shoulder_slope,
        neck_to_waist,
        waist_to_armpit,
        waist_to_hip,
        biceps,
        back_length,
        sleeve_length,
        neck_circ,
    ) = require(
        measurements,
        "bust",
        "waist",
        "hip",
        "height",
        "shoulder_width",
        "shoulder_slope",
        "neck_to_waist",
        "waist_to_armpit",
        "waist_to_hip",
        "biceps",
        "back_length",
        "sleeve_length",
        "neck_circumference",
    )

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
    # Женская рубашка: перед длиннее спинки на разницу длин до талии, её
    # забирает нагрудная вытачка. Мерки Дтп у рубашки нет - баланс берётся
    # по типовой фигуре ГОСТ 31396: 2,4 см у 42-го размера и +0,6 см на
    # размер, то есть (обхват груди - 68) * 0,15.
    gender = str(params.get("gender", "male"))
    bust_balance = min(7.0, max(1.5, (bust - 68.0) * 0.15)) if gender == "female" else 0.0
    ease_bust = float(params.get("ease_bust", 12.0)) * mult
    ease_waist = float(params.get("ease_waist", 10.0)) * mult
    ease_length = float(params.get("ease_length", 3.0)) * mult
    length_delta = float(params.get("length_delta", 0.0))
    neckline = str(params.get("neckline", "crew"))
    sleeve_len = float(params.get("sleeve_length") or sleeve_length)

    half_width = (bust + ease_bust) / 4.0
    waist_half = (waist + ease_waist) / 4.0
    # Низ держит обхват бёдер: изделие расширяется книзу, если бёдра шире
    # груди, иначе оно не налезет на фигуру.
    hip_half = (hip + ease_waist) / 4.0

    # Глубина проймы: из вертикальных мерок, как в футболке.
    overrides = overrides_of(params)
    armhole_depth = overrides.get(
        "armhole_depth", neck_to_waist - waist_to_armpit + ease_bust * ARMHOLE_EASE_SHARE
    )

    # Горловина подбирается под обхват шеи, как в футболке.
    neck_depth_ratio = _neck_depth_ratio(neckline)
    neck_half, neck_depth, back_neck_depth = _solve_neck(
        target=neck_circ + NECK_EASE,
        neck_depth_ratio=neck_depth_ratio,
        neck_to_waist=neck_to_waist,
        neckline=neckline,
    )

    # Угол наклона отсчитывается по плечевому шву: от горловины до
    # плечевой точки. Иначе плечо слишком крутое, а пройма короткая.
    shoulder_tip_x = overrides.get(
        "shoulder_tip_x", shoulder_tip(shoulder_width, bust, ease_bust, half_width)
    )
    shoulder_run = max(shoulder_tip_x - neck_half, 1.0)
    shoulder_drop = shoulder_run * _tan(shoulder_slope)

    body_length = back_length + length_delta + ease_length
    if "armhole_depth" not in overrides:
        # Пройма мала для руки - её опускают (глубину из редактора не трогаем).
        armhole_depth = deepen_for_sleeve(
            armhole_depth,
            lambda depth: 2.0
            * _armhole_length(
                shoulder_tip_x=shoulder_tip_x,
                shoulder_drop=shoulder_drop,
                half_width=half_width,
                armhole_depth=depth,
            ),
            biceps=biceps,
            min_ease=8.0 * mult**0.5,
            cap_ease=1.5,
        )
    if armhole_depth <= shoulder_drop or body_length <= armhole_depth + 6:
        from .base import DraftError

        raise DraftError("Пройма должна быть ниже плеча и выше низа изделия")
    waist_y = neck_to_waist
    # Waist-to-hip length comes from the client's measurements: the side
    # seam passes through the hip line at exactly that height.
    hip_y = waist_y + waist_to_hip

    # Вытачка по талии: ровно настолько, насколько фигура уже в талии,
    # плюс свободная посадка. Константа по посадке здесь не годится.
    waist_reduction = (bust + ease_bust) - (waist + ease_waist)
    # Half the shaping is at the sides, half in four equal waist darts.
    # Equal intakes keep the front/back side seams congruent.
    front_dart = back_dart = max(0.0, waist_reduction) / 8.0

    front = _shirt_body(
        "front",
        "Перед",
        half_width=half_width,
        waist_half=waist_half,
        hip_half=hip_half,
        waist_y=waist_y,
        hip_y=hip_y,
        neck_half=neck_half,
        neck_depth=neck_depth,
        shoulder_drop=shoulder_drop,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=body_length,
        dart_depth=front_dart,
        waist_y_dart=waist_y,
        placket=True,
        neckline=neckline,
        bust_balance=bust_balance,
        bust_x=bust * 0.1,
    )
    back = _shirt_body(
        "back",
        "Спинка",
        half_width=half_width,
        waist_half=waist_half,
        hip_half=hip_half,
        waist_y=waist_y,
        hip_y=hip_y,
        neck_half=neck_half,
        neck_depth=back_neck_depth,
        shoulder_drop=shoulder_drop,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=body_length,
        dart_depth=back_dart,
        waist_y_dart=waist_y,
        placket=False,
    )

    armhole_length = _armhole_length(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=half_width,
        armhole_depth=armhole_depth,
    )
    # Посадка оката рубашки 1,5 см: рукав ложится без морщин на плече.
    sleeve = set_in_sleeve(
        sleeve_length=sleeve_len,
        biceps=biceps,
        biceps_ease=8.0 * mult**0.5,
        armhole_length=2.0 * armhole_length,
        cap_ease=1.5,
        hem_narrowing=3.0,
        cuff_length=6.0,
    )
    collar = _collar(
        neck_circ=neck_circ,
        target=polyline_length(_neckline_points(neck_half, neck_depth, neckline))
        + polyline_length(_neckline_points(neck_half, back_neck_depth)),
    )

    return [front, back, sleeve, collar]


def _shirt_body(
    piece_id: str,
    name: str,
    *,
    half_width: float,
    waist_half: float,
    hip_half: float,
    waist_y: float,
    hip_y: float,
    neck_half: float,
    neck_depth: float,
    shoulder_drop: float,
    shoulder_tip_x: float,
    armhole_depth: float,
    length: float,
    dart_depth: float,
    waist_y_dart: float,
    placket: bool,
    neckline: str = "crew",
    bust_balance: float = 0.0,
    bust_x: float = 0.0,
) -> Piece:
    # Two symmetric darts each remove dart_depth from the panel width.
    # Add that intake to the flat pattern so the sewn waist retains its ease.
    if dart_depth <= 0.3 or not armhole_depth + 4 < waist_y < length - 4:
        dart_depth = 0.0
    waist_half += dart_depth
    right: list[Point] = []
    # Начало половины - середина выреза: при зеркалировании получается одна
    # общая горловина, а не две отдельные ямы.
    right.append(Point(0.0, neck_depth))
    neck_curve = _neckline_points(neck_half, neck_depth, neckline)
    right.extend(neck_curve[1:])
    shoulder_curve = bezier(
        (neck_half, 0.0),
        (neck_half + (shoulder_tip_x - neck_half) * 0.45, shoulder_drop * 0.25),
        (shoulder_tip_x - 2.0, shoulder_drop * 0.8),
        (shoulder_tip_x, shoulder_drop),
        segments=12,
    )
    right.extend(shoulder_curve[1:])
    shoulder_points = shoulder_curve
    armhole_points = bezier(
        (shoulder_tip_x, shoulder_drop),
        (shoulder_tip_x, shoulder_drop + (armhole_depth - shoulder_drop) * 0.55),
        (half_width - 1.0, armhole_depth - 2.5),
        (half_width, armhole_depth),
        segments=18,
    )
    right.extend(armhole_points[1:])
    # Боковой шов: от проймы вниз, сужаясь к талии и расширяясь к бёдрам.
    side = body_side(half_width, waist_half, hip_half, armhole_depth, waist_y, hip_y, length)
    sewn_side = side
    if bust_balance >= 0.5:
        # Женский перед длиннее спинки на баланс: его забирает боковая
        # нагрудная вытачка, направленная в точку груди (как в лифе).
        top_y = armhole_depth + 5.0
        i_top = next(i for i, p in enumerate(side) if p.y > top_y) - 1
        a, b = side[i_top], side[i_top + 1]
        t = (top_y - a.y) / max(b.y - a.y, 1e-9)
        top_leg = Point(a.x + (b.x - a.x) * t, top_y)
        bottom_leg = Point(top_leg.x, top_y + bust_balance)
        bust_point = Point(bust_x, armhole_depth + 3.0)
        mid = Point(top_leg.x, top_y + bust_balance / 2.0)
        dx, dy = mid.x - bust_point.x, mid.y - bust_point.y
        dist = max((dx * dx + dy * dy) ** 0.5, 1e-6)
        apex = Point(bust_point.x + dx / dist * 2.0, bust_point.y + dy / dist * 2.0)
        lower = [Point(p.x, p.y + bust_balance) for p in side[i_top + 1 :]]
        right.extend(side[1 : i_top + 1])
        right.extend([top_leg, apex, bottom_leg, *lower])
        length += bust_balance
        waist_y_dart += bust_balance
        hip_y += bust_balance
        side = [*side[: i_top + 1], top_leg, bottom_leg, *lower]
    else:
        right.extend(side[1:])
    right.append(Point(0.0, length))

    # Деталь целиком: от центра переда через боковой шов обратно к центру.
    if placket:
        # Перед на пуговицах кроится двумя полочками: половина детали и борт
        # (заход под пуговицы) за серединой переда, 2 детали зеркально.
        outline = to_mm(
            [*right, Point(-FRONT_EXTENSION, length), Point(-FRONT_EXTENSION, neck_depth), right[0]]
        )
    else:
        outline = to_mm(symmetric(right))
    notches = [
        {"x": half_width * 10.0, "y": armhole_depth * 10.0, "label": "пройма"},
        {"x": side[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]
    internal: list[dict] = []
    if dart_depth > 0.3:
        # У полочки одна вытачка, у спинки целиком - две.
        for sign in (1,) if placket else (-1, 1):
            centre = sign * waist_half * 0.5
            half_intake = dart_depth / 2
            upper = max(armhole_depth + 2, waist_y_dart - 10)
            lower_tip = min(length - 2, hip_y - 1, waist_y_dart + 10)
            internal.append(
                {
                    "type": "dart",
                    "points": to_mm(
                        [
                            Point(centre - half_intake, waist_y_dart),
                            Point(centre, upper),
                            Point(centre + half_intake, waist_y_dart),
                            Point(centre, lower_tip),
                            Point(centre - half_intake, waist_y_dart),
                        ]
                    ),
                }
            )
    if placket:
        internal.append(
            {
                "type": "placket",
                "points": [Point(0.0, neck_depth * 10.0), Point(0.0, length * 10.0)],
                "label": "середина переда",
            }
        )
    else:
        internal.append(
            {
                "type": "fold",
                "points": [Point(0.0, 0.0), Point(0.0, length * 10.0)],
                "label": "середина спинки",
            }
        )

    grainline = (Point(0.0, neck_depth * 10.0 + 20.0), Point(0.0, (length - 3.0) * 10.0))

    # Обхват: полная ширина панели = 2 * half_width.
    return build_piece(
        piece_id,
        name,
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=2 if placket else 1,
        mirrored=placket,
        girth_cm=half_width * 2.0,
        seam_edges=[
            {"label": "пройма", "points": to_mm(armhole_points)},
            {"label": "горловина", "points": to_mm(neck_curve)},
            {"label": "плечо", "points": to_mm(shoulder_points)},
            {"label": "бок", "points": to_mm(sewn_side)},
        ],
    )


def _collar(*, neck_circ: float, target: float) -> Piece:
    """Отложной воротник.

    В плоском виде это половина воротника: сгиб по центру (вертикальная
    линия слева), линия притачивания к горловине сверху, внешний край снизу.
    Ширина притачивания повторяет длину выреза горловины (target - половина
    выреза: перед плюс спинка), иначе воротник не сойдётся с вырезом.
    """
    collar_depth = neck_circ / 4.0 + 3.0
    stand = 2.5
    low, high = 0.01, target
    for _ in range(60):
        half_width = (low + high) / 2
        curve = bezier(
            (0, 0),
            (half_width * 0.45, -stand * 0.6),
            (half_width * 0.8, -stand * 0.2),
            (half_width, 0),
        )
        if polyline_length(curve) < target:
            low = half_width
        else:
            high = half_width
    half_width = (low + high) / 2

    points: list[Point] = []
    # Линия притачивания: от сгиба к плечевому шву.
    neckline = bezier(
        (0.0, 0.0),
        (half_width * 0.45, -stand * 0.6),
        (half_width * 0.8, -stand * 0.2),
        (half_width, 0.0),
        segments=12,
    )
    points.extend(neckline)
    # Внешний край: от плечевой точки обратно к сгибу.
    outer = bezier(
        (half_width, 0.0),
        (half_width + 1.2, collar_depth * 0.45),
        (half_width * 0.6, collar_depth),
        (0.0, collar_depth),
        segments=14,
    )
    points.extend(outer[1:])
    # Сгиб: от внешнего края обратно к линии притачивания.
    points.append(points[0])

    outline = to_mm(points)
    grainline = (Point(0.0, 10.0), Point(0.0, (collar_depth * 10.0) - 10.0))
    notches = [{"x": half_width * 10.0, "y": 0.0, "label": "плечо"}]
    internal = [
        {
            "type": "fold",
            "points": [Point(0.0, 0.0), Point(0.0, collar_depth * 10.0)],
            "label": "сгиб воротника",
        }
    ]
    return build_piece(
        "collar",
        "Воротник",
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=2,
        mirrored=False,
        seam_edges=[{"label": "горловина", "points": to_mm(neckline)}],
    )
