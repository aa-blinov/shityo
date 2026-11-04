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
from .common import body_side, build_piece, dart_line, fit_multiplier, overrides_of, symmetric
from .tee import (
    NECK_EASE,
    _armhole_length,
    _cap_curve,
    _neck_depth_ratio,
    _neckline_points,
    _solve_cap_rise,
    _solve_neck,
    _tan,
)


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
        "biceps",
        "back_length",
        "sleeve_length",
        "neck_circumference",
    )

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
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
        "armhole_depth", neck_to_waist - waist_to_armpit * 0.955
    )

    # Горловина подбирается под обхват шеи, как в футболке.
    neck_depth_ratio = _neck_depth_ratio(neckline)
    neck_half, neck_depth = _solve_neck(
        target=neck_circ + NECK_EASE,
        neck_depth_ratio=neck_depth_ratio,
        neck_to_waist=neck_to_waist,
        neckline=neckline,
    )

    # Угол наклона отсчитывается по плечевому шву: от горловины до
    # плечевой точки. Иначе плечо слишком крутое, а пройма короткая.
    shoulder_tip_x = overrides.get(
        "shoulder_tip_x", min(shoulder_width / 2.0, half_width - 1.0)
    )
    shoulder_run = max(shoulder_tip_x - neck_half, 1.0)
    shoulder_drop = shoulder_run * _tan(shoulder_slope)

    body_length = back_length + length_delta + ease_length
    if armhole_depth <= shoulder_drop or body_length <= armhole_depth + 6:
        from .base import DraftError
        raise DraftError("Пройма должна быть ниже плеча и выше низа изделия")
    waist_y = neck_to_waist
    # No waist-to-hip measurement is collected for tops: 20 cm is the
    # explicit construction estimate, independent of the hem length.
    hip_y = waist_y + 20.0

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
        neck_depth=neck_depth * 0.55,
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
    sleeve = _shirt_sleeve(
        sleeve_length=sleeve_len,
        biceps=biceps,
        target_cap_length=2.0 * armhole_length,
        armhole_depth=armhole_depth,
    )
    collar = _collar(neck_circ=neck_circ, neck_half=neck_half, neck_depth=neck_depth, neckline=neckline)

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
) -> Piece:
    # Two symmetric darts each remove dart_depth from the panel width.
    # Add that intake to the flat pattern so the sewn waist retains its ease.
    if dart_depth <= 0.3 or not armhole_depth+4 < waist_y < length-4:
        dart_depth=0.0
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
    right.extend(side[1:])
    right.append(Point(0.0, length))

    # Деталь целиком: от центра переда через боковой шов обратно к центру.
    outline = to_mm(symmetric(right))
    notches = [
        {"x": half_width * 10.0, "y": armhole_depth * 10.0, "label": "пройма"},
        {"x": side[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]
    internal: list[dict] = []
    if dart_depth > 0.3:
        for sign in (-1, 1):
            centre = sign * waist_half * 0.5
            half_intake = dart_depth / 2
            upper = max(armhole_depth + 2, waist_y_dart - 10)
            lower_tip = min(length - 2, hip_y - 1, waist_y_dart + 10)
            internal.append({"type": "dart", "points": to_mm([
                Point(centre - half_intake, waist_y_dart),
                Point(centre, upper),
                Point(centre + half_intake, waist_y_dart),
                Point(centre, lower_tip),
                Point(centre - half_intake, waist_y_dart),
            ])})
    if placket:
        internal.append(
            {
                "type": "placket",
                "points": [Point(0.0, 0.0), Point(0.0, length * 10.0)],
                "label": "планка",
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
        cut=1,
        mirrored=False,
        girth_cm=half_width * 2.0,
        seam_edges=[
            {"label": "пройма", "points": to_mm(armhole_points)},
            {"label": "горловина", "points": to_mm(neck_curve)},
            {"label": "плечо", "points": to_mm(shoulder_points)},
            {"label": "бок", "points": to_mm(side)},
        ],
    )


def _shirt_sleeve(
    *,
    sleeve_length: float,
    biceps: float,
    target_cap_length: float,
    armhole_depth: float,
) -> Piece:
    """Рукав с окатом, подогнанным под длину проймы.

    Контур собирается целиком, как в футболке: зеркалить половину оката
    нельзя, вершина попадает на ось симметрии дважды.
    """
    # Ширина рукава на уровне подмышки: половина обхвата бицепса с запасом.
    underarm_half = (biceps + 8.0) / 2.0
    cap_half = min(underarm_half, target_cap_length * 0.45)
    cap_rise = _solve_cap_rise(cap_half, target_cap_length)
    underarm_drop = 4.5
    cuff_length = 6.0
    hem_half = max(underarm_half - 3.0, cap_half * 0.8)

    cap = _cap_curve(cap_half, cap_rise)

    points: list[Point] = []
    points.extend(cap)
    points.append(Point(underarm_half, cap_rise + underarm_drop))
    points.append(Point(hem_half, sleeve_length))
    points.append(Point(-hem_half, sleeve_length))
    points.append(Point(-underarm_half, cap_rise + underarm_drop))
    points.append(points[0])

    outline = to_mm(points)
    grainline = (Point(0.0, (cap_rise + underarm_drop) * 10.0 + 20.0), Point(0.0, (sleeve_length - cuff_length - 2.0) * 10.0))
    notches = [
        {"x": cap_half * 9.5, "y": (cap_rise + underarm_drop) * 10.0, "label": "подмышка"},
        {"x": hem_half * 10.0, "y": sleeve_length * 10.0, "label": "манжета"},
    ]
    internal = [
        {
            "type": "cuff",
            "points": [
                Point(-hem_half * 10.0, (sleeve_length - cuff_length) * 10.0),
                Point(hem_half * 10.0, (sleeve_length - cuff_length) * 10.0),
            ],
            "label": "манжета",
        }
    ]
    return build_piece(
        "sleeve",
        "Рукав",
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=2,
        mirrored=False,
        seam_edges=[{"label": "окат", "points": to_mm(cap)}],
    )


def _collar(*, neck_circ: float, neck_half: float, neck_depth: float, neckline: str = "crew") -> Piece:
    """Отложной воротник.

    В плоском виде это половина воротника: сгиб по центру (вертикальная
    линия слева), линия притачивания к горловине сверху, внешний край снизу.
    Ширина притачивания повторяет длину выреза горловины, иначе воротник
    не сойдётся с вырезом.
    """
    collar_depth = neck_circ / 4.0 + 3.0
    stand = 2.5
    target = polyline_length(_neckline_points(neck_half, neck_depth, neckline)) + polyline_length(_neckline_points(neck_half, neck_depth * 0.55))
    low, high = 0.01, target
    for _ in range(60):
        half_width = (low + high) / 2
        curve = bezier((0, 0), (half_width * 0.45, -stand * 0.6), (half_width * 0.8, -stand * 0.2), (half_width, 0))
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
