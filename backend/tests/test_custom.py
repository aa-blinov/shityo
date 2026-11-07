"""Пользовательские детали: приём готовой геометрии, печать и экспорт."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _rectangle(piece_id: str = "piece-1", name: str = "Перед") -> dict:
    return {
        "id": piece_id,
        "name": name,
        "outline": [
            {"x": 0, "y": 0},
            {"x": 200, "y": 0},
            {"x": 200, "y": 300},
            {"x": 0, "y": 300},
        ],
    }


def test_custom_generate_returns_piece():
    response = client.post("/api/custom/generate", json={"pieces": [_rectangle()]})
    assert response.status_code == 200
    data = response.json()
    assert data["model"] == "custom"
    assert data["units"] == "mm"
    assert len(data["pieces"]) == 1
    piece = data["pieces"][0]
    assert piece["id"] == "piece-1"
    assert piece["bbox"]["width"] == 200
    assert piece["bbox"]["height"] == 300


def test_custom_generate_removes_closing_point():
    piece = _rectangle()
    piece["outline"].append({"x": 0, "y": 0})
    response = client.post("/api/custom/generate", json={"pieces": [piece]})
    assert response.status_code == 200
    assert len(response.json()["pieces"][0]["outline"]) == 4


def test_custom_generate_rejects_short_outline():
    piece = _rectangle()
    piece["outline"] = [{"x": 0, "y": 0}, {"x": 10, "y": 0}]
    response = client.post("/api/custom/generate", json={"pieces": [piece]})
    assert response.status_code == 400
    assert "трёх" in response.json()["detail"]


def test_custom_generate_rejects_degenerate_area():
    piece = _rectangle()
    piece["outline"] = [
        {"x": 0, "y": 0},
        {"x": 10, "y": 0},
        {"x": 20, "y": 0},
    ]
    response = client.post("/api/custom/generate", json={"pieces": [piece]})
    assert response.status_code == 400
    assert "Площадь" in response.json()["detail"]


def test_custom_generate_rejects_duplicate_ids():
    response = client.post(
        "/api/custom/generate",
        json={"pieces": [_rectangle(), _rectangle()]},
    )
    assert response.status_code == 400
    assert "повторяется" in response.json()["detail"]


def test_custom_generate_accepts_grainline_and_notch():
    piece = _rectangle()
    piece["grainline"] = {"x1": 100, "y1": 20, "x2": 100, "y2": 280}
    piece["notches"] = [{"x": 0, "y": 150, "label": "бок"}]
    piece["internal_lines"] = [{"type": "fold", "points": [{"x": 0, "y": 0}, {"x": 0, "y": 300}]}]
    response = client.post("/api/custom/generate", json={"pieces": [piece]})
    assert response.status_code == 200
    data = response.json()["pieces"][0]
    assert data["grainline"]["x1"] == 100
    assert data["notches"][0]["label"] == "бок"
    assert data["internal_lines"][0]["type"] == "fold"


def test_custom_print_plan_returns_pages():
    response = client.post(
        "/api/custom/print-plan",
        json={"pieces": [_rectangle()], "paper": {"page": "A4", "orientation": "portrait"}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["page_count"] >= 1
    assert data["pieces"][0]["id"] == "piece-1"


def test_custom_export_svg():
    response = client.post(
        "/api/custom/export/svg",
        json={"pieces": [_rectangle()], "paper": {"page": "A4", "orientation": "portrait"}},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in response.text


def test_custom_export_dxf():
    response = client.post("/api/custom/export/dxf", json={"pieces": [_rectangle()]})
    assert response.status_code == 200
    assert b"SECTION" in response.content
    assert b"AC1015" in response.content


def test_custom_export_pdf():
    response = client.post(
        "/api/custom/export/pdf",
        json={"pieces": [_rectangle()], "paper": {"page": "A4", "orientation": "portrait"}},
    )
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
