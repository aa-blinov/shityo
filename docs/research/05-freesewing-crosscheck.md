# 05. Сверка с FreeSewing: формулы построения

**Назначение.** Проверка наших конструкций (`backend/app/drafts/*.py`) против реальных параметрических
лекал FreeSewing — единственного открытого проекта, где формулы построения выложены текстом и
где их можно прогнать и получить числа. Цель — не «сравнить похожее», а найти места, где наша
формула даёт физически невозможный результат, и перенять проверенные приёмы.

**Дата проверки:** 2026-11-03.

**Источник FreeSewing.** Репозиторий `codeberg.org/freesewing/freesewing`, ветка `develop`,
версия `4.10.2` `[VERIFIED]` (файл `VERSION`, `package.json` пакетов). Лицензия — **MIT**,
Copyright (c) 2022 Joost De Cock (файл `LICENSE` в корне репозитория) `[VERIFIED]`.
GitHub-зеркало `github.com/freesewing/freesewing` помечено как архивное; ветки `v3.3.0-rc.1` и
`v2.22.1` проверены — в них пакетов `@freesewing/basic-block`, `@freesewing/un-jet-block`,
`@freesewing/brian-block`, `@freesewing/sarah-block` **нет** (в v3.3.0-rc.1 в `packages/` лежат
только `core`, `models`, `new-design`, `prettier-config`, `react-components`, `rehype-highlight-lines`,
`rehype-jargon`, `snapseries`), и в npm-реестре они отдают 404 `[VERIFIED]`. Актуальная структура
FreeSewing v4: `designs/<name>/src/*.mjs` (лекала), `packages/library/src/` (библиотека деталей:
прямоугольник, рукав), `packages/core/` (движок), `packages/models/` (наборы мерок), `packages/config/`
(список мерок), `plugins/plugin-measurements/` (производные мерки). Поэтому сравнивать надо с
`designs/`, а не с «блоками» из задания.

**Метод проверки — не чтение, а прогон.** Чтобы формула была «прочитанным источником», а не
пересказом, пакеты `@freesewing/{teagan,brian,library,titan,sarah,simon,core,models}@4.10.2` были
установлены из npm и лекала построены headless на мерках `cisFemaleAdult36`. Все числа в колонке
«FreeSewing» ниже — это **измеренный выход реального кода**, а не вычисление нами по формуле.
Мерки этой фигуры (мм): `chest 979, waist 788, hips 953, seat 1046, seatBack 538, waistBack 399,
neck 360, biceps 286, shoulderToShoulder 431, shoulderSlope 13°, shoulderToWrist 600,
hpsToBust 286, hpsToWaistBack 410, waistToArmpit 177, waistToHips 130, waistToSeat 260,
waistToUpperLeg 296, waistToFloor 1075, waistToKnee 623, inseam 776, knee 395, crossSeam 766,
crossSeamFront 383, wrist 170`.

**Снимок нашего кода.** Файлы `backend/app/drafts/` в момент проверки активно правились параллельными
агентами. Формулы прочитаны из этих конкретных SHA-256 `[VERIFIED]`:

| файл | sha256 |
|---|---|
| `tee.py` | `60f9be7c6f6c594455add79a78f1fcd8b934c0a97cfd0f303b9adc95cf03560b` |
| `shirt.py` | `ed03b9807efbdb89b0361b7c03f27700ecd7885abfd21cb48036e25080a85a9a` |
| `trousers.py` | `ca5cb7a94dd3290a6d5776700d62401d5fd37010a8c5415fd0b654edc318c2cd` |
| `skirt.py` | `7c2797ce19cdd9ca2099271e77c6aaae2c8d224e8382135f46f764a75241a9f1` |
| `catalog.py` | `5de04c72f92321850a7640180c026a5d39c6f2bd8af6b6f1c0455a0875548d36` |
| `common.py` | `1870fc31b52ba6ea7e5cdf636623d2d9bc404af8a1a38080f1ccbfdaf33369dc` |

**Единицы и соглашения.** FreeSewing считает в миллиметрах; мы чертим в сантиметрах и храним
геометрию деталей в миллиметрах. Обе системы используют **полные** обхваты (грудь, талия, бёдра) и
делят их на 4, получая ширину от центра до бокового шва — это единственное соглашение, которое у нас
совпадает точно.

---

## 0. Краткие выводы

1. **Топология ширины панели у нас правильная.** `(обхват + прибавка) / 4` — то же, что
   `chest * (1 + chestEase) / 4` у FreeSewing. Но прибавка задана у нас в сантиметрах, а у них — в
   процентах от обхвата. Для градации это принципиальная разница (§2.1, §2.15).
2. **Пять формул у нас неверны в физическом смысле** — они дают результат, невозможный на фигуре:
   ширина горловины (§2.3), глубина выреза горловины (§2.4), глубина проймы (§2.5), ширина рукава
   (§2.7) и глубина вытачки рубашки (§2.11).
3. **У нас нет вертикальных мерок вообще.** В `catalog.py` есть только `height`, `back_length`,
   `sleeve_length`, `crotch_depth`, `inseam_length`, `knee_length`, `skirt_length` — и ни одной
   анатомической вертикали (`hpsToWaistBack`, `waistToArmpit`, `waistToHips`, `waistToSeat`,
   `waistToUpperLeg`). FreeSewing построен целиком на них. Отсюда и наши прокси через рост:
   `(height - 176) * 0.04`, `(height - 176) * 0.06`, `(height - 170) * 0.03` — три попытки заменить
   отсутствующие мерки.
4. **Подгонка длины оката под длину проймы у нас уже есть и сделана правильно** (§2.7) — это редкий
   случай, когда мы ahead. Но мы подгоняем ширину рукава, а FreeSewing — высоту оката, держа
   ширину по бицепсу; поэтому наш рукав шире руки на 12 см.
5. **Размеров у нас нет.** FreeSewing: размер = набор мерок, градация = построение лекала под каждый
   набор и наложение (`Pattern.sampleModels()`). У нас: 4 режима посадки, масштабирующие прибавки
   (§2.15).

---

## 1. Что именно сравниваем

| наш модуль | конструкция | ближайший аналог в FreeSewing | файл |
|---|---|---|---|
| `tee.py` | футболка, раздельные перед/спинка + рукав | **Teagan** (T-shirt) на блоке **Brian** | `designs/teagan/src/*`, `designs/brian/src/base.mjs` |
| `shirt.py` | рубашка с вытачками, воротником, манжетами | **Simon** (button-down shirt) на блоке **Brian** | `designs/simon/src/*`, `designs/brian/src/base.mjs` |
| `trousers.py` | брюки, передняя и задняя штанины | **Titan** (trouser block) | `designs/titan/src/*` |
| `skirt.py` | юбка с расклешением | **Sarah** (skirt block) + **Sunny** (split skirt) + **Sandy** (circle skirt) | `designs/sarah/src/base.mjs`, `designs/sunny/src/base.mjs`, `designs/sandy/src/skirt.mjs` |
| общий рукав | окат рукава | **library.sleeve** | `designs/library/src/sleeve/index.mjs` |

Диапазон поиска в FreeSewing покрывает 80 лекал в `designs/`; кроме перечисленных для сравнения
пригодны `shelly` (swim shirt, расклешённый трикотаж на бицепсе), `sven`/`hugo`/`huey` (свитшоты),
`charlie` (чиносы поверх Titan), `paco` (брюки), `penelope` (карандашная юбка), `brian` (мужской
базовый блок), `bella`/`bent`/`noble`/`breanna`/`bibi` (женские блоки).

---

## 2. Таблица сравнения

Колонка «кто прав» развёрнута в §3. Формулы FreeSewing приведены как в коде; ссылки — на файлы
и строки, которые были прочитаны.

### 2.1 Футболка: ширина панели

| | наша формула | FreeSewing |
|---|---|---|
| формула | `half_width = (bust + ease_bust) / 4`<br>`backend/app/drafts/tee.py:50` | `points.armhole = new Point((measurements.chest * (1 + options.chestEase)) / 4, cbArmhole.y)`<br>`designs/brian/src/base.mjs:126-129` |
| прибавка | `ease_bust = 4.0` **см** (`tee.py:38`, `catalog.py:56`) | `chestEase: { pct: 12, min: 5, max: 25, ...pctBasedOn('chest') }` — **12 % от обхвата**<br>`designs/teagan/src/front.mjs:300` |
| измерено | half-width **250.0 мм** (bust 96 см), панель 500 мм, обхват 1000 мм | armhole.x = **274.12 мм** = 979 × 1.12 / 4 |
| вердикт | **структура верна, единица прибавки неверна** | прав в подходе с процентом |

### 2.2 Футболка: ширина по талии

| | наша формула | FreeSewing |
|---|---|---|
| формула | `waist_half = min((waist + ease_bust) / 4, half_width)`<br>`tee.py:51` | `points.waist = new Point(points.armhole.x, points.cbWaist.y)` — ширина по талии = ширине по груди; сужение только опцией `fitWaist`: `midWidth = (waist * (1 + waistEase)) / 4`<br>`designs/brian/src/base.mjs:136`, `designs/teagan/src/front.mjs:29` |
| измерено | **220.0 мм** | **281.13 мм** (при `fitWaist = false`, значении по умолчанию) |
| вердикт | **FreeSewing** | |

### 2.3 Футболка: ширина горловины — критично

| | наша формула | FreeSewing |
|---|---|---|
| формула | `neck_half = neck_circ / 4 + 0.5`<br>`tee.py:53` | `points.neck = new Point((measurements.neck * (1 + options.collarEase)) / options.collarFactor, 0)`, `collarFactor = 4.8` (`base.mjs:82-86`). **Затем** длина выреза подгоняется итеративно: `delta = paths.neckOpening.length() * 2 - target`, где `target = measurements.neck * (1 + options.collarEase)`; цикл до 10 итераций (`base.mjs:191-211`) |
| измерено | полуширина **105.0 мм**; суммарная длина выреза (перед 131.0 + спинка 98.8) = **229.8 мм** при шее 360 мм | полуширина **75.0 мм**; длина выреза **= 360 мм = обхвату шеи** |
| вердикт | **FreeSewing, однозначно** | |

### 2.4 Футболка: глубина выреза горловины

| | наша формула | FreeSewing |
|---|---|---|
| формула | `neck_depth = NECK_DEPTHS[neckline]` — таблица **абсолютных см**: crew 8.5, v 20.0, square 4.0, scoop 11.0 (`tee.py:21-28`); спинка — 2.5 (`tee.py:88`) | `points.cfNeck = new Point(0, options.necklineDepth * measurements.hpsToWaistBack)` — 25 % от вертикали HPS→талия; ширина: `points.neck = points.hps.shiftFractionTowards(points.shoulder, options.necklineWidth)` — 30 % пути HPS→плечо<br>`designs/teagan/src/front.mjs:66, :68`; опции `:315-317` |
| измерено | **85.0 мм** (crew) | cfNeck.y = **102.5 мм** = 0.25 × 410 |
| вердикт | **FreeSewing** | |

### 2.5 Футболка: глубина проймы

| | наша формула | FreeSewing |
|---|---|---|
| формула | `armhole_depth = bust / 4 + 6.0`, затем `+= (height - 176) * 0.04`<br>`tee.py:55-57` | новый путь (по умолчанию): `points.cbArmhole = new Point(0, points.cbWaist.y - measurements.waistToArmpit * (1 - options.armholeDepth - options.bicepsEase / 2))`, `armholeDepth = 2 %`, `bicepsEase = 5 %`<br>legacy-путь: `points.shoulder.y + measurements.biceps * (1 + bicepsEase) * options.armholeDepthFactor` (`armholeDepthFactor = 55 %`)<br>`designs/brian/src/base.mjs:100-117` |
| измерено | **300.0 мм** | cbArmhole.y = **240.965 мм** = 410 − 177 × (1 − 0.02 − 0.025); legacy дал бы 197.6 мм |
| вердикт | **FreeSewing** | |

### 2.6 Футболка: положение плечевой точки

| | наша формула | FreeSewing |
|---|---|---|
| формула | `shoulder_tip_x = min(shoulder_width / 2, half_width - 1.0)`; `shoulder_drop = 4.5` (константа)<br>`tee.py:54, :59` | `points.shoulder = utils.beamsIntersect(points.hps, points.hps.shift(measurements.shoulderSlope * -1, 100), new Point(shoulderToShoulder / 2 + shoulderEase, -100), new Point(shoulderToShoulder / 2 + shoulderEase, 100))` — луч под углом `shoulderSlope` пересекает вертикаль на `shoulderToShoulder / 2`; далее `shoulderSlopeReduction` опускает плечо<br>`designs/brian/src/base.mjs:88-95, :119-121` |
| измерено | shoulder_tip_x = **230.0 мм**, drop = **45 мм** | shoulder = **(215.5, 32.44)**; shoulderToShoulder/2 = 215.5 мм, высота задана углом 13° |
| вердикт | **FreeSewing по вертикали; наш `min()` — приемлемый аналог их предупреждения `brian:largeShoulderWidth` (`base.mjs:133-136`)** | |

### 2.7 Футболка: ширина и высота оката рукава — критично

| | наша формула | FreeSewing |
|---|---|---|
| длина оката | `target_cap_length = 2.0 * armhole_length`; `_solve_cap_half` бинарным поиском ищет `cap_half`, при котором длина дуги == target; `cap_rise = cap_half * 0.28`<br>`tee.py:104`, `:225-256` | `sleevecapTarget = frontArmholeLength + backArmholeLength + armholeLength * sleevecapEase`; итерация `__sleevecapFactor` до `|sleevecapLength − target| ≤ 2 мм`<br>`designs/library/src/sleeve/index.mjs:161-164, :24-31` |
| ширина рукава | **подгоняется под длину** — ширина рукава ни с чем не связана | `halfWidth = measurements.biceps * (1 + bicepsEase) / 2`; `points.bicepsLeft = centerBiceps.shift(180, halfWidth * sleeveWidthGuarantee + halfWidth * (1 − sleeveWidthGuarantee) * __sleevecapFactor)` — **ширина от бицепса**<br>`designs/library/src/sleeve/index.mjs:62-68` |
| высота оката | `cap_rise = cap_half * 0.28` — фиксированная пропорция ширины | `points.centerCap = centerBiceps.shift(90, sleevecapTopFactorY * (hpsToWaistBack − waistToArmpit) * (1 + armholeDepth) * 0.75 * __sleevecapFactor)`, `sleevecapTopFactorY = 45 %`; центр смещается к `capLeft/capRight` через `sleevecapTopFactorX = 50 %`<br>`designs/library/src/sleeve/index.mjs:41-59`, опции `:180-181` |
| измерено | cap_len = **512.9 мм** (совпало с 2 × armhole_length = 512.9); cap_width = **466.3 мм**; cap_rise = **65.3 мм** | sleevecapLength = **486.18 мм** при target 485.98 мм (frontArmholeLength 243.76 + backArmholeLength 242.22); ширина по бицепсу = **344.6 мм** (286 × 1.05 × 1.15); centerCap.y = **−198.62 мм** (высота оката) |
| вердикт | **метод подгонки — наш, и он прав; ширина — FreeSewing; высота — FreeSewing** | |

#### Длина самой цепи проймы (проверено 2026-11-03)

Длина цепи проймы - это длина шва от плечевой точки до подмышки на одной
стороне; окат рукава сшивается с проймой переда и проймой спинки, поэтому
сумма цепей должна равняться длине оката.

| | наша футболка (46) | FreeSewing brian (chest 979) |
|---|---|---|
| цепь проймы, одна сторона | **194.0 мм** | **243.76 мм** |
| глубина проймы (HPS → подмышка) | 229.9 мм | 240.965 мм |
| плечевая точка | (230; 39.3) | (215.5; 31.6) |
| подмышка | (260; 229.9) | (274.1; 241.0) |
| вертикальный перепад цепи | 190.6 мм | 209.4 мм |
| горизонтальный размах цепи | **30 мм** | **58.6 мм** |

Пересчёт эталона (его формулы из `designs/brian/src/base.mjs` и
`shared.mjs:armholeLength`) даёт 242.55 мм против их 243.76 - совпадение
0.5 %, формула воспроизведена.

Их пройма - три кривые Безье: от плечевой точки почти вертикально к
«питчу» на середине глубины, потом «пустота» наружу и к подмышке. У нас
кривая одна, без выемки, и без горизонтального размаха: цепь выходит
короче эталона на 20 %.

Следствие для 3D-превью: шов проймы в 3D идёт по поверхности руки, от
плечевой точки через дельту и перед бицепса к подмышке, и на нашей фигуре
этот путь занимает **251 мм** против 194 мм ткани в лекале. Ткань короче
пути на 23 %, и в превью она собирается в сборки у проймы. Лекало для
ровной посадки требует цепь около 245 мм.


### 2.8 Футболка: длина изделия

| | наша формула | FreeSewing |
|---|---|---|
| формула | `body_length = back_length + length_delta + ease_length` — готовая мерка пользователя (72 см)<br>`tee.py:61` | `points.cbHem = new Point(0, points.cbHips.y * (1 + options.lengthBonus))`, где `cbHips.y = hpsToWaistBack + waistToHips`; `lengthBonus = 15 %`<br>`designs/brian/src/base.mjs:79, :123`, `designs/teagan/src/front.mjs:302` |
| измерено | **740 мм** | cbHem.y = **621 мм** = (410 + 130) × 1.15 |
| вердикт | **FreeSewing** (внешняя мерка не градационна) | |

### 2.9 Футболка: ширина по бёдрам / низ

| | наша формула | FreeSewing |
|---|---|---|
| формула | низ строится обратно к `half_width` — обхват бёдер **не используется вообще**<br>`tee.py:186-195`; мерки `hip` у футболки в `catalog.py:50` нет | `points.hem.x = lowerWidth = (measurements.hips * (1 + options.hipsEase)) / 4`, `hipsEase = 18 %` от hips; при `fitWaist = false` ширина низа = ширина бёдер<br>`designs/teagan/src/front.mjs:30, :53`, опция `:314` |
| измерено | низ = 250 мм (обхват 1000 мм) | hem.x = **281.13 мм** = 953 × 1.18 / 4 |
| вердикт | **FreeSewing** | |

### 2.10 Рубашка: ширина панели

| | наша формула | FreeSewing |
|---|---|---|
| формула | `half_width = (bust + ease_bust) / 4`, `ease_bust = 8.0` **см** по умолчанию<br>`shirt.py:47` | `points.armhole = (measurements.chest * (1 + options.chestEase)) / 4`; `chestEase = 15 %` (опция Brian, Simon не переопределяет)<br>`designs/brian/src/base.mjs:126-129`, `designs/brian/src/base.mjs:31` |
| измерено | **270.0 мм** half-width; обхват 1080 мм | **281.46 мм** = 979 × 1.15 / 4 |
| вердикт | **структура совпадает; расходится единица прибавки** | |

### 2.11 Рубашка: сужение по талии и вытачки — критично

| | наша формула | FreeSewing |
|---|---|---|
| формула | `waist_half = min((waist + ease_bust) / 4, half_width)`; `back_extra = 1.5` см (делится пополам); `dart_depth` — **константа по посадке**: slim 12 / regular 8 / loose 3 / oversize 0 см<br>`shirt.py:48, :57-58, :63` | `calculateReduction`: `chest = chest*(1+chestEase)`, `waist = waist*(1+waistEase)`, `hips = hips*(1+hipsEase)`; `waistReduction = chest − waist`; `hipsReduction = chest − hips`. На спинке: `darts = reduce * options.backDartShaping / 4` (`backDartShaping = 25 %`), `points.dartTop = dartCenter.shift(90, armhole.dy(waist) * 0.75)`, `points.dartBottom = dartCenter.shift(-90, waistToHips * 0.75)`<br>`designs/simon/src/shared.mjs:1-27`, `designs/simon/src/back.mjs:73-77` |
| измерено | вытачка **80 мм** (regular) | waistReduction = 1126.85 − 906.2 = **220.65 мм**; вытачка спинки = 220.65 × 0.25 / 4 = **13.8 мм** |
| вердикт | **FreeSewing, однозначно** | |

### 2.12 Рубашка: глубина проймы

| | наша формула | FreeSewing |
|---|---|---|
| формула | `armhole_depth = bust / 4 + 7.0 + (height − 176) * 0.04`<br>`shirt.py:50-52` | та же формула Brian: `cbWaist.y − waistToArmpit * (1 − armholeDepth − bicepsEase / 2)`<br>`designs/brian/src/base.mjs:110-116` |
| измерено | **320.0 мм** | cbArmhole.y = **249.81 мм** |
| вердикт | **FreeSewing** (наша пройма на 7 см глубже) | |

### 2.13 Рубашка: рукав и манжета

| | наша формула | FreeSewing |
|---|---|---|
| окат | та же схема, что в футболке: `target_cap_length = 2 * armhole_length`, `cap_half` ищется поиском, `cap_rise = cap_half * 0.28`<br>`shirt.py:93-98`, `:104-107` | ширина = `biceps * (1 + bicepsEase) / 2`; длина оката подгоняется под сумму пройм; `sleeveLength = shoulderToWrist * (1 + sleeveLengthBonus)`, `sleeveLengthBonus = 3.5 %`; манжета `width = wrist * (1 + cuffEase + cuffOverlap)`, `cuffEase = 20 %`<br>`designs/library/src/sleeve/index.mjs:62-68, :161-164, :241`; `designs/simon/src/sleeve.mjs:88-95`; `designs/simon/src/options.mjs` |
| измерено | cap_width = **498.5 мм**; длина рукава — внешняя мерка `sleeve_length` (64 см) | ширина по бицепсу **374.66 мм**; длина рукава **621 мм** = 600 × 1.035; манжета = 170 × 1.35 = **229.5 мм** |
| вердикт | **FreeSewing** | |

### 2.14 Рубашка: воротник

| | наша формула | FreeSewing |
|---|---|---|
| формула | `half_width = neck_half + 1.5`; `collar_depth = 7.0`; `stand = 2.5` — три константы в см<br>`shirt.py:262-264` | `length = measurements.neck * (1 + collarEase − collarGap) * tweak`; `width = collarStandWidth * collarWidth * (1 + collarRoll)`; итерация `tweak = tweak * (1 − delta/1000)` до 20 раз, пока длина линии притачивания × 2 не сравняется с `neck * (1 + collarEase − collarGap)`<br>`designs/simon/src/collar.mjs:27-28, :61-67`; `collarStandWidth = 8 %` от neck, `collarWidth = 120 %`, `collarRoll = 3 %` (`designs/simon/src/options.mjs:81-88`) |
| измерено | полуширина **126.5 мм**, глубина 70 мм, стойка 25 мм (всё фиксировано) | bottomMid.y = **35.6 мм**; rightBottomEdge = **(178.86, 48.12)**; длина притачивания подогнана под neck × (1 + 0.02 − 0.025) |
| вердикт | **FreeSewing** | |

### 2.15 Брюки: ширина в поясе

| | наша формула | FreeSewing |
|---|---|---|
| формула | `quarter_waist = (waist + ease_waist) / 4`; перед = `quarter_waist − back_extra/2`, спинка = `quarter_waist + back_extra/2`, `back_extra = 1.0` см<br>`trousers.py:41-48, :60-64` | `points.waistX = new Point(measurements.waistFrontArc * (1 + options.waistEase), 0)` (перед), `-waistBackArc * (1 + waistEase)` (спинка). Дуги — производные мерки: `waistFront = waist − waistBack`, `waistFrontArc = waistFront / 2`, `waistBackArc = waistBack / 2`<br>`designs/titan/src/front.mjs:178`, `designs/titan/src/back.mjs:106`; `plugins/plugin-measurements/src/index.mjs:19-25`; `waistEase = 2 %` (`designs/titan/src/back.mjs:447`) |
| измерено | перед **220 мм** = (82 + 8)/4 − 0.5; спинка **230 мм** | перед **198.39 мм** = (788−399)/2 × 1.02; спинка **203.49 мм** = 399/2 × 1.02 |
| вердикт | **FreeSewing** (другое деление талии и другая единица прибавки) | |

### 2.16 Брюки: ширина по бёдрам

| | наша формула | FreeSewing |
|---|---|---|
| формула | `quarter_hip = (hip + ease_hip) / 4`; перед/спинка ± `back_extra/2`; `hip_y = crotch_depth * 0.5`<br>`trousers.py:43-49, :51` | `points.seatX = new Point(measurements.seatFrontArc * (1 + options.seatEase), 0)` (перед), `-seatBackArc * (1 + seatEase)` (спинка); `seatFrontArc = (seat − seatBack)/2`, `seatBackArc = seatBack/2` (тот же плагин); `seatY = waistToSeat`; `seatEase = 2 %`<br>`designs/titan/src/front.mjs:180`, `designs/titan/src/back.mjs:108`; `plugins/plugin-measurements/src/index.mjs:13-18` |
| измерено | перед **255 мм**, спинка **265 мм** | перед **259.08 мм** = (1046−538)/2 × 1.02; спинка **274.38 мм** = 538/2 × 1.02 |
| вердикт | **FreeSewing** (и по методу, и по самой мере: у них `seat` — по ягодицам, у нас `hip` — по бёдрам; это разные точки) | |

### 2.17 Брюки: глубина шага

| | наша формула | FreeSewing |
|---|---|---|
| формула | `crotch_depth += (height − 176) * 0.06`; `hip_y = crotch_depth * 0.5`; `crotch_x = waist_width − crotch_extension` (2 см перед, 6 см спинка)<br>`trousers.py:46, :51, :96` | `points.upperLegY = new Point(0, measurements.waistToUpperLeg)`; `points.fork = new Point(seatBackArc * (1 + seatEase) * −1.25, points.upperLegY.y * (1 + options.crotchDrop))`, `crotchDrop = 2 %` (перед — `seatFrontArc * 1.25`)<br>`designs/titan/src/back.mjs:107, :114-117`; `designs/titan/src/front.mjs:186-189` |
| измерено | crotch_depth = **300 мм** (внешняя мерка) + поправка на рост | fork = **(−359.66, 301.92)**; глубина шага = 296 × 1.02 = **301.92 мм**; вынос точки шага по горизонтали = 1.25 × дуги бедра |
| вердикт | **FreeSewing** | |

### 2.18 Брюки: длина штанины

| | наша формула | FreeSewing |
|---|---|---|
| формула | `total_length = crotch_depth + inseam_length + length_delta` — сумма двух чисел<br>`trousers.py:47` | `points.floor = new Point(grainlineTop.x, measurements.waistToFloor * (1 + options.lengthBonus))`, `lengthBonus = 2 %` — длина от талии до пола. **Затем** длина шва подгоняется под мерку: `inseamDelta = drawInseam().length() − store.get('inseamBack')`, и `adaptInseam()` вращает точки, пока длина шва не совпадёт с `measurements.inseam`; аналогично подгоняется outseam под `crossSeam`<br>`designs/titan/src/front.mjs:195-198`, `:120-125`, `:160-190` |
| измерено | total_length = **1080 мм** | floor.y = **1096.5 мм** = 1075 × 1.02; длина внутреннего шва доводится до inseam = **776 мм** |
| вердикт | **FreeSewing** | |

### 2.19 Брюки: ширина низа

| | наша формула | FreeSewing |
|---|---|---|
| формула | `hem_width = max(waist_width − 4.0, 8.0)` — сужение на фиксированные 4 см **от ширины пояса**<br>`trousers.py:96` | `kneeTotal = measurements.knee * (1 + options.kneeEase)`, `kneeEase = 6 %`; делится `legBalance` (57.5 % назад); точки колена и низа строятся от `knee`, низ **той же ширины, что колено** (в коде прямо отмечено: «Not shaping the ankle as that's a style choice»)<br>`designs/titan/src/back.mjs:131-145`, `designs/titan/src/front.mjs:207-211`; опции `:449, :463` |
| измерено | низ = **180 мм** (пояс 220 − 40) | kneeTotal = **418.7 мм**; назад 240.75 / вперёд 177.95; низ = колено |
| вердикт | **FreeSewing** | |

### 2.20 Брюки: баланс передней и задней штанины

| | наша формула | FreeSewing |
|---|---|---|
| формула | `back_extra = 1.0` см, делится пополам — фиксированная разница ~4.5 %<br>`trousers.py:44-48` | `kneeBack = kneeTotal * legBalance`, `kneeFront = kneeTotal * (1 − legBalance)`, `legBalance = 57.5 %` (диапазон 52.5–62.5); на уровне талии `waistBalance = 60 %`<br>`designs/titan/src/back.mjs:140-141`, `:166-172`; опции `:463, :470` |
| измерено | разница **1 см** | назад **57.5 %**, вперёд 42.5 % — разница **15 %** |
| вердикт | **FreeSewing** | |

### 2.21 Юбка: ширина пояса

| | наша формула | FreeSewing |
|---|---|---|
| формула | `waist_half = (waist + ease_waist) / 4`, прибавка **4 см** независимо от фигуры<br>`skirt.py:36` | `waistline = measurements.waist − options.waistDrop * (measurements.hips − measurements.waist)`; `waist = (1 + options.extraWaistEase) * waistline`; `qWaistFront = waist / 4 + waistEaseFront`; `qWaistBack = waist / 4 + waistEaseBack`, где `waistEaseFront = 10 %` и `waistEaseBack = 17 %` от **`seat − waistline`** (разницы талии и бёдер)<br>`designs/sarah/src/base.mjs:87-91, :94-106, :123-124` |
| измерено | **190 мм** = (72 + 4)/4 | sbWaist.x = **240.86 мм** = 197 + 0.17 × 258; sfWaist.x = **316.33 мм** = 197 + 0.10 × 258 |
| вердикт | **FreeSewing** (прибавка должна быть долей от разницы талия/бёдра) | |

### 2.22 Юбка: ширина по бёдрам и расклешение

| | наша формула | FreeSewing |
|---|---|---|
| формула | `hip_half = (hip + ease_hip) / 4`; `hem_half = hip_half + flare`, `flare = 10` **см абсолютно**<br>`skirt.py:37-38` | **Sarah (блок)**: `sideSeat = cbSeat.shift(0, seat / 4 + seatEase)`, `sideBottom = cbBottom.shift(0, seat / 4 + seatEase)` — низ равен бедру, расклешения в блоке нет; `seatEase = 6.25 %` от `seat − waistline` (`designs/sarah/src/base.mjs:96, :130-131`). **Расклешение в конкретных моделях:** Sunny: `w = (hWaist / (1 − pleatOverlap)) * 3`, где `hWaist = (waist + waistEase)/2`, `waistEase = waistToSeat * 20 %` — ширина в **3 раза** больше пояса (`designs/sunny/src/base.mjs:112-117`). Sandy: `radiusHem = radiusWaist + fullLength * lengthBonus` — расклешение растёт **пропорционально длине** (`designs/sandy/src/skirt.mjs:86-88`) |
| измерено | hip_half = **250 мм**; hem_half = **350 мм** (расклешение 10 см) | Sarah: sideBottom.x = **277.62 мм** = 1046/4 + 0.0625 × 258; Sunny: w = 3 × 442 = **1326 мм**; Sandy: outsideRadius = radiusWaist + fullLength × lengthBonus |
| вердикт | **FreeSewing** | |

### 2.23 Юбка: положение линии бёдер

| | наша формула | FreeSewing |
|---|---|---|
| формула | `hip_y = min(total_length * 0.4, 20.0) + (height − 170) * 0.03` — из **длины юбки и роста**<br>`skirt.py:40` | `points.cbHips = new Point(0, points.cbWaist.y + measurements.waistToHips)` = `hpsToWaistBack + waistToHips` (`designs/brian/src/base.mjs:79`); у Sarah `cbSeat = cbTop.shift(270, waistToSeat)`, `sideSeat` на `waistToSeat` (`designs/sarah/src/base.mjs:100, :127, :131`) |
| измерено | hip_y = **200.6 мм** | cbHips.y = **540 мм** = 410 + 130; cbSeat.y = **260 мм** = waistToSeat |
| вердикт | **FreeSewing** | |

### 2.24 Размеры и градация

| | наша система | FreeSewing |
|---|---|---|
| формула | размеров нет; `catalog.py` даёт фиксированный набор мерок и дефолтов на модель; «градация» = `fit_multiplier` (slim 0.55 / regular 1.0 / loose 1.7 / oversize 2.4), домножающий **прибавки** (`common.py`) | **размер = набор мерок**. `packages/models/src/index.mjs:27-123` даёт таблицы `cisFemaleAdult: 28…46`, `cisMaleAdult: 32…50`, `doll`, `giant`; каждая мерка выводится из обхвата шеи через `neckstimate(neck, measurement, i)` (`packages/models/src/neckstimate.mjs:56-140`): `delta = (neck / base.neck) * base[measurement] − base[measurement]`, результат `base + delta * ratio[measurement]`, где `ratio`: обхватные **1.0**, дуговые **0.5**, вертикальные **0.65**. Проверка градации: `Pattern.sampleModels(models)` чертит лекало **целиком** для каждого набора и складывает в стек (`packages/core/src/pattern/pattern-sampler.mjs:127-158`; `sites/dev/docs/reference/api/pattern/samplemodels/readme.mdx`) |
| измерено | 4 режима посадки, размеров нет | 10 женских и 10 мужских размеров adult + doll + giant |
| вердикт | **FreeSewing** | |

### 2.25 Модель прибавки (сквозная)

| | наша система | FreeSewing |
|---|---|---|
| формула | прибавка в **сантиметрах**: `ease_bust` 4/8, `ease_waist` 8, `ease_hip` 6, `ease_length` 2/3 (`catalog.py:56-57, :72-73, :104-105, :113-114`) | прибавка в **процентах от мерки**: `{ pct: 12, min: 5, max: 25, ...pctBasedOn('chest') }`. `pctBasedOn(measurement)` возвращает `toAbs: val => measurements[measurement] * val` (`packages/core/src/utils.mjs:621-628`); `mergeOptions` переводит `pct` в долю (`:600-616`) |
| измерено | ease_bust 4 см на обхват 96 см = **4.2 %**; ease_waist 8 см на 82 см = **9.8 %** | chestEase 12 % от chest; hipsEase 18 % от hips; waistEase 2 % (Titan) / 15 % (Simon) |
| вердикт | **FreeSewing** | |

---

## 3. Где мы расходимся и кто прав

Строки, где совпадение признано (2.1 и 2.10 — топология ширины панели), здесь не разбираются:
там правы обе стороны, расходится только единица прибавки (см. 3.1).

### 3.1 Прибавка: сантиметры против процентов — прав FreeSewing, и это системно

**Вердикт: FreeSewing.** Обоснование — не вкусовое, а конструктивное. `ease_bust = 4` см на
обхват груди 96 см даёт 4.2 % прибавки; на обхват 120 см те же 4 см дают 3.3 %. Изделие, которое
было свободным на 46-м размере, на 50-м станет обтянутым — и причина не в фигуре, а в том, что
прибавка не масштабировалась. FreeSewing задаёт прибавку в процентах (`pctBasedOn`), и при смене
обхвата доля сохраняется автоматически: `chestEase` 12 % даёт 117 мм прибавки на обхвате 979 мм и
136 мм на обхвате 1130 мм.

Следствие для нас: **это первое, что надо поменять**, потому что остальные формулы (вытачка,
ширина низа, расклешение) правильно посчитаются только тогда, когда прибавка процентная.

### 3.2 Ширина панели — правы обе стороны

**Вердикт: обе.** `(girth + ease) / 4` и `girth * (1 + ease_pct) / 4` — одна и та же формула, и
обе системы используют полные обхваты. Расхождение только в способе выразить прибавку
(см. 3.1). Отдельно отмечу, что наша запись в `common.py` («ширина детали, разложенной от центра
до бокового шва, равна (обхват + прибавка) / 4») — это ровно то, что делает FreeSewing, и что
`bust` у нас это именно полный обхват, а не полуобхват. Здесь переделывать нечего.

### 3.3 Ширина по талии у футболки — прав FreeSewing

**Вердикт: FreeSewing.** Наша `waist_half = min((waist + ease_bust) / 4, half_width)` сужает
талию **всегда**. У Teagan опция `fitWaist` по умолчанию выключена, и ширина низа/талии/бёдер
берётся от бёдер (281.13 мм), а не от талии. Обоснование: у футболки из трикотажа талия не должна
быть источником сужения — если фигура полная, сужение по талии даст изделие, которое стягивает
живот и не сядет на бёдра. Наш `min()` — это попытка «сделать, чтобы не сошлось», но она
маскирует проблему: при обхвате бёдер больше обхвата груди мы построим талию уже груди, и изделие
разойдётся по фигуре.

### 3.4 Ширина горловины — прав FreeSewing, ошибка критическая

**Вердикт: FreeSewing, однозначно.** Здесь наша формула даёт физически невозможный результат.
`neck_half = neck_circ / 4 + 0.5` никак не связана с обхватом шеи: при шее 360 мм (женщина 36-го
размера) наш вырез в сумме даёт 229.8 мм — это **меньше обхвата шеи**. Человек физически не
проденет голову через такой вырез. FreeSewing поступает принципиально иначе: берёт начальную
ширину как `neck * (1 + collarEase) / collarFactor` (делённую на 4.8, а не на 4), а затем
**итеративно подгоняет глубину выреза** так, чтобы длина кривой горловины × 2 сравнялась с
`neck * (1 + collarEase)`: `delta = paths.neckOpening.length() * 2 - target`, цикл до 10 шагов
(`base.mjs:191-211`). То есть не «ширина = доля обхвата», а «длина выреза = обхват шеи плюс
прибавка» — единственно правильная постановка.

### 3.5 Глубина выреза горловины — прав FreeSewing

**Вердикт: FreeSewing.** Наша таблица `NECK_DEPTHS` — абсолютные сантиметры, не зависящие ни от
одной мерки: у ребёнка и у крупного мужчины вырез одинаковый, а у женщины с обхватом шеи 40 см
вырез должен быть заметно шире, чем у девушки с шеей 34 см. FreeSewing привязывает глубину к
вертикали `hpsToWaistBack` (25 %) и к ширине плеча (30 % пути HPS→плечо) — обе величины
масштабируются с фигурой.

### 3.6 Глубина проймы — прав FreeSewing

**Вердикт: FreeSewing.** `bust / 4 + 6` — классическая учебниковая эвристика, и она не содержит
ни одной вертикальной мерки: пройма оказывается привязана к обхвату груди вместо длины торса.
У FreeSewing пройма считается от **линии талии вверх** через `waistToArmpit`
(`cbWaist.y − waistToArmpit * (1 − armholeDepth − bicepsEase/2)`) — то есть длина проймы
пропорциональна длине торса, а ширины груди в формуле нет вовсе. Численно: 240.97 мм против наших
300 мм. Наша поправка `(height − 176) * 0.04` — попытка учесть вертикаль через рост; она не
работает, потому что рост не определяет длину торса (у высокого человека может быть короткий торс
и длинные ноги).

Отдельно: у FreeSewing есть **два** режима расчёта проймы, и старый (`legacyArmholeDepth`)
тоже считается от бицепса (`biceps * (1 + bicepsEase) * armholeDepthFactor`, 55 %) — то есть даже
в «legacy»-режиме вертикаль/бицепс, а не обхват груди.

### 3.7 Положение плеча — прав FreeSewing по вертикали, наш `min()` приемлем

**Вердикт: FreeSewing по высоте плеча; наша защита по ширине — приемлемая, но не эквивалент.**
FreeSewing выводит высоту плеча из **угла наклона плеча** (`shoulderSlope`, градусы) — это
единственная мерка, описывающая посадку плеча, и она индивидуальна. У нас `shoulder_drop = 4.5`
см — константа, одинаковая для всех. Наш `min(shoulder_width / 2, half_width − 1)` по горизонтали
делает то же, что их предупреждение `brian:largeShoulderWidth` (`base.mjs:133-136`), только
молча — это не ошибка, но информацию о невозможной комбинации мерок мы теряем.

### 3.8 Окат рукава: метод наш, ширина и высота — FreeSewing

**Вердикт: раздельно.** Здесь единственное место, где **наша методика лучше или равна**:
подгонка длины оката под длину проймы. И мы, и FreeSewing это делаем, и оба сходятся к цели:
наш `target_cap_length = 2.0 * armhole_length` (512.9 мм, длина оката 512.9 мм — сходится
точно), их `sleevecapTarget = frontArmholeLength + backArmholeLength` (485.98 мм, получено
486.18 мм — сходится с точностью 2 мм). Это единственная правильная методика: окат и пройма —
одна и та же длина, иначе рукав либо стянется, либо останется зазор.

Но **что именно подгоняется — у нас неверно**. FreeSewing держит **ширину** рукава, привязанную
к обхвату бицепса (рукав не может быть шире руки — это не одежда, это мешок), и подгоняет
**высоту** оката, привязанную к вертикали `hpsToWaistBack − waistToArmpit`. Мы держим длину и
подгоняем ширину, от которой ничего физического не зависит. Результат: наш рукав — 466 мм против
345 мм у FreeSewing на сопоставимой фигуре, то есть **шире руки на 12 см**. И наш окат плоский:
высота 65 мм при ширине 466 мм (соотношение 0.14) против 199 мм при 345 мм (0.58) у FreeSewing.
Плоский окат не сядет в пройму по глубине — рукав будет задираться в подмышке.

### 3.9 Длина изделия — прав FreeSewing

**Вердикт: FreeSewing.** Длина — производная от вертикальных мерок и процентного бонуса
(`(hpsToWaistBack + waistToHips) * 1.15`), а не готовое число. Наш `back_length` (72 см) —
пользовательская мерка: её нужно вводить и пере-вводить при смене фигуры, и она не выводится из
остального набора, а значит, не градационна. Практическая оговорка: подход FreeSewing хуже для
пользователя (нужно самому мерить HPS до талии и до бёдер), но он единственный даёт автоматическую
градацию.

### 3.10 Ширина по бёдрам у футболки — прав FreeSewing

**Вердикт: FreeSewing.** У нас обхват бёдер в по��илушке **не используется вообще**: низ
 строится обратно к ширине по груди. Для фигуры с бёдрами шире груди (а это норма) изделие будет
сшито по груди и разойдётся по фигуре. У Teagan низ строится от бёдер с прибавкой 18 %, и это
единственная причина, по которой футболка FreeSewing сидит на широкой фигуре. У нас в каталоге
у футболки нет даже мерки `hip` — это пробел в наборе мерок, а не в формуле.

### 3.11 Вытачка рубашки — прав FreeSewing, ошибка критическая

**Вердикт: FreeSewing, однозначно.** Глубина вытачки должна равняться тому, насколько фигура
уже в талии, плюс распределение. FreeSewing считает это буквально: `waistReduction = chest*(1+chestEase) − waist*(1+waistEase)` (у нашей фигуры 220.65 мм) и делит его между вытачками и боковым швом, причём длину и положение вытачки привязывает к `armhole.dy(waist)` и `waistToHips`. У нас `dart_depth` — константа по посадке (8 см при regular), никак не зависящая от соотношения груди и талии. Последствия: при обхвате груди 120 и талии 110 вытачка 8 см мала (нужно ~10 см), при обхвате груди 90 и талии 70 вытачка 8 см велика и даст лишнюю складку; при обхвате груди и талии равных вытачка вообще не нужна, но мы её нарисуем.

### 3.12 Глубина проймы рубашки — прав FreeSewing

**Вердикт: FreeSewing.** Та же претензия, что в 3.6, с большим расхождением: 320 мм против
249.81 мм.

### 3.13 Рукав рубашки и манжета — прав FreeSewing

**Вердикт: FreeSewing.** Ширина — по бицепсу (374.66 мм у них против 498.5 мм у нас). Длина
рукава выводится из мерки `shoulderToWrist` (600 мм × 1.035 = 621 мм) — то есть из длины руки
человека, а не из введённого числа. Манжета считается от обхвата запястья
(`wrist * (1 + cuffEase + cuffOverlap)` = 229.5 мм) — у нас обхват запястья нет вообще, манжета
рисуется как прямая линия фиксированной длины 6 см.

### 3.14 Воротник — прав FreeSewing

**Вердикт: FreeSewing.** Здесь две связанные ошибки. Первая: наш воротник задаётся тремя
константами (`collar_depth = 7`, `stand = 2.5`, `half_width = neck_half + 1.5`) и не масштабируется.
Вторая, более важная: **воротник должен повторять длину линии притачивания, которая равна длине
выреза горловины**, а у нас вырез не связан с обхватом шеи (3.4) — поэтому воротник не может
сойтись с горловиной ни при каких мерках. FreeSewing строит воротник из мерки (`length = neck *
(1 + collarEase − collarGap)`) и **итеративно подгоняет** его так, чтобы длина притачивания
сошлась с обхватом шеи (`tweak = tweak * (1 − delta / 1000)`, до 20 итераций).

### 3.15 Брюки: ширина пояса — прав FreeSewing

**Вердикт: FreeSewing.** Топология «/4» совпадает, но не совпадает разбиение: FreeSewing берёт
**две дуги** талии из двух мерок (`waistFront = waist − waistBack`, `waistBackArc = waistBack / 2`),
т.е. у талии свой передний и задний обхват — анатомически разные величины. Мы делим обхват
пополам и добавляем 1 см разницы. Плюс прибавка: у них 2 % (1.6 мм на нашей фигуре), у нас 8 см
(20 мм на 82 см обхвата — 10 %!).

### 3.16 Брюки: ширина по бёдрам — прав FreeSewing

**Вердикт: FreeSewing.** То же, что 3.15, плюс важная разница в самой мере: FreeSewing мерит
`seat` (1046 мм — по самой широкой части ягодиц), а мы `hip` (98 см — по бёдрам). Это разные
анатомические точки, и подставлять одно вместо другого нельзя: у посадки на бёдра обхват
`seat` и `hip` расходятся на 5–10 см.

### 3.17 Брюки: глубина шага — прав FreeSewing

**Вердикт: FreeSewing.** Глубина шага выводится из вертикальной мерки `waistToUpperLeg`
(296 мм × 1.02 = 301.92 мм) — то есть фактически «от талии до верхней части бедра». У нас это
внешняя мерка `crotch_depth` плюс прокси через рост. Горизонтальный вынос точки шага у
FreeSewing = **1.25 × дуги бедра** (то есть 25 % от ширины бедра — это и есть «вынос»), у нас
фиксированные 2 и 6 см.

### 3.18 Брюки: длина штанины — прав FreeSewing, и здесь различие принципиальное

**Вердикт: FreeSewing.** FreeSewing не задаёт длину штанины числом. Он строит длину от талии до
пола (`waistToFloor * 1.02`), а затем **итеративно подгоняет длину снятого шва** под мерку
`inseam` (776 мм): `inseamDelta = drawInseam().length() − store.get('inseamBack')`, цикл
`adaptInseam()` вращает точки до сходимости. То же — для outseam и cross seam. Причина:
гадательная длина от талии до пола при сгибе в шаге превращается в две длины (бедро + штанина), и
соотношение между ними определяется посадкой. У нас длина шага и длина штанины заданы
независимо, поэтому могут не сойтись с обхватом бедра: получится штанина с правильной длиной,
но не с той посадкой.

### 3.19 Брюки: ширина низа — прав FreeSewing

**Вердикт: FreeSewing.** Наша ширина низа выведена из **ширины пояса** минус 4 см. Это
независимо от бедра и колена: у широкобедрого человека с узкой талией низ окажется
несоразмерно широким, а у полного — слишком узким. FreeSewing берёт **обхват колена** (отдельная
мерка) и в блоке **не сужает низ автоматически** (в коде прямо отмечено: «Not shaping the ankle as
that's a style choice») — сужение как раз стилистический выбор. У нас горизонтальной меры колена
нет: `knee_length` — это вертикаль.

### 3.20 Брюки: баланс передней и задней штанины — прав FreeSewing

**Вердикт: FreeSewing.** Разница в 4.5 % против 15 %: задняя штанина у нас почти не шире передней,
тогда как ягодицы объективно требуют примерно 57.5 % общей ширины. Плюс у FreeSewing баланс —
**параметр** (`legBalance`, диапазон 52.5–62.5 %), у нас константа.

### 3.21 Юбка: ширина пояса — прав FreeSewing

**Вердикт: FreeSewing.** Прибавка к поясу у FreeSewing — доля от **разницы талии и бёдер**
(`seat − waistline`): 10 % спереди, 17 % сзади. Логика: чем сильнее фигура расширяется от талии к
бёдрам, тем больше нужно прибавки в талии, иначе юбка не наденется. У нас 4 см независимо ни от
чего: при талии 100 и бёдрах 120 получится юбка, которая не сядет.

### 3.22 Юбка: расклешение — прав FreeSewing

**Вердикт: FreeSewing.** Все три подхода к расклешению у них **относительные**: доля от длины
(Sandy: `radiusHem = radiusWaist + fullLength * lengthBonus`) либо множитель от ширины пояса
(Sunny: `w = hWaist * 3`). Наш `flare = 10` см абсолютно: одна и та же цифра на юбку 40 см и на
юбку 90 см, при талии 60 и при талии 100. Правильная форма — доля от длины: тогда расклешение
масштабируется вместе с изделием и сохраняет пропорции.

### 3.23 Юбка: положение линии бёдер — прав FreeSewing

**Вердикт: FreeSewing.** Линия бёдер на фигуре — анатомическая точка, она не зависит от длины
изделия. Наша `hip_y = min(total_length * 0.4, 20.0) + (height − 170) * 0.03` зависит от длины
юбки: у юбки 90 см линия уплывёт на 20 см, у юбки 30 см окажется на 12 см. Нужна вертикальная мерка.

### 3.24 Размеры и градация — прав FreeSewing

**Вердикт: FreeSewing.** Размер в FreeSewing — это **набор мерок**, а не масштаб лекала и не
режим посадки. `packages/models` даёт таблицы adult/doll/giant, где каждая мерка выводится из
обхвата шеи через `neckstimate` с понижающими коэффициентами по типу мерки: обхватные **1.0**,
дуговые **0.5**, вертикальные **0.65** (то есть вертикаль растёт медленнее обхвата — верно
антропометрически). Проверка градации — `Pattern.sampleModels()`: чертим лекало целиком для
каждого набора мерок и складываем в стек; если стек «перекручен», градация негодна.

Наш `fit_multiplier` масштабирует **прибавки**, а не тело: при смене обхвата груди с 96 на 110 см
прибавка 4 см остаётся прежней. Это не градация, а переключение двух-трёх посадок. Отдельная
оговорка: `fit_multiplier` как таковой не бесполезен — это нормальный способ выразить «сильно
свободно», но он не должен быть единственным механизмом изменения размера.

### 3.25 Модель прибавки — см. 3.1 (сквозная)

---

## 4. Что стоит перенять

Все формулы — MIT (Copyright (c) 2022 Joost De Cock, `LICENSE` в корне
`codeberg.org/freesewing/freesewing`), пригодны к использованию с указанием авторства и
источника. Ниже — конкретные формулы с указанием файлов-источников.

### 4.1 Прибавка в процентах от обхвата

```js
// packages/core/src/utils.mjs:621-628
export function pctBasedOn(measurement) {
  return {
    toAbs: (val, { measurements }) => measurements[measurement] * val,
    fromAbs: (val, { measurements }) =>
      Math.round((10000 * val) / measurements[measurement]) / 10000,
  }
}
```
`mergeOptions` (`packages/core/src/utils.mjs:600-616`) переводит `pct` в долю (`pct / 100`),
поэтому опция `{ pct: 12, min: 5, max: 25, ...pctBasedOn('chest') }` даёт прибавку 12 % от обхвата
груди. Источники: `designs/teagan/src/front.mjs:300, :314`, `designs/titan/src/back.mjs:447-449`.

### 4.2 Вертикальные мерки вместо прокси через рост

Набор, который стоит добавить в `catalog.py` (источник — `packages/config/src/measurements.mjs`,
список `topToBottomMeasurements`):

| мерка | что это | где применяется в FreeSewing |
|---|---|---|
| `hpsToBust` | HPS → грудь | `brian/src/base.mjs:77` |
| `hpsToWaistBack` | HPS → талия сзади | `brian/src/base.mjs:78` — длина изделия, глубина проймы, глубина горловины |
| `waistToArmpit` | талия → подмышка | `brian/src/base.mjs:114` — глубина проймы |
| `waistToHips` | талия → бёдра | `brian/src/base.mjs:79` — линия бёдер, длина изделия |
| `waistToSeat` | талия → сид | `sarah/src/base.mjs:100`, `titan/src/back.mjs:109` |
| `waistToUpperLeg` | талия → верх бедра | `titan/src/back.mjs:107` — глубина шага |
| `waistToFloor` | талия → пол | `titan/src/front.mjs:196` — общая длина брюк |
| `shoulderToWrist` | плечо → запястье | `library/src/sleeve/index.mjs:241` — длина рукава |
| `biceps` | обхват бицепса | `library/src/sleeve/index.mjs:62` — ширина рукава |
| `shoulderSlope` | наклон плеча, **градусы** | `brian/src/base.mjs:88-95` — высота плеча |
| `wrist` | обхват запястья | `simon/src/sleeve.mjs:88` — ширина манжеты |
| `seat`, `seatBack` | обхват сида и его задняя дуга | `titan/src/front.mjs:180` — ширина штанины по бёдрам |
| `waistBack` | задняя дуга талии | `titan/src/front.mjs:178` — ширина штанины в поясе |
| `crossSeam`, `crossSeamFront` | поперечный шов | `titan/src/front.mjs:75` — подгонка длины штанины |

Пока эти мерки не введены, три наши поправки через рост — `(height − 176) * 0.04` (пройма),
`(height − 176) * 0.06` (шаг), `(height − 170) * 0.03` (линия бёдер) — остаются вынужденным
костылём.

### 4.3 Глубина проймы от вертикали

```js
// designs/brian/src/base.mjs:110-116  (современный путь, по умолчанию)
points.cbArmhole = new Point(
  0,
  points.cbWaist.y -
    measurements.waistToArmpit * (1 - options.armholeDepth - options.bicepsEase / 2)
)
```
`armholeDepth = 2 %` (`base.mjs:40-45`), `bicepsEase = 5 %` (`base.mjs:25`). Старый путь, если
нужна совместимость с историческими лекалами (`base.mjs:102-109`):
```js
points.cbArmhole = new Point(
  0,
  points.shoulder.y +
    measurements.biceps * (1 + options.bicepsEase) * options.armholeDepthFactor
)   // armholeDepthFactor = 55 %
```

### 4.4 Горловина, длина которой равна обхвату шеи

Шаг 1 — начальная ширина (`designs/brian/src/base.mjs:82-86`):
```js
points.neck = new Point(
  (measurements.neck * (1 + options.collarEase)) / options.collarFactor,
  0
)   // collarFactor = 4.8 (base.mjs:23), collarEase = 5 % от neck (base.mjs:28)
```
Шаг 2 — подгонка длины выреза (`designs/brian/src/base.mjs:191-211`):
```js
let target = measurements.neck * (1 + options.collarEase)
do {
  points.cfNeck = points.cfNeck.shift(90, delta / 3)
  // ... построение контрольных точек кривой ...
  paths.neckOpening = new Path()
    .move(points.cfNeck)
    .curve(points.cfNeckCp1, points.neckCp2Front, points.neck)
    .curve(points.neckCp2, points.cbNeck, points.cbNeck)
  delta = paths.neckOpening.length() * 2 - target
} while (Math.abs(delta) > 1 && options.brianFitCollar && run < 10)
```

### 4.5 Глубина и ширина выреза, привязанные к фигуре

```js
// designs/teagan/src/front.mjs:66, :68
points.cfNeck = new Point(0, options.necklineDepth * measurements.hpsToWaistBack)  // 25 %
points.neck = points.hps.shiftFractionTowards(points.shoulder, options.necklineWidth)  // 30 %
```
Опции (`designs/teagan/src/front.mjs:315-317`): `necklineDepth: { pct: 25 }`,
`necklineWidth: { pct: 30 }`, `necklineBend: { pct: 30 }`.

### 4.6 Плечо по углу наклона

```js
// designs/brian/src/base.mjs:88-95
points.shoulder = utils.beamsIntersect(
  points.hps,
  points.hps.shift(measurements.shoulderSlope * -1, 100),
  new Point(measurements.shoulderToShoulder / 2 + store.get('shoulderEase'), -100),
  new Point(measurements.shoulderToShoulder / 2 + store.get('shoulderEase'), 100)
)
```
`shoulderSlope` — в градусах (`packages/config/src/measurements.mjs:degreeMeasurements`).

### 4.7 Рукав: ширина по бицепсу, высота оката по вертикали, длина по пройме

```js
// designs/library/src/sleeve/index.mjs:62-68  — ширина от бицепса
let halfWidth = (measurements.biceps * (1 + (options.bicepsEase || 0.15))) / 2
points.bicepsLeft = points.centerBiceps.shift(
  180,
  halfWidth * options.sleeveWidthGuarantee +
    halfWidth * (1 - options.sleeveWidthGuarantee) * store.pget('__sleevecapFactor')
)
points.bicepsRight = points.bicepsLeft.flipX(points.centerBiceps)

// designs/library/src/sleeve/index.mjs:41-59  — высота оката от вертикали
points.centerCap = points.centerBiceps.shift(
  90,
  options.sleevecapTopFactorY *
    (measurements.hpsToWaistBack - measurements.waistToArmpit) *
    (1 + (options.armholeDepth || 0)) *
    0.75 *
    store.pget('__sleevecapFactor')
)

// designs/library/src/sleeve/index.mjs:161-164  — длина оката = длина проймы
let armholeLength = store.pget('frontArmholeLength', 250) + store.pget('backArmholeLength', 250)
let sleevecapEase = armholeLength * options.sleevecapEase
store.pset('sleevecapTarget', armholeLength + sleevecapEase)
```
Итерация фактора (`designs/library/src/sleeve/index.mjs:24-31`): `delta > 0.1 → ×0.8`,
`delta > 0.02 → ×0.9`, `delta < −0.1 → ×1.3`, `delta < −0.02 → ×1.15`, иначе ×0.99 / ×1.008;
повторять до `|delta| ≤ 2 мм`, максимум 50 итераций.
Длина рукава (`designs/library/src/sleeve/index.mjs:241`):
`store.pset('sleeveLength', measurements.shoulderToWrist * (1 + options.sleeveLengthBonus))`.

### 4.8 Вытачка рубашки из разности обхватов

```js
// designs/simon/src/shared.mjs:1-27
const chest = measurements.chest * (1 + options.chestEase)
const waist = measurements.waist * (1 + options.waistEase)
const hips = measurements.hips * (1 + options.hipsEase)
let waistReduction = chest - waist
let hipsReduction = chest - hips
if (waistReduction < 0) waistReduction = 0
if (waistReduction < hipsReduction) hipsReduction = waistReduction
store.set('waistReduction', waistReduction)
store.set('hipsReduction', hipsReduction)

// designs/simon/src/back.mjs:73-78  — распределение по вытачкам
let darts = (reduce * options.backDartShaping) / 4
let nonDarts = (reduce * (1 - options.backDartShaping)) / 4
points.waist = points.waist.shift(180, nonDarts)
points.dartCenter = points.cbWaist.shiftFractionTowards(points.waist, 0.6)
points.dartTop = points.dartCenter.shift(90, points.armhole.dy(points.waist) * 0.75)
points.dartBottom = points.dartCenter.shift(-90, measurements.waistToHips * 0.75)
```

### 4.9 Воротник, подогнанный под горловину

```js
// designs/simon/src/collar.mjs:27-28
const length = measurements.neck * (1 + options.collarEase - options.collarGap) * tweak
const width = store.get('collarStandWidth') * options.collarWidth * (1 + options.collarRoll)

// designs/simon/src/collar.mjs:61-67  — подгонка длины притачивания
do {
  delta = draft(tweak)
  tweak = tweak * (1 - delta / 1000)
  run++
} while (Math.abs(delta) > 1 && run < 20)
```
`collarStandWidth = 8 %` от neck, `collarWidth = 120 %`, `collarRoll = 3 %`,
`collarGap = 2.5 %` (`designs/simon/src/options.mjs:81-88`).

### 4.10 Брюки: две дуги талии и две дуги бедра

```js
// plugins/plugin-measurements/src/index.mjs:13-25  — производные дуги
set.measurements.seatFront = set.measurements.seat - set.measurements.seatBack
set.measurements.seatBackArc = set.measurements.seatBack / 2
set.measurements.seatFrontArc = set.measurements.seatFront / 2
set.measurements.waistFront = set.measurements.waist - set.measurements.waistBack
set.measurements.waistBackArc = set.measurements.waistBack / 2
set.measurements.waistFrontArc = set.measurements.waistFront / 2

// designs/titan/src/front.mjs:178-180 и designs/titan/src/back.mjs:106-108
points.waistX = new Point(measurements.waistFrontArc * (1 + options.waistEase), 0)
points.seatX = new Point(measurements.seatFrontArc * (1 + options.seatEase), 0)
```

### 4.11 Глубина шага и подгонка длины штанины

```js
// designs/titan/src/back.mjs:107, :114-117
points.upperLegY = new Point(0, measurements.waistToUpperLeg)
points.fork = new Point(
  measurements.seatBackArc * (1 + options.seatEase) * -1.25,
  points.upperLegY.y * (1 + options.crotchDrop)
)

// designs/titan/src/front.mjs:120-125, :160-190  — подгонка длины шва под мерку
const inseamDelta = () => drawInseam().length() - store.get('inseamBack')
const adaptInseam = () => { /* вращение точек, пока |delta| <= 1 */ }
```

### 4.12 Ширина низа штанины от колена и баланс штанин

```js
// designs/titan/src/back.mjs:131-141
let kneeTotal = measurements.knee * (1 + options.kneeEase)
if (!options.fitKnee) {
  let altKneeTotal = measurements.seatFront
  if (altKneeTotal > kneeTotal) kneeTotal = altKneeTotal
}
store.set('kneeBack', kneeTotal * options.legBalance)
store.set('kneeFront', kneeTotal * (1 - options.legBalance))
```
`kneeEase = 6 %` (`designs/titan/src/back.mjs:449`), `legBalance = 57.5 %` (`:463`).

### 4.13 Юбка: прибавка от разницы талии и бёдер, расклешение от длины

```js
// designs/sarah/src/base.mjs:87-124
const waistline = measurements.waist - options.waistDrop * (measurements.hips - measurements.waist)
const waist = (1 + options.extraWaistEase) * waistline
const seatWaistDiff = measurements.seat - waistline
const seatEase = seatWaistDiff * options.seatEase            // 6.25 %
const waistEaseFront = options.waistEaseFront * seatWaistDiff // 10 %
const waistEaseBack = options.waistEaseBack * seatWaistDiff   // 17 %
const qWaistFront = waist / 4 + waistEaseFront
const qWaistBack = waist / 4 + waistEaseBack

// designs/sandy/src/skirt.mjs:86-88  — расклешение, растущее с длиной
const radiusHem =
  radiusWaist + store.get('fullLength') * options.lengthBonus - absoluteOptions.waistbandWidth

// designs/sunny/src/base.mjs:112-117  — ширина в множитель от пояса
const waist = measurements.waist
const waistEase = measurements.waistToSeat * options.waistEase  // 20 %
const hWaist = (waistEase + waist) / 2
const w = (hWaist / (1 - options.pleatOverlap)) * 3
```

### 4.14 Размер как набор мерок, градация как проверка наложением

```js
// packages/models/src/neckstimate.mjs:129-140
export const neckstimate = (neck = false, measurement = false, i = 0, noRound = false) => {
  const delta = (neck / base.neck[i]) * base[measurement][i] - base[measurement][i]
  return noRound
    ? base[measurement][i] + delta * ratio[measurement]
    : Math.round(base[measurement][i] + delta * ratio[measurement])
}
```
Коэффициенты `ratio` (`packages/models/src/neckstimate.mjs:62-118`): обхватные **1.0**, дуговые
**0.5**, вертикальные **0.65**, `crossSeam` 0.6, `seat` 0.6, `shoulderToShoulder` 0.65,
`inseam` 0.25, `waistToFloor` 0.4.
Проверка градации (`packages/core/src/pattern/pattern-sampler.mjs:127-158`): `sampleModels(models)`
создаёт по одному набору настроек на каждый набор мерок, чертит лекало целиком для каждого и
складывает в стек.

---

## 5. Порядок внедрения (по убыванию отдачи)

1. **Прибавка в процентах** (§3.1, §4.1) — правка в одном месте (`catalog.py`), но меняет все
   четыре конструкции. Без неё остальные пункты считаются неправильно.
2. **Вертикальные мерки** (§4.2) — расширение набора мерок; потребует пересборки `catalog.py` и
   API-контракта мерок. Это фундамент для пунктов 3–6.
3. **Горловина по обхвату шеи** (§3.4, §4.4) — устраняет физически невозможный результат.
4. **Ширина рукава по бицепсу + высота оката от вертикали** (§3.8, §4.7) — устраняет рукав шире
   руки и плоский окат.
5. **Вытачка рубашки из разности обхватов** (§3.11, §4.8) — устраняет неверную посадку по талии.
6. **Глубина проймы от `waistToArmpit`** (§3.6, §4.3) — убирает прокси через рост.
7. **Низ штанины от колена, баланс штанин, глубина шага** (§3.17, §3.19, §3.20, §4.11, §4.12) —
   переводит брюки с «пояс − 4 см» на мерки тела.
8. **Юбка: прибавка от разницы талия/бёдра, расклешение от длины** (§3.21, §3.22, §4.13).
9. **Длина оката = длина проймы** (§3.8) — уже сделано у нас, менять нечего, но стоит зафиксировать
   тестом, чтобы при переносе формул её не потерять.
10. **Размеры как наборы мерок + проверка градации наложением** (§3.24, §4.14) — самый крупный
    объём, но и главный эффект: после этого остальные формулы становятся градационными сами.

---

## 6. Оговорки

- **Разные фигуры.** Числа FreeSewing получены на `cisFemaleAdult36` (chest 979, waist 788,
  hips 953 мм), наши — на дефолтах `catalog.py` (bust 96, waist 84, height 176 см). Сравнение
  числовых колонок корректно как **порядок величин и знак расхождения**, но не как точное
  неравенство. Все совпадения в тексте получены пересчётом наших формул на мерках FreeSewing
  (например, наш half-width при bust 97.9 см и ease 4 см = 254.8 мм против 274.12 мм).
- **Снимок кода.** `backend/app/drafts/*.py` правились параллельно; приведённые SHA-256 фиксируют
  состояние, из которого читались формулы. Если файл изменится — формулы надо перечитать.
- **Пакеты `basic-block` / `un-jet-block` / `brian-block` / `sarah-block` из задания не существуют.**
  В npm — 404; в репозитории v3.3.0-rc.1 и v2.22.1 — отсутствуют. Ближайшие аналоги по смыслу:
  `brian` (базовый блок корпуса), `titan` (брючный блок), `sarah` (юбочный блок),
  `library.sleeve` (рукав), `teagan` (футболка), `simon` (рубашка). Все они и использованы.
- **Мы не переносим код FreeSewing.** Переносятся формулы и приёмы (идем потенциално патентоспособны
  по 17 U.S.C. § 102(b) и не охраняются авторским правом — см. `docs/research/02-math-and-libraries.md`),
  но не код и не архитектура. При использовании формул — указание MIT-лицензии и авторства.
- **Совпадений «обе стороны правы» — два из двадцати шести** (§2.1, §2.10); остальные расхождения
  перечислены в §3 с указанием, чья сторона права и почему.
