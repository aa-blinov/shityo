"""Сопряжение деталей по подписанным швам.

Каждая деталь сообщает свои швы: подписанные отрезки контура, которые
сшиваются с другими деталями. По ним проверяется, что детали совпадают
по длине: окат рукава - с проймой переда и спинки.
"""

import pytest

from app.core.geometry import polyline_length
from app.drafts import build_draft
from app.drafts.catalog import catalog_item


def _edge_length(piece, label: str) -> float:
    for edge in piece.seam_edges:
        if edge["label"] == label:
            return polyline_length(edge["points"]) / 10.0
    raise AssertionError(f"деталь {piece.id} не объявила шов {label}")


def test_tee_declares_seams():
    item = catalog_item("tee")
    pieces = build_draft("tee", item["default_measurements"], {})
    front = next(p for p in pieces if p.id == "front")
    sleeve = next(p for p in pieces if p.id == "sleeve")
    assert {e["label"] for e in front.seam_edges} >= {"пройма", "плечо"}
    assert {e["label"] for e in sleeve.seam_edges} >= {"окат"}


def test_sleeve_cap_equals_both_armholes():
    """Окат рукава = пройма переда + пройма спинки + посадка 0,5 см.

    Это главная проверка сопряжения: если рукав не совпадёт с проймой,
    изделие не сойдётся при сборке. Трикотаж почти не садится, поэтому
    посадка оката футболки минимальная.
    """
    item = catalog_item("tee")
    pieces = build_draft("tee", item["default_measurements"], {})
    front = next(p for p in pieces if p.id == "front")
    back = next(p for p in pieces if p.id == "back")
    sleeve = next(p for p in pieces if p.id == "sleeve")

    cap = _edge_length(sleeve, "окат")
    armholes = _edge_length(front, "пройма") + _edge_length(back, "пройма")
    assert cap == pytest.approx(armholes + 0.5, abs=0.3)


def test_shirt_declares_seams():
    item = catalog_item("shirt")
    pieces = build_draft("shirt", item["default_measurements"], {})
    front = next(p for p in pieces if p.id == "front")
    sleeve = next(p for p in pieces if p.id == "sleeve")
    assert {e["label"] for e in front.seam_edges} >= {"пройма"}
    assert {e["label"] for e in sleeve.seam_edges} >= {"окат"}

    cap = _edge_length(sleeve, "окат")
    back = next(p for p in pieces if p.id == "back")
    armholes = _edge_length(front, "пройма") + _edge_length(back, "пройма")
    # Посадка оката рубашки 1,5 см.
    assert cap == pytest.approx(armholes + 1.5, abs=0.3)


def test_trousers_declares_seams():
    item = catalog_item("trousers")
    pieces = build_draft("trousers", item["default_measurements"], {})
    front = next(p for p in pieces if p.id == "front")
    assert {e["label"] for e in front.seam_edges} >= {"шаг", "бок"}
