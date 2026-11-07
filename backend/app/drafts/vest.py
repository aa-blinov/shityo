"""Жилет: базовая безрукавная конструкция.

Методика близка к платью-футляру, но с более глубокой горловиной,
укороченной длиной до линии бёдер и меньшими прибавками.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import Piece, bezier, require, to_mm
from .common import body_side, build_piece, fit_multiplier, symmetric


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

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
    length_delta = float(params.get("length_delta", 0.0))
    neck_drop = float(params.get("neck_drop", 18.0))

    ease_bust = float(params.get("ease_bust", 2.0)) * mult
    ease_waist = float(params.get("ease_waist", 1.0)) * mult
    ease_hip = float(params.get("ease_hip", 2.5)) * mult

    bust_width = (half_bust + ease_bust) / 2.0
    waist_width = (half_waist + ease_waist) / 2.0
    hip_width = (half_hip + ease_hip) / 2.0

    hip_y_back = back_waist_length + waist_to_hip
    hip_y_front = front_waist_length + waist_to_hip

    # Жилет заканчивается между талией и бёдрами, по умолчанию на уровне бёдер.
    # Перед и спинка используют одну общую длину, чтобы боковые швы совпадали.
    length = max(hip_y_back, hip_y_front) + length_delta

    if armhole_depth >= back_waist_length or armhole_depth >= front_waist_length:
        from .base import DraftError

        raise DraftError("Глубина проймы должна быть меньше длины до талии")
    if length <= max(back_waist_length, front_waist_length):
        from .base import DraftError

        raise DraftError("Длина жилета должна быть больше длины до талии")

    neck_half = half_neck / 3.0 + 0.5
    shoulder_tip_x = min(bust_width - 0.5, neck_half + shoulder_length * 0.9)

    front = _vest_front(
        bust_width=bust_width,
        waist_width=waist_width,
        hip_width=hip_width,
        waist_y=front_waist_length,
        hip_y=hip_y_front,
        neck_half=neck_half,
        neck_depth=neck_drop,
        shoulder_drop=3.0,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=length,
        bust_height=bust_height,
        bust_center=bust_center,
        half_bust=half_bust,
        half_waist=half_waist,
    )
    back = _vest_body(
        "back",
        "Спинка",
        bust_width=bust_width,
        waist_width=waist_width,
        hip_width=hip_width,
        waist_y=back_waist_length,
        hip_y=hip_y_back,
        neck_half=neck_half,
        neck_depth=neck_half / 3.0,
        shoulder_drop=2.0,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=length,
    )
    return [front, back]


def _neck_curve(neck_half: float, neck_depth: float) -> list[Point]:
    return bezier(
        (0.0, neck_depth),
        (neck_half * 0.35, neck_depth * 0.55),
        (neck_half * 0.75, neck_depth * 0.1),
        (neck_half, 0.0),
        segments=10,
    )


def _shoulder_curve(neck_half: float, shoulder_tip_x: float, shoulder_drop: float) -> list[Point]:
    return bezier(
        (neck_half, 0.0),
        (neck_half + (shoulder_tip_x - neck_half) * 0.4, shoulder_drop * 0.25),
        (shoulder_tip_x - 1.5, shoulder_drop * 0.85),
        (shoulder_tip_x, shoulder_drop),
        segments=10,
    )


def _armhole_curve(
    shoulder_tip_x: float, shoulder_drop: float, bust_width: float, armhole_depth: float
) -> list[Point]:
    return bezier(
        (shoulder_tip_x, shoulder_drop),
        (shoulder_tip_x, shoulder_drop + (armhole_depth - shoulder_drop) * 0.55),
        (bust_width - 1.0, armhole_depth - 2.0),
        (bust_width, armhole_depth),
        segments=14,
    )


def _vest_front(
    *,
    bust_width: float,
    waist_width: float,
    hip_width: float,
    waist_y: float,
    hip_y: float,
    neck_half: float,
    neck_depth: float,
    shoulder_drop: float,
    shoulder_tip_x: float,
    armhole_depth: float,
    length: float,
    bust_height: float,
    bust_center: float,
    half_bust: float,
    half_waist: float,
) -> Piece:
    right: list[Point] = [Point(0.0, neck_depth)]
    neck_curve = _neck_curve(neck_half, neck_depth)
    right.extend(neck_curve[1:])
    shoulder_curve = _shoulder_curve(neck_half, shoulder_tip_x, shoulder_drop)
    right.extend(shoulder_curve[1:])
    armhole_curve = _armhole_curve(shoulder_tip_x, shoulder_drop, bust_width, armhole_depth)
    right.extend(armhole_curve[1:])

    side_full = body_side(bust_width, waist_width, hip_width, armhole_depth, waist_y, hip_y, length)

    dart_width = max(0.0, (half_bust - half_waist) / 6.0)
    dart_tip = Point(bust_center / 2.0, waist_y - bust_height)
    waist_idx = 0
    for i, p in enumerate(side_full):
        if abs(p.y - waist_y) < 0.001:
            waist_idx = i
            break

    right.extend(side_full[1 : waist_idx + 1])

    if dart_width > 0.3:
        seam_delta = max(1.0, dart_width)
        target_y = min(waist_y + seam_delta, hip_y - 0.5, length - 0.5)
        bottom_base: Point | None = None
        bottom_idx = waist_idx
        for j in range(waist_idx, len(side_full) - 1):
            a, b = side_full[j], side_full[j + 1]
            if (a.y <= target_y <= b.y) or (b.y <= target_y <= a.y):
                if abs(b.y - a.y) < 1e-9:
                    frac = 0.0
                else:
                    frac = (target_y - a.y) / (b.y - a.y)
                bottom_base = Point(a.x + (b.x - a.x) * frac, target_y)
                bottom_idx = j
                break
        if bottom_base is None:
            bottom_base = side_full[-1]
            bottom_idx = len(side_full) - 2

        right.append(dart_tip)
        right.append(bottom_base)
        right.extend(side_full[bottom_idx + 1 :])
    else:
        right.extend(side_full[waist_idx + 1 :])

    right.append(Point(0.0, length))

    outline = to_mm(symmetric(right))

    notches = [
        {"x": bust_width * 10.0, "y": armhole_depth * 10.0, "label": "пройма"},
        {"x": side_full[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]

    internal: list[dict] = [
        {
            "type": "fold",
            "points": to_mm([Point(0.0, 0.0), Point(0.0, length)]),
            "label": "середина переда",
        }
    ]

    grainline = (Point(0.0, 30.0), Point(0.0, (length - 3.0) * 10.0))

    return build_piece(
        "front",
        "Перед",
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=1,
        mirrored=False,
        girth_cm=bust_width * 2.0,
        seam_edges=[
            {"label": "пройма", "points": to_mm(armhole_curve)},
            {"label": "горловина", "points": to_mm(neck_curve)},
            {"label": "плечо", "points": to_mm(shoulder_curve)},
            {"label": "бок", "points": to_mm(side_full)},
        ],
    )


def _vest_body(
    piece_id: str,
    name: str,
    *,
    bust_width: float,
    waist_width: float,
    hip_width: float,
    waist_y: float,
    hip_y: float,
    neck_half: float,
    neck_depth: float,
    shoulder_drop: float,
    shoulder_tip_x: float,
    armhole_depth: float,
    length: float,
) -> Piece:
    right: list[Point] = [Point(0.0, neck_depth)]

    neck_curve = _neck_curve(neck_half, neck_depth)
    right.extend(neck_curve[1:])

    shoulder_curve = _shoulder_curve(neck_half, shoulder_tip_x, shoulder_drop)
    right.extend(shoulder_curve[1:])

    armhole_curve = _armhole_curve(shoulder_tip_x, shoulder_drop, bust_width, armhole_depth)
    right.extend(armhole_curve[1:])

    side = body_side(bust_width, waist_width, hip_width, armhole_depth, waist_y, hip_y, length)
    right.extend(side[1:])
    right.append(Point(0.0, length))

    outline = to_mm(symmetric(right))

    notches = [
        {"x": bust_width * 10.0, "y": armhole_depth * 10.0, "label": "пройма"},
        {"x": side[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]

    internal: list[dict] = [
        {
            "type": "fold",
            "points": to_mm([Point(0.0, 0.0), Point(0.0, length)]),
            "label": "середина спинки",
        }
    ]

    grainline = (Point(0.0, 30.0), Point(0.0, (length - 3.0) * 10.0))

    return build_piece(
        piece_id,
        name,
        outline,
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=1,
        mirrored=False,
        girth_cm=bust_width * 2.0,
        seam_edges=[
            {"label": "пройма", "points": to_mm(armhole_curve)},
            {"label": "горловина", "points": to_mm(neck_curve)},
            {"label": "плечо", "points": to_mm(shoulder_curve)},
            {"label": "бок", "points": to_mm(side)},
        ],
    )
