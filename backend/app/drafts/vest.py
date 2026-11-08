"""Жилет: безрукавная конструкция с застёжкой.

Основа - общий лиф (см. ``bodice.py``): глубокий вырез переда, длина до
линии бёдер, борт под пуговицы. Женский жилет получает нагрудную вытачку,
мужской - нет. Пройма глубже, чем у платья: жилет надевают на рубашку.
"""

from __future__ import annotations

from .base import Piece, require
from .bodice import BodiceInput, build_bodice
from .common import fit_multiplier

ARMHOLE_EASE = 2.5
# Ширина борта: заход одной полочки на другую под пуговицы.
FRONT_OVERLAP = 2.0


def build_vest(measurements: dict, params: dict) -> list[Piece]:
    (
        half_bust,
        half_waist,
        half_hip,
        half_neck,
        back_waist_length,
        front_waist_length,
        shoulder_length,
        bust_height,
        bust_center,
        armhole_depth,
        waist_to_hip,
    ) = require(
        measurements,
        "half_bust",
        "half_waist",
        "half_hip",
        "half_neck",
        "back_waist_length",
        "front_waist_length",
        "shoulder_length",
        "bust_height",
        "bust_center",
        "armhole_depth",
        "waist_to_hip",
    )

    mult = fit_multiplier(str(params.get("fit", "regular")))
    length_delta = float(params.get("length_delta", 0.0))
    neck_drop = float(params.get("neck_drop", 18.0))
    gender = str(params.get("gender", "female"))
    neck_half = half_neck / 3.0 + 0.5

    bodice = build_bodice(
        BodiceInput(
            half_bust=half_bust,
            half_waist=half_waist,
            half_hip=half_hip,
            half_neck=half_neck,
            back_waist_length=back_waist_length,
            front_waist_length=front_waist_length,
            shoulder_length=shoulder_length,
            bust_height=bust_height,
            bust_center=bust_center,
            armhole_depth=armhole_depth,
            waist_to_hip=waist_to_hip,
            # Жилет заканчивается на линии бёдер; длину меняет параметр.
            length=back_waist_length + waist_to_hip + length_delta,
            gender=gender,
            ease_bust=float(params.get("ease_bust", 6.0)) * mult,
            ease_waist=float(params.get("ease_waist", 4.0)) * mult,
            ease_hip=float(params.get("ease_hip", 4.0)) * mult,
            armhole_ease=ARMHOLE_EASE + max(0.0, mult - 1.0) * 1.5,
            neck_half=neck_half,
            front_neck_depth=neck_drop,
            back_neck_depth=neck_half / 3.0,
            front_shoulder_drop=3.0,
            back_shoulder_drop=2.0,
            front_overlap=FRONT_OVERLAP,
        )
    )
    return [bodice.front, bodice.back]
