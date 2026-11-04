"""PDF export of pattern pieces.

ReportLab (BSD) draws the sheets; the layout itself comes from
``export/layout.py``, which knows nothing about PDF.

The page size is given in points so that a sheet is printed at 1:1: A4
landscape becomes a MediaBox of 841.89 x 595.28 points.

Standard PDF fonts carry no Cyrillic glyphs and the labels of the pieces are
in Russian, so a TrueType font with Cyrillic coverage is embedded. If the
system has no such font, the labels fall back to a transliteration instead of
printing as empty boxes.
"""

from __future__ import annotations

import io
import os

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfdoc import ViewerPreferencesPDFDictionary
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from .layout import Page, build_page, print_pages

# PDF user space unit is 1/72 inch, so one millimetre is 72/25.4 points.
MM_TO_PT = 72.0 / 25.4

STROKE_WIDTHS_MM = {
    "cut": 0.35,
    "seam": 0.2,
    "grain": 0.25,
    "notch": 0.3,
    "internal": 0.2,
    "mark": 0.2,
}

STROKE_COLORS = {
    "cut": (0.0, 0.0, 0.0),
    "seam": (0.0, 0.0, 0.0),
    "grain": (0.0, 0.0, 0.0),
    "notch": (0.0, 0.0, 0.0),
    "internal": (0.4, 0.4, 0.4),
    "mark": (0.6, 0.6, 0.6),
}

# Dash patterns in points, matching the SVG ones.
DASH_PATTERNS = {
    "seam": (2.0, 1.5),
    "internal": (1.5, 1.5),
    "mark": (3.0, 2.0),
}

FONT_NAME = "PatternSans"
FONT_NAME_BOLD = "PatternSans-Bold"
FALLBACK_FONT = "Helvetica"
FALLBACK_FONT_BOLD = "Helvetica-Bold"

# Font files with Cyrillic coverage, in order of preference.
# The vendored DejaVu Sans comes first: it travels with the repository, so the
# labels stay readable on Linux and in CI, where no system font with
# Cyrillic coverage may exist. The system fonts follow as a fallback.
_VENDORED_FONT = os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans.ttf")

FONT_CANDIDATES: tuple[tuple[str, str], ...] = (
    (_VENDORED_FONT, _VENDORED_FONT),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("C:/Windows/Fonts/verdana.ttf", "C:/Windows/Fonts/verdanab.ttf"),
    ("C:/Windows/Fonts/tahoma.ttf", "C:/Windows/Fonts/tahomabd.ttf"),
    ("C:/Windows/Fonts/times.ttf", "C:/Windows/Fonts/timesbd.ttf"),
)

# Cyrillic to Latin transliteration for the case when no TrueType font with
# Cyrillic coverage exists: the label must stay readable on paper.
_TRANSLIT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
    "А": "A",
    "Б": "B",
    "В": "V",
    "Г": "G",
    "Д": "D",
    "Е": "E",
    "Ё": "E",
    "Ж": "Zh",
    "З": "Z",
    "И": "I",
    "Й": "Y",
    "К": "K",
    "Л": "L",
    "М": "M",
    "Н": "N",
    "О": "O",
    "П": "P",
    "Р": "R",
    "С": "S",
    "Т": "T",
    "У": "U",
    "Ф": "F",
    "Х": "H",
    "Ц": "Ts",
    "Ч": "Ch",
    "Ш": "Sh",
    "Щ": "Sch",
    "Ъ": "",
    "Ы": "Y",
    "Ь": "",
    "Э": "E",
    "Ю": "Yu",
    "Я": "Ya",
}


def transliterate(text: str) -> str:
    """Latin transliteration of a Cyrillic label."""
    return "".join(_TRANSLIT.get(ch, ch) for ch in text)


def _to_pt(value: float) -> float:
    return value * MM_TO_PT


def _register_fonts() -> tuple[str, str]:
    """Register a TrueType font pair with Cyrillic support.

    Returns the names of the regular and bold fonts to use. If no usable font
    file is found, the built-in Helvetica is used and the labels are
    transliterated, because Helvetica has no Cyrillic glyphs and would print
    the labels as empty boxes.
    """
    for regular, bold in FONT_CANDIDATES:
        if not os.path.exists(regular):
            continue
        try:
            pdfmetrics.registerFont(TTFont(FONT_NAME, regular))
            if os.path.exists(bold):
                pdfmetrics.registerFont(TTFont(FONT_NAME_BOLD, bold))
            else:
                pdfmetrics.registerFont(TTFont(FONT_NAME_BOLD, regular))
        except Exception:  # broken or unsupported font file
            continue
        return FONT_NAME, FONT_NAME_BOLD
    return FALLBACK_FONT, FALLBACK_FONT_BOLD


def _draw_page(
    canvas_obj: canvas.Canvas,
    sheet: Page,
    fonts: tuple[str, str],
    transliterate_labels: bool,
) -> None:
    """Draw one sheet of primitives onto a PDF page."""
    height = sheet.height

    def flip(point: tuple[float, float]) -> tuple[float, float]:
        # Layout uses Y downwards, PDF user space uses Y upwards.
        return (_to_pt(point[0]), _to_pt(height - point[1]))

    groups: dict[tuple, list] = {}
    for segment in sheet.segments:
        groups.setdefault((segment.kind, segment.dash), []).append(segment)

    for (kind, dash), segments in groups.items():
        color = STROKE_COLORS.get(kind, (0.0, 0.0, 0.0))
        canvas_obj.setStrokeColorRGB(*color)
        canvas_obj.setLineWidth(_to_pt(STROKE_WIDTHS_MM.get(kind, 0.25)))
        if dash and kind in DASH_PATTERNS:
            canvas_obj.setDash(list(DASH_PATTERNS[kind]))
        else:
            canvas_obj.setDash([])
        for segment in segments:
            (x1, y1) = flip(segment.p0)
            (x2, y2) = flip(segment.p1)
            canvas_obj.line(x1, y1, x2, y2)
    canvas_obj.setDash([])

    canvas_obj.setFillColorRGB(0.0, 0.0, 0.0)
    for text in sheet.texts:
        content = text.content
        if transliterate_labels:
            content = transliterate(content)
        font_name = fonts[1] if text.bold else fonts[0]
        canvas_obj.setFont(font_name, _to_pt(text.size))
        point = flip((text.x, text.y))
        if text.anchor == "middle":
            canvas_obj.drawCentredString(*point, content)
        elif text.anchor == "end":
            canvas_obj.drawRightString(*point, content)
        else:
            canvas_obj.drawString(*point, content)


def render_pdf(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
    calibration: bool = False,
) -> bytes:
    """Render pattern pieces to a PDF document with millimetre user space.

    Every sheet of the layout becomes a page of the document.
    """
    sheets = print_pages(
        pieces,
        page=page,
        orientation=orientation,
        seam_allowance_mm=seam_allowance_mm,
        calibration=calibration,
    )

    fonts = _register_fonts()
    # Helvetica has no Cyrillic glyphs, so the labels have to be transliterated.
    transliterate_labels = fonts[0] == FALLBACK_FONT

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(MM_TO_PT * 297.0, MM_TO_PT * 210.0))
    for sheet in sheets:
        pdf.setPageSize((_to_pt(sheet.width), _to_pt(sheet.height)))
        _draw_page(pdf, sheet, fonts, transliterate_labels)
        pdf.showPage()
    pdf._doc.Catalog.ViewerPreferences = ViewerPreferencesPDFDictionary()
    pdf._doc.Catalog.ViewerPreferences["PrintScaling"] = "None"
    pdf.save()
    return buffer.getvalue()


def render_pdf_page(
    pieces,
    *,
    page: str = "A4",
    orientation: str = "landscape",
    seam_allowance_mm: float | None = None,
) -> bytes:
    """Render the pieces as a one-page PDF.

    The pieces share the sheet; a piece that does not fit is cut off at the
    cell edge, and the cut is marked with a registration tick.
    """
    sheet = build_page(
        pieces,
        page=page,
        orientation=orientation,
        seam_allowance_mm=seam_allowance_mm,
    )

    fonts = _register_fonts()
    transliterate_labels = fonts[0] == FALLBACK_FONT

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(_to_pt(sheet.width), _to_pt(sheet.height)))
    _draw_page(pdf, sheet, fonts, transliterate_labels)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
