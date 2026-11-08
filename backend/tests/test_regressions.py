"""Regression checks measured from geometry, independently of reported metrics."""

import json
import math
import pytest
from shapely.geometry import Polygon, LineString
from fastapi.testclient import TestClient
from app.main import app
from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.core.geometry import polyline_length
from app.core.sizes import SIZE_GRIDS

client = TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("endpoint", ["generate", "validate"])
@pytest.mark.parametrize("value", [None, "abc", True, [], {}])
def test_bad_numeric_params_are_client_errors(endpoint, value):
    response = client.post(
        f"/api/{endpoint}", json={"model": "tee", "params": {"ease_bust": value}}
    )
    assert response.status_code == 400


@pytest.mark.parametrize("extension", ["svg", "dxf", "pdf"])
def test_export_preserves_editor_changes(extension):
    base = client.get(f"/api/export/tee.{extension}")
    changed = client.get(
        f"/api/export/tee.{extension}",
        params={"params": json.dumps({"overrides": {"shoulder_tip_x": 20}})},
    )
    assert changed.status_code == 200
    if extension != "dxf":
        assert base.content != changed.content
    else:
        import io
        import ezdxf

        def contours(response):
            doc = ezdxf.read(io.StringIO(response.content.decode("cp1251")))
            return [
                list(e.get_points()) for e in doc.modelspace().query('LWPOLYLINE[layer=="SEAM"]')
            ]

        assert contours(base) != contours(changed)


@pytest.mark.parametrize("model", ["tee", "shirt"])
def test_hem_preserves_hip_circumference(model):
    item = catalog_item(model)
    m = {**item["default_measurements"], "hip": 130, "waist": 110}
    pieces = build_draft(model, m, {})
    ease = 8 if model == "tee" else 10
    widths = []
    for p in pieces[:2]:
        bottom = max(v.y for v in p.outline)
        section = Polygon([(v.x, v.y) for v in p.outline]).intersection(
            LineString([(-10000, bottom - 0.01), (10000, bottom - 0.01)])
        )
        widths.append(section.length / 10)
    assert sum(widths) == pytest.approx(m["hip"] + ease, abs=0.2)


@pytest.mark.parametrize("neckline", ["crew", "v", "square", "scoop"])
def test_collar_matches_actual_neck_opening(neckline):
    item = catalog_item("shirt")
    pieces = build_draft("shirt", item["default_measurements"], {"neckline": neckline})

    def neck_half(p):
        points = []
        for v in p.outline:
            points.append(v)
            if abs(v.y) < 1e-6:
                break
        return polyline_length(points)

    opening = 2 * sum(neck_half(p) for p in pieces[:2])
    collar = pieces[-1]
    edge = next(e for e in collar.seam_edges if e["label"] == "горловина")
    assert 2 * polyline_length(edge["points"]) == pytest.approx(opening, abs=0.5)


@pytest.mark.parametrize("model", list(SIZE_GRIDS))
def test_size_grid_geometry_and_cap_pairs(model):
    for row in SIZE_GRIDS[model]:
        pieces = build_draft(model, row["measurements"], {"gender": row["gender"]})
        for p in pieces:
            assert all(math.isfinite(v.x) and math.isfinite(v.y) for v in p.outline)
            assert Polygon([(v.x, v.y) for v in p.outline]).is_valid
        if model in ("tee", "shirt"):

            def length(p, label):
                return polyline_length(
                    next(e["points"] for e in p.seam_edges if e["label"] == label)
                )

            # Окат длиннее проймы на посадку рукава: 0,5 см у футболки,
            # 1,5 см у рубашки.
            ease = 5.0 if model == "tee" else 15.0
            assert length(pieces[2], "окат") == pytest.approx(
                sum(length(p, "пройма") for p in pieces[:2]) + ease, abs=1
            )


@pytest.mark.parametrize("length_delta", [-20, 0, 20])
def test_trouser_inseams_match_the_measurement(length_delta):
    item = catalog_item("trousers")
    m = item["default_measurements"]
    pieces = build_draft("trousers", m, {"length_delta": length_delta})
    for p in pieces:
        edge = next(e for e in p.seam_edges if e["label"] == "шаг")
        assert polyline_length(edge["points"]) / 10 == pytest.approx(
            m["inseam_length"] + length_delta, abs=0.01
        )


def test_shirt_sewn_waist_keeps_ease_after_darts():
    item = catalog_item("shirt")
    m = item["default_measurements"]
    pieces = build_draft("shirt", m, {})
    total = 0
    for p in pieces[:2]:
        darts = [line["points"] for line in p.internal_lines if line["type"] == "dart"]
        y = darts[0][0].y
        width = (
            Polygon([(v.x, v.y) for v in p.outline])
            .intersection(LineString([(-10000, y), (10000, y)]))
            .length
        )
        intake = sum(abs(d[0].x - d[2].x) for d in darts)
        total += (width - intake) / 10
    assert total == pytest.approx(m["waist"] + 10, abs=0.1)


@pytest.mark.parametrize("field", ["measurements", "overrides"])
@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_json_is_a_client_error(field, value):
    response = client.post(
        "/api/generate",
        content='{"model":"tee","' + field + '":{"bust":' + value + "}}",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400


@pytest.mark.parametrize("measurements", [{}, {"sleeve_length": 25}])
def test_export_and_generate_use_identical_effective_inputs(monkeypatch, measurements):
    from app.api import routes

    item = catalog_item("shirt")
    m = {**item["default_measurements"], **measurements} if measurements else {}
    generated = client.post("/api/generate", json={"model": "shirt", "measurements": m}).json()
    captured = []

    def render(pieces, **options):
        captured.extend(p.to_dict() for p in pieces)
        return "<svg/>"

    monkeypatch.setattr(routes, "render_svg_tiled", render)
    exported = client.get("/api/export/shirt.svg", params={"measurements": json.dumps(m)})
    assert exported.status_code == 200
    assert captured == generated["pieces"]
