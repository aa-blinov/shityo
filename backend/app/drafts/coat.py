"""Простое пальто/плащ: базовая конструкция верхней одежды с рукавом.

Методика - удлинённая база без рукавов плюс рукав и отложной воротник:
- перед и спинка строятся от центра до бокового шва;
- ширина панели берётся от полуобхвата с большой прибавкой на свободу;
- боковой шов проходит через линии груди, талии и бёдер;
- передняя вытачка на грудь задаётся высотой и центром груди;
- горловина и плечо подгоняются под мерки шеи и длины плеча;
- рукав подгоняется под длину проймы, а воротник - под длину горловины.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, require, to_mm
from .common import body_side, build_piece, fit_multiplier, symmetric
from .shirt import _collar
from .tee import _armhole_points, _cap_curve, _solve_cap_rise


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

    fit = str(params.get("fit", "regular"))
    mult = fit_multiplier(fit)
    length_delta = float(params.get("length_delta", 0.0))
    sleeve_len = float(params.get("sleeve_length") or sleeve_length)

    # Большие прибавки: пальто надевается поверх одежды.
    ease_bust = float(params.get("ease_bust", 10.0)) * mult
    ease_waist = float(params.get("ease_waist", 8.0)) * mult
    ease_hip = float(params.get("ease_hip", 10.0)) * mult

    bust_width = (half_bust + ease_bust) / 2.0
    waist_width = (half_waist + ease_waist) / 2.0
    hip_width = (half_hip + ease_hip) / 2.0

    length = garment_length + length_delta
    hip_y_back = back_waist_length + waist_to_hip
    hip_y_front = front_waist_length + waist_to_hip

    if armhole_depth >= back_waist_length or armhole_depth >= front_waist_length:
        from .base import DraftError

        raise DraftError("Глубина проймы должна быть меньше длины до талии")
    if length <= max(back_waist_length, front_waist_length):
        from .base import DraftError

        raise DraftError("Длина пальто должна быть больше длины до талии")

    neck_half = half_neck / 3.0 + 1.0
    neck_depth = neck_half * 0.8
    shoulder_tip_x = min(bust_width - 0.5, neck_half + shoulder_length * 0.9)
    shoulder_drop = 3.5

    front = _coat_body(
        "front",
        "Перед",
        bust_width=bust_width,
        waist_width=waist_width,
        hip_width=hip_width,
        waist_y=front_waist_length,
        hip_y=hip_y_front,
        neck_half=neck_half,
        neck_depth=neck_depth,
        shoulder_drop=shoulder_drop,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=length,
        bust_height=bust_height,
        bust_center=bust_center,
        half_bust=half_bust,
        half_waist=half_waist,
        fold_label="середина переда",
    )
    back = _coat_body(
        "back",
        "Спинка",
        bust_width=bust_width,
        waist_width=waist_width,
        hip_width=hip_width,
        waist_y=back_waist_length,
        hip_y=hip_y_back,
        neck_half=neck_half,
        neck_depth=neck_depth * 0.5,
        shoulder_drop=shoulder_drop - 0.5,
        shoulder_tip_x=shoulder_tip_x,
        armhole_depth=armhole_depth,
        length=length,
        bust_height=bust_height,
        bust_center=bust_center,
        half_bust=half_bust,
        half_waist=half_waist,
        fold_label="середина спинки",
    )

    armhole_points = _armhole_points(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=bust_width,
        armhole_depth=armhole_depth,
    )
    armhole_length = polyline_length(armhole_points)
    sleeve = _coat_sleeve(
        sleeve_length=sleeve_len,
        biceps=biceps,
        target_cap_length=2.0 * armhole_length,
    )

    collar = _collar(
        neck_circ=half_neck * 2.0,
        neck_half=neck_half,
        neck_depth=neck_depth,
        neckline="crew",
    )

    return [front, back, sleeve, collar]


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


def _coat_body(
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
    bust_height: float,
    bust_center: float,
    half_bust: float,
    half_waist: float,
    fold_label: str,
) -> Piece:
    right: list[Point] = [Point(0.0, neck_depth)]
    neck_curve = _neck_curve(neck_half, neck_depth)
    right.extend(neck_curve[1:])
    shoulder_curve = _shoulder_curve(neck_half, shoulder_tip_x, shoulder_drop)
    right.extend(shoulder_curve[1:])
    armhole_curve = _armhole_points(
        shoulder_tip_x=shoulder_tip_x,
        shoulder_drop=shoulder_drop,
        half_width=bust_width,
        armhole_depth=armhole_depth,
    )
    right.extend(armhole_curve[1:])

    side_full = body_side(bust_width, waist_width, hip_width, armhole_depth, waist_y, hip_y, length)

    # Передняя вытачка на грудь, только на передней половине.
    dart_width = max(0.0, (half_bust - half_waist) / 6.0) if piece_id == "front" else 0.0
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
            "label": fold_label,
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
            {"label": "бок", "points": to_mm(side_full)},
        ],
    )


def _coat_sleeve(
    *,
    sleeve_length: float,
    biceps: float,
    target_cap_length: float,
) -> Piece:
    """Рукав пальто: свободный, с удлинённым низом."""
    underarm_half = (biceps + 10.0) / 2.0
    cap_half = min(underarm_half, target_cap_length * 0.45)
    cap_rise = _solve_cap_rise(cap_half, target_cap_length)
    underarm_drop = 5.0
    hem_half = max(underarm_half - 2.0, cap_half * 0.85)

    cap = _cap_curve(cap_half, cap_rise)

    points: list[Point] = []
    points.extend(cap)
    points.append(Point(underarm_half, cap_rise + underarm_drop))
    points.append(Point(hem_half, sleeve_length))
    points.append(Point(-hem_half, sleeve_length))
    points.append(Point(-underarm_half, cap_rise + underarm_drop))
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
