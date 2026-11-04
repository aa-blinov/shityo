"""Схема антропометрических данных: справочник мерок и их диапазонов.

Справочник один на все модели: он же используется валидатором и фронтендом
для подсказок и границ полей ввода.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MeasurementSpec:
    id: str
    label: str
    unit: str = "cm"
    min: float = 0.0
    max: float = 250.0
    step: float = 0.5


SPECS: dict[str, MeasurementSpec] = {
    spec.id: spec
    for spec in [
        MeasurementSpec("bust", "Обхват груди", min=60, max=160),
        MeasurementSpec("waist", "Обхват талии", min=50, max=150),
        MeasurementSpec("hip", "Обхват бёдер", min=60, max=170),
        MeasurementSpec("height", "Рост", min=120, max=210, step=1),
        MeasurementSpec("shoulder_width", "Ширина плеча", min=30, max=60),
        MeasurementSpec("shoulder_slope", "Наклон плеча", min=8, max=28, step=0.5),
        MeasurementSpec("back_length", "Длина спинки", min=40, max=110),
        MeasurementSpec("sleeve_length", "Длина рукава", min=10, max=95),
        MeasurementSpec("waist_to_armpit", "От талии до подмышки", min=10, max=35),
        MeasurementSpec("biceps", "Обхват бицепса", min=18, max=60),
        MeasurementSpec("neck_circumference", "Обхват шеи", min=28, max=55),
        MeasurementSpec("neck_to_waist", "Длина от шеи до талии", min=30, max=60),
        MeasurementSpec("crotch_depth", "Глубина шага", min=18, max=40),
        MeasurementSpec("waist_to_hip", "Длина от талии до бёдер", min=10, max=35),
        MeasurementSpec("inseam_length", "Шаговый шов", min=50, max=100),
        MeasurementSpec("knee_length", "Длина до колена", min=25, max=70),
        MeasurementSpec("knee_circumference", "Обхват колена", min=25, max=75),
        MeasurementSpec("skirt_length", "Длина юбки", min=30, max=100),
    ]
}


def spec(measurement_id: str) -> MeasurementSpec | None:
    return SPECS.get(measurement_id)


def label(measurement_id: str) -> str:
    found = SPECS.get(measurement_id)
    return found.label if found else measurement_id
