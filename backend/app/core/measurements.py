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
        # Полуобхваты и вертикальные мерки для платья, жилета, пальто.
        MeasurementSpec("half_neck", "Полуобхват шеи", min=12, max=22),
        MeasurementSpec("half_bust", "Полуобхват груди", min=30, max=90),
        MeasurementSpec("half_waist", "Полуобхват талии", min=25, max=80),
        MeasurementSpec("half_hip", "Полуобхват бёдер", min=35, max=95),
        MeasurementSpec("back_waist_length", "Длина спинки до талии", min=30, max=55),
        MeasurementSpec("front_waist_length", "Длина переда до талии", min=32, max=58),
        MeasurementSpec("back_width", "Ширина спины", min=25, max=50),
        MeasurementSpec("chest_width", "Ширина груди", min=25, max=55),
        MeasurementSpec("shoulder_length", "Длина плеча", min=10, max=20),
        MeasurementSpec("bust_height", "Высота груди", min=18, max=35),
        MeasurementSpec("bust_center", "Центр груди", min=14, max=30),
        MeasurementSpec("armhole_depth", "Глубина проймы", min=12, max=25),
        MeasurementSpec("garment_length", "Длина изделия", min=50, max=130),
    ]
}


def spec(measurement_id: str) -> MeasurementSpec | None:
    return SPECS.get(measurement_id)


def label(measurement_id: str) -> str:
    found = SPECS.get(measurement_id)
    return found.label if found else measurement_id
