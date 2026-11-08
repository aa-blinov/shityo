"""Правила кроя: припуски по изделиям и по срезам.

Конструкция строит линию шва (нетто). Линию реза (брутто) получает экспорт,
откладывая от каждого среза свой припуск:

- соединительные швы: 1 см у тканей (как у Lekala и в промышленности),
  0,7 см у трикотажа - шов на оверлоке;
- низ изделия и рукава - на подгибку, по изделию: футболка 2 см, платье и
  рукав 2,5 см, юбка 4 см, брюки и пальто 5 см (инструкции Lekala,
  Patterneasy). У трикотажных кофт низ и рукав пришиваются к поясу и
  манжете - там обычный шов;
- срез по сгибу ткани припуска не получает никогда (это решает экспорт:
  край на линии сгиба).

Значения - типовые для домашнего и ателье пошива; ширина шва общая для
детали (Piece.seam_allowance), низ и отдельные срезы - Piece.hem_allowance
и Piece.edge_allowances.
"""

from __future__ import annotations

from .base import Piece

# Изделия из трикотажа: швы на оверлоке.
KNIT = {"tee", "sweatshirt", "hoodie", "jumper", "cardigan"}

# Припуск на подгибку низа, мм: деталь -> припуск. Детали, которых нет в
# таблице, низа на подгибку не имеют (пояс, манжета, воротник).
HEMS: dict[str, dict[str, float]] = {
    "tee": {"front": 20.0, "back": 20.0, "sleeve": 20.0},
    "shirt": {"front": 15.0, "back": 15.0, "sleeve": 25.0},
    "dress": {"front": 25.0, "back": 25.0, "sleeve": 25.0},
    "vest": {"front": 30.0, "back": 30.0},
    "coat": {"front": 50.0, "back": 50.0, "sleeve": 40.0},
    "skirt": {"front": 40.0, "back": 40.0},
    "trousers": {"front": 50.0, "back": 50.0},
    # Трикотажные кофты: низ и рукав пришиваются к поясу и манжете - шов.
    "sweatshirt": {},
    "hoodie": {},
    "jumper": {},
    "cardigan": {},
}

# Срезы со своим припуском (по подписи среза в Piece.seam_edges).
# Горловина футболки без бейки подгибается или обтачивается: 1 см.
EDGES: dict[str, dict[str, float]] = {
    "tee": {"горловина": 10.0},
}


def apply_cutting_rules(model_id: str, pieces: list[Piece]) -> list[Piece]:
    """Проставить деталям изделия припуски на швы и низ."""
    seam = 7.0 if model_id in KNIT else 10.0
    hems = HEMS.get(model_id, {})
    edges = EDGES.get(model_id, {})
    for piece in pieces:
        piece.seam_allowance = seam
        piece.hem_allowance = hems.get(piece.id)
        piece.edge_allowances = dict(edges)
    return pieces
