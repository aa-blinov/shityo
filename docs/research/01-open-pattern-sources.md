# 01 — Открытые источники базовых лекал и параметрических конструкций

**Цель.** Выяснить, какие открытые проекты и данные пригодны как *встроенные исходные данные* для коммерческой параметрической CAD-платформы лекал (browser UI + backend), которую мы строим, и оценить лицензионные риски.

**Дата проверки:** 2026-11-03. Все URL проверены в этой сессии.

**Методология и маркировка**

| Метка | Значение |
|---|---|
| `[VERIFIED]` | Я лично открыл указанный URL и увидел заявленное. |
| `[INFERRED]` | Вывод из проверенных фактов (юридические/технические следствия), не цитата. |
| `[PROPOSAL]` | Наша проектная идея/рекомендация. |
| `[UNVERIFIED]` | Проверить не удалось (страница недоступна, лицензия не заявлена). |

Важные оговорки, которые действуют для всего документа:

1. **Это не юридическая консультация.** Все формулировки «разрешено / запрещено» — чтение текстов лицензий, а не правовое заключение. Перед продажей нужна проверка юристом.
2. **Код и данные лицензируются раздельно** почти везде. Столбец «Лицензия данных» — самое важное: именно данные лекал попадают в наш коммерческий продукт.
3. **CC-BY-SA на дизайнах = share-alike на производных работах.** Проверено по тексту: <https://creativecommons.org/licenses/by-sa/4.0/legalcode.en> §3(b)(1) — «The Adapter's License You apply must be a Creative Commons license with the same License Elements». То есть если мы доработаем лекало под CC BY-SA, наш производный файл обязан быть CC BY-SA, и downstream не может быть закрытым. Это применимо к нашей ситуации напрямую.
4. **CC BY 4.0** (<https://creativecommons.org/licenses/by/4.0/legalcode.en> §3(a)) требует только атрибуцию при Share — share-alike на дизайнах нет, но §3(a)(4) требует, чтобы лицензия адаптера *не препятствовала* соблюдению CC BY получателями. **CC BY — безопасный вариант для коммерческого использования.**
5. **GPL/AGPL на данные опаснее, чем на код**: если лицензия данных не объявлена отдельно, данные молча наследуют GPL репозитория. Данные, «выведенные из коммерческой книги» (OpenPattern, Open+Pattern), — отдельный класс риска, который лицензия репозитория не снимает.

---

## 1. Сводная таблица источников

Колонки: **Имя+ссылка** · **Файлы в репозитории** · **Тип данных** · **Покрытие** · **Параметризация** · **Форматы** · **SPDX кода** · **Лицензия данных** · **Коммерч. использование** · **Интеграция** · **Активность** · **Ограничения**.

Подробные подтаблицы по каждому источнику — в разделе 2.

| # | Имя + ссылка | Файлы лекал в репозитории | Тип данных | Покрытие | Параметризация | Форматы | SPDX кода | Лицензия данных | Коммерч. использование | Интеграция | Активность | Ограничения |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **FreeSewing** — [codeberg.org/freesewing/freesewing](https://codeberg.org/freesewing/freesewing), [freesewing.dev](https://freesewing.dev/) | **Да**: `designs/<name>/src/*.mjs` — 80 каталогов, 74 в коллекции `[VERIFIED]` | **Генератор/формулы** (JS-код, не файлы) | 74 дизайна: футболки, худи, свитера, блузки, боди-блоки, брюки, юбки, платья, верхняя одежда, аксессуары, бельё, купальное, детское `[VERIFIED]` | 37 базовых обхватов + 7 производных + 2 (plugin-bust); опции типа pct/bool/list `[VERIFIED]` | SVG (нативно), PDF, JSON/YAML (настройки), DXF только в deprecated v2-плагине `[VERIFIED]` | **MIT** | **MIT** (тот же корневой LICENSE, без отдельного файла) | **Разрешено**, обязанность — сохранить текст MIT `[INFERRED]` | npm-библиотека: `@freesewing/core` + `@freesewing/collection` + `@freesewing/models` + `@freesewing/plugin-*` | Коммиты до **2026-11-02**; npm 4.10.2 от 2026-09-13; GitHub-репо архивировано 2025-04-02 `[VERIFIED]` | Нет готовых размерных сеток; DXF выпилен после v2; только индивидуальная посадка по обхватам |
| 2 | **Seamly2D** — [github.com/FashionFreedom/Seamly2D](https://github.com/FashionFreedom/Seamly2D) | **Да**: `src/app/share/samples/patterns/*.sm2d` (8 production) + тестовая выборка; **53 `.sm2d`** во всём дереве `[VERIFIED]` | Параметрические чертежи в XML (`.sm2d`) + мерные файлы `.smis`/`.smms` | Пиджаки (6 размеров), мужская рубашка, брюки, женский блок, футболка, бюстгальтер, юбка, пижама, блуза, костюм; ~245 мер в шаблоне `[VERIFIED]` | Полная: `<increments>` с формулами по меркам, ~50 именованных переменных на чертеж `[VERIFIED]` | SVG, PDF, PNG, OBJ, PS, EPS, DXF (flat/AAMA/ASTM), tiled PDF `[VERIFIED]` | **GPL-3.0** (+ MIT для Rust-ядра SeamlyLayout) | **Не заявлена отдельно** → наследует GPL-3.0 репозитория `[VERIFIED]` | GPL: при распространении кода — передача исходников. Данные — отдельный вопрос | Импорт файлов + headless CLI `seamly2d -b -m -f` (offscreen) `[VERIFIED]` | Коммиты и релизы **2026-11-02** (v2026.11.2.131) `[VERIFIED]` | Мало реальных лекал (8 прод-семплов + 45 тест-фикстур); нет библиотеки стандартных блоков; C++/Qt6 desktop, нет web-движка |
| 3 | **Valentina** — [gitlab.com/smart-pattern/valentina](https://gitlab.com/smart-pattern/valentina) (зеркало [github.com/dismine/valentina](https://github.com/dismine/valentina)) | **Да**: `src/app/share/collection/*.val` — **73 `.val`**, 26 `.vit`, 2 `.vst` `[VERIFIED]` | Параметрические чертежи `.val` (XML) + мерные `.vit`/`.vst` | Женский блок, мужская рубашка, брюки (4 варианта), пиджаки, футболка, бюстгальтер, юбка, пижама, блуза, стимпанк-брюки `[VERIFIED]` | Полная: `<increments>` с формулами (`#CG/10+(#CG<116?11:10.5)`), ease-переменные, piece-level `seamAllowance` `[VERIFIED]` | SVG, PDF, PDF-tiled, DXF (AAMA/ASTM), OBJ, PNG, PS, EPS, HPGL/PLT `[VERIFIED]` | **GPL-3.0** | **Не заявлена отдельно** → GPL-3.0; часть файлов содержит `<company>Stinde Design</company>` — стороннее авторство `[VERIFIED]` | GPL-3.0 с передачей исходников при распространении | Импорт файлов + headless CLI `valentina --basename -m` `[VERIFIED]` | Тег **v1.1.1** (2026-09-18), активность 2026-10-23 `[VERIFIED]` | 43 из 73 `.val` — регрессионные фикстуры `bugs/Issue_#NNN.val`; одна таблица размеров (GOST men, 76 мер); с 1.0 бинарники платные, исходники бесплатны |
| 4 | **Tau Meta Tau Physica (TMTP)** — [github.com/slspencer/TauMeta](https://github.com/slspencer/TauMeta), [taumeta.org](https://www.taumeta.org/) | **Да**: `standalone/patterns/*.py` — 42 файла + 6 в `proofed/` `[VERIFIED]` | Python-классы, вычисляющие точки по меркам клиента | Блоки: корсет (3 варианта), юбка, мужские рубашки (3), джинсы 1950-х, пижамные брюки, топпер, смокинг 1880, длинное платье, стимпанк-куртка, хала `[VERIFIED]` | 67 мер на клиента (`bust`, `front_waist`, `hip_to_floor`…) в JSON; пересчёт headless `[VERIFIED]` | **Только SVG** (PDF — через ручную пост-обработку в Inkscape) `[VERIFIED]` | **GPL-3.0** + доп. «Attribution must be given in all derived works» | Явно отдельно: «designers who create pattern designs may use any license they wish» → лицензия каждого дизайна определяется его автором и **не указана** `[VERIFIED]` | GPL-3 для кода; по дизайнам — неопределённость | CLI `mkpattern --client=… --pattern=… out.svg` `[VERIFIED]` | **Заброшен: последний коммит 2016-08-27**, релизов нет `[VERIFIED]` | Python 2, зависимость `pysvg` с мёртвого хоста; припуски — ручной Inkscape-Offset; авторы сами объявили проект превосходённым Valentina |
| 5 | **MakeHuman / MPFB2** — [github.com/makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman), [mpfb2](https://github.com/makehumancommunity/mpfb2), [makehumancommunity.org](https://www.makehumancommunity.org/) | **2D-лекал нет.** Только 3D: `.mhclo`, `.obj`, `.mhw`, `.mhmat`, targets/позы в `src/mpfb/data/` `[VERIFIED]` | 3D-модели тела и одежды, деформируемые морфингом | 3D-одежда: `female_casualsuit01/02`, `female_elegantsuit01`, `female_sportsuit01`, `male_casualsuit01…06`, `male_elegantsuit01`, `male_worksuit01`, шляпы, обувь; proxy-меши, волосы, глаза, скины `[VERIFIED]` | **Не мерки лекал**, а морф-таргеты тела (24 группы), пропорции, позы; одежда привязана к телу весами вершин `[VERIFIED]` | Только 3D: OBJ, FBX, DAE, MHX2; **SVG/DXF/PDF нет** `[VERIFIED]` | MakeHuman — **AGPL-3.0**; MPFB2 — **GPL-3.0** | **CC0 1.0 Universal** — явно и отдельно, включая одежду (MHCLO) `[VERIFIED]` | Ассеты — свободны полностью («anything you want with it»); код — copyleft | Файлы + аддон Blender; ассет-пак 267 МБ `[VERIFIED]` | MPFB2 активен (2026-10-24); сам MakeHuman — 2024-06-26 `[VERIFIED]` | **Нет 2D-лекал вообще** — пригоден только как источник 3D-тела/гардероба, лекала придётся конструировать самим |
| 6 | **GarmentCode / pygarment (ETH Zürich IGL)** — [github.com/maria-korosteleva/GarmentCode](https://github.com/maria-korosteleva/GarmentCode), [pypi.org/project/pygarment](https://pypi.org/project/pygarment/) | **Да**: `assets/garment_programs/*.py` (14 модулей: `bodice.py`, `pants.py`, `tee.py`, `circle_skirt.py`, `collars.py`, `sleeves.py`, `skirt_paneled.py`…), `assets/Patterns/*.json` (4 спецификации) `[VERIFIED]` | **Генератор**: параметрические программы на Python + JSON-спецификация паттерна | Корсет, брюки, футболка, круговая юбка, воротники, рукава, панельная юбка, клинья, резинки `[VERIFIED]` | Мерки тела (25 в GarmentCodeData) + дизайн-параметры (длина, раствор, ширина) в YAML-пресетах `[VERIFIED]` | JSON (паттерн-спека), OBJ/PLY (тело) `[VERIFIED]` | **MIT** `[VERIFIED]` | **MIT** (тот же LICENSE, без отдельного) `[VERIFIED]` | **Разрешено**, MIT-атрибуция `[INFERRED]` | Python-библиотека `pip install pygarment` + JSON-обмен; есть GUI на NiceGUI `[VERIFIED]` | pygarment 2.0.2 (2025-04-18); репозиторий активен (2025-06) `[VERIFIED]` | Узкое покрытие (7–8 типов изделий), не набор готовых блоков; MIT-атрибуция на код |
| 7 | **Garment-Pattern-Generator + Zenodo-датасет** — [github.com/maria-korosteleva/Garment-Pattern-Generator](https://github.com/maria-korosteleva/Garment-Pattern-Generator), [zenodo.org/records/5267549](https://zenodo.org/records/5267549) | **Да**: `data_generation/Patterns/{basic tee,combos,pants,skirts}` + JSON-шаблоны `[VERIFIED]` | Генератор + **готовый датасет 23 500 3D-гардеров с лекалами** | 12 типов в train (dress, jacket×2, jumpsuit, pants, skirts×3, tee×2) + 9 в test `[VERIFIED]` | Мерки тела + дизайн-параметры, сэмплирование `[VERIFIED]` | JSON-паттерны, OBJ/меши; 84.8 ГБ архивов `[VERIFIED]` | **MIT** (код и ассеты — «All the new code and assets will be shared here under the MIT license») `[VERIFIED]` | **MIT** для кода; датасет на Zenodo — **CC BY 4.0** (license id `cc-by-4.0`) `[VERIFIED]` | Код MIT; данные CC BY 4.0 — атрибуция, share-alike **нет** `[INFERRED]` | Формат JSON + MIT-код; генерация требует Maya `[VERIFIED]` | Репозиторий 2024-06; датасет 2021-06-08 `[VERIFIED]` | 84.8 ГБ; нужна Maya/Qualoth для перегенерации; SMPL-тело под **CC BY 4.0** — отдельная атрибуция |
| 8 | **GarmentCodeData v1/v2 (ETH)** — [zenodo.org/records/5267549](https://zenodo.org/records/5267549), [igl.ethz.ch/projects/GarmentCodeData](https://igl.ethz.ch/projects/GarmentCodeData/) | Датасет, **не** код-паттерны; спецификации паттернов — JSON `[VERIFIED]` | Датасет: 115 000 (v2) / 23 500 (v1) готовых лекал + 3D-меши | Tops, shirts, dresses, jumpsuits, skirts, pants; тела из CAESAR-подобной модели; 3 ткани `[VERIFIED]` | Мерки, посадка по фигуре, дизайн-параметры, UV, сегментация `[VERIFIED]` | JSON, OBJ/меши, UV `[VERIFIED]` | Код — MIT (GarmentCode) | v1 — **CC BY 4.0** (Zenodo `cc-by-4.0`) `[VERIFIED]`; **v2 — лицензия не найдена** (DataCite `rightsList` пуст, страница ETH Research Collection не отдалась) `[UNVERIFIED]` | v1 CC BY — коммерчески ок; **v2 требует уточнения** | Скачивание датасета; генерация через MIT-пайплайн `[VERIFIED]` | v2 — 2024-09-04 (DataCite) `[VERIFIED]` | Датасет, а не редактируемая библиотека; v2 — 115 000 образцов, гигабайты |
| 9 | **GarmageSet / GarmageNet (Style3D)** — [huggingface.co/datasets/Style3D/GarmageSet](https://huggingface.co/datasets/Style3D/GarmageSet), [github.com/Style3D/garmagenet-impl](https://github.com/Style3D/garmagenet-impl) | Датасет + код; **не** редактируемые паттерны `[VERIFIED]` | Датасет «Garmage» (структурированное изображение геометрии) | Разнообразие garment-панелей и 3D-инициализаций `[VERIFIED]` | Диффузионная генерация, не ручное конструирование `[VERIFIED]` | OBJ + растровые изображения `[VERIFIED]` | «Other» / NOASSERTION `[VERIFIED]` | **CC BY-NC-ND 4.0** + gated `[VERIFIED]` | **Запрещено для коммерции** (NC) — NC-элемент сохраняется и при ShareAlike `[INFERRED]` | Скачивание датасета (gated) | Датасет 2025-11-18; код 2026-01-05 `[VERIFIED]` | **NC-ND — исключить из коммерческого использования**; это 3D-датасет, а не библиотека лекал |
| 10 | **OpenPattern (F. Metivier)** — [github.com/fmetivier/OpenPattern](https://github.com/fmetivier/OpenPattern) | **Да**: `OpenPattern/{Bodices,Collars,Cuffs,Gowns,Placket,Shirts,Skirts,Ties,Trousers,Waist_Coats}.py`, 27 sample SVG, `data/measurements.db` (SQLite) `[VERIFIED]` | **Генератор/формулы** на Python | Корсет (ж/м), рукав, рубашка, юбка, брюки, галстук, воротник, манжета, платье, планка, жилет; системы размеров Gilewska/Chiappetta/Donnano/Wargnier `[VERIFIED]` | ~50 мер (франц. имена: `tour_poitrine`, `tour_taille`, `carrure_devant`, `hauteur_poitrine`…) + опции `style`, `gender`, `age`, `ease` `[VERIFIED]` | PDF (A0 + A4 tiling), SVG, ODS, SQLite `[VERIFIED]` | **GPL-3.0** | **Не заявлена отдельно** → GPL-3.0; **но геометрия выведена из трёх коммерческих книг** (Chiappetta, Gilewska, Donnano) — GPL кода не снимает авторское право на дизайн `[VERIFIED]` | Код — GPL (можно читать/портировать, нельзя линковать в закрытый продукт); дизайн — риск | Python-библиотека (`pip install`), не CLI `[VERIFIED]` | push 2024-10-29 `[VERIFIED]` | Один разработчик, 15 звёзд; база мер неконсистентна между методиками (признаёт автор); книжная геометрия |
| 11 | **Moldeon** — [github.com/GabrielVioli/Moldeon](https://github.com/GabrielVioli/Moldeon) | **Да**: `apps/web/src/patterns/{basePatternDrafting,trouserPatternDrafting,templateCatalog}.ts`, `crates/pattern-core/src/lib.rs` `[VERIFIED]` | **Формулы** (DSL `FormulaGraphEngine`, типизированные величины «40mm») | 6 готовых + 1 в разработке: bodice-block, tshirt, blouse, straight-skirt, mini-skirt, straight-pants; basic-jacket — `experimental` `[VERIFIED]` | Мерки в мм: `heightMm`, `bustMm`, `waistMm`, `hipMm`, `shoulderWidthMm`, `torsoLengthMm`, `armLengthMm`, `inseamMm`; ease на шаблон; статус валидации у каждого `[VERIFIED]` | SVG (1:1, линия раскроя + припуск), JSON-модель документа, Rust/WASM-ядро `[VERIFIED]` | **MIT** | **MIT** (одно LICENSE на весь репозиторий) `[VERIFIED]` | **Разрешено**, MIT-атрибуция; при встраивании формул — сохранить MIT-уведомление `[INFERRED]` | Форк/порт TS-кода; wasm-pack для ядра; npm-пакета нет `[VERIFIED]` | push 2026-09-11 (389 коммитов) `[VERIFIED]` | 1 звезда, новый проект; куртка недоступна; 3D — не физическая симуляция; UI на португальском |
| 12 | **toile** — [github.com/Elmseld/toile](https://github.com/Elmseld/toile) | **Да**: `engine/blocks/bodice.json` (18 539 B), `engine/blocks/straight_skirt.json` (7 641 B), `engine/examples/rectangle-with-dart.json` `[VERIFIED]` | **Формулы** (JSON-DSL: `measurements`, `parameters`, `formulas`, `points`, `curves`, `pieces`) | 2 базовых блока: корсет (перед/зад, нагрудная/вытачка на талии) и прямая юбка; рукав — в плане `[VERIFIED]` | Корсет: `bust`, `waist`, `neck`, `shoulder_width`, `back_width`, `chest_width`, `back_length`, `armhole_depth`, `bust_height`, `bust_distance` + параметры `ease_bust` (80 мм), `ease_waist` (40), `bust_dart_rate` 0.12°/мм и др.; `source` → Winifred Aldrich `[VERIFIED]` | SVG (path data), PDF в приложении `[VERIFIED]` | **НЕТ ЛИЦЕНЗИИ** (endpoint 404, файла нет) `[VERIFIED]` | **Нет** → all rights reserved `[INFERRED]` | **Запрещено** без письменного разрешения автора `[INFERRED]` | TS-пакет `@toile/engine`, чистые функции `evaluatePattern` / `compilePattern` `[VERIFIED]` | push 2026-10-20 (203 коммита) `[VERIFIED]` | Блокировка — лицензия, а не код; всего 2 блока; константы Aldrich — «наши стартовые значения, подлежат подгонке» |
| 13 | **Aras** — [github.com/Joosehot/Aras](https://github.com/Joosehot/Aras) | **Да**: `rules.toml`, `src/blocks/{torso,trousers,parts}.rs`, `src/rules/*`, 17+ SVG в `gallery/` `[VERIFIED]` | Формулы + **детерминированный поиск** (beam search, без нейросети) | tshirt, hoodie, sweatshirt, shirt, dress (shift/a_line/gathered), pants `[VERIFIED]` | Размерная сетка S–XL (18 мер), ткани (jersey/fleece/shirting/stretch…), припуски по частям, посадка fitted/regular/loose/oversized, NL-редактирование `[VERIFIED]` | SVG (1:1 раскрой + бумажная лекало) `[VERIFIED]` | **PolyForm Noncommercial 1.0.0** (SPDX: NOASSERTION) `[VERIFIED]` | Те же условия — один LICENSE `[VERIFIED]` | **Запрещено для коммерции** (PolyForm NC) `[INFERRED]` | Rust CLI `aras "sentence" -o out.svg` `[VERIFIED]` | push 2026-10-02 (8 коммитов) `[VERIFIED]` | 8 коммитов, 1 звезда; 3D-симуляция только для body-кусков |
| 14 | **Patro / PyValentina** — [github.com/FabriceSalvaire/Patro](https://github.com/FabriceSalvaire/Patro), [pypi.org/project/Patro](https://pypi.org/project/Patro/) | **Почти нет**: только 3 демо-`.val` в `doc/sphinx/source/valentina-compatibility/`; библиотеки лекал нет `[VERIFIED]` | Инструмент/движок чтения `.val`/`.vit` | 0 готовых изделий `[VERIFIED]` | Общая: любой набор мер из `.vit`, выражения muparser `[VERIFIED]` | `.val`, `.vit`, LaTeX/PGF (A0 и A4-tiling), SVG/DXF/PDF-пайтеры `[VERIFIED]` | **AGPL-3.0** (файл `LICENSE-AGPL-3.0.md`) `[VERIFIED]` | Нет отдельной; AGPL-3.0 `[VERIFIED]` | **Запрещено** для закрытого коммерческого SaaS (AGPL §13 — сетевое взаимодействие) `[INFERRED]` | PyPI-библиотека `pip install Patro` `[VERIFIED]` | push 2024-08-21; PyPI 0.3.0 `[VERIFIED]` | Ценность — как **формат-референс** (.val/.vit), не как источник данных |
| 15 | **ChristinaHein/shirt** — [github.com/ChristinaHein/shirt](https://github.com/ChristinaHein/shirt) | **Да**: ~25 `.m`-файлов (`create_pattern_shirt.m`, `create_basic_pattern_{front,back}_part.m`, `create_basic_pattern_sleeve.m`, `create_production_pattern_*`, `plot_all_sizes.m`…) `[VERIFIED]` | Формулы (MATLAB, point-list геометрия SG-Library) | 1 семейство (рубашка) в 3 уровнях: basic / production / export-cut `[VERIFIED]` | Gender (Lady/Men), Fit (loose/regular/tight), neckline (Round/V), sleeves (sleeveless/short/¾/long); мерки — из `Dimensionsheet.pdf` `[VERIFIED]` | SVG (`PLwriteSVG2.m`), DXF (DXFLib), PDF-примеры, PNG `[VERIFIED]` | **MIT** | **MIT** (одно LICENSE) `[VERIFIED]` | **Разрешено**; атрибуция; метод ссылается на книгу Hofenbitzer — текст книги не покрывается MIT `[INFERRED]` | MATLAB 2018b+ + Computer Vision Toolbox + SG-Library + DXFLib `[VERIFIED]` | push 2021-06-19 (43 коммита) `[VERIFIED]` | MATLAB-only (огромная цена интеграции в web-CAD); зависит от проприетарного DXFLib; одно семейство |
| 16 | **Open+Pattern** — [openpattern.io](https://openpattern.io/), библиотека [openpattern.io/pattern-library](https://openpattern.io/pattern-library/) | **Да**: 34 готовых набора файлов (DXF, PDF, A4/A0 PDF, CLO3D `.zprj`, GLB, PNG) `[VERIFIED]` | **Готовые лекала** (оцифрованные с реальных вещей), без параметризации | Jackets, military (Zeltbahn, CS95), trousers, T-shirts (3 посадки), sweaters, headwear, boilersuits; 34 позиции `[VERIFIED]` | **Нет** — «Graded patterns show the full size range. Single-size patterns state the size and its measurements» `[VERIFIED]` | CLO3D `.zprj`, DXF, PDF (full/A4/A0), GLB, PNG `[VERIFIED]` | Нет кода (сайт) | **CC BY 4.0** — «every pattern is free under CC BY 4.0. Use it, change it, sell what you make. Just credit Open+Pattern» `[VERIFIED]` | **Разрешено**, обязанность — атрибуция «Open+Pattern» `[INFERRED]` | Импорт файлов (DXF/GLB/PDF) `[VERIFIED]` | Сайт meta-article:modified_time 2026-10-24 `[VERIFIED]` | **Статичные одноразмерные лекала**, без параметризации; ниша — винтаж/военная форма; нет машинно-читаемой схемы мер |
| 17 | **Wikimedia Commons — Pattern-a-thon / MoMu** — [commons.wikimedia.org/wiki/Category:MoMu_Pattern-a-thon_patterns_svg](https://commons.wikimedia.org/wiki/Category:MoMu_Pattern-a-thon_patterns_svg), [инструкции](https://commons.wikimedia.org/wiki/Commons:GLAM/MOMU/Pattern-a-thon_upload_instructions) | **Да**: ~48 SVG-файлов (юбки, блузы, штаны, жакеты, платья, платки, корсет, ботинки, рубашки, шорты) `[VERIFIED]` | **Готовые лекала** (оцифрованные музейные выкройки), SVG | Исторические костюмы 1900–1950-х (Antwerpen MoMu): ~48 деталей, 12+ категорий `[VERIFIED]` | **Нет** — статичные SVG `[VERIFIED]` | SVG (основной), PDF/DJVU-страницы книг отдельно `[VERIFIED]` | Нет кода | **CC BY 4.0** на файлы MoMu (напр. `File:Patroon jurk (ST2202).svg` → LicenseShortName «CC BY 4.0»); часть — Public domain `[VERIFIED]` | **Разрешено**, атрибуция; share-alike на дизайнах **нет** `[INFERRED]` | Импорт файлов (SVG) `[VERIFIED]` | Активно (upload-инструкции 2024–2026; файлы с 2024-2026) `[VERIFIED]` | Только исторические изделия; нет параметризации; общее назначение каждого файла — CC BY 4.0 с указанием MoMu |
| 18 | **Wikimedia Commons — винтажные книги по конструированию** — [The Practical Designer (1918)](https://commons.wikimedia.org/wiki/Category:The_Practical_Designer), [The Cutter's Practical Guide](https://commons.wikimedia.org/wiki/Category:The_Cutter%27s_Practical_Guide), [A scientific guide to practical cutting (1873)](https://commons.wikimedia.org/wiki/Category:A_scientific_guide_to_practical_cutting_(1873)) | **Да**: DJVU-сканы книг + 164 PNG в Practical Designer, 13 в Cutter's Guide, 64 в подкаталоге `[VERIFIED]` | **Методические тексты и чертежи** (не машиночитаемые параметрические модели) | Швейные системы 1873–1918: анатомические системы, снятие мерок, раскрой `[VERIFIED]` | Описательные, без машинного исполнения `[VERIFIED]` | DJVU, PNG (страницы), Wikisource-текст `[VERIFIED]` | Нет кода | **Public domain / «No known copyright restrictions»** — проверено через MediaWiki `extmetadata` на конкретных файлах `[VERIFIED]` | **Свободно без атрибуции** (PD) `[INFERRED]` | Ручной ввод формул в нашу модель; референс методологии `[INFERRED]` | Активно; Commons — 2026 `[VERIFIED]` | Растровые/DJVU, не векторные лекала; PD-статус ограничен территорией/сроком (проверить для конкретной юрисдикции) |
| 19 | **franken_textiles** — [github.com/Dicklesworthstone/franken_textiles](https://github.com/Dicklesworthstone/franken_textiles) | **Да (код + фикстуры)**: крейты `ftx-pattern`, `ftx-measure`, `ftx-export`, `ftx-cli`, `ftx-wasm`, `ftx-drape`, `ftx-trace`, `ftx-body`; `tests/fixtures/` `[VERIFIED]` | Формулы + генератор (детерминированный Rust) | 2 задокументированных изделия (боло, зуавы) + трассировка чужих листов `[VERIFIED]` | 21 тейп-таргет (обхваты груди/талии/бёдер/бедра/колена/икры/щиколотки/плеча/запястья/шеи, высоты, длины); фитинг к телу **Anny** `[VERIFIED]` | PDF, DXF, HPGL, cutter/embroidery, OBJ+three.js, JSON-отчёты `[VERIFIED]` | **MIT + rider** (запрет предоставления OpenAI/Anthropic) `[VERIFIED]` | Те же условия (rider repo-wide) `[VERIFIED]` | **Разрешено** для коммерческого CAD с соблюдением rider; Anny — Apache-2.0/CC0 `[INFERRED]` | Rust CLI `ftx draft|validate|export|…` + WASM `[VERIFIED]` | push 2026-11-02 (1 074 коммита) `[VERIFIED]` | Каталог лекал тонкий (2 изделия) при богатом движке; rider надо вычитать дословно; тело синтетическое |
| 20 | **MakeHuman-производные: Anny (NAVER)** — [github.com/naver/anny](https://github.com/naver/anny) | Данные тела в `src/anny/data/mpfb2/` (из MPFB2, CC0) `[VERIFIED]` | 3D-параметрическое тело (не лекала) | От новорождённого до пожилого; 6 фенотипов + 256 локальных изменений, 20 из них — тейп-таргеты `[VERIFIED]` | Фенотип + локальные изменения + поза `[VERIFIED]` | OBJ/PLY/GLB (меш) `[VERIFIED]` | **Apache-2.0** (код) | **CC0 1.0** (`data/mpfb2`) `[VERIFIED]` | **Разрешено**, Apache-атрибуция + CC0-ассеты `[INFERRED]` | Python/PyTorch-библиотека `pip install anny` `[VERIFIED]` | v0.6 (2026-08-06) `[VERIFIED]` | Это тело, а не лекала; SMPL-X-топология — только некоммерческая `[VERIFIED]` |

---

## 2. Подробные карточки по ключевым источникам

### 2.1 FreeSewing — единственный источник с настоящей параметрической библиотекой и permissive-лицензией

**[VERIFIED]** Канонический дом — **Codeberg**: <https://codeberg.org/freesewing/freesewing> (ветка `develop`, push до 2026-11-02). GitHub-репозиторий <https://github.com/freesewing/freesewing> **архивирован 2025-04-02** и читает «FreeSewing has moved to Codeberg».

**Структура.** Дизайны лежат в `designs/<name>/` — **80 каталогов** (включая служебные `examples`, `legend`, `library`, `magde`, `plugintest`, `rendertest`), из них **74** в поставляемой коллекции (`packages/collection/src/index.mjs` импортирует ровно 74 пакета `@freesewing/*`); публичный список на <https://freesewing.eu/docs/designs> содержит 76 позиций. Плагины — 18 записей в `plugins/` (`plugin-annotations`, `plugin-bin-pack`, `plugin-bust`, `plugin-flip`, `plugin-gore`, `plugin-i18n`, `plugin-measurements`, `plugin-mirror`, `plugin-path-utils`, `plugin-ringsector`, `plugin-round`, `plugin-sprinkle`, `plugin-svgattr`, `plugin-theme`, `plugin-timing`, `plugin-transform`, `plugin-versionfree-svg`, `core-plugins`).

> ⚠️ **Поправки к формулировке задания** (обе — `[VERIFIED]`):
> * Каталога `design/` не существует ни в одной ветке; правильное имя — **`designs/`**. Путь вида `design/teeshirt/…` не существует ни в одном теге.
> * Пакет **`@freesewing/pattern-design` не существует** — npm registry отдаёт `404`. Ближайшие реальные пакеты: `@freesewing/new-design` (3.1.0, легаси) и `@freesewing/studio` (4.10.2, актуальный). Шаблон репозитория — <https://github.com/freesewing/pattern>.
> * Формата чертежа в `.json` **нет** — чертежи это `.mjs` (v4) / `.js` (v2); JSON только для метаданных (`about.json`) и i18n.

**Как закодирован параметрический чертёж** `[VERIFIED]` (`designs/benjamin/src/base.mjs`, `designs/teagan/src/front.mjs`):

```js
export const base = {
  name: 'benjamin.base',
  measurements: ['neck'],
  options: {
    collarEase: { pct: 3, min: 0, max: 6, ...pctBasedOn('neck'), menu: 'fit' },
    bowStyle: { dflt: 'butterfly', list: ['diamond','butterfly','square','widesquare'], menu: 'style' },
  },
  draft: draftBenjaminBase,   // получает { store, sa, Point, points, Path, paths, Snippet, utils, options, measurements, macro, part }
}
```

Механика: `new Point(x,y)`, операции `shift`/`shiftTowards`/`shiftOutwards`/`flipY`, пути `new Path().move().line().curve()`, макросы `macro('round'|'hd'|'vd'|'sa'|'grainline'|'cutOnFold'…)` (каталог из 57 макросов — <https://freesewing.dev/reference/macros/>), `store.set/get` для значений между частями. Дизайны наследуют друг друга: `designs/teagan/src/front.mjs` делает `import { base } from '@freesewing/brian'`, скрывает чужие пути и перечерчивает.

**Мерки** `[VERIFIED]`: 37 базовых в `packages/config/src/measurements.mjs` — `head, neck, shoulderSlope, shoulderToElbow, shoulderToShoulder, shoulderToWrist, wrist, biceps, hpsToBust, hpsToWaistBack, hpsToWaistFront, highBust, highBustFront, chest, bustFront, bustPointToUnderbust, bustSpan, underbust, waist, waistBack, waistToArmpit, waistToFloor, waistToHips, waistToKnee, waistToSeat, waistToUnderbust, waistToUpperLeg, hips, crossSeam, crossSeamFront, crotchDepth, seat, seatBack, inseam, upperLeg, knee, ankle, heel`; +7 производных в `plugin-measurements`; `plugin-bust` переопределяет `bust`/`chest`. Стандартные наборы тел — `@freesewing/models` (муж. 32–50, жен. 28–46 и doll/giant-наборы).

**Опции сверх мерок** `[VERIFIED]`: типы `{pct,min,max,menu}`, `{bool,menu}`, `{dflt,list,menu}`; меню `fit`/`style`/`advanced`/`conditional`. Ядровые settings: `sa` (припуск), `units`, `scale`, `margin`, `layout`, `paperless`, `expand`, `complete`, `only`, `sample`, `locale` (<https://freesewing.dev/reference/settings/>).

**Форматы вывода** `[VERIFIED]`: **SVG** — нативный (`Pattern.render()`); **PDF** — тайлованный A0–A4 и без тайлинга (в редакторе сайта); **JSON/YAML** — экспорт настроек. **DXF выпилен после v2** — остался только deprecated `@freesewing/plugin-export-dxf` (2.22.2, декабрь 2022), его README прямо говорит «This package will not be part of FreeSewing v3».

**Лицензия кода И данных** `[VERIFIED]`: во всём монорепо **ровно один LICENSE-файл** — корневой MIT («Copyright (c) 2022 Joost De Cock»). Отдельных LICENSE в `designs/`, `packages/`, `plugins/` нет; поиск `"CC BY"` по коду Codeberg даёт «No matching results found». При этом каждый дизайн несёт `"license": "MIT"` в `package.json` и в npm-метаданных. **Вывод: данные лекал — MIT, не отдельная CC-лицензия.** Отдельного текста «the patterns are licensed under …» в документации найти не удалось `[UNVERIFIED]`; атрибуция обеспечивается социально через `about.json` (поля `code`, `design`).

**Обязательства при коммерческом использовании** `[INFERRED]` из текста MIT: разрешено всё, одна обязанность — «The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software». Ни copyleft, ни NC, ни share-alike, ни field-of-use. Два практических замечания:
* Этика проекта (<https://freesewing.dev/guides/faq/is-copying-ok/>): «Absolutely not» на копирование коммерческих выкроек, но «Yes» на воспроизведение существующего изделия. Это не лицензия, а соглашение сообщества.
* Товарные знаки не лицензируются.

### 2.2 Seamly2D и Valentina — два источника .val/.sm2d с GPL-кодом

**[VERIFIED]** Разделение важно:

| | Seamly2D | Valentina |
|---|---|---|
| Канонический URL | <https://github.com/FashionFreedom/Seamly2D> (ветка `develop`) | <https://gitlab.com/smart-pattern/valentina> (зеркало <https://github.com/dismine/valentina>) |
| URL из задания | `github.com/seamly/Seamly2D` — **форк**, не канон | `github.com/ValentinaProject/valentina` — **404**, org не существует |
| Расширение | `.sm2d` | `.val` / `.vit` / `.vst` |
| Файлов в дереве | **53 `.sm2d`** (+2 устаревших `.val`-фикстуры) | **73 `.val`**, 26 `.vit`, 2 `.vst` |
| Прод-семплы | 8: `jacket1…6`, `male_shirt`, `trousers` | ~19–30 реальных + 43 `bugs/Issue_#NNN.val` |
| Мерки | шаблон на **245 мер** (`all_measurements_template.smis`) | `GOST_man_ru.vst` — **76 мер** |
| Код | GPL-3.0 (+ MIT на Rust-ядро SeamlyLayout) | GPL-3.0 |
| Активность | релиз v2026.11.2.131 (2026-11-02) | тег v1.1.1 (2026-09-18), активность 2026-10-23 |

Формулы в файлах — настоящие, а не псевдоним: `male_shirt.sm2d` содержит `formula="(#BustCircumfence < 112 ? #BustCircumfence/5-1 : …)+1.5"` и `formula="bust_circ+4"` `[VERIFIED]`.

**Пересчёт headless** `[VERIFIED]`: `seamly2d -b <basename> -d <dir> -f <fmt> -m <measurefile> <pattern>`; `valentina --basename <out> -m <measure.vit> <pattern.val>`; у Seamly2D есть `--test` (загрузить и выйти) и документированный offscreen-режим `QT_QPA_PLATFORM=offscreen`. Экспорт: SVG, PDF, PDF-tiled, PNG, OBJ, PS, EPS, DXF (flat R10→2013, AAMA, ASTM), HPGL/PLT.

**Лицензия данных — ключевой риск** `[VERIFIED]`: в `src/app/share/samples/patterns/` и `src/app/share/collection/` **нет ни одного LICENSE-файла**, а `.sm2d`/`.val` не содержат пер-файловых лицензионных заголовков. Следовательно, данные **молча наследуют GPL-3.0 репозитория**. Дополнительно: часть `.val` в коллекции Valentina содержит `<company>Stinde Design</company>` — то есть **стороннее авторство дизайна** внутри репозитория `[VERIFIED]`. Это делает коллекцию Valentina плохим источником для коммерческого встраивания даже при формальном GPL.

**[INFERRED]** GPL-3.0 сам по себе не запрещает коммерческое использование. Проблема в другом: если мы **продаём лекала как данные**, мы «распространяем» производные от GPL-данных; если при этом мы линкуем GPL-код Seamly2D/Valentina в наш закрытый SaaS — copyleft распространяется на комбинированную работу. Безопасная стратегия — **читать формат и переписывать собственную геометрию**, а не встраивать их движок.

### 2.3 Tau Meta Tau Physica — ценная геометрия, но лицензия данных не определена

**[VERIFIED]** Репозитории `github.com/metapolytech/tau` и `github.com/metapolytech/tau-cloth` **не существуют** (404; org `metapolytech` тоже 404). Реальные канонические источники: <https://github.com/slspencer/TauMeta> (995 коммитов, GPL-3.0), <https://github.com/slspencer/tmtp> (554 коммита), сайт <https://www.taumeta.org/> (последний пост 2013-02-05). Репо `tusuzu/taumeta`, указанный в `README2`, тоже 404.

**Чертежи**: Python-классы `Design(designBase)` с методом `pattern()`, вычисляющим точки из мер клиента (`SKIRT_LENGTH = 0.5 * CD.hip_to_floor`, `front_half_waist = CD.front_waist / 2.0`) через геометрические помощники `down/right/left/up/midPoint/intersectCircles/intersectLines/onLineAtLength/polar` `[VERIFIED]`. Клиентские мерки — `standalone/customer/Susan/Susan.json` на **67 полей** `[VERIFIED]`.

**Лицензия** `[VERIFIED]` — самая честная формулировка во всём исследовании:

> «This application is free software, but **designers who create pattern designs may use any license they wish for their designs.**»

При этом код — GPL-3.0 с дополнительным пунктом «**Attribution must be given in all derived works**» `[VERIFIED]`. Проекты помечают `setInfo('designerName', 'Ester Pivnick')` и `setInfo('companyName', 'Seamly Patterns')` — **стороннее авторство дизайна, термины не заявлены** `[VERIFIED]`.

**[INFERRED] Вывод:** лекала TMTP — превосходный **референс методики** (поясные вытачки, баланс, подбор посадки), но **не** готовый к встраиванию источник данных: лицензия дизайна неизвестна, проект мёртв с 2016 года, Python 2, зависимость `pysvg` с мёртвого хоста, припуски делаются ручным Inkscape-Offset.

### 2.4 MakeHuman / MPFB2 — CC0 на ассеты, но это 3D, а не лекала

**[VERIFIED]** Разделение лицензий — образцовое, его стоит взять за образец для нашего проекта:

* `LICENSE.md` §B: MakeHuman — **AGPL**, MPFB2 — **GPLv3** («in order to put it more in line with Blender's source code license»).
* `LICENSE.md` §C: «The assets are defined as any data contributing to the graphical output… **Clothes (any MHCLO-based asset)**… These assets have been released under **CC0 1.0 Universal**». В MPFB2 §C дополнительно: «Rigs, poses and expressions / JSON data with mesh information».
* `LICENSE.md` §D: «the MakeHuman project makes no claim whatsoever over output such as: Exports to files (FBX, OBJ, DAE, MHX2…), Exports via direct integration (import via MPFB), Graphical data generated via scripting or plugins, Renderings, Screenshots, Saved model files. **We regard these things as your data, which is yours to handle as you see fit.**» `[VERIFIED]`

**Почему это всё равно не лекала** `[VERIFIED]`: в `makehuman/` нет ни одного файла-лекала; в `mpfb2/src/mpfb/data/` — `3dobjs/base.obj`, `targets/`, `poses/`, `rigs/`, `textures/`. Одежда — `.mhclo` (3D-меш, привязанный к телу весами вершин и `hm08_config.json`). **Экспорт только 3D**: OBJ/FBX/DAE/MHX2; SVG/DXF/PDF нет.

**[INFERRED]** MakeHuman/MPFB2 полезен нам не как источник лекал, а как: (а) источник **CC0 3D-аватара** для 3D-примерки в нашем продукте; (b) эталон разделения «код / данные» в лицензировании; (c) донор пропорций для наших собственных блоков. Anny (Apache-2.0 + CC0) — более современный преемник того же актива.

### 2.5 Академические датасеты геометрии паттернов

| Датасет | Ссылка | Что это | Лицензия | Пригодность |
|---|---|---|---|---|
| **Garment-Pattern-Generator** (Zenodo) | <https://zenodo.org/records/5267549> | 23 500 3D-гардеров **с лекалами**, 12 типов изделий, 84.8 ГБ | **CC BY 4.0** (Zenodo `license.id: cc-by-4.0`) `[VERIFIED]` | ✅ Коммерчески можно (атрибуция, без share-alike). Но это **обучающий датасет**, а не редактируемая библиотека |
| **GarmentCodeData v2** | <https://igl.ethz.ch/projects/GarmentCodeData/>, DOI `10.3929/ethz-b-000690432` | 115 000 made-to-measure гардеров с ground-truth лекалами, UV, сегментацией | v1 — CC BY 4.0; **v2 — лицензия не указана** (DataCite `rightsList: []`, страница ETH Research Collection отдала 500) `[UNVERIFIED]` | ⚠️ Использовать v1 или запросить лицензию на v2 |
| **GarmentCode** (код) | <https://github.com/maria-korosteleva/GarmentCode> | Библиотека параметрических программ + GUI | **MIT** `[VERIFIED]` | ✅ Ядро параметризации, коммерчески свободно |
| **GarmageSet** | <https://huggingface.co/datasets/Style3D/GarmageSet> | Профессионально курируемый датасет паттернов | **CC BY-NC-ND 4.0**, gated `[VERIFIED]` | ❌ NC + ND → коммерчески исключён |
| **SewFactory / SewFormer** | <https://huggingface.co/datasets/liulj/sewfactory>, <https://sewformer.github.io/> | ~1 M изображений + ground-truth лекала (290 ГБ) | Не указана на карточке `[UNVERIFIED]` | ⚠️ Уточнить; 290 ГБ |
| **Fashionpedia** | <https://fashionpedia.github.io/home/data_license.html> | 93 600 **изображений** + онтология 27 категорий/19 частей/294 атрибута | Аннотации — **CC BY 4.0**; картинки — по лицензиям Flickr/Unsplash/Unsplash/Pexels `[VERIFIED]` | ❌ **Не паттерны.** Это изображения одежды. Как источник геометрии бесполезен |
| **DeepFashion** | <http://mmlab.ie.cuhk.edu.hk/projects/DeepFashion.html> | In-shop benchmark изображений | Соглашение: «available for **non-commercial research purposes only**», запрет reproduce/sell/exploit for commercial purposes `[VERIFIED]` | ❌ Не коммерческое, не паттерны |

> **Замечание о «SewNet» из задания.** Я не нашёл датасета паттернов одежды под названием «SewNet». Поиск возвращает: (а) `SewNet` — фреймворк телеком-сетей (ACM WWW 2004, <https://dl.acm.org/doi/10.1145/1367497.1367615>), неделю одежды; (б) коммерческий 3D-дизайнер «Sewnet» — не open-source. Реальные аналоги, покрывающие эту нишу, — **GarmentCodeData** и **SewFactory**. **Помечаем как `[UNVERIFIED]`/несуществующее в заявленном смысле.**

> **Замечание о DeepFashion.** Отдельно зафиксировано в самой статье GarmentCodeData: «To this day, Deep Fashion3D is the most diverse dataset of captured garments, but it contains only 563 items… These datasets are **unusable for sewing pattern reconstruction** since they do not provide the sewing patterns» `[VERIFIED]`. То есть даже академия признаёт: датасеты одежды без лекал для нашей задачи бесполезны.

### 2.6 Публично-доменные и коммерчески-бесплатные лекала (готовые, не параметрические)

**Open+Pattern** `[VERIFIED]` — <https://openpattern.io/>: 34 готовых набора из реальных винтажных/военных изделий (MA-1, CS95, Zeltbahn, костюмы, T-shirt трёх посадок). Форматы: CLO3D `.zprj`, DXF, PDF (full/A4/A0), GLB, PNG. Лицензия **CC BY 4.0** — «every pattern is free under CC BY 4.0. Use it, change it, sell what you make. Just credit Open+Pattern». Критично: это **статичные одноразмерные лекала** («Single-size patterns state the size and its measurements»), параметризации нет.

**Wikimedia Commons** `[VERIFIED]`:
* `Category:MoMu_Pattern-a-thon_patterns_svg` — ~48 исторических SVG-лекал из музея MoMu (Антверпен), загруженных по инструкции Pattern-a-thon; лицензия конкретных файлов — CC BY 4.0 (проверено на `File:Patroon jurk (ST2202).svg` → LicenseShortName «CC BY 4.0»).
* `Category:SVG_sewing_patterns` — 12 файлов; лицензии смешанные: `File:Circle skirt - clothing patterns.svg` → **CC BY-SA 3.0** (значит, на адаптации — share-alike), `File:The Shirt System sewing pattern.svg` → **CC BY-SA 3.0**, `File:Garment Diagram - Ladies' Basque (side back).svg` → **Public domain**.
* Винтажные книги: `The practical designer (Rosenfeld, 1918).djvu` → **Public domain**; `The Cutter's Practical Guide Part 13.djvu` → **Public domain**; `A scientific guide to practical cutting (1873)` → «No known copyright restrictions». Всего `Category:The Practical Designer` — 164 файла, `The Cutter's Practical Guide` — 13 файлов + подкаталог на 64.

**[INFERRED] Осторожно с CC BY-SA на Commons.** Share-alike распространяется только на *Adapted Material* (адаптацию). Если мы просто показываем/печатаем исходный SVG без изменения — §3(b) не включается. Но если мы **переносим геометрию в наш формат и правим её** — это адаптация, и наш файл должен быть CC BY-SA. Для коммерческого закрытого продукта это означает либо (а) не использовать CC BY-SA-файлы, либо (б) держать их в отдельной «CC BY-SA-зоне» с явной маркировкой и раздавать под CC BY-SA.

### 2.7 Отдельно: коммерческие САПР и методики (НЕ открытые источники)

Чтобы не тратить время, зафиксируем отрицательные результаты:

* **ESKO** (<https://www.esko.com/en/support/free-software>) — бесплатны только плагины и вьюеры (Data Exchange, ArtiosCAD Viewer, LinkEdge); сам ArtiosCAD/Studio — коммерческий проприетарный продукт. Никаких открытых лекал. `[VERIFIED]`
* **АССОЛЬ «Параметрика»** (<https://assol.org/parametrika>) — коммерческая САПР с библиотекой **>650 базовых конструкций и блоков** по методикам ЦОТШЛ, Мюллер и сын, Английская, Злачевская, 10 мерок, французская-белье. Продаётся (курсы от 49 тыс. ₽), в реестре российского ПО. **Это ровно то, что нам нужно по покрытию, но это НЕ open source** — лицензионно закрытый продукт. `[VERIFIED]` → `[INFERRED]`: методология (ЦОТШЛ/Мюллер) свободна как *метод*, но конкретные формулы и лекала — авторское право.
* **ЦОТШЛ и «Основы конструирования одежды»** (ЦОТШЛ, 1966) — советские учебники; в открытом доступе встречаются сканы на сайтах вроде `rusist.info`, `sheba.spb.ru`, `library.atu.edu.kz` без явной лицензии. **[UNVERIFIED]** — считать непригодными для прямого копирования; использовать как методический ориентир.
* **Make Your Own Patterns (Rene Bergh, 1995)** — <https://archive.org/details/make-your-own-patterns>: авторское право 1995, «All rights reserved. No part of this publication may be reproduced… without the prior written permission of the copyright owners», ISBN 978 1 84537 456 3. В Internet Archive лежит как заёмная копия, **не** свободная лицензия. `[VERIFIED]`
* **patternmaking по книгам** (Aldrich, Gilewska, Donnano, Chiappetta, Assembil, Hofenbitzer) — методы конструирования как таковые не охраняются авторским правом (идеи/формулы), но **конкретные чертежи и иллюстрации охраняются**. Именно поэтому OpenPattern (GPL) и toile (без лицензии) рискованны: они воспроизводят чужие чертежи.

---

## 3. Можно ли собрать достаточную библиотеку базовых моделей БЕЗ ручной отрисовки каждой?

### Вердикт

**Частично — да, но не из одного источника, и не полностью.** Реалистичная оценка:

| Что нужно | Что есть открыто | Разрыв |
|---|---|---|
| Базовые блоки: корсет (ж/м), юбка, брюки, рукав | FreeSewing (`bella`, `breanna`, `brian`, `bent`, `bibi`, `sarah`, `titan`, `noble`) — 8 блоков; Moldeon — 2; toile — 2; GarmentCode — `bodice.py` | **Покрыто частично.** Женский корсет, мужской корсет, брюки, юбка — есть. Не хватает: детские блоки, блок нижнего белья, блок плеча/рукава как самостоятельного элемента, мужская/женская детская фигура |
| Изделия: футболка, худи, свитер, рубашка, брюки, юбка, платье, верхняя одежда | FreeSewing — 74 дизайна (всё вышеперечисленное + жакет, пальто, кожаный костюм, платья, аксессуары) — **это основной донор** | **Покрыто на ~90 %** типового ассортимента |
| Мужская/женская/детская фигура, размерные сетки | FreeSewing `@freesewing/models` (муж 32–50, жен 28–46); Seamly2D — GOST_man_ru (76 мер); Valentina — GOST_man_ru | **Разрыв:** нет детской размерной сетки, нет женской мультиразмерной таблицы в Seamly2D/Valentina, нет русской/европейской женской таблицы |
| Градация (grading rules) | Ничего открытого и пригодного не найдено | **Критический разрыв.** Во всех источниках есть персональная посадка по обхватам, но **нет** правил перехода от базового размера к размерной сетке |
| Техническое описание (tech pack): спецификация, BOM, раскладка | FreeSewing — есть snippets, dimension-annotations, grainline, `plugin-bin-pack`; Moldeon — JSON-модель + DXF | **Покрыто частично** |

### Ответ на ключевой вопрос: реальные параметрические конструкции vs статичные контуры

**[VERIFIED] Реальные параметрические конструкции дают только:**

1. **FreeSewing** — 74 дизайна, каждый пересчитывается по 37 обхватам + опциям. Это **единственный** источник, который одновременно: (а) массовый, (б) параметрический, (в) MIT-лицензированный вместе с данными. **Номер один.**
2. **GarmentCode / pygarment** — 7–8 программ-конструкций (корсет, брюки, футболка, круговая и панельная юбки, воротники, рукава). MIT. Покрытие малое, но качество построения высокое, и это **научный** источник с рецензируемыми статьями (SIGGRAPH Asia 2023, ECCV 2024).
3. **Moldeon** — 6–7 базовых шаблонов, MIT, формулы на TS + Rust/WASM-ядро. Молодой, но технически самый «чистый» источник под наш собственный движок.
4. **ChristinaHein/shirt** — одна рубашка, но полная (3 уровня детализации), MIT, вывод SVG+DXF. Формат MATLAB.
5. **OpenPattern** — ~10 модулей на 3 методики, GPL-код, реальный пересчёт по ~50 меркам.
6. **TMTP** — ~36 конструкций, GPL-код, пересчёт по 67 меркам клиента, **но лицензия данных не определена**.

**Статичные одноразмерные контуры** (параметризации нет — пригодны как референс геометрии или как «сырьё» для ручного переноса в нашу модель): Open+Pattern (34), Wikimedia MoMu (~48), Wikimedia винтажные книги, `tabjy/clo3d-patterns` (13 CLO3D-проектов), `schackartk/sewing_patterns` (2 PDF), `rationaldresssociety/JUMPSUIT-patterns` (~120 PDF), `candideu/ADIFF` (~27 PDF).

**[INFERRED] Практический вывод.** Собрать библиотеку «без ручной отрисовки каждой» **возможно для ~60–70 % типового ассортимента**: 74 дизайна FreeSewing закрывают верхнюю одежду, низ, бельё, аксессуары; к ним добавляются 2–3 блока GarmentCode/Moldeon и пара блоков из OpenPattern (по методу Aldrich/ЦОТШЛ-подобному). **Но 30–40 % придётся дорабатывать самим**, и это не «дизайнерская» работа, а инженерная:

1. **Детские блоки** — нет ни у кого (нужны размерные сетки ГОСТ/ГОСТ Р или ЕС).
2. **Градация** — ни у кого нет правил градации; нужен собственный движок (у нас он, по плану, и так пишется).
3. **Женская мультиразмерная таблица** — Seamly2D/Valentina имеют только GOST мужскую.
4. **Перенос геометрии** — у всех open-source движков своя модель данных (`.mjs`-код, `.val`-XML, JSON-DSL, Python). Это **не** «импорт готовых лекал», а **реализация чужих формул в нашем движке** — работа порядка недели на один блок.

**[PROPOSAL]** Оптимальная стратегия — **портировать, а не встраивать**: взять 74 дизайна FreeSewing как *спецификацию* (что строим, с какими мерками и опциями) и реализовать их формулы в нашем собственном детерминированном движке. Тогда мы (а) не тащим чужой JS-рантайм и npm-монолит, (б) сохраняем MIT-атрибуцию в понятной форме (список авторов из `about.json`), (в) получаем единый формат хранения вместо 4 несовместимых, (г) избегаем vendor-lock. Реализация формул — механическая работа по спецификации, а не «отрисовка каждого лекала вручную», что и требуется.

---

## 4. Лицензионные риски для коммерческого закрытого SaaS

### 4.1 Классификация по риску

**🟢 ЗЕЛЁНЫЙ — можно встраивать (при сохранении указанных условий)**

| Проект | Условие |
|---|---|
| **FreeSewing** (код + 74 дизайна) | MIT: сохранить текст «Copyright (c) 2022 Joost De Cock … Permission is hereby granted…» в существенных копиях. Атрибуция авторов — из `about.json` (социальная, не лицензионная, но уважаемая практика). Ни copyleft, ни share-alike, ни NC. |
| **GarmentCode / pygarment** | MIT — то же условие. В коде есть ссылки на публикации — сохранять цитирование уместно. |
| **Garment-Pattern-Generator (код)** | MIT. Дополнительно ассеты: SMPL-тело — **CC BY 4.0**, нужна атрибуция SMPL. |
| **GarmentCodeData v1 (Zenodo)** | **CC BY 4.0** — атрибуция, без share-alike. |
| **Moldeon** | MIT. Если встраиваем *исходник формул* — сохранить MIT-уведомление. Если встраиваем только *рендер-вывод* — MIT до вывода не дотягивается (это не «копия программы»), но безопаснее атрибутировать. |
| **ChristinaHein/shirt** | MIT. Внимание: метод ссылается на книгу Hofenbitzer и туториал Altmann — **их текст/чертежи не под MIT**; копировать можно авторский код, не книгу. |
| **MakeHuman / MPFB2 / Anny — ассеты** | **CC0** — без условий. Код (AGPL/GPL/Apache) в SaaS не встраиваем. |
| **Open+Pattern** | **CC BY 4.0** — атрибуция «Open+Pattern» (страница или FAQ). Share-alike на дизайнах **нет**. |
| **Wikimedia Commons — файлы CC BY 4.0** (MoMu, отдельные SVG) | Атрибуция: создатель + лицензия + ссылка + указание на модификацию. Share-alike **нет**. |
| **Wikimedia Commons — Public domain** (вив. книги 1873–1918, отдельные SVG) | Ничего не требуется. Проверить PD-статус под целевой юрисдикцией. |
| **franken_textiles** | MIT **+ rider**: запрет предоставлять ПО или производные работы OpenAI/Anthropic и их аффилированным/агентам. Если наш AI-слой обращается к внешнему LLM — rider надо прочитать дословно и применить. Anny: Apache-2.0 + CC0. |

**🟡 ЖЁЛТЫЙ — можно с обязательствами / после консультации**

| Проект | Проблема | Обходной путь |
|---|---|---|
| **Seamly2D / Valentina — файлы `.sm2d`/`.val`** | Отдельной лицензии данных нет → наследуют GPL-3.0. В коллекции Valentina есть файлы со сторонним авторством (`Stinde Design`). | **[INFERRED]** Не распространять их файлы как свои данные. Взять как **референс спецификации** (что замеры, какие формулы, какая конструкция) и переписать в своём формате — это даёт чистую геометрию, но нужно доказать независимую разработку. Как минимум — не включать `.val`/`.sm2d` в дистрибутив. |
| **OpenPattern** | GPL-3.0 код + **геометрия выведена из трёх коммерческих книг** (Chiappetta, Gilewska, Donnano) | GPL на код можно обойти (не линковать, а читать/портировать). Но книжная геометрия = отдельный авторский риск, который GPL не снимает. Использовать только как **учебный референс формул**, не копировать контуры. |
| **Wikimedia CC BY-SA 3.0 файлы** (`Circle skirt`, `The Shirt System`) | Адаптация → наш файл обязан быть CC BY-SA | Держать в отдельной зоне с маркировкой; либо не использовать |
| **Patro / PyValentina** | AGPL-3.0 на код | Использовать **только формат** `.val`/`.vit` как контракт обмена. Код не встраивать |
| **TMTP** | GPL-3.0 код; лицензия дизайна неизвестна | Методику — да, дизайны — только после выяснения прав |
| **DressCode / GarmageNet / exo-sample-3d** | GPL-3.0 или CC BY-NC-ND | Не встраивать. Использовать как референс архитектуры (GarmentCode-JSON-импорт в Studio — хороший пример интеграции) |

**🔴 КРАСНЫЙ — исключить из коммерческого использования**

| Проект | Причина | Источник |
|---|---|---|
| **Aras** | **PolyForm Noncommercial 1.0.0** — только некоммерческое использование | <https://raw.githubusercontent.com/Joosehot/Aras/main/LICENSE> `[VERIFIED]` |
| **GarmageSet** | **CC BY-NC-ND 4.0** + gated | HF API `license: cc-by-nc-nd-4.0` `[VERIFIED]` |
| **schackartk/sewing_patterns** | **CC BY-NC-SA 4.0** — NC-элемент переживает share-alike (§3(b)(1)) | `<https://raw.githubusercontent.com/schackartk/sewing_patterns/main/LICENSE>` `[VERIFIED]` |
| **candideu/ADIFF-Open-Source-Fashion-Cookbook** | Лицензия прямо: «only for personal use and may not be used for commercial or resale purposes» | LICENSE-файл `[VERIFIED]` |
| **myogpatterns** | Лицензии нет; автор: «LearnMYOG patterns are for personal use only» | repo README `[VERIFIED]` |
| **toile** | **Нет лицензии** → all rights reserved | 404 на license endpoint `[VERIFIED]` |
| **darrenstarr/Patterns** | Нет лицензии + геометрия из книг Barrington | repo listing + README `[VERIFIED]` |
| **htemuri/sewing** | Нет лицензии | repo listing `[VERIFIED]` |
| **rationaldresssociety/JUMPSUIT-patterns** | Нет лицензии, несмотря на «open source» в README | API `license: null` `[VERIFIED]` |
| **DeepFashion** | Non-commercial research only; запрет sell/exploit for commercial purposes | Agreement PDF `[VERIFIED]` |
| **Fashionpedia** | Изображения, не паттерны; картинки — по чужим лицензиям | Terms of Use `[VERIFIED]` |
| **Patro / Patro code as dependency** | AGPL §13 — сетевое использование модифицированной версии требует исходников | `[INFERRED]` из текста AGPL |

### 4.2 Рекомендованный подмножество

**Ядро (встраивать/портировать):**

```
1. FreeSewing          — 74 дизайна + ядро        MIT
2. GarmentCode/pygarment — 7-8 конструкций + JSON  MIT
3. Moldeon              — 6-7 базовых шаблонов      MIT
4. ChristinaHein/shirt — рубашка (3 уровня)        MIT
```

**Справочные (использовать как спецификацию формул, не как файлы):**

```
5. Seamly2D            — .sm2d + 245 мер + формулы  GPL-3.0 (код)
6. Valentina           — .val + 76 мер + формулы    GPL-3.0 (код)
7. TMTP                — 36 конструкций + 67 мер    GPL-3.0 (код)
8. OpenPattern         — 3 методики + ~50 мер        GPL-3.0 (код)
9. Open+Pattern        — 34 готовых лекала          CC BY 4.0 (данные)
10. Wikimedia MoMu     — ~48 исторических SVG       CC BY 4.0 (данные)
11. Wikimedia вив.книги — PD-методика 1873-1918     Public domain
```

**Ассеты 3D (не лекала):**

```
12. MakeHuman/MPFB2 / Anny — CC0 тело и одежда
```

**Исключить:** Aras, GarmageSet, schackartk, ADIFF Cookbook, myogpatterns, toile, darrenstarr, htemuri, JUMPSUIT-patterns, DeepFashion, Fashionpedia (как источник паттернов).

### 4.3 Конкретные обязательства, которые придётся выполнить

1. **NOTICE-файл в продукте.** Для MIT-источников (FreeSewing, GarmentCode, Moldeon, ChristinaHein/shirt) — текст MIT и copyright каждого. Для CC BY (Open+Pattern, Wikimedia CC BY 4.0) — «создатель, лицензия, ссылка, указание на модификацию» + URI лицензии.
2. **Реестр происхождения лекал.** Для каждого базового блока хранить: `source_project`, `source_author` (из `about.json` FreeSewing: `design` и `code` — это **разные** люди), `source_license`, `source_url`, `modifications`. Это одновременно юридическая гигиена и продуктовая фича («на чём основана эта выкройка»).
3. **Разделение code/data в нашем репозитории** — по образцу MakeHuman `LICENSE.CODE.md` / `LICENSE.ASSETS.md`: `LICENSE-CODE.md` (наш собственный код, проприетарный) и `LICENSE-DATA.md` (лицензии импортированных лекал + NOTICE). Это позволит отгружать лекала отдельно от кода.
4. **CC BY-SA-карантин.** Если мы всё же берём Commons-файлы под CC BY-SA 3.0 — изолировать их в отдельном каталоге данных с явной пометкой и отдавать под CC BY-SA; не смешивать с нашими собственными производными блоками.
5. **Не линковать GPL/AGPL-движки.** Seamly2D/Valentina/TMTP/Patro можно использовать *offline* для сверки результатов и для извлечения спецификаций, но нельзя встраивать их код в наш сервис. Для сверки — headless CLI в отдельном контейнере на этапе разработки, результат — числа, не артефакт.
6. **franken_textiles rider** — если продукт будет обращаться к внешним LLM (OpenAI/Anthropic), нужно проверить, покрывает ли rider такой сценарий. Он прямо запрещает «provide, disclose, distribute, sublicense, sell, lease, lend, host, make available … to or for any Restricted Party». `[INFERRED]` — риск для AI-функций.
7. **Не копировать коммерческие выкройки** — это не только лицензия, но и репутация. FreeSewing формулирует это прямо (<https://freesewing.dev/guides/faq/is-copying-ok/>): копировать коммерческие лекала — «dick move». Мы берём **метод и математику**, а не чужие лекала.
8. **Товарные знаки** — CC BY / MIT не дают права на «Gucci» и т. п. Ни один из источников не даёт trademark-лицензий.

---

## 5. Проверенные URL (полный список)

**Ядро проектов**
- <https://codeberg.org/freesewing/freesewing> · <https://github.com/freesewing/freesewing> (архив) · <https://freesewing.dev/reference/measurements/> · <https://freesewing.dev/reference/settings/> · <https://freesewing.dev/reference/macros/> · <https://freesewing.dev/reference/plugins/> · <https://freesewing.eu/docs/designs> · <https://freesewing.dev/guides/faq/is-copying-ok/> · <https://github.com/freesewing/pattern>
- <https://github.com/FashionFreedom/Seamly2D> · <https://wiki.seamly.io/wiki/API_documentation> · <https://github.com/seamly/Seamly2D> (форк)
- <https://gitlab.com/smart-pattern/valentina> · <https://github.com/dismine/valentina> (зеркало) · <https://smart-pattern.com.ua/en/blog/2025/08/25/release-valentina-10/>
- <https://github.com/slspencer/TauMeta> · <https://github.com/slspencer/tmtp> · <https://www.taumeta.org/> · <https://github.com/slspencer/InkscapeSewingPatternExtensions>
- <https://github.com/makehumancommunity/makehuman> · <https://github.com/makehumancommunity/mpfb2> · <https://static.makehumancommunity.org/about/license.html> · <https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html>
- <https://github.com/maria-korosteleva/GarmentCode> · <https://pypi.org/project/pygarment/> · <https://github.com/maria-korosteleva/Garment-Pattern-Generator> · <https://zenodo.org/records/5267549> · <https://igl.ethz.ch/projects/GarmentCodeData/> · <https://arxiv.org/abs/2405.17609> · <https://github.com/mbotsch/GarmentMeasurements> · <https://github.com/naver/anny>
- <https://github.com/fmetivier/OpenPattern> · <https://github.com/GabrielVioli/Moldeon> · <https://github.com/Elmseld/toile> · <https://github.com/Joosehot/Aras> · <https://github.com/FabriceSalvaire/Patro> · <https://github.com/ChristinaHein/shirt> · <https://github.com/Dicklesworthstone/franken_textiles> · <https://github.com/textiles-lab/parametric-sweater> · <https://github.com/rckTom/ChuteMaker> · <https://github.com/mnesarco/inkscape-parametric> · <https://github.com/kutur-labs/ktr> · <https://github.com/destos/Patterner> · <https://github.com/kirchner/bodice-block> · <https://github.com/kirchner/sewing-pattern-editor> · <https://github.com/tabjy/clo3d-patterns> · <https://github.com/schackartk/sewing_patterns> · <https://github.com/darrenstarr/Patterns> · <https://github.com/htemuri/sewing> · <https://github.com/myogpatterns/myogpatterns.github.io> · <https://github.com/rationaldresssociety/JUMPSUIT-patterns> · <https://github.com/candideu/ADIFF-Open-Source-Fashion-Cookbook> · <https://github.com/cdrinmatane/Costumy> · <https://github.com/IHe-KaiI/DressCode> · <https://github.com/Style3D/garmagenet-impl> · <https://github.com/mikristian/exo-sample-3d> · <https://github.com/ahzs645/seamer-studio>

**Датасеты и данные**
- <https://huggingface.co/datasets/Style3D/GarmageSet> · <https://huggingface.co/datasets/liulj/sewfactory> · <https://sewformer.github.io/> · <https://fashionpedia.github.io/home/data_license.html> · <https://github.com/cvdfoundation/fashionpedia> · <http://mmlab.ie.cuhk.edu.hk/projects/DeepFashion/DeepFashionAgreement.pdf> · <https://github.com/sail-sg/sewformer>

**Лекала и методология**
- <https://openpattern.io/> · <https://openpattern.io/pattern-library/> · <https://commons.wikimedia.org/wiki/Category:MoMu_Pattern-a-thon_patterns_svg> · <https://commons.wikimedia.org/wiki/Category:SVG_sewing_patterns> · <https://commons.wikimedia.org/wiki/Category:The_Practical_Designer> · <https://commons.wikimedia.org/wiki/Category:The_Cutter%27s_Practical_Guide> · <https://commons.wikimedia.org/wiki/Commons:GLAM/MOMU/Pattern-a-thon_upload_instructions> · <https://archive.org/details/make-your-own-patterns> · <https://assol.org/parametrika> · <https://www.esko.com/en/support/free-software>

**Лицензии**
- <https://creativecommons.org/licenses/by/4.0/legalcode.en> · <https://creativecommons.org/licenses/by-sa/4.0/legalcode.en> · <https://www.gnu.org/licenses/gpl-3.0.html> · <https://www.gnu.org/licenses/agpl-3.0.html> · <https://polyformproject.org/licenses/noncommercial/1.0.0/>

---

## 6. Что НЕ удалось проверить (честный список)

1. **Лицензия данных GarmentCodeData v2** — DataCite отдаёт пустой `rightsList`, страница ETH Research Collection вернула HTTP 500 / пустой рендер. Нужно письменное подтверждение от ETH. `[UNVERIFIED]`
2. **Лицензия SewFactory** — карточка HF не содержит поля license. `[UNVERIFIED]`
3. **Per-file лицензии дизайнов TMTP и коллекции Valentina** — пер-файловых заголовков нет, только указание авторства. `[UNVERIFIED]`
4. **Точное число ассетов одежды MakeHuman/MPFB2** — канонический LFS-репозиторий `makehumancommunity/makehuman-assets` отдаёт 404 по HTTP; список ~90 имён виден на странице ассет-пака. `[UNVERIFIED]`
5. **Датасет «SewNet»** — не существует в смысле геометрии паттернов; см. §2.5. `[UNVERIFIED]`
6. **Публично-доменный статус конкретных винтажных книг под целевой юрисдикцией** — статус «Public domain» подтверждён на страницах Commons, но это заявление площадки; при выходе на рынок вне США/ЕС стоит перепроверить срок (страна смерти автора + 70 лет). `[INFERRED]`
7. **Публично-доменный статус русских учебников ЦОТШЛ** — сканы найдены без явной лицензии; авторские права советских изданий не проверены. `[UNVERIFIED]`
8. **`github.com/kigyui/latexpatterns`** (упоминается в README tabjy/clo3d-patterns как Apache-2.0-источник) — 404, подтвердить не удалось. `[UNVERIFIED]`
9. **Существование `tau-cloth`** — ни на GitHub, ни на GitLab, ни на Bitbucket следов не найдено. `[UNVERIFIED]` (скорее всего, не существует)
10. **PyPI-страница `Patterner`** — отдала bot-challenge; состояние опубликованного пакета не подтверждено. `[UNVERIFIED]`
