"""Параметрические конструкции одежды.

Каждая модель - чистая функция (мерки, параметры) -> список деталей.
Никакого ИИ и никакой недетерминированности: один и тот же вход всегда даёт
один и тот же чертёж.
"""

from .base import DraftError, Piece
from .cutting import apply_cutting_rules
from .notches import add_control_notches
from ..blocks import builder, passports

# Функции построения указаны в паспортах основ (draft = "модуль:функция").
BUILDERS = {block_id: builder(passport) for block_id, passport in passports().items()}

from .catalog import CATALOG  # noqa: E402  (после BUILDERS, чтобы избежать цикла)


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
    return apply_cutting_rules(model_id, add_control_notches(builder(measurements, params)))


__all__ = ["BUILDERS", "CATALOG", "DraftError", "Piece", "build_draft"]
