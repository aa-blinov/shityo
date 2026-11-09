"""Каталог базовых моделей.

Описание модели - это контракт с фронтендом: список мерок, параметров
фасона и значения по умолчанию. Фронтенд строит форму из этих данных,
не зная о конкретной конструкции.
"""

from __future__ import annotations

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
}

# ease_factor умножает все прибавки модели: «Прилегающий» оставляет чуть
# больше половины базовой прибавки, «Оверсайз» - в 2,4 раза больше.
FIT_OPTIONS = [
    {"value": "slim", "label": "Прилегающий", "ease_factor": 0.55},
    {"value": "regular", "label": "Классический", "ease_factor": 1.0},
    {"value": "loose", "label": "Свободный", "ease_factor": 1.7},
    {"value": "oversize", "label": "Оверсайз", "ease_factor": 2.4},
]

# Посадка по высоте для брюк и юбки.
RISE_OPTIONS = [
    {"value": "low", "label": "Низкая"},
    {"value": "mid", "label": "Средняя"},
    {"value": "natural", "label": "На талии"},
    {"value": "high", "label": "Высокая"},
]

GENDER_OPTIONS = [
    {"value": "female", "label": "Женский"},
    {"value": "male", "label": "Мужской"},
]

NECKLINE_OPTIONS = [
    {"value": "crew", "label": "Круглая"},
    {"value": "v", "label": "V-образная"},
    {"value": "square", "label": "Квадратная"},
    {"value": "scoop", "label": "Лодочка"},
]

CATALOG: list[dict] = [
    {
        "id": "tee",
        "name": "Футболка",
        "category": "tops",
        "category_label": "Трикотаж",
        "genders": [],
        "pieces": ["front", "back", "sleeve"],
        "description": "Базовая футболка с коротким рукавом и круглой горловиной, раздельные перед и спинка.",
        "measurements": [
            "bust",
            "waist",
            "hip",
            "height",
            "shoulder_width",
            "shoulder_slope",
            "neck_to_waist",
            "waist_to_armpit",
            "waist_to_hip",
            "biceps",
            "back_length",
            "sleeve_length",
            "neck_circumference",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "neckline": {"type": "select", "options": NECKLINE_OPTIONS, "default": "crew"},
            "short_sleeve_length": {
                "type": "number",
                "default": 20,
                "min": 10,
                "max": 40,
                "step": 1,
                "unit": "cm",
            },
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 8,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_length": {
                "type": "number",
                "default": 2,
                "min": 0,
                "max": 20,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "longsleeve",
        "name": "Лонгслив",
        "category": "tops",
        "category_label": "Трикотаж",
        "genders": [],
        "pieces": ["front", "back", "sleeve"],
        "description": "Футболка с длинным рукавом по мерке руки: та же основа, круглая горловина.",
        "measurements": [
            "bust",
            "waist",
            "hip",
            "height",
            "shoulder_width",
            "shoulder_slope",
            "neck_to_waist",
            "waist_to_armpit",
            "waist_to_hip",
            "biceps",
            "back_length",
            "sleeve_length",
            "neck_circumference",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "neckline": {"type": "select", "options": NECKLINE_OPTIONS, "default": "crew"},
            "sleeve_length": {
                "type": "number",
                "default": 62,
                "min": 15,
                "max": 95,
                "step": 1,
                "unit": "cm",
            },
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 8,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_length": {
                "type": "number",
                "default": 2,
                "min": 0,
                "max": 20,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "shirt",
        "name": "Рубашка",
        "category": "tops",
        "category_label": "Рубашки",
        "genders": [],
        "pieces": ["front", "back", "sleeve", "collar"],
        "description": "Рубашка с вытачками по талии, отложным воротником и манжетами.",
        "measurements": [
            "bust",
            "waist",
            "hip",
            "height",
            "shoulder_width",
            "shoulder_slope",
            "neck_to_waist",
            "waist_to_armpit",
            "waist_to_hip",
            "biceps",
            "back_length",
            "sleeve_length",
            "neck_circumference",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "neckline": {"type": "select", "options": NECKLINE_OPTIONS, "default": "crew"},
            "sleeve_length": {
                "type": "number",
                "default": 62,
                "min": 15,
                "max": 95,
                "step": 1,
                "unit": "cm",
            },
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 12,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 10,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_length": {
                "type": "number",
                "default": 3,
                "min": 0,
                "max": 20,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "dress",
        "name": "Платье-футляр",
        "category": "dresses",
        "category_label": "Платья",
        "genders": [],
        "pieces": ["front", "back"],
        "description": "Базовое платье-футляр без рукавов с прилегающим силуэтом.",
        "measurements": [
            "half_bust",
            "half_waist",
            "half_hip",
            "half_neck",
            "back_waist_length",
            "front_waist_length",
            "shoulder_length",
            "bust_height",
            "bust_center",
            "armhole_depth",
            "garment_length",
            "waist_to_hip",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 8,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 3,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_hip": {
                "type": "number",
                "default": 4,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "vest",
        "name": "Жилет",
        "category": "tops",
        "category_label": "Верх",
        "genders": [],
        "pieces": ["front", "back"],
        "description": "Базовый жилет без рукавов с V-образным вырезом горловины.",
        "measurements": [
            "half_bust",
            "half_waist",
            "half_hip",
            "half_neck",
            "back_waist_length",
            "front_waist_length",
            "shoulder_length",
            "bust_height",
            "bust_center",
            "armhole_depth",
            "waist_to_hip",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -15,
                "max": 20,
                "step": 1,
                "unit": "cm",
            },
            "neck_drop": {
                "type": "number",
                "default": 18,
                "min": 8,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 6,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 4,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_hip": {
                "type": "number",
                "default": 4,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "coat",
        "name": "Пальто/плащ",
        "category": "outerwear",
        "category_label": "Верхняя одежда",
        "genders": [],
        "pieces": ["front", "back", "sleeve", "collar"],
        "description": "Простое пальто или плащ с длинным рукавом и отложным воротником.",
        "measurements": [
            "half_bust",
            "half_waist",
            "half_hip",
            "half_neck",
            "back_waist_length",
            "front_waist_length",
            "shoulder_length",
            "bust_height",
            "bust_center",
            "armhole_depth",
            "garment_length",
            "waist_to_hip",
            "sleeve_length",
            "biceps",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "sleeve_length": {
                "type": "number",
                "default": 64,
                "min": 15,
                "max": 95,
                "step": 1,
                "unit": "cm",
            },
            "ease_bust": {
                "type": "number",
                "default": 14,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 12,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_hip": {
                "type": "number",
                "default": 12,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "trousers",
        "name": "Брюки",
        "category": "bottoms",
        "category_label": "Брюки",
        "genders": [],
        "pieces": ["front", "back"],
        "description": "Классические брюки со сгибом, передней и задней штанинами.",
        "measurements": [
            "waist",
            "hip",
            "height",
            "crotch_depth",
            "inseam_length",
            "knee_length",
            "knee_circumference",
        ],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "rise": {"type": "select", "options": RISE_OPTIONS, "default": "natural"},
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 2,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_hip": {
                "type": "number",
                "default": 4,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
    {
        "id": "skirt",
        "name": "Юбка",
        "category": "bottoms",
        "category_label": "Юбки",
        "genders": [],
        "pieces": ["front", "back"],
        "description": "Юбка с расклешением подола, со сгибом посередине.",
        "measurements": ["waist", "hip", "height", "waist_to_hip", "skirt_length"],
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            "rise": {"type": "select", "options": RISE_OPTIONS, "default": "natural"},
            "flare_ratio": {
                "type": "number",
                "default": 0.12,
                "min": 0,
                "max": 0.5,
                "step": 0.01,
                "unit": "доля",
            },
            "length_delta": {
                "type": "number",
                "default": 0,
                "min": -30,
                "max": 30,
                "step": 1,
                "unit": "cm",
            },
            "ease_waist": {
                "type": "number",
                "default": 2,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
            "ease_hip": {
                "type": "number",
                "default": 3,
                "min": 0,
                "max": 40,
                "step": 0.5,
                "unit": "cm",
            },
        },
    },
]


def _number(default: float, low: float, high: float, step: float = 0.5) -> dict:
    return {
        "type": "number",
        "default": default,
        "min": low,
        "max": high,
        "step": step,
        "unit": "cm",
    }


def _knit(
    model_id: str,
    name: str,
    description: str,
    pieces: list[str],
    ease: float,
    band: float,
    cuff: float,
    extra: dict,
) -> dict:
    """Кофта на основе футболки: те же мерки, свои прибавки и резинки."""
    tee = CATALOG[0]
    return {
        "id": model_id,
        "name": name,
        "category": "tops",
        "category_label": "Трикотаж",
        "genders": [],
        "pieces": pieces,
        "description": description,
        "measurements": list(tee["measurements"]),
        "params": {
            "fit": {"type": "select", "options": FIT_OPTIONS, "default": "regular"},
            **extra,
            "sleeve_length": _number(62, 30, 95, 1),
            "length_delta": _number(0, -30, 30, 1),
            "ease_bust": _number(ease, 0, 40),
            "ease_length": _number(2, 0, 20),
            "band_width": _number(band, 3, 12),
            "cuff_width": _number(cuff, 3, 12),
        },
    }


POCKET_OPTIONS = [
    {"value": "kangaroo", "label": "Кенгуру"},
    {"value": "none", "label": "Без кармана"},
]

CATALOG += [
    _knit(
        "sweatshirt",
        "Свитшот",
        "Свитшот из футера: втачной рукав, притачные пояс и манжеты, бейка горловины.",
        ["front", "back", "sleeve", "waistband", "cuff", "neckband"],
        ease=10,
        band=6.5,
        cuff=7,
        extra={},
    ),
    _knit(
        "hoodie",
        "Худи",
        "Худи с капюшоном и карманом-кенгуру, притачные пояс и манжеты.",
        ["front", "back", "sleeve", "waistband", "cuff", "hood", "pocket"],
        ease=14,
        band=7,
        cuff=7,
        extra={
            "pocket": {"type": "select", "options": POCKET_OPTIONS, "default": "kangaroo"},
            "hood_ease": _number(4, 0, 12),
        },
    ),
    _knit(
        "jumper",
        "Джемпер",
        "Джемпер из тонкого трикотажа: ближе к фигуре, узкие резинки, круглый или V-вырез.",
        ["front", "back", "sleeve", "waistband", "cuff", "neckband"],
        ease=6,
        band=5,
        cuff=5,
        extra={
            "neckline": {
                "type": "select",
                "options": [o for o in NECKLINE_OPTIONS if o["value"] in ("crew", "v")],
                "default": "crew",
            }
        },
    ),
    _knit(
        "cardigan",
        "Кардиган",
        "Кардиган из тонкого трикотажа: две полочки, притачная планка борта, V-вырез.",
        ["front", "back", "sleeve", "waistband", "cuff", "buttonband"],
        ease=8,
        band=5,
        cuff=5,
        extra={
            "neckline": {
                "type": "select",
                "options": [o for o in NECKLINE_OPTIONS if o["value"] in ("crew", "v")],
                "default": "v",
            }
        },
    ),
]


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
