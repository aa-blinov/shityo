"""Футболка: параметрическая конструкция.

Методика сверена с MIT-эталоном FreeSewing (`docs/research/05-extracted-rules.json`),
поэтому формулы здесь опираются на вертикальные мерки, а не на эвристики
вида «обхват/4 + 6»:

- ширина панели: (обхват груди + прибавка) / 2 в готовом виде, то есть
  (обхват + прибавка) / 4 от центра до бокового шва;
- глубина проймы: мерка тела «от шеи до талии» минус «от талии до
  подмышки» плюс прибавка, которая растёт со свободой изделия;
- плечевая точка: из ширины плеча; пройма при этом не уже минимальной
  доли обхвата груди - иначе рукав не втачать;
- горловина по ЕМКО: глубина спинки - треть ширины выреза, глубина переда
  круглого выреза - ширина плюс 1 см; ширина подбирается так, чтобы длина
  выреза равнялась обхвату шеи с прибавкой;
- рукав: окат под длину проймы с посадкой, ширина из обхвата бицепса
  (см. ``sleeve.py``);
- наклон плеча: из угла наклона, а не из константы;
- низ изделия: из обхвата бёдер, а не возвратом к ширине груди.

Все числа детерминированы и проверяются тестами, поэтому результат
воспроизводится байт в байт.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, require, to_mm
from .common import body_side, build_piece, fit_multiplier, overrides_of, symmetric
from .sleeve import deepen_for_sleeve, set_in_sleeve

# Глубина выреза переда для фасонных горловин как доля длины «от шеи до
# талии». Круглая горловина строится по ширине выреза (см. _solve_neck).
NECK_DEPTH_RATIOS = {"crew": 0.0, "v": 0.45, "square": 0.2, "scoop": 0.28}
# Прибавка к глубине проймы - доля прибавки по груди.
ARMHOLE_EASE_SHARE = 0.25
# Наименьшая ширина проймы одной детали: доля обхвата груди и прибавки.
ARMHOLE_WIDTH_BUST = 0.035
ARMHOLE_WIDTH_EASE = 0.1
# Ширина плеча меряется по спине: на плоском чертеже точка плеча ближе.
SHOULDER_CURVE = 2.0
# Доля, снимаемая от обхвата шеи в запас на свободу.
NECK_EASE = 2.0


def _neck_depth_ratio(neckline: str) -> float:
    return NECK_DEPTH_RATIOS.get(neckline, NECK_DEPTH_RATIOS["crew"])


@dataclass(frozen=True)
class KnitStyle:
    """Отличия трикотажных изделий друг от друга при общей основе.

    Футболка, свитшот, худи и джемпер строятся одной конструкцией:
    различаются прибавки, посадка и сужение рукава, высота притачной
    трикотажной резинки (пояс и манжеты забирают часть длины) и заниженное
    плечо в свободных посадках.
    """

    ease_bust: float = 8.0
    ease_length: float = 2.0
    biceps_ease: float = 4.0
    cap_ease: float = 0.5
    hem_narrowing: float = 3.0
    # Высота готового пояса и манжеты: на столько короче изделие и рукав.
    body_band: float = 0.0
    sleeve_band: float = 0.0
    # Заниженное плечо на единицу превышения посадки над классической:
    # у оверсайза (коэффициент 2,4) плечо уходит на руку на 5,6 см.
    drop_per_fit: float = 4.0
    # Короткий рукав, см: длина от плечевой точки (параметр
    # short_sleeve_length). None - рукав по мерке руки (лонгслив и кофты).
    short_sleeve: float | None = None


@dataclass
class KnitTop:
    pieces: list[Piece] = field(default_factory=list)
    # Обхват по низу изделия, по низу рукава и длина всей горловины, см.
    hem_girth: float = 0.0
    sleeve_hem_girth: float = 0.0
    neckline_length: float = 0.0
    neck_half: float = 0.0
    body_length: float = 0.0
    hip_half: float = 0.0


# Футболка - с коротким рукавом: до середины плеча, около 20 см от плечевой
# точки. С рукавом по мерке руки это лонгслив (build_longsleeve).
TEE_SLEEVE = 20.0


def build_tee(measurements: dict, params: dict) -> list[Piece]:
    return build_knit_top(measurements, params, KnitStyle(short_sleeve=TEE_SLEEVE)).pieces


def build_longsleeve(measurements: dict, params: dict) -> list[Piece]:
    """Лонгслив: та же основа, что у футболки, рукав - по мерке руки."""
    return build_knit_top(measurements, params, KnitStyle()).pieces


def build_knit_top(measurements: dict, params: dict, style: KnitStyle) -> KnitTop:
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
    ease_bust = float(params.get("ease_bust", style.ease_bust)) * mult
    ease_length = float(params.get("ease_length", style.ease_length)) * mult
    # Заниженное плечо свободных посадок: плечевой шов уходит на руку, рукав
    # на столько же короче (Vykroyka: у оверсайза плечо длиннее на 6-12 см).
    shoulder_drop_out = max(0.0, mult - 1.0) * style.drop_per_fit
    length_delta = float(params.get("length_delta", 0.0))
    neckline = str(params.get("neckline", "crew"))
    # Короткий рукав задаётся своим параметром, а не «Длиной рукава»: та
    # заодно мерка руки, и по ней в 3D строится рука манекена.
    if style.short_sleeve is not None:
        sleeve_len = float(params.get("short_sleeve_length") or style.short_sleeve)
    else:
        sleeve_len = float(params.get("sleeve_length") or sleeve_length)

    # Ширина панели от центра до бокового шва.
    half_width = (bust + ease_bust) / 4.0
    # Трикотажный верх не повторяет талию: у мужского изделия бок почти
    # прямой (до 0,5 см на шов), у женского - до 1,5 см; прилегающая посадка
    # сужает сильнее, свободные - не сужают. Иначе футболка выходит
    # «песочными часами», какой её никто не шьёт.
    gender = str(params.get("gender", "female"))
    side_shaping = (0.5 if gender == "male" else 1.5) * max(0.0, 2.0 - mult)
    waist_half = max((waist + ease_bust) / 4.0, half_width - side_shaping)
    # Низ изделия держит обхват бёдер: если бёдра шире груди, изделие
    # расширяется книзу, иначе оно не налезет на фигуру.
    hip_half = (hip + ease_bust) / 4.0

    # Глубина проймы: от верхней точки плеча до подмышки. Считается из
    # вертикальных мерок, поэтому пройма масштабируется с фигурой.
    # Глубину проймы и положение плечевой точки можно переопределить из
    # редактора: точка на раскладке - источник правды, а не мерка.
    overrides = overrides_of(params)
    armhole_depth = overrides.get(
        "armhole_depth", neck_to_waist - waist_to_armpit + ease_bust * ARMHOLE_EASE_SHARE
    )

    # Горловина подбирается под обхват шеи: длина выреза переда и спинки
    # вместе должна равняться обхвату шеи с прибавкой.
    neck_half, neck_depth, back_neck_depth = _solve_neck(
        target=neck_circ + NECK_EASE,
        neck_depth_ratio=_neck_depth_ratio(neckline),
        neck_to_waist=neck_to_waist,
        neckline=neckline,
    )

    # Плечевая точка и наклон плеча из угла. Угол наклона отсчитывается по
    # плечевому шву: от горловины до плечевой точки, а не от всей ширины
    # плеча. Иначе плечо получается слишком крутым, а пройма - слишком
    # короткой, и рукав в неё не входит.
    shoulder_tip_x = overrides.get(
        "shoulder_tip_x",
        shoulder_tip(shoulder_width, bust, ease_bust, half_width, shoulder_drop_out),
    )
    shoulder_run = max(shoulder_tip_x - neck_half, 1.0)
    shoulder_drop = shoulder_run * _tan(shoulder_slope)

    body_length = back_length + length_delta + ease_length - style.body_band
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
            min_ease=style.biceps_ease * mult**0.5,
            cap_ease=style.cap_ease,
        )
    if armhole_depth <= shoulder_drop or body_length <= armhole_depth + 6:
        from .base import DraftError

        raise DraftError("Пройма должна быть ниже плеча и выше низа изделия")
    waist_y = neck_to_waist
    # Waist-to-hip length comes from the client's measurements: the side
    # seam passes through the hip line at exactly that height.
    hip_y = waist_y + waist_to_hip

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
        # Вырез спинки неглубокий: треть ширины горловины.
        neck_depth=back_neck_depth,
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
    # Трикотаж тянется: посадка оката почти нулевая.
    sleeve = set_in_sleeve(
        sleeve_length=sleeve_len - shoulder_drop_out - style.sleeve_band,
        biceps=biceps,
        biceps_ease=style.biceps_ease * mult**0.5,
        armhole_length=2.0 * armhole_length,
        cap_ease=style.cap_ease,
        hem_narrowing=style.hem_narrowing,
        min_ease=0.0,
        # Обхват запястья по типовой пропорции к бицепсу плюс свобода трикотажа.
        wrist_girth=biceps * 0.55 + 4.0 + 6.0 * mult**0.5,
    )

    def edge(piece: Piece, label: str) -> float:
        points = next(e["points"] for e in piece.seam_edges if e["label"] == label)
        return polyline_length(points) / 10.0

    return KnitTop(
        pieces=[front, back, sleeve],
        hem_girth=4.0 * front.notches[1]["x"] / 10.0,
        sleeve_hem_girth=2.0 * sleeve.notches[1]["x"] / 10.0,
        neckline_length=2.0 * (edge(front, "горловина") + edge(back, "горловина")),
        neck_half=neck_half,
        body_length=body_length,
        hip_half=hip_half,
    )


def shoulder_tip(
    shoulder_width: float,
    bust: float,
    ease_bust: float,
    half_width: float,
    dropped: float = 0.0,
) -> float:
    """Плечевая точка: из ширины плеча, но пройма не уже минимальной.

    Ширину плеча меряют по спине, по выпуклости лопаток; на плоском чертеже
    точка плеча ближе к середине на SHOULDER_CURVE см. Если плечи широкие,
    а грудь узкая, пройма сохраняет минимальную ширину - иначе рукав не
    втачать.
    """
    min_armhole = bust * ARMHOLE_WIDTH_BUST + ease_bust * ARMHOLE_WIDTH_EASE
    return min(shoulder_width / 2.0 - SHOULDER_CURVE + dropped, half_width - min_armhole)


def _tan(degrees: float) -> float:
    import math

    return math.tan(math.radians(degrees))


def _neckline_points(neck_half: float, neck_depth: float, neckline: str = "crew") -> list[Point]:
    """Линия горловины переда: от центра к плечевому шву."""
    if neckline == "v":
        return [Point(0.0, neck_depth), Point(neck_half, 0.0)]
    if neckline == "square":
        return [Point(0.0, neck_depth), Point(neck_half, neck_depth), Point(neck_half, 0.0)]
    # Четверть эллипса (контрольные точки 0,552): ровная круглая горловина
    # без «клюва» в середине переда.
    return bezier(
        (0.0, neck_depth),
        (neck_half * 0.552, neck_depth),
        (neck_half, neck_depth * 0.448),
        (neck_half, 0.0),
        segments=16,
    )


def _neck_depths(
    neck_half: float, neck_depth_ratio: float, neck_to_waist: float
) -> tuple[float, float]:
    """Глубина выреза переда и спинки по ширине горловины (ЕМКО)."""
    back = neck_half / 3.0
    if neck_depth_ratio <= 0:
        return neck_half + 1.0, back
    return max(neck_half + 1.0, neck_to_waist * neck_depth_ratio), back


def _solve_neck(
    *,
    target: float,
    neck_depth_ratio: float,
    neck_to_waist: float,
    neckline: str = "crew",
) -> tuple[float, float, float]:
    """Подобрать ширину выреза под обхват шеи.

    Возвращает половину ширины горловины, глубину переда и глубину спинки.
    Длина выреза переда плюс спинки, умноженная на два (вырез зеркалится),
    должна дать обхват шеи с прибавкой. Длина монотонна по ширине, поэтому
    подбор идёт делением отрезка. Глубокий фасонный вырез может быть длиннее
    шеи сам по себе - тогда ширина не меньше 4 см.
    """

    def opening(half: float) -> float:
        front, back = _neck_depths(half, neck_depth_ratio, neck_to_waist)
        return 2.0 * (
            polyline_length(_neckline_points(half, front, neckline))
            + polyline_length(_neckline_points(half, back))
        )

    if neck_depth_ratio > 0:
        # Фасонный вырез (V, каре, лодочка) длиннее шеи: ширину не подбирают
        # по длине, а берут по ЕМКО - треть полуобхвата шеи плюс 0,5 см.
        neck_half = max(4.0, target / 6.0 + 0.5)
        front, back = _neck_depths(neck_half, neck_depth_ratio, neck_to_waist)
        return neck_half, front, back
    target = max(target, opening(4.0))
    low, high = 0.01, max(30.0, target)
    neck_half = 10.0
    for _ in range(60):
        neck_half = (low + high) / 2.0
        if opening(neck_half) < target:
            low = neck_half
        else:
            high = neck_half
    front, back = _neck_depths(neck_half, neck_depth_ratio, neck_to_waist)
    return neck_half, front, back


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
