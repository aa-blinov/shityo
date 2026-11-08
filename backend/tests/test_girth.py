"""Проверка сходимости обхвата: детали должны давать ровно обхват с прибавкой.

Это главная проверка кроя. Ошибка в применении прибавки (например, если
прибавка берётся от половины обхвата вместо четверти) даёт изделие,
которое не сойдётся по фигуре, и заметить это можно только на примерке.

Каждая деталь сообщает, какую долю обхвата она закрывает (girth_cm);
сумма долей всех деталей изделия должна совпасть с обхватом плюс прибавка.
"""

import pytest

from app.drafts import build_draft
from app.drafts.catalog import catalog_item


def _total_girth(model: str, params: dict | None = None) -> float:
    item = catalog_item(model)
    pieces = build_draft(model, item["default_measurements"], params or {})
    return sum(piece.girth_cm for piece in pieces)


def _default(model: str, key: str) -> float:
    return catalog_item(model)["default_measurements"][key]


def test_tee_girth_closes():
    ease = catalog_item("tee")["params"]["ease_bust"]["default"]
    assert _total_girth("tee") == pytest.approx(_default("tee", "bust") + ease, abs=1.0)


def test_shirt_girth_closes():
    ease = catalog_item("shirt")["params"]["ease_bust"]["default"]
    assert _total_girth("shirt") == pytest.approx(_default("shirt", "bust") + ease, abs=1.0)


def test_trousers_girth_closes():
    """Талия брюк за вычетом вытачек = обхват талии с прибавкой."""
    ease = catalog_item("trousers")["params"]["ease_waist"]["default"]
    assert _total_girth("trousers") == pytest.approx(_default("trousers", "waist") + ease, abs=1.0)


@pytest.mark.parametrize("model", ["dress", "vest", "coat"])
def test_bodice_girth_closes_with_full_girth_ease(model):
    """Прибавка лифа задаётся к полному обхвату, как у футболки."""
    item = catalog_item(model)
    ease = item["params"]["ease_bust"]["default"]
    expected = 2 * item["default_measurements"]["half_bust"] + ease
    pieces = build_draft(model, item["default_measurements"], {})
    girth = sum(p.girth_cm for p in pieces if p.id in ("front", "back"))
    assert girth == pytest.approx(expected, abs=0.5)


def test_skirt_girth_closes():
    """Пояс юбки за вычетом вытачек = обхват талии с прибавкой."""
    item = catalog_item("skirt")
    m = item["default_measurements"]
    ease = item["params"]["ease_waist"]["default"]
    assert _total_girth("skirt") == pytest.approx(m["waist"] + ease, abs=0.5)


def test_skirt_darts_grow_with_hip_waist_difference():
    """Пояс не зависит от бёдер: разницу забирают вытачки и бок."""
    item = catalog_item("skirt")
    m = item["default_measurements"]

    def girth(hip: float) -> float:
        pieces = build_draft("skirt", {**m, "hip": hip}, {})
        return sum(piece.girth_cm for piece in pieces)

    assert girth(110.0) == pytest.approx(girth(90.0), abs=0.1)


def test_ease_changes_girth_by_exactly_the_ease():
    """Прибавка обязана целиком попадать в обхват, а не теряться."""
    item = catalog_item("tee")
    base = dict(item["default_measurements"])

    def girth(ease: float) -> float:
        pieces = build_draft("tee", base, {"ease_bust": ease})
        return sum(piece.girth_cm for piece in pieces)

    assert girth(12.0) - girth(2.0) == pytest.approx(10.0, abs=0.5)
    assert girth(2.0) == pytest.approx(base["bust"] + 2.0, abs=1.0)


def test_measurement_change_moves_girth_by_the_measurement():
    """Обхват по груди обязан следовать за меркой."""
    item = catalog_item("tee")
    base = dict(item["default_measurements"])
    wide = build_draft("tee", {**base, "bust": 106}, {"ease_bust": 4.0})
    narrow = build_draft("tee", {**base, "bust": 86}, {"ease_bust": 4.0})
    girth_wide = sum(p.girth_cm for p in wide)
    girth_narrow = sum(p.girth_cm for p in narrow)
    assert girth_wide - girth_narrow == pytest.approx(20.0, abs=1.0)
