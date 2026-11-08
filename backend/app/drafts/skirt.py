"""Юбка: прямая или расклешённая, перед и спинка с вытачками.

Методика ЕМКО СЭВ в упрощённом виде:

- ширина детали от середины до бокового шва: четверть обхвата бёдер с
  прибавкой; в поясе - четверть обхвата талии с прибавкой;
- разница талии и бёдер не уходит целиком в боковой шов (тогда на бедре
  получается угол): бок забирает не больше 2,5 см, остальное - вытачки;
  у спинки вытачка глубже и длиннее, чем у переда;
- бок у пояса поднят на 0,7 см и плавно переходит в линию бёдер;
- положение линии бёдер - из мерки «от талии до бёдер»;
- расклешение - доля от длины изделия, поэтому пропорции сохраняются на
  любой длине.

Перед и спинка кроятся со сгибом по середине.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import DraftError, Piece, bezier, require, to_mm
from .common import build_piece, fit_multiplier, rise_top, symmetric

MAX_SIDE_TAKE = 2.5
FRONT_DART_MAX, FRONT_DART_LENGTH = 2.5, 9.0
BACK_DART_MAX, BACK_DART_LENGTH = 3.5, 14.0
SIDE_RAISE = 0.7


def build_skirt(measurements: dict, params: dict) -> list[Piece]:
    waist, hip, height, waist_to_hip, skirt_length = require(
        measurements,
        "waist",
        "hip",
        "height",
        "waist_to_hip",
        "skirt_length",
    )

    mult = fit_multiplier(str(params.get("fit", "regular")))
    ease_waist = float(params.get("ease_waist", 2.0)) * mult
    ease_hip = float(params.get("ease_hip", 3.0)) * mult
    flare_ratio = float(params.get("flare_ratio", 0.12))
    length_delta = float(params.get("length_delta", 0.0))

    # Посадка по высоте: верх юбки ниже или выше талии, подол на том же уровне.
    top_girth, drop = rise_top(waist, hip, waist_to_hip, str(params.get("rise", "natural")))
    total_length = skirt_length + length_delta - drop
    if total_length <= waist_to_hip + 2.0:
        raise DraftError("Юбка должна быть длиннее линии бёдер")

    waist_w = (top_girth + ease_waist) / 4.0
    hip_w = (hip + ease_hip) / 4.0
    hip_y = waist_to_hip - drop
    hem_w = hip_w + total_length * flare_ratio
    # Спинка в поясе уже переда на 1 см: вытачки спинки глубже (ЕМКО).
    front_reduction = max(0.0, hip_w - (waist_w + 0.5))
    back_reduction = max(0.0, hip_w - (waist_w - 0.5))

    # Бок одинаков у переда и спинки, иначе боковые швы разной длины.
    # Бок берёт до 40 % сужения, но не больше 2,5 см - если только вытачки
    # не упёрлись в предел (очень большая разница талии и бёдер).
    side_take = min(MAX_SIDE_TAKE, 0.4 * front_reduction)
    side_take = max(side_take, front_reduction - FRONT_DART_MAX, back_reduction - BACK_DART_MAX)
    front_dart = max(0.0, front_reduction - side_take)
    back_dart = max(0.0, back_reduction - side_take)

    common = dict(
        hip_w=hip_w,
        hem_w=hem_w,
        hip_y=hip_y,
        total_length=total_length,
        side_take=side_take,
    )
    front = _panel("front", "Перед юбки", dart=front_dart, dart_length=FRONT_DART_LENGTH, **common)
    back = _panel("back", "Спинка юбки", dart=back_dart, dart_length=BACK_DART_LENGTH, **common)
    return [front, back]


def _panel(
    piece_id: str,
    name: str,
    *,
    hip_w: float,
    hem_w: float,
    hip_y: float,
    total_length: float,
    side_take: float,
    dart: float,
    dart_length: float,
) -> Piece:
    side_x = hip_w - side_take
    # Мелкую вытачку не шьют: её сужение остаётся в изделии.
    if dart < 0.5:
        dart = 0.0
    hip_curve = bezier(
        (side_x, -SIDE_RAISE),
        (side_x + side_take * 0.7, hip_y * 0.35),
        (hip_w, hip_y * 0.7),
        (hip_w, hip_y),
        segments=12,
    )
    flare = bezier(
        (hip_w, hip_y),
        (hip_w + (hem_w - hip_w) * 0.25, hip_y + (total_length - hip_y) * 0.35),
        (hem_w - 0.5, total_length - (total_length - hip_y) * 0.25),
        (hem_w, total_length),
        segments=14,
    )
    hem = bezier(
        (hem_w, total_length),
        (hem_w * 0.6, total_length + 0.8),
        (hem_w * 0.25, total_length + 0.5),
        (0.0, total_length),
        segments=12,
    )
    waist = bezier(
        (0.0, 0.0),
        (side_x * 0.5, 0.0),
        (side_x * 0.85, -SIDE_RAISE * 0.3),
        (side_x, -SIDE_RAISE),
        segments=8,
    )
    right = [*waist, *hip_curve[1:], *flare[1:], *hem[1:]]
    side = hip_curve + flare[1:]

    internal: list[dict] = [
        {
            "type": "fold",
            "points": to_mm([Point(0.0, 0.0), Point(0.0, total_length)]),
            "label": "середина",
        }
    ]
    if dart > 0:
        # Вытачка посередине между серединой и боком.
        x = side_x * 0.5
        half = dart / 2.0
        for sign in (1.0, -1.0):
            internal.append(
                {
                    "type": "dart",
                    "points": to_mm(
                        [
                            Point(sign * (x - half), 0.0),
                            Point(sign * x, min(dart_length, hip_y - 2.0)),
                            Point(sign * (x + half), 0.0),
                        ]
                    ),
                    "label": "вытачка",
                }
            )

    return build_piece(
        piece_id,
        name,
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 30.0), Point(0.0, (total_length - 4.0) * 10.0)),
        notches=[
            {"x": side_x * 10.0, "y": -SIDE_RAISE * 10.0, "label": "бок"},
            {"x": hip_w * 10.0, "y": hip_y * 10.0, "label": "бёдра"},
        ],
        internal_lines=internal,
        cut=1,
        mirrored=False,
        # Полная ширина детали в поясе за вычетом вытачек: две детали дают
        # обхват талии с прибавкой.
        girth_cm=2.0 * (side_x - dart),
        seam_edges=[
            {"label": "бок", "points": to_mm(side)},
            {"label": "пояс", "points": to_mm(waist)},
        ],
    )
