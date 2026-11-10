"""Бельё, застёжки, контрольные надсечки и лацканы пальто."""

from __future__ import annotations

import pytest

from app.core.geometry import polyline_length
from app.core.validation import validate
from app.drafts import build_draft
from app.drafts.catalog import catalog_item


def _build(model: str, **params):
    item = catalog_item(model)
    defaults = {k: v["default"] for k, v in item["params"].items()}
    pieces = build_draft(model, item["default_measurements"], {**defaults, **params})
    return {p.id: p for p in pieces}, item


def _edge(piece, label: str) -> float:
    edge = next(e for e in piece.seam_edges if e["label"] == label)
    return polyline_length(edge["points"])


@pytest.mark.parametrize("model", ["briefs", "boxers", "bralette", "slip"])
def test_lingerie_builds_and_validates(model):
    pieces, item = _build(model)
    result = validate(list(pieces.values()), item["default_measurements"], {})
    assert result["errors"] == []


def test_briefs_gusset_matches_front_and_back():
    pieces, _ = _build("briefs")
    assert _edge(pieces["front"], "бок") == pytest.approx(_edge(pieces["back"], "бок"), abs=0.5)
    assert _edge(pieces["gusset"], "перед") == pytest.approx(
        _edge(pieces["front"], "ластовица"), abs=0.5
    )
    assert _edge(pieces["gusset"], "спинка") == pytest.approx(
        _edge(pieces["back"], "ластовица"), abs=0.5
    )
    # Трикотаж меньше тела: верх трусов уже обхвата по линии верха.
    assert pieces["front"].girth_cm + pieces["back"].girth_cm < 98


def test_boxers_inseams_and_sides_match():
    pieces, _ = _build("boxers")
    assert _edge(pieces["front"], "шаг") == pytest.approx(_edge(pieces["back"], "шаг"), abs=3.0)
    assert _edge(pieces["front"], "бок") == pytest.approx(_edge(pieces["back"], "бок"), abs=0.5)


def test_bralette_cup_halves_are_sewn_to_each_other():
    pieces, _ = _build("bralette")
    lower, upper = pieces["cup_lower"], pieces["cup_upper"]
    assert _edge(lower, "шов чашки") == pytest.approx(_edge(upper, "шов чашки"), abs=0.5)
    # Низ чашки длиннее шва чашки: это и даёт объём.
    assert _edge(lower, "низ чашки") > _edge(lower, "шов чашки") + 30


def test_bigger_cup_for_bigger_difference():
    small, _ = _build("bralette")
    item = catalog_item("bralette")
    bigger = build_draft("bralette", {**item["default_measurements"], "bust": 100}, {})
    cup = next(p for p in bigger if p.id == "cup_lower")
    assert cup.bbox.height > small["cup_lower"].bbox.height


def test_skirt_and_trousers_get_waistbands_and_zip_marks():
    skirt, _ = _build("skirt")
    assert "waistband" in skirt
    assert any(n["label"] == "низ молнии" for n in skirt["front"].notches)
    band = skirt["waistband"]
    assert band.bbox.width / 10 == pytest.approx(
        skirt["front"].girth_cm + skirt["back"].girth_cm + 3.0, abs=0.1
    )
    trousers, _ = _build("trousers", gender="male")
    assert {"waistband", "fly"} <= set(trousers)
    female, _ = _build("trousers", gender="female")
    assert "fly" not in female


def test_dress_has_side_zip_marks():
    dress, _ = _build("dress")
    for piece in ("front", "back"):
        labels = [n["label"] for n in dress[piece].notches]
        assert "молния" in labels and "низ молнии" in labels


@pytest.mark.parametrize("model", ["tee", "shirt", "coat", "hoodie"])
def test_sleeve_control_notches(model):
    pieces, _ = _build(model)
    front = [n for n in pieces["front"].notches if n["label"] == "пройма перед"]
    back = [n for n in pieces["back"].notches if n["label"] == "пройма спинка"]
    cap = [n["label"] for n in pieces["sleeve"].notches]
    assert front and len(back) >= 2
    assert cap.count("окат спинка") == 2 and "окат перед" in cap and "плечо" in cap


def test_shirt_has_separate_cuff_that_fits_the_wrist():
    shirt, _ = _build("shirt")
    cuff = shirt["cuff"]
    assert 20 <= cuff.bbox.width / 10 <= 27
    assert not any(line["label"] == "манжета" for line in shirt["sleeve"].internal_lines)


def test_coat_has_lapel_facing_and_tall_cap():
    coat, _ = _build("coat")
    assert "facing" in coat
    labels = [line["label"] for line in coat["front"].internal_lines]
    assert "линия перегиба" in labels and "лацкан" in labels
    cap = next(e for e in coat["sleeve"].seam_edges if e["label"] == "окат")["points"]
    ys = [p.y for p in cap]
    assert (max(ys) - min(ys)) / 10 >= 13.0
    # Воротник притачивается от раскепа: по длине горловины полочки и спинки.
    assert _edge(coat["collar"], "горловина") == pytest.approx(
        _edge(coat["front"], "горловина") + _edge(coat["back"], "горловина"), abs=5.0
    )


def test_dart_is_bridged_by_the_cut_line_not_cut_out():
    from app.export.cutplan import cut_plan

    dress, _ = _build("dress")
    plan = cut_plan(dress["front"], fold_halves=False)
    # Линия шва с клином, линия реза - без него: две вершины клиньев убраны.
    assert len(plan.cut) < len(plan.outline)
    apex = min((x, y) for x, y in plan.outline if 250 < y < 400 and x > 0)
    assert all(x > apex[0] + 30 for x, y in plan.cut if abs(y - apex[1]) < 20 and x > 0)


@pytest.mark.parametrize("model", ["dress", "vest", "coat"])
def test_back_shoulder_is_eased(model):
    pieces, _ = _build(model)
    ease = _edge(pieces["back"], "плечо") - _edge(pieces["front"], "плечо")
    assert 5.0 <= ease <= 10.0


def test_slip_straps_are_equal():
    pieces, _ = _build("slip")
    assert _edge(pieces["back"], "плечо") == pytest.approx(_edge(pieces["front"], "плечо"), abs=1.0)


def test_shirt_collar_has_stand_and_fall_that_match():
    shirt, _ = _build("shirt")
    stand, fall = shirt["collar_stand"], shirt["collar"]
    neckline = _edge(shirt["front"], "горловина") + _edge(shirt["back"], "горловина")
    assert _edge(stand, "горловина") == pytest.approx(neckline, abs=3.0)
    assert _edge(fall, "стойка") == pytest.approx(_edge(stand, "верх стойки"), abs=2.0)
    assert any(n["label"] == "плечо" for n in stand.notches)


@pytest.mark.parametrize(
    ("model", "piece", "count"),
    [
        ("shirt", "front", 5),
        ("coat", "front", 3),
        ("vest", "front", 5),
        ("cardigan", "buttonband", 5),
    ],
)
def test_buttonholes_are_marked(model, piece, count):
    pieces, _ = _build(model)
    holes = [line for line in pieces[piece].internal_lines if line["type"] == "buttonhole"]
    assert len(holes) >= count
    if piece == "front":
        crosses = [line for line in pieces[piece].internal_lines if line["type"] == "button"]
        assert len(crosses) == 2 * len(holes)
        # Пуговица на линии середины переда, не засечкой на срезе.
        assert all(abs(sum(p.x for p in c["points"]) / 2) < 1e-6 for c in crosses)
        assert not any(n["label"] == "пуговица" for n in pieces[piece].notches)
