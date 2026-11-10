"""Каталог базовых моделей.

Описание модели - это контракт с фронтендом: список мерок, параметров
фасона и значения по умолчанию. Фронтенд строит форму из этих данных,
не зная о конкретной конструкции. Источник - паспорта основ в
backend/app/blocks; здесь они связываются с размерными сетками.
"""

from __future__ import annotations

from ..blocks import catalog_entry, option_sets, passports
from ..core.sizes import MODEL_GENDERS, default_gender, default_row

MEASUREMENT_LABELS = {
    "bust": "Обхват груди",
    "waist": "Обхват талии",
    "hip": "Обхват бёдер",
    "height": "Рост",
    "shoulder_width": "Ширина плеча",
    "back_length": "Длина спинки",
    "sleeve_length": "Длина рукава",
    "neck_circumference": "Обхват шеи",
    "crotch_depth": "Глубина шага",
    "inseam_length": "Шаговый шов",
    "knee_length": "Длина до колена",
    "skirt_length": "Длина юбки",
    "half_neck": "Полуобхват шеи",
    "half_bust": "Полуобхват груди",
    "half_waist": "Полуобхват талии",
    "half_hip": "Полуобхват бёдер",
    "back_waist_length": "Длина спинки до талии",
    "front_waist_length": "Длина переда до талии",
    "back_width": "Ширина спины",
    "chest_width": "Ширина груди",
    "shoulder_length": "Длина плеча",
    "bust_height": "Высота груди",
    "bust_center": "Центр груди",
    "armhole_depth": "Глубина проймы",
    "garment_length": "Длина изделия",
    "underbust": "Обхват под грудью",
    "crotch_length": "Длина промежности",
}


# Варианты параметров - в backend/app/blocks/options.toml.
FIT_OPTIONS = option_sets()["fit"]
RISE_OPTIONS = option_sets()["rise"]
GENDER_OPTIONS = option_sets()["gender"]
NECKLINE_OPTIONS = option_sets()["neckline"]
POCKET_OPTIONS = option_sets()["pocket"]

# Каталог собирается из паспортов основ (backend/app/blocks/<id>/passport.toml).
CATALOG: list[dict] = [catalog_entry(passport) for passport in passports().values()]


def _finish(item: dict) -> None:
    """Связать модель с её размерной сеткой.

    Пол и мерки по умолчанию берутся из сетки, а не пишутся вручную:
    модель открывается ходовым размером своего основного пола. Параметр,
    совпадающий по имени с меркой (длина рукава), получает то же значение,
    иначе проект с мерками по умолчанию не прошёл бы проверку.
    """
    model = item["id"]
    item["genders"] = list(MODEL_GENDERS.get(model, []))
    row = default_row(model)
    if row is not None:
        item["default_measurements"] = dict(row["measurements"])
    if len(item["genders"]) > 1:
        item["params"] = {
            "gender": {
                "type": "select",
                "options": [o for o in GENDER_OPTIONS if o["value"] in item["genders"]],
                "default": default_gender(model),
            },
            **item["params"],
        }
    for key, spec in item["params"].items():
        if key in item.get("default_measurements", {}):
            spec["default"] = item["default_measurements"][key]


for _item in CATALOG:
    _finish(_item)


def catalog_item(model_id: str) -> dict | None:
    for item in CATALOG:
        if item["id"] == model_id:
            return item
    return None
