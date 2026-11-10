"""Проверка основы по паспорту: типовая ли она и сходится ли.

Три уровня, от самого строгого:

1. **Сборка по всей сетке.** Основа строится на каждом размере своей сетки
   ГОСТ без ошибок проверки (контур, швы, мерки).
2. **Пары швов паспорта.** Каждая пара ``[[seams]]`` находит свои срезы и
   сходится по длине с допуском 5 мм сверх задуманной посадки - на всех
   размерах.
3. **Типовые размеры.** Для типовых фигур из ``reference.toml`` размеры
   чертежа сверяются с методикой (``checks.toml``): ширина горловины,
   глубина проймы, посадки и т.д.

Отклонение, которое принято сознательно (трикотаж с широкой горловиной),
записывается в reference.toml полем ``accepted`` с причиной: в отчёте оно
видно как принятое, а не как ошибка.
"""

from __future__ import annotations

import math
import tomllib
from dataclasses import asdict, dataclass, field
from functools import cache

from ..core.geometry import polyline_length
from ..drafts.common import cervical_rise
from . import ROOT, passports, reference_path

SEAM_TOLERANCE_MM = 5.0
DEFAULT_TOLERANCE_CM = 0.3


@dataclass
class Row:
    """Одна строка отчёта."""

    level: str  # grid | seam | reference
    name: str
    status: str  # ok | fail | accepted
    figure: str = ""
    actual: float | None = None
    expected: tuple[float, float] | None = None
    unit: str = "см"
    source: str = ""
    note: str = ""


@dataclass
class Report:
    block: str
    name: str
    source: dict
    rows: list[Row] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(row.status != "fail" for row in self.rows)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["ok"] = self.ok
        data["counts"] = {
            status: sum(1 for row in self.rows if row.status == status)
            for status in ("ok", "accepted", "fail")
        }
        return data


@cache
def library() -> dict:
    with open(ROOT / "checks.toml", "rb") as handle:
        return tomllib.load(handle)


def reference(block_id: str) -> dict:
    path = reference_path(block_id)
    if not path.exists():
        return {}
    with open(path, "rb") as handle:
        return tomllib.load(handle)


class _Params(dict):
    """Параметры основы: p.ease_bust и p.get('ease_length', 0)."""

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _symbols(measurements: dict, params: dict, pieces: dict) -> dict:
    m = measurements

    def half(name_half: str, name_full: str) -> float | None:
        if name_half in m:
            return float(m[name_half])
        if name_full in m:
            return float(m[name_full]) / 2.0
        return None

    def edge_points(piece: str, label: str):
        found = next((e for e in pieces[piece].seam_edges if e["label"] == label), None)
        if found is None:
            raise KeyError(f"нет среза {piece}.{label}")
        return found["points"]

    def coords(piece: str, label: str, axis: str) -> list[float]:
        return [getattr(p, axis) / 10.0 for p in edge_points(piece, label)]

    def notch(piece: str, label: str) -> float:
        found = next((n for n in pieces[piece].notches if n.get("label") == label), None)
        if found is None:
            raise KeyError(f"нет надсечки {piece}.{label}")
        return float(found["y"]) / 10.0

    def width_at(piece: str, y_cm: float) -> float:
        """Ширина детали по горизонтали на высоте y (по контуру), см."""
        ring = pieces[piece].outline
        y = y_cm * 10.0
        xs: list[float] = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (a.y - y) * (b.y - y) <= 0 and a.y != b.y:
                xs.append(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y))
        return (max(xs) - min(xs)) / 10.0 if xs else 0.0

    vprz = m.get("armhole_depth")
    if vprz is None and "neck_to_waist" in m and "waist_to_armpit" in m:
        vprz = m["neck_to_waist"] - m["waist_to_armpit"]
    return {
        "m": _Params(m),
        "p": _Params(params),
        "Sg": half("half_bust", "bust"),
        "St": half("half_waist", "waist"),
        "Sb": half("half_hip", "hip"),
        "Ssh": half("half_neck", "neck_circumference"),
        "Dts": m.get("back_waist_length", m.get("neck_to_waist")),
        "Vprz": vprz,
        "Di": m.get("garment_length", m.get("back_length")),
        "Op": m.get("biceps"),
        "edge": lambda piece, label: polyline_length(edge_points(piece, label)) / 10.0,
        "xmax": lambda piece, label: max(coords(piece, label, "x")),
        "xmin": lambda piece, label: min(coords(piece, label, "x")),
        "ymax": lambda piece, label: max(coords(piece, label, "y")),
        "ymin": lambda piece, label: min(coords(piece, label, "y")),
        "width": lambda piece: pieces[piece].bbox.width / 10.0,
        "height": lambda piece: pieces[piece].bbox.height / 10.0,
        "girth": lambda *ids: sum(pieces[i].girth_cm for i in ids),
        "notch": notch,
        "width_at": width_at,
        "cut": lambda piece: pieces[piece].cut,
        "rise": cervical_rise(half("half_neck", "neck_circumference") or 0.0),
        "min": min,
        "max": max,
        "abs": abs,
    }


def _eval(expression: str, symbols: dict, e: float = 0.0) -> float:
    value = eval(expression, {"__builtins__": {}}, {**symbols, "e": e})  # noqa: S307
    return float(value)


def _figure_row(block_id: str, figure: dict) -> dict:
    from ..core.sizes import SIZE_GRIDS

    rows = [
        r for r in SIZE_GRIDS.get(block_id, []) if r.get("designation") == figure["designation"]
    ]
    if figure.get("gender"):
        rows = [r for r in rows if r.get("gender") == figure["gender"]]
    if not rows:
        raise LookupError(f"{block_id}: в сетке нет типовой фигуры {figure['designation']}")
    return rows[0]


def _defaults(passport_id: str, gender: str | None) -> dict:
    from ..drafts.catalog import catalog_item

    item = catalog_item(passport_id)
    params = {k: v["default"] for k, v in item["params"].items()}
    if gender and "gender" in params:
        params["gender"] = gender
    return params


def _check_seams(block_id: str, pieces: dict, figure: str) -> list[Row]:
    rows: list[Row] = []
    for seam in passports()[block_id].seams:

        def side(edges: list[str]) -> float | None:
            total = 0.0
            for spec in edges:
                piece_id, label = spec.split(".", 1)
                piece = pieces.get(piece_id)
                edge = (
                    next((e for e in piece.seam_edges if e["label"] == label), None)
                    if piece
                    else None
                )
                if edge is None:
                    return None
                total += polyline_length(edge["points"])
            return total

        a, b = side(seam.a), side(seam.b)
        name = f"{' + '.join(seam.a)} / {' + '.join(seam.b)}"
        if a is None or b is None:
            rows.append(Row("seam", name, "fail", figure, note="срез не найден в деталях"))
            continue
        low, high = seam.ease
        diff = a - b
        ok = low - SEAM_TOLERANCE_MM <= diff <= high + SEAM_TOLERANCE_MM
        rows.append(
            Row(
                "seam",
                name,
                "ok" if ok else "fail",
                figure,
                round(diff, 1),
                (low, high),
                "мм",
                note=seam.note,
            )
        )
    return rows


def check_block(block_id: str, full_grid: bool = True) -> Report:
    """Отчёт по основе: сетка, пары швов, типовые размеры."""
    from ..core.sizes import SIZE_GRIDS
    from ..core.validation import validate
    from ..drafts import build_draft

    passport = passports()[block_id]
    report = Report(block_id, passport.name, passport.source.model_dump())

    # 1-2. Вся сетка: сборка без ошибок и пары швов.
    grid = SIZE_GRIDS.get(block_id, [])
    failed_sizes: list[str] = []
    seam_fails: dict[str, Row] = {}
    for row in grid if full_grid else grid[:3]:
        label = f"{row.get('gender', '')} {row.get('designation', row['size'])}".strip()
        params = _defaults(block_id, row.get("gender"))
        try:
            pieces = {p.id: p for p in build_draft(block_id, row["measurements"], params)}
            result = validate(list(pieces.values()), row["measurements"], params)
        except Exception as exc:  # noqa: BLE001 - любая ошибка построения - провал размера
            failed_sizes.append(f"{label}: {exc}")
            continue
        if result["errors"]:
            failed_sizes.append(f"{label}: {result['error_texts'][0]}")
        for seam_row in _check_seams(block_id, pieces, label):
            if seam_row.status == "fail":
                seam_fails.setdefault(seam_row.name, seam_row)
    report.rows.append(
        Row(
            "grid",
            f"Сборка на {len(grid)} размерах сетки",
            "fail" if failed_sizes else "ok",
            note="; ".join(failed_sizes[:3]),
        )
    )
    for seam in passport.seams:
        name = f"{' + '.join(seam.a)} / {' + '.join(seam.b)}"
        failed = seam_fails.get(name)
        report.rows.append(
            failed
            or Row(
                "seam",
                name,
                "ok",
                "вся сетка",
                expected=tuple(seam.ease),
                unit="мм",
                note=seam.note,
            )
        )

    # 3. Типовые размеры для типовых фигур.
    ref = reference(block_id)
    lib = library()
    for figure in ref.get("figure", []):
        row = _figure_row(block_id, figure)
        params = _defaults(block_id, figure.get("gender"))
        pieces = {p.id: p for p in build_draft(block_id, row["measurements"], params)}
        symbols = _symbols(row["measurements"], params, pieces)
        for check_id, override in ref.get("checks", {}).items():
            spec = {**lib.get(check_id, {}), **override}
            if "measure" not in spec:
                raise LookupError(f"{block_id}: проверки {check_id} нет в checks.toml")
            tolerance = float(spec.get("tolerance", DEFAULT_TOLERANCE_CM))
            try:
                actual = _eval(spec["measure"], symbols)
                if "range" in spec:
                    low, high = (float(v) for v in spec["range"])
                else:
                    e_low, e_high = (float(v) for v in spec.get("ease", (0.0, 0.0)))
                    low = _eval(spec["expect"], symbols, e_low)
                    high = _eval(spec["expect"], symbols, e_high)
            except (KeyError, AttributeError, TypeError, ZeroDivisionError) as exc:
                report.rows.append(
                    Row(
                        "reference",
                        spec.get("title", check_id),
                        "fail",
                        figure["designation"],
                        source=spec.get("source", ""),
                        note=f"не измерить: {exc}",
                    )
                )
                continue
            inside = low - tolerance <= actual <= high + tolerance
            status = "ok" if inside else ("accepted" if spec.get("accepted") else "fail")
            report.rows.append(
                Row(
                    "reference",
                    spec.get("title", check_id),
                    status,
                    figure["designation"],
                    round(actual, 2) if math.isfinite(actual) else None,
                    (round(low, 2), round(high, 2)),
                    spec.get("unit", "см"),
                    spec.get("source", ""),
                    spec.get("accepted", "") if status == "accepted" else "",
                )
            )
    return report


def check_all(full_grid: bool = True) -> list[Report]:
    return [check_block(block_id, full_grid) for block_id in passports()]
