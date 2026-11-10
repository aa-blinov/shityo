"""Паспорта основ: одна папка - одна основа.

Каждая основа лежит в ``backend/app/blocks/<id>/``:

- ``passport.toml`` - что это за основа: название, мерки, параметры фасона,
  детали, пары сшиваемых срезов, методика-источник и функция построения;
- ``reference.toml`` - типовые размеры чертежа по методике (ЕМКО СЭВ) для
  типовых фигур с допусками: по ним проверяется, что основа типовая.

Формулы остаются на Python (``draft = "модуль:функция"``): их проверяют
тесты и ревью. Паспорт читается при запуске; ошибка в паспорте - ошибка
запуска, а не тихо сломанная основа у ателье. Как добавить основу:
docs/BLOCKS.md и ``python scripts/blocks.py new <id>``.
"""

from __future__ import annotations

import importlib
import tomllib
from functools import cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parent
ID = r"^[a-z][a-z0-9_]{0,31}$"
EDGE = r"^[a-z][a-z0-9_]*\.[^.]+$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(_Strict):
    # emko - по методике ЕМКО СЭВ; project - упрощение проекта (бельё).
    kind: Literal["emko", "project"]
    method: str = Field(min_length=3)
    notes: str = ""


class Param(_Strict):
    type: Literal["select", "number"]
    default: Any = None
    options: str | list[dict] | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    unit: str | None = None

    @model_validator(mode="after")
    def _shape(self) -> Param:
        if self.type == "select" and self.options is None:
            raise ValueError("у выбора нет вариантов (options)")
        if self.type == "number":
            if self.min is None or self.max is None or self.min > self.max:
                raise ValueError("у числа нет границ min <= max")
            if isinstance(self.default, (int, float)) and not self.min <= self.default <= self.max:
                raise ValueError(f"значение по умолчанию {self.default} вне границ")
        return self


class Seam(_Strict):
    """Пара сшиваемых срезов: сторона a против стороны b.

    ``ease`` - допустимая посадка стороны a в мм (a - b от и до); сверх неё
    действует общий допуск 5 мм.
    """

    a: list[str] = Field(min_length=1)
    b: list[str] = Field(min_length=1)
    ease: tuple[float, float] = (0.0, 0.0)
    note: str = ""

    @field_validator("a", "b")
    @classmethod
    def _edges(cls, value: list[str]) -> list[str]:
        import re

        for edge in value:
            if not re.match(EDGE, edge):
                raise ValueError(f"срез «{edge}» должен быть вида деталь.подпись")
        return value


class Passport(_Strict):
    id: str = Field(pattern=ID)
    order: int = Field(ge=1)
    name: str = Field(min_length=2)
    category: str
    category_label: str
    description: str = Field(min_length=10)
    draft: str = Field(pattern=r"^[a-z_.]+:[a-z_][a-z0-9_]*$")
    pieces: list[str] = Field(min_length=1)
    genders: list[Literal["female", "male"]] = Field(min_length=1)
    measurements: list[str] = Field(min_length=1)
    source: Source
    params: dict[str, Param] = Field(default_factory=dict)
    seams: list[Seam] = Field(default_factory=list)

    @model_validator(mode="after")
    def _seams_use_pieces(self) -> Passport:
        for seam in self.seams:
            for edge in seam.a + seam.b:
                piece = edge.split(".", 1)[0]
                if piece not in self.pieces:
                    raise ValueError(f"пара швов ссылается на деталь {piece}, её нет в pieces")
        return self


class PassportError(RuntimeError):
    """Паспорт основы не прочитан: путь и причина - в тексте."""


@cache
def option_sets() -> dict[str, list[dict]]:
    with open(ROOT / "options.toml", "rb") as handle:
        return tomllib.load(handle)


def _read(path: Path) -> Passport:
    try:
        with open(path, "rb") as handle:
            raw = tomllib.load(handle)
        passport = Passport.model_validate(raw)
    except (tomllib.TOMLDecodeError, ValueError) as exc:
        raise PassportError(f"{path.relative_to(ROOT.parent.parent)}: {exc}") from exc
    if passport.id != path.parent.name:
        raise PassportError(
            f"{path}: id «{passport.id}» не совпадает с папкой «{path.parent.name}»"
        )
    sets = option_sets()
    for name, param in passport.params.items():
        if isinstance(param.options, str) and param.options not in sets:
            raise PassportError(
                f"{path}: параметр {name} ссылается на неизвестный список {param.options}"
            )
    return passport


@cache
def passports() -> dict[str, Passport]:
    """Все паспорта по порядку каталога."""
    found = [_read(path) for path in sorted(ROOT.glob("*/passport.toml"))]
    orders = [p.order for p in found]
    if len(set(orders)) != len(orders):
        raise PassportError("порядок (order) в паспортах повторяется")
    return {p.id: p for p in sorted(found, key=lambda p: p.order)}


def builder(passport: Passport):
    """Функция построения основы по строке ``модуль:функция``."""
    module, name = passport.draft.split(":")
    return getattr(importlib.import_module(module), name)


def catalog_entry(passport: Passport) -> dict:
    """Запись каталога для интерфейса: тот же контракт, что и раньше."""
    sets = option_sets()
    params: dict[str, dict] = {}
    for name, param in passport.params.items():
        spec = param.model_dump(exclude_none=True)
        if isinstance(param.options, str):
            spec["options"] = [dict(option) for option in sets[param.options]]
        # «measurement» - значение возьмётся из ходового размера сетки.
        if spec.get("default") == "measurement":
            spec["default"] = None
        params[name] = spec
    return {
        "id": passport.id,
        "name": passport.name,
        "category": passport.category,
        "category_label": passport.category_label,
        "genders": [],
        "pieces": list(passport.pieces),
        "description": passport.description,
        "measurements": list(passport.measurements),
        "params": params,
        "source": passport.source.model_dump(),
        "seams": [seam.model_dump() for seam in passport.seams],
    }


def reference_path(block_id: str) -> Path:
    return ROOT / block_id / "reference.toml"
