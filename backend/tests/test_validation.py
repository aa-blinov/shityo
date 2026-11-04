"""Тесты валидатора лекала: геометрия деталей, мерки и параметры фасона.

Детали строятся локально, чтобы проверки не зависели от черчения: валидатор
должен ловить поломки геометрии независимо от того, откуда деталь пришла.
"""

import pytest

from app.core.geometry import Point
from app.core.validation import SeamPair, declare_seam_pairs, validate
from app.drafts.base import Piece

GOOD_MEASUREMENTS = {
    "bust": 96,
    "waist": 84,
    "hip": 98,
    "height": 176,
    "shoulder_width": 46,
    "shoulder_slope": 13,
    "neck_to_waist": 44,
    "waist_to_armpit": 22,
    "biceps": 32,
    "back_length": 72,
    "sleeve_length": 62,
    "neck_circumference": 40,
}

GOOD_PARAMS = {
    "ease_bust": 4.0,
    "length_delta": 0.0,
    "sleeve_length": 62.0,
}


def rectangle(width: float, height: float) -> list[Point]:
    """Прямоугольный замкнутый контур детали (в мм)."""
    return [
        Point(0.0, 0.0),
        Point(width, 0.0),
        Point(width, height),
        Point(0.0, height),
        Point(0.0, 0.0),
    ]


def good_piece(piece_id: str = "front", **overrides) -> Piece:
    """Заведомо корректная деталь: замкнутый контур, зерно, припуск."""
    params = {
        "id": piece_id,
        "name": "Перед",
        "outline": rectangle(200.0, 400.0),
        "seam_allowance": 10.0,
        "notches": [{"x": 200.0, "y": 200.0, "label": "бок"}],
        "grainline": (Point(100.0, 60.0), Point(100.0, 340.0)),
        "internal_lines": [],
        "mirrored": False,
        "cut": 1,
    }
    params.update(overrides)
    return Piece(**params)


def bowtie_piece() -> Piece:
    """Деталь с самопересекающимся контуром."""
    return good_piece(
        outline=[
            Point(0.0, 0.0),
            Point(200.0, 0.0),
            Point(0.0, 300.0),
            Point(200.0, 300.0),
            Point(0.0, 0.0),
        ],
    )


def flat_piece() -> Piece:
    """Деталь нулевой площади: все точки на одной прямой."""
    return good_piece(
        outline=[
            Point(0.0, 0.0),
            Point(100.0, 0.0),
            Point(200.0, 0.0),
            Point(100.0, 0.0),
            Point(0.0, 0.0),
        ],
    )


def report_for(pieces, measurements=None, params=None) -> dict:
    return validate(
        pieces,
        GOOD_MEASUREMENTS if measurements is None else measurements,
        GOOD_PARAMS if params is None else params,
    )


def error_codes(report: dict) -> list[str]:
    """Коды ошибок отчёта: проверки идут по коду, а не по формулировке."""
    return [item["code"] for item in report["errors"]]


def warning_codes(report: dict) -> list[str]:
    return [item["code"] for item in report["warnings"]]


def errors_mention(report: dict, needle: str) -> bool:
    return any(needle in message for message in report["error_texts"])


# --- Корректное лекало ----------------------------------------------------


def test_good_piece_passes_without_errors():
    report = report_for([good_piece()])
    assert report["ok"] is True
    assert report["errors"] == []


def test_report_has_expected_shape():
    report = report_for([good_piece()])
    assert set(report) == {"ok", "errors", "warnings", "error_texts", "warning_texts"}
    assert isinstance(report["ok"], bool)
    assert isinstance(report["errors"], list)
    assert isinstance(report["warnings"], list)


def test_empty_pattern_is_an_error():
    report = report_for([])
    assert report["ok"] is False
    assert report["errors"]


# --- Геометрия ------------------------------------------------------------


def test_open_contour_is_reported():
    piece = good_piece(
        outline=[
            Point(0.0, 0.0),
            Point(200.0, 0.0),
            Point(200.0, 400.0),
            Point(0.0, 400.0),
        ]
    )
    report = report_for([piece])
    assert report["ok"] is False
    assert "contour.not_closed" in error_codes(report)


def test_self_intersecting_contour_is_reported():
    report = report_for([bowtie_piece()])
    assert report["ok"] is False
    assert "contour.self_intersecting" in error_codes(report)


def test_zero_area_piece_is_reported():
    report = report_for([flat_piece()])
    assert report["ok"] is False
    assert "contour.zero_area" in error_codes(report)


def test_missing_grainline_is_a_warning():
    report = report_for([good_piece(grainline=None)])
    assert report["ok"] is True, "отсутствие зерна - предупреждение, а не ошибка"
    assert "grainline.missing" in warning_codes(report)


def test_grainline_across_the_piece_is_a_warning():
    piece = good_piece(grainline=(Point(20.0, 200.0), Point(180.0, 200.0)))
    report = report_for([piece])
    assert report["ok"] is True
    assert "grainline.deviation" in warning_codes(report)


def test_grain_axis_width_allows_horizontal_grainline():
    piece = good_piece(
        grainline=(Point(20.0, 200.0), Point(180.0, 200.0)),
        grain_axis="width",
    )
    report = report_for([piece])
    assert report["ok"] is True
    assert not any("доля" in message for message in report["warnings"])


def test_seam_allowance_must_be_positive():
    report = report_for([good_piece(seam_allowance=0.0)])
    assert report["ok"] is False
    assert "seam.allowance.too_small" in error_codes(report)


def test_seam_allowance_must_not_exceed_limit():
    report = report_for([good_piece(seam_allowance=40.0)])
    assert report["ok"] is False
    assert "seam.allowance.too_large" in error_codes(report)


def test_reasonable_seam_allowance_passes():
    report = report_for([good_piece(seam_allowance=12.0)])
    assert report["ok"] is True


# --- Мерки ----------------------------------------------------------------


def test_height_out_of_range_is_reported():
    report = report_for([good_piece()], measurements={**GOOD_MEASUREMENTS, "height": 220})
    assert report["ok"] is False
    assert "measure.out_of_range" in error_codes(report)


def test_bust_out_of_range_is_reported():
    report = report_for([good_piece()], measurements={**GOOD_MEASUREMENTS, "bust": 30})
    assert report["ok"] is False
    assert "measure.out_of_range" in error_codes(report)


def test_non_positive_length_measurement_is_reported():
    report = report_for([good_piece()], measurements={**GOOD_MEASUREMENTS, "back_length": 0})
    assert report["ok"] is False
    assert "measure.not_positive" in error_codes(report)


def test_measurements_inside_ranges_pass():
    report = report_for([good_piece()])
    assert report["ok"] is True


# --- Параметры фасона ----------------------------------------------------


def test_ease_out_of_range_is_reported():
    report = report_for([good_piece()], params={**GOOD_PARAMS, "ease_bust": 60.0})
    assert report["ok"] is False
    assert "param.out_of_range" in error_codes(report)


def test_length_delta_out_of_range_is_reported():
    report = report_for([good_piece()], params={**GOOD_PARAMS, "length_delta": -45.0})
    assert report["ok"] is False
    assert "param.out_of_range" in error_codes(report)


def test_sleeve_length_out_of_range_is_reported():
    report = report_for([good_piece()], params={**GOOD_PARAMS, "sleeve_length": 5.0})
    assert report["ok"] is False
    assert "param.out_of_range" in error_codes(report)


def test_params_inside_ranges_pass():
    report = report_for([good_piece()], params={**GOOD_PARAMS, "ease_bust": 12.0})
    assert report["ok"] is True


# --- Пары швов ------------------------------------------------------------


def test_matching_seam_pair_lengths_pass():
    front = good_piece("front")
    back = good_piece("back")
    declare_seam_pairs(
        ["front", "back"],
        [SeamPair("front", "бок", "back", "бок", tolerance_mm=1.0)],
    )
    try:
        report = report_for([front, back])
        assert report["ok"] is True
    finally:
        from app.core.validation import SEAM_PAIRS

        SEAM_PAIRS.clear()


def test_mismatched_seam_pair_lengths_are_reported():
    front = good_piece("front", outline=rectangle(200.0, 400.0))
    back = good_piece("back", outline=rectangle(200.0, 380.0))
    declare_seam_pairs(
        ["front", "back"],
        [SeamPair("front", "бок", "back", "бок", tolerance_mm=1.0)],
    )
    try:
        report = report_for([front, back])
        assert report["ok"] is False
        assert "seam.length_mismatch" in error_codes(report)
    finally:
        from app.core.validation import SEAM_PAIRS

        SEAM_PAIRS.clear()


def test_unknown_seam_pairs_are_skipped():
    report = report_for([good_piece("front"), good_piece("back")])
    assert report["ok"] is True


# --- На настоящих конструкциях ------------------------------------------


def test_drafted_tee_is_valid():
    drafts = pytest.importorskip("app.drafts")
    pieces = drafts.build_draft(
        "tee", dict(GOOD_MEASUREMENTS, shoulder_width=46, neck_circumference=40), {}
    )
    report = validate(pieces, GOOD_MEASUREMENTS, GOOD_PARAMS)
    assert report["ok"] is True, report["errors"]


def test_drafted_skirt_has_no_grainline_warning():
    drafts = pytest.importorskip("app.drafts")
    measurements = {
        "waist": 72,
        "hip": 96,
        "height": 172,
        "waist_to_hip": 20,
        "skirt_length": 56,
    }
    pieces = drafts.build_draft("skirt", measurements, {})
    report = validate(pieces, measurements, {})
    assert report["ok"] is True, report["errors"]
    assert not warning_codes(report), report["warnings"]
