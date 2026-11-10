"""Трикотажные кофты: свитшот, худи, джемпер.

Основа - конструкция футболки (``tee.build_knit_top``): ширина по груди с
прибавкой, пройма и втачной рукав под длину проймы, горловина под обхват
шеи. Кофты отличаются прибавками и притачными деталями из кулирки-ластика
(рибаны):

- пояс и манжеты: высота готовой детали 6-7 см, длина - 0,80-0,85 длины
  среза, к которому они притачиваются (Vykroyka, «объёмные худи»);
  изделие и рукав короче на высоту резинки, чтобы общая длина не менялась;
- бейка горловины свитшота и джемпера: длина 0,85 горловины, кроится
  вдвое;
- капюшон (Vikisews, «как построить капюшон»): линия притачивания равна
  половине горловины переда и спинки, высота - полудуга через макушку с
  прибавкой 3-10 см;
- карман-кенгуру худи: накладной, на переде над поясом, с косыми входами.

Прибавки по груди: свитшот 10 см (у Patterneasy 9,5), худи 14 см (13,5),
джемпер 6 см - тонкий трикотаж ближе к фигуре.
"""

from __future__ import annotations

from .buttons import mark_band
from ..core.geometry import Point, polyline_length
from .base import Piece, bezier, to_mm
from .common import build_piece, symmetric
from .tee import KnitStyle, KnitTop, build_knit_top

# Коэффициент длины резинки к длине среза: резинка тянется и собирает низ.
RIB_RATIO = 0.85
CUFF_RATIO = 0.8
NECKBAND_RATIO = 0.85
NECKBAND_WIDTH = 2.0
BUTTONBAND_WIDTH = 3.0
# Полудуга капюшона и обхват головы через рост (типовые пропорции фигуры).
HOOD_ARC_SHARE = 0.2
HEAD_GIRTH_SHARE = 0.33

SWEATSHIRT = KnitStyle(
    ease_bust=10.0, biceps_ease=6.0, cap_ease=1.0, hem_narrowing=4.0, drop_per_fit=4.0
)
HOODIE = KnitStyle(
    ease_bust=14.0, biceps_ease=8.0, cap_ease=1.0, hem_narrowing=5.0, drop_per_fit=5.0
)
JUMPER = KnitStyle(
    ease_bust=6.0, biceps_ease=4.0, cap_ease=0.5, hem_narrowing=4.0, drop_per_fit=3.0
)


def _with_bands(style: KnitStyle, band: float, cuff: float) -> KnitStyle:
    from dataclasses import replace

    return replace(style, body_band=band, sleeve_band=cuff)


def build_sweatshirt(measurements: dict, params: dict) -> list[Piece]:
    band, cuff = _bands(params, 6.5, 7.0)
    top = build_knit_top(measurements, params, _with_bands(SWEATSHIRT, band, cuff))
    return [*top.pieces, *_ribs(top, band, cuff, measurements), _neckband(top)]


def build_jumper(measurements: dict, params: dict) -> list[Piece]:
    band, cuff = _bands(params, 5.0, 5.0)
    top = build_knit_top(measurements, params, _with_bands(JUMPER, band, cuff))
    return [*top.pieces, *_ribs(top, band, cuff, measurements), _neckband(top)]


def build_cardigan(measurements: dict, params: dict) -> list[Piece]:
    """Кардиган: джемпер с застёжкой.

    Перед кроится двумя полочками по середине переда; борта и горловину
    обрабатывает одна притачная планка из резинки: она идёт от низа одной
    полочки через горловину спинки к низу другой и короче среза на 5 %,
    чтобы борт не растягивался.
    """
    band, cuff = _bands(params, 5.0, 5.0)
    neckline = str(params.get("neckline", "v"))
    top = build_knit_top(
        measurements, {**params, "neckline": neckline}, _with_bands(JUMPER, band, cuff)
    )
    front, back, sleeve = top.pieces
    half = _half_front(front)
    centre = next(e for e in front.seam_edges if e["label"] == "горловина")["points"][0]
    front_edge = (top.body_length * 10.0 - centre.y) / 10.0
    band_length = (
        2.0 * (front_edge + _edge_cm(front, "горловина")) + 2.0 * _edge_cm(back, "горловина")
    ) * 0.95
    buttonband = _rib("buttonband", "Планка борта", band_length, BUTTONBAND_WIDTH, 1)
    # Пять петель на участке планки вдоль борта: от 4 см над низом до начала
    # выреза (планка начинается у низа полочки).
    mark_band(
        buttonband,
        start=4.0,
        end=front_edge * 0.95 - 2.0,
        count=5,
        diameter=1.5,
        finished=BUTTONBAND_WIDTH,
    )
    return [half, back, sleeve, *_ribs(top, band, cuff, measurements), buttonband]


def _edge_cm(piece: Piece, label: str) -> float:
    return (
        polyline_length(next(e["points"] for e in piece.seam_edges if e["label"] == label)) / 10.0
    )


def _half_front(front: Piece) -> Piece:
    """Полочка: правая половина цельного переда, середина переда - край."""
    right = [p for p in front.outline if p.x >= -1e-6]
    outline = [*right, right[0]] if right[0] != right[-1] else right
    return build_piece(
        "front",
        "Полочка",
        outline,
        grainline=front.grainline,
        notches=front.notches,
        internal_lines=[line for line in front.internal_lines if line.get("type") != "fold"],
        cut=2,
        mirrored=True,
        girth_cm=front.girth_cm,
        seam_edges=front.seam_edges,
    )


def build_hoodie(measurements: dict, params: dict) -> list[Piece]:
    band, cuff = _bands(params, 7.0, 7.0)
    top = build_knit_top(
        measurements, {**params, "neckline": "crew"}, _with_bands(HOODIE, band, cuff)
    )
    hood_ease = float(params.get("hood_ease", 4.0))
    height = float(measurements["height"])
    pieces = [*top.pieces, *_ribs(top, band, cuff, measurements), _hood(top, height, hood_ease)]
    if str(params.get("pocket", "kangaroo")) == "kangaroo":
        pocket = _kangaroo(top, band)
        pieces.append(pocket)
        _mark_pocket(top.pieces[0], pocket, top.body_length)
    return pieces


def _bands(params: dict, band: float, cuff: float) -> tuple[float, float]:
    return float(params.get("band_width", band)), float(params.get("cuff_width", cuff))


def _rib(piece_id: str, name: str, length: float, finished: float, cut: int) -> Piece:
    """Резинка: прямоугольник, сложенный вдоль пополам (сгиб посередине)."""
    height = 2.0 * finished
    outline = [Point(0, 0), Point(length, 0), Point(length, height), Point(0, height), Point(0, 0)]
    return build_piece(
        piece_id,
        name,
        to_mm(outline),
        grainline=(Point(length * 5.0, 10.0), Point(length * 5.0, height * 10.0 - 10.0)),
        notches=[
            {"x": 0.0, "y": finished * 10.0, "label": "сгиб"},
            {"x": length * 5.0, "y": 0.0, "label": "середина"},
        ],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(0, finished), Point(length, finished)]),
                "label": "сгиб",
            }
        ],
        cut=cut,
        mirrored=False,
        seam_edges=[{"label": "притачивание", "points": to_mm([Point(0, 0), Point(length, 0)])}],
    )


def _ribs(top: KnitTop, band: float, cuff: float, measurements: dict) -> list[Piece]:
    # Манжета не уже запястья с запасом на кисть: обхват запястья около
    # 0,55 обхвата плеча.
    wrist = float(measurements["biceps"]) * 0.55 + 4.0
    return [
        _rib("waistband", "Пояс", top.hem_girth * RIB_RATIO, band, 1),
        _rib("cuff", "Манжета", max(top.sleeve_hem_girth * CUFF_RATIO, wrist), cuff, 2),
    ]


def _neckband(top: KnitTop) -> Piece:
    return _rib(
        "neckband", "Бейка горловины", top.neckline_length * NECKBAND_RATIO, NECKBAND_WIDTH, 1
    )


def _hood(top: KnitTop, height: float, ease: float) -> Piece:
    """Половина капюшона: кроится парой, шов посередине по голове.

    Раскладка: x вправо - от переднего края к затылку, y вниз - от макушки
    к шее. Линия притачивания - кривая внизу; её длина равна половине
    горловины (перед + спинка одной стороны).
    """
    join = top.neckline_length / 2.0
    hood_height = height * HOOD_ARC_SHARE + ease
    head = height * HEAD_GIRTH_SHARE
    width = max(head / 2.0 - 2.0 + ease / 2.0, join * 0.9)
    rise = 1.5

    def neck_curve(span: float) -> list[Point]:
        return bezier(
            (0.0, hood_height),
            (span * 0.45, hood_height + 0.8),
            (span * 0.85, hood_height - rise * 0.5),
            (span, hood_height - rise),
            segments=14,
        )

    low, high = join * 0.5, join
    for _ in range(50):
        mid = (low + high) / 2.0
        if polyline_length(neck_curve(mid)) < join:
            low = mid
        else:
            high = mid
    neck = neck_curve((low + high) / 2.0)
    back_bottom = neck[-1]
    crown = bezier(
        (width, hood_height * 0.35),
        (width, hood_height * 0.08),
        (width * 0.7, 0.0),
        (width * 0.35, 0.0),
        segments=12,
    )
    outline = [
        Point(0.0, 0.0),
        Point(0.0, hood_height),
        *neck[1:],
        # Затылочный шов: от шеи вверх к затылку с небольшим скосом.
        Point(width - 1.5, hood_height * 0.65),
        *crown,
        Point(0.0, 0.0),
    ]
    back_seam = [back_bottom, Point(width - 1.5, hood_height * 0.65), *crown]
    return build_piece(
        "hood",
        "Капюшон",
        to_mm(outline),
        grainline=(Point(width * 4.0, 30.0), Point(width * 4.0, (hood_height - 3.0) * 10.0)),
        notches=[
            {"x": back_bottom.x * 10.0, "y": back_bottom.y * 10.0, "label": "плечо"},
            {"x": 0.0, "y": hood_height * 10.0, "label": "середина переда"},
        ],
        internal_lines=[
            {
                "type": "stitch",
                "points": to_mm([Point(3.0, 0.0), Point(3.0, hood_height)]),
                "label": "кулиса",
            }
        ],
        cut=2,
        mirrored=True,
        seam_edges=[
            {"label": "горловина", "points": to_mm(neck)},
            {"label": "средний", "points": to_mm(back_seam)},
        ],
    )


def _kangaroo(top: KnitTop, band: float) -> Piece:
    """Карман-кенгуру: на переде, косые входы с боков."""
    front_half = top.hip_half
    bottom_half = front_half * 0.62
    top_half = front_half * 0.42
    depth = min(22.0, top.body_length * 0.3)
    opening = depth * 0.62
    right = [
        Point(0.0, 0.0),
        Point(top_half, 0.0),
        Point(bottom_half, opening),
        Point(bottom_half, depth),
        Point(0.0, depth),
    ]
    return build_piece(
        "pocket",
        "Карман",
        to_mm(symmetric(right)),
        grainline=(Point(0.0, 20.0), Point(0.0, (depth - 2.0) * 10.0)),
        notches=[{"x": bottom_half * 10.0, "y": opening * 10.0, "label": "вход"}],
        internal_lines=[
            {
                "type": "fold",
                "points": to_mm([Point(0.0, 0.0), Point(0.0, depth)]),
                "label": "середина",
            }
        ],
        cut=1,
        mirrored=False,
        seam_edges=[],
    )


def _mark_pocket(front: Piece, pocket: Piece, body_length: float) -> None:
    """Разметка кармана на переде: низ кармана - на 3 см выше пояса."""
    depth = pocket.bbox.height / 10.0
    bottom = body_length - 3.0
    top = bottom - depth
    pts = [Point(p.x / 10.0, p.y / 10.0 + top) for p in pocket.outline]
    front.internal_lines.append({"type": "stitch", "points": to_mm(pts), "label": "карман"})
