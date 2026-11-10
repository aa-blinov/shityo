"""Паспорта основ: чтение, каталог из паспортов, проверка «типовая ли основа»."""

from __future__ import annotations

import pytest

from app.blocks import PassportError, _read, catalog_entry, passports
from app.blocks.check import check_block, library, reference
from app.drafts import BUILDERS, CATALOG


def test_every_block_has_a_passport_and_a_builder():
    assert list(passports()) == [item["id"] for item in CATALOG]
    assert set(BUILDERS) == set(passports())
    for block_id, passport in passports().items():
        assert catalog_entry(passport)["pieces"] == passport.pieces, block_id


@pytest.mark.parametrize("block_id", list(passports()))
def test_block_is_typical_and_sews_on_the_whole_grid(block_id):
    """Сборка по всей сетке, пары швов паспорта и типовые размеры ЕМКО."""
    report = check_block(block_id)
    failed = [
        f"{r.level} {r.figure} {r.name}: {r.actual} vs {r.expected} {r.note}"
        for r in report.rows
        if r.status == "fail"
    ]
    assert not failed, "\n".join(failed)


@pytest.mark.parametrize("block_id", list(passports()))
def test_reference_uses_known_checks_and_explains_deviations(block_id):
    lib = library()
    for check_id, spec in reference(block_id).get("checks", {}).items():
        assert check_id in lib, f"{block_id}: нет проверки {check_id} в checks.toml"
        if "accepted" in spec:
            assert len(spec["accepted"]) > 20, f"{block_id}.{check_id}: причина отклонения пустая"


def test_shoulder_blocks_measure_lengths_from_the_cervical_point():
    """Пройма и длина спинки отсчитываются от седьмого шейного позвонка (А0)."""
    for block_id in ("dress", "shirt", "tee", "vest", "coat"):
        rows = [r for r in check_block(block_id, full_grid=False).rows if r.level == "reference"]
        assert any("седьмого шейного" in r.name and r.status == "ok" for r in rows), block_id


def _write(tmp_path, block_id: str, body: str):
    folder = tmp_path / block_id
    folder.mkdir()
    path = folder / "passport.toml"
    path.write_text(body, encoding="utf-8")
    return path


BASE = """
id = "{id}"
order = 99
name = "Проба"
category = "tops"
category_label = "Проба"
description = "Основа для проверки чтения паспорта."
draft = "app.drafts.tee:build_tee"
pieces = ["front", "back"]
genders = ["female"]
measurements = ["bust"]
[source]
kind = "emko"
method = "ЕМКО СЭВ"
"""


def test_passport_errors_name_the_file_and_the_reason(tmp_path, monkeypatch):
    import app.blocks as blocks

    monkeypatch.setattr(blocks, "ROOT", tmp_path)
    good = _read(_write(tmp_path, "probe", BASE.format(id="probe")))
    assert good.id == "probe"
    with pytest.raises(PassportError, match="не совпадает с папкой"):
        _read(_write(tmp_path, "other", BASE.format(id="probe")))
    with pytest.raises(PassportError, match="sleeve"):
        _read(
            _write(
                tmp_path,
                "seams",
                BASE.format(id="seams") + '[[seams]]\na = ["sleeve.окат"]\nb = ["front.пройма"]\n',
            )
        )
    with pytest.raises(PassportError, match="границ"):
        _read(
            _write(
                tmp_path,
                "bounds",
                BASE.format(id="bounds")
                + '[params.x]\ntype = "number"\ndefault = 5\nmin = 10\nmax = 20\n',
            )
        )


def test_blocks_report_is_served_by_the_api():
    from fastapi.testclient import TestClient

    from app.main import app

    response = TestClient(app).get("/api/blocks")
    assert response.status_code == 200
    data = response.json()
    assert [item["block"] for item in data] == list(passports())
    dress = next(item for item in data if item["block"] == "dress")
    assert dress["ok"] and dress["source"]["kind"] == "emko"
    assert any(row["level"] == "reference" for row in dress["rows"])
