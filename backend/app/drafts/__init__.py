"""Параметрические конструкции одежды.

Каждая модель - чистая функция (мерки, параметры) -> список деталей.
Никакого ИИ и никакой недетерминированности: один и тот же вход всегда даёт
один и тот же чертёж.
"""

from .base import DraftError, Piece
from .tee import build_tee
from .trousers import build_trousers
from .skirt import build_skirt
from .shirt import build_shirt
from .dress import build_dress
from .vest import build_vest
from .coat import build_coat
from .knit import build_cardigan, build_hoodie, build_jumper, build_sweatshirt

BUILDERS = {
    "tee": build_tee,
    "trousers": build_trousers,
    "skirt": build_skirt,
    "shirt": build_shirt,
    "dress": build_dress,
    "vest": build_vest,
    "coat": build_coat,
    "sweatshirt": build_sweatshirt,
    "hoodie": build_hoodie,
    "jumper": build_jumper,
    "cardigan": build_cardigan,
}

from .catalog import CATALOG  # noqa: E402  (импорт после BUILDERS, чтобы избежать цикла)


def build_draft(model_id: str, measurements: dict, params: dict) -> list[Piece]:
    """Собрать лекала по идентификатору модели.

    Исключения DraftError несут текст на русском: API отдаёт его пользователю.
    """
    builder = BUILDERS.get(model_id)
    if builder is None:
        raise DraftError(f"Неизвестная модель: {model_id}")
    import math
    from .catalog import catalog_item

    measurements = measurements or {}
    params = params or {}
    item = catalog_item(model_id)
    for name, value in measurements.items():
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise DraftError(f"Мерка {name} должна быть конечным числом")
    for name, spec in item["params"].items():
        if name not in params:
            continue
        value = params[name]
        if spec["type"] == "number":
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
            ):
                raise DraftError(f"Параметр {name} должен быть конечным числом")
        elif value not in [option["value"] for option in spec["options"]]:
            raise DraftError(f"Недопустимое значение параметра {name}")
    overrides = params.get("overrides", {})
    if not isinstance(overrides, dict):
        raise DraftError("overrides должен быть объектом")
    for name, value in overrides.items():
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise DraftError(f"Переопределение {name} должно быть конечным числом")
    return builder(measurements, params)


__all__ = ["BUILDERS", "CATALOG", "DraftError", "Piece", "build_draft"]
