"""Проверка лекала: геометрия деталей, мерки и параметры фасона.

Модуль ничего не строит и ничего не меняет - он только читает готовые детали
и отвечает на вопрос «можно ли это шить». Ошибки означают, что лекало
некорректно и печатать его нельзя; предупреждения означают, что лекало
печатать можно, но стоит взглянуть глазами.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Sequence

from shapely.geometry import LinearRing, Polygon

from ..core.geometry import Point, polygon_area, polyline_length
from ..core.issues import issue, render
from .measurements import SPECS

# Контур считается замкнутым, если первая и последняя точки совпадают.
CLOSURE_TOLERANCE_MM = 0.5

# Допустимый припуск на швы: меньше - шов не получится, больше - лекало
# переросло и наверняка ошиблось в мерках.
MIN_SEAM_ALLOWANCE_MM = 0.1
MAX_SEAM_ALLOWANCE_MM = 25.0

# Границы антропометрии в сантиметрах.
MEASUREMENT_RANGES = {name: (spec.min, spec.max) for name, spec in SPECS.items()}

# Границы параметров фасона в сантиметрах.
PARAM_RANGES: dict[str, tuple[float, float]] = {
    "ease": (0.0, 40.0),
    "length_delta": (-30.0, 30.0),
    "sleeve_length": (15.0, 95.0),
}

# Наибольшая посадка оката рукава в пройму, мм.
SLEEVE_CAP_EASE_MAX_MM = 50.0

# Доля (линия зерна) должна идти вдоль длинной стороны детали. Допуск в
# градусах: за пределами этого угла зерно явно положено не туда.
GRAINLINE_MAX_DEVIATION_DEG = 20.0


@dataclass(frozen=True)
class SeamPair:
    """Пара швов, которые должны сшиваться друг с другом.

    ``edge_a`` и ``edge_b`` - названия рёбер деталей ``piece_a`` и
    ``piece_b``. Название ребра ищется в списке ``piece.seam_edges``, который
    деталь объявляет сама: пока деталь не назвала свои рёбра, пара не
    проверяется.
    """

    piece_a: str
    edge_a: str
    piece_b: str
    edge_b: str
    tolerance_mm: float = 5.0


# Пары швов, объявленные моделью. Ключ - набор идентификаторов деталей
# модели: пока модель не объявила пары, проверка пропускается.
SEAM_PAIRS: dict[frozenset[str], list[SeamPair]] = {}


def declare_seam_pairs(piece_ids: Iterable[str], pairs: Iterable[SeamPair]) -> None:
    """Объявить пары сшиваемых швов для набора деталей модели."""
    SEAM_PAIRS[frozenset(piece_ids)] = list(pairs)


def _points(piece) -> list[Point]:
    return list(getattr(piece, "outline", []) or [])


def _check_closed(piece, errors: list[dict]) -> None:
    points = _points(piece)
    if len(points) < 3:
        errors.append(issue("contour.too_few_points", piece=piece.id, count=len(points)))
        return
    gap = points[0].distance_to(points[-1])
    if gap > CLOSURE_TOLERANCE_MM:
        errors.append(issue("contour.not_closed", piece=piece.id, gap=f"{gap:.1f}"))


def _check_simple(piece, errors: list[dict]) -> None:
    points = _points(piece)
    if len(points) < 3:
        return
    ring = LinearRing([(p.x, p.y) for p in points])
    if not ring.is_simple:
        errors.append(issue("contour.self_intersecting", piece=piece.id))
        return
    polygon = Polygon([(p.x, p.y) for p in points])
    if not polygon.is_valid:
        errors.append(issue("contour.not_simple", piece=piece.id))


def _check_area(piece, errors: list[dict]) -> None:
    points = _points(piece)
    if len(points) < 3:
        return
    area = abs(polygon_area(points))
    if area <= 0.0:
        errors.append(issue("contour.zero_area", piece=piece.id))


def _check_seam_allowance(piece, errors: list[dict]) -> None:
    allowance = getattr(piece, "seam_allowance", None)
    if allowance is None:
        errors.append(issue("seam.allowance.missing", piece=piece.id))
        return
    try:
        value = float(allowance)
    except (TypeError, ValueError):
        errors.append(issue("seam.allowance.not_number", piece=piece.id, value=repr(allowance)))
        return
    if value < MIN_SEAM_ALLOWANCE_MM:
        errors.append(issue("seam.allowance.too_small", piece=piece.id, value=f"{value:.1f}"))
    elif value >= MAX_SEAM_ALLOWANCE_MM:
        errors.append(
            issue(
                "seam.allowance.too_large",
                piece=piece.id,
                value=f"{value:.1f}",
                max=f"{MAX_SEAM_ALLOWANCE_MM:.0f}",
            )
        )


def _grainline_angle_to_long_axis(piece) -> float | None:
    """Угол между долей и осью зерна детали в градусах.

    Ось зерна по умолчанию вертикальная: в этой системе построения вертикаль
    всегда идёт вдоль длины изделия, даже когда деталь шире своей длины
    (юбка, разворот воротника). Деталь может объявить иное направление полем
    ``grain_axis``.
    """
    grainline = getattr(piece, "grainline", None)
    if not grainline:
        return None
    start, end = grainline[0], grainline[1]
    dx = end.x - start.x
    dy = end.y - start.y
    if math.hypot(dx, dy) < 1e-9:
        return None

    if str(getattr(piece, "grain_axis", "length")) == "width":
        axis = (1.0, 0.0)
    else:
        axis = (0.0, 1.0)

    dot = (dx * axis[0] + dy * axis[1]) / math.hypot(dx, dy)
    return math.degrees(math.acos(max(-1.0, min(1.0, abs(dot)))))


def _check_grainline(piece, warnings: list[dict]) -> None:
    if not getattr(piece, "grainline", None):
        warnings.append(issue("grainline.missing", piece=piece.id))
        return
    angle = _grainline_angle_to_long_axis(piece)
    if angle is None:
        warnings.append(issue("grainline.degenerate", piece=piece.id))
        return
    if angle > GRAINLINE_MAX_DEVIATION_DEG:
        warnings.append(issue("grainline.deviation", piece=piece.id, angle=f"{angle:.0f}"))


def _seam_edge_length(piece, label: str) -> float | None:
    """Длина ребра детали с указанным названием."""
    edges = getattr(piece, "seam_edges", None) or []
    for edge in edges:
        if str(edge.get("label", "")) == label:
            points = edge.get("points") or []
            if len(points) >= 2:
                return polyline_length(points)
            return None

    # Запасной путь: ребро ищется по надсечке с тем же названием - она стоит
    # на шве, который сшивается с другой деталью. Берётся ближайшее к надсечке
    # ребро контура.
    points = _points(piece)
    notch_point = None
    for notch in getattr(piece, "notches", []) or []:
        if str(notch.get("label", "")) == label:
            notch_point = Point(float(notch["x"]), float(notch["y"]))
            break
    if notch_point is None or len(points) < 2:
        return None

    best: tuple[float, float] | None = None
    for a, b in zip(points, points[1:]):
        distance = _distance_to_segment(notch_point, a, b)
        length = a.distance_to(b)
        if best is None or distance < best[0]:
            best = (distance, length)
    if best is None:
        return None
    return best[1]


def _check_constructed_seams(pieces: dict, errors: list[dict]) -> None:
    """Compare actual sewing paths, including edges made of two panel halves."""

    def length(piece_id, label):
        piece = pieces.get(piece_id)
        if piece is None:
            return None
        edge = next((e for e in piece.seam_edges if e.get("label") == label), None)
        return polyline_length(edge["points"]) if edge else None

    def compare(a, edge_a, b, edge_b, value_a, value_b, ease=(0.0, 0.0)):
        """Швы равны с допуском 5 мм; ease - допустимая посадка шва a, мм."""
        if value_a is None or value_b is None:
            return
        low, high = ease
        if not (low - 5.0 <= value_a - value_b <= high + 5.0):
            errors.append(
                issue(
                    "seam.length_mismatch",
                    piece_a=a,
                    edge_a=edge_a,
                    piece_b=b,
                    edge_b=edge_b,
                    length_a=f"{value_a:.1f}",
                    length_b=f"{value_b:.1f}",
                )
            )

    if "sleeve" in pieces:
        front, back = length("front", "пройма"), length("back", "пройма")
        if front is not None and back is not None:
            # Окат длиннее проймы на посадку рукава: до 5 см у пальто.
            compare(
                "sleeve",
                "окат",
                "front+back",
                "пройма",
                length("sleeve", "окат"),
                front + back,
                ease=(0.0, SLEEVE_CAP_EASE_MAX_MM),
            )
        for label in ("плечо", "бок"):
            compare("front", label, "back", label, length("front", label), length("back", label))
        if "collar" in pieces:
            front, back = length("front", "горловина"), length("back", "горловина")
            if front is not None and back is not None:
                compare(
                    "collar",
                    "горловина",
                    "front+back",
                    "горловина",
                    length("collar", "горловина"),
                    front + back,
                )
    elif "front" in pieces and "back" in pieces:
        for label in ("шаг", "бок"):
            compare("front", label, "back", label, length("front", label), length("back", label))


def _distance_to_segment(point: Point, a: Point, b: Point) -> float:
    """Расстояние от точки до отрезка."""
    dx = b.x - a.x
    dy = b.y - a.y
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-12:
        return point.distance_to(a)
    t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    closest = Point(a.x + t * dx, a.y + t * dy)
    return point.distance_to(closest)


def _check_seam_pairs(pieces_by_id: dict, errors: list[dict]) -> None:
    key = frozenset(pieces_by_id)
    pairs = SEAM_PAIRS.get(key)
    if not pairs:
        return
    for pair in pairs:
        piece_a = pieces_by_id.get(pair.piece_a)
        piece_b = pieces_by_id.get(pair.piece_b)
        if piece_a is None or piece_b is None:
            continue
        length_a = _seam_edge_length(piece_a, pair.edge_a)
        length_b = _seam_edge_length(piece_b, pair.edge_b)
        if length_a is None or length_b is None:
            continue
        if abs(length_a - length_b) > pair.tolerance_mm:
            errors.append(
                issue(
                    "seam.length_mismatch",
                    piece_a=pair.piece_a,
                    edge_a=pair.edge_a,
                    piece_b=pair.piece_b,
                    edge_b=pair.edge_b,
                    length_a=f"{length_a:.1f}",
                    length_b=f"{length_b:.1f}",
                )
            )


def _check_measurements(measurements: dict, errors: list[dict]) -> None:
    for name, (low, high) in MEASUREMENT_RANGES.items():
        if name not in measurements:
            continue
        value = measurements[name]
        try:
            value = float(value)
        except (TypeError, ValueError):
            errors.append(issue("measure.not_number", name=name, value=repr(measurements[name])))
            continue
        if not low <= value <= high:
            errors.append(
                issue(
                    "measure.out_of_range",
                    name=name,
                    value=f"{value:g}",
                    low=f"{low:g}",
                    high=f"{high:g}",
                )
            )

    for name, value in measurements.items():
        if not name.endswith("_length"):
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            errors.append(issue("measure.not_number", name=name, value=repr(measurements[name])))
            continue
        if value <= 0:
            errors.append(issue("measure.not_positive", name=name, value=f"{value:g}"))


def _check_params(params: dict, errors: list[dict]) -> None:
    from ..drafts.catalog import CATALOG

    # Параметр с одним именем у разных моделей может иметь разные границы
    # (рукав футболки короче рукава кофты с манжетой). Модель здесь не
    # известна, поэтому проверяется общий допустимый диапазон; границы модели
    # проверяет сборка (build_draft).
    ranges: dict[str, tuple[float, float]] = {}
    for item in CATALOG:
        for name, spec in item["params"].items():
            if spec["type"] != "number":
                continue
            low, high = ranges.get(name, (spec["min"], spec["max"]))
            ranges[name] = (min(low, spec["min"]), max(high, spec["max"]))
    for name, value in params.items():
        if name in ranges:
            low, high = ranges[name]
        elif name == "ease" or name.startswith("ease_"):
            low, high = PARAM_RANGES["ease"]
        elif name in PARAM_RANGES:
            low, high = PARAM_RANGES[name]
        else:
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            errors.append(issue("param.not_number", name=name, value=repr(params[name])))
            continue
        if not low <= value <= high:
            errors.append(
                issue(
                    "param.out_of_range",
                    name=name,
                    value=f"{value:g}",
                    low=f"{low:g}",
                    high=f"{high:g}",
                )
            )


def validate(pieces: Sequence, measurements: dict, params: dict) -> dict:
    """Проверить лекало и вернуть отчёт.

    Отчёт содержит и коды, и тексты: ``errors`` и ``warnings`` - список
    словарей ``{"code", "params", "text"}``, а ``error_texts`` и
    ``warning_texts`` - только строки для потребителей, которым коды не
    нужны.
    """
    errors: list[dict] = []
    warnings: list[dict] = []

    pieces = list(pieces)
    if not pieces:
        errors.append(issue("draft.no_pieces"))

    pieces_by_id: dict[str, object] = {}
    for piece in pieces:
        _check_closed(piece, errors)
        _check_simple(piece, errors)
        _check_area(piece, errors)
        _check_seam_allowance(piece, errors)
        _check_grainline(piece, warnings)
        pieces_by_id[piece.id] = piece

    _check_seam_pairs(pieces_by_id, errors)
    _check_constructed_seams(pieces_by_id, errors)
    _check_measurements(measurements or {}, errors)
    _check_params(params or {}, errors)

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "error_texts": render(errors),
        "warning_texts": render(warnings),
    }
