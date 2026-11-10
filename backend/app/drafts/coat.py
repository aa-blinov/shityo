"""Пальто: прямой силуэт с втачным рукавом и воротником.

Основа - общий лиф (см. ``bodice.py``) с большими прибавками: пальто
надевают поверх одежды, поэтому пройма глубже, а перед с бортом под
застёжку и отложным лацканом (подборт - отдельной деталью, воротник
притачивается от раскепа). Женское пальто получает нагрудную вытачку,
мужское - нет.
Рукав втачивается с посадкой 3,5 см (см. ``sleeve.py``).
"""

from __future__ import annotations

from ..core.geometry import polyline_length
from .base import Piece, require
from .bodice import BodiceInput, build_bodice
from .buttons import mark_front
from .common import fit_multiplier
from .shirt import _collar
from .sleeve import set_in_sleeve, sleeve_fits

ARMHOLE_EASE = 3.5
FRONT_OVERLAP = 3.0
CAP_EASE = 3.5
# Ширина рукава пальто не больше 0,78 длины оката: так окат получается
# высотой 14-15 см, как у классического втачного рукава верхней одежды. При
# 0,88 (предел для рубашки) окат пальто выходил плоским, 9-10 см, с заломами.
# Если рукав шире, пройму углубляют, а рукав не сужают.
COAT_CAP_WIDTH_SHARE = 0.78
# Лацкан: точка перегиба ниже горловины переда и ширина лацкана, см.
LAPEL_BREAK = 14.0
LAPEL_WIDTH = 8.0


def build_coat(measurements: dict, params: dict) -> list[Piece]:
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
        sleeve_length,
        biceps,
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
        "sleeve_length",
        "biceps",
    )

    mult = fit_multiplier(str(params.get("fit", "regular")))
    length_delta = float(params.get("length_delta", 0.0))
    sleeve_len = float(params.get("sleeve_length") or sleeve_length)
    gender = str(params.get("gender", "female"))
    # Горловина пальто шире: под ней одежда и воротник.
    neck_half = half_neck / 3.0 + 1.0

    def bodice_for(armhole_ease: float):
        return build_bodice(
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
                gender=gender,
                ease_bust=float(params.get("ease_bust", 14.0)) * mult,
                ease_waist=float(params.get("ease_waist", 12.0)) * mult,
                ease_hip=float(params.get("ease_hip", 12.0)) * mult,
                armhole_ease=armhole_ease,
                neck_half=neck_half,
                front_neck_depth=neck_half + 1.5,
                back_neck_depth=neck_half / 3.0,
                # Втачной рукав: плечевые точки переда и спинки на одной высоте,
                # иначе окат встаёт на одну точку, а плечевой шов кончается в двух.
                front_shoulder_drop=3.25,
                back_shoulder_drop=3.25,
                front_overlap=FRONT_OVERLAP,
                lapel_break=float(params.get("lapel_break", LAPEL_BREAK)),
                lapel_width=float(params.get("lapel_width", LAPEL_WIDTH)),
            )
        )

    def armhole_of(bodice) -> float:
        return polyline_length(bodice.front_armhole) + polyline_length(bodice.back_armhole)

    # Пройма мала для руки - её опускают шагом 1 см, как сделал бы конструктор.
    armhole_ease = ARMHOLE_EASE + max(0.0, mult - 1.0) * 2.0
    bodice = bodice_for(armhole_ease)
    for _ in range(20):
        if sleeve_fits(
            biceps=biceps,
            min_ease=10.0 * mult**0.5,
            armhole_length=armhole_of(bodice),
            cap_ease=CAP_EASE,
            share=COAT_CAP_WIDTH_SHARE,
        ):
            break
        # Ниже талии без 5 см пройму не опускают: дальше окат делается
        # пологим (см. set_in_sleeve), а лиф остаётся лифом.
        if armhole_depth + armhole_ease + 1.0 > back_waist_length - 5.0:
            break
        armhole_ease += 1.0
        bodice = bodice_for(armhole_ease)
    armhole = armhole_of(bodice)
    sleeve = set_in_sleeve(
        sleeve_length=sleeve_len,
        biceps=biceps,
        biceps_ease=10.0 * mult**0.5,
        armhole_length=armhole,
        cap_ease=CAP_EASE,
        hem_narrowing=2.0,
    )
    collar = _collar(
        neck_circ=half_neck * 2.0,
        target=polyline_length(bodice.front_neck) + polyline_length(bodice.back_neck),
    )
    # Три пуговицы: первая у точки перегиба лацкана, шаг 11 см.
    fold = next((n for n in bodice.front.notches if n["label"] == "перегиб"), None)
    if fold is not None:
        top = fold["y"] / 10.0
        mark_front(bodice.front, top=top, bottom=top + 22.0, count=3, diameter=2.5)
    pieces = [bodice.front, bodice.back, sleeve, collar]
    if bodice.facing is not None:
        pieces.append(bodice.facing)
    return pieces
