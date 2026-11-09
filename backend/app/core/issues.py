"""Коды замечаний валидатора и их тексты.

Валидатор сообщает о проблемах не текстом, а кодом и параметрами:
``{"code": "seam.allowance.too_small", "params": {...}}``. Фронтенд переводит
код на язык интерфейса, а ``text`` - русский текст по умолчанию, который
получают потребители API без словаря.

Тексты собраны здесь, а не разбросаны по проверкам: так их видно целиком
и их можно сверить с переводами на фронтенде.
"""

from __future__ import annotations

from typing import Any

# Названия мерок: идентификатор -> название. Тот же набор, что в
# core/measurements.py, плюс те, что есть только в каталоге.
MEASURE_LABELS: dict[str, str] = {
    "bust": "Обхват груди",
    "waist": "Обхват талии",
    "hip": "Обхват бёдер",
    "height": "Рост",
    "shoulder_width": "Ширина плеча",
    "shoulder_slope": "Наклон плеча",
    "back_length": "Длина спинки",
    "front_length": "Длина переда",
    "sleeve_length": "Длина рукава",
    "biceps": "Обхват бицепса",
    "neck_circumference": "Обхват шеи",
    "neck_to_waist": "Длина от шеи до талии",
    "waist_to_armpit": "Длина от талии до подмышки",
    "waist_to_hip": "Длина от талии до бёдер",
    "crotch_depth": "Глубина шагового шва",
    "inseam_length": "Шаговой шов",
    "knee_length": "Длина до колена",
    "knee_circumference": "Обхват колена",
    "skirt_length": "Длина юбки",
}

# Названия параметров фасона.
PARAM_LABELS: dict[str, str] = {
    "fit": "Посадка",
    "neckline": "Горловина",
    "sleeve_length": "Длина рукава",
    "short_sleeve_length": "Длина короткого рукава",
    "length_delta": "Изменение длины",
    "ease_bust": "Прибавка по груди",
    "ease_waist": "Прибавка по талии",
    "ease_hip": "Прибавка по бёдрам",
    "ease_length": "Прибавка по длине",
    "flare": "Расклёшение",
    "flare_ratio": "Расклешение (доля от длины)",
}

# Названия деталей лекал.
PIECE_LABELS: dict[str, str] = {
    "front": "Перед",
    "back": "Спинка",
    "sleeve": "Рукав",
    "collar": "Воротник",
    "skirt": "Юбка",
    "pocket": "Карман",
    "placket": "Планка",
}

# Тексты по умолчанию. {имя} подставляется из params.
MESSAGES: dict[str, str] = {
    "draft.no_pieces": "лекало не содержит ни одной детали",
    "draft.unknown_model": "Неизвестная модель: {model}",
    "draft.missing_measurements": "Не хватает мерок: {measurements}",
    "draft.no_size_grid": "Нет размерной сетки для модели: {model}",
    "draft.build_failed": "Не удалось построить лекало: {reason}",
    "contour.too_few_points": "{piece}: контур из {count} точек, построить деталь нельзя",
    "contour.not_closed": (
        "{piece}: контур не замкнут, разрыв между первой и последней точкой {gap} мм"
    ),
    "contour.self_intersecting": "{piece}: контур самопересекается",
    "contour.not_simple": "{piece}: контур не образует простой многоугольник",
    "contour.zero_area": "{piece}: площадь детали равна нулю",
    "seam.allowance.missing": "{piece}: не задан припуск на швы",
    "seam.allowance.not_number": "{piece}: припуск на швы задан не числом: {value}",
    "seam.allowance.too_small": ("{piece}: припуск на швы {value} мм должен быть больше нуля"),
    "seam.allowance.too_large": ("{piece}: припуск на швы {value} мм больше допустимых {max} мм"),
    "seam.length_mismatch": (
        "{piece_a}/{edge_a} и {piece_b}/{edge_b} не совпадают по длине: "
        "{length_a} мм против {length_b} мм"
    ),
    "grainline.missing": "{piece}: не задана доля (линия зерна)",
    "grainline.degenerate": "{piece}: доля вырождена в точку",
    "grainline.deviation": ("{piece}: доля отклонена от длинной стороны детали на {angle}°"),
    "measure.not_number": "мерка «{name}» задана не числом: {value}",
    "measure.out_of_range": ("мерка «{name}» = {value} см вне диапазона {low}..{high} см"),
    "measure.not_positive": "мерка «{name}» = {value} см должна быть больше нуля",
    "param.not_number": "параметр «{name}» задан не числом: {value}",
    "param.out_of_range": ("параметр «{name}» = {value} см вне диапазона {low}..{high} см"),
}


def issue(code: str, **params: Any) -> dict:
    """Замечание с кодом, параметрами и текстом по умолчанию.

    В тексте идентификаторы заменяются человеческими названиями: в
    сообщении должно быть «мерка «Рост»», а не «мерка height». Параметры
    при этом сохраняют идентификаторы - по ним фронтенд строит перевод.
    """
    template = MESSAGES.get(code, code)
    text = template
    for name, value in params.items():
        text = text.replace("{" + name + "}", str(label_for(name, value)))
    return {"code": code, "params": params, "text": text}


def label_for(param: str, value: Any) -> str:
    """Название мерки, параметра или детали вместо её идентификатора."""
    if not isinstance(value, str):
        return str(value)
    if param in ("name",):
        return MEASURE_LABELS.get(value) or PARAM_LABELS.get(value) or value
    if param in ("piece", "piece_a", "piece_b"):
        return PIECE_LABELS.get(value, value)
    return value


def render(issues: list[dict]) -> list[str]:
    """Тексты замечаний - для потребителей, которым нужен только текст."""
    return [str(item["text"]) for item in issues]
