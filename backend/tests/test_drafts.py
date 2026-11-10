"""Тесты параметрических конструкций: детали, мерки, инварианты, размерная сетка.

Геометрия деталей хранится в миллиметрах, мерки - в сантиметрах, поэтому
сравнения ширин и длин идут через ``cm()``.
"""

import pytest

from app.drafts import CATALOG, build_draft
from app.drafts.base import DraftError
from app.core.geometry import polygon_area

TEE_MEASUREMENTS = {
    "bust": 96,
    "waist": 84,
    "hip": 98,
    "height": 176,
    "shoulder_width": 46,
    "shoulder_slope": 13,
    "neck_to_waist": 44,
    "waist_to_armpit": 22,
    "waist_to_hip": 20,
    "biceps": 32,
    "back_length": 72,
    "sleeve_length": 62,
    "neck_circumference": 40,
}


def cm(value_mm: float) -> float:
    return value_mm / 10.0


def test_catalog_contains_expected_models():
    ids = {item["id"] for item in CATALOG}
    assert {"tee", "trousers", "skirt", "shirt", "dress", "vest", "coat"} <= ids


DRESS_MEASUREMENTS = {
    "half_bust": 46,
    "half_waist": 36,
    "half_hip": 50,
    "half_neck": 18,
    "back_waist_length": 42,
    "front_waist_length": 44,
    "shoulder_length": 13,
    "bust_height": 25,
    "bust_center": 18,
    "armhole_depth": 21,
    "garment_length": 100,
    "waist_to_hip": 18,
}


def test_every_catalog_model_builds_with_default_measurements():
    for item in CATALOG:
        pieces = build_draft(item["id"], item["default_measurements"], {})
        assert pieces, f"{item['id']} не дал деталей"
        for piece in pieces:
            assert len(piece.outline) >= 3
            assert piece.bbox.width > 0
            assert piece.bbox.height > 0


def test_tee_has_three_pieces():
    pieces = build_draft("tee", TEE_MEASUREMENTS, {})
    ids = {p.id for p in pieces}
    assert ids == {"front", "back", "sleeve"}


def test_tee_front_width_follows_bust_plus_ease():
    """Полная ширина панели переда = (обхват груди + прибавка) / 2.

    Перед и спинка вместе дают обхват с прибавкой (проверяется отдельно
    в test_girth.py). Ширина меряется на уровне груди: низ изделия может
    быть шире, если бёдра шире груди.
    """
    from app.core.geometry import width_at_y
    from app.drafts.common import cervical_rise

    # Мерки по спинке - от седьмого шейного позвонка, чертёж - от плечевой
    # точки горловины, она выше на подъём горловины.
    rise = cervical_rise(TEE_MEASUREMENTS["neck_circumference"] / 2.0)
    tight = build_draft("tee", TEE_MEASUREMENTS, {"ease_bust": 8})
    loose = build_draft("tee", TEE_MEASUREMENTS, {"ease_bust": 28})
    w_tight = (
        width_at_y(
            next(p for p in tight if p.id == "front").outline,
            (TEE_MEASUREMENTS["neck_to_waist"] - TEE_MEASUREMENTS["waist_to_armpit"] * 0.955 + rise)
            * 10,
            tolerance=0.01,
        )
        / 10.0
    )
    w_loose = (
        width_at_y(
            next(p for p in loose if p.id == "front").outline,
            (TEE_MEASUREMENTS["neck_to_waist"] - TEE_MEASUREMENTS["waist_to_armpit"] * 0.955 + rise)
            * 10,
            tolerance=0.01,
        )
        / 10.0
    )
    assert w_loose > w_tight
    assert w_tight == pytest.approx((TEE_MEASUREMENTS["bust"] + 8) / 2.0, rel=0.02)


def test_tee_length_param_changes_height():
    short = build_draft("tee", TEE_MEASUREMENTS, {"length_delta": -10})
    base = build_draft("tee", TEE_MEASUREMENTS, {})
    h_short = cm(next(p for p in short if p.id == "back").bbox.height)
    h_base = cm(next(p for p in base if p.id == "back").bbox.height)
    assert h_short == pytest.approx(h_base - 10, rel=0.02)


def test_editor_overrides_move_the_shoulder_point():
    """Редактор двигает плечевую точку, и чертёж строится по ней.

    Точка задаётся в сантиметрах от сгиба, как и мерки.
    """
    base = build_draft("tee", TEE_MEASUREMENTS, {})
    moved = build_draft("tee", TEE_MEASUREMENTS, {"overrides": {"shoulder_tip_x": 20.0}})

    def shoulder_x(pieces) -> float:
        front = next(p for p in pieces if p.id == "front")
        edge = next(e for e in front.seam_edges if e["label"] == "плечо")
        return cm(edge["points"][-1].x)

    assert shoulder_x(moved) == pytest.approx(20.0, abs=0.05)
    assert shoulder_x(moved) < shoulder_x(base)


def test_editor_overrides_change_the_armhole_depth():
    """Глубина проймы из редактора меняет длину цепи проймы."""
    base = build_draft("tee", TEE_MEASUREMENTS, {})
    deep = build_draft("tee", TEE_MEASUREMENTS, {"overrides": {"armhole_depth": 33.0}})

    def chain(pieces) -> float:
        front = next(p for p in pieces if p.id == "front")
        edge = next(e for e in front.seam_edges if e["label"] == "пройма")
        pts = edge["points"]
        return sum(
            ((pts[i + 1].x - pts[i].x) ** 2 + (pts[i + 1].y - pts[i].y) ** 2) ** 0.5
            for i in range(len(pts) - 1)
        )

    assert chain(deep) > chain(base) + 20.0


def test_sleeve_length_param_changes_sleeve():
    """Длина рукава задаётся параметром, а не берётся из мерки.

    Длина рукава считается от вершины оката, поэтому высота детали равна
    заданной длине.
    """
    short = build_draft("longsleeve", TEE_MEASUREMENTS, {"sleeve_length": 40})
    long = build_draft("longsleeve", TEE_MEASUREMENTS, {"sleeve_length": 60})
    h_short = cm(next(p for p in short if p.id == "sleeve").bbox.height)
    h_long = cm(next(p for p in long if p.id == "sleeve").bbox.height)
    assert h_long - h_short == pytest.approx(20.0, rel=0.05)
    assert h_short == pytest.approx(40.0, abs=0.1)


def test_tee_has_short_sleeve_and_longsleeve_follows_the_arm():
    """Футболка - с коротким рукавом, лонгслив - с рукавом по мерке руки.

    Короткий рукав задаётся своим параметром: «Длина рукава» - заодно мерка
    руки, по ней в 3D строится рука манекена, и 20 см там укоротили бы руку.
    """
    sleeve = lambda pieces: cm(next(p for p in pieces if p.id == "sleeve").bbox.height)  # noqa: E731
    tee = build_draft("tee", TEE_MEASUREMENTS, {})
    assert sleeve(tee) == pytest.approx(20.0, abs=0.1)
    custom = build_draft("tee", TEE_MEASUREMENTS, {"short_sleeve_length": 28})
    assert sleeve(custom) == pytest.approx(28.0, abs=0.1)
    # Мерка руки футболку не меняет.
    longer_arm = build_draft("tee", {**TEE_MEASUREMENTS, "sleeve_length": 70}, {})
    assert sleeve(longer_arm) == pytest.approx(20.0, abs=0.1)
    longsleeve = build_draft("longsleeve", TEE_MEASUREMENTS, {})
    assert sleeve(longsleeve) == pytest.approx(TEE_MEASUREMENTS["sleeve_length"], abs=0.1)
    # Корпус у них один.
    assert [p.outline for p in tee[:2]] == [p.outline for p in longsleeve[:2]]


def test_neckline_variants_differ():
    crew = build_draft("tee", TEE_MEASUREMENTS, {"neckline": "crew"})
    v = build_draft("tee", TEE_MEASUREMENTS, {"neckline": "v"})
    crew_front = next(p for p in crew if p.id == "front")
    v_front = next(p for p in v if p.id == "front")
    # У V-образной горловины вырез глубже, поэтому контур отличается.
    assert crew_front.outline != v_front.outline
    assert abs(crew_front.area - v_front.area) > 100


def test_trousers_pieces_and_waist_width():
    m = {
        "waist": 84,
        "hip": 96,
        "height": 176,
        "crotch_depth": 30,
        "inseam_length": 78,
        "knee_length": 45,
        "knee_circumference": 58,
    }
    pieces = build_draft("trousers", m, {})
    ids = {p.id for p in pieces}
    # Пояс у всех брюк, гульфик - у мужских (пол по умолчанию).
    assert ids == {"front", "back", "waistband", "fly"}
    front = next(p for p in pieces if p.id == "front")
    back = next(p for p in pieces if p.id == "back")
    # Половинка штанины закрывает часть обхвата талии: баланс перед/зад
    # около 43/57 в пользу спинки.
    # Ширина меряется на уровне пояса: ниже штанина шире, поэтому габарит
    # детали про обхват ничего не говорит.
    from app.core.geometry import width_at_y

    waist_front = width_at_y(front.outline, 0.0, tolerance=2.0) / 10.0
    waist_back = width_at_y(back.outline, 0.0, tolerance=2.0) / 10.0
    expected_total = (m["waist"] + 8.0) / 2.0
    assert waist_front + waist_back == pytest.approx(expected_total, rel=0.02)
    # Задняя штанина шире передней: ягодицы требуют этого баланса.
    assert waist_back > waist_front


def test_trousers_width_grows_with_waist():
    from app.core.geometry import width_at_y

    m = {
        "waist": 84,
        "hip": 96,
        "height": 176,
        "crotch_depth": 30,
        "inseam_length": 78,
        "knee_length": 45,
        "knee_circumference": 58,
    }
    narrow = build_draft("trousers", m, {})
    wide = build_draft("trousers", {**m, "waist": 96}, {})
    w_narrow = (
        width_at_y(next(p for p in narrow if p.id == "front").outline, 0.0, tolerance=2.0) / 10.0
    )
    w_wide = width_at_y(next(p for p in wide if p.id == "front").outline, 0.0, tolerance=2.0) / 10.0
    assert w_wide > w_narrow


def test_skirt_piece_and_flare_param():
    m = {
        "waist": 70,
        "hip": 94,
        "height": 168,
        "waist_to_hip": 19,
        "skirt_length": 55,
    }
    pieces = build_draft("skirt", m, {})
    assert {p.id for p in pieces} == {"front", "back", "waistband"}
    # Вытачки есть у обеих деталей, у спинки глубже.
    darts = {p.id: [line for line in p.internal_lines if line["type"] == "dart"] for p in pieces}

    def intake(line) -> float:
        return cm(line["points"][2].x - line["points"][0].x)

    assert darts["front"] and darts["back"]
    assert intake(darts["back"][0]) > intake(darts["front"][0])
    # Расклешение задаётся долей от длины изделия.
    narrow = build_draft("skirt", m, {"flare_ratio": 0.0})
    wide = build_draft("skirt", m, {"flare_ratio": 0.3})
    w_narrow = cm(next(p for p in narrow if p.id == "front").bbox.width)
    w_wide = cm(next(p for p in wide if p.id == "front").bbox.width)
    assert w_wide > w_narrow


def test_shirt_has_collar_and_body_pieces():
    m = {
        "bust": 100,
        "waist": 88,
        "hip": 102,
        "height": 180,
        "shoulder_width": 48,
        "shoulder_slope": 13,
        "neck_to_waist": 46,
        "waist_to_armpit": 23,
        "waist_to_hip": 20,
        "biceps": 33,
        "back_length": 76,
        "sleeve_length": 64,
        "neck_circumference": 42,
    }
    pieces = build_draft("shirt", m, {})
    ids = {p.id for p in pieces}
    assert "collar" in ids
    assert "front" in ids and "back" in ids and "sleeve" in ids


def test_shirt_dart_follows_chest_waist_difference():
    """Глубина вытачки считается из разности обхватов груди и талии.

    Константа по посадке дала бы лишнюю вытачку на худой фигуре и
    недостающую на полной.
    """
    base = {
        "bust": 100,
        "waist": 88,
        "hip": 102,
        "height": 180,
        "shoulder_width": 48,
        "shoulder_slope": 13,
        "neck_to_waist": 46,
        "waist_to_armpit": 23,
        "waist_to_hip": 20,
        "biceps": 33,
        "back_length": 76,
        "sleeve_length": 64,
        "neck_circumference": 42,
    }

    def dart_depth(waist: float) -> float:
        pieces = build_draft("shirt", {**base, "waist": waist}, {})
        front = next(p for p in pieces if p.id == "front")
        darts = [line for line in front.internal_lines if line["type"] == "dart"]
        assert darts, "вытачка не построена"
        points = darts[0]["points"]
        return abs(points[0].x - points[2].x) / 10.0

    assert dart_depth(70.0) > dart_depth(95.0)


def test_dress_has_front_and_back_pieces():
    pieces = build_draft("dress", DRESS_MEASUREMENTS, {})
    ids = {p.id for p in pieces}
    assert ids == {"front", "back"}


def test_dress_front_width_follows_half_bust_plus_ease():
    """Перед закрывает половину обхвата груди с прибавкой к полному обхвату.

    Прибавка задаётся к полному обхвату, как в остальных моделях: на перед
    приходится её половина.
    """
    for ease in (0.0, 8.0):
        pieces = build_draft("dress", DRESS_MEASUREMENTS, {"ease_bust": ease})
        front = next(p for p in pieces if p.id == "front")
        assert front.girth_cm == pytest.approx(
            DRESS_MEASUREMENTS["half_bust"] + ease / 2.0, abs=0.05
        )


def test_dress_length_param_changes_height():
    short = build_draft("dress", DRESS_MEASUREMENTS, {"length_delta": -10})
    base = build_draft("dress", DRESS_MEASUREMENTS, {})
    h_short = cm(next(p for p in short if p.id == "back").bbox.height)
    h_base = cm(next(p for p in base if p.id == "back").bbox.height)
    assert h_short == pytest.approx(h_base - 10, rel=0.02)


def test_dress_dart_grows_with_bust_waist_difference():
    """Чем больше разница между полуобхватами груди и талии, тем глубже вытачка."""
    small_diff = build_draft("dress", {**DRESS_MEASUREMENTS, "half_waist": 42}, {})
    large_diff = build_draft("dress", {**DRESS_MEASUREMENTS, "half_waist": 32}, {})
    front_small = next(p for p in small_diff if p.id == "front")
    front_large = next(p for p in large_diff if p.id == "front")
    assert front_large.area < front_small.area


VEST_MEASUREMENTS = {
    "half_bust": 48,
    "half_waist": 38,
    "half_hip": 50,
    "half_neck": 18,
    "back_waist_length": 42,
    "front_waist_length": 44,
    "shoulder_length": 13,
    "bust_height": 25,
    "bust_center": 18,
    "armhole_depth": 23,
    "waist_to_hip": 18,
}


def test_vest_has_front_and_back_pieces():
    pieces = build_draft("vest", VEST_MEASUREMENTS, {})
    ids = {p.id for p in pieces}
    assert ids == {"front", "back"}


def test_vest_front_width_follows_half_bust_plus_ease():
    """Перед закрывает половину обхвата груди с прибавкой к полному обхвату.

    Прибавка задаётся к полному обхвату, как в остальных моделях: на перед
    приходится её половина.
    """
    for ease in (0.0, 8.0):
        pieces = build_draft("vest", VEST_MEASUREMENTS, {"ease_bust": ease})
        front = next(p for p in pieces if p.id == "front")
        assert front.girth_cm == pytest.approx(
            VEST_MEASUREMENTS["half_bust"] + ease / 2.0, abs=0.05
        )


def test_vest_length_param_changes_height():
    short = build_draft("vest", VEST_MEASUREMENTS, {"length_delta": -5})
    base = build_draft("vest", VEST_MEASUREMENTS, {})
    h_short = cm(next(p for p in short if p.id == "back").bbox.height)
    h_base = cm(next(p for p in base if p.id == "back").bbox.height)
    assert h_short == pytest.approx(h_base - 5, rel=0.02)


def test_vest_neck_drop_changes_front_outline():
    """Глубина горловины должна менять перед."""
    shallow = build_draft("vest", VEST_MEASUREMENTS, {"neck_drop": 10})
    deep = build_draft("vest", VEST_MEASUREMENTS, {"neck_drop": 25})
    front_shallow = next(p for p in shallow if p.id == "front")
    front_deep = next(p for p in deep if p.id == "front")
    assert front_shallow.outline != front_deep.outline


COAT_MEASUREMENTS = {
    "half_bust": 50,
    "half_waist": 40,
    "half_hip": 52,
    "half_neck": 18.5,
    "back_waist_length": 43,
    "front_waist_length": 45,
    "shoulder_length": 13.5,
    "bust_height": 25,
    "bust_center": 18,
    "armhole_depth": 22,
    "garment_length": 100,
    "waist_to_hip": 18,
    "sleeve_length": 64,
    "biceps": 34,
}


def test_coat_has_expected_pieces():
    pieces = build_draft("coat", COAT_MEASUREMENTS, {})
    ids = {p.id for p in pieces}
    # Полочка с лацканом: подборт - отдельная деталь.
    assert ids == {"front", "back", "sleeve", "collar", "facing"}


def test_coat_width_follows_half_bust_plus_ease():
    """Перед закрывает половину обхвата груди с прибавкой к полному обхвату.

    Прибавка задаётся к полному обхвату, как в остальных моделях: на перед
    приходится её половина.
    """
    for ease in (0.0, 12.0):
        pieces = build_draft("coat", COAT_MEASUREMENTS, {"ease_bust": ease})
        front = next(p for p in pieces if p.id == "front")
        assert front.girth_cm == pytest.approx(
            COAT_MEASUREMENTS["half_bust"] + ease / 2.0, abs=0.05
        )


def test_coat_length_param_changes_height():
    short = build_draft("coat", COAT_MEASUREMENTS, {"length_delta": -10})
    base = build_draft("coat", COAT_MEASUREMENTS, {})
    h_short = cm(next(p for p in short if p.id == "back").bbox.height)
    h_base = cm(next(p for p in base if p.id == "back").bbox.height)
    assert h_short == pytest.approx(h_base - 10, rel=0.02)


def test_coat_sleeve_length_param_changes_sleeve():
    short = build_draft("coat", COAT_MEASUREMENTS, {"sleeve_length": 50})
    base = build_draft("coat", COAT_MEASUREMENTS, {})
    sleeve_short = next(p for p in short if p.id == "sleeve").bbox.height
    sleeve_base = next(p for p in base if p.id == "sleeve").bbox.height
    assert sleeve_short < sleeve_base


def test_unknown_model_raises():
    with pytest.raises(DraftError):
        build_draft("does-not-exist", {}, {})


def test_missing_measurement_raises():
    with pytest.raises(DraftError):
        build_draft("tee", {"bust": 96}, {})


def test_outline_is_closed_and_non_empty():
    for item in CATALOG:
        for piece in build_draft(item["id"], item["default_measurements"], {}):
            outline = piece.outline
            assert outline[0].distance_to(outline[-1]) < 0.51, (
                f"{item['id']}/{piece.id}: контур не замкнут"
            )
            area = abs(polygon_area(outline))
            assert area > 1000, f"{item['id']}/{piece.id}: пустая деталь"


def test_pieces_have_grainline_and_seam_allowance():
    for item in CATALOG:
        for piece in build_draft(item["id"], item["default_measurements"], {}):
            assert piece.grainline is not None
            assert piece.seam_allowance > 0
            assert piece.grainline_length() > 0


def test_tee_shoulder_width_changes_shoulder():
    """Ширина плеча обязана влиять на чертёж, иначе мерка вводится впустую."""
    narrow = build_draft("tee", {**TEE_MEASUREMENTS, "shoulder_width": 40}, {})
    wide = build_draft("tee", {**TEE_MEASUREMENTS, "shoulder_width": 50}, {})
    n = next(p for p in narrow if p.id == "front")
    w = next(p for p in wide if p.id == "front")
    assert w.outline != n.outline


def test_tee_waist_changes_side_seam():
    """Обхват талии обязана влиять на линию бока."""
    narrow = build_draft("tee", {**TEE_MEASUREMENTS, "waist": 70}, {})
    wide = build_draft("tee", {**TEE_MEASUREMENTS, "waist": 100}, {})
    n = next(p for p in narrow if p.id == "front")
    w = next(p for p in wide if p.id == "front")
    assert n.outline != w.outline


def test_every_measurement_changes_the_drawing():
    """Ни одна мерка не должна оставаться декоративной.

    Мерка, которая не меняет чертёж, вводит пользователя в заблуждение:
    он правит посадку и не видит результата.

    Рост (и мерка руки у футболки с коротким рукавом) - исключение: в
    конструкции он не участвует, потому что все
    вертикальные размеры берутся из своих мерок («от шеи до талии»,
    «от талии до подмышки»). Рост нужен для манекена в 3D, но не для кроя.

    Талия у трикотажного верха влияет, только когда она шире почти прямого
    бока (живот): обычная талия бок не сужает. Поэтому для неё проверяется
    полная фигура - талия на 10 см больше груди.
    """
    for item in CATALOG:
        for key in item["measurements"]:
            if key == "height":
                continue
            # Рукав футболки короткий и задаётся своим параметром; мерка
            # руки нужна ей, как рост, только для манекена в 3D.
            if item["id"] == "tee" and key == "sleeve_length":
                continue
            base = dict(item["default_measurements"])
            changed = dict(base)
            changed[key] = base[key] * 1.15 + 1
            if key == "waist" and "bust" in base:
                changed[key] = base["bust"] + 10
            first = build_draft(item["id"], base, {})
            second = build_draft(item["id"], changed, {})
            assert [p.outline for p in first] != [p.outline for p in second], (
                f"{item['id']}: мерка {key} не влияет на чертёж"
            )


def test_size_grid_generates_valid_patterns():
    from app.core.sizes import SIZE_GRIDS

    for model_id, grid in SIZE_GRIDS.items():
        for size_row in grid:
            pieces = build_draft(model_id, size_row["measurements"], {})
            assert pieces


def test_generation_is_deterministic():
    """Один и тот же вход обязан давать один и тот же чертёж.

    Это ключевое свойство движка: никаких случайностей и никакого ИИ в
    контуре построения.
    """
    for item in CATALOG:
        first = build_draft(item["id"], item["default_measurements"], {})
        second = build_draft(item["id"], item["default_measurements"], {})
        assert len(first) == len(second)
        for a, b in zip(first, second):
            assert a.id == b.id
            assert a.outline == b.outline
            assert a.area == pytest.approx(b.area)
