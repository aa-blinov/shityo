"""Разметка петель и пуговиц на полочках.

Правила швейной практики:

- пуговица стоит на линии середины переда; полочки кроятся парой, поэтому
  одна разметка служит обеим: на одной полочке прорубают петли, на другой
  по тем же точкам пришивают пуговицы;
- горизонтальная петля (пальто, жилет) начинается в 0,3 см от середины
  переда в сторону борта и идёт внутрь на диаметр пуговицы плюс 0,3 см -
  пуговица при натяжении упирается в конец петли на середине переда;
- вертикальная петля (рубашка, планка кардигана) лежит по середине планки,
  длина - диаметр пуговицы плюс 0,3 см;
- расстояние между пуговицами одинаковое; первая пуговица - у точки
  перегиба лацкана (пальто), у низа выреза (жилет) или под воротником
  (рубашка), последняя - над низом изделия.

Разметка - внутренние линии: «петля» (отрезок) и «пуговица» (крестик с
лучами по BUTTON_ARM). Контур детали не меняется; надсечки для пуговиц не
годятся - они рисуются засечкой на ближайшем срезе.
"""

from __future__ import annotations

from ..core.geometry import Point
from .base import Piece

PAST_CENTRE = 0.3
HOLE_EXTRA = 0.3
BUTTON_ARM = 0.4


def button_cross(x: float, y: float) -> list[dict]:
    """Крестик пуговицы в точке (x, y), см черчения; результат в мм."""
    arm = BUTTON_ARM * 10.0
    cx, cy = x * 10.0, y * 10.0
    return [
        {
            "type": "button",
            "points": [Point(cx - arm, cy), Point(cx + arm, cy)],
            "label": "пуговица",
        },
        {
            "type": "button",
            "points": [Point(cx, cy - arm), Point(cx, cy + arm)],
            "label": "пуговица",
        },
    ]


def _positions(top: float, bottom: float, count: int) -> list[float]:
    if count < 2:
        return [top]
    step = (bottom - top) / (count - 1)
    return [top + step * i for i in range(count)]


def mark_front(
    piece: Piece,
    *,
    top: float,
    bottom: float,
    count: int,
    diameter: float,
    vertical: bool = False,
) -> None:
    """Петли и пуговицы на полочке; координаты в сантиметрах черчения, x = 0 -
    середина переда, борт - в сторону x < 0."""
    hole = diameter + HOLE_EXTRA
    for y in _positions(top, bottom, count):
        if vertical:
            points = [Point(0.0, (y - hole / 2.0) * 10.0), Point(0.0, (y + hole / 2.0) * 10.0)]
        else:
            points = [
                Point(-PAST_CENTRE * 10.0, y * 10.0),
                Point((hole - PAST_CENTRE) * 10.0, y * 10.0),
            ]
        piece.internal_lines.append({"type": "buttonhole", "points": points, "label": "петля"})
        piece.internal_lines.extend(button_cross(0.0, y))


def mark_band(
    piece: Piece, *, start: float, end: float, count: int, diameter: float, finished: float
) -> None:
    """Вертикальные петли на планке борта (кардиган): вдоль планки, по середине
    её лицевой половины. start и end - расстояние от начала планки, см."""
    hole = diameter + HOLE_EXTRA
    y = finished / 2.0 * 10.0
    for x in _positions(start, end, count):
        piece.internal_lines.append(
            {
                "type": "buttonhole",
                "points": [Point((x - hole / 2.0) * 10.0, y), Point((x + hole / 2.0) * 10.0, y)],
                "label": "петля",
            }
        )
