"""Таблица сечений торса манекена из базовой модели MakeHuman.

Модель MakeHuman (base.obj и морфы caucasian-female-young /
caucasian-male-young) распространяется под CC0:
https://github.com/makehumancommunity/makehuman (makehuman/data).
Файлы модели в репозиторий не кладутся; скрипт читает их из папки,
указанной первым аргументом, и пишет frontend/src/lib/cloth/mannequin.json.

Торс режется горизонтальными срезами от шага до шеи. В каждом срезе из
центра выпускаются лучи; радиус - первое пересечение луча с поверхностью
тела. Руки отсекаются: ниже подмышки они - отдельный контур, который луч
из центра не достаёт, выше - вертикальной плоскостью у плечевого сустава.
Приложение подгоняет таблицу под мерки клиента: высоты срезов - по
ориентирам фигуры, радиусы - по обхватам и ширине плеч.

Запуск: python scripts/build_mannequin.py <папка с base.obj, female.target, male.target>
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ANGLES = 72
SLICES = 140
OUT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "lib" / "cloth" / "mannequin.json"
PARTS = OUT.with_name("mannequin-parts.json")


def read_obj(path: Path) -> tuple[np.ndarray, dict[str, list[list[int]]]]:
    verts: list[list[float]] = []
    groups: dict[str, list[list[int]]] = defaultdict(list)
    current = ""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("g "):
            current = line.split()[1]
        elif line.startswith("f "):
            groups[current].append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
    return np.array(verts), groups


def apply_target(verts: np.ndarray, path: Path) -> np.ndarray:
    out = verts.copy()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        i, x, y, z = line.split()
        out[int(i)] += (float(x), float(y), float(z))
    return out


def triangles(faces: list[list[int]]) -> np.ndarray:
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
    return np.array(tris)


def joint(verts: np.ndarray, groups: dict, name: str) -> np.ndarray:
    idx = sorted({i for f in groups["joint-" + name] for i in f})
    return verts[idx].mean(axis=0)


def slice_segments(v: np.ndarray, tris: np.ndarray, y: float) -> np.ndarray:
    """Отрезки пересечения треугольников с плоскостью y: (n, 2, 2) в (x, z)."""
    p = v[tris]  # (n, 3, 3)
    d = p[:, :, 1] - y
    segs = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = d[:, a], d[:, b]
        cross = (da * db) < 0
        t = np.where(cross, da / np.where(cross, da - db, 1), 0)
        pt = p[:, a] + (p[:, b] - p[:, a]) * t[:, None]
        segs.append((cross, pt[:, [0, 2]]))
    hits = np.stack([s[0] for s in segs], axis=1)
    pts = np.stack([s[1] for s in segs], axis=1)
    two = hits.sum(axis=1) == 2
    out = []
    for i in np.nonzero(two)[0]:
        q = pts[i][hits[i]]
        out.append(q)
    return np.array(out) if out else np.zeros((0, 2, 2))


def first_hits(segs: np.ndarray, origin: tuple[float, float]) -> np.ndarray:
    """Расстояние до первого пересечения луча из origin под углом phi (0 - вперёд, +z)."""
    radii = np.full(ANGLES, np.nan)
    if len(segs) == 0:
        return radii
    a = segs[:, 0] - origin
    b = segs[:, 1] - origin
    for k in range(ANGLES):
        phi = 2 * math.pi * k / ANGLES
        d = np.array([math.sin(phi), math.cos(phi)])  # (x, z)
        e = b - a
        den = d[0] * e[:, 1] - d[1] * e[:, 0]
        ok = np.abs(den) > 1e-12
        t = np.where(ok, (a[:, 0] * e[:, 1] - a[:, 1] * e[:, 0]) / np.where(ok, den, 1), -1)
        u = np.where(ok, (a[:, 0] * d[1] - a[:, 1] * d[0]) / np.where(ok, den, 1), -1)
        valid = ok & (t > 1e-6) & (u >= 0) & (u <= 1)
        if valid.any():
            radii[k] = t[valid].min()
    return radii


def cross_section(
    v: np.ndarray, tris: np.ndarray, centre: np.ndarray, normal: np.ndarray, reach: float
) -> np.ndarray:
    """Точки пересечения тела с плоскостью через centre поперёк normal, в пределах reach от centre."""
    p = v[tris]
    d = (p - centre) @ normal
    pts = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = d[:, a], d[:, b]
        cross = (da * db) < 0
        t = da[cross] / (da[cross] - db[cross])
        pts.append(p[cross, a] + (p[cross, b] - p[cross, a]) * t[:, None])
    q = np.concatenate(pts) if pts else np.zeros((0, 3))
    return q[np.linalg.norm(q - centre, axis=1) < reach]


def limb_profile(
    v: np.ndarray,
    tris: np.ndarray,
    chain: list[np.ndarray],
    reach: float,
    start: float,
    side_x: float,
) -> list[dict]:
    """Сечения конечности вдоль цепочки суставов: доля длины, полуоси поперёк и вглубь, сдвиг центра."""
    lengths = [float(np.linalg.norm(chain[i + 1] - chain[i])) for i in range(len(chain) - 1)]
    total = sum(lengths)
    rows = []
    for f in np.linspace(start, 1.0, 40):
        along = f * total
        k = 0
        while k < len(lengths) - 1 and along > lengths[k]:
            along -= lengths[k]
            k += 1
        n = (chain[k + 1] - chain[k]) / lengths[k]
        c = chain[k] + n * min(along, lengths[k])
        q = cross_section(v, tris, c, n, reach)
        # Только своя конечность: точки по ту сторону от середины тела - чужие.
        q = q[q[:, 0] * side_x > 0]
        if len(q) < 6:
            continue
        depth_axis = np.array([0.0, 0.0, 1.0]) - n * n[2]
        depth_axis /= np.linalg.norm(depth_axis)
        width_axis = np.cross(n, depth_axis)
        u = (q - c) @ width_axis
        w = (q - c) @ depth_axis
        rows.append(
            {
                "s": round(float(f), 4),
                "a": round(float((u.max() - u.min()) / 2), 4),
                "b": round(float((w.max() - w.min()) / 2), 4),
                "dz": round(float((w.max() + w.min()) / 2), 4),
            }
        )
    return rows


def perimeter(r: np.ndarray) -> float:
    phi = 2 * np.pi * np.arange(ANGLES) / ANGLES
    x, z = r * np.sin(phi), r * np.cos(phi)
    return float(np.hypot(np.diff(np.append(x, x[0])), np.diff(np.append(z, z[0]))).sum())


def build(folder: Path, gender: str) -> dict:
    base, groups = read_obj(folder / "base.obj")
    v = apply_target(base, folder / f"{gender}.target")
    tris = triangles(groups["body"])
    body_idx = sorted({i for f in groups["body"] for i in f})
    bv = v[body_idx]

    shoulder = joint(v, groups, "l-shoulder")
    hip_joint = joint(v, groups, "l-upper-leg")
    neck = joint(v, groups, "neck")
    z0 = float((shoulder[2] + hip_joint[2]) / 2)
    origin = (0.0, z0)

    mid = bv[np.abs(bv[:, 0]) < 0.06]
    crotch = float(mid[:, 1].min())
    # Ширина шеи - на высоте сустава шеи; основание шеи сбоку - верх тела над
    # этой шириной; плечевая точка - верх тела над плечевым суставом.
    neck_r = float(
        np.nanmax(
            first_hits(slice_segments(v, tris, neck[1]), (0.0, neck[2]))[
                [ANGLES // 4, 3 * ANGLES // 4]
            ]
        )
    )

    def near(x0: float, w: float) -> np.ndarray:
        return bv[
            (np.abs(np.abs(bv[:, 0]) - x0) < w)
            & (np.abs(bv[:, 2] - z0) < 0.6)
            & (bv[:, 1] < neck[1])
        ]

    side_neck = float(near(neck_r * 1.05, 0.08)[:, 1].max())
    shoulder_tip = float(near(abs(shoulder[0]), 0.15)[:, 1].max())
    # Верх таблицы - чуть выше основания шеи: выше луч вперёд упирается в
    # подбородок, и шея получалась воронкой.
    top = side_neck + 0.02 * float(bv[:, 1].max() - bv[:, 1].min())

    bottom = crotch + 0.1
    ys = np.linspace(bottom, top, SLICES)
    cut_x = abs(shoulder[0]) + 0.25
    rows = []
    lateral_free = []
    for y in ys:
        r = first_hits(slice_segments(v, tris, float(y)), origin)
        lateral_free.append(float(np.nanmax(r[[ANGLES // 4, 3 * ANGLES // 4]])))
        rows.append(r)
    rows = np.array(rows)
    # Подмышка: ниже неё луч вбок упирается в бок торса, выше - уходит в руку.
    lateral_free = np.array(lateral_free)
    upper = ys > (crotch + shoulder[1]) / 2
    jump = np.nonzero(upper & (lateral_free > abs(shoulder[0]) * 1.02))[0]
    armpit = float(ys[jump[0]]) if len(jump) else float(shoulder[1] - 1.5)
    phi = 2 * np.pi * np.arange(ANGLES) / ANGLES
    s = np.abs(np.sin(phi))
    for i, y in enumerate(ys):
        if y >= armpit - 0.05:
            limit = np.where(s > 1e-6, cut_x / np.maximum(s, 1e-6), np.inf)
            rows[i] = np.minimum(rows[i], limit)
        if y >= side_neck:
            rows[i] = np.minimum(rows[i], neck_r * 1.25)
        # Пропуски (луч не нашёл поверхность) - по соседним углам.
        row = rows[i]
        bad = np.isnan(row)
        if bad.any() and (~bad).any():
            idx = np.arange(ANGLES)
            row[bad] = np.interp(idx[bad], idx[~bad], row[~bad], period=ANGLES)
    girth = np.array([perimeter(r) for r in rows])
    height = float(bv[:, 1].max() - bv[:, 1].min())
    # Бёдра - по ягодицам: срезы у самого шага захватывают оба бедра ног.
    lower = (ys > crotch + 0.05 * height) & (ys < (crotch + armpit) / 2)
    hip = float(ys[lower][np.argmax(girth[lower])])
    waist_band = (ys > hip) & (ys < armpit)
    waist = float(ys[waist_band][np.argmin(girth[waist_band])])
    chest_band = (ys > waist) & (ys < armpit)
    depth = rows[:, 0] + rows[:, ANGLES // 2]
    bust = float(ys[chest_band][np.argmax(depth[chest_band])])
    # Руки - от плечевого сустава через локоть до запястья; ноги - от
    # тазобедренного сустава через колено до лодыжки. Профили толщины
    # заменяют в приложении придуманные доли дельты, бицепса, бедра и икры.
    arm = limb_profile(
        v,
        tris,
        [shoulder, joint(v, groups, "l-elbow"), joint(v, groups, "l-hand")],
        0.9,
        0.06,
        1.0,
    )
    knee = joint(v, groups, "l-knee")
    ankle = joint(v, groups, "l-ankle")
    leg = limb_profile(v, tris, [hip_joint, knee, ankle], 1.2, 0.12, 1.0)
    return {
        "arm": arm,
        "leg": leg,
        "legJoints": {
            "hip": [round(float(c), 4) for c in hip_joint],
            "knee": [round(float(c), 4) for c in knee],
            "ankle": [round(float(c), 4) for c in ankle],
        },
        "hipGirth": round(float(girth[list(ys).index(hip)]), 4),
        "landmarks": {
            "crotch": crotch,
            "hip": hip,
            "waist": waist,
            "bust": bust,
            "armpit": armpit,
            "shoulderTip": shoulder_tip,
            "sideNeck": side_neck,
            "neckTop": top,
        },
        "ys": [round(float(y), 4) for y in ys],
        "radii": [[round(float(x), 4) for x in r] for r in rows],
    }


def part(
    v: np.ndarray, faces: list[list[int]], mask: np.ndarray, origin: np.ndarray, axes: np.ndarray
) -> dict:
    """Кусок сетки в локальных осях: вершины (Int16, 0,1 мм) и треугольники (Uint16), base64."""
    import base64

    on_body = np.zeros(len(v), dtype=bool)
    on_body[[i for f in faces for i in f]] = True
    sel = np.nonzero(mask & on_body)[0]
    index = {int(i): k for k, i in enumerate(sel)}
    tris = []
    for f in faces:
        if all(i in index for i in f):
            q = [index[i] for i in f]
            for k in range(1, len(q) - 1):
                tris.append((q[0], q[k], q[k + 1]))
    local = (v[sel] - origin) @ axes.T  # дм
    pos = np.round(local * 1000).astype(np.int16)
    idx = np.array(tris, dtype=np.uint16)
    return {
        "positions": base64.b64encode(pos.tobytes()).decode(),
        "triangles": base64.b64encode(idx.tobytes()).decode(),
    }


def build_parts(folder: Path) -> dict:
    """Кисть и ступня нейтральной модели: в приложении кладутся к запястью и лодыжке."""
    v, groups = read_obj(folder / "base.obj")
    faces = groups["body"]
    height = float(np.ptp(v[sorted({i for f in faces for i in f})][:, 1]))
    elbow = joint(v, groups, "l-elbow")
    wrist = joint(v, groups, "l-hand")
    ankle = joint(v, groups, "l-ankle")
    n = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    # В A-позе кисть согнута к ладони относительно предплечья. Ось кисти
    # берём от запястья к середине пальцев, иначе у опущенной руки манекена
    # кисть заходит в бедро и прорезает юбку.
    body = np.zeros(len(v), dtype=bool)
    body[[i for f in faces for i in f]] = True
    along = (v - wrist) @ n
    fingers = body & (along > 0.8) & (np.linalg.norm(v - wrist, axis=1) < 2.5) & (v[:, 0] > 0.5)
    n = v[fingers].mean(axis=0) - wrist
    n /= np.linalg.norm(n)
    depth = np.array([0.0, 0.0, 1.0]) - n * n[2]
    depth /= np.linalg.norm(depth)
    width = np.cross(n, depth)
    # В A-позе ладонь смотрит вниз и большой палец уходит к телу. У опущенной
    # руки ладонь обращена к бедру, а большой палец - вперёд: поворачиваем
    # кисть вокруг её оси, чтобы палец смотрел вперёд с небольшим наклоном внутрь.
    thumb = joint(v, groups, "l-finger-1-3") - wrist
    current = np.arctan2(thumb @ width, thumb @ depth)
    turn = current - np.radians(20)
    width, depth = (
        np.cos(turn) * width - np.sin(turn) * depth,
        np.sin(turn) * width + np.cos(turn) * depth,
    )
    # Оси кисти: вдоль предплечья, поперёк, вглубь.
    hand_axes = np.stack([n, width, depth])
    hand_mask = (
        (((v - wrist) @ n) > -0.05) & (np.linalg.norm(v - wrist, axis=1) < 2.5) & (v[:, 0] > 0.5)
    )
    # Срез ступни - ниже конца ноги манекена, чтобы край прятался в ноге.
    foot_mask = (v[:, 1] < ankle[1] - 0.1) & (v[:, 0] > 0)
    return {
        "height": round(height, 4),
        "hand": part(v, faces, hand_mask, wrist, hand_axes),
        "foot": part(v, faces, foot_mask, ankle, np.eye(3)),
    }


def main() -> None:
    folder = Path(sys.argv[1])
    data = {
        "source": "MakeHuman base mesh and targets caucasian-female-young / caucasian-male-young, "
        "github.com/makehumancommunity/makehuman, CC0 1.0",
        "units": "MakeHuman decimetres; app rescales to client measurements",
        "angles": ANGLES,
        "female": build(folder, "female"),
        "male": build(folder, "male"),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    parts = {"source": data["source"], **build_parts(folder)}
    PARTS.write_text(json.dumps(parts, separators=(",", ":")), encoding="utf-8")
    print("written", PARTS, PARTS.stat().st_size, "bytes")
    for g in ("female", "male"):
        lm = data[g]["landmarks"]
        print(g, {k: round(v, 2) for k, v in lm.items()})
    print("written", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
