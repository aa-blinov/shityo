"""Сопряжение деталей: рукав должен входить в пройму без зазора.

Длина оката рукава обязана совпадать с суммой длин проймы переда и спинки.
Это единственная автоматическая проверка того, что детали сшиваются между
собой, а не просто похожи на лекала.

Ширина рукава при этом задана обхватом бицепса: рукав не может быть шире
руки, иначе посадка невозможна.
"""

import pytest

from app.core.geometry import polyline_length
from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.drafts.tee import _cap_curve, _solve_cap


def _cap_length_of(piece) -> float:
    """Длина оката рукава в сантиметрах.

    Окат - верхняя дуга детали, от левого плечевого шва через вершину к
    правому. Он уже, чем рукав в подмышке, поэтому точки оката - это те,
    чей |x| не превышает |x| крайней точки оката.
    """
    points = list(piece.outline)
    limit = abs(points[0].x) + 0.5
    cap = []
    for point in points:
        if abs(point.x) > limit:
            break
        cap.append(point)
    return polyline_length(cap) / 10.0


def test_sleeve_cap_matches_armholes():
    """Окат рукава = пройма переда + пройма спинки.

    Проверка идёт по подписанным швам деталей (test_seam_edges.py), здесь
    дублируется на уровне измерения контура.
    """
    from app.core.geometry import polyline_length

    item = catalog_item("tee")
    pieces = build_draft("tee", item["default_measurements"], {})
    sleeve = next(p for p in pieces if p.id == "sleeve")

    points = list(sleeve.outline)
    limit = abs(points[0].x) + 0.5
    cap = []
    for point in points:
        if abs(point.x) > limit:
            break
        cap.append(point)
    measured = polyline_length(cap) / 10.0

    front = next(p for p in pieces if p.id == "front")
    back = next(p for p in pieces if p.id == "back")

    def edge(piece, label: str) -> float:
        for e in piece.seam_edges:
            if e["label"] == label:
                return polyline_length(e["points"]) / 10.0
        raise AssertionError(f"нет шва {label}")

    assert measured == pytest.approx(edge(front, "пройма") + edge(back, "пройма"), abs=0.3)


def test_sleeve_width_follows_biceps():
    """Ширина рукава задана обхватом бицепса, а не шириной проймы."""
    item = catalog_item("tee")
    m = item["default_measurements"]

    narrow = build_draft("tee", {**m, "biceps": 26}, {})
    wide = build_draft("tee", {**m, "biceps": 38}, {})
    w_narrow = next(p for p in narrow if p.id == "sleeve").bbox.width / 10.0
    w_wide = next(p for p in wide if p.id == "sleeve").bbox.width / 10.0

    assert w_wide - w_narrow == pytest.approx(12.0, rel=0.05)
    # Рукав не должен быть заметно шире руки.
    assert w_narrow < 40.0


def test_sleeve_cap_shrinks_when_armhole_shrinks():
    """Меньше обхват груди - меньше пройма - меньше окат."""
    item = catalog_item("tee")
    m = dict(item["default_measurements"])

    def cap_for(bust: float) -> float:
        pieces = build_draft("tee", {**m, "bust": bust}, {})
        return _cap_length_of(next(p for p in pieces if p.id == "sleeve"))

    assert cap_for(86.0) < cap_for(106.0)


def test_neckline_matches_neck_circumference():
    """Вырез горловины должен равняться обхвату шеи с прибавкой."""
    item = catalog_item("tee")
    m = item["default_measurements"]

    for neck in (36.0, 40.0, 44.0):
        pieces = build_draft("tee", {**m, "neck_circumference": neck}, {})
        front = next(p for p in pieces if p.id == "front")
        back = next(p for p in pieces if p.id == "back")

        def half_neck(piece) -> float:
            # Вырез идёт от центра переда к плечевому шву: это первые точки
            # контура, пока он не опустился до уровня плеча.
            points = []
            for point in piece.outline:
                points.append(point)
                if point.y <= 0.5:
                    break
            return polyline_length(points) / 10.0

        opening = 2.0 * (half_neck(front) + half_neck(back))
        assert opening == pytest.approx(neck + 2.0, abs=0.3)


def test_cap_solver_converges():
    """Подбор оката сходится: длина дуги равна заданной."""
    target = 50.0
    cap_width = 38.0
    cap_half, cap_rise = _solve_cap(target, cap_width, 30.0)
    length = polyline_length(_cap_curve(cap_half, cap_rise))
    assert length == pytest.approx(target, abs=0.3)
    assert cap_half == pytest.approx(cap_width / 2.0, rel=0.01)
