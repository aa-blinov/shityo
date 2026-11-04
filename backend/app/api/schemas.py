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
