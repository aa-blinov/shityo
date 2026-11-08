"""Правила кроя на печати: половина со сгибом и припуски по срезам."""

import pytest
from fastapi.testclient import TestClient

from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.export.cutplan import allowance_note, cuts_on_fold
from app.export.layout import build_geometry
from app.main import app

client = TestClient(app)


def pieces(model: str) -> dict:
    built = build_draft(model, catalog_item(model)["default_measurements"], {})
    return {p.id: p for p in built}


@pytest.mark.parametrize("model", ["tee", "dress", "skirt", "sweatshirt", "hoodie", "jumper"])
def test_panels_without_centre_seam_print_as_half_on_fold(model):
    for piece_id in ("front", "back"):
        piece = pieces(model)[piece_id]
        assert cuts_on_fold(piece)
        geometry = build_geometry(piece, None)
        # Печатается половина: от сгиба (x = 0) к боку.
        assert min(x for x, _ in geometry.outline) == pytest.approx(0, abs=0.01)
        assert "1 деталь со сгибом" in geometry.label
        # По сгибу не режут: линия реза кончается на нём, без припуска.
        assert min(x for x, _ in geometry.cut) == pytest.approx(0, abs=0.01)


def test_hem_and_seam_allowances_follow_the_garment():
    front = pieces("tee")["front"]
    geometry = build_geometry(front, None)
    bottom = max(y for _, y in geometry.outline)
    # Низ футболки - 2 см на подгибку, бок - трикотажный шов 0,7 см.
    assert max(y for _, y in geometry.cut) - bottom == pytest.approx(20, abs=0.5)
    assert max(x for x, _ in geometry.cut) - max(x for x, _ in geometry.outline) == pytest.approx(
        7, abs=1.5
    )
    trousers = build_geometry(pieces("trousers")["front"], None)
    assert max(y for _, y in trousers.cut) - max(y for _, y in trousers.outline) == pytest.approx(
        50, abs=0.5
    )
    skirt = build_geometry(pieces("skirt")["front"], None)
    assert max(y for _, y in skirt.cut) - max(y for _, y in skirt.outline) == pytest.approx(
        40, abs=1.0
    )


def test_knit_tops_hem_into_rib_with_a_plain_seam():
    front = build_geometry(pieces("sweatshirt")["front"], None)
    assert max(y for _, y in front.cut) - max(y for _, y in front.outline) == pytest.approx(
        7, abs=0.5
    )


def test_without_allowances_cut_line_is_the_seam_line():
    geometry = build_geometry(pieces("tee")["front"], 0.0)
    assert geometry.cut == geometry.outline
    assert allowance_note(geometry.plan).startswith("Без припусков")


def test_shirt_front_is_a_pair_of_halves_with_button_extension():
    front = pieces("shirt")["front"]
    assert front.cut == 2 and front.mirrored
    assert not cuts_on_fold(front)
    # Борт 1,5 см за серединой переда.
    assert min(p.x for p in front.outline) == pytest.approx(-15, abs=0.01)
    assert "2 детали зеркально" in build_geometry(front, None).label
    assert "1 деталь со сгибом" in build_geometry(pieces("shirt")["back"], None).label


def test_collar_has_no_allowance_on_its_fold():
    collar = build_geometry(pieces("shirt")["collar"], None)
    assert min(x for x, _ in collar.cut) == pytest.approx(0, abs=0.01)
    assert "2 детали со сгибом" in collar.label


def test_sleeve_prints_whole():
    sleeve = pieces("tee")["sleeve"]
    assert not cuts_on_fold(sleeve)
    geometry = build_geometry(sleeve, None)
    assert min(x for x, _ in geometry.outline) < 0 < max(x for x, _ in geometry.outline)
    assert "2 детали" in geometry.label


def test_export_and_print_plan_accept_allowances_flag():
    assert client.get("/api/export/tee.pdf", params={"allowances": "false"}).status_code == 200
    assert client.get("/api/export/tee.dxf", params={"allowances": "false"}).status_code == 200
    plan = client.post("/api/print-plan", json={"model": "tee", "paper": {"allowances": False}})
    assert plan.status_code == 200
