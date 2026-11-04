"""Тесты геометрического ядра: точки, кривые Безье, длины, смещения контура."""
import math

import pytest

from app.core.geometry import (
    Bezier,
    Point,
    Path,
    arc_points,
    bounding_box,
    flatten_path,
    polyline_length,
    offset_polyline,
)


def test_point_arithmetic():
    a = Point(10, 20)
    b = Point(3, 4)
    assert (a + b) == Point(13, 24)
    assert (a - b) == Point(7, 16)
    assert a.scale(2) == Point(20, 40)
    assert a.distance_to(b) == pytest.approx(math.hypot(7, 16))
    assert a.length() == pytest.approx(math.hypot(10, 20))


def test_bezier_endpoints_and_midpoint():
    curve = Bezier(Point(0, 0), Point(0, 10), Point(10, 10), Point(10, 0))
    assert curve.start == Point(0, 0)
    assert curve.end == Point(10, 0)
    mid = curve.at(0.5)
    assert mid.x == pytest.approx(5)
    assert mid.y == pytest.approx(7.5)


def test_bezier_length_is_between_chord_and_control_polygon():
    curve = Bezier(Point(0, 0), Point(0, 10), Point(10, 10), Point(10, 0))
    chord = curve.start.distance_to(curve.end)
    polygon = (
        curve.start.distance_to(curve.p1)
        + curve.p1.distance_to(curve.p2)
        + curve.p2.distance_to(curve.end)
    )
    assert chord < curve.length() < polygon


def test_flatten_path_respects_tolerance():
    curve = Bezier(Point(0, 0), Point(0, 10), Point(10, 10), Point(10, 0))
    points = flatten_path(Path([curve]), tolerance=0.01)
    assert points[0] == curve.start
    assert points[-1] == curve.end
    # плотная аппроксимация: отклонение от кривой меньше допуска
    for t in (0.25, 0.5, 0.75):
        approx = _closest_distance(points, curve.at(t))
        assert approx < 0.05


def _closest_distance(points, target):
    return min(p.distance_to(target) for p in points)


def test_polyline_length_of_closed_rectangle():
    poly = [Point(0, 0), Point(10, 0), Point(10, 5), Point(0, 5), Point(0, 0)]
    assert polyline_length(poly) == pytest.approx(30)


def test_offset_polyline_grows_rectangle_by_seam_allowance():
    poly = [Point(0, 0), Point(10, 0), Point(10, 5), Point(0, 5), Point(0, 0)]
    grown = offset_polyline(poly, 10)
    xs = [p.x for p in grown]
    ys = [p.y for p in grown]
    assert min(xs) == pytest.approx(-10, abs=1e-6)
    assert max(xs) == pytest.approx(20, abs=1e-6)
    assert min(ys) == pytest.approx(-10, abs=1e-6)
    assert max(ys) == pytest.approx(15, abs=1e-6)


def test_offset_polyline_negative_shrinks():
    poly = [Point(0, 0), Point(100, 0), Point(100, 100), Point(0, 100), Point(0, 0)]
    shrunk = offset_polyline(poly, -10)
    xs = [p.x for p in shrunk]
    ys = [p.y for p in shrunk]
    assert min(xs) == pytest.approx(10, abs=1e-6)
    assert max(xs) == pytest.approx(90, abs=1e-6)
    assert min(ys) == pytest.approx(10, abs=1e-6)
    assert max(ys) == pytest.approx(90, abs=1e-6)


def test_bounding_box_of_points():
    box = bounding_box([Point(5, 7), Point(-2, 3), Point(10, 20)])
    assert box.x == pytest.approx(-2)
    assert box.y == pytest.approx(3)
    assert box.width == pytest.approx(12)
    assert box.height == pytest.approx(17)


def test_arc_points_forms_circle():
    points = arc_points(Point(0, 0), 10, 0, math.pi, segments=64)
    for p in points:
        assert p.length() == pytest.approx(10, abs=1e-6)
    # полуокружность: дуга pi*r
    assert polyline_length(points) == pytest.approx(math.pi * 10, rel=1e-3)


def test_path_length_matches_sum_of_flattened_segments():
    path = Path(
        [
            Bezier(Point(0, 0), Point(10, 0), Point(20, 0), Point(30, 0)),
            Bezier(Point(30, 0), Point(30, 10), Point(30, 20), Point(30, 30)),
        ]
    )
    assert path.length() == pytest.approx(60, rel=1e-3)
