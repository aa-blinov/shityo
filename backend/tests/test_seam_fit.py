"""Сопряжение деталей: рукав должен входить в пройму без зазора.

Длина оката рукава равна сумме длин проймы переда и спинки плюс посадка
рукава (у трикотажной футболки 0,5 см). Это автоматическая проверка того,
что детали сшиваются между собой, а не просто похожи на лекала.

Ширина рукава при этом задана обхватом бицепса: рукав не может быть шире
руки, иначе посадка невозможна.
"""

import pytest

from app.core.geometry import polyline_length
from app.drafts import build_draft
from app.drafts.catalog import catalog_item
from app.drafts.sleeve import cap_curve, solve_cap_rise


def _cap_length_of(piece) -> float:
    """Длина оката рукава в сантиметрах: по подписанному шву «окат»."""
    edge = next(e for e in piece.seam_edges if e["label"] == "окат")
    return polyline_length(edge["points"]) / 10.0


def test_sleeve_cap_matches_armholes():
    """Окат рукава = пройма переда + пройма спинки + посадка 0,5 см.

    Окат - весь шов от подмышки до подмышки: концы оката совпадают с углами
    рукава, участков шва вне оката нет.
    """
    item = catalog_item("tee")
    pieces = build_draft("tee", item["default_measurements"], {})
    sleeve = next(p for p in pieces if p.id == "sleeve")
    front = next(p for p in pieces if p.id == "front")
    back = next(p for p in pieces if p.id == "back")

    def edge(piece, label: str) -> float:
        for e in piece.seam_edges:
            if e["label"] == label:
                return polyline_length(e["points"]) / 10.0
        raise AssertionError(f"нет шва {label}")

    cap = next(e for e in sleeve.seam_edges if e["label"] == "окат")["points"]
    assert abs(cap[0].x) == pytest.approx(sleeve.bbox.width / 2.0, abs=0.5)
    assert _cap_length_of(sleeve) == pytest.approx(
        edge(front, "пройма") + edge(back, "пройма") + 0.5, abs=0.3
    )


def test_sleeve_cap_has_realistic_height():
    """Высота оката 8-14 см: плоский окат не держит плечо."""
    for gender in ("male", "female"):
        from app.core.sizes import default_row

        row = default_row("shirt", gender)
        pieces = build_draft("shirt", row["measurements"], {"gender": gender})
        sleeve = next(p for p in pieces if p.id == "sleeve")
        cap = next(e for e in sleeve.seam_edges if e["label"] == "окат")["points"]
        height = (cap[0].y - min(p.y for p in cap)) / 10.0
        assert 8.0 <= height <= 14.0


def test_sleeve_width_follows_biceps():
    """Ширина рукава задана обхватом бицепса, а не шириной проймы."""
    item = catalog_item("tee")
    m = item["default_measurements"]

    narrow = build_draft("tee", {**m, "biceps": 26}, {})
    wide = build_draft("tee", {**m, "biceps": 32}, {})
    w_narrow = next(p for p in narrow if p.id == "sleeve").bbox.width / 10.0
    w_wide = next(p for p in wide if p.id == "sleeve").bbox.width / 10.0

    assert w_wide - w_narrow == pytest.approx(6.0, abs=0.5)
    # Рукав не должен быть заметно шире руки.
    assert w_narrow < 40.0


def test_sleeve_cap_shrinks_when_armhole_shrinks():
    """Меньше обхват груди - меньше пройма - меньше окат."""
    item = catalog_item("tee")
    m = dict(item["default_measurements"])

    def cap_for(bust: float) -> float:
        pieces = build_draft("tee", {**m, "bust": bust}, {})
        return _cap_length_of(next(p for p in pieces if p.id == "sleeve"))

    assert cap_for(86.0) < cap_for(106.0)


def test_neckline_matches_neck_circumference():
    """Вырез горловины должен равняться обхвату шеи с прибавкой."""
    item = catalog_item("tee")
    m = item["default_measurements"]

    for neck in (36.0, 40.0, 44.0):
        pieces = build_draft("tee", {**m, "neck_circumference": neck}, {})
        front = next(p for p in pieces if p.id == "front")
        back = next(p for p in pieces if p.id == "back")

        def half_neck(piece) -> float:
            # Вырез идёт от центра переда к плечевому шву: это первые точки
            # контура, пока он не опустился до уровня плеча.
            points = []
            for point in piece.outline:
                points.append(point)
                if point.y <= 0.5:
                    break
            return polyline_length(points) / 10.0

        opening = 2.0 * (half_neck(front) + half_neck(back))
        assert opening == pytest.approx(neck + 2.0, abs=0.3)


def test_cap_solver_converges():
    """Подбор оката сходится: длина дуги равна заданной."""
    target = 50.0
    cap_half = 19.0
    rise = solve_cap_rise(cap_half, target)
    assert polyline_length(cap_curve(cap_half, rise)) == pytest.approx(target, abs=0.3)


@pytest.mark.parametrize("model", ["tee", "shirt", "coat", "jumper", "cardigan"])
def test_full_arm_deepens_the_armhole(model):
    """Полная рука: пройму опускают, рукав остаётся не уже бицепса."""
    from app.core.sizes import default_row

    m = default_row(model)["measurements"]
    base = build_draft(model, m, {})
    wide = build_draft(model, {**m, "biceps": 50}, {})

    def armhole(pieces) -> float:
        front = next(p for p in pieces if p.id == "front")
        edge = next(e for e in front.seam_edges if e["label"] == "пройма")["points"]
        return (edge[-1].y - edge[0].y) / 10.0

    sleeve = next(p for p in wide if p.id == "sleeve")
    assert armhole(wide) > armhole(base)
    assert sleeve.bbox.width / 10.0 >= 50.0
