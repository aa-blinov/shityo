"""HTTP-роуты API.

Контракт зафиксирован в docs/API-CONTRACT.md; фронтенд и e2e-тесты
опираются именно на него.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from ..core.sizes import grid_for
from ..core.validation import validate
from ..drafts import CATALOG, build_draft
from ..drafts.base import DraftError
from ..drafts.catalog import catalog_item
from ..export.dxf import render_dxf
from ..export.pdf import render_pdf
from ..export.svg import render_svg_tiled
from .schemas import GenerateRequest, ValidateResponse, PrintRequest, PaperSize, Orientation
from ..export.layout import print_pages, MIN_OVERLAP_MM, MARGIN_MM

router = APIRouter(prefix="/api")


@router.get("/library")
def pattern_library() -> dict:
    from ..drafts.library import LIBRARY

    return LIBRARY


def _parse_json(raw: str | None, label: str) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Некорректный JSON в {label}: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail=f"{label} должен быть JSON-объектом")
    return data


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


def _effective_measurements(item: dict, measurements: dict) -> dict:
    """Пустой набор мерок означает "взять значения по умолчанию".

    Частично заданный набор - ошибка пользователя, а не повод молча
    дополнять его: тогда конструктор не заметит опечатку в мерке.
    """
    if not measurements:
        return dict(item["default_measurements"])
    return measurements


def _default_params(item: dict) -> dict:
    return {name: spec["default"] for name, spec in item["params"].items()}


@router.get("/catalog")
def catalog() -> dict:
    from ..core.measurements import SPECS

    return {
        "items": CATALOG,
        "measurement_ranges": {
            name: {"min": spec.min, "max": spec.max, "step": spec.step}
            for name, spec in SPECS.items()
        },
    }


@router.post("/generate")
def generate(request: GenerateRequest) -> dict:
    item = catalog_item(request.model)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Неизвестная модель: {request.model}")
    measurements = _effective_measurements(item, request.measurements)
    # Переопределения точек из редактора едут вместе с фасоном: чертёж строится
    # по ним, а не по меркам.
    params = {
        **_default_params(item),
        **{k: v for k, v in measurements.items() if k in item["params"]},
        **request.params,
        "overrides": request.overrides,
    }
    try:
        pieces = build_draft(request.model, measurements, params)
    except DraftError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    report = validate(pieces, measurements, params)
    return {
        "model": request.model,
        "size": measurements,
        "scale_mm": 1.0,
        "units": "mm",
        "pieces": [piece.to_dict() for piece in pieces],
        "warnings": report["warnings"],
        "errors": report["errors"],
        "warning_texts": report["warning_texts"],
        "error_texts": report["error_texts"],
        "metrics": _metrics(request.model, pieces),
    }


def _metrics(model_id: str, pieces) -> dict:
    """Сводные размеры изделия: их проверяет человек перед печатью."""
    metrics: dict[str, float] = {}
    for piece in pieces:
        metrics[f"{piece.id}_width_cm"] = round(piece.bbox.width / 10.0, 2)
        metrics[f"{piece.id}_height_cm"] = round(piece.bbox.height / 10.0, 2)
    return metrics


@router.post("/validate")
def validate_endpoint(request: GenerateRequest) -> ValidateResponse:
    item = catalog_item(request.model)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Неизвестная модель: {request.model}")
    measurements = _effective_measurements(item, request.measurements)
    # Переопределения точек из редактора едут вместе с фасоном: чертёж строится
    # по ним, а не по меркам.
    params = {
        **_default_params(item),
        **{k: v for k, v in measurements.items() if k in item["params"]},
        **request.params,
        "overrides": request.overrides,
    }
    try:
        pieces = build_draft(request.model, measurements, params)
    except DraftError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    report = validate(pieces, measurements, params)
    return ValidateResponse(**report)


@router.get("/validate/sizes")
def validate_sizes(model: str = Query(...)) -> list[dict]:
    grid = grid_for(model)
    if not grid:
        raise HTTPException(status_code=404, detail=f"Нет размерной сетки для модели: {model}")
    rows = []
    for row in grid:
        pieces = build_draft(model, row["measurements"], {})
        dimensions = {f"{piece.id}_width_cm": round(piece.bbox.width / 10.0, 1) for piece in pieces}
        dimensions.update(
            {f"{piece.id}_height_cm": round(piece.bbox.height / 10.0, 1) for piece in pieces}
        )
        rows.append(
            {"size": row["size"], "measurements": row["measurements"], "dimensions": dimensions}
        )
    return rows


@router.get("/export/{model}.svg")
def export_svg(
    model: str,
    measurements: str | None = Query(None),
    params: str | None = Query(None),
    page: PaperSize = "A4",
    orientation: Orientation = "landscape",
):
    from fastapi.responses import Response

    svg = _render(model, measurements, params, render_svg_tiled, page=page, orientation=orientation)
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/export/{model}.dxf")
def export_dxf(
    model: str,
    measurements: str | None = Query(None),
    params: str | None = Query(None),
):
    from fastapi.responses import Response

    dxf = _render(model, measurements, params, render_dxf)
    return Response(content=dxf, media_type="application/dxf")


@router.get("/export/{model}.pdf")
def export_pdf(
    model: str,
    measurements: str | None = Query(None),
    params: str | None = Query(None),
    page: PaperSize = "A4",
    orientation: Orientation = "landscape",
    calibration: bool = False,
    download: bool = False,
):
    from fastapi.responses import Response

    payload = _render(
        model,
        measurements,
        params,
        render_pdf,
        page=page,
        orientation=orientation,
        calibration=calibration,
    )
    disposition = "attachment" if download else "inline"
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{model}-{page}.pdf"'},
    )


@router.post("/print-plan")
def print_plan(request: PrintRequest) -> dict:
    pieces = _export_pieces(
        request.model, request.measurements, {**request.params, "overrides": request.overrides}
    )
    options = request.paper
    sheets = print_pages(pieces, **options.model_dump())
    effective_calibration = options.calibration and options.page != "FULL"
    parts = []
    for piece in pieces:
        assigned = [
            (index + 1, sheet)
            for index, sheet in enumerate(sheets)
            if piece.id in sheet.meta.get("piece_ids", [])
        ]
        parts.append(
            {
                "id": piece.id,
                "name": piece.name,
                "pages": [i for i, _ in assigned],
                "rows": max((p.meta.get("rows", 1) for _, p in assigned), default=1),
                "columns": max((p.meta.get("columns", 1) for _, p in assigned), default=1),
            }
        )
    return {
        "page_count": len(sheets),
        "pattern_page_count": len(sheets) - int(effective_calibration),
        "page": options.page,
        "orientation": options.orientation,
        "calibration": effective_calibration,
        "width_mm": sheets[0].width,
        "height_mm": sheets[0].height,
        "overlap_mm": MIN_OVERLAP_MM,
        "margin_mm": MARGIN_MM,
        "pieces": parts,
        "sheets": [{"number": i + 1, **p.meta} for i, p in enumerate(sheets)],
    }


def _render(
    model: str, measurements: str | None, params: str | None, renderer, **options
) -> object:
    pieces = _export_pieces(
        model, _parse_json(measurements, "measurements"), _parse_json(params, "params")
    )
    return renderer(pieces, **options)


def _export_pieces(model: str, measurements: dict, params: dict):
    item = catalog_item(model)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Неизвестная модель: {model}")
    meas = {**item["default_measurements"], **measurements}
    pars = {
        **_default_params(item),
        **{k: v for k, v in meas.items() if k in item["params"]},
        **params,
    }
    try:
        pieces = build_draft(model, meas, pars)
    except DraftError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    report = validate(pieces, meas, pars)
    if report["errors"]:
        raise HTTPException(status_code=400, detail="; ".join(report["error_texts"]))
    return pieces
