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


def test_tee_girth_closes():
    ease = catalog_item("tee")["params"]["ease_bust"]["default"]
    assert _total_girth("tee") == pytest.approx(96 + ease, abs=1.0)


def test_shirt_girth_closes():
    ease = catalog_item("shirt")["params"]["ease_bust"]["default"]
    assert _total_girth("shirt") == pytest.approx(100 + ease, abs=1.0)


def test_trousers_girth_closes():
    ease = catalog_item("trousers")["params"]["ease_waist"]["default"]
    assert _total_girth("trousers") == pytest.approx(82 + ease, abs=1.0)


def test_skirt_girth_closes():
    """Обхват юбки пояса = обхват талии с прибавкой.

    Прибавка юбки считается долей от разницы талии и бёдер (как в
    FreeSewing), поэтому она больше базовой прибавки - проверяем полную
    величину.
    """
    item = catalog_item("skirt")
    m = item["default_measurements"]
    ease = item["params"]["ease_waist"]["default"]
    difference = m["hip"] - m["waist"]
    expected = m["waist"] + ease + difference * 0.10
    assert _total_girth("skirt") == pytest.approx(expected, abs=1.0)


def test_skirt_ease_grows_with_hip_waist_difference():
    """Чем больше разница талии и бёдер, тем свободнее юбка пояса."""
    item = catalog_item("skirt")
    m = item["default_measurements"]

    def girth(hip: float) -> float:
        pieces = build_draft("skirt", {**m, "hip": hip}, {})
        return sum(piece.girth_cm for piece in pieces)

    assert girth(110.0) > girth(90.0)


def test_ease_changes_girth_by_exactly_the_ease():
    """Прибавка обязана целиком попадать в обхват, а не теряться."""
    item = catalog_item("tee")
    base = dict(item["default_measurements"])

    def girth(ease: float) -> float:
        pieces = build_draft("tee", base, {"ease_bust": ease})
        return sum(piece.girth_cm for piece in pieces)

    assert girth(12.0) - girth(2.0) == pytest.approx(10.0, abs=0.5)
    assert girth(2.0) == pytest.approx(96 + 2.0, abs=1.0)


def test_measurement_change_moves_girth_by_the_measurement():
    """Обхват по груди обязан следовать за меркой."""
    item = catalog_item("tee")
    base = dict(item["default_measurements"])
    wide = build_draft("tee", {**base, "bust": 106}, {"ease_bust": 4.0})
    narrow = build_draft("tee", {**base, "bust": 86}, {"ease_bust": 4.0})
    girth_wide = sum(p.girth_cm for p in wide)
    girth_narrow = sum(p.girth_cm for p in narrow)
    assert girth_wide - girth_narrow == pytest.approx(20.0, abs=1.0)
