"""Printing checks use PDF coordinates and reconstructed geometry, not just page counts."""

import io
import math
import pytest
from pypdf import PdfReader
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from fastapi.testclient import TestClient
from app.main import app
from app.core.geometry import Point
from app.drafts import build_draft
from app.drafts.base import Piece
from app.drafts.catalog import catalog_item
from app.export.layout import (
    PAGE_SIZES,
    build_pages,
    build_geometry,
    page_size,
    _tile_positions,
    _piece_primitives,
)

client = TestClient(app)


@pytest.mark.parametrize("paper", list(PAGE_SIZES))
@pytest.mark.parametrize("orientation", ["portrait", "landscape"])
def test_api_pdf_matches_selected_paper_and_plan(paper, orientation):
    options = {"page": paper, "orientation": orientation, "calibration": True}
    plan = client.post("/api/print-plan", json={"model": "tee", "paper": options})
    assert plan.status_code == 200
    response = client.get("/api/export/tee.pdf", params=options)
    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == plan.json()["page_count"]
    expected = page_size(paper, orientation)
    for page in reader.pages:
        assert float(page.mediabox.width) * 25.4 / 72 == pytest.approx(expected[0], abs=0.001)
        assert float(page.mediabox.height) * 25.4 / 72 == pytest.approx(expected[1], abs=0.001)
    assert str(reader.trailer["/Root"]["/ViewerPreferences"]["/PrintScaling"]) == "/None"
    horizontal = []
    vertical = []
    start = None
    for operands, operator in reader.pages[0].get_contents().operations:
        if operator == b"m":
            start = tuple(map(float, operands))
        elif operator == b"l" and start:
            end = tuple(map(float, operands))
            dx = abs(end[0] - start[0]) * 25.4 / 72
            dy = abs(end[1] - start[1]) * 25.4 / 72
            if dy < 0.001:
                horizontal.append(dx)
            if dx < 0.001:
                vertical.append(dy)
    assert any(abs(length - 50) < 0.001 for length in horizontal)
    assert any(abs(length - 50) < 0.001 for length in vertical)


@pytest.mark.parametrize("paper", ["A4", "A3", "LETTER", "LEGAL"])
@pytest.mark.parametrize("orientation", ["portrait", "landscape"])
def test_tiled_cut_contour_is_completely_recoverable(paper, orientation):
    m = catalog_item("tee")["default_measurements"]
    piece = build_draft("tee", m, {})[0]
    geometry = build_geometry(piece, None)
    sheets = build_pages([piece], page=paper, orientation=orientation)
    w, h = page_size(paper, orientation)
    drawn = []
    for sheet in sheets:
        dx = sheet.meta.get("column", 0) * (w - 20 - 8)
        dy = sheet.meta.get("row", 0) * (h - 20 - 8)
        for segment in sheet.segments:
            if segment.kind == "cut":
                drawn.append(
                    LineString([(p[0] - 10 + dx, p[1] - 10 + dy) for p in (segment.p0, segment.p1)])
                )
    expected = [geometry.to_local(p) for p in geometry.cut]
    expected = LineString(expected + [expected[0]])
    assert expected.difference(unary_union(drawn).buffer(1e-5)).length < 1e-4


def test_plotter_pdf_contains_every_piece_without_scaling():
    plan = client.post(
        "/api/print-plan", json={"model": "shirt", "paper": {"page": "FULL", "calibration": True}}
    ).json()
    pdf = client.get("/api/export/shirt.pdf", params={"page": "FULL", "calibration": True})
    reader = PdfReader(io.BytesIO(pdf.content))
    assert len(reader.pages) == plan["page_count"] == 1
    assert plan["calibration"] is False
    assert float(reader.pages[0].mediabox.width) * 25.4 / 72 == pytest.approx(
        plan["width_mm"], abs=0.001
    )
    pieces = build_draft("shirt", catalog_item("shirt")["default_measurements"], {})
    pages = build_pages(pieces, page="FULL")
    expected = 0
    for piece in pieces:
        cut = build_geometry(piece, None).cut
        expected += LineString(cut + [cut[0]]).length
    actual = sum(math.dist(s.p0, s.p1) for s in pages[0].segments if s.kind == "cut")
    assert actual == pytest.approx(expected, abs=1e-5)


@pytest.mark.parametrize("usable", [190, 277, 400])
@pytest.mark.parametrize("fraction", [0, 1e-4, 0.5, 1, 2.01])
def test_tile_offsets_have_fixed_overlap_and_cover_extent(usable, fraction):
    size = usable + fraction * (usable - 8)
    positions = _tile_positions(size, usable)
    assert positions[0] == 0
    assert positions[-1] + usable >= size - 1e-7
    assert all(b - a == pytest.approx(usable - 8) for a, b in zip(positions, positions[1:]))


def test_grain_arrows_are_translated_only_once():
    piece = Piece(
        "test",
        "Test",
        [Point(100, 200), Point(200, 200), Point(200, 400), Point(100, 400), Point(100, 200)],
        grainline=(Point(150, 230), Point(150, 370)),
    )
    geometry = build_geometry(piece, None)
    segments, _ = _piece_primitives(geometry, None)
    tips = [geometry.to_local((p.x, p.y)) for p in piece.grainline]
    for s in segments:
        if s.kind == "grain" and math.dist(s.p0, s.p1) < 7:
            assert all(min(math.dist(p, tip) for tip in tips) < 5 for p in (s.p0, s.p1))


def test_piece_allowance_is_respected():
    piece = Piece(
        "test",
        "Test",
        [Point(0, 0), Point(100, 0), Point(100, 100), Point(0, 100), Point(0, 0)],
        seam_allowance=7,
    )
    assert build_geometry(piece, None).bbox.width == pytest.approx(114, abs=0.01)


@pytest.mark.parametrize("model", ["tee", "shirt"])
def test_length_change_preserves_the_waist_level_and_width(model):
    m = catalog_item(model)["default_measurements"]
    widths = []
    for delta in (-10, 0, 20):
        pieces = build_draft(model, m, {"length_delta": delta})
        total = 0
        for p in pieces[:2]:
            y = m["neck_to_waist"] * 10
            width = (
                Polygon([(v.x, v.y) for v in p.outline])
                .intersection(LineString([(-10000, y), (10000, y)]))
                .length
            )
            darts = [line["points"] for line in p.internal_lines if line["type"] == "dart"]
            assert all(d[0].y == pytest.approx(y) for d in darts)
            total += (width - sum(abs(d[0].x - d[2].x) for d in darts)) / 10
        widths.append(total)
    ease = 8 if model == "tee" else 10
    assert widths == pytest.approx([m["waist"] + ease] * 3, abs=0.05)


def test_unknown_print_options_are_client_errors():
    assert client.get("/api/export/tee.pdf", params={"page": "A99"}).status_code == 422
    assert client.get("/api/export/tee.pdf", params={"orientation": "diagonal"}).status_code == 422
    assert (
        client.post("/api/print-plan", json={"model": "tee", "paper": {"page": "A99"}}).status_code
        == 422
    )


def test_pdf_download_header():
    response = client.get("/api/export/skirt.pdf", params={"download": True, "page": "A3"})
    assert "attachment" in response.headers["content-disposition"]
    assert "skirt-A3.pdf" in response.headers["content-disposition"]


def test_print_layout_preserves_screen_vertical_direction():
    piece = Piece(
        "test",
        "Test",
        [Point(100, 200), Point(200, 200), Point(200, 400), Point(100, 400), Point(100, 200)],
    )
    geometry = build_geometry(piece, None)
    upper = geometry.to_local((150, 220))
    lower = geometry.to_local((150, 380))
    assert upper[1] < lower[1]
    assert lower[1] - upper[1] == pytest.approx(160)
