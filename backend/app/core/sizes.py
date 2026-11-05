"""Размерные сетки.

Значения - типовые мерки взрослой фигуры в сантиметрах. Мерки вертикальные
(длины) и обхватные взяты из типовых фигур; каждая строка сетки - полный
набор мерок, по которому строится лекало целиком.

Смысл сетки такой же, как в FreeSewing (дизайн `models`): размер - это
набор мерок, а не масштаб готового лекала. Поэтому лекало для каждого
размера строится заново, и градация получается автоматически.
"""

from __future__ import annotations

SIZE_GRIDS: dict[str, list[dict]] = {
    "tee": [
        {
            "size": "42",
            "measurements": {
                "bust": 88,
                "waist": 76,
                "hip": 92,
                "height": 170,
                "shoulder_width": 43,
                "shoulder_slope": 13,
                "neck_to_waist": 42,
                "waist_to_armpit": 21,
                "waist_to_hip": 19,
                "biceps": 30,
                "back_length": 68,
                "sleeve_length": 60,
                "neck_circumference": 38,
            },
        },
        {
            "size": "44",
            "measurements": {
                "bust": 92,
                "waist": 80,
                "hip": 96,
                "height": 173,
                "shoulder_width": 44.5,
                "shoulder_slope": 13,
                "neck_to_waist": 43,
                "waist_to_armpit": 21.5,
                "waist_to_hip": 19.5,
                "biceps": 31,
                "back_length": 70,
                "sleeve_length": 61,
                "neck_circumference": 39,
            },
        },
        {
            "size": "46",
            "measurements": {
                "bust": 96,
                "waist": 84,
                "hip": 98,
                "height": 176,
                "shoulder_width": 46,
                "shoulder_slope": 13,
                "neck_to_waist": 44,
                "waist_to_armpit": 22,
                "waist_to_hip": 20,
                "biceps": 32,
                "back_length": 72,
                "sleeve_length": 62,
                "neck_circumference": 40,
            },
        },
        {
            "size": "48",
            "measurements": {
                "bust": 100,
                "waist": 88,
                "hip": 102,
                "height": 179,
                "shoulder_width": 47.5,
                "shoulder_slope": 13,
                "neck_to_waist": 45,
                "waist_to_armpit": 22.5,
                "waist_to_hip": 20.5,
                "biceps": 33,
                "back_length": 74,
                "sleeve_length": 63,
                "neck_circumference": 41,
            },
        },
        {
            "size": "50",
            "measurements": {
                "bust": 104,
                "waist": 92,
                "hip": 106,
                "height": 182,
                "shoulder_width": 49,
                "shoulder_slope": 13,
                "neck_to_waist": 46,
                "waist_to_armpit": 23,
                "waist_to_hip": 21,
                "biceps": 34,
                "back_length": 76,
                "sleeve_length": 64,
                "neck_circumference": 42,
            },
        },
    ],
    "shirt": [
        {
            "size": "42",
            "measurements": {
                "bust": 92,
                "waist": 80,
                "hip": 96,
                "height": 170,
                "shoulder_width": 43,
                "shoulder_slope": 13,
                "neck_to_waist": 44,
                "waist_to_armpit": 22,
                "waist_to_hip": 19,
                "biceps": 31,
                "back_length": 72,
                "sleeve_length": 60,
                "neck_circumference": 39,
            },
        },
        {
            "size": "44",
            "measurements": {
                "bust": 96,
                "waist": 84,
                "hip": 100,
                "height": 173,
                "shoulder_width": 44.5,
                "shoulder_slope": 13,
                "neck_to_waist": 45,
                "waist_to_armpit": 22.5,
                "waist_to_hip": 19.5,
                "biceps": 32,
                "back_length": 74,
                "sleeve_length": 61,
                "neck_circumference": 40,
            },
        },
        {
            "size": "46",
            "measurements": {
                "bust": 100,
                "waist": 88,
                "hip": 102,
                "height": 176,
                "shoulder_width": 46,
                "shoulder_slope": 13,
                "neck_to_waist": 46,
                "waist_to_armpit": 23,
                "waist_to_hip": 20,
                "biceps": 33,
                "back_length": 76,
                "sleeve_length": 62,
                "neck_circumference": 41,
            },
        },
        {
            "size": "48",
            "measurements": {
                "bust": 104,
                "waist": 92,
                "hip": 106,
                "height": 179,
                "shoulder_width": 47.5,
                "shoulder_slope": 13,
                "neck_to_waist": 47,
                "waist_to_armpit": 23.5,
                "waist_to_hip": 20.5,
                "biceps": 34,
                "back_length": 78,
                "sleeve_length": 63,
                "neck_circumference": 42,
            },
        },
    ],
    "trousers": [
        {
            "size": "42",
            "measurements": {
                "waist": 74,
                "hip": 90,
                "height": 170,
                "crotch_depth": 28,
                "inseam_length": 76,
                "knee_length": 42,
                "knee_circumference": 54,
            },
        },
        {
            "size": "44",
            "measurements": {
                "waist": 78,
                "hip": 94,
                "height": 173,
                "crotch_depth": 29,
                "inseam_length": 77,
                "knee_length": 43,
                "knee_circumference": 56,
            },
        },
        {
            "size": "46",
            "measurements": {
                "waist": 82,
                "hip": 98,
                "height": 176,
                "crotch_depth": 30,
                "inseam_length": 78,
                "knee_length": 44,
                "knee_circumference": 58,
            },
        },
        {
            "size": "48",
            "measurements": {
                "waist": 86,
                "hip": 102,
                "height": 179,
                "crotch_depth": 31,
                "inseam_length": 79,
                "knee_length": 45,
                "knee_circumference": 60,
            },
        },
    ],
    "skirt": [
        {
            "size": "42",
            "measurements": {
                "waist": 64,
                "hip": 88,
                "height": 168,
                "waist_to_hip": 19,
                "skirt_length": 52,
            },
        },
        {
            "size": "44",
            "measurements": {
                "waist": 68,
                "hip": 92,
                "height": 170,
                "waist_to_hip": 19.5,
                "skirt_length": 54,
            },
        },
        {
            "size": "46",
            "measurements": {
                "waist": 72,
                "hip": 96,
                "height": 172,
                "waist_to_hip": 20,
                "skirt_length": 56,
            },
        },
        {
            "size": "48",
            "measurements": {
                "waist": 76,
                "hip": 100,
                "height": 174,
                "waist_to_hip": 20.5,
                "skirt_length": 58,
            },
        },
    ],
}


def grid_for(model_id: str) -> list[dict]:
    return SIZE_GRIDS.get(model_id, [])


def size_row(model_id: str, size: str) -> dict | None:
    for row in grid_for(model_id):
        if row["size"] == size:
            return row
    return None
