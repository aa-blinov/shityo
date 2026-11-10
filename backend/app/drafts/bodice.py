"""Лиф по полуобхватам: общая основа платья, жилета и пальто.

Методика ЕМКО СЭВ в упрощённом виде:

- ширина детали от середины до бокового шва - четверть обхвата груди с
  прибавкой; прибавка задаётся к полному обхвату, как во всех моделях;
- глубина проймы - мерка тела плюс прибавка изделия (платье меньше,
  пальто больше): иначе рука не проходит в пройму;
- точка груди стоит на высоте груди (Вг) от шейной точки и на половине
  центра груди (Цг) от середины переда;
- женский перед длиннее спинки на разницу длин до талии (Дтп - Дтс). Эту
  разницу забирает боковая нагрудная вытачка, направленная в точку груди:
  после её закрытия боковые швы переда и спинки равны;
- талия формируется поровну боковым швом и вытачками по талии; боковые
  швы переда и спинки сужаются одинаково, ни одна вытачка не глубже 3 см;
- у изделий с застёжкой перед кроится двумя половинами с бортом.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from ..core.geometry import Point
from .base import DraftError, Piece, bezier, to_mm
from .common import body_side, build_piece, cervical_rise, symmetric

# Доля сужения к талии, которую забирают вытачки (остальное - боковой шов).
# Если вытачка упирается в предел, лишнее сужение просто не делается:
# футляр становится чуть свободнее по талии, но не перекашивается.
DART_SHARE = 0.5
MAX_DART = 3.0
# Насколько вершина нагрудной вытачки не доходит до точки груди.
BUST_DART_SHORTEN = 2.0
# Положение боковой нагрудной вытачки: столько ниже проймы.
BUST_DART_BELOW_ARMHOLE = 5.0


@dataclass(frozen=True)
class BodiceInput:
    half_bust: float
    half_waist: float
    half_hip: float
    half_neck: float
    back_waist_length: float
    front_waist_length: float
    shoulder_length: float
    bust_height: float
    bust_center: float
    armhole_depth: float
    waist_to_hip: float
    length: float
    gender: str
    ease_bust: float
    ease_waist: float
    ease_hip: float
    armhole_ease: float
    neck_half: float
    front_neck_depth: float
    back_neck_depth: float
    front_shoulder_drop: float
    back_shoulder_drop: float
    front_overlap: float = 0.0
    # Лацкан: точка перегиба на столько ниже горловины переда, ширина лацкана.
    lapel_break: float = 0.0
    lapel_width: float = 0.0
    # Посадка плеча спинки, см; у комбинации плечо - бретель, посадки нет.
    back_shoulder_ease: float = 0.7


@dataclass(frozen=True)
class Bodice:
    front: Piece
    back: Piece
    shoulder_tip_x: float
    armhole_y: float
    front_armhole: list[Point]
    back_armhole: list[Point]
    front_neck: list[Point]
    back_neck: list[Point]
    # Подборт: деталь по борту и лацкану (только у изделий с лацканом).
    facing: Piece | None = None


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
    shoulder_tip_x: float, shoulder_drop: float, bust_width: float, armhole_y: float
) -> list[Point]:
    return bezier(
        (shoulder_tip_x, shoulder_drop),
        (shoulder_tip_x, shoulder_drop + (armhole_y - shoulder_drop) * 0.55),
        (bust_width - 1.0, armhole_y - 2.0),
        (bust_width, armhole_y),
        segments=14,
    )


def _point_at_y(points: list[Point], y: float) -> tuple[int, Point]:
    """Точка ломаной на высоте y и индекс отрезка, на котором она лежит."""
    for i, (a, b) in enumerate(zip(points, points[1:])):
        if min(a.y, b.y) <= y <= max(a.y, b.y):
            t = 0.0 if abs(b.y - a.y) < 1e-9 else (y - a.y) / (b.y - a.y)
            return i, Point(a.x + (b.x - a.x) * t, y)
    raise DraftError("Вытачка выходит за боковой шов")


def _fish_dart(x: float, waist_y: float, intake: float, top_y: float, bottom_y: float) -> dict:
    """Вытачка по талии: ромб с раствором intake на линии талии."""
    half = intake / 2.0
    points = [
        Point(x, top_y),
        Point(x - half, waist_y),
        Point(x, bottom_y),
        Point(x + half, waist_y),
        Point(x, top_y),
    ]
    return {"type": "dart", "points": to_mm(points), "label": "вытачка"}


def _mirror_darts(lines: list[dict]) -> list[dict]:
    """Вытачки второй половины детали, которая кроится со сгибом."""
    return [
        {**line, "points": [Point(-p.x, p.y) for p in line["points"]]}
        for line in lines
        if line["type"] == "dart"
    ]


def _dart(intake: float) -> float:
    """Раствор вытачки: не глубже MAX_DART, мелкая вытачка не нужна."""
    intake = min(MAX_DART, max(0.0, intake))
    return intake if intake >= 0.5 else 0.0


# Плечо спинки длиннее плеча переда на посадку (ЕМКО: 0,5-1 см, по умолчанию
# 0,7 - поле back_shoulder_ease): спинку посаживают по плечу, и ткань
# ложится на выпуклость лопаток.


def _back_tip(m: BodiceInput, front_tip: float, bust_w: float) -> float:
    """Плечевая точка спинки: плечо на посадку длиннее переда."""
    from ..core.geometry import polyline_length

    target = (
        polyline_length(_shoulder_curve(m.neck_half, front_tip, m.front_shoulder_drop))
        + m.back_shoulder_ease
    )
    tip = front_tip
    for _ in range(30):
        length = polyline_length(_shoulder_curve(m.neck_half, tip, m.back_shoulder_drop))
        if abs(length - target) < 0.01:
            break
        tip += target - length
    # Пройма спинки не должна стать уже 2 см до линии бока.
    return min(tip, bust_w - 2.0)


def build_bodice(m: BodiceInput) -> Bodice:
    # Вертикальные мерки сняты от седьмого шейного позвонка, чертёж - от
    # плечевой точки горловины: спинка и пройма длиннее на подъём горловины.
    # Длина переда до талии снята от плечевой точки и остаётся как есть.
    rise = cervical_rise(m.half_neck)
    m = replace(
        m,
        armhole_depth=m.armhole_depth + rise,
        back_waist_length=m.back_waist_length + rise,
        length=m.length + rise,
    )
    bust_w = (2.0 * m.half_bust + m.ease_bust) / 4.0
    waist_w = (2.0 * m.half_waist + m.ease_waist) / 4.0
    hip_w = (2.0 * m.half_hip + m.ease_hip) / 4.0
    armhole_y = m.armhole_depth + m.armhole_ease

    female = m.gender == "female"
    # Разница длин переда и спинки до талии. У мужской фигуры она мала и
    # уходит в баланс горловины, вытачки на грудь нет.
    balance = max(0.0, m.front_waist_length - m.back_waist_length) if female else 0.0
    back_waist_y = m.back_waist_length
    front_waist_y = back_waist_y + balance

    if armhole_y >= back_waist_y - 3.0:
        raise DraftError("Глубина проймы должна быть меньше длины до талии")
    if m.length <= back_waist_y + 2.0:
        raise DraftError("Длина изделия должна быть больше длины до талии")

    shoulder_tip_x = min(bust_w - 3.0, m.neck_half + m.shoulder_length * 0.95)
    if shoulder_tip_x <= m.neck_half + 3.0:
        raise DraftError("Плечо не помещается: проверьте полуобхват шеи и длину плеча")

    # Боковой шов сужается одинаково у переда и спинки - иначе швы разной
    # длины не сошьются. Остаток сужения к талии забирают вытачки.
    reduction = max(0.0, bust_w - waist_w)
    side_share = 1.0 - DART_SHARE
    back_dart = _dart(reduction * DART_SHARE)
    front_dart = _dart(reduction * DART_SHARE) if female else _dart(reduction * 0.25)
    back_side = front_side = reduction * side_share

    back_tip_x = _back_tip(m, shoulder_tip_x, bust_w)
    back = _back(
        m,
        bust_w=bust_w,
        side_waist_w=bust_w - back_side,
        hip_w=hip_w,
        waist_y=back_waist_y,
        armhole_y=armhole_y,
        shoulder_tip_x=back_tip_x,
        dart=back_dart,
    )
    front = _front(
        m,
        bust_w=bust_w,
        side_waist_w=bust_w - front_side,
        hip_w=hip_w,
        waist_y=front_waist_y,
        armhole_y=armhole_y,
        shoulder_tip_x=shoulder_tip_x,
        dart=front_dart,
        balance=balance,
    )
    return Bodice(
        front=front,
        back=back,
        shoulder_tip_x=shoulder_tip_x,
        armhole_y=armhole_y,
        front_armhole=_armhole_curve(shoulder_tip_x, m.front_shoulder_drop, bust_w, armhole_y),
        back_armhole=_armhole_curve(back_tip_x, m.back_shoulder_drop, bust_w, armhole_y),
        front_neck=front.seam_edges_neck
        if hasattr(front, "seam_edges_neck")
        else _neck_curve(m.neck_half, m.front_neck_depth),
        back_neck=_neck_curve(m.neck_half, m.back_neck_depth),
        facing=getattr(front, "facing", None),
    )


def _top(
    m: BodiceInput,
    neck_depth: float,
    drop: float,
    shoulder_tip_x: float,
    bust_w: float,
    armhole_y: float,
):
    neck = _neck_curve(m.neck_half, neck_depth)
    shoulder = _shoulder_curve(m.neck_half, shoulder_tip_x, drop)
    armhole = _armhole_curve(shoulder_tip_x, drop, bust_w, armhole_y)
    right = [Point(0.0, neck_depth), *neck[1:], *shoulder[1:], *armhole[1:]]
    return right, neck, shoulder, armhole


def _back(
    m: BodiceInput,
    *,
    bust_w: float,
    side_waist_w: float,
    hip_w: float,
    waist_y: float,
    armhole_y: float,
    shoulder_tip_x: float,
    dart: float,
) -> Piece:
    right, neck, shoulder, armhole = _top(
        m, m.back_neck_depth, m.back_shoulder_drop, shoulder_tip_x, bust_w, armhole_y
    )
    hip_y = waist_y + m.waist_to_hip
    side = body_side(bust_w, side_waist_w, hip_w, armhole_y, waist_y, hip_y, m.length)
    right.extend(side[1:])
    right.append(Point(0.0, m.length))

    internal: list[dict] = [
        {
            "type": "fold",
            "points": to_mm([Point(0.0, 0.0), Point(0.0, m.length)]),
            "label": "середина спинки",
        }
    ]
    if dart > 0:
        # Вытачка спинки - под лопаткой, примерно посередине ширины детали.
        internal.append(
            _fish_dart(
                bust_w * 0.45,
                waist_y,
                dart,
                armhole_y + 2.0,
                min(hip_y - 3.0, m.length - 2.0),
            )
        )

    return build_piece(
        "back",
        "Спинка",
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 30.0), Point(0.0, (m.length - 3.0) * 10.0)),
        notches=[
            {"x": bust_w * 10.0, "y": armhole_y * 10.0, "label": "пройма"},
            {"x": side[-1].x * 10.0, "y": m.length * 10.0, "label": "бок"},
        ],
        internal_lines=internal + _mirror_darts(internal),
        cut=1,
        mirrored=False,
        girth_cm=bust_w * 2.0,
        seam_edges=[
            {"label": "пройма", "points": to_mm(armhole)},
            {"label": "горловина", "points": to_mm(neck)},
            {"label": "плечо", "points": to_mm(shoulder)},
            {"label": "бок", "points": to_mm(side)},
        ],
    )


def _front(
    m: BodiceInput,
    *,
    bust_w: float,
    side_waist_w: float,
    hip_w: float,
    waist_y: float,
    armhole_y: float,
    shoulder_tip_x: float,
    dart: float,
    balance: float,
) -> Piece:
    right, neck, shoulder, armhole = _top(
        m, m.front_neck_depth, m.front_shoulder_drop, shoulder_tip_x, bust_w, armhole_y
    )
    # Перед длиннее спинки на баланс: низ переда и спинки сходятся после
    # закрытия нагрудной вытачки. Бок переда - та же кривая, что у спинки,
    # разведённая на раствор вытачки, поэтому сшитые боковые швы равны.
    back_waist_y = waist_y - balance
    back_hip_y = back_waist_y + m.waist_to_hip
    hip_y = back_hip_y + balance
    length = m.length + balance
    sewn_side = body_side(
        bust_w, side_waist_w, hip_w, armhole_y, back_waist_y, back_hip_y, m.length
    )

    bust_point = Point(m.bust_center / 2.0, m.bust_height)
    if balance >= 0.5:
        top_y = armhole_y + BUST_DART_BELOW_ARMHOLE
        i_top, top_leg = _point_at_y(sewn_side, top_y)
        bottom_leg = Point(top_leg.x, top_y + balance)
        # Вытачка направлена в точку груди, но не доходит до неё на
        # BUST_DART_SHORTEN: иначе ткань ломается на груди.
        mid = Point(top_leg.x, top_y + balance / 2.0)
        dx, dy = mid.x - bust_point.x, mid.y - bust_point.y
        dist = (dx * dx + dy * dy) ** 0.5
        if dist <= BUST_DART_SHORTEN + 2.0:
            raise DraftError("Нагрудная вытачка не помещается: проверьте центр груди")
        apex = Point(
            bust_point.x + dx / dist * BUST_DART_SHORTEN,
            bust_point.y + dy / dist * BUST_DART_SHORTEN,
        )
        if apex.x >= top_leg.x - 2.0:
            raise DraftError("Нагрудная вытачка не помещается: проверьте центр груди")
        lower = [Point(p.x, p.y + balance) for p in sewn_side[i_top + 1 :]]
        side = [*sewn_side[: i_top + 1], top_leg, bottom_leg, *lower]
        right.extend(sewn_side[1 : i_top + 1])
        right.extend([top_leg, apex, bottom_leg])
        right.extend(lower)
    else:
        side = sewn_side
        right.extend(side[1:])
    right.append(Point(0.0, length))

    internal: list[dict] = []
    if dart > 0:
        internal.append(
            _fish_dart(
                bust_point.x,
                waist_y,
                dart,
                bust_point.y + 3.0,
                min(hip_y - 3.0, length - 2.0),
            )
        )

    notches = [
        {"x": bust_w * 10.0, "y": armhole_y * 10.0, "label": "пройма"},
        {"x": side[-1].x * 10.0, "y": length * 10.0, "label": "бок"},
    ]
    edges = [
        {"label": "пройма", "points": to_mm(armhole)},
        {"label": "горловина", "points": to_mm(neck)},
        {"label": "плечо", "points": to_mm(shoulder)},
        {"label": "бок", "points": to_mm(sewn_side)},
    ]
    grainline = (
        Point(bust_point.x * 10.0, 30.0),
        Point(bust_point.x * 10.0, (length - 3.0) * 10.0),
    )

    if m.front_overlap > 0 and m.lapel_break > 0:
        return _lapel_front(
            m,
            right=right,
            neck=neck,
            shoulder=shoulder,
            length=length,
            internal=internal,
            notches=notches,
            edges=edges,
            grainline=grainline,
            bust_w=bust_w,
        )
    if m.front_overlap > 0:
        # Перед с застёжкой: половина детали и борт за серединой переда.
        overlap = m.front_overlap
        outline = [*right, Point(-overlap, length), Point(-overlap, m.front_neck_depth), right[0]]
        internal.insert(
            0,
            {
                "type": "fold",
                "points": to_mm([Point(0.0, m.front_neck_depth), Point(0.0, length)]),
                "label": "середина переда",
            },
        )
        return build_piece(
            "front",
            "Перед",
            to_mm(outline),
            grainline=grainline,
            notches=notches,
            internal_lines=internal,
            cut=2,
            mirrored=True,
            girth_cm=bust_w * 2.0,
            seam_edges=edges,
        )

    internal.insert(
        0,
        {
            "type": "fold",
            "points": to_mm([Point(0.0, 0.0), Point(0.0, length)]),
            "label": "середина переда",
        },
    )
    return build_piece(
        "front",
        "Перед",
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 30.0), Point(0.0, (length - 3.0) * 10.0)),
        notches=notches,
        internal_lines=internal + _mirror_darts(internal),
        cut=1,
        mirrored=False,
        girth_cm=bust_w * 2.0,
        seam_edges=edges,
    )


def _mirror_across(p: Point, a: Point, b: Point) -> Point:
    """Точка, отражённая через прямую ab: так лацкан переходит из надетого
    положения в плоское лекало (он отворачивается по линии перегиба)."""
    dx, dy = b.x - a.x, b.y - a.y
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
    fx, fy = a.x + dx * t, a.y + dy * t
    return Point(2 * fx - p.x, 2 * fy - p.y)


def _split_at(points: list[Point], share: float) -> tuple[int, Point]:
    """Точка ломаной на доле её длины и индекс отрезка."""
    total = sum(a.distance_to(b) for a, b in zip(points, points[1:]))
    goal = total * share
    walked = 0.0
    for i, (a, b) in enumerate(zip(points, points[1:])):
        step = a.distance_to(b)
        if walked + step >= goal and step > 0:
            t = (goal - walked) / step
            return i, Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
        walked += step
    return len(points) - 2, points[-1]


# Лацкан: доля горловины от середины переда до точки раскепа и раствор
# раскепа (между концом лацкана и воротником), доли ширины лацкана.
NOTCH_SHARE = 0.4
FACING_WIDTH = 8.0
FACING_SHOULDER = 3.5


def _lapel_front(
    m: BodiceInput,
    *,
    right: list[Point],
    neck: list[Point],
    shoulder: list[Point],
    length: float,
    internal: list[dict],
    notches: list[dict],
    edges: list[dict],
    grainline: tuple[Point, Point],
    bust_w: float,
) -> Piece:
    """Полочка с бортом и отложным лацканом.

    Классическое построение: точка перегиба на борту, линия перегиба через
    точку в 2 см от основания шеи на продолжении плеча. Лацкан строится в
    надетом виде (лежит на груди) и отражается через линию перегиба: так
    получается его контур на лекале - за бортом, у горловины. Горловина от
    середины переда до точки раскепа уходит под лацкан; воротник
    притачивается от раскепа до середины спинки.
    """
    overlap = m.front_overlap
    # neck идёт от середины переда (0, глубина) к основанию шеи.
    i_notch, notch = _split_at(neck, NOTCH_SHARE)
    neck_point = neck[-1]
    breakpoint = Point(-overlap, m.front_neck_depth + m.lapel_break)
    # Точка линии перегиба: 2 см от основания шеи по продолжению плеча внутрь.
    sx, sy = shoulder[1].x - neck_point.x, shoulder[1].y - neck_point.y
    sl = (sx * sx + sy * sy) ** 0.5 or 1.0
    roll_top = Point(neck_point.x - sx / sl * 2.0, neck_point.y - sy / sl * 2.0)
    rx, ry = roll_top.x - breakpoint.x, roll_top.y - breakpoint.y
    rl = (rx * rx + ry * ry) ** 0.5
    # Нормаль к линии перегиба в сторону проймы: туда ложится лацкан.
    nx, ny = ry / rl, -rx / rl
    if nx < 0:
        nx, ny = -nx, -ny
    width = m.lapel_width

    def on_roll(share: float, out: float) -> Point:
        return Point(breakpoint.x + rx * share + nx * out, breakpoint.y + ry * share + ny * out)

    worn_tip = on_roll(0.72, width)
    worn_gorge = on_roll(0.86, width * 0.45)
    tip = _mirror_across(worn_tip, breakpoint, roll_top)
    gorge = _mirror_across(worn_gorge, breakpoint, roll_top)

    # Контур: от раскепа по горловине к плечу и дальше как у полочки, по
    # низу к борту, вверх до точки перегиба, по лацкану к раскепу.
    visible_neck = [notch, *neck[i_notch + 1 :]]
    start = right.index(neck[-1]) if neck[-1] in right else len(neck) - 1
    tail = right[start + 1 :]
    outline = [*visible_neck, *tail, Point(-overlap, length), breakpoint, tip, gorge, notch]

    internal = [line for line in internal if line.get("label") != "середина переда"]
    internal.insert(
        0,
        {
            "type": "center_line",
            "points": to_mm([Point(0.0, m.front_neck_depth), Point(0.0, length)]),
            "label": "середина переда",
        },
    )
    internal.append(
        {"type": "fold", "points": to_mm([breakpoint, roll_top]), "label": "линия перегиба"}
    )
    # Лацкан в надетом виде: по нему 3D-превью кладёт отворот на грудь.
    internal.append(
        {
            "type": "outline",
            "points": to_mm([breakpoint, worn_tip, worn_gorge, notch]),
            "label": "лацкан",
        }
    )
    notches = [
        *notches,
        {"x": breakpoint.x * 10.0, "y": breakpoint.y * 10.0, "label": "перегиб"},
        {"x": notch.x * 10.0, "y": notch.y * 10.0, "label": "раскеп"},
    ]
    edges = [e for e in edges if e["label"] != "горловина"]
    edges.append({"label": "горловина", "points": to_mm(visible_neck)})
    piece = build_piece(
        "front",
        "Полочка",
        to_mm(outline),
        grainline=grainline,
        notches=notches,
        internal_lines=internal,
        cut=2,
        mirrored=True,
        girth_cm=bust_w * 2.0,
        seam_edges=edges,
    )
    piece.seam_edges_neck = visible_neck  # type: ignore[attr-defined]

    # Подборт: лацкан и полоса по борту шириной FACING_WIDTH, вверху - до
    # плеча. Отворот лацкана - лицевая сторона подборта.
    _, shoulder_mark = _split_at(
        shoulder,
        min(
            0.9,
            FACING_SHOULDER
            / max(sum(a.distance_to(b) for a, b in zip(shoulder, shoulder[1:])), 1.0),
        ),
    )
    inner_x = -overlap + FACING_WIDTH
    facing_outline = [
        shoulder_mark,
        *reversed(visible_neck[1:]),
        notch,
        gorge,
        tip,
        breakpoint,
        Point(-overlap, length),
        Point(inner_x, length),
        Point(inner_x, breakpoint.y + 6.0),
        Point(
            inner_x + (shoulder_mark.x - inner_x) * 0.5,
            (breakpoint.y + 6.0 + shoulder_mark.y) * 0.45,
        ),
        shoulder_mark,
    ]
    piece.facing = build_piece(  # type: ignore[attr-defined]
        "facing",
        "Подборт",
        to_mm(facing_outline),
        grainline=(
            Point((inner_x - overlap) * 5.0, (breakpoint.y + 8.0) * 10.0),
            Point((inner_x - overlap) * 5.0, (length - 4.0) * 10.0),
        ),
        notches=[
            {"x": breakpoint.x * 10.0, "y": breakpoint.y * 10.0, "label": "перегиб"},
            {"x": notch.x * 10.0, "y": notch.y * 10.0, "label": "раскеп"},
        ],
        internal_lines=[
            {"type": "fold", "points": to_mm([breakpoint, roll_top]), "label": "линия перегиба"}
        ],
        cut=2,
        seam_edges=[
            {"label": "борт", "points": to_mm([Point(-overlap, length), breakpoint, tip, gorge])}
        ],
    )
    return piece
