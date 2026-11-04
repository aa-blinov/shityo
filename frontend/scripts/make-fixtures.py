"""Generate offline fixtures for the frontend.

The fixture geometry is produced by the backend, so it is captured verbatim
from a running instance instead of being hand-written here. The catalogue is
taken from the backend too: keeping a hand-written copy of it meant the two
drifted apart, and the offline mode then offered the wrong set of
measurements.

Fixture files:
  catalog.json          -> response shape of GET /api/catalog
  sizes-<model>.json    -> response shape of GET /api/validate/sizes?model=..
  generate-<model>.json -> response shape of POST /api/generate

Run: python scripts/make-fixtures.py
"""
from __future__ import annotations

import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = ROOT / "src" / "lib" / "fixtures"

BASE_URL = "http://127.0.0.1:8000"


def fetch_json(url: str, payload: dict | None = None) -> object:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def write(path: pathlib.Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


catalog = fetch_json(f"{BASE_URL}/api/catalog")
write(FIX / "catalog.json", catalog)

for item in catalog["items"]:
    model = item["id"]
    params = {
        key: descriptor["default"] for key, descriptor in item["params"].items()
    }
    try:
        generated = fetch_json(
            f"{BASE_URL}/api/generate",
            {"model": model, "measurements": item["default_measurements"], "params": params},
        )
    except OSError as exc:
        print(f"SKIP generate-{model}.json: backend unavailable ({exc})")
        continue
    write(FIX / f"generate-{model}.json", generated)

for item in catalog["items"]:
    model = item["id"]
    try:
        sizes = fetch_json(f"{BASE_URL}/api/validate/sizes?model={model}")
    except OSError as exc:
        print(f"SKIP sizes-{model}.json: backend unavailable ({exc})")
        continue
    write(FIX / f"sizes-{model}.json", sizes)
