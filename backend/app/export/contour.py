"""Contour helpers shared by the SVG, DXF and PDF exporters.

The exporters receive closed outlines in millimetres and need three things
that the geometry core does not provide: a bounding box of arbitrary points,
clipping of long contours onto page tiles and the outward normal of a contour
edge for notch ticks.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..core.geometry import Point, offset_polyline, polygon_area

EPS = 1e-9


@dataclass(frozen=True)
class Rect:
    """Axis aligned rectangle in millimetres."""

    x: float
    y: float
    width: float
    height: float

    @property
    def x1(self) -> float:
        return self.x

    @property
    def y1(self) -> float:
        return self.y

    @property
    def x2(self) -> float:
        return self.x + self.width

    @property
    def y2(self) -> float:
        return self.y + self.height

    def contains(self, point: tuple[float, float], tol: float = 0.0) -> bool:
        px, py = point
        return (
            self.x1 - tol <= px <= self.x2 + tol
            and self.y1 - tol <= py <= self.y2 + tol
        )


def to_xy_list(points) -> list[tuple[float, float]]:
    """Convert geometry points (or plain coordinate tuples) into tuples."""
    result: list[tuple[float, float]] = []
    for p in points:
        if isinstance(p, (tuple, list)):
            result.append((float(p[0]), float(p[1])))
        else:
            result.append((float(p.x), float(p.y)))
    return result


def close_ring(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Return the ring with the first point repeated at the end."""
    if not points:
        return []
    if points[0] != points[-1]:
        return points + [points[0]]
    return list(points)


def bbox_of(points) -> Rect:
    """Bounding box of a point sequence."""
    coords = to_xy_list(points)
    if not coords:
        return Rect(0.0, 0.0, 0.0, 0.0)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return Rect(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def ring_to_polyline(points) -> list[tuple[float, float]]:
    """Closed ring as an open polyline (the repeated last point is dropped)."""
    coords = close_ring(to_xy_list(points))
    if len(coords) > 1 and coords[0] == coords[-1]:
        coords = coords[:-1]
    return coords


def offset_outward(points, distance: float) -> list[tuple[float, float]]:
    """Offset a closed contour outwards by ``distance`` millimetres.

    The geometry core offsets along the outward normal of a counter-clockwise
    contour, so a clockwise contour is reversed first; the result is
    direction independent, which matters because drafts build contours in
    either direction.
    """
    ring = close_ring(to_xy_list(points))
    if len(ring) < 4 or abs(distance) < EPS:
        return ring

    oriented = ring
    if polygon_area([Point(x, y) for x, y in ring]) < 0:
        oriented = list(reversed(ring))

    offset = offset_polyline([Point(x, y) for x, y in oriented], distance)
    return to_xy_list(offset)


def clip_segment(
    p0: tuple[float, float],
    p1: tuple[float, float],
    rect: Rect,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Liang-Barsky clipping of one segment against a rectangle."""
    x0, y0 = p0
    x1, y1 = p1
    dx = x1 - x0
    dy = y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in (
        (-dx, x0 - rect.x1),
        (dx, rect.x2 - x0),
        (-dy, y0 - rect.y1),
        (dy, rect.y2 - y0),
    ):
        if abs(p) < EPS:
            if q < 0:
                return []
            continue
        r = q / p
        if p < 0:
            if r > t1:
                return []
            t0 = max(t0, r)
        else:
            if r < t0:
                return []
            t1 = min(t1, r)
    if t0 > t1:
        return []
    a = (x0 + t0 * dx, y0 + t0 * dy)
    b = (x0 + t1 * dx, y0 + t1 * dy)
    return [(a, b)]


def clip_polyline(
    points: list[tuple[float, float]],
    rect: Rect,
) -> list[list[tuple[float, float]]]:
    """Split a polyline into the parts that fall inside ``rect``."""
    result: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for a, b in zip(points, points[1:]):
        clipped = clip_segment(a, b, rect)
        if not clipped:
            if len(current) > 1:
                result.append(current)
            current = []
            continue
        seg_a, seg_b = clipped[0]
        # Consecutive original segments may meet outside the rectangle.
        # Their clipped fragments then have different endpoints: do not
        # replace the missing entry point by a diagonal across the tile.
        if current and ((current[-1][0]-seg_a[0])**2+(current[-1][1]-seg_a[1])**2)>EPS**2:
            if len(current)>1:
                result.append(current)
            current=[]
        if not current:
            current = [seg_a]
        current.append(seg_b)
    if len(current) > 1:
        result.append(current)
    return result


def nearest_edge_normal(
    points: list[tuple[float, float]],
    target: tuple[float, float],
) -> tuple[float, float]:
    """Unit normal of the contour segment closest to ``target``."""
    best: tuple[float, tuple[float, float]] | None = None
    for a, b in zip(points, points[1:]):
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        if length_sq < EPS:
            continue
        t = ((target[0] - ax) * dx + (target[1] - ay) * dy) / length_sq
        t = max(0.0, min(1.0, t))
        px, py = ax + t * dx, ay + t * dy
        dist = ((target[0] - px) ** 2 + (target[1] - py) ** 2) ** 0.5
        if best is None or dist < best[0]:
            length = length_sq**0.5
            best = (dist, (-dy / length, dx / length))
    if best is None:
        return (0.0, 1.0)
    return best[1]
