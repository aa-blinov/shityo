"""Базовые типы для конструкций: деталь лекала, ошибки, помощники черчения."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..core.geometry import (
    Bezier,
    BBox,
    Point,
    bounding_box,
    flatten_bezier,
    polygon_area,
)


class DraftError(Exception):
    """Ошибка построения: недостающая мерка или недопустимый параметр."""


@dataclass
class Piece:
    """Деталь лекала.

    Геометрия хранится в миллиметрах: экспорт в DXF/PDF должен быть 1:1,
    поэтому пересчёт из сантиметров делается один раз, при сборке детали.
    """

    id: str
    name: str
    outline: list[Point]
    seam_allowance: float = 10.0
    notches: list[dict] = field(default_factory=list)
    grainline: tuple[Point, Point] | None = None
    internal_lines: list[dict] = field(default_factory=list)
    mirrored: bool = False
    cut: int = 1
    # Швы детали: подписанные отрезки контура, которые сшиваются с другими
    # деталями. По ним проверяется, что детали совпадают по длине.
    seam_edges: list[dict] = field(default_factory=list)
    # Какую долю обхвата тела закрывает деталь с учётом числа выкраиваемых
    # частей (в сантиметрах). Нужна, чтобы проверять сходимость кроя: сумма
    # долей всех деталей должна совпасть с обхватом плюс прибавка.
    girth_cm: float = 0.0
    # Направление долевой нити относительно осей построения: "length" - вдоль
    # длины изделия (ось y), "width" - поперёк. Деталь может быть шире своей
    # длины (разворот воротника, расклешённая юбка), поэтому проверка зерна
    # не может опираться на bbox.
    grain_axis: str = "length"

    @property
    def bbox(self) -> BBox:
        return bounding_box(self.outline)

    @property
    def area(self) -> float:
        return abs(polygon_area(self.outline))

    def grainline_length(self) -> float:
        if not self.grainline:
            return 0.0
        return self.grainline[0].distance_to(self.grainline[1])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "mirrored": self.mirrored,
            "cut": self.cut,
            "outline": [{"x": p.x, "y": p.y} for p in self.outline],
            "seam_line": [{"x": p.x, "y": p.y} for p in self.outline],
            # Припуск отдаётся вместе с деталью: клиент не должен угадывать
            # его значение, иначе картинка на экране разойдётся с печатью.
            "seam_allowance_mm": self.seam_allowance,
            "notches": self.notches,
            "grainline": (
                {
                    "x1": self.grainline[0].x,
                    "y1": self.grainline[0].y,
                    "x2": self.grainline[1].x,
                    "y2": self.grainline[1].y,
                }
                if self.grainline
                else None
            ),
            "internal_lines": [
                {
                    "type": line.get("type", "unknown"),
                    "points": [{"x": p.x, "y": p.y} for p in line.get("points", [])],
                }
                for line in self.internal_lines
            ],
            "seam_edges": [
                {
                    "label": edge.get("label", ""),
                    "points": [{"x": p.x, "y": p.y} for p in edge.get("points", [])],
                }
                for edge in self.seam_edges
            ],
            "bbox": {
                "x": self.bbox.x,
                "y": self.bbox.y,
                "width": self.bbox.width,
                "height": self.bbox.height,
            },
            "area_mm2": self.area,
        }


def mm(value_cm: float) -> float:
    """Сантиметры черчения -> миллиметры детали."""
    return value_cm * 10.0


def require(measurements: dict, *names: str) -> list[float]:
    """Взять обязательные мерки; отсутствующая мерка - ошибка построения."""
    values: list[float] = []
    missing: list[str] = []
    for name in names:
        if name not in measurements or measurements[name] is None:
            missing.append(name)
            continue
        try:
            values.append(float(measurements[name]))
        except (TypeError, ValueError):
            missing.append(name)
    if missing:
        raise DraftError("Не хватает мерок: " + ", ".join(missing))
    return values


def sample(curve: Bezier, segments: int = 24) -> list[Point]:
    """Дискретизировать кривую в ломаную (для контура детали и экспорта)."""
    return flatten_bezier(curve, tolerance=0.2)


def arc(
    cx: float, cy: float, radius: float, a0: float, a1: float, segments: int = 24
) -> list[Point]:
    """Точки дуги в сантиметрах черчения."""
    points = []
    for i in range(segments + 1):
        t = i / segments
        angle = a0 + (a1 - a0) * t
        points.append(Point(cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    segments: int = 24,
) -> list[Point]:
    """Кривая Безье по координатам в сантиметрах, результат - ломаная в см."""
    curve = Bezier(Point(*p0), Point(*p1), Point(*p2), Point(*p3))
    return sample(curve, segments)


def to_mm(points: list[Point]) -> list[Point]:
    """Перевести ломаную из сантиметров черчения в миллиметры детали."""
    return [Point(p.x * 10.0, p.y * 10.0) for p in points]


def notch(point: Point, label: str) -> dict:
    return {"x": point.x, "y": point.y, "label": label}


def dart(base: Point, tip: Point, label: str = "вытачка") -> dict:
    return {
        "type": "dart",
        "points": [base, tip],
        "label": label,
    }
