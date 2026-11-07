"""Схемы запросов и ответов API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, StrictFloat


class GenerateRequest(BaseModel):
    model: str = Field(..., description="Идентификатор базовой модели из каталога")
    measurements: dict[str, StrictFloat] = Field(
        default_factory=dict, description="Мерки в сантиметрах"
    )
    params: dict[str, Any] = Field(default_factory=dict, description="Параметры фасона")
    overrides: dict[str, StrictFloat] = Field(
        default_factory=dict,
        description="Переопределения точек чертежа из редактора, в сантиметрах",
    )


class Issue(BaseModel):
    """Замечание валидатора: код, параметры и текст по умолчанию."""

    code: str = Field(..., description="Код замечания, по нему фронтенд строит перевод")
    params: dict[str, Any] = Field(default_factory=dict)
    text: str = Field(..., description="Текст по умолчанию на русском")


class ValidateResponse(BaseModel):
    ok: bool
    errors: list[Issue] = Field(default_factory=list)
    warnings: list[Issue] = Field(default_factory=list)
    error_texts: list[str] = Field(default_factory=list)
    warning_texts: list[str] = Field(default_factory=list)


PaperSize = Literal["A4", "A3", "A2", "A1", "A0", "LETTER", "LEGAL", "FULL"]
Orientation = Literal["portrait", "landscape"]


class PaperOptions(BaseModel):
    page: PaperSize = "A4"
    orientation: Orientation = "landscape"
    calibration: bool = False


class PrintRequest(GenerateRequest):
    paper: PaperOptions = Field(default_factory=PaperOptions)


class PointModel(BaseModel):
    x: StrictFloat
    y: StrictFloat


class NotchModel(BaseModel):
    x: StrictFloat
    y: StrictFloat
    label: str = ""


class GrainlineModel(BaseModel):
    x1: StrictFloat
    y1: StrictFloat
    x2: StrictFloat
    y2: StrictFloat


class InternalLineModel(BaseModel):
    type: str = "internal"
    points: list[PointModel] = Field(default_factory=list)


class CustomPieceModel(BaseModel):
    id: str = Field("", description="Идентификатор детали: латиница, цифры и дефис")
    name: str = Field("", description="Название детали")
    outline: list[PointModel] = Field(default_factory=list, description="Контур в миллиметрах")
    cut: int = Field(1, description="Сколько раз выкраивать деталь")
    seam_allowance_mm: StrictFloat = Field(10.0, description="Припуск на шов в миллиметрах")
    mirrored: bool = Field(False, description="Деталь зеркалится при раскрое")
    notches: list[NotchModel] = Field(default_factory=list)
    grainline: GrainlineModel | None = None
    internal_lines: list[InternalLineModel] = Field(default_factory=list)


class CustomGenerateRequest(BaseModel):
    pieces: list[CustomPieceModel] = Field(default_factory=list)


class CustomExportRequest(CustomGenerateRequest):
    paper: PaperOptions = Field(default_factory=PaperOptions)
