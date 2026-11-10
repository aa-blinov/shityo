"""Контрольные надсечки: по ним швея совмещает детали при сметывании.

Втачной рукав - самое ответственное соединение: окат длиннее проймы на
посадку, и без меток посадка уходит в одно место. Правила (общие для
швейной практики):

- на пройме переда одна надсечка, на пройме спинки - две, на 0,4 длины
  проймы от подмышки; двойная надсечка спинки отличает её от переда;
- на окате - ответные надсечки на тех же долях, умноженных на отношение
  длины оката к длине проймы: посадка распределяется по всему окату
  равномерно;
- надсечка вершины оката совмещается с плечевым швом: она стоит на длине
  проймы переда (с той же поправкой) от подмышки переда, а не на
  геометрической вершине - пройма переда и спинки разной длины.

Сторона оката с x > 0 - передняя.
"""

from __future__ import annotations

from ..core.geometry import Point, polyline_length
from .base import Piece

NOTCH_SHARE = 0.4
DOUBLE_GAP_MM = 10.0


def _edge(piece: Piece, label: str) -> list[Point] | None:
    for edge in piece.seam_edges:
        if edge.get("label") == label:
            return list(edge["points"])
    return None


def _point_at(points: list[Point], distance: float) -> Point:
    walked = 0.0
    for a, b in zip(points, points[1:]):
        step = a.distance_to(b)
        if walked + step >= distance and step > 0:
            t = (distance - walked) / step
            return Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
        walked += step
    return points[-1]


def _from_underarm(points: list[Point]) -> list[Point]:
    """Ломаная проймы от подмышки (нижний конец) вверх."""
    return points if points[0].y >= points[-1].y else list(reversed(points))


def _symmetric(piece: Piece) -> bool:
    xs = [p.x for p in piece.outline]
    return piece.cut == 1 and abs(min(xs) + max(xs)) < 5.0


def _add(piece: Piece, point: Point, label: str) -> None:
    piece.notches.append({"x": point.x, "y": point.y, "label": label})
    if _symmetric(piece):
        piece.notches.append({"x": -point.x, "y": point.y, "label": label})


def add_control_notches(pieces: list[Piece]) -> list[Piece]:
    by_id = {piece.id: piece for piece in pieces}
    front, back, sleeve = by_id.get("front"), by_id.get("back"), by_id.get("sleeve")
    if not (front and back and sleeve):
        return pieces
    front_arm, back_arm, cap = _edge(front, "пройма"), _edge(back, "пройма"), _edge(sleeve, "окат")
    if not (front_arm and back_arm and cap):
        return pieces
    front_arm, back_arm = _from_underarm(front_arm), _from_underarm(back_arm)
    len_f, len_b = polyline_length(front_arm), polyline_length(back_arm)
    cap_len = polyline_length(cap)
    ratio = cap_len / max(len_f + len_b, 1.0)

    a_f, a_b = len_f * NOTCH_SHARE, len_b * NOTCH_SHARE
    _add(front, _point_at(front_arm, a_f), "пройма перед")
    _add(back, _point_at(back_arm, a_b), "пройма спинка")
    _add(back, _point_at(back_arm, a_b + DOUBLE_GAP_MM), "пройма спинка")

    # Окат идёт от подмышки спинки (x < 0) к подмышке переда (x > 0).
    from_front = list(reversed(cap)) if cap[0].x < cap[-1].x else list(cap)
    from_back = list(reversed(from_front))
    sleeve.notches.append({**_as(_point_at(from_front, a_f * ratio)), "label": "окат перед"})
    sleeve.notches.append({**_as(_point_at(from_back, a_b * ratio)), "label": "окат спинка"})
    sleeve.notches.append(
        {**_as(_point_at(from_back, (a_b + DOUBLE_GAP_MM) * ratio)), "label": "окат спинка"}
    )
    sleeve.notches.append({**_as(_point_at(from_front, len_f * ratio)), "label": "плечо"})
    return pieces


def _as(point: Point) -> dict:
    return {"x": point.x, "y": point.y}
