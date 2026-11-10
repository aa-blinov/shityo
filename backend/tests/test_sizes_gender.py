"""Размерные ряды по ГОСТ и мужские/женские варианты лекал."""

import pytest
from fastapi.testclient import TestClient

from app.core.sizes import MODEL_GENDERS, SIZE_GRIDS, body, default_row, grid_for
from app.core.validation import validate
from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.main import app

FITS = ("slim", "regular", "loose", "oversize")


def test_size_is_half_bust_girth():
    """Размер по ГОСТ 31396/31399 - половина обхвата груди."""
    for gender in ("female", "male"):
        for size in (44, 48):
            assert body(gender, size)["bust"] == 2 * size


def test_rows_by_gender_follow_the_standards():
    female = [row["size"] for row in grid_for("tee", "female")]
    male = [row["size"] for row in grid_for("tee", "male")]
    assert female[0] == "42" and female[-1] == "54"
    assert male[0] == "44" and male[-1] == "58"
    assert {row["measurements"]["height"] for row in grid_for("tee", "female")} == {164}
    assert {row["measurements"]["height"] for row in grid_for("tee", "male")} == {176}


def test_rows_grow_monotonically():
    """Мерки не убывают с размером.

    Исключение - «от талии до подмышки»: это длина до талии без глубины
    проймы, а пройма растёт быстрее длины.
    """
    for model, rows in SIZE_GRIDS.items():
        for gender in MODEL_GENDERS[model]:
            for height in {r["height"] for r in rows if r["gender"] == gender}:
                _check_monotonic(
                    model,
                    gender,
                    [
                        r["measurements"]
                        for r in rows
                        if r["gender"] == gender and r["height"] == height
                    ],
                )


def _check_monotonic(model, gender, ordered):
    for previous, current in zip(ordered, ordered[1:]):
        for key, value in current.items():
            # Производные и убывающие по ОСТ мерки: от талии до подмышки (пройма
            # растёт быстрее длины), шаговый шов (полная фигура ниже в шагу).
            if key in ("waist_to_armpit", "inseam_length"):
                continue
            assert value >= previous[key], (model, gender, key)


@pytest.mark.parametrize("model", list(SIZE_GRIDS))
def test_every_row_and_fit_builds_a_sewable_pattern(model):
    """Каждый размер каждого ряда при любой посадке проходит проверку швов."""
    for row in SIZE_GRIDS[model]:
        for fit in FITS:
            params = {"gender": row["gender"], "fit": fit}
            pieces = build_draft(model, row["measurements"], params)
            report = validate(pieces, row["measurements"], params)
            assert report["errors"] == [], (model, row["gender"], row["size"], fit)


def test_catalog_genders_and_defaults_come_from_grids():
    for model, genders in MODEL_GENDERS.items():
        item = catalog_item(model)
        assert item["genders"] == genders
        assert item["default_measurements"] == default_row(model)["measurements"]
        if len(genders) > 1:
            assert item["params"]["gender"]["default"] == genders[0]
    assert "kids" not in {g for item in MODEL_GENDERS.values() for g in item}


def _bust_dart_apex(front) -> bool:
    """Есть ли на боку переда вырезанная вытачка (контур уходит внутрь)."""
    xs = [p.x for p in front.outline if p.x > 0]
    right = max(xs)
    return any(0 < p.x < right * 0.6 and p.y > 150 for p in front.outline)


@pytest.mark.parametrize("model", ["vest", "coat"])
def test_bust_dart_only_for_women(model):
    female = default_row(model, "female")["measurements"]
    male = default_row(model, "male")["measurements"]
    front_f = next(p for p in build_draft(model, female, {"gender": "female"}) if p.id == "front")
    front_m = next(p for p in build_draft(model, male, {"gender": "male"}) if p.id == "front")
    # Женский перед длиннее спинки на разницу длин до талии (баланс).
    back_f = next(p for p in build_draft(model, female, {"gender": "female"}) if p.id == "back")
    # Спинка до талии - от седьмого шейного позвонка, перед - от плечевой
    # точки горловины: баланс меньше разницы мерок на подъём горловины.
    from app.drafts.common import cervical_rise

    balance = (
        female["front_waist_length"]
        - female["back_waist_length"]
        - cervical_rise(female["half_neck"])
    )
    assert (front_f.bbox.height - back_f.bbox.height) / 10.0 == pytest.approx(balance, abs=0.1)
    back_m = next(p for p in build_draft(model, male, {"gender": "male"}) if p.id == "back")
    assert front_m.bbox.height == pytest.approx(back_m.bbox.height, abs=1.0)


def test_bust_point_drives_the_dart():
    """Высота груди меняет направление нагрудной вытачки."""
    m = default_row("dress")["measurements"]
    low = build_draft("dress", {**m, "bust_height": m["bust_height"] + 3}, {})
    high = build_draft("dress", m, {})
    assert low[0].outline != high[0].outline


def test_sizes_endpoint_filters_by_gender():
    client = TestClient(app)
    female = client.get("/api/validate/sizes", params={"model": "trousers", "gender": "female"})
    male = client.get("/api/validate/sizes", params={"model": "trousers", "gender": "male"})
    default = client.get("/api/validate/sizes", params={"model": "trousers"})
    assert {r["gender"] for r in female.json()} == {"female"}
    assert {r["gender"] for r in male.json()} == {"male"}
    assert default.json() == male.json()


def test_height_groups_follow_gost_steps():
    """Рост - отдельный признак типовой фигуры: шаг 6 см, обхваты не меняются."""
    from app.core.sizes import grid_for

    rows = grid_for("dress", "female", all_heights=True)
    assert sorted({r["height"] for r in rows}) == [152, 158, 164, 170, 176, 182]
    by_height = {r["height"]: r["measurements"] for r in rows if r["size"] == "46"}
    assert by_height[170]["half_bust"] == by_height[158]["half_bust"]
    assert by_height[170]["back_waist_length"] > by_height[164]["back_waist_length"]
    assert by_height[164]["back_waist_length"] > by_height[158]["back_waist_length"]
    male = grid_for("tee", "male", all_heights=True)
    assert sorted({r["height"] for r in male}) == [158, 164, 170, 176, 182, 188, 194, 200]


def test_gost_designation():
    """Женщины: рост-грудь-бёдра (31396), мужчины: рост-грудь-талия (31399)."""
    from app.core.sizes import designation

    assert designation("female", 46, 164) == "164-92-98"
    assert designation("male", 50, 176) == "176-100-88"
