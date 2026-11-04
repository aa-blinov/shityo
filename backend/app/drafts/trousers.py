"""Брюки: передняя и задняя штанины.

Методика сверена с MIT-эталоном FreeSewing (дизайн `titan`)
(`docs/research/05-extracted-rules.json`):

- ширина детали в поясе: четверть обхвата с прибавкой, и деталей четыре
  (две штанины, перед и спинка);
- баланс ширины передней и задней штанины: около 57 % назад, 43 % вперёд -
  ягодицы требуют именно такого распределения;
- вынос точки шага: доля от ширины бедра, а не фиксированные сантиметры;
- ширина низа: из обхвата колена, а не сужением от пояса;
- глубина шага: из вертикальной мерки «от талии до верхней части бедра»;
- точки снятия мерок: дуги талии и бёдер делятся по-настоящему, а не
  пополам.

Раскладка половинки штанины (сантиметры черчения):
- x = 0 - боковой шов: передняя и задняя штанины сшиваются по этой линии,
  поэтому каждая деталь кроится попарно (cut = 2);
- верхняя кромка - пояс, от бокового шва (x=0) к переднему сгибу (x=W);
- кривая переднего сгиба идёт от переднего сгиба пояса вниз к точке шага,
  откуда внутренний шов спускается к низу.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, require, to_mm
from .common import build_piece, fit_multiplier

# Доля ширины штанины, приходящаяся на заднюю деталь.
LEG_BALANCE_BACK = 0.575
# Прибавка к обхвату колена.
KNEE_EASE = 6.0


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

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
    ease_waist = float(params.get("ease_waist", 8.0)) * mult
    ease_hip = float(params.get("ease_hip", 6.0)) * mult
    length_delta = float(params.get("length_delta", 0.0))

    # Четверть обхвата с прибавкой: полный обхват делят на четыре детали
    # (две штанины, перед и спинка).
    quarter_waist = (waist + ease_waist) / 4.0
    quarter_hip = (hip + ease_hip) / 4.0

    # Баланс перед/зад: задняя штанина шире, ягодицы требуют этого.
    back_waist = quarter_waist * 2.0 * LEG_BALANCE_BACK
    back_hip = quarter_hip * 2.0 * LEG_BALANCE_BACK
    front_waist = quarter_waist * 2.0 - back_waist
    front_hip = quarter_hip * 2.0 - back_hip

    # Ширина низа: из обхвата колена, сужение низа - стилистическое решение.
    knee_total = knee_circumference + KNEE_EASE
    knee_front = knee_total * (1.0 - LEG_BALANCE_BACK)
    knee_back = knee_total * LEG_BALANCE_BACK

    total_length = crotch_depth + inseam_length + length_delta
    knee_y = crotch_depth + knee_length
    hip_y = crotch_depth * 0.5

    if total_length <= crotch_depth or not crotch_depth < knee_y < total_length:
        from .base import DraftError

        raise DraftError("Колено должно находиться между линией шага и низом брюк")
    # Одинаковое смещение внутреннего шва даёт равные длины переда и спинки.
    inseam_run = max(front_hip * 1.25 - knee_front, back_hip * 1.25 - knee_back, 1.0)

    # Вынос точки шага: доля от ширины бедра.
    front = _leg(
        "front",
        "Перед",
        waist_width=front_waist,
        hip_width=front_hip,
        knee_width=knee_front,
        crotch_depth=crotch_depth,
        total_length=total_length,
        knee_y=knee_y,
        hip_y=hip_y,
        inseam_run=inseam_run,
    )
    back = _leg(
        "back",
        "Спинка",
        waist_width=back_waist,
        hip_width=back_hip,
        knee_width=knee_back,
        crotch_depth=crotch_depth,
        total_length=total_length,
        knee_y=knee_y,
        hip_y=hip_y,
        inseam_run=inseam_run,
    )
    return [front, back]


def _leg(
    piece_id: str,
    name: str,
    *,
    waist_width: float,
    hip_width: float,
    knee_width: float,
    crotch_depth: float,
    total_length: float,
    knee_y: float,
    hip_y: float,
    inseam_run: float,
) -> Piece:
    """Половинка штанины: сгиб бокового шва слева, передний сгиб справа."""
    # Вынос точки шага: четверть ширины бедра, вынесенный внутрь.
    crotch_x = knee_width + inseam_run
    # Низ по ширине колена, но не уже половины бедра.
    hem_width = knee_width

    points: list[Point] = []
    # Пояс: от сгиба бокового шва к переднему сгибу.
    points.append(Point(0.0, 0.0))
    points.append(Point(waist_width, 0.0))
    # Передний сгиб: пояс -> бедро -> кривая шага.
    hip_edge = bezier(
        (waist_width, 0.0),
        (waist_width + 0.5, hip_y * 0.4),
        (hip_width, hip_y * 0.85),
        (hip_width, hip_y),
        segments=10,
    )
    points.extend(hip_edge[1:])
    rise = bezier(
        (hip_width, hip_y),
        (hip_width - 0.3, hip_y + (crotch_depth - hip_y) * 0.45),
        (crotch_x + 1.5, crotch_depth - 2.0),
        (crotch_x, crotch_depth),
        segments=12,
    )
    points.extend(rise[1:])
    # Внутренний шов: от точки шага вниз к низу.
    inseam = bezier(
        (crotch_x, crotch_depth),
        (crotch_x, crotch_depth + (knee_y - crotch_depth) * 0.35),
        (hem_width, knee_y - (knee_y - crotch_depth) * 0.35),
        (hem_width, knee_y),
        segments=12,
    )
    # inseam_length is measured along the sewing path, not its Y projection.
    target_inseam = total_length - crotch_depth
    total_length = knee_y + target_inseam - polyline_length(inseam)
    if total_length <= knee_y:
        from .base import DraftError

        raise DraftError("Длины шагового шва недостаточно для заданного положения колена")
    inseam.append(Point(hem_width, total_length))
    points.extend(inseam[1:])
    # Низ: от внутреннего шва к сгибу бокового шва.
    points.append(Point(0.0, total_length))
    # Сгиб бокового шва: от низа к поясу.
    points.append(points[0])

    outline = to_mm(points)
    grainline = (
        Point(waist_width * 10.0 * 0.3, 20.0),
        Point(waist_width * 10.0 * 0.3, (total_length - 5.0) * 10.0),
    )
    notches = [
        {"x": 0.0, "y": 0.0, "label": "бок"},
        {"x": crotch_x * 10.0, "y": crotch_depth * 10.0, "label": "шаг"},
        {"x": hem_width * 10.0, "y": total_length * 10.0, "label": "низ"},
    ]
    internal = [
        {
            "type": "center_line",
            "points": [Point(0.0, 0.0), Point(0.0, total_length * 10.0)],
            "label": "боковой шов",
        }
    ]
    # Обхват: деталь штанины закрывает четверть обхвата, и таких деталей
    # четыре (две штанины, перед и спинка).
    return build_piece(
        piece_id,
        name,
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=2,
        mirrored=False,
        girth_cm=waist_width * 2.0,
        seam_edges=[
            {"label": "шаг", "points": to_mm(inseam)},
            {"label": "средний", "points": to_mm(hip_edge + rise[1:])},
            {"label": "бок", "points": to_mm([Point(0, 0), Point(0, total_length)])},
        ],
    )
