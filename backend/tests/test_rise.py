"""Посадка брюк и юбки по высоте: низкая, средняя, на талии, высокая."""

import pytest

from app.core.sizes import SIZE_GRIDS, default_row
from app.core.validation import validate
from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.drafts.common import rise_top

RISES = ("low", "mid", "natural", "high")


def _top_width(pieces) -> float:
    """Ширина верхнего среза переда и спинки, см (без вытачек)."""
    total = 0.0
    for piece in pieces[:2]:
        top = min(p.y for p in piece.outline)
        xs = [p.x for p in piece.outline if abs(p.y - top) < 25]
        total += (max(xs) - min(xs)) / 10.0
    return total


@pytest.mark.parametrize("model", ["trousers", "skirt"])
def test_catalog_offers_rise(model):
    rise = catalog_item(model)["params"]["rise"]
    assert [o["value"] for o in rise["options"]] == list(RISES)
    assert rise["default"] == "natural"


def test_rise_moves_the_top_line_between_waist_and_hip():
    # На талии - обхват талии; ниже - ближе к бёдрам; выше - чуть шире талии.
    assert rise_top(70.0, 98.0, 20.0, "natural") == (70.0, 0.0)
    low_girth, low_drop = rise_top(70.0, 98.0, 20.0, "low")
    mid_girth, mid_drop = rise_top(70.0, 98.0, 20.0, "mid")
    high_girth, high_drop = rise_top(70.0, 98.0, 20.0, "high")
    assert low_drop > mid_drop > 0 > high_drop
    assert 98.0 > low_girth > mid_girth > 70.0
    assert high_girth >= 70.0


@pytest.mark.parametrize("model", ["trousers", "skirt"])
def test_lower_rise_makes_a_shorter_and_wider_top(model):
    m = default_row(model)["measurements"]
    heights = {}
    widths = {}
    for rise in RISES:
        pieces = build_draft(model, m, {"rise": rise})
        heights[rise] = pieces[0].bbox.height
        widths[rise] = _top_width(pieces)
    assert heights["low"] < heights["mid"] < heights["natural"] < heights["high"]
    assert widths["low"] > widths["mid"] > widths["natural"]


@pytest.mark.parametrize("model", ["trousers", "skirt"])
def test_every_row_builds_with_every_rise(model):
    for row in SIZE_GRIDS[model]:
        for rise in RISES:
            params = {"gender": row["gender"], "rise": rise}
            pieces = build_draft(model, row["measurements"], params)
            assert validate(pieces, row["measurements"], params)["errors"] == [], (
                row["size"],
                row["height"],
                rise,
            )
