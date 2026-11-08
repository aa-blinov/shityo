"""Тесты экспорта лекал: SVG, DXF и PDF.

Детали строятся локально, без ``app.drafts``: так тесты экспорта не
зависят от черчения и проверяют именно формат вывода. Тесты, которым
нужны настоящие конструкции, помечены ``importorskip`` и выполняются,
когда модуль черчения доступен.
"""

import io
import re

import pytest

from app.core.geometry import Point
from app.drafts.base import Piece
from app.export.dxf import render_dxf
from app.export.pdf import render_pdf, render_pdf_page
from app.export.svg import render_svg, render_svg_pages


def rectangle(width: float, height: float, *, x: float = 0.0, y: float = 0.0) -> list[Point]:
    """Прямоугольный замкнутый контур детали (в мм)."""
    return [
        Point(x, y),
        Point(x + width, y),
        Point(x + width, y + height),
        Point(x, y + height),
        Point(x, y),
    ]


def make_piece(
    piece_id: str = "front",
    name: str = "Перед",
    *,
    width: float = 120.0,
    height: float = 150.0,
    seam_allowance: float = 10.0,
    cut: int = 1,
    grainline: tuple[Point, Point] | None = None,
    notches: list[dict] | None = None,
    internal_lines: list[dict] | None = None,
) -> Piece:
    """Деталь лекала с прямоугольным контуром."""
    if grainline is None:
        grainline = (Point(width / 2, height * 0.2), Point(width / 2, height * 0.8))
    return Piece(
        id=piece_id,
        name=name,
        outline=rectangle(width, height),
        seam_allowance=seam_allowance,
        notches=notches
        if notches is not None
        else [{"x": width, "y": height * 0.6, "label": "бок"}],
        grainline=grainline,
        internal_lines=internal_lines or [],
        mirrored=False,
        cut=cut,
    )


def sample_pieces() -> list[Piece]:
    """Две детали, которые обе помещаются на лист A4 landscape."""
    return [
        make_piece("front", "Перед", width=120.0, height=150.0),
        make_piece("sleeve", "Рукав", width=90.0, height=140.0, cut=2),
    ]


def svg_lines(svg: str, kind: str | None = None) -> list[tuple[float, float, float, float]]:
    """Координаты отрезков SVG, при необходимости только одного вида."""
    pattern = re.compile(
        r'<line class="(?P<kind>[a-z]+)" x1="([-\d.]+)" y1="([-\d.]+)" '
        r'x2="([-\d.]+)" y2="([-\d.]+)"'
    )
    result = []
    for match in pattern.finditer(svg):
        if kind is not None and match.group("kind") != kind:
            continue
        result.append(tuple(float(v) for v in match.groups()[1:]))
    return result


# --- SVG ------------------------------------------------------------------


def test_svg_is_standalone_with_millimetre_dimensions():
    svg = render_svg(sample_pieces(), page="A4", orientation="landscape")
    assert svg.lstrip().startswith("<?xml")
    assert svg.rstrip().endswith("</svg>")
    assert 'xmlns="http://www.w3.org/2000/svg"' in svg
    # A4 landscape: 297 x 210 мм, viewBox в тех же миллиметрах.
    assert 'width="297mm"' in svg
    assert 'height="210mm"' in svg
    assert 'viewBox="0 0 297 210"' in svg


def test_svg_portrait_page_swaps_dimensions():
    svg = render_svg(sample_pieces(), page="A4", orientation="portrait")
    assert 'width="210mm"' in svg
    assert 'height="297mm"' in svg
    assert 'viewBox="0 0 210 297"' in svg


def test_svg_a3_page_size():
    svg = render_svg(sample_pieces(), page="A3", orientation="landscape")
    assert 'width="420mm"' in svg
    assert 'height="297mm"' in svg


def test_svg_contains_cut_and_seam_lines_grainline_and_labels():
    svg = render_svg(sample_pieces(), title="Футболка")
    # контур детали и линия шва
    assert "<line" in svg
    assert "stroke-dasharray" in svg
    # подписи деталей и количество раскроя
    assert "Перед" in svg
    assert "Рукав" in svg
    assert "2 детали" in svg
    assert "Футболка" in svg


def test_svg_draws_notches_grainline_and_darts():
    piece = make_piece(
        internal_lines=[{"type": "dart", "points": [Point(10.0, 10.0), Point(40.0, 60.0)]}],
    )
    svg = render_svg([piece])
    assert svg_lines(svg, "grain"), "нет линии зерна"
    assert svg_lines(svg, "notch"), "нет надсечек"
    assert svg_lines(svg, "internal"), "нет вытачки"
    assert svg_lines(svg, "cut"), "нет контура раскроя"
    assert svg_lines(svg, "seam"), "нет линии шва"


def test_svg_grainline_has_arrow_heads():
    svg = render_svg([make_piece()])
    grain = svg_lines(svg, "grain")
    # линия зерна и два наконечника-стрелки
    assert len(grain) >= 3
    vertical = [line for line in grain if abs(line[0] - line[2]) < 1e-6]
    assert vertical, "нет вертикальной линии зерна"


def test_svg_keeps_notch_that_falls_on_the_tile_edge():
    """Надсечка у края листа не должна теряться: её режут на следующем листе."""
    piece = make_piece(
        width=300.0,
        height=400.0,
        notches=[{"x": 300.0, "y": 200.0, "label": "бок"}],
    )
    pages = render_svg_pages([piece], page="A4", orientation="landscape")
    assert len(pages) >= 2
    # надсечка должна встретиться хотя бы на одном листе
    assert any('class="notch"' in page for page in pages)


def test_svg_tiled_pages_carry_registration_marks():
    huge = make_piece(width=600.0, height=600.0)
    pages = render_svg_pages([huge], page="A4", orientation="landscape")
    assert len(pages) >= 2
    # метки совмещения: штриховые линии перекрытия и засечки по краю
    assert any('class="mark"' in page for page in pages)


def test_svg_single_sheet_shows_marks_of_every_piece():
    """Даже когда деталь больше листа, её надсечки и зерно должны быть на листе."""
    piece = make_piece(
        width=400.0,
        height=500.0,
        notches=[{"x": 400.0, "y": 250.0, "label": "бок"}],
    )
    svg = render_svg([piece])
    assert svg_lines(svg, "cut"), "нет контура раскроя"
    assert svg_lines(svg, "grain"), "нет линии зерна"
    assert svg_lines(svg, "notch"), "нет надсечек"
    assert svg_lines(svg, "mark"), "нет меток совмещения"


def test_svg_single_sheet_shows_every_piece():
    svg = render_svg(sample_pieces())
    assert "Перед" in svg
    assert "Рукав" in svg


def test_svg_seam_allowance_grows_cut_contour():
    piece = make_piece(width=100.0, height=150.0)
    tight = render_svg([piece], seam_allowance_mm=0.0)
    loose = render_svg([piece], seam_allowance_mm=20.0)

    def extent(svg: str) -> tuple[float, float]:
        xs: list[float] = []
        ys: list[float] = []
        for x1, y1, x2, y2 in svg_lines(svg, "cut"):
            xs.extend((x1, x2))
            ys.extend((y1, y2))
        return max(xs) - min(xs), max(ys) - min(ys)

    tight_w, tight_h = extent(tight)
    loose_w, loose_h = extent(loose)
    # припуск добавляется наружу с каждой стороны
    assert loose_w == pytest.approx(tight_w + 40.0, abs=0.5)
    assert loose_h == pytest.approx(tight_h + 40.0, abs=0.5)


def test_svg_pages_tiles_piece_that_exceeds_page():
    huge = make_piece(width=400.0, height=400.0)
    pages = render_svg_pages([huge], page="A4", orientation="landscape")
    assert len(pages) >= 2
    for page in pages:
        assert 'width="297mm"' in page
        assert 'height="210mm"' in page
    # на страницах есть метки совмещения плиток
    assert any('stroke-dasharray="3 2"' in page for page in pages)


def test_svg_is_valid_xml():
    from xml.etree import ElementTree

    svg = render_svg(sample_pieces(), title="Проверка")
    root = ElementTree.fromstring(svg)
    assert root.tag.endswith("svg")


# --- DXF ------------------------------------------------------------------


def test_dxf_parses_back_with_expected_layers():
    dxf = render_dxf(sample_pieces())
    ezdxf = pytest.importorskip("ezdxf")
    doc = ezdxf.read(io.StringIO(dxf.decode("cp1251")))
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert {"CUT", "SEAM", "GRAINLINE", "NOTCH", "LABEL"} <= layer_names


def test_dxf_header_declares_millimetres():
    ezdxf = pytest.importorskip("ezdxf")
    dxf = render_dxf(sample_pieces())
    doc = ezdxf.read(io.StringIO(dxf.decode("cp1251")))
    assert doc.header["$INSUNITS"] == 4
    # AC1015 (R2000) - формат, который читают обычные системы CAD
    assert doc.dxfversion == "AC1015"


def test_dxf_contains_geometry_per_layer():
    ezdxf = pytest.importorskip("ezdxf")
    dxf = render_dxf(sample_pieces())
    doc = ezdxf.read(io.StringIO(dxf.decode("cp1251")))
    msp = doc.modelspace()
    by_layer: dict[str, list] = {}
    for entity in msp:
        by_layer.setdefault(entity.dxf.layer, []).append(entity)
    assert by_layer.get("CUT"), "нет контуров раскроя"
    assert by_layer.get("SEAM"), "нет линий шва"
    assert by_layer.get("GRAINLINE"), "нет линий зерна"
    assert by_layer.get("NOTCH"), "нет надсечек"
    labels = [e for e in by_layer.get("LABEL", []) if e.dxftype() == "TEXT"]
    assert labels
    assert any("Перед" in e.dxf.text for e in labels)
    assert any("2 детали" in e.dxf.text for e in labels)


def test_dxf_is_readable_by_ezdxf_readfile(tmp_path):
    """ezdxf.readfile - то, как открывают DXF настоящие системы CAD."""
    ezdxf = pytest.importorskip("ezdxf")
    path = tmp_path / "pattern.dxf"
    path.write_bytes(render_dxf(sample_pieces()))
    doc = ezdxf.readfile(str(path))
    layer_names = {layer.dxf.name for layer in doc.layers}
    assert {"CUT", "SEAM", "GRAINLINE", "NOTCH", "LABEL"} <= layer_names
    assert doc.header["$INSUNITS"] == 4
    assert list(msp_entities := doc.modelspace())
    assert msp_entities


def test_dxf_keeps_cyrillic_labels_readable():
    ezdxf = pytest.importorskip("ezdxf")
    dxf = render_dxf(sample_pieces())
    doc = ezdxf.read(io.StringIO(dxf.decode("cp1251")))
    labels = [
        e.dxf.text for e in doc.modelspace() if e.dxftype() == "TEXT" and e.dxf.layer == "LABEL"
    ]
    assert any("Перед" in text for text in labels), labels


def test_dxf_cut_polyline_is_larger_than_seam_polyline():
    ezdxf = pytest.importorskip("ezdxf")
    dxf = render_dxf([make_piece(width=100.0, height=150.0)], seam_allowance_mm=15.0)
    doc = ezdxf.read(io.StringIO(dxf.decode("cp1251")))
    msp = doc.modelspace()
    cut = [e for e in msp if e.dxf.layer == "CUT" and e.dxftype() == "LWPOLYLINE"]
    seam = [e for e in msp if e.dxf.layer == "SEAM" and e.dxftype() == "LWPOLYLINE"]
    assert cut and seam

    def extent(polyline) -> tuple[float, float]:
        xs = [p[0] for p in polyline.get_points()]
        ys = [p[1] for p in polyline.get_points()]
        return max(xs) - min(xs), max(ys) - min(ys)

    cut_w, cut_h = extent(cut[0])
    seam_w, seam_h = extent(seam[0])
    assert cut_w == pytest.approx(seam_w + 30.0, abs=0.5)
    assert cut_h == pytest.approx(seam_h + 30.0, abs=0.5)


# --- PDF ------------------------------------------------------------------


def test_pdf_is_a_real_pdf():
    payload = render_pdf(sample_pieces())
    assert isinstance(payload, bytes)
    assert payload.startswith(b"%PDF")
    assert payload.rstrip().endswith(b"%%EOF")


def test_pdf_opens_and_has_a4_landscape_mediabox():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf(sample_pieces(), page="A4", orientation="landscape")
    reader = pypdf.PdfReader(io.BytesIO(payload))
    assert len(reader.pages) >= 1
    box = reader.pages[0].mediabox
    assert float(box.width) == pytest.approx(841.89, abs=0.1)
    assert float(box.height) == pytest.approx(595.28, abs=0.1)


def test_pdf_portrait_mediabox():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf(sample_pieces(), page="A4", orientation="portrait")
    reader = pypdf.PdfReader(io.BytesIO(payload))
    box = reader.pages[0].mediabox
    assert float(box.width) == pytest.approx(595.28, abs=0.1)
    assert float(box.height) == pytest.approx(841.89, abs=0.1)


def test_pdf_single_page_wrapper_has_one_page():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf_page(sample_pieces(), page="A4", orientation="landscape")
    reader = pypdf.PdfReader(io.BytesIO(payload))
    assert len(reader.pages) == 1
    box = reader.pages[0].mediabox
    assert float(box.width) == pytest.approx(841.89, abs=0.1)
    assert float(box.height) == pytest.approx(595.28, abs=0.1)


def test_pdf_extracts_piece_label():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf(sample_pieces())
    reader = pypdf.PdfReader(io.BytesIO(payload))
    text = reader.pages[0].extract_text()
    assert "Перед" in text
    assert "2 детали" in text


def test_pdf_single_page_carries_piece_labels():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf_page(sample_pieces())
    reader = pypdf.PdfReader(io.BytesIO(payload))
    text = reader.pages[0].extract_text()
    assert "Перед" in text
    assert "Рукав" in text


def test_pdf_page_count_grows_for_oversized_piece():
    pypdf = pytest.importorskip("pypdf")
    payload = render_pdf([make_piece(width=500.0, height=500.0)])
    reader = pypdf.PdfReader(io.BytesIO(payload))
    assert len(reader.pages) >= 2


# --- На настоящих конструкциях ------------------------------------------


def test_export_of_drafted_tee():
    drafts = pytest.importorskip("app.drafts")
    pieces = drafts.build_draft(
        "tee",
        {
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
        },
        {},
    )
    assert pieces
    svg = render_svg(pieces)
    assert "Перед" in svg
    dxf = render_dxf(pieces)
    assert dxf.lstrip().startswith(b"0")
    pdf = render_pdf(pieces)
    assert pdf.startswith(b"%PDF")
