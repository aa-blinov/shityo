"""Геометрическое ядро: точки, кривые Безье, контуры, смещение.

Ядро намеренно без внешних зависимостей: построение лекала должно быть
детерминированным и воспроизводимым, поэтому вся арифметика кривых и
смещений живёт здесь, а не в сторонней библиотеке с плавающей версией.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(frozen=True)
class Point:
    x: float
    y: float

    def __add__(self, other: "Point") -> "Point":
        return Point(self.x + other.x, self.y + other.y)

    def __sub__(self, other: "Point") -> "Point":
        return Point(self.x - other.x, self.y - other.y)

    def __mul__(self, k: float) -> "Point":
        return Point(self.x * k, self.y * k)

    __rmul__ = __mul__

    def scale(self, k: float) -> "Point":
        return Point(self.x * k, self.y * k)

    def distance_to(self, other: "Point") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def length(self) -> float:
        return math.hypot(self.x, self.y)

    def normalized(self) -> "Point":
        norm = self.length()
        if norm == 0:
            return Point(0.0, 0.0)
        return Point(self.x / norm, self.y / norm)

    def perpendicular(self) -> "Point":
        """Поворот на 90° против часовой стрелки."""
        return Point(-self.y, self.x)

    def lerp(self, other: "Point", t: float) -> "Point":
        return Point(self.x + (other.x - self.x) * t, self.y + (other.y - self.y) * t)

    def rotate(self, angle: float) -> "Point":
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        return Point(self.x * cos_a - self.y * sin_a, self.x * sin_a + self.y * cos_a)

    def dot(self, other: "Point") -> float:
        return self.x * other.x + self.y * other.y


@dataclass(frozen=True)
class BBox:
    x: float
    y: float
    width: float
    height: float


def bounding_box(points: Sequence[Point]) -> BBox:
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    if not xs:
        return BBox(0.0, 0.0, 0.0, 0.0)
    return BBox(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


@dataclass(frozen=True)
class Bezier:
    """Кубическая кривая Безье."""

    p0: Point
    p1: Point
    p2: Point
    p3: Point

    @property
    def start(self) -> Point:
        return self.p0

    @property
    def end(self) -> Point:
        return self.p3

    def at(self, t: float) -> Point:
        mt = 1.0 - t
        a = mt * mt * mt
        b = 3 * mt * mt * t
        c = 3 * mt * t * t
        d = t * t * t
        return Point(
            a * self.p0.x + b * self.p1.x + c * self.p2.x + d * self.p3.x,
            a * self.p0.y + b * self.p1.y + c * self.p2.y + d * self.p3.y,
        )

    def derivative(self, t: float) -> Point:
        mt = 1.0 - t
        a = 3 * mt * mt
        b = 6 * mt * t
        c = 3 * t * t
        return Point(
            a * (self.p1.x - self.p0.x) + b * (self.p2.x - self.p1.x) + c * (self.p3.x - self.p2.x),
            a * (self.p1.y - self.p0.y) + b * (self.p2.y - self.p1.y) + c * (self.p3.y - self.p2.y),
        )

    def length(self, tolerance: float = 0.01) -> float:
        points = flatten_bezier(self, tolerance=tolerance)
        return polyline_length(points)

    def split(self, t: float) -> tuple["Bezier", "Bezier"]:
        p01 = self.p0.lerp(self.p1, t)
        p12 = self.p1.lerp(self.p2, t)
        p23 = self.p2.lerp(self.p3, t)
        p012 = p01.lerp(p12, t)
        p123 = p12.lerp(p23, t)
        mid = p012.lerp(p123, t)
        return (
            Bezier(self.p0, p01, p012, mid),
            Bezier(mid, p123, p23, self.p3),
        )

    def is_flat(self, tolerance: float) -> bool:
        """Достаточно ли прямой отрезок, чтобы заменить кривую хордой."""
        ux = 3 * self.p1.x - 2 * self.p0.x - self.p3.x
        uy = 3 * self.p1.y - 2 * self.p0.y - self.p3.y
        vx = 3 * self.p2.x - self.p0.x - 2 * self.p3.x
        vy = 3 * self.p2.y - self.p0.y - 2 * self.p3.y
        error = max(ux * ux, vx * vx) + max(uy * uy, vy * vy)
        return error <= 16.0 * tolerance * tolerance


def flatten_bezier(curve: Bezier, tolerance: float = 0.01, depth: int = 0) -> list[Point]:
    """Адаптивная аппроксимация кривой ломаной.

    Плоское приближение дешевле и не даёт «звона» на мелких деталях, поэтому
    кривая сперва проверяется на отклонение от хорды.
    """
    if depth >= 16 or curve.is_flat(tolerance):
        return [curve.p0, curve.p3]
    left, right = curve.split(0.5)
    return flatten_bezier(left, tolerance, depth + 1)[:-1] + flatten_bezier(
        right, tolerance, depth + 1
    )


@dataclass
class Path:
    """Ломаная из кубических кривых Безье; последняя точка каждой кривой = начало следующей."""

    segments: list[Bezier]

    def length(self) -> float:
        return sum(segment.length() for segment in self.segments)

    def points(self, tolerance: float = 0.05) -> list[Point]:
        return flatten_path(self, tolerance)


def flatten_path(path: Path, tolerance: float = 0.05) -> list[Point]:
    points: list[Point] = []
    for segment in path.segments:
        chunk = flatten_bezier(segment, tolerance=tolerance)
        if points and points[-1].distance_to(chunk[0]) < 1e-9:
            chunk = chunk[1:]
        points.extend(chunk)
    return points


def polyline_length(points: Sequence[Point]) -> float:
    return sum(
        points[i].distance_to(points[i + 1]) for i in range(len(points) - 1)
    )


def width_at_y(points: Sequence[Point], y: float, tolerance: float = 1.0) -> float:
    """Ширина контура на горизонтали y.

    Для проверки сходимости обхвата нужен размер детали на конкретном
    уровне (пояс, грудь), а не габарит всей детали: у брюк и юбки низ
    шире пояса, и габарит ничего не говорит об обхвате.
    """
    crossings: list[float] = []
    pts = list(points)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        if abs(a.y - b.y) < 1e-9:
            # Горизонтальное ребро: берём его концы.
            if abs(a.y - y) <= tolerance:
                crossings.extend([a.x, b.x])
            continue
        if (a.y - y) * (b.y - y) > 0:
            continue
        t = (y - a.y) / (b.y - a.y)
        crossings.append(a.x + (b.x - a.x) * t)
    if not crossings:
        return 0.0
    return max(crossings) - min(crossings)


def polygon_area(points: Sequence[Point]) -> float:
    """Знаковая площадь многоугольника (формула Гаусса)."""
    if len(points) < 3:
        return 0.0
    total = 0.0
    for i in range(len(points) - 1):
        total += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y
    return total / 2.0


def arc_points(
    center: Point,
    radius: float,
    start_angle: float,
    end_angle: float,
    segments: int = 32,
) -> list[Point]:
    """Точки дуги; углы в радианах, отсчёт от оси X."""
    if segments < 2:
        segments = 2
    points: list[Point] = []
    for i in range(segments + 1):
        t = i / segments
        angle = start_angle + (end_angle - start_angle) * t
        points.append(Point(center.x + radius * math.cos(angle), center.y + radius * math.sin(angle)))
    return points


def _segment_normal(a: Point, b: Point) -> Point:
    """Нормаль отрезка, направленная наружу при обходе контура против часовой стрелки."""
    direction = (b - a).normalized()
    # Векторное произведение даёт внешнюю нормаль: для обхода против часовой
    # стрелки это поворот направления на -90 градусов.
    return Point(direction.y, -direction.x)


def offset_polyline(points: Sequence[Point], distance: float) -> list[Point]:
    """Смещение замкнутого контура на постоянное расстояние.

    Смещение считается по биссектрисе нормалей соседних отрезков, поэтому на
    прямых углах получается точный размер, а на кривых - приближение,
    достаточное для припусков на швы.
    """
    pts = list(points)
    if len(pts) < 3:
        return pts
    if pts[0].distance_to(pts[-1]) > 1e-9:
        pts.append(pts[0])

    count = len(pts) - 1
    normals: list[Point] = []
    for i in range(count):
        normals.append(_segment_normal(pts[i], pts[i + 1]))

    result: list[Point] = []
    for i in range(count):
        prev_normal = normals[(i - 1) % count]
        next_normal = normals[i]
        bisector = (prev_normal + next_normal).normalized()
        denominator = bisector.dot(next_normal)
        if abs(denominator) < 1e-6:
            result.append(pts[i] + next_normal * distance)
            continue
        result.append(pts[i] + bisector * (distance / denominator))
    result.append(result[0])
    return result


def cubic_from_points(
    start: Point,
    end: Point,
    start_handle: Point,
    end_handle: Point,
) -> Bezier:
    """Кривая Безье по двум ручкам - базовый примитив построения горловин и пройм."""
    return Bezier(start, start_handle, end_handle, end)


def perpendicular_offset(p: Point, direction: Point, distance: float) -> Point:
    return p + direction.perpendicular().normalized() * distance


def resample_polyline(points: Sequence[Point], max_step: float) -> list[Point]:
    """Пересемплирование ломаной с ограничением шага (для offset-алгоритма)."""
    if len(points) < 2:
        return list(points)
    out = [points[0]]
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        dist = a.distance_to(b)
        if dist <= max_step:
            out.append(b)
            continue
        steps = int(dist / max_step)
        for s in range(1, steps + 1):
            out.append(a.lerp(b, s / steps))
    return out


def segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    """Пересечение двух отрезков (для проверки самопересечений контура)."""

    def orientation(a: Point, b: Point, c: Point) -> float:
        return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)

    o1 = orientation(p1, p2, p3)
    o2 = orientation(p1, p2, p4)
    o3 = orientation(p3, p4, p1)
    o4 = orientation(p3, p4, p2)
    if (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0):
        return True
    return False


def self_intersects(points: Sequence[Point]) -> bool:
    """Есть ли у замкнутого контура пересекающиеся не соседние рёбра."""
    pts = list(points)
    if len(pts) > 1 and pts[0].distance_to(pts[-1]) < 1e-9:
        pts = pts[:-1]
    n = len(pts)
    if n < 4:
        return False
    for i in range(n):
        a1, a2 = pts[i], pts[(i + 1) % n]
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            b1, b2 = pts[j], pts[(j + 1) % n]
            if segments_intersect(a1, a2, b1, b2):
                return True
    return False


def smooth(points: Sequence[Point], tension: float = 0.5) -> list[Point]:
    """Сглаживание ломаной кубическими кривыми через все точки (Catmull-Rom -> Bezier)."""
    pts = list(points)
    if len(pts) < 3:
        return pts
    result: list[Point] = [pts[0]]
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = p1 + (p2 - p0) * (tension / 3.0)
        c2 = p2 - (p3 - p1) * (tension / 3.0)
        result.append(c1)
        result.append(c2)
        result.append(p2)
    return result


def line_to_bezier(a: Point, b: Point) -> Bezier:
    """Прямая как вырожденная кривая Безье (нужна для единообразного контура)."""
    delta = b - a
    return Bezier(a, a + delta / 3.0, a + delta * 2.0 / 3.0, b)


def path_from_points(points: Sequence[Point]) -> Path:
    """Собрать путь из точек: прямые участки идут отрезками, остальное сглаживается."""
    pts = list(points)
    if len(pts) < 2:
        return Path([])
    segments = [line_to_bezier(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    return Path(segments)


def curve_through_points(points: Sequence[Point], tension: float = 0.5) -> Path:
    """Путь со сглаживанием Catmull-Rom; прямолинейные участки не искажаются."""
    pts = list(points)
    if len(pts) < 2:
        return Path([])
    if len(pts) == 2:
        return Path([line_to_bezier(pts[0], pts[1])])
    controls = smooth(pts, tension)
    segments: list[Bezier] = []
    for i in range(0, len(controls) - 3, 3):
        segments.append(Bezier(controls[i], controls[i + 1], controls[i + 2], controls[i + 3]))
    return Path(segments)


def iter_all(points: Iterable[Point]) -> list[float]:
    return [p.x for p in points]
