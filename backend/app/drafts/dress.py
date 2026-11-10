"""Платье-футляр: базовая конструкция без рукавов.

Конструкция - общий лиф по полуобхватам (см. ``bodice.py``), продлённый
до длины платья: нагрудная вытачка у бока, вытачки по талии на переде и
спинке, боковой шов через линии груди, талии и бёдер. Платье только
женское.
"""

from __future__ import annotations

from .base import Piece, require
from .bodice import BodiceInput, build_bodice
from .closures import dress_closure
from .common import fit_multiplier

# Прибавка к глубине проймы платья: рука свободно проходит, пройма не режет.
ARMHOLE_EASE = 1.5


def build_dress(measurements: dict, params: dict) -> list[Piece]:
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
        garment_length,
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
        "garment_length",
        "waist_to_hip",
    )

    mult = fit_multiplier(str(params.get("fit", "regular")))
    length_delta = float(params.get("length_delta", 0.0))
    # Ширина горловины по ЕМКО: треть полуобхвата шеи плюс запас.
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
            length=garment_length + length_delta,
            gender="female",
            ease_bust=float(params.get("ease_bust", 8.0)) * mult,
            ease_waist=float(params.get("ease_waist", 3.0)) * mult,
            ease_hip=float(params.get("ease_hip", 4.0)) * mult,
            armhole_ease=ARMHOLE_EASE + max(0.0, mult - 1.0) * 1.5,
            neck_half=neck_half,
            front_neck_depth=neck_half + 1.0,
            back_neck_depth=neck_half / 3.0,
            front_shoulder_drop=3.0,
            back_shoulder_drop=2.0,
        )
    )
    # Застёжка: потайная молния в левом боковом шве (платье кроят со сгибом).
    dress_closure(bodice.front, bodice.back)
    return [bodice.front, bodice.back]


# Комбинация: тот же лиф, но вместо плеча - бретель по середине плеча.
SLIP_STRAP = 3.5
SLIP_ARMHOLE_EASE = 3.5


def build_slip(measurements: dict, params: dict) -> list[Piece]:
    """Сорочка-комбинация на цельнокроеных бретелях.

    Лиф платья по полуобхватам (``bodice.py``): горловина расширена до
    середины плеча, плечо сужено до ширины бретели, вырез переда глубокий
    (доля высоты груди), пройма ниже, чем у платья. Прибавки - полуприлегающий
    силуэт: комбинация надевается через голову.
    """
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
        garment_length,
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
        "garment_length",
        "waist_to_hip",
    )
    mult = fit_multiplier(str(params.get("fit", "regular")))
    length_delta = float(params.get("length_delta", 0.0))
    strap = max(SLIP_STRAP, float(params.get("strap_width", SLIP_STRAP)))
    # Бретель стоит посередине плеча: горловина доходит до её внутреннего края.
    neck_half = half_neck / 3.0 + 0.5 + max(0.0, shoulder_length - strap) * 0.5
    bodice = build_bodice(
        BodiceInput(
            half_bust=half_bust,
            half_waist=half_waist,
            half_hip=half_hip,
            half_neck=half_neck,
            back_waist_length=back_waist_length,
            front_waist_length=front_waist_length,
            shoulder_length=strap,
            bust_height=bust_height,
            bust_center=bust_center,
            armhole_depth=armhole_depth,
            waist_to_hip=waist_to_hip,
            length=garment_length + length_delta,
            gender="female",
            ease_bust=float(params.get("ease_bust", 6.0)) * mult,
            ease_waist=float(params.get("ease_waist", 8.0)) * mult,
            ease_hip=float(params.get("ease_hip", 6.0)) * mult,
            armhole_ease=SLIP_ARMHOLE_EASE + max(0.0, mult - 1.0) * 1.5,
            neck_half=neck_half,
            front_neck_depth=bust_height * float(params.get("neckline_depth", 0.6)),
            back_neck_depth=armhole_depth * 0.6,
            front_shoulder_drop=1.5,
            back_shoulder_drop=1.0,
            back_shoulder_ease=0.0,
        )
    )
    front, back = bodice.front, bodice.back
    front.name, back.name = "Перед комбинации", "Спинка комбинации"
    return [front, back]
