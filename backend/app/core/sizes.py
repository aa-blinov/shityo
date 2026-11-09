"""Размерные сетки по типовым фигурам ГОСТ.

Женские размеры - ГОСТ 31396-2009 (типовая фигура ростом 164 см, вторая
полнотная группа: обхват бёдер больше обхвата груди на 6 см, таблица 3),
мужские - ГОСТ 31399-2009 (рост 176 см, основная полнотная группа ГОСТ
17521-72, табл. 3а: обхват талии меньше обхвата груди на 12 см). Размер равен половине обхвата груди:
44 - это обхват груди 88 см. Шаг ряда по груди, талии и бёдрам - 4 см
(ГОСТ 31396, п. 5.1). Остальные мерки (длины, ширины, глубина проймы)
стандарт по типовым фигурам не публикует отдельной таблицей; они взяты из
абсолютных величин ОСТ 17-326-81 (женщины, рост 164, вторая полнотная
группа: шея, талия, плечо, длины спины и переда, центр груди, глубина
проймы, обхват плеча, длина руки, высота сидения, талия-колено) и типовых
таблицы типовых фигур мужчин для роста 176 и ОСТ 17-325-86 (шаги); бёдра женщин - по ГОСТ 31396 (+6 к груди). Подробности и
источники - docs/SIZING.md.

Сетка не хранится таблицей вручную: строки получаются из одной типовой
фигуры и её межразмерных приращений. Так мерки внутри размера согласованы
друг с другом (талия, бёдра, длины растут вместе с грудью), а ряд нельзя
испортить опечаткой в одной ячейке. Приращения взяты из размерных
стандартов с округлением до 0,1 см.

Мерки - тело, без прибавок: прибавки на свободу и глубину проймы
добавляет конструкция. Длины изделий (длина футболки, платья, юбки) -
модельные, их меняет параметр «Изменение длины».

Смысл сетки такой же, как в FreeSewing (дизайн `models`): размер - это
набор мерок, а не масштаб готового лекала. Поэтому лекало для каждого
размера строится заново, и градация получается автоматически.
"""

from __future__ import annotations

# Типовая фигура и приращение на один размер (обхват груди +4 см).
# Значения - для первого размера ряда.
BODY: dict[str, dict] = {
    "female": {
        "sizes": [42, 44, 46, 48, 50, 52, 54],
        "height": 164,
        # Ростовые группы 152-182 с шагом 6 см (ГОСТ 31396, п. 5.1 и 5.3); 164 - по умолчанию.
        "heights": [152, 158, 164, 170, 176, 182],
        "base": {
            "bust": 84.0,
            "waist": 63.4,
            # 2-я полнотная группа: бёдра на 6 см больше груди (ГОСТ 31396, табл. 3).
            "hip": 90.0,
            "neck_circumference": 34.6,
            "shoulder_width": 37.4,
            "shoulder_length": 13.0,
            "shoulder_slope": 18.0,
            "back_waist_length": 40.0,
            "front_waist_length": 42.5,
            "bust_height": 25.3,
            "bust_center": 18.4,
            "armhole_depth": 17.3,
            "biceps": 26.1,
            "sleeve_length": 55.0,
            "waist_to_hip": 18.0,
            "crotch_depth": 26.3,
            "inseam_length": 75.0,
            "knee_length": 60.5,
            "knee_circumference": 35.5,
        },
        "step": {
            "bust": 4.0,
            "waist": 4.2,
            "hip": 4.0,
            "neck_circumference": 0.8,
            "shoulder_width": 0.6,
            "shoulder_length": 0.1,
            "back_waist_length": 0.1,
            "front_waist_length": 0.5,
            "bust_height": 0.6,
            "bust_center": 0.6,
            "armhole_depth": 0.2,
            "biceps": 1.4,
            "sleeve_length": 0.2,
            "waist_to_hip": 0.2,
            "crotch_depth": 0.4,
            "knee_circumference": 0.8,
        },
        # Модельные длины изделий.
        "garment": {
            "tee": 62.0,
            "longsleeve": 62.0,
            "shirt": 66.0,
            "sweatshirt": 62.0,
            "hoodie": 64.0,
            "jumper": 60.0,
            "cardigan": 62.0,
            "dress": 95.0,
            "coat": 100.0,
            "skirt": 58.0,
        },
    },
    "male": {
        "sizes": [44, 46, 48, 50, 52, 54, 56, 58],
        "height": 176,
        "heights": [158, 164, 170, 176, 182, 188, 194, 200],
        "base": {
            "bust": 88.0,
            # Основная полнота: талия на 12 см меньше груди - фигуры 176-88-76
            # ... 176-100-88 ... 176-120-108 в рамке ГОСТ 17521-72, табл. 3а
            # (абсолютные величины для них - ОСТ 17-325-86).
            # Обхваты и ширины - ОСТ 17-325-86, 2-я полнота (рост 170, от роста
            # не зависят); вертикали пересчитаны на рост 176 (x 176/170).
            "waist": 76.0,
            "hip": 94.8,
            "neck_circumference": 38.6,
            "shoulder_width": 44.0,
            "shoulder_length": 15.2,
            "shoulder_slope": 16.0,
            "back_waist_length": 45.1,
            "front_waist_length": 46.6,
            "bust_height": 24.8,
            "bust_center": 20.7,
            "armhole_depth": 20.8,
            "biceps": 28.3,
            "sleeve_length": 58.6,
            "waist_to_hip": 19.5,
            "crotch_depth": 25.6,
            "inseam_length": 81.6,
            "knee_length": 60.0,
            "knee_circumference": 37.0,
        },
        "step": {
            "bust": 4.0,
            "waist": 4.0,
            "hip": 3.0,
            "neck_circumference": 0.8,
            "shoulder_width": 1.0,
            "shoulder_length": 0.1,
            "back_waist_length": 0.1,
            "front_waist_length": 0.3,
            "bust_height": 0.75,
            "bust_center": 0.7,
            "armhole_depth": 0.2,
            "biceps": 1.3,
            "sleeve_length": 0.3,
            # Полная фигура ниже в шагу: шаговый шов убывает (ОСТ 17-325-86).
            "inseam_length": -0.5,
            "waist_to_hip": 0.2,
            "crotch_depth": 0.2,
            "knee_circumference": 0.8,
        },
        "garment": {
            "tee": 72.0,
            "longsleeve": 72.0,
            "shirt": 76.0,
            "sweatshirt": 70.0,
            "hoodie": 72.0,
            "jumper": 68.0,
            "cardigan": 70.0,
            "coat": 104.0,
        },
    },
}

# Какие мерки нужны модели и как они получаются из тела.
MODEL_KEYS: dict[str, list[str]] = {
    "tee": [
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
    "trousers": [
        "waist",
        "hip",
        "height",
        "crotch_depth",
        "inseam_length",
        "knee_length",
        "knee_circumference",
    ],
    "skirt": ["waist", "hip", "height", "waist_to_hip", "skirt_length"],
    "dress": [
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
}
MODEL_KEYS["shirt"] = MODEL_KEYS["tee"]
for _knit in ("longsleeve", "sweatshirt", "hoodie", "jumper", "cardigan"):
    MODEL_KEYS[_knit] = MODEL_KEYS["tee"]
MODEL_KEYS["vest"] = [k for k in MODEL_KEYS["dress"] if k != "garment_length"]
MODEL_KEYS["coat"] = MODEL_KEYS["dress"] + ["sleeve_length", "biceps"]

# Пол, для которого у модели есть сетка. Первый - по умолчанию.
MODEL_GENDERS: dict[str, list[str]] = {
    "tee": ["male", "female"],
    "longsleeve": ["male", "female"],
    "sweatshirt": ["male", "female"],
    "hoodie": ["male", "female"],
    "jumper": ["female", "male"],
    "cardigan": ["female", "male"],
    "shirt": ["male", "female"],
    "trousers": ["male", "female"],
    "vest": ["female", "male"],
    "coat": ["female", "male"],
    "dress": ["female"],
    "skirt": ["female"],
}


def _r(value: float) -> float:
    return round(value * 10) / 10


# Вертикальные мерки: меняются с ростом. Обхваты и ширины - нет: размер
# по ГОСТ задаётся обхватами, рост - отдельным признаком типовой фигуры.
VERTICAL = {
    "back_waist_length",
    "front_waist_length",
    "bust_height",
    "armhole_depth",
    "sleeve_length",
    "waist_to_hip",
    "crotch_depth",
    "inseam_length",
    "knee_length",
}


def body(gender: str, size: int, height: int | None = None) -> dict[str, float]:
    """Мерки тела типовой фигуры заданного пола, размера и роста.

    Вертикальные мерки пересчитываются пропорционально росту относительно
    основного роста ряда; при основном росте значения не меняются.
    """
    spec = BODY[gender]
    k = spec["sizes"].index(size)
    tall = (height or spec["height"]) / spec["height"]
    values = {}
    for key, base in spec["base"].items():
        value = base + spec["step"].get(key, 0.0) * k
        values[key] = _r(value * tall if key in VERTICAL else value)
    values["height"] = float(height or spec["height"])
    return values


def _model_values(
    model: str, gender: str, size: int, height: int | None = None
) -> dict[str, float]:
    b = body(gender, size, height)
    k = BODY[gender]["sizes"].index(size)
    tall = (height or BODY[gender]["height"]) / BODY[gender]["height"]
    garment = BODY[gender]["garment"]
    derived = {
        **b,
        "neck_to_waist": b["back_waist_length"],
        # От талии до подмышки: длина спинки до талии без глубины проймы.
        "waist_to_armpit": _r(b["back_waist_length"] - b["armhole_depth"]),
        "half_bust": _r(b["bust"] / 2),
        "half_waist": _r(b["waist"] / 2),
        "half_hip": _r(b["hip"] / 2),
        "half_neck": _r(b["neck_circumference"] / 2),
        # Длины изделий: медленно растут с размером и пропорционально росту.
        "back_length": _r((garment.get(model, garment.get("tee", 70.0)) + 0.3 * k) * tall),
        "garment_length": _r((garment.get(model, 95.0) + 0.3 * k) * tall),
        "skirt_length": _r(garment.get("skirt", 58.0) * tall),
    }
    return {key: derived[key] for key in MODEL_KEYS[model]}


def _label(value: float) -> float | int:
    return int(value) if float(value).is_integer() else value


def designation(gender: str, size: int, height: int) -> str:
    """Обозначение типовой фигуры по ГОСТ: рост - обхват груди - обхват
    бёдер у женщин (31396) и рост - обхват груди - обхват талии у мужчин
    (31399)."""
    b = body(gender, size, height)
    third = b["hip"] if gender == "female" else b["waist"]
    return f"{height}-{_label(b['bust'])}-{_label(third)}"


SIZE_GRIDS: dict[str, list[dict]] = {
    model: [
        {
            "size": str(size),
            "gender": gender,
            "height": height,
            "designation": designation(gender, size, height),
            "measurements": {
                key: _label(value)
                for key, value in _model_values(model, gender, size, height).items()
            },
        }
        for gender in genders
        for height in BODY[gender]["heights"]
        for size in BODY[gender]["sizes"]
    ]
    for model, genders in MODEL_GENDERS.items()
}


def default_gender(model_id: str) -> str | None:
    genders = MODEL_GENDERS.get(model_id)
    return genders[0] if genders else None


def base_height(gender: str) -> int:
    return int(BODY[gender]["height"])


def grid_for(
    model_id: str, gender: str | None = None, height: int | None = None, all_heights: bool = False
) -> list[dict]:
    """Строки сетки модели для пола и роста.

    По умолчанию - основной пол модели и основной рост ряда (164 у женщин,
    176 у мужчин); all_heights отдаёт все ростовые группы.
    """
    wanted = gender or default_gender(model_id)
    if wanted is None:
        return []
    rows = [row for row in SIZE_GRIDS.get(model_id, []) if row["gender"] == wanted]
    if all_heights:
        return rows
    tall = height or base_height(wanted)
    return [row for row in rows if row["height"] == tall]


def size_row(
    model_id: str, size: str, gender: str | None = None, height: int | None = None
) -> dict | None:
    for row in grid_for(model_id, gender, height):
        if row["size"] == size:
            return row
    return None


# Размер, с которого открывается модель: самый ходовой в ряду.
DEFAULT_SIZE = {"female": "46", "male": "50"}


def default_row(model_id: str, gender: str | None = None) -> dict | None:
    """Мерки по умолчанию для модели и пола: ходовой размер ряда."""
    wanted = gender or default_gender(model_id)
    if wanted is None:
        return None
    return size_row(model_id, DEFAULT_SIZE[wanted], wanted)
