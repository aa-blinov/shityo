"""Proof of Concept: параметрическое построение и экспорт простой конструкции.

Запуск:
    .venv/Scripts/python.exe scripts/poc.py
Скрипт собирает футболку по меркам, печатает размеры деталей и раскладку
лекал на A4, затем пишет SVG, DXF и PDF в work/poc/.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.drafts import build_draft  # noqa: E402
from app.drafts.catalog import catalog_item  # noqa: E402
from app.export.dxf import render_dxf  # noqa: E402
from app.export.pdf import render_pdf  # noqa: E402
from app.export.svg import render_svg  # noqa: E402

MODEL = "tee"
OUT_DIR = ROOT / "work" / "poc"


def main() -> int:
    item = catalog_item(MODEL)
    if item is None:
        print(f"Модель {MODEL} не найдена в каталоге")
        return 1

    measurements = dict(item["default_measurements"])
    params = {name: spec.get("default") for name, spec in item["params"].items()}

    pieces = build_draft(MODEL, measurements, params)

    print(f"Модель: {item['name']}")
    print(f"Мерки: {measurements}")
    print(f"Параметры: {params}")
    print()
    for piece in pieces:
        print(
            f"  {piece.id:8} {piece.name:10} "
            f"{piece.bbox.width / 10:7.1f} x {piece.bbox.height / 10:6.1f} см  "
            f"площадь {piece.area / 100:9.1f} см^2  "
            f"деталей: {piece.cut}"
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "tee.svg").write_text(render_svg(pieces, page="A4"), encoding="utf-8")
    (OUT_DIR / "tee.dxf").write_bytes(render_dxf(pieces))
    (OUT_DIR / "tee.pdf").write_bytes(render_pdf(pieces, page="A4"))

    print()
    print(f"Экспорт записан в {OUT_DIR}")
    for path in sorted(OUT_DIR.iterdir()):
        print(f"  {path.name:10} {path.stat().st_size / 1024:8.1f} КБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
