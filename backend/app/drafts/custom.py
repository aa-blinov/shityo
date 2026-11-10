"""Пользовательские детали: приём готовой геометрии без построения по меркам.

Редактор с нуля считает контур в браузере, а сервер только проверяет
геометрию, раскладывает её на листы и экспортирует. Поэтому здесь нет
формул одежды: есть валидация входных данных и сборка ``Piece``.
"""

from __future__ import annotations

import math
import re

from ..core.geometry import Point, polygon_area
from .base import DraftError, Piece

MAX_PIECES = 32
MIN_POINTS = 3
MAX_POINTS = 2000
MAX_COORD_MM = 20_000.0
MIN_AREA_MM2 = 1.0
MAX_SEAM_ALLOWANCE_MM = 50.0
MIN_SEAM_ALLOWANCE_MM = 0.0
MAX_CUT = 8
MAX_NAME_LENGTH = 80
PIECE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")


def build_custom(pieces: list) -> list[Piece]:
    """Собрать детали из запроса редактора.

    ``pieces`` - список pydantic-моделей ``CustomPieceModel``. Ошибки
    формулируются по-русски: API отдаёт их пользователю.
    """
    if not pieces:
        raise DraftError("Добавьте хотя бы одну деталь")
    if len(pieces) > MAX_PIECES:
        raise DraftError(f"Слишком много деталей: максимум {MAX_PIECES}")

    built: list[Piece] = []
    seen: set[str] = set()
    for index, item in enumerate(pieces, start=1):
        piece = _build_piece(item, index)
        if piece.id in seen:
            raise DraftError(f"Идентификатор детали повторяется: {piece.id}")
        seen.add(piece.id)
        built.append(piece)
    return built


def _build_piece(item, index: int) -> Piece:
    piece_id = _clean_id(item.id, index)
    name = (item.name or "").strip()
    if not name:
        name = f"Деталь {index}"
    name = name[:MAX_NAME_LENGTH]

    points = _clean_outline(item.outline, name)
    seam = _number(item.seam_allowance_mm, f"Припуск детали {name}")
    if seam < MIN_SEAM_ALLOWANCE_MM or seam > MAX_SEAM_ALLOWANCE_MM:
        raise DraftError(
            f"Припуск детали {name} должен быть от {MIN_SEAM_ALLOWANCE_MM:g} "
            f"до {MAX_SEAM_ALLOWANCE_MM:g} мм"
        )
    cut = int(item.cut)
    if cut < 1 or cut > MAX_CUT:
        raise DraftError(f"Количество деталей {name} должно быть от 1 до {MAX_CUT}")

    notches = _clean_notches(item.notches, name)
    grainline = _clean_grainline(item.grainline, name)
    internal = _clean_internal(item.internal_lines, name)
    edges, allowances = _clean_edges(
        getattr(item, "seam_edges", []) or [], getattr(item, "edge_allowances_mm", {}) or {}, name
    )

    return Piece(
        id=piece_id,
        name=name,
        outline=points,
        seam_allowance=seam,
        notches=notches,
        grainline=grainline,
        internal_lines=internal,
        mirrored=bool(item.mirrored),
        cut=cut,
        seam_edges=edges,
        edge_allowances=allowances,
        girth_cm=0.0,
    )


def _clean_id(raw: str, index: int) -> str:
    value = (raw or "").strip().lower()
    if not value:
        value = f"piece-{index}"
    if not PIECE_ID.match(value):
        raise DraftError("Идентификатор детали может содержать только латиницу, цифры и дефис")
    return value


def _clean_outline(raw_points: list, name: str) -> list[Point]:
    if not raw_points:
        raise DraftError(f"У детали {name} нет контура")
    if len(raw_points) > MAX_POINTS:
        raise DraftError(f"У детали {name} слишком много точек: максимум {MAX_POINTS}")

    points: list[Point] = []
    for raw in raw_points:
        x = _number(raw.x, f"Координата X детали {name}")
        y = _number(raw.y, f"Координата Y детали {name}")
        if abs(x) > MAX_COORD_MM or abs(y) > MAX_COORD_MM:
            raise DraftError(f"У детали {name} координаты выходят за допустимые пределы")
        points.append(Point(x, y))

    # Редактор может прислать замыкающую точку: она не нужна, контур
    # замыкается сам.
    if len(points) > 1 and points[0].distance_to(points[-1]) < 0.01:
        points.pop()
    if len(points) < MIN_POINTS:
        raise DraftError(f"У детали {name} меньше трёх точек")

    # Повторяющиеся соседние точки ломают нормали припуска.
    cleaned: list[Point] = []
    for point in points:
        if cleaned and cleaned[-1].distance_to(point) < 0.01:
            continue
        cleaned.append(point)
    if cleaned[0].distance_to(cleaned[-1]) < 0.01:
        cleaned.pop()
    if len(cleaned) < MIN_POINTS:
        raise DraftError(f"У детали {name} меньше трёх разных точек")
    if abs(polygon_area(cleaned)) < MIN_AREA_MM2:
        raise DraftError(f"Площадь детали {name} слишком мала")
    return cleaned


def _clean_notches(raw_notches: list, name: str) -> list[dict]:
    notches: list[dict] = []
    for raw in raw_notches:
        x = _number(raw.x, f"Надсечка детали {name}")
        y = _number(raw.y, f"Надсечка детали {name}")
        if abs(x) > MAX_COORD_MM or abs(y) > MAX_COORD_MM:
            raise DraftError(f"Надсечка детали {name} выходит за допустимые пределы")
        notches.append({"x": x, "y": y, "label": (raw.label or "").strip()[:40]})
    return notches


def _clean_grainline(raw, name: str) -> tuple[Point, Point] | None:
    if raw is None:
        return None
    a = Point(
        _number(raw.x1, f"Долевая детали {name}"),
        _number(raw.y1, f"Долевая детали {name}"),
    )
    b = Point(
        _number(raw.x2, f"Долевая детали {name}"),
        _number(raw.y2, f"Долевая детали {name}"),
    )
    if abs(a.x) > MAX_COORD_MM or abs(a.y) > MAX_COORD_MM:
        raise DraftError(f"Долевая детали {name} выходит за допустимые пределы")
    if abs(b.x) > MAX_COORD_MM or abs(b.y) > MAX_COORD_MM:
        raise DraftError(f"Долевая детали {name} выходит за допустимые пределы")
    if a.distance_to(b) < 1.0:
        raise DraftError(f"Долевая детали {name} слишком короткая")
    return a, b


def _clean_internal(raw_lines: list, name: str) -> list[dict]:
    lines: list[dict] = []
    for raw in raw_lines:
        points = [
            Point(
                _number(point.x, f"Внутренняя линия детали {name}"),
                _number(point.y, f"Внутренняя линия детали {name}"),
            )
            for point in raw.points
        ]
        if len(points) < 2:
            raise DraftError(f"Внутренняя линия детали {name} должна иметь минимум две точки")
        lines.append(
            {
                "type": (raw.type or "internal").strip()[:20],
                "points": points,
                "label": (getattr(raw, "label", "") or "").strip()[:40],
            }
        )
    return lines


MAX_EDGES = 64


def _clean_edges(raw_edges: list, raw_allowances: dict, name: str) -> tuple[list[dict], dict]:
    """Подписанные срезы и их припуски: низ на подгибку, сгиб без припуска."""
    if len(raw_edges) > MAX_EDGES:
        raise DraftError(f"У детали {name} слишком много срезов: максимум {MAX_EDGES}")
    edges: list[dict] = []
    for raw in raw_edges:
        label = (raw.label or "").strip()[:40]
        points = [
            Point(_number(p.x, f"Срез детали {name}"), _number(p.y, f"Срез детали {name}"))
            for p in raw.points
        ]
        if label and len(points) >= 2:
            edges.append({"label": label, "points": points})
    labels = {edge["label"] for edge in edges}
    allowances: dict = {}
    for label, value in raw_allowances.items():
        mm = _number(value, f"Припуск среза детали {name}")
        if mm < MIN_SEAM_ALLOWANCE_MM or mm > MAX_SEAM_ALLOWANCE_MM:
            raise DraftError(
                f"Припуск среза детали {name} должен быть от {MIN_SEAM_ALLOWANCE_MM:g} "
                f"до {MAX_SEAM_ALLOWANCE_MM:g} мм"
            )
        if label in labels:
            allowances[label] = mm
    return edges, allowances


def _number(value, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise DraftError(f"{label}: нужно число") from exc
    if not math.isfinite(number):
        raise DraftError(f"{label}: нужно конечное число")
    return number
