"""Справочник для интерфейса: определения из источников + раздел + «где в Shityo»."""

import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
src = json.loads((root / "docs/research/06-glossary-sources.json").read_text(encoding="utf-8"))

SECTION = {
    "basics": [
        "lekalo",
        "vykroyka",
        "chertezh_konstrukcii",
        "bazovaya_konstrukciya",
        "modelnaya_konstrukciya",
        "emko_sev",
    ],
    "measures": [
        "razmer",
        "rost",
        "polnotnaya_gruppa",
        "tipovaya_figura",
        "poluobhvat",
        "sg3",
        "sg2",
        "dts",
        "dtp",
        "vg",
        "cg",
        "shp",
        "op",
        "vs",
        "dn",
    ],
    "ease": [
        "pribavka_na_svobodnoe_obleganie",
        "pribavka_po_grudi",
        "pribavka_po_talii",
        "pribavka_po_bedram",
        "pribavka_k_shirine_spinki",
        "pribavka_na_svobodu_proymy",
        "siluet",
        "siluet_prilegayushchiy",
        "siluet_poluprilegayushchiy",
        "siluet_pryamoy",
        "spushchennaya_liniya_plecha",
    ],
    "drawing": [
        "pripusk_na_shov",
        "srez",
        "plechevoy_srez",
        "gorlovina",
        "nadsechka",
        "dolevaya_nit",
        "utok",
        "sgib",
        "vytachka",
        "rastvor_vytachki",
        "shagovyy_srez",
        "podbort",
        "koketka",
        "manzheta",
        "beyka",
        "kuliska",
    ],
    "sleeve": [
        "proyma",
        "glubina_proymy",
        "shirina_proymy",
        "okat_rukava",
        "vysota_okata",
        "posadka_po_okatu",
        "tehnologicheskaya_posadka",
    ],
    "check": [
        "sopryazhenie_srezov",
        "balans",
        "primerka",
        "maket_mulyazh",
        "defekty_posadki",
        "figura_sutulaya",
        "figura_peregibistaya",
    ],
    "production": ["gradaciya", "raskladka_lekal"],
}
section_of = {i: s for s, ids in SECTION.items() for i in ids}

# Как этим пользоваться в Shityo. Это описание нашего интерфейса.
UI = {
    "lekalo": "Детали на чертеже - это лекала. Печать 1:1 даёт их в натуральную величину: кнопка «Печать» вверху справа или Ctrl+P.",
    "bazovaya_konstrukciya": "Каталог на главной - базовые конструкции. Проект начинается с выбора основы, дальше она строится по меркам.",
    "modelnaya_konstrukciya": "Фасон (горловина, длина, рукав) и посадка меняются в левой панели - основа превращается в модель.",
    "razmer": "Типовой размер выбирается в левой панели, раздел «Мерки», или при создании проекта. Размер - половина обхвата груди.",
    "rost": "Ростовая группа выбирается рядом с размером: у женщин 152-182 см (ГОСТ 31396), у мужчин 158-200 см (ГОСТ 31399), шаг 6 см.",
    "tipovaya_figura": "Под сеткой размеров показано обозначение типовой фигуры, например 176-100-88.",
    "sg3": "В основах платья, жилета и пальто - мерка «Полуобхват груди». В трикотаже и рубашке вводится полный обхват груди - это вдвое больше.",
    "dts": "Мерка «Длина спины до талии»; в трикотаже и рубашке она называется «От шеи до талии».",
    "dtp": "Мерка «Длина переда до талии». Разница с длиной спины задаёт нагрудную вытачку у женских изделий.",
    "vg": "Мерка «Высота груди»: по ней вытачка направляется в точку груди.",
    "cg": "Мерка «Центр груди» - положение точки груди по ширине.",
    "shp": "В основах платья, жилета и пальто - мерка «Длина плеча»; в трикотаже и рубашке плечевой шов строится из ширины плеч по спине.",
    "op": "Мерка «Обхват плеча» (бицепса): по ней строится рукав, а пройма углубляется, если рукав не помещается.",
    "pribavka_na_svobodnoe_obleganie": "Посадка в левой панели задаёт все прибавки сразу; каждую можно поправить вручную в разделе «Посадка».",
    "pribavka_po_grudi": "Раздел «Посадка»: прибавка по груди. Пресеты от прилегающей до оверсайза умножают её.",
    "siluet": "Пресеты посадки: прилегающий, классический, свободный, оверсайз.",
    "spushchennaya_liniya_plecha": "В посадке «оверсайз» плечевой шов уходит на руку, рукав на столько же короче.",
    "pripusk_na_shov": "На чертеже пунктир вокруг детали - срез с припуском. Слой «Припуск» в меню слоёв.",
    "nadsechka": "Короткие засечки на контуре. Слой «Надсечки» включается в меню слоёв.",
    "dolevaya_nit": "Стрелка «ДН» на каждой детали. При раскладке на ткань она идёт вдоль кромки.",
    "sgib": "Штрихпунктир по середине переда и спинки: деталь кроится со сгибом.",
    "vytachka": "Вытачки видны внутри деталей платья, жилета, пальто, юбки и брюк. Их раствор считается по меркам.",
    "proyma": "Длина проймы видна в панели «Проверка» - «Сравнение швов».",
    "okat_rukava": "Сравните в панели проверки окат рукава с проймой: окат длиннее на величину посадки.",
    "posadka_po_okatu": "Разница «окат минус пройма» в сравнении швов - это посадка оката.",
    "sopryazhenie_srezov": "Панель «Проверка» - «Сравнение швов»: выберите A и B, разница в сантиметрах подсветится.",
    "balans": "У женских плечевых изделий перед длиннее спинки на разницу Дтп и Дтс - это видно по высоте деталей.",
    "primerka": "После примерки макета поправьте мерки или посадку и сохраните - проект запомнит версию.",
    "maket_mulyazh": "Напечатайте лекало (Ctrl+P), сшейте макет, отметьте стадию проекта «Макет и примерка».",
    "raskladka_lekal": "Схема склейки и число листов - в окне печати.",
    "gradaciya": "Shityo не градирует готовое лекало: оно строится заново по меркам каждого размера.",
    "emko_sev": "Формулы основ и источники описаны в docs/SIZING.md.",
}

out = []
for e in src:
    sid = section_of.get(e["id"])
    if not sid:
        raise SystemExit(f"no section for {e['id']}")
    entry = {k: e[k] for k in ("id", "term", "short", "full", "source", "url")}
    if e.get("abbr"):
        entry["abbr"] = e["abbr"]
    entry["section"] = sid
    if e["id"] in UI:
        entry["ui"] = UI[e["id"]]
    out.append(entry)
missing = set(UI) - {e["id"] for e in src}
assert not missing, missing
order = {s: i for i, s in enumerate(SECTION)}
out.sort(key=lambda e: (order[e["section"]], SECTION[e["section"]].index(e["id"])))
(root / "frontend/src/lib/glossary.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
)
print(len(out), "entries,", sum("ui" in e for e in out), "with UI notes")
