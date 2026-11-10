"""План кроя детали для печати: что печатать и где линия реза.

Две вещи, которые делают печать похожей на выкройку из ателье:

1. Деталь без шва посередине (перед и спинка футболки, спинка рубашки,
   полотнища юбки) кроится со сгибом ткани. Печатается её половина: край
   по сгибу отмечается скобкой «сгиб», деталь подписывается «1 деталь со
   сгибом». Полная симметричная деталь занимает вдвое больше бумаги и
   сбивает с толку - на ткани её всё равно кладут на сгиб.
2. Припуск откладывается от каждого среза свой: по сгибу - ноль, по низу -
   на подгибку, по остальным - шов (drafts/cutting.py). Без припусков
   (allowances=False) линия реза совпадает с линией шва.

Деталь сгиба узнаётся по геометрии: внутренняя линия типа fold по оси x = 0
через всю высоту детали и контур, симметричный относительно неё.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..core.geometry import Point, polygon_area
from .contour import ring_to_polyline, to_xy_list

ON_AXIS_MM = 0.5
# Детали, у которых есть низ на подгибку (панели и рукава).
HEM_PIECES = {"front", "back", "sleeve"}


@dataclass
class CutPlan:
    """Что печатать: линия шва, линия реза, припуски и сгиб."""

    outline: list[tuple[float, float]]
    cut: list[tuple[float, float]]
    allowances: list[float]
    on_fold: bool
    fold_edge: tuple[tuple[float, float], tuple[float, float]] | None
    seam_mm: float
    hem_mm: float | None
    extra: dict = field(default_factory=dict)


def _fold_axis(piece) -> tuple[float, float] | None:
    """Отрезок сгиба по оси x = 0 (y от и до), если он есть."""
    best = None
    for line in getattr(piece, "internal_lines", []) or []:
        if line.get("type") != "fold":
            continue
        pts = to_xy_list(line.get("points", []) or [])
        if len(pts) < 2 or any(abs(x) > ON_AXIS_MM for x, _ in pts):
            continue
        ys = [y for _, y in pts]
        span = (min(ys), max(ys))
        if best is None or span[1] - span[0] > best[1] - best[0]:
            best = span
    return best


def _symmetric(ring: list[tuple[float, float]]) -> bool:
    """Контур симметричен относительно оси x = 0 (с допуском 1 мм)."""
    if not ring:
        return False
    xs = [x for x, _ in ring]
    if min(xs) > -1.0 or max(xs) < 1.0:
        return False
    right = sorted((round(y, 0), round(x, 0)) for x, y in ring if x > ON_AXIS_MM)
    left = sorted((round(y, 0), round(-x, 0)) for x, y in ring if x < -ON_AXIS_MM)
    if len(right) != len(left):
        return False
    return all(abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1 for a, b in zip(right, left))


def cuts_on_fold(piece) -> bool:
    """Деталь кроится одна со сгибом ткани: печатать её половину."""
    if int(getattr(piece, "cut", 1) or 1) != 1 or getattr(piece, "mirrored", False):
        return False
    axis = _fold_axis(piece)
    ring = ring_to_polyline(getattr(piece, "outline", []) or [])
    if axis is None or not _symmetric(ring):
        return False
    ys = [y for _, y in ring]
    return axis[1] - axis[0] >= 0.8 * (max(ys) - min(ys))


def _half(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Правая половина контура (x >= 0): отсечение полуплоскостью."""
    out: list[tuple[float, float]] = []
    n = len(ring)
    for i in range(n):
        a = ring[i]
        b = ring[(i + 1) % n]
        a_in = a[0] >= -1e-9
        b_in = b[0] >= -1e-9
        if a_in:
            out.append((max(a[0], 0.0), a[1]))
        if a_in != b_in:
            t = a[0] / (a[0] - b[0])
            out.append((0.0, a[1] + (b[1] - a[1]) * t))
    # Соседние точки на оси сливаются в один край сгиба.
    cleaned: list[tuple[float, float]] = []
    for p in out:
        if cleaned and math.dist(p, cleaned[-1]) < 1e-6:
            continue
        cleaned.append(p)
    return cleaned


def _near_polyline(
    point: tuple[float, float], polyline: list[tuple[float, float]], tol: float
) -> bool:
    px, py = point
    for (ax, ay), (bx, by) in zip(polyline, polyline[1:]):
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        t = (
            0.0
            if length2 < 1e-12
            else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
        )
        if math.hypot(ax + dx * t - px, ay + dy * t - py) <= tol:
            return True
    return False


def _edge_allowances(
    piece, ring: list[tuple[float, float]], fold: tuple[float, float] | None
) -> list[float]:
    """Припуск каждого среза контура (ребро i: точка i -> i+1)."""
    seam = float(getattr(piece, "seam_allowance", 10.0) or 0.0)
    hem = getattr(piece, "hem_allowance", None)
    by_label = getattr(piece, "edge_allowances", {}) or {}
    labelled = [
        (str(edge.get("label", "")), to_xy_list(edge.get("points", []) or []))
        for edge in getattr(piece, "seam_edges", []) or []
    ]
    ys = [y for _, y in ring]
    top, height = min(ys), (max(ys) - min(ys)) or 1.0
    orientation = 1.0 if polygon_area([Point(x, y) for x, y in ring]) > 0 else -1.0
    result: list[float] = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if fold is not None and abs(a[0]) <= ON_AXIS_MM and abs(b[0]) <= ON_AXIS_MM:
            result.append(0.0)
            continue
        label = next(
            (
                name
                for name, pts in labelled
                if len(pts) > 1 and _near_polyline(a, pts, 1.0) and _near_polyline(b, pts, 1.0)
            ),
            None,
        )
        if label is not None:
            result.append(float(by_label.get(label, seam)))
            continue
        # Низ: срез смотрит вниз и лежит в нижней части детали.
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1.0
        normal_y = orientation * -dx / length
        middle = (a[1] + b[1]) / 2
        if (
            hem is not None
            and getattr(piece, "id", "") in HEM_PIECES
            and normal_y > 0.6
            and middle > top + 0.6 * height
        ):
            result.append(float(hem))
            continue
        result.append(seam)
    return result


def offset_edges(
    ring: list[tuple[float, float]], distances: list[float]
) -> list[tuple[float, float]]:
    """Отступить от каждого ребра замкнутого контура наружу на своё расстояние.

    На стыке рёбер линии отступов пересекаются (как при построении линии
    реза); если угол слишком острый или рёбра параллельны с разным
    припуском, ставится срез угла - две точки.
    """
    n = len(ring)
    if n < 3:
        return list(ring)
    orientation = 1.0 if polygon_area([Point(x, y) for x, y in ring]) > 0 else -1.0
    normals = []
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1.0
        normals.append((orientation * dy / length, orientation * -dx / length))
    limit = 4.0 * max(distances + [1.0])
    out: list[tuple[float, float]] = []
    for j in range(n):
        i = (j - 1) % n
        p = ring[j]
        na, da = normals[i], distances[i]
        nb, db = normals[j], distances[j]
        a0 = (ring[i][0] + na[0] * da, ring[i][1] + na[1] * da)
        a1 = (p[0] + na[0] * da, p[1] + na[1] * da)
        b0 = (p[0] + nb[0] * db, p[1] + nb[1] * db)
        b1 = (ring[(j + 1) % n][0] + nb[0] * db, ring[(j + 1) % n][1] + nb[1] * db)
        rx, ry = a1[0] - a0[0], a1[1] - a0[1]
        sx, sy = b1[0] - b0[0], b1[1] - b0[1]
        cross = rx * sy - ry * sx
        if abs(cross) < 1e-9 * max(1.0, math.hypot(rx, ry) * math.hypot(sx, sy)):
            if abs(da - db) < 1e-9:
                out.append(b0)
            else:
                out.extend([a1, b0])
            continue
        t = ((b0[0] - a0[0]) * sy - (b0[1] - a0[1]) * sx) / cross
        x = (a0[0] + rx * t, a0[1] + ry * t)
        if math.dist(x, p) > limit:
            out.extend([a1, b0])
        else:
            out.append(x)
    return out


# Клин вытачки в контуре: вершина глубже соседних точек хотя бы на 30 мм,
# а стороны клина ближе друг к другу по высоте, чем 120 мм.
DART_DEPTH_MM = 30.0
DART_OPENING_MM = 120.0


def _bridge_darts(
    ring: list[tuple[float, float]], distances: list[float]
) -> tuple[list[tuple[float, float]], list[float]]:
    """Контур без вершин клиньев вытачек: раствор перекрыт прямой.

    distances[i] - припуск ребра ring[i] -> ring[i+1]; ребро, перекрывающее
    раствор, получает припуск входящей стороны клина.
    """
    n = len(ring)
    if n < 5:
        return ring, distances
    drop: set[int] = set()
    for i in range(n):
        prev, p, nxt = ring[i - 1], ring[i], ring[(i + 1) % n]
        inward = (
            abs(prev[0]) - abs(p[0]) > DART_DEPTH_MM and abs(nxt[0]) - abs(p[0]) > DART_DEPTH_MM
        )
        if inward and abs(prev[1] - nxt[1]) < DART_OPENING_MM and (prev[0] > 0) == (nxt[0] > 0):
            drop.add(i)
    if not drop:
        return ring, distances
    out_ring: list[tuple[float, float]] = []
    out_dist: list[float] = []
    for i in range(n):
        if i in drop:
            continue
        out_ring.append(ring[i])
        # Ребро до вершины становится ребром через раствор: припуск тот же.
        out_dist.append(distances[i])
    return out_ring, out_dist


def cut_plan(piece, allowances: bool = True, fold_halves: bool = True) -> CutPlan:
    """Линия шва и линия реза детали для печати."""
    ring = ring_to_polyline(getattr(piece, "outline", []) or [])
    on_fold = fold_halves and cuts_on_fold(piece)
    if on_fold:
        ring = _half(ring)
    axis = _fold_axis(piece)
    # Край по сгибу: у половинки детали сгиба и у детали, которая уже
    # нарисована половиной от сгиба (воротник, стойка).
    fold = (
        axis if on_fold or (axis is not None and min(x for x, _ in ring) >= -ON_AXIS_MM) else None
    )
    distances = _edge_allowances(piece, ring, fold) if allowances else [0.0] * len(ring)
    # Линия реза идёт через раствор вытачки, а не по её сторонам: вытачку
    # не вырезают, её размечают и застрачивают. Линия шва остаётся с клином -
    # по нему швея переносит стороны вытачки на ткань.
    cut_ring, cut_distances = _bridge_darts(ring, distances)
    cut = (
        offset_edges(cut_ring, cut_distances)
        if any(d > 0 for d in cut_distances)
        else list(cut_ring)
    )
    fold_edge = None
    if fold is not None:
        on_axis = [p for p in ring if abs(p[0]) <= ON_AXIS_MM]
        if len(on_axis) >= 2:
            ys = [y for _, y in on_axis]
            fold_edge = ((0.0, min(ys)), (0.0, max(ys)))
            # Линия реза кончается на сгибе: на углах она не заходит за ось.
            cut = [(max(x, 0.0), y) for x, y in cut]
    hem = getattr(piece, "hem_allowance", None)
    return CutPlan(
        outline=ring,
        cut=cut,
        allowances=distances,
        on_fold=on_fold,
        fold_edge=fold_edge,
        seam_mm=float(getattr(piece, "seam_allowance", 10.0) or 0.0) if allowances else 0.0,
        hem_mm=(float(hem) if hem is not None else None) if allowances else None,
    )


def cut_label(piece, plan: CutPlan) -> str:
    """Подпись детали на лекале: название и как кроить."""
    name = str(getattr(piece, "name", "") or getattr(piece, "id", "")).strip()
    count = int(getattr(piece, "cut", 1) or 1)
    fold = plan.fold_edge is not None
    if count == 1:
        how = "1 деталь со сгибом" if fold else "1 деталь"
    else:
        noun = "детали" if count < 5 else "деталей"
        how = f"{count} {noun}"
        if fold:
            how += " со сгибом"
        elif getattr(piece, "mirrored", False):
            how += " зеркально"
    return f"{name} — {how}"


def allowance_note(plan: CutPlan) -> str:
    """Строка о припусках: напечатано ли с ними и какие."""
    if plan.seam_mm <= 0:
        return "Без припусков: добавьте при раскрое"
    text = f"Припуски включены: швы {plan.seam_mm / 10:g} см"
    if plan.hem_mm:
        text += f", низ {plan.hem_mm / 10:g} см"
    return text.replace(".", ",")
