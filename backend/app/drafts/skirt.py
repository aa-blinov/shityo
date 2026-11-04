"""Юбка: расклешённая конструкция от пояса к подолу.

Методика сверена с MIT-эталоном FreeSewing (дизайны `sarah`, `sandy`)
(`docs/research/05-extracted-rules.json`):

- ширина пояса: четверть обхвата талии с прибавкой; прибавка берётся долей
  от разницы талии и бёдер, а не фиксированными сантиметрами;
- положение линии бёдер: из вертикальной мерки «от талии до бёдер»,
  а не из длины изделия;
- расклешение: доля от длины изделия, поэтому пропорции сохраняются на
  любой длине и любой фигуре.

Раскладка: полотнище рисуется от сгиба посередине до бокового шва и
зеркалится, поэтому полная ширина полотнища в поясе = (обхват + прибавка) / 2.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import Piece, bezier, require, to_mm
from .common import build_piece, fit_multiplier, symmetric


def build_skirt(measurements: dict, params: dict) -> list[Piece]:
    waist, hip, height, waist_to_hip, skirt_length = require(
        measurements,
        "waist",
        "hip",
        "height",
        "waist_to_hip",
        "skirt_length",
    )

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
    ease_waist = float(params.get("ease_waist", 4.0)) * mult
    ease_hip = float(params.get("ease_hip", 4.0)) * mult
    # Расклешение задаётся долей от длины изделия: прибавка на подол
    # пропорциональна длине, поэтому юбка сохраняет пропорции при любой
    # длине изделия.
    flare_ratio = float(params.get("flare_ratio", 0.12))
    length_delta = float(params.get("length_delta", 0.0))

    total_length = skirt_length + length_delta
    if total_length <= 4:
        from .base import DraftError

        raise DraftError("Длина юбки с поправкой должна быть больше 4 см")
    # Прибавка по поясу и по бёдрам - доля от разницы талии и бёдер:
    # у фигуры с заметной разницей прибавка автоматически больше.
    difference = max(0.0, hip - waist)
    waist_half = (waist + ease_waist + difference * 0.10) / 4.0
    hip_half = (hip + ease_hip + difference * 0.0625) / 4.0
    # Расклешение: доля от длины изделия.
    hem_half = hip_half + total_length * flare_ratio
    # Линия бёдер: из вертикальной мерки, а не из длины изделия.
    hip_y = min(waist_to_hip, total_length - 2.0)

    # Правая половина полотнища: от центра пояса вниз по боку до центра
    # подола. Полотнище симметрично, поэтому зеркалится.
    right: list[Point] = []
    right.append(Point(0.0, 0.0))
    right.append(Point(waist_half, 0.0))
    right.append(Point(hip_half, hip_y))
    side = bezier(
        (hip_half, hip_y),
        (hip_half + (hem_half - hip_half) * 0.25, hip_y + (total_length - hip_y) * 0.35),
        (hem_half - 0.5, total_length - (total_length - hip_y) * 0.25),
        (hem_half, total_length),
        segments=14,
    )
    right.extend(side[1:])
    hem = bezier(
        (hem_half, total_length),
        (hem_half * 0.6, total_length + 0.8),
        (hem_half * 0.25, total_length + 0.5),
        (0.0, total_length),
        segments=12,
    )
    right.extend(hem[1:])

    outline = symmetric(right)
    grainline = (
        Point(waist_half * 10.0 * 0.5, 20.0),
        Point(waist_half * 10.0 * 0.5, (total_length - 4.0) * 10.0),
    )
    notches = [
        {"x": waist_half * 10.0, "y": 0.0, "label": "бок"},
        {"x": 0.0, "y": 0.0, "label": "сгиб"},
    ]
    internal = [
        {
            "type": "fold",
            "points": [Point(0.0, 0.0), Point(0.0, total_length * 10.0)],
            "label": "сгиб",
        }
    ]
    # Полное полотнище (перед и спинка) кроится по сгибу, поэтому берётся
    # два раза. Обхват: полная ширина полотнища = 2 * waist_half, и таких
    # полотнищ два.
    return [
        build_piece(
            "skirt",
            "Юбка",
            to_mm(outline),
            grainline=grainline,
            notches=notches,
            internal_lines=internal,
            cut=2,
            mirrored=False,
            girth_cm=waist_half * 2.0 * 2.0,
        )
    ]
