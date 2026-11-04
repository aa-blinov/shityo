"""Тесты HTTP API: контракт из docs/API-CONTRACT.md."""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_catalog_lists_models():
    response = client.get("/api/catalog")
    assert response.status_code == 200
    items = response.json()["items"]
    ids = {item["id"] for item in items}
    assert {"tee", "shirt", "trousers", "skirt"} <= ids
    for item in items:
        assert item["name"]
        assert item["measurements"]
        assert item["params"]
        assert item["default_measurements"]


def test_generate_returns_pieces_in_millimetres():
    response = client.post(
        "/api/generate",
        json={"model": "tee", "measurements": {}, "params": {}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["units"] == "mm"
    assert {p["id"] for p in data["pieces"]} == {"front", "back", "sleeve"}
    front = next(p for p in data["pieces"] if p["id"] == "front")
    assert len(front["outline"]) > 3
    assert front["bbox"]["width"] > 100
    assert front["grainline"]["x1"] is not None


def test_generate_rejects_unknown_model():
    response = client.post("/api/generate", json={"model": "nope", "measurements": {}})
    assert response.status_code == 404


def test_generate_reports_missing_measurements():
    response = client.post(
        "/api/generate",
        json={"model": "tee", "measurements": {"bust": 90}, "params": {}},
    )
    assert response.status_code == 400
    assert "мерок" in response.json()["detail"]


def test_validate_endpoint():
    response = client.post(
        "/api/validate",
        json={"model": "trousers", "measurements": {}, "params": {}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["warnings"], list)


def test_size_grid_endpoint():
    response = client.get("/api/validate/sizes", params={"model": "tee"})
    assert response.status_code == 200
    items = response.json()
    assert isinstance(items, list)
    assert len(items) >= 4
    assert {"size", "measurements", "dimensions"} <= set(items[0])
    assert items[0]["dimensions"]["front_width_cm"] > 0


def test_size_grid_unknown_model():
    response = client.get("/api/validate/sizes", params={"model": "nope"})
    assert response.status_code == 404


@pytest.mark.parametrize("extension", ["svg", "dxf", "pdf"])
def test_exports_return_content(extension):
    response = client.get(f"/api/export/tee.{extension}")
    assert response.status_code == 200
    assert len(response.content) > 200
    if extension == "svg":
        assert response.text.lstrip().startswith("<?xml") or "<svg" in response.text[:400]
    if extension == "pdf":
        assert response.content[:4] == b"%PDF"


def test_export_accepts_measurements_query():
    measurements = json.dumps({"bust": 120})
    response = client.get("/api/export/tee.svg", params={"measurements": measurements})
    assert response.status_code == 200
    assert "svg" in response.text[:400]
