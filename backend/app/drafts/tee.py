"""Футболка: параметрическая конструкция.

Методика сверена с MIT-эталоном FreeSewing (`docs/research/05-extracted-rules.json`),
поэтому формулы здесь опираются на вертикальные мерки, а не на эвристики
вида «обхват/4 + 6»:

- ширина панели: (обхват груди + прибавка) / 2 в готовом виде, то есть
  (обхват + прибавка) / 4 от центра до бокового шва;
- глубина проймы: из вертикальной мерки «от шеи до талии» минус «от талии
  до подмышки»; пройма не должна зависеть от обхвата груди напрямую;
- горловина: подбирается итеративно так, чтобы длина выреза равнялась
  обхвату шеи с прибавкой - иначе воротник не сойдётся с вырезом;
- ширина рукава: из обхвата бицепса, длина оката: из длины проймы;
- наклон плеча: из угла наклона, а не из константы;
- низ изделия: из обхвата бёдер, а не возвратом к ширине груди.

Все числа детерминированы и проверяются тестами, поэтому результат
воспроизводится байт в байт.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, require, to_mm
from .common import body_side, build_piece, fit_multiplier, overrides_of, symmetric

# Глубина выреза как доля от длины «от шеи до талии»: столько снимается
# от вертикали, чтобы горловина не уходила в плечи.
NECK_DEPTH_RATIOS = {"crew": 0.24, "v": 0.55, "square": 0.11, "scoop": 0.30}
# Доля, снимаемая от обхвата шеи в запас на свободу.
NECK_EASE = 2.0


def _neck_depth_ratio(neckline: str) -> float:
    return NECK_DEPTH_RATIOS.get(neckline, NECK_DEPTH_RATIOS["crew"])


def build_tee(measurements: dict, params: dict) -> list[Piece]:
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
    ease_bust = float(params.get("ease_bust", 8.0)) * mult
    ease_length = float(params.get("ease_length", 2.0)) * mult
    length_delta = float(params.get("length_delta", 0.0))
    neckline = str(params.get("neckline", "crew"))
    sleeve_len = float(params.get("sleeve_length") or sleeve_length)

    # Ширина панели от центра до бокового шва.
    half_width = (bust + ease_bust) / 4.0
    waist_half = (waist + ease_bust) / 4.0
    # Низ изделия держит обхват бёдер: если бёдра шире груди, изделие
    # расширяется книзу, иначе оно не налезет на фигуру.
    hip_half = (hip + ease_bust) / 4.0

    # Глубина проймы: от верхней точки плеча до подмышки. Считается из
    # вертикальных мерок, поэтому пройма масштабируется с фигурой.
    # Глубину проймы и положение плечевой точки можно переопределить из
    # редактора: точка на раскладке - источник правды, а не мерка.
    overrides = overrides_of(params)
    armhole_depth = overrides.get("armhole_depth", neck_to_waist - waist_to_armpit * 0.955)

    # Горловина подбирается под обхват шеи: длина выреза переда и спинки
    # вместе должна равняться обхвату шеи с прибавкой.
    neck_depth_ratio = _neck_depth_ratio(neckline)
    neck_target = neck_circ + NECK_EASE
    neck_half, neck_depth = _solve_neck(
        target=neck_target,
        neck_depth_ratio=neck_depth_ratio,
        neck_to_waist=neck_to_waist,
        neckline=neckline,
    )

    # Плечевая точка и наклон плеча из угла. Угол наклона отсчитывается по
    # плечевому шву: от горловины до плечевой точки, а не от всей ширины
    # плеча. Иначе плечо получается слишком крутым, а пройма - слишком
    # короткой, и рукав в неё не входит.
    shoulder_tip_x = overrides.get("shoulder_tip_x", min(shoulder_width / 2.0, half_width - 1.0))
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

    front = _body_piece(
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
        fold_label="середина переда",
        neckline=neckline,
    )
    back = _body_piece(
        "back",
        "Спинка",
        half_width=half_width,
        waist_half=waist_half,
        hip_half=hip_half,
        waist_y=waist_y,
        hip_y=hip_y,
        neck_half=neck_half,
        # Спинка вырезается выше: горловина у́же, вырез глубже по центру.
        neck_depth=neck_depth * 0.55,
        shoulder_drop=shoulder_drop,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=body_length,
        fold_label="середина спинки",
    )

    armhole_length = _armhole_length(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=half_width,
        armhole_depth=armhole_depth,
    )
    sleeve = _sleeve(
        sleeve_length=sleeve_len,
        biceps=biceps,
        target_cap_length=2.0 * armhole_length,
        armhole_depth=armhole_depth,
    )

    return [front, back, sleeve]


def _tan(degrees: float) -> float:
    import math

    return math.tan(math.radians(degrees))


def _neckline_points(neck_half: float, neck_depth: float, neckline: str = "crew") -> list[Point]:
    """Линия горловины переда: от центра к плечевому шву."""
    if neckline == "v":
        return [Point(0.0, neck_depth), Point(neck_half, 0.0)]
    if neckline == "square":
        return [Point(0.0, neck_depth), Point(neck_half, neck_depth), Point(neck_half, 0.0)]
    return bezier(
        (0.0, neck_depth),
        (neck_half * 0.35, neck_depth),
        (neck_half * 0.8, neck_depth * 0.35),
        (neck_half, 0.0),
        segments=16,
    )


def _solve_neck(
    *,
    target: float,
    neck_depth_ratio: float,
    neck_to_waist: float,
    neckline: str = "crew",
) -> tuple[float, float]:
    """Подобрать ширину и глубину выреза под обхват шеи.

    Ширина горловины определяет длину выреза, поэтому подбирается итеративно:
    длина выреза переда плюс длина выреза спинки должны дать обхват шеи с
    прибавкой. Глубина при этом задана долей от вертикали «от шеи до талии».
    """
    depth = neck_to_waist * neck_depth_ratio
    minimum = 2.0 * (
        polyline_length(_neckline_points(4.0, depth, neckline))
        + polyline_length(_neckline_points(4.0, depth * 0.55))
    )
    # A deep/square style can have a longer opening than the neck itself.
    # Keep at least 4 cm half-width instead of returning a saturated solver.
    target = max(target, minimum)
    low, high = 0.01, max(30.0, target)
    neck_half = 10.0
    for _ in range(60):
        neck_half = (low + high) / 2.0
        front = polyline_length(_neckline_points(neck_half, depth, neckline))
        back = polyline_length(_neckline_points(neck_half, depth * 0.55))
        # Вырез зеркалится: полная длина горловины вдвое больше половины.
        if 2.0 * (front + back) < target:
            low = neck_half
        else:
            high = neck_half
    return neck_half, depth


def _armhole_points(
    *,
    shoulder_tip_x: float,
    shoulder_drop: float,
    half_width: float,
    armhole_depth: float,
) -> list[Point]:
    """Пройма: от плечевой точки вниз до подмышки."""
    return bezier(
        (shoulder_tip_x, shoulder_drop),
        (shoulder_tip_x, shoulder_drop + (armhole_depth - shoulder_drop) * 0.55),
        (half_width - 1.0, armhole_depth - 2.5),
        (half_width, armhole_depth),
        segments=18,
    )


def _armhole_length(
    *,
    shoulder_tip_x: float,
    shoulder_drop: float,
    half_width: float,
    armhole_depth: float,
) -> float:
    points = _armhole_points(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=half_width,
        armhole_depth=armhole_depth,
    )
    return polyline_length(points)


def _body_piece(
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
    fold_label: str,
    neckline: str = "crew",
) -> Piece:
    # Правая половина детали: от центра горловины вниз до низа.
    # Начало - середина выреза (самая глубокая точка), поэтому при
    # зеркалировании получается одна общая горловина, а не две ямы.
    right: list[Point] = []
    right.append(Point(0.0, neck_depth))
    right.extend(_neckline_points(neck_half, neck_depth, neckline)[1:])
    shoulder_curve = bezier(
        (neck_half, 0.0),
        (neck_half + (shoulder_tip_x - neck_half) * 0.45, shoulder_drop * 0.25),
        (shoulder_tip_x - 2.0, shoulder_drop * 0.8),
        (shoulder_tip_x, shoulder_drop),
        segments=12,
    )
    right.extend(shoulder_curve[1:])
    shoulder_points = shoulder_curve
    armhole_points = _armhole_points(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=half_width,
        armhole_depth=armhole_depth,
    )
    right.extend(armhole_points[1:])
    # Боковой шов: от проймы вниз, сужаясь к талии и расширяясь к бёдрам.
    side = body_side(half_width, waist_half, hip_half, armhole_depth, waist_y, hip_y, length)
    right.extend(side[1:])
    right.append(Point(0.0, length))

    # Деталь целиком: от центра переда через боковой шов обратно к центру.
    # Центральная линия - сгиб, по которому кроится перед.
    outline = to_mm(symmetric(right))
    notches = [
        {"x": half_width * 10.0, "y": armhole_depth * 10.0, "label": "пройма"},
        {"x": side[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]

    grainline = (Point(0.0, neck_depth * 10.0 + 20.0), Point(0.0, (length - 3.0) * 10.0))
    internal = [
        {
            "type": "fold",
            "points": [Point(0.0, 0.0), Point(0.0, length * 10.0)],
            "label": fold_label,
        }
    ]

    # Обхват: полная ширина панели = 2 * half_width, и таких панелей две
    # (перед и спинка), поэтому каждая закрывает половину обхвата.
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
            {
                "label": "горловина",
                "points": to_mm(_neckline_points(neck_half, neck_depth, neckline)),
            },
            {"label": "плечо", "points": to_mm(shoulder_points)},
            {"label": "бок", "points": to_mm(side)},
        ],
    )


def _cap_curve(cap_half: float, cap_rise: float) -> list[Point]:
    """Окат рукава: дуга от одного плечевого шва до другого.

    Дуга состоит из двух половин, сходящихся в вершине по центру: вершина
    должна быть точной точкой, иначе при зеркалировании детали край
    проходит по самому себе и контур считается самопересекающимся.
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


def _cap_length(cap_half: float, cap_rise: float) -> float:
    return polyline_length(_cap_curve(cap_half, cap_rise))


def _solve_cap_rise(cap_half: float, target_length: float) -> float:
    """Подобрать высоту оката под нужную длину дуги при заданной ширине.

    Ширина оката задана проймой и бицепсом, а длина дуги обязана совпасть
    с суммой длин пройм переда и спинки. Подбор идёт делением отрезка:
    длина дуги монотонна по высоте.
    """
    from .base import DraftError

    if target_length <= cap_half * 2 or cap_half <= 0:
        raise DraftError("Длина оката должна быть больше ширины рукава")
    low, high = 0.0, max(cap_half * 2.0, target_length)
    while _cap_length(cap_half, high) < target_length:
        high *= 2
    rise = cap_half * 0.28
    for _ in range(60):
        rise = (low + high) / 2.0
        if _cap_length(cap_half, rise) < target_length:
            low = rise
        else:
            high = rise
    return rise


def _solve_cap(target_length: float, cap_width: float, armhole_depth: float) -> tuple[float, float]:
    """Подобрать высоту оката под нужную длину дуги при заданной ширине.

    Ширина оката задана обхватом бицепса - это физиология руки, а не стиль.
    Длина оката должна совпасть с суммой длин пройм переда и спинки, иначе
    рукав либо стянет плечо, либо останется зазор.
    """
    cap_half = cap_width / 2.0
    return cap_half, _solve_cap_rise(cap_half, target_length)


def _sleeve(
    *,
    sleeve_length: float,
    biceps: float,
    target_cap_length: float,
    armhole_depth: float,
) -> Piece:
    """Рукав: окат подогнан под пройму, ширина - под бицепс.

    Длина оката обязана совпасть с суммой длин пройм переда и спинки, иначе
    рукав либо стянет плечо, либо останется зазор. Ширина рукава на уровне
    подмышки задана обхватом бицепса - рукав не может быть шире руки.

    Контур собирается целиком (без зеркалирования): окат идёт от левого
    плечевого шва через вершину к правому, дальше вниз по подмышке, через
    низ и обратно по левой стороне.
    """
    # Ширина рукава на уровне подмышки: половина обхвата бицепса с запасом.
    underarm_half = (biceps + 6.0) / 2.0
    # Окат уже рукава в подмышке: он идёт только над проймой.
    cap_half = min(underarm_half, target_cap_length * 0.45)
    cap_rise = _solve_cap_rise(cap_half, target_cap_length)
    underarm_drop = 4.0
    hem_half = max(underarm_half - 3.0, cap_half * 0.8)

    cap = _cap_curve(cap_half, cap_rise)

    points: list[Point] = []
    # Окат: от левого плечевого шва через вершину к правому.
    points.extend(cap)
    # Подмышка и боковой шов справа.
    points.append(Point(underarm_half, cap_rise + underarm_drop))
    points.append(Point(hem_half, sleeve_length))
    # Низ.
    points.append(Point(-hem_half, sleeve_length))
    # Подмышка и боковой шов слева.
    points.append(Point(-underarm_half, cap_rise + underarm_drop))
    # Замыкаем контур.
    points.append(points[0])

    outline = to_mm(points)
    grainline = (
        Point(0.0, (cap_rise + underarm_drop) * 10.0 + 20.0),
        Point(0.0, (sleeve_length - 3.0) * 10.0),
    )
    notches = [
        {"x": underarm_half * 10.0, "y": (cap_rise + underarm_drop) * 10.0, "label": "подмышка"},
        {"x": hem_half * 10.0, "y": sleeve_length * 10.0, "label": "низ"},
    ]
    return build_piece(
        "sleeve",
        "Рукав",
        outline,
        grainline=grainline,
        notches=notches,
        cut=2,
        mirrored=False,
        seam_edges=[{"label": "окат", "points": to_mm(cap)}],
    )
