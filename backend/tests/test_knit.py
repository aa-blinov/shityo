"""Трикотажные кофты: свитшот, худи, джемпер."""

import pytest

from app.core.geometry import polyline_length
from app.core.sizes import default_row
from app.drafts import build_draft
from app.drafts.knit import CUFF_RATIO, NECKBAND_RATIO, RIB_RATIO


def _pieces(model: str, gender: str = "male", **params):
    row = default_row(model, gender)
    return {p.id: p for p in build_draft(model, row["measurements"], {"gender": gender, **params})}


def _edge(piece, label: str) -> float:
    return (
        polyline_length(next(e["points"] for e in piece.seam_edges if e["label"] == label)) / 10.0
    )


def _neckline(pieces) -> float:
    return 2.0 * (_edge(pieces["front"], "горловина") + _edge(pieces["back"], "горловина"))


@pytest.mark.parametrize(
    "model, extra",
    [
        ("sweatshirt", {"waistband", "cuff", "neckband"}),
        ("hoodie", {"waistband", "cuff", "hood", "pocket"}),
        ("jumper", {"waistband", "cuff", "neckband"}),
    ],
)
def test_knit_pieces(model, extra):
    assert set(_pieces(model)) == {"front", "back", "sleeve"} | extra


def test_waistband_is_shorter_than_the_hem_by_the_rib_ratio():
    pieces = _pieces("sweatshirt")
    hem = 4.0 * pieces["front"].notches[1]["x"] / 10.0
    assert pieces["waistband"].bbox.width / 10.0 == pytest.approx(hem * RIB_RATIO, abs=0.1)


def test_cuff_gathers_the_sleeve_hem():
    pieces = _pieces("sweatshirt")
    sleeve_hem = 2.0 * pieces["sleeve"].notches[1]["x"] / 10.0
    assert pieces["cuff"].bbox.width / 10.0 >= sleeve_hem * CUFF_RATIO - 0.1
    assert pieces["cuff"].bbox.width / 10.0 < sleeve_hem


def test_neckband_follows_the_neckline():
    for model in ("sweatshirt", "jumper"):
        pieces = _pieces(model)
        assert pieces["neckband"].bbox.width / 10.0 == pytest.approx(
            _neckline(pieces) * NECKBAND_RATIO, abs=0.1
        )


@pytest.mark.parametrize("gender", ["male", "female"])
def test_hood_joins_the_whole_neckline(gender):
    """Два половинки капюшона вместе притачиваются по всей горловине."""
    pieces = _pieces("hoodie", gender)
    assert 2.0 * _edge(pieces["hood"], "горловина") == pytest.approx(_neckline(pieces), abs=0.3)
    # Капюшон выше полудуги головы на прибавку: голова в нём свободна.
    assert pieces["hood"].bbox.height / 10.0 > 32.0


def test_hood_ease_makes_the_hood_taller():
    low = _pieces("hoodie", hood_ease=0)["hood"].bbox.height
    high = _pieces("hoodie", hood_ease=8)["hood"].bbox.height
    assert high - low == pytest.approx(80.0, abs=1.0)


def test_pocket_is_optional_and_marked_on_the_front():
    with_pocket = _pieces("hoodie")
    without = _pieces("hoodie", pocket="none")
    assert "pocket" in with_pocket and "pocket" not in without
    assert any(line["label"] == "карман" for line in with_pocket["front"].internal_lines)


def test_oversize_drops_the_shoulder_and_shortens_the_sleeve():
    """Заниженное плечо: плечевой шов длиннее, рукав на столько же короче."""
    regular = _pieces("hoodie")
    oversize = _pieces("hoodie", fit="oversize")

    def tip(pieces) -> float:
        shoulder = next(e for e in pieces["front"].seam_edges if e["label"] == "плечо")
        return shoulder["points"][-1].x

    assert tip(oversize) - tip(regular) > 30.0
    assert oversize["sleeve"].bbox.height < regular["sleeve"].bbox.height


def test_ease_order_jumper_sweatshirt_hoodie():
    """Джемпер ближе к фигуре, худи свободнее свитшота."""
    girth = {
        m: sum(p.girth_cm for p in _pieces(m).values()) for m in ("jumper", "sweatshirt", "hoodie")
    }
    assert girth["jumper"] < girth["sweatshirt"] < girth["hoodie"]


def test_cardigan_has_two_fronts_and_a_button_band():
    """Кардиган: полочки кроятся парой, планка обходит борта и горловину."""
    pieces = _pieces("cardigan", "female")
    front, back = pieces["front"], pieces["back"]
    assert front.cut == 2 and front.mirrored
    assert front.bbox.width == pytest.approx(back.bbox.width / 2.0, abs=1.0)
    centre = next(e for e in front.seam_edges if e["label"] == "горловина")["points"][0]
    edge = front.bbox.height / 10.0 - centre.y / 10.0
    opening = 2.0 * (edge + _edge(front, "горловина")) + 2.0 * _edge(back, "горловина")
    assert pieces["buttonband"].bbox.width / 10.0 == pytest.approx(opening * 0.95, abs=1.0)
