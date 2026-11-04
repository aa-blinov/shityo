# 03 — Frontend и 3D стек: Svelte 5 / SvelteKit / TypeScript

**Дата проверки:** 2026-11-03. Все версии и лицензии сняты с npm registry API, PyPI JSON API, GitHub raw/atom и официальных
документаций в этот день.

**Маркировка:**

- `[VERIFIED]` — факт прочитан на странице/в registry и подтверждён URL;
- `[INFERRED]` — вывод из проверенных фактов (логика, а не цитата);
- `[PROPOSAL]` — наше проектное решение, не факт о мире.

**Ограничение:** это исследование стека фронтенда. Генерация базовых лекал и математика деталей — в файлах `01`/`02`
(другие агенты). Здесь мы опираемся на контракт API из `docs/API-CONTRACT.md`: фронтенд **не** считает геометрию сам —
он получает готовые полигоны в миллиметрах (`outline`, `seam_line`, `notches`, `grainline`, `internal_lines`) из
`POST /api/generate`, а экспорт (`/api/export/{model}.svg|.dxf|.pdf`) делает бэкенд.

---

## 0. Краткое резюме решений

| Область | Решение | Ключевые версии | Лицензии |
|---|---|---|---|
| 2D-редактор деталей | **Кастомный SVG-слой на Svelte 5** (DOM-SVG, не canvas) + собственные трансформации. **В пилоте именно так — `paper.js` не подключён**; `paper.js` — рекомендация для этапа расширения (булевы операции над кривыми) | `svelte@5.57.3` (пилот); `paper@0.16.0` — план расширения | MIT / MIT |
| Трансформации/ручки | Свои handle-элементы в SVG (Bezier/arc-anchor drag) — **не** Konva Transformer, **не** Fabric controls | — | — |
| Pan/zoom | `panzoom@9.4.4` для SVG-корня либо ~100 строк собственного кода (для canvas — вручную) | `panzoom@9.4.4` | MIT |
| Boolean ops (fallback, если paper.js не потянет) | `js-angusj-clipper@1.3.1` (WASM+asm.js, только целые координаты) | `js-angusj-clipper@1.3.1` | MIT |
| 3D-пилот | `three@0.187.0` + `@threlte/core@8.7.0` + `@threlte/extras@9.23.1`, рендер WebGL | `three@0.187.0`, `@threlte/core@8.7.0`, `@threlte/extras@9.23.1` | MIT |
| Манекен | **Процедурная параметрическая модель тела по антропометрии** (своя, детерминированная) — MPFB2/MakeHuman только как *источник оффлайн*, Ready Player Me мёртв | свой код, без внешних ассетов | — |
| Ткань | **свой XPBD-солвер** `frontend/src/lib/cloth/xpbd.ts` (подход из open-source `seamer-studio`, MIT) + `three@0.187.0` для отрисовки | `three@0.187.0` | MIT |
| DXF | **Сервер**: `ezdxf==1.4.5` (Python, MIT) + AAMA/ASTM-конвенции | `ezdxf==1.4.5` | MIT |
| PDF | **Сервер: `reportlab==5.1.0` (BSD-3-Clause) — принятое решение, порт завершён.** В пилоте был PyMuPDF, заменён до релиза 2026-11-03 по лицензии (AGPL-3.0 несовместим с закрытым SaaS); `pymupdf*` удалены из venv. Кириллица — через TrueType (`TTFont`), при отсутствии шрифта — транслитерация, не пустые квадраты | `reportlab==5.1.0`, `pypdf==6.21.4` (тесты) | BSD-3-Clause |
| PDF в браузере | `pdfkit@0.20.2` или `jspdf@4.2.1` (MIT). `pdf-lib@1.17.1` — **не брать**: последний релиз 2021-11-06 | `pdfkit@0.20.2` / `jspdf@4.2.1` | MIT |
| E2E | `@playwright/test@1.64.1` (Apache-2.0), Chromium 156 / Firefox 157 / WebKit 27.2 | `@playwright/test@1.64.1` | Apache-2.0 |
| Монорепо | **В пилоте**: npm без workspaces (JS) + `.venv` (Python), общий корень. **Целевое**: pnpm workspace + uv, `concurrently` для dev | пилот: npm; целевое: `pnpm@12.16.1`, `uv@0.13.6`, `concurrently@10.0.6` | MIT / MIT (uv: MIT OR Apache-2.0) |

**Явные «не»:**

- `@xyflow` — не релевантно (нодовый граф, а не CAD) `[INFERRED]`;
- `fabric@7.4.0` — MIT и умеет SVG-экспорт, но объектная модель заточена под растровый редактор, дублирует нашу
  геометрию и весит больше, чем даёт `[INFERRED]`;
- `@react-three/fiber` — **React-only**, peer `react >=19 <19.4`; в Svelte-проекте неприменим, Svelte-эквивалент — Threlte `[VERIFIED]`;
- `mannequin-js@5.2.3` — **GPL-3.0**, для коммерческого SaaS не годится `[VERIFIED]`;
- `pdf-lib@1.17.1` — заброшен с 2021 года `[VERIFIED]`;
- `pagedjs@0.4.3` — npm-релиз от 2023-07-06, официальный репозиторий переехал в GitLab `coko.foundation`, который
  недоступен; GitHub-зеркало живое (коммиты до 2026-10-20), но риск зависимости от него высок `[VERIFIED]`;
- `d3-zoom@3.0.0` — ISC, последний релиз 2021-06-10; жив, но не развивается `[VERIFIED]`;
- `ammo.js@0.0.10` — npm-релиз 2016-04-17, поле `license` в registry **отсутствует** `[VERIFIED]`.

---

# Часть A — 2D: интерактивное редактирование лекал

## A.1 Что нам технически нужно от 2D-слоя

Требования, выведенные из `docs/API-CONTRACT.md` и из того, как устроены реальные системы лекал:

1. Контур детали — произвольная кривая: отрезки + **безье** + **дуги** (в apparel-CAD есть настоящие дуги, например
   пройма горловины, вытачки, круглый карман) `[INFERRED]`.
2. **Notches** (надрезы) — отдельные короткие метки на контуре, привязанные к параметрической точке, а не часть контура `[INFERRED]`.
3. **Grainline** (долевая) — отдельная линия-стрелка `[VERIFIED: в контракте `grainline: {x1,y1,x2,y2}`]`.
4. **Internal lines** (вытачки, линии сборки) — отдельные полилинии `[VERIFIED: в контракте `internal_lines: [{type:"dart", points:[...]}]`]`.
5. Ручное редактирование: drag bezier-anchor, изменение длины/формы, notch-перетаскивание.
6. Boolean-операции: seam allowance (припуск) = offset контура; пересечение деталей для sanity-check; вычитание
   внутренних вырезов из контура `[INFERRED]`.
7. Экспорт в печать 1:1 (A4/A3), экспорт DXF, экспорт SVG — всё делает бэкенд `[VERIFIED: контракт §4]`.
8. Внутренние единицы — **миллиметры**, целые/половинные значения `[VERIFIED: контракт §2]`.

## A.2 Сравнение кандидатов

| Кандидат | Версия | Лицензия | Модель | Безье/дуги | Notches | Boolean ops | SVG-экспорт | Трансформы | Состояние |
|---|---|---|---|---|---|---|---|---|---|
| **Кастомный SVG на Svelte 5** | svelte 5.57.3 | MIT | наш собственный | нативно (`<path d>`) | `<line>`/`<path>` | нет (нужна lib) | **нативно, идеально** | пишем сами | наш код |
| **Konva + svelte-konva** | konva 10.9.1 / svelte-konva 1.0.1 | MIT / MIT | Canvas 2D scene graph | через `Path` (SVG path data: M,L,H,V,Q,T,C,S,A,Z) `[VERIFIED]` | `Line` | нет | **нет** — feature request #2072 открыт с 2026-09-24 `[VERIFIED]` | `Transformer` готов `[VERIFIED]` | konva активно, svelte-konva — релиз 2025-10-16 `[VERIFIED]` |
| **Fabric.js** | 7.4.0 | MIT | canvas-объектная модель | `Path` есть | через группы/объекты | нет (свой `fabric` не умеет) | **есть** (`FabricObjectSVGExportMixin`) `[VERIFIED]` | controls API готов `[VERIFIED]` | релиз 2026-05-18, фикс CVE-2026-44311 `[VERIFIED]` |
| **paper.js** | 0.16.0 | MIT | векторная геометрия | `Segment`/`Arc`/`Curve` | любая геометрия | **да**: `unite/intersect/subtract/exclude/divide` `[VERIFIED]` | `project.exportSVG()` `[VERIFIED]` | hit-test ручек: `project.hitTest(pt, { handles: true })` `[VERIFIED]` | активно: коммиты 2026-11-01 `[VERIFIED]` |
| **@svgdotjs/svg.js** | 3.2.8 | MIT | DOM-SVG обёртка | через атрибуты | да | нет | нативно | вручную | активно, релиз 2026-08-04 `[VERIFIED]` |
| **svg.js** (legacy) | 2.7.1 | MIT | старый DOM-SVG | — | — | нет | нативно | — | старый, 1M скачиваний/нед `[VERIFIED]` |

### Что именно проверено

- **svelte-konva** — официальная обёртка от `konvajs`, MIT, peer-зависимости `konva: "8 - 10"`, `svelte: "^5.0.0"`
  `[VERIFIED: https://www.npmjs.com/package/svelte-konva, https://registry.npmjs.org/svelte-konva/latest]`.
  В поставке есть `Transformer.svelte`, `Path.svelte`, `Shape.svelte`, `Arc.svelte` `[VERIFIED: распаковка svelte-konva-1.0.1.tgz]`.
  API v1 — **пропсы вместо объекта `config`** (fine-grained reactivity Svelte 5), события как `onpointerclick={fn}`,
  SSR не поддерживается → компонент сцены грузится только в браузере `[VERIFIED: https://raw.githubusercontent.com/konvajs/svelte-konva/master/docs/svelte-konva-v1-migration.md]`.
- **Konva.Path** умеет SVG path data, включая дуги: «Currently supported SVG data: M, m, L, l, H, h, V, v, Q, q, T, t, C, c, S, s, A, a, Z, z»
  `[VERIFIED: https://konvajs.org/api/Konva.Path.html]`.
- **Konva.Transformer** — готовый набор ручек (resize/rotate/flip, `enabledAnchors`, `rotationSnaps`)
  `[VERIFIED: https://konvajs.org/api/Konva.Transformer.html]`.
- **Konva и SVG-экспорт**: нативного `stage.toSVG()` нет; issue «Feature Request: Native SVG Export» открыт 2026-09-24
  `[VERIFIED: https://github.com/konvajs/konva/issues/2072]`.
- **paper.js** — MIT `[VERIFIED: https://raw.githubusercontent.com/paperjs/paper.js/develop/LICENSE.txt,
  https://paperjs.org/license]`. Булевы операции документированы: `unite/intersect/subtract/exclude/divide`,
  каждая с опцией `trace` и `insert` `[VERIFIED: https://paperjs.org/reference/pathitem]`.
  Важно: npm-пакет `paper@0.16.0` отдаёт **UMD**-бандл (`dist/paper-full.js`, 644 KB; `paper-core.js` 582 KB), поле `module`
  в package.json **отсутствует**, типы — `dist/paper.d.ts` `[VERIFIED: registry + https://app.unpkg.com/paper@0.16.0/files/dist]`.
  То есть в Vite это CommonJS-интероп, а не нативный ESM `[INFERRED]`.
  Экспорт: `project.exportSVG([options])` — «Exports the project with all its layers and child items as an SVG DOM»
  `[VERIFIED: https://paperjs.org/reference/project#exportsvg]`.
  Hit-test умеет искать **ручки сегментов**: `project.hitTest(point, { handles: true })` — то есть paper.js годен и как
  основание для интерактивного редактирования bezier-ручек, а не только как boolean-ядро `[VERIFIED:
  https://paperjs.org/reference/project#hittest]`.
  Для Node-тестов есть `paper-jsdom@0.16.0` (MIT; тянет `paper@0.16.0` + `jsdom@^28.1.0`) `[VERIFIED:
  https://www.npmjs.com/package/paper-jsdom]`.
- **Fabric.js 7.4.0** — MIT, `module: ./dist/index.mjs`, `engines.node >= 20`, есть `toSVG` через `FabricObjectSVGExportMixin`
  и готовые controls `[VERIFIED: registry + https://fabricjs.com/docs/core-concepts/]`.

## A.3 Рекомендация по 2D

### Рекомендуемый стек: **кастомный SVG-слой + `paper.js` как геометрическое ядро**

> **Что фактически в пилоте (уточнение):** в пилоте выбран вариант **«собственный SVG-слой на Svelte 5 + собственные
> трансформации»** — **без `paper.js`, без canvas-библиотеки** (`paper` в `frontend/package.json` **не подключался**)
> `[VERIFIED: frontend/package.json — в dependencies только `three`; frontend/src/lib/geometry.ts — своя функция
> `pathFromPoints()`, строящая атрибут `d` из точек]`. Это **совпадает** с рекомендацией по рендерингу.
> `paper.js` в этом документе остаётся **рекомендацией для этапа расширения** — когда понадобятся булевы операции
> над кривыми (припуски, вырезы, пересечения деталей) в браузере. До тех пор пор он не нужен: геометрия приходит
> готовой с бэкенда, а припуски и экспорт считаются на сервере `[PROPOSAL]`.

```
Svelte 5 (DOM-SVG сцена)          ← рендер, hit-test, ручки, pan/zoom
        │  читает/пишет
        ▼
 Геометрическая модель (TS)        ← наши типы: Piece { outline, seamLine, notches, grainline, internalLines }
        │  boolean ops / offset / area / length        ← ЭТАП РАСШИРЕНИЯ (в пилоте не подключено)
        ▼
 paper.js 0.16.0 (MIT)             ← unify/intersect/subtract/divide, area, intersections, simplify
```

**Текущее состояние пилота:** строки «boolean ops / offset / area / length» и блок `paper.js` — **план этапа расширения**,
в пилоте их нет; вместо них на клиенте лежит собственный чистый TS-слой геометрии (`frontend/src/lib/geometry.ts`:
`pathFromPoints()`, `bboxOfPoints()`, `unionBBox()` — без внешних зависимостей) `[VERIFIED: frontend/src/lib/geometry.ts]`.
Припуски, площади, метрики и экспорт считает **бэкенд** `[VERIFIED: backend/app/export/ и backend/app/core/geometry.py]`.

**Почему SVG, а не canvas (Konva/Fabric):**

1. **Печать 1:1 — первоclassный сценарий.** Нам нужен векторный вывод в PDF/SVG для раскроя. У Konva его нет вовсе
   (открытый feature request) `[VERIFIED]`, у Fabric — есть, но это ровно одна из причин, по которой Fabric и тянут.
   С DOM-SVG «печать» = сериализация `<svg>`; наш же бэкенд всё равно делает финальный PDF/DXF.
2. **Масштаб сцены.** Лекал в проекте — единицы–десятки, кривых на деталь — десятки. DOM-SVG с десятками `<path>`
   работает мгновенно; проблемы производительности Konva решают сценарии с тысячами интерактивных объектов, чего у нас нет `[INFERRED]`.
3. **Детерминированность и «paper-first» API.** Вся вычислительная часть (припуски, boolean, площади) живёт в Python
   на бэкенде и в `paper.js` на клиенте для интерактивных правок. Нам важна **совместимость представления детали**,
   а не скорость Drag-and-drop миллиона нод `[INFERRED]`.
4. **Svelte 5 runes + SVG = минимальный слой абстракции.** `$derived` по геометрии → реактивный `d` атрибут, без
   промежуточного scene-graph и без `bind:config`-ловушек, которые пришлось бы лечить в svelte-konva `[INFERRED]`.
5. **Konva оставляем как запасной вариант**, если позже понадобится: (а) 10k+ интерактивных точек, (б) оффскрин-рендер,
   (в) глобальные события/selection-менеджмент «из коробки». Тогда переходим на `konva + svelte-konva` (обе MIT) и
   теряем только экспорт в SVG из сцены (экспорт всё равно серверный) `[INFERRED]`.

**Почему `paper.js` рядом (а не «своя геометрия»):**

- Нам нужны **булевы операции над кривыми** (вычитание внутреннего выреза из контура, объединение деталей для проверки
  пересечений, offset для припуска). Писать свой robust boolean-оператор над дугами/безье — это месяцы работы и риск
  численной неустойчивости. Paper.js это уже делает и это **MIT** `[VERIFIED]`.
- Ограничения, которые надо знать:
  - `paper` — **UMD**, в Vite подтянется как CJS (`optimizeDeps` включит его) `[VERIFIED]` → можно, но дерево зависимостей
    ожидаемо «плоское»; альтернатива — грузить `paper/dist/paper-core.js` напрямую `[INFERRED]`;
  - paper.js оперирует числами с плавающей точкой; в шкале мм (деталь ~700 мм) — приемлемо, но при boolean-операциях
    лучше работать в фиксированной сетке (округление до 0.001 мм) `[INFERRED]`;
  - у paper.js нет встроенного offset для кривых — для припуска есть отдельный MIT-пакет `paperjs-offset@2.2.2`
    `[VERIFIED: https://www.npmjs.com/package/paperjs-offset]`. **Проверить его на кривых с самопересечением нужно
    отдельно до того, как на него опереться** `[INFERRED]`.

**Альтернатива paper.js — целочисленный Clipper:**

| Пакет | Версия | Лицензия | Что это | Ограничения |
|---|---|---|---|---|
| `js-angusj-clipper` | 1.3.1 | MIT | порт Clipper (Angus Johnson) в WASM + asm.js fallback | **только целые координаты**; npm-релиз 2023-02-04, не обновлялся `[VERIFIED]` |
| `clipper2-wasm` | 0.4.0 | **BSL-1.0** | WASM-порт Clipper2 | Boost Software License — не MIT, проверьте совместимость с вашей лицензией продукта `[VERIFIED]` |
| `clipper2-js` | 1.2.4 | Boost Software License | TS-обёртка над Clipper2 | peer `@angular/core ^15` — npm поставит Angular peer как транзитивную зависимость `[VERIFIED]` |
| `clipper-lib` | 6.4.2 | BSL | старый Clipper 6.4.2 | BSL, не MIT `[VERIFIED]` |
| `polygon-clipping` | 0.15.7 | MIT | Martinez, чистый JS, boolean над полигонами | **только полигоны**, кривые надо сначала аппроксимировать `[VERIFIED]` |

> **Уточнение по ТЗ:** пакета с именем `clipper2js` **нет ни в npm, ни в PyPI** (404 на обоих реестрах) `[VERIFIED]`.
> Реальные имена — `clipper2-wasm`, `clipper2-js` (npm) и `pyclipper` (PyPI). Если в бэкенде нужен offset/boolean над
> кривыми — `pyclipper==1.4.0` (MIT, порт Clipper 6.4.2) или `shapely==2.2.0` (BSD-3-Clause, GEOS; работает с
> LinearRing/Polygon, кривые надо аппроксимировать) `[VERIFIED]`.

**Вывод по boolean-стратегии:** в пилоте — `paper.js` на клиенте (интерактив) + `ezdxf`/`shapely` на сервере (экспорт и
припуски). `js-angusj-clipper` держим как запасной быстрый integer-путь, если на клиенте понадобится массовый offset.

## A.4 Трансформации, ручки, notches — что пишем сами

Так как canvas-библиотеку мы не берём, «трансформы» = собственный код:

- **Bezier-ручки.** Механизм идентичен демо Konva «Modify Curves with Anchor Points»: контрольные точки
  `Konva.Shape` c `ctx.bezierCurveTo` — там это реализовано вручную через `sceneFunc` и draggable-anchor'ы
  `[VERIFIED: https://konvajs.org/docs/sandbox/Modify_Curves_with_Anchor_Points.html]`. У нас то же самое, но в SVG:
  `<circle>` для anchor + `<line>` для ручки, `pointerdown/move/up` + `setPointerCapture` `[INFERRED]`.
- **Arc-ручки.** Дугу в SVG задаём через `A` (rx, ry, x-axis-rotation, large-arc-flag, sweep-flag); ручки дуги —
  это две точки на эллипсе + центр; перетаскивание пересчитывает `rx/ry/rotation/flags` `[INFERRED]`.
  Готовый конвертер `svg-arc-to-cubic-bezier@3.2.0` (ISC) может пригодиться, если решим хранить контуры только в
  кубических безье `[VERIFIED: npm registry]`.
- **Notches.** Отдельные `<line>`/`<path>` поверх контура, координаты — в модели детали (не в контуре), чтобы при
  перегенерации геометрии notch оставался привязанным к параметру `[INFERRED]`.
- **Grainline.** Отдельная линия со стрелками — простой `<line>` + два `<polygon>`-наконечника `[INFERRED]`.
- **Точность ввода.** Показываем координаты в мм с шагом 0.5 мм; привязка (snap) к 0.5/1 мм и к параметрическим
  точкам `[INFERRED]`.

## A.5 Pan / zoom

| Кандидат | Версия | Лицензия | Годен для SVG-DOM | Для canvas-Konva | Состояние |
|---|---|---|---|---|---|
| **panzoom** | 9.4.4 | MIT | **да** (работает с DOM и SVG) `[VERIFIED]` | нет (нужна ручная реализация через `stage.scale/position`) | релиз 2026-03-26, жив `[VERIFIED]` |
| `@use-gesture/vanilla` | 10.3.1 | MIT | да (только жесты, без зума «из коробки») | частично | npm-релиз 2024-03-21 — 2.5 года без релизов `[VERIFIED]` |
| `d3-zoom` | 3.0.0 | ISC | да | нет | релиз 2021-06-10, не развивается `[VERIFIED]` |
| свой код | — | — | да | да | ~100 строк: wheel + pointer-drag + матрица 3×3 `[PROPOSAL]` |

**Рекомендация:** для SVG-сцены — `panzoom@9.4.4` (MIT, жив, умеет SVG и DOM, `minZoom/maxZoom`, `transformOrigin`,
`getTransform()`) `[VERIFIED: https://raw.githubusercontent.com/anvaka/panzoom/master/README.md]`.
Но: panzoom применяет CSS-трансформацию к DOM-узлу — для SVG это работает через `transform` на `<g>` `[INFERRED]`.
Если позже перейдём на canvas, pan/zoom придётся писать самим (wheel→scale, drag→offset, pinch через `pointer` events) —
это тривиально и избавляет от зависимости `[PROPOSAL]`.

**Замечание про «общие» либы:** `@use-gesture` и `d3-zoom` — для DOM; для canvas-сцены Konva они бесполезны, что лишний
аргумент за SVG-подход `[INFERRED]`.

## A.6 Что НЕ берём в 2D

- **`fabric@7.4.0`** — MIT, но: объектная модель дублирует нашу геометрию, controls API лучше подходит под
  «рисование/редактирование произвольных объектов», а не под параметрические лекала; плюс лишние зависимости и
  `engines.node >= 20` `[VERIFIED]`. Оставить как «если вдруг нужен редактор с текстовыми блоками и растр-эффектами» `[INFERRED]`.
- **`@svgdotjs/svg.js@3.2.8`** — хорош, но Svelte 5 сам умеет рендерить SVG декларативно; обёртка добавит слой
  императивного API без выигрыша `[INFERRED]`. Полезен, если понадобится SVG-анимация/паттерны вне Svelte-состояния.
- **`svg.js@2.7.1`** — legacy-версия того же проекта; если брать, то `@svgdotjs/svg.js` `[VERIFIED]`.

---

# Часть B — 3D

## B.1 Рендерер: three.js + Threlte

| Пакет | Версия | Лицензия | Peer-требования | Состояние |
|---|---|---|---|---|
| `three` | **0.187.0** | MIT | — | r187 released 2026-10-30; `LICENSE` = MIT © 2010-2026 three.js authors `[VERIFIED]` |
| `@threlte/core` | **8.7.0** | MIT | `three >= 0.172`, `svelte >= 5` | релиз 2026-11-02 `[VERIFIED]` |
| `@threlte/extras` | **9.23.1** | MIT | `three >= 0.172`, `svelte >= 5` | релиз 2026-11-02 `[VERIFIED]` |
| `@threlte/rapier` | 3.5.1 | MIT | `three >= 0.152`, `svelte >= 5`, `@dimforge/rapier3d-compat >= 0.16` | релиз 2026-09-24 `[VERIFIED]` |
| `@threlte/gltf` | 3.1.0 | MIT | — | CLI-конвертер glTF → Svelte-компоненты `[VERIFIED]` |
| `@threlte/xr` | 1.6.1 | MIT | — | VR/AR, не нужен в пилоте `[VERIFIED]` |
| `@types/three` | 0.187.0 | MIT | — | триплет с three 0.187.0 `[VERIFIED]` |

**Почему Threlte, а не react-three-fiber:** `@react-three/fiber@9.8.2` — MIT, но peer-зависимости жёстко
`react: ">=19 <19.4"` и `react-dom` — в Svelte-проекте он не подключается в принципе `[VERIFIED]`.
Svelte-эквивалент — Threlte: он и есть «three.js bindings for Svelte 5» `[VERIFIED: https://threlte.xyz/docs/learn/getting-started/installation]`.

**Важные нюансы Threlte, найденные в пакетах:**

- Мажорные версии пакетов **расходятся**: `@threlte/core` = 8.x, а `@threlte/extras` = 9.x. Совместимость
  проверена: `extras@9.23.1` собран против `@threlte/core@8.7.0` (devDependency) и в рантайме импортирует
  `'@threlte/core'` и `'@threlte/core/webgpu'` `[VERIFIED: распаковка extras-9.23.1.tgz, поиск импортов в dist]`.
- **`@threlte/core` и `@threlte/extras` не объявляют `@threlte/core` peer-зависимостью** у extras, хотя импортируют
  его → его нужно ставить явно `[VERIFIED: package.json extras@9.23.1]`.
- WebGPU-вариант есть отдельным экспортом: `@threlte/core/webgpu`, `@threlte/extras/webgpu` `[VERIFIED: exports в package.json]`.
- Threlte 8 — только Svelte 5 (Svelte 4 поддержка удалена); события → callback-пропсы; `attach` API сменил сигнатуру;
  слоты → snippets `[VERIFIED: https://threlte.xyz/docs/learn/advanced/migration-guides/]`.
- `three@0.187.0` **не содержит собственных TypeScript-типов** (в package.json нет поля `types`) → нужен
  `@types/three@0.187.0` (MIT) `[VERIFIED]`.

**WebGL vs WebGPU.** three.js r187 выпущен 2026-10-30, значительная часть изменений — в WebGPU-рендерере
`[VERIFIED: https://github.com/mrdoob/three.js/releases.atom]`. Поддержка WebGPU в браузерах на сегодня:
Chrome 113+ — да, Edge 113+ — да, Safari 26+ — partial на десктопе (на iOS 26+ — да), **Firefox 145–162 — disabled by default**
`[VERIFIED: https://caniuse.com/webgpu]`.

> **Вывод:** для пилота — **WebGL-рендерер** (`three` WebGLRenderer) как дефолт, потому что Firefox десктопный и
> Safari-десктоп пока не дают WebGPU. WebGPU включать как opt-in-режим (`@threlte/core/webgpu`) позже `[PROPOSAL]`.

## B.2 Манекен: что реально доступно

| Кандидат | Лицензия данных | Лицензия кода | Статус | Вердикт |
|---|---|---|---|---|
| **MakeHuman (core assets)** | **CC0 1.0** (base mesh, targets, текстуры, риги) | AGPLv3 (приложение) | жив | assets можно свободно использовать; код нельзя вшивать в наш продукт `[VERIFIED: https://static.makehumancommunity.org/about/license.html]` |
| **MPFB2** (Blender-аддон, свежая ветка MakeHuman) | **CC0 1.0** | **GPLv3** | жив, релиз 2026 | то же: assets CC0, код GPLv3 `[VERIFIED: https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/LICENSE.md]` |
| **Ready Player Me** | CC-BY-NC 4.0 для некоммерческого, коммерческое — по условиям | — | **СЕРВИС МЁРТВ**: закрыт 2026-01-31 после покупки Netflix (сделка 2025-12-19); домены `readyplayer.me` и `docs.readyplayer.me` **не резолвятся (DNS ENOTFOUND)** | **не использовать** `[VERIFIED: DNS-фейл на readyplayer.me и docs.readyplayer.me; дата закрытия — по публичным сообщениям (avatarsdk.com/blog, marketscreener), не по официальной странице — она недоступна]` |
| `mannequin-js@5.2.3` | — | **GPL-3.0** | релиз 2024-10-06 | GPL-вирусность → не для коммерческого SaaS `[VERIFIED: https://raw.githubusercontent.com/boytchev/mannequin.js/master/LICENSE]` |

**Рекомендация по манекену — процедурная параметрическая модель тела (собственная):**

1. **Юридически чисто:** наш код, наши данные, никаких лицензионных ограничений и внешних сервисов `[PROPOSAL]`.
2. **Детерминированно:** ровно то, что нужно от «детерминированного (не-AI) параметрического движка» — тело строится
   из тех же антропометрических мерок (`bust`, `waist`, `height`, `shoulder_width`, `back_length`, `sleeve_length`,
   `neck_circumference`), что уже есть в контракте `[VERIFIED: docs/API-CONTRACT.md §2]` `[INFERRED]`.
3. **Совпадает с доменом:** нам не нужен фотореалистичный аватар, нужен «объёмный манекен для проверки посадки
   лекал». Минимальный вариант — набор горизонтальных сечений (сетка колец) + триангуляция, т.е. ~300–500 строк
   генерации `[PROPOSAL]`.
4. **MakeHuman/MPFB2 — только как оффлайн-источник:** можно один раз в CI/скрипте сгенерировать набор
   «объёмов» (`.glb`/`.json` сетки) через Blender+MPFB2 из CC0-assets и положить в репозиторий как статику.
   MPFB2 документирует скриптовый API (`HumanService.create_human()`, `TargetService.reapply_macro_details()`,
   `ExportService`) `[VERIFIED: https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/script_samples/index.md]`,
   то есть headless-пайплайн возможен `[INFERRED]`.
   **Ограничение:** требует Blender в пайплайне — тяжёлое; как основной путь не берём `[INFERRED]`.

**Что точно не нужно:** «avatары с сервиса», «реалистичные тела с фото-текстурами» — это задача маркетинга, а не CAD `[INFERRED]`.

## B.3 Ткань (cloth) в браузере: что реалистично, а что нет

> **В пилоте физики ткани нет** — 3D-слой ограничен рендером и превью `[VERIFIED: frontend/package.json — в
> dependencies только `three`; ни `@dimforge/rapier3d-compat`, ни `@threlte/*` не подключены]`. Поэтому ниже важна
> **пригодность** каждого кандидата (лицензия, зрелость, кросс-браузерность), а не текущая зависимость: всё
> перечисленное — материал для выбора на этапе 3D-физики.

### Источники, которые действительно существуют

| Пакет | Версия | Лицензия | Что это | Состояние |
|---|---|---|---|---|
| `three` | **0.187.0** | **MIT** | сам рендерер; в нём же лежат примеры ткани | r187 от 2026-10-30; `LICENSE` = MIT © 2010-2026 three.js authors `[VERIFIED: https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE]` |
| `@dimforge/rapier3d-compat` | **0.21.0** | **Apache-2.0** | Rapier (Rust) в WASM; **в 0.21.0 появились soft bodies** | релиз 2026-09-25 `[VERIFIED]` |
| `@threlte/core` / `@threlte/extras` | 8.7.0 / 9.23.1 | **MIT** | Svelte-биндинги three.js (для 3D-превью) | релиз 2026-11-02 `[VERIFIED]` |
| `@threlte/rapier` | 3.5.1 | **MIT** | обёртки Rapier для Threlte | релиз 2026-09-24; **soft bodies не оборачивает** `[VERIFIED]` |
| `three` (examples) | 0.187.0 | MIT | `examples/webgpu_compute_cloth.html` — verlet-симуляция ткани в compute-шейдерах | в r187 `[VERIFIED: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgpu_compute_cloth.html]` |
| `three` (examples) | 0.187.0 | MIT | `examples/physics_ammo_cloth.html` — ткань на ammo.js soft bodies | требует WebAssembly-бандла ammo `[VERIFIED]` |
| `three-simplecloth` | 0.0.6 | MIT | «Simple cloth simulation for Three.js **WebGPU**» | peer `three ^0.182.0`; версия 0.0.x — непроверенный код `[VERIFIED]` |
| `@plasius/gpu-cloth` | 0.1.11 | Apache-2.0 | GPU-cloth для WebGPU, keywords: cloth, garment | 0.1.x, малый проект `[VERIFIED]` |
| `ammo.js` | 0.0.10 | поле `license` в npm **отсутствует** | порт Bullet в JS/Emscripten | релиз **2016-04-17**, заброшен `[VERIFIED]` |
| `matter-js` | 0.20.0 | MIT | 2D rigid-body | ткань не умеет, в 3D неприменим `[VERIFIED]` |

**Лицензионный вывод по 3D-физике:** весь пригодный набор — **MIT + Apache-2.0**, то есть copyleft-рисков нет ни в
одном кандидате (в отличие от PDF-экспорта, где пришлось уйти с AGPL). `ammo.js` — единственный, у которого лицензия
не объявлена вовсе, поэтому он выбывает независимо от состоятельности кода `[VERIFIED]`.

> **Уточнение по ТЗ:** пакета `cloth-sim` в npm **нет** (npm search по «cloth simulation» не даёт такого имени) `[VERIFIED]`.
> Ближайшее — `three-simplecloth` и `@plasius/gpu-cloth`.

### Важная находка: Rapier JS 0.21.0 = soft bodies

`CHANGELOG.md` Rapier: **v0.36.0 (24 сентября 2026)** — «Soft bodies: `SoftBodySet`, `SoftBody` and `SoftBodyBuilder`
(ropes, cloth, trimesh, volumes…), simulated together with rigid bodies, contacts and joints» `[VERIFIED:
https://raw.githubusercontent.com/dimforge/rapier/master/CHANGELOG.md]`.

JS-биндинг `@dimforge/rapier3d-compat@0.21.0` (2026-09-25) содержит `dist/dynamics/soft_body.d.ts` (41.5 KB) и
`soft_body_set.d.ts` `[VERIFIED: https://app.unpkg.com/@dimforge/rapier3d-compat@0.21.0/files/dist/dynamics]`.
Документация JS-гайда по soft bodies присутствует: конструкторы `cloth`, `cloth_anisotropic`, `cloth_tube`, `rope`,
`grid`, `sphere`, `trimesh`; материалы с `plasticity`/`tearing`; FEM-солвер (экспериментальный) `[VERIFIED:
https://rapier.rs/docs/user_guides/javascript/soft_bodies/]`.

**Важно:** `@threlte/rapier@3.5.1` **не оборачивает** soft bodies — в пакете только `RigidBody`, `Collider`,
`AutoColliders`, `CollisionGroups`, `Attractor`, `Debug`, `World` `[VERIFIED: распаковка tarball]`. Значит ткань придётся
интегрировать через «сырой» `@dimforge/rapier3d-compat` + наш собственный Svelte-компонент, либо ждать расширения Threlte `[INFERRED]`.

### Что реалистично в браузере — честная оценка

| Сценарий | Реалистичность | Чем делать | Комментарий |
|---|---|---|---|
| «Ткань висит на манекене и примерно облегает» (демо-каче��тво) | **Реалистично** | Rapier soft bodies (`cloth`) + коллайдер манекена, ~20×20 частиц, фикс. шаг 1/60 | Rapier 0.21.0 — Apache-2.0, WASM, работает во всех браузерах `[VERIFIED]` |
| Деформация по **конкретным лекалам** нашего проекта (вырезы, швы, заутюживание) | **Условно** | тот же Rapier + наш триангулятор лекала в частицы | триангуляция детали с кривыми + маркировка рёбер = нетривиально, но посильно `[INFERRED]` |
| Ткань с **реальными физическими свойствами** ( drape, само-collision, складки по швам) | **Нереалистично в браузере в реалтайме** | — | требует FEM + self-contact + высокого разрешения; в Rapier FEM-солвер помечен «Experimental», self-contact дорог `[VERIFIED]` |
| Ткань на **WebGPU compute** (как в примере three.js) | **Реалистично только в Chrome/Edge** | three.js WebGPU + TSL compute (пример `webgpu_compute_cloth.html`) | Firefox — disabled by default `[VERIFIED: caniuse]` |
| Полноценная «примерка одежды» уровня CLO/Optitex | **Нереалистично** | — | это годы работы серверного софта `[INFERRED]` |

**Формулировка для документации продукта:** «в браузере мы показываем *примерку* детали на манекене с физикой ткани
низкого разрешения — это **визуализация посадки**, а не симуляция раскроя/поведения ткани; точная драпировка
и раскладка лекал считаются на сервере/в production-CAD» `[PROPOSAL]`.

**Порядок работы (рекомендация):**

1. **Этап 1 (пилот):** без физики. 3D-превью = плоское лекало, «натянутое» на манекен по правилам (шейдинг по
   нормали, зеркалирование по центру спинки). Это даёт 80% ценности за 20% усилий `[PROPOSAL]`.
2. **Этап 2:** ткань на Rapier soft bodies (кросс-браузерно), сетка 20×20, без self-contact.
3. **Этап 3 (опционально, только Chrome/Edge):** WebGPU compute-путь по мотивам примера three.js.
4. **Никогда в браузере:** FEM, само-столкновение ткани, точная драпировка `[PROPOSAL]`.

## B.4 Форматы 3D-ассетов

- Загрузка: `three` `GLTFLoader` (входит в `three/examples/jsm`) + `DRACOLoader` (`draco3d@1.5.9`, Apache-2.0) и
  `KTX2Loader` (`ktx-parse@2.0.0`, MIT) для сжатия `[VERIFIED: registry]`.
- Сжатие/оптимизация нашей геометрии: `@gltf-transform/core@4.5.1` + `functions` + `extensions` (все MIT),
  `meshoptimizer@1.3.0` (MIT) `[VERIFIED: registry]`.
- `meshoptimizer@1.3.0` у `three` идёт как optional peer — версии надо держать согласованными `[VERIFIED]`.
- Для процедурного манекена GLB не нужен вовсе: генерируем `BufferGeometry` в рантайме → ноль ассетов, ноль лицензий,
  мгновенная реакция на изменение мерок `[PROPOSAL]`.

---

# Часть C — Экспорт: DXF, PDF, печать

## C.1 Что требует реальный apparel CAD

Проверено по документации CLO (профессиональная система) и ASTM:

- **Форматы DXF:** `DXF-AAMA`, `DXF-ASTM`, `Standard DXF`. CLO пишет и читает все три; «DXF-AAMA совместим с
  Gerber, Lectra, StyleCAD, Optitex, PAD System» `[VERIFIED:
  https://support.clo3d.com/hc/en-us/articles/115000493067-2D-Pattern-DXF-Import-Export]`.
- **Стандарт:** ASTM D6673 «Standard Practice for Sewn Products Pattern Data Interchange-Data Format» —
  использует DXF (спецификация Autodesk DXF v13) + отдельный ASCII-формат для grade rule tables; ограничен обменом
  деталями внутри одного стиля и не покрывает cutter-инструкции, раскладку маркеров и спрединг.
  **Важно: последняя редакция D6673-10 снята с действия в 2019 году, «No replacement»** `[VERIFIED:
  https://store.astm.org/d6673-10.html — «Standard Withdrawn, No replacement, Last Updated: Jan 09, 2019»]`;
  предыдущая D6673-04 помечена в каталоге как «Historical» `[VERIFIED: https://store.astm.org/d6673-04.html]`.
  То есть **актуальной редакции стандарта сейчас нет** — отрасль фактически живёт на AAMA-приложении и на
  соглашениях вендоров (CLO/Lectra/Gerber) `[INFERRED]`.
  Открытый первичный документ: «DXF-Ansi-AAMA.pdf» (Annex AAMA) `[VERIFIED: публичный PDF AAMA]`.
- **Что должно быть в файле (по опциям экспорта CLO):** контур детали, sewing line, cutting line, seam allowance,
  **notches** (в т.ч. «Duplicate Notch on Seam Allowance»), grainline, drill holes, grade rules (в DXF или отдельным
  rule-файлом), bounding box детали, масштаб/единицы, «Export without Grading», «Optimize All Curve Points»
  `[VERIFIED: там же]`.
- **Печать:** 1:1, A4/A3, при раскладке на нескольких листах — плитки с метками совмещения, названием детали,
  грифом, количеством и направлением долевой `[INFERRED из практики CAD]`.

## C.2 DXF

| Пакет | Версия | Лицензия | Где | Оценка |
|---|---|---|---|---|
| **`ezdxf`** | **1.4.5** | MIT (classifier) | **Python, сервер** | **Рекомендуем.** Читает/пишет R12, R2000, R2004, R2007, R2010, R2013, R2018; ASCII и Binary DXF; сохраняет чужой контент; есть аддоны `drawing` (визуализация → PNG/PDF/SVG), `r12writer` (быстрый прямой R12), `text2path`, `hpgl2`; C-расширения в wheels `[VERIFIED: https://ezdxf.readthedocs.io/en/stable/]` |
| `@tarikjabiri/dxf` | 2.10.0 | MIT | JS, браузер | Типизированный DXF-писатель (Blocks, Hatch, Image, Insert), активен (релиз 2026-10-30) `[VERIFIED: https://dxf.vercel.app/, https://github.com/dxfjs/writer]` |
| `dxf-writer` | 1.18.4 | MIT | JS, браузер | Старый и простой: arc, circle, ellipse, line, point, polygon, polyline, polyline3d, spline, text, 3DFace; `setUnits()`; **релиз 2022-11-07** — не развивается `[VERIFIED: https://raw.githubusercontent.com/ognjen-petrovic/js-dxf/master/README.md]` |
| `dxf-parser` | 1.1.2 | MIT | JS | только чтение, для round-trip тестов `[VERIFIED]` |

**Рекомендация:** **экспорт DXF — на сервере через `ezdxf==1.4.5`** (MIT, актуальный, поддерживает нужные версии DXF и
AAMA/ASTM-конвенции). Клиентский JS-писатель держим как резерв (`@tarikjabiri/dxf`, MIT) — например, для «экспорт
одной детали без round-trip» в MVP.

**AAMA/ASTM-специфика — риск и что делать.** Стандарт **D6673-10 снят с действия в 2019 («Withdrawn, No replacement»)**,
причём **вся ветка ASTM по обмену данными швейных изделий мертва**: подкомитет D13.66 показывает «Active: 0 matching
standards, Proposed New: 0», «Withdrawn, Replaced: 8» `[VERIFIED: https://store.astm.org/d6673-10.html,
https://www.astm.org/membership-participation/technical-committees/committee-d13/subcommittee-d13/jurisdiction-d1366]`.
То есть живого «официального» текста формата сейчас нет, и отрасль живёт на AAMA-приложении и соглашениях вендоров
(CLO/Lectra/Gerber) `[INFERRED]`.

**Что при этом доступно бесплатно и пригодно для реализации:**

| Источник | Что даёт | Статус |
|---|---|---|
| ASTM D6673-10, открытый sample PDF (4 стр., §1–4.3.1.6) | определения §3.1, послойная структура §4.3, **таблица 23 слоёв**, system text, piece system text | открыт `[VERIFIED: https://www.normsplash.com/Samples/ASTM/191361149/ASTM-D6673-10-en.pdf]` |
| Patro (open-source реализация ASTM-формата) | та же таблица слоёв с назначением + правило «слои **нумеруются**, а не называются текстом» | открыт `[VERIFIED: https://fabricesalvaire.github.io/Patro/resources/file-format/dxf-astm.html]` |
| NIST IR 5969 (Pawlak) | формализация delta-grading: `GRADE_DELTA` («displacement vector… amounts of growth in the X and Y directions»), `GRADE_POINT`, `GRADE_DATA_AT_POINT`, `GRADE_RULE_AT_POINT` | открыт `[VERIFIED: https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5969.pdf]` |
| NIST IR 5823 (Pawlak) | обзор стандартов, Приложение C.1 «AAMA Standards» | открыт `[VERIFIED: https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5823.pdf]` |

⚠️ **Формат самого Grade Rule Table File (§5, ASCII) в открытый sample НЕ входит** — sample обрывается на §4.3.1.6.
Построчный формат ASCII-таблицы правил придётся покупать (AAMA-292 / AAMA-292B) или ASTM D6673-04 `[VERIFIED]` `[PROPOSAL]`.

**Практический вывод для нашего экспорта (маппинг слоёв ASTM → наша модель из API-контракта):**

| Наше поле (API-контракт §3) | Слой ASTM | Комментарий |
|---|---|---|
| `outline` | **1** piece boundary | контур детали: одна или несколько closed-polylines |
| `seam_line` | **14** sew lines | линия строчки |
| `notches` | **4** V-notch и slit notch (+ **80** T-notch, **81** castle, **82** check, **83** U-notch) | надрезы |
| `grainline` | **7** grainline | долевая |
| `internal_lines` | **8** internal lines | вытачки, линии сборки |
| grade reference line / alternate grade reference line | **5** | оси градации |
| — | **2** turn points, **3** curve points | вычисляются из boundary-полилинии (см. ниже) |
| — | **11** internal cutouts, **13** drill holes, **6** mirror line | вырезы, проколы, ось симметрии |
| — | **84–87** quality validation curves | контроль точности кривых |

Слои **нумеруются**, а не именуются текстом («Layer numbers are used to identify each layer… Numbers are used, rather
than text, since many programs that support the DXF format are unable to generate or accept non-numeric layer
designations») `[VERIFIED: D6673-10 §4.3]`.

**Ограничения стандарта, которые важно не перепутать** `[VERIFIED: D6673-10 §4.3, §4.3.1.4, §4.3.1.5]`:

- §4.3, ограничения (1)–(3): на слое 1 граница детали — одна или несколько полилиний, образующих замкнутый многоугольник;
  **слой 2 содержит все turn points, найденные на слоях 1, 8, 11 и 14**; **слой 3 содержит все curve points, найденные
  на слоях 1, 8, 11 и 14**. То есть turn points и curve points — это **производные** от boundary-полилинии, а не
  независимые градируемые точки.
- §4.3.1.4: правила градации **нельзя** класть на слои **2** (turn point), **3** (curve point), **6** (mirror line),
  **84–87** (quality validation curves).
- §4.3.1.5: «All points and ATTDEF entities must be repeated in each block (i.e. each size) of the nest. Points and
  ATTDEF entities for each graded size are given in the same order, quantity and layer as the sample size.»
  **НО** тут же: «Because the points are the same on all sizes, only the sample size needs all the applicable layers.
  The following layers **should not appear within graded sizes**: Layer 2 Turn points, Layer 3 Curve points, Layer 4
  Slit/V-notches, Layer 5 Alternate grade reference lines, Layer 80 T-notches, Layer 81 Castle notches, Layer 82
  Check notches, Layer 83 U-notch.»

> **Важное уточнение (исправление прежней формулировки в этом документе).** Инвариант «одинаковый порядок,
> количество и слой» относится к **points и ATTDEF entities** (то есть к градируемым конструктивным точкам и
> текстовым меткам), а **не к вершинам boundary-полилинии**. Поэтому «одинаковое количество вершин контура во всех
> размерах» стандартом **не требуется и не гарантируется**: при смене кривизны на границе могут появляться и
> исчезать curve points. Соответствие должно поддерживаться **по конструктивным (именованным) точкам**, а не по
> индексам вершин полилинии `[VERIFIED: D6673-10 §4.3.1.5 + §3.2.4 «validation vertex»]`.
> Практическое следствие: если backend генерирует градацию, применяя ΔX/ΔY/ΔR к **именованным** конструктивным
> точкам, а границы строит из них, соответствие выполняется по построению. Если градация применяется к индексам
> вершин готового полигона — инвариант может нарушиться при изменении кривизны `[INFERRED]`.
> Это зона **backend-контракта генератора**, не фронта: фронту достаточно получать готовые полигоны по размерам `[INFERRED]`.

**Рекомендация:** экспортировать DXF в **ASTM-формате с нумерованными слоями по этой таблице** — это даёт
максимальную совместимость с импортёрами (CLO/Lectra/Gerber читают DXF-ASTM) без необходимости покупать стандарт,
поскольку соответствие слоёв опубликовано в открытом sample и в open-source Patro `[PROPOSAL]`.
Grade rules пока не пишем (нужен ASCII-формат §5, которого нет в открытом доступе) — вместо этого отдаём
**готовые полигоны под каждый размер** («graded nest» по §4.3.1.5: несколько блоков с одинаковым именем детали =
размеры, порядок блоков = порядок размеров, в каждом блоке — grade reference line; только sample size содержит все
применимые слои, в остальных размерах слои 2, 3, 4, 80–83 отсутствуют) `[VERIFIED: D6673-10 §4.3.1.5]`.
Это легально по стандарту и проще для рендера; интерполяцию «призрака» соседнего размера при необходимости делает
backend, а не фронт `[INFERRED]`.
Отдельно: «The receiving system should be able to interpret the base pattern and appropriate delta grading regardless
of which representation is used» — то есть получатель вправе считать градацию и сам, имея points + правила `[VERIFIED]`.

**Кто отвечает за форму кривой — цитата, которую стоит иметь под рукой** `[VERIFIED: D6673-10 §4.3.1.6, открытый
sample PDF]`:

> «When grade rules are applied to pieces with a given sample size, the curve quality of the resulting graded piece
> boundaries in the importing system cannot be validated to those of the exporting system. **This is because this
> standard does not define a common curve interpolation algorithm.** Under such circumstances, the quality of the
> graded piece polylines can only be validated using a graded nest. A graded nest will ensure that the piece polylines
> of all sizes are defined in the corresponding Quality Validation Layers.»

Практический смысл: **стандарт не задаёт алгоритм интерполяции кривых**, поэтому «форма кривой» градированной
границы остаётся на стороне CAD-системы, а не стандарта. Именно поэтому «готовые полигоны по размерам» — правильный
выбор для нашего пайплайна: мы **отдаём** уже интерполированную границу (свои curve points), а не правила, применение
которых у получателя даст другую форму кривой `[INFERRED]`. Если бы мы отдавали только points + grade rules, каждая
сторона получила бы свою интерполяцию — и качество нельзя было бы проверить.

## C.3 PDF

### Принятое решение и его история

> **В пилоте использован PyMuPDF, заменён на reportlab до релиза 2026-11-03.** Причина — лицензионная, а не
> техническая: продукт коммерческий, а AGPL-3.0 у PyMuPDF несовместим с закрытым SaaS без отдельной лицензии
> Artifex. Технически обе библиотеки дают векторный PDF 1:1 в миллиметрах, поэтому переход затронул только
> `backend/app/export/pdf.py`; `export/layout.py` (чистая геометрия раскладки) остался как есть `[VERIFIED:
> backend/app/export/layout.py — «Page layout shared by the SVG and PDF exporters»; pdf.py импортирует только
> reportlab]`.
>
> **Текущее состояние: порт завершён, `pymupdf` удалён из окружения полностью.** `backend/app/export/pdf.py`
> импортирует только `reportlab.pdfbase.pdfmetrics`, `reportlab.pdfbase.ttfonts.TTFont` и `reportlab.pdfgen.canvas`;
> **в `backend/app` и `frontend/src` нет ни одного упоминания `pymupdf`/`fitz`**; в `.venv` пакетов `pymupdf*`
> **нет вообще** `[VERIFIED: backend/app/export/pdf.py (строки импортов), grep по backend/app + frontend/src = 0
> совпадений, ls .venv/Lib/site-packages = reportlab-5.1.0.dist-info, ezdxf-1.4.5, без pymupdf*]`.
> То есть лицензионный риск **закрыт, а не «инертен»** — зависимости не просто не импортируются, их нет в venv.

**Итог: `reportlab==5.1.0` (BSD-3-Clause) — принятое в пилоте решение. `pymupdf` — отклонён по лицензии и удалён.**

Что сохранилось при переносе:
- **Единицы пользовательского пространства PDF = миллиметры.** `MM_TO_PT = 72.0 / 25.4`, размер страницы задаётся
  в пунктах: A4 landscape → MediaBox `841.89 × 595.28 pt` `[VERIFIED: backend/app/export/pdf.py]`. То есть 1:1 печать
  получается без поправок: масштаб задан размером листа, а не множителем `[INFERRED]`.
- **Векторный вывод** через примитивы страницы; типы линий разделены по назначению: cut / seam / grain / notch /
  internal / mark — у каждого своя толщина (0.35 / 0.2 / 0.25 / 0.3 / 0.2 / 0.2 мм) и цвет `[VERIFIED:
  `STROKE_WIDTHS_MM`, `STROKE_COLORS`]`. Для раскроя это обязательное условие: растр на A4 непригоден для плоттера.
- **Страница = лист.** Листы раскладки считает наш код (`build_pages`/`build_page` из `export/layout.py`), а
  PDF-библиотека — только исполнитель примитивов. Разделение слоёв подтверждено тем, что `layout.py` вообще не
  знает про PDF `[VERIFIED: layout.py — docstring «shared by the SVG and PDF exporters», ни одного упоминания
  reportlab/pymupdf в файле]`.
- **Размер страницы проверяется тестом** — MediaBox A4/A3 зафиксирован как контракт `[VERIFIED:
  backend/tests/test_export.py — `test_pdf_opens_and_has_a4_landscape_mediabox` (mediabox ≈ 841.89 × 595.28),
  `test_pdf_portrait_mediabox` (≈ 595.28 × 841.89), `test_pdf_single_page_wrapper_has_one_page`,
  `test_pdf_is_a_real_pdf` (сигнатура `%PDF` … `%%EOF`), `test_pdf_page_count_grows_for_oversized_piece`]`.

### Кириллица в PDF: отдельная обязательная деталь

Подписи деталей в пилоте — **на русском**, поэтому в PDF нужен шрифт с кириллическими глифами.

- **Стандартные 14 шрифтов PDF (Helvetica и прочие) кириллицу НЕ содержат** — они используют WinAnsiEncoding
  (однобайтовый, латиница). ReportLab по умолчанию подставляет Symbol/ZapfDingbats при отсутствии глифа, но
  кириллицы там нет — получится «notdef» (точка/пробел), а не буква `[VERIFIED:
  https://docs.reportlab.com/reportlab/userguide/ch3_fonts/ — «the standard fonts (Helvetica, Courier, Times Roman)
  will offer the glyphs available in Latin-1»; про отсутствие глифа выводится 'notdef' character]`.
- **Нужен TrueType-шрифт**, регистрируемый через `pdfmetrics.registerFont(TTFont(...))` — он встраивается в PDF
  как подмножество и работает в Unicode/UTF-8 `[VERIFIED: https://docs.reportlab.com/reportlab/userguide/ch3_fonts/ —
  раздел «TrueType Font Support»]`.
- **Проверено на этой машине** (fontTools 4.68.0, `TTFont.getBestCmap()`): `C:\Windows\Fonts\arial.ttf`,
  `segoeui.ttf`, `tahoma.ttf` — кириллицу **имеют** (3506 / 3996 / 3772 глифов, `А`/`а`/`я`/`Ё` на месте);
  `reportlab/fonts/Vera.ttf` (единственный TTF в поставке reportlab) — **не имеет** (256 глифов, кириллица
  отсутствует: нет 0x410, 0x430, 0x44F, 0x401) `[VERIFIED: замер по .venv/Lib/site-packages/reportlab/fonts/Vera.ttf
  и C:/Windows/Fonts/*.ttf]`.
  **Вывод: `Vera.ttf` из reportlab как fallback не годится** — нужен системный Arial/Verdana/Segoe UI/Tahoma
  (список кандидатов уже прописан в `backend/app/export/pdf.py`: `FONT_CANDIDATES`) или **собственный вендорённый
  DejaVuSans.ttf** с DejaVu/Liberation (в venv сейчас DejaVu нет — проверено) `[VERIFIED]`.
- **Как это сделано в пилоте** `[VERIFIED: backend/app/export/pdf.py]`:
  `_register_fonts()` перебирает `FONT_CANDIDATES` и регистрирует пару `TTFont("PatternSans")` /
  `TTFont("PatternSans-Bold")`; если ни один системный файл не подошёл, возвращается
  `("Helvetica", "Helvetica-Bold")` и выставляется флаг `transliterate_labels = fonts[0] == FALLBACK_FONT` —
  **подписи при отсутствии кириллического шрифта транслитерируются, а не печатаются пустыми квадратами**.
  Это ровно то поведение, которого я рекомендовал как минимум («не молча выводить notdef»), причём реализовано
  в коде, а не осталось рекомендацией `[VERIFIED]`.
- **Round-trip проверен end-to-end**: `reportlab` + `TTFont('Arial', 'C:/Windows/Fonts/arial.ttf')` на странице
  A4 landscape (`pagesize=(841.89, 595.28)`) → PDF 76 КБ, в странице шрифты `AAAAAA+ArialMT` и
  `AAAAAA+Arial-BoldMT` (TrueType-подмножества), извлечённый текст — ровно `'Перед Тело 42\nРазмер 42'`,
  `page.rect = Rect(0.0, 0.0, 841.8900146484375, 595.280029296875)` `[VERIFIED: локальный прогон в .venv на
  reportlab 5.1.0]`.
- **Следствие для теста:** проверка читаемости русских подписей в PDF — не «открылся файл», а **извлечение текста
  и сравнение с ожидаемой строкой**. Побайтовое сравнение PDF не подходит: при встраивании подмножества шрифта
  вывод недетерминирован. **В пилоте это именно так и сделано** — `pypdf==6.21.4` стоит в venv, а тесты читают
  текст через `pypdf.PdfReader(...).pages[0].extract_text()` и проверяют, что в нём есть «Перед» и «Рукав» `[VERIFIED:
  backend/tests/test_export.py — `test_pdf_extracts_piece_label` («Перед», «cut 2»),
  `test_pdf_single_page_carries_piece_labels` («Перед», «Рукав»)]`.
- **Отдельно про кроссплатформенность:** путь `C:/Windows/Fonts/...` работает только на Windows. Для Linux/CI
  нужен либо DejaVu из `/usr/share/fonts/truetype/dejavu/`, либо вендорённый в репозиторий шрифт. ReportLab прямо
  рекомендует держать нужные шрифты как часть поставки приложения, а не зависеть от установленных в системе
  `[VERIFIED: https://docs.reportlab.com/reportlab/userguide/ch3_fonts/ — «have any needed fonts as packaged parts
  of your application in any kind of controlled server deployment»]`. **Текущее поведение при отсутствии шрифта —
  транслитерация, поэтому «пустые квадраты» в PDF не появятся никогда**, но читаемость русских подписей на
  Linux/CI без вендорённого шрифта будет потеряна (останется латиница) `[INFERRED]`.

### Сравнение: `reportlab` vs `pymupdf` vs остальные

| Пакет | Версия | Лицензия | Где | Оценка |
|---|---|---|---|---|
| **`reportlab`** | **5.1.0** (принято) | **BSD-3-Clause** | **Python, сервер** | **ПРИНЯТОЕ РЕШЕНИЕ.** Лицензионно чистый (BSD — «you can basically do anything you want with it, including using it in a commercial package»), низкоуровневый контроль страницы/units, встраивание TrueType для кириллицы `[VERIFIED: https://pypi.org/project/reportlab/, https://docs.reportlab.com/developerfaqs/ — раздел 1.3 Licensing]` |
| `pymupdf` | 2.1 | **AGPL-3.0 ИЛИ коммерческая лицензия Artifex** | Python, сервер | **ОТКЛОНЁН ПО ЛИЦЕНЗИИ.** Технически хорош (векторный API страницы, предсказуемый MediaBox, быстрый), но AGPL-3.0 с сетевым триггером несовместим с закрытым коммерческим SaaS без отдельной лицензии Artifex. В пилоте был использован и заменён до релиза `[VERIFIED: https://pypi.org/project/pymupdf/ — «Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License»; METADATA установленного пакета]` |
| `svglib` | 2.3.2 | **LGPL-3.0-or-later** | Python, сервер | SVG → ReportLab `Drawing` → PDF; CLI `svg2pdf`; 1 px = 0.75 pt, для печати объявлять `width/height` в мм + `viewBox`; ограничения: `mask` и `foreignObject` не поддерживаются `[VERIFIED: https://pypi.org/project/svglib/]` |
| `cairosvg` | 2.9.1 | LGPL-3.0-or-later | Python, сервер | SVG→PNG/PDF; требует Cairo в системе `[VERIFIED]` |
| `weasyprint` | 70.0 | BSD | Python, сервер | HTML/CSS → PDF с paged media; для «документа с раскладкой» удобно, но для точной геометрии лекал тяжеловее `[VERIFIED]` |
| `pypdf` | 6.21.4 | BSD-3-Clause | Python | пост-обработка/проверка PDF; удобен как разборщик в тесте читаемости подписей `[VERIFIED]` |
| `pdfkit` | 0.20.2 | MIT | JS, браузер/Node | Активен (2026-08-30), ESM+exports, `fontkit` для шрифтов; базовые единицы — points `[VERIFIED: registry]` |
| `jspdf` | 4.2.1 | MIT | JS, браузер | Активен (2026-03-17), ESM, `unit: "mm"` по умолчанию, форматы A0–A10/B0–B10 (a3 = 841.89×1190.55 pt = 297×420 мм) `[VERIFIED: https://github.com/parallax/jsPDF + разбор бандла]` |
| `pdfmake` | 0.3.13 | MIT | JS | декларативный, тянет pdfkit; для программируемых чертежей избыточен `[VERIFIED]` |
| **`pdf-lib`** | 1.17.1 | MIT | JS | **Не брать: последний релиз v1.17.1 — 2021-11-06, репозиторий без активности** `[VERIFIED: https://github.com/Hopding/pdf-lib/releases.atom]` |
| `svg-to-pdfkit` | 0.1.8 | MIT | JS | вставка SVG в PDFKit; **последний npm-релиз 2019-11-24** — риск `[VERIFIED: registry]` |
| `pagedjs` | 0.4.3 | MIT | JS | paged media для браузера; **npm-релиз 2023-07-06**, официальный репозиторий в GitLab `coko.foundation` (домен не резолвится), GitHub-зеркало живое до 2026-10-20 `[VERIFIED: https://github.com/pagedjs/pagedjs/commits/main.atom]` |

### Рекомендация по PDF (актуальная)

1. **Принято: `reportlab==5.1.0` (BSD-3-Clause).** Переход с PyMuPDF выполнен до релиза 2026-11-03 по лицензионным
   причинам; техническая схема (своя раскладка + библиотека как тонкий адаптер) не изменилась `[VERIFIED]`.
2. **Кириллица — обязательный пункт реализации**: TrueType-шрифт через `TTFont`/`registerFont`; `Vera.ttf` из
   поставки reportlab не подходит; системный Arial/Verdana/Segoe UI/Tahoma подходит, DejaVu/Liberation — для
   Linux/CI; лучше вендорённый в репозиторий шрифт, чтобы не зависеть от машины `[VERIFIED]`.
3. **Тест читаемости подписей** = извлечение текста из PDF и сравнение с ожидаемой русской строкой, а не
   сравнение байтов `[PROPOSAL]`.
4. **`svglib` — только если** уже генерируем SVG как промежуточное представление; LGPL-3.0 — copyleft, вопрос к юристу
   `[VERIFIED: лицензия в classifiers]`.
5. **Клиентский PDF** (`jspdf` или `pdfkit`) — для «экспортировать PDF прямо из редактора» без похода на сервер.
   `jspdf` удобнее для A4/A3 + мм; `pdfkit` мощнее по вектору и шрифтам `[VERIFIED]`.
6. **`pagedjs` — не берём**: плитки раскладки лекал решаются своей геометрией (`export/layout.py`), а не CSS-paged-media,
   а зависимость с полумёртвым репозиторием — лишний риск `[PROPOSAL]`.

## C.4 Плитки и печать: что делаем сами

Формат листа печати, который ожидает швейный цех: A4 (210×297) или A3 (297×420), масштаб 1:1, деталь может
не влезать → разбиваем на плитки с перекрытием ~10 мм и метками совмещения (кресты по краям), на каждой плитке —
имя детали, размер, количество, стрелка долевой, номер плитки «2/3» `[PROPOSAL]`.

Реализация: считаем bounding box детали, режем прямоугольниками по листу с отступом, в каждой плитке рисуем
только видимую часть контура (клиппинг по плитке) + текстовые метки.

**В пилоте это уже сделано на бэкенде и разделено на два слоя** `[VERIFIED: backend/app/export/layout.py +
backend/app/export/pdf.py]`:
- `export/layout.py` → `build_pages()` и тип `Page`: **чистая геометрия раскладки** (листы, плитки, что на листе);
- `export/pdf.py` → `render_pdf()`: **тонкий адаптер**, который берёт готовые листы и рисует их примитивами страницы
  `pymupdf` (линии/полилинии, толщины и цвета по типам линий, dash-паттерны), формируя MediaBox A4/A3 в пунктах.

То есть разделение «своя геометрия / библиотека» из этого документа — **не рекомендация, а уже реализованная
структура**: смена PDF-библиотеки (PyMuPDF → reportlab) затронет только `export/pdf.py`, а не раскладку `[INFERRED]`.

---

# Часть D — Svelte 5, SvelteKit 3, Playwright, монорепо

> **Важно: разрыв между исследованием и пилотом.** Разделы D.1–D.4 описывают **актуальное состояние экосистемы на
> 2026-11-03** (Svelte 5.57.3, SvelteKit 3.1.1, Vite 8, TypeScript 6/7, Playwright 1.64.1) — это опережающая карта для
> планирования апгрейда. **В пилоте же зафиксировано другое** `[VERIFIED: frontend/package.json + установленные
> версии в frontend/node_modules]`:
>
> | Пакет | В пилоте | В актуальной экосистеме (этот документ) |
> |---|---|---|
> | `svelte` | **5.57.3** | 5.57.3 — совпадает |
> | `@sveltejs/kit` | **2.70.3** | 3.1.1 (конфиг переехал в `vite.config.js`) |
> | `@sveltejs/vite-plugin-svelte` | **6.2.4** | 7.3.1 |
> | `vite` | **7.3.7** | 8.3.5 |
> | `typescript` | **5.9.3** | 6.0.3 / 7.0.2 |
> | `@sveltejs/adapter-auto` | **7.0.1** | `adapter-static@4.0.1` для статики |
> | `svelte.config.js` | **есть** | в SvelteKit 3 **не поддерживается** |
> | `three` | **0.187.0** | 0.187.0 — совпадает |
> | `@types/three` | **0.187.0** | 0.187.0 — совпадает |
>
> Практические следствия для пилота:
> - **Пилот на SvelteKit 2** → конфиг лежит в `svelte.config.js`, а не в `vite.config.js`; `$lib` ещё работает как
>   алиас (а не `#lib`); `$app/environment` ещё не переименован в `$app/env` `[VERIFIED: svelte.dev/docs/kit/migrating-to-sveltekit-3]`.
>   То есть **никаких правок фронтенда ради апгрейда сейчас не требуется** — миграция на SvelteKit 3 отдельная задача
>   с чек-листом из раздела D.2 `[PROPOSAL]`.
> - **Пилот на Vite 7 и TypeScript 5.9.3** → peer-конфликта с SvelteKit 2 нет. Ограничения «не TypeScript 7» из
>   раздела D.2 касаются **только** SvelteKit 3; для текущего пилота они неактуальны `[INFERRED]`.
> - **`adapter-auto` вместо `adapter-static`** → в пилоте выбран универсальный адаптер; для статического хостинга
>   его можно заменить на `adapter-static` с `fallback: 'index.html'`, когда появится SPA-маршрутизация `[VERIFIED:
>   https://svelte.dev/docs/kit/adapter-static]`. Для dev-сценария «бэкенд + vite preview» это не нужно: E2E гоняется
>   против `npm run preview` (собранный фронт), а не против dev-сервера `[VERIFIED: e2e/playwright.config.ts]`.
> - **Playwright в пилоте — 1.64.1** (та же версия, что в документе) `[VERIFIED: .venv/Lib/site-packages/playwright-1.64.1.dist-info]`.
>
> Остальные разделы документа (2D/3D/экспорт) описывают **рекомендации**, а не фактическое состояние пилота;
> расхождения помечены явно.

## D.1 Svelte 5: актуальное состояние рун

Версия на сегодня: **`svelte@5.57.3`** (MIT, релиз 2026-10-26) `[VERIFIED: registry]`.
Документация `https://svelte.dev/docs/svelte/llms.txt` (актуальная) содержит следующие руны `[VERIFIED]`:

| Руна | Назначение | Версия в доках |
|---|---|---|
| `$state` | реактивное состояние; глубокий proxy для массивов/объектов | базовая |
| `$state.raw` | без глубокой реактивности, только переприсваивание | базовая |
| `$state.snapshot` | статический снимок прокси (для `structuredClone`, внешних API) | базовая |
| `$state.eager` | обновление UI немедленно, без ожидания синхронизации `await` | базовая |
| `$derived` / `$derived.by` | вычисляемое значение / вычисляемое из функции | базовая |
| `$effect` | побочные эффекты | базовая |
| `$effect.pre` | эффект **до** обновления DOM | базовая |
| `$effect.root` | ручной scope эффектов с ручной очисткой | базовая |
| `$effect.tracking` | читает, какие зависимости отслеживаются | базовая |
| `$effect.pending` | число pending-промисов в boundary | базовая |
| `$props` / `$props.id()` | пропсы; уникальный id инстанса (SSR-стабильный) | `$props.id()` — с 5.20.0 |
| `$bindable` | двусторонняя привязка | базовая |
| `$inspect` / `$inspect.trace` | отладка; `.trace` — с 5.14 | — |
| `$host` | доступ к host-элементу в custom element | базовая |

Плюс **snippets** (`{#snippet}` / `{@render}`) — 183 упоминания в документации `[VERIFIED]`.

**Практические выводы для нашего кода:**

- Геометрия детали — это `$state`/`$derived` над **типизированными** структурами. `$state` даёт глубокий proxy —
  для больших массивов точек это overhead; используем `$state.raw` + переприсваивание, либо вообще держим геометрию
  вне `$state` и обновляем через явные ссылки `[INFERRED]`.
- `$derived` — идеально для «контур детали → `d` атрибута path» и для реактивных метрик (площадь, длина).
- `$effect` — только для синхронизации с внешними системами (запись в undo-стек, отправка в API). Внутри 2D-сцены
  эффектов быть почти не должно `[INFERRED]`.
- `$state.snapshot` — перед отправкой геометрии на сервер (proxy в JSON не уедет) `[VERIFIED]`.

## D.2 SvelteKit 3: что изменилось и что это значит

**Версия: `@sveltejs/kit@3.1.1`** (MIT, релиз 2026-10-29) `[VERIFIED: registry]`.
Peer-зависимости: `vite ^8.0.12`, `svelte ^5.57.1`, `typescript ^6.0.0`, `@sveltejs/vite-plugin-svelte ^7.0.0`;
`engines.node >= 22.17` `[VERIFIED]`.

**Критичные для нас изменения SvelteKit 3** `[VERIFIED: https://svelte.dev/docs/kit/migrating-to-sveltekit-3]`:

1. **`svelte.config.js` больше не поддерживается.** Вся конфигурация проекта передаётся в Vite-плагин `sveltekit()`
   внутри `vite.config.js` (опция `adapter`, `compilerOptions`, `experimental`, `paths`, `csrf`, `tracing`).
   Автомиграция: `npx sv migrate sveltekit-3`.
2. **`$lib` → `#lib`.** Алиас `$lib` больше не генерируется; объявляется в поле `imports` в `package.json`
   (subpath imports Node), включая расширения файлов: `import { foo } from '#lib/foo.js'`.
3. **`$app/environment` → `$app/env`.**
4. Убраны опции: `files.lib`, `experimental.handleRenderingErrors`, `experimental.instrumentation`,
   `preloadStrategy`, `prerender.origin` (заменён на `paths.origin`), `csrf.checkOrigin` (заменён на `csrf.trustedOrigins`),
   `vitePlugin`.
5. Добавлены: `output.linkHeaderPreload`, `csrf.trustedOrigins`, `paths.origin`.
6. `version.pollInterval` по умолчанию 1 час.
7. Минимальные версии: Node 22.17, TypeScript 6, Svelte 5.57.1, Vite 8.0.12 (первый Vite 8 со стабильным rolldown 1),
   vite-plugin-svelte 7.

> **Важно для планирования:** `typescript@latest` сейчас **7.0.2** (Apache-2.0, релиз 2026-07-08) `[VERIFIED: registry]`,
> но SvelteKit 3 требует peer `typescript ^6.0.0`, а `svelte-check@4.7.8` — peer `typescript ^5.0.0 || ^6.0.0`, и
> `typescript-eslint@8.72.1` — `typescript >=4.8.4 <6.1.0` `[VERIFIED]`.
> **Вывод:** фиксируем **TypeScript 6.0.3** (последний 6.x, релиз 2026-04-16) `[VERIFIED]`, пока не пройдут все
> peer-ограничения. Это ровно тот случай, где «latest» ломает сборку `[INFERRED]`.

### `adapter-static`

`@sveltejs/adapter-static@4.0.1` (MIT, релиз 2026-10-29), peer `@sveltejs/kit ^3.0.0-next.0` `[VERIFIED]`.
Опции: `pages` (по умолчанию `build`), `assets`, `fallback` (для SPA), `precompress`, `strict` (по умолчанию `true`) `[VERIFIED:
https://svelte.dev/docs/kit/adapter-static]`.

**Нюансы, которые важны нам** `[VERIFIED]`:

- Для SPA обязателен `fallback` (обычно `200.html` или `index.html`), иначе сборка падает на `strict`-проверке.
- **`ssr` не должен быть `false`**, иначе пререндер сохранит «пустую оболочку» вместо отрендеренного контента.
- Если хостинг не отдаёт `/a.html` по запросу `/a` — нужен `trailingSlash: 'always'`.
- `precompress: true` даёт `.br`/`.gz` — полезно, если отдаём статику nginx'ом.

**Вывод для нашей архитектуры:** фронтенд — фактически SPA, который ходит в FastAPI за геометрией и за экспортами.
Значит `adapter-static` c `fallback: 'index.html'` и `ssr: true` (по умолчанию) — правильный выбор; статику
отдаёт либо nginx, либо сам FastAPI (`StaticFiles`) `[PROPOSAL]`.

## D.3 Playwright в 2026

**`@playwright/test@1.64.1`** (Apache-2.0, релиз 2026-10-14, `engines.node >= 20`) `[VERIFIED: registry]`.
Браузеры этой версии: **Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2**; тестировались также Chrome 155 и Edge 155
`[VERIFIED: https://playwright.dev/docs/release-notes]`.

**Что важно из свежих релизов** `[VERIFIED: release notes]`:

| Версия | Фича | Значение для нас |
|---|---|---|
| 1.64 | `page.webmcp` / `frame.webmcp`, `playwright-cli webmcp-*` | не нужно |
| 1.64 | видео с произвольным `fps`, VP9 | для видео-артефактов E2E — приятно |
| 1.64 | `testProject.default` — проект не гоняется по умолчанию | удобно: chromium — по умолчанию, firefox/webkit — по флагу |
| 1.64 | `--shuffle` + seed | детерминированный порядок E2E |
| 1.64 | `locator.within()` | «кнопка внутри диалога» |
| 1.64 | `page.getByRef()` | локаторы по aria-ref |
| 1.64 | `expect.toHaveScreenshot({ type: 'webp' })` | компактные снапшоты |
| 1.63 | **test locks** (`test.describe.configure({ lock: '...' })`) | защита от гонок на общих ресурсах |
| 1.63 | `locator.visible()` | замена `:visible` |
| 1.63 | `frameLocator()` без селектора | — |
| 1.63 | typed `request.get<User>('/api/...')` | типизированные API-тесты |
| 1.63 | `perfetto` reporter | таймлайн CI |

**Breaking changes 1.64**, которые ломают существующие тесты `[VERIFIED]`:

- `screen` теперь пробрасывается из device descriptors → media-query в тестах видят эмулированный экран; отключается
  явным `screen: undefined`;
- JSX в тестах теперь следует `tsconfig.json` (по умолчанию automatic runtime от `react/jsx-runtime`) — если мы JSX не
  используем, не важно;
- `--update-snapshots=missing` теперь **проходит** раун (раньше падал);
- элементы внутри скрытых iframe считаются скрытыми.

**Конфигурация** `[VERIFIED: https://playwright.dev/docs/test-configuration]`:
`testDir`, `fullyParallel`, `forbidOnly`, `retries`, `workers`, `globalTimeout`, `reporter`, `use.baseURL`,
`use.trace: 'on-first-retry'`, `projects[]`, `webServer { command, url, reuseExistingServer }`, `outputDir`,
`globalSetup/globalTeardown`, `timeout` (30 c по умолчанию), `expect.timeout` (5 c).

**Рекомендация:** `@playwright/test` (Apache-2.0) — только он (не `playwright` Library: у Library нет web-first
assertions, авто-ретраев и встроенного runner'а) `[VERIFIED: https://playwright.dev/docs/library]`.
В E2E обязательно **не полагаться на пиксельные снапшоты 2D-сцены** (Canvas/DOM-рендер различается между
Chromium/Firefox/WebKit, шрифты и AA отличаются) — проверять геометрию через API-ответы
(`/api/generate` → длины/площади), а не по картинке `[PROPOSAL]`. Снапшоты — только для 3D-превью с
фиксированной камерой и отключённым AA `[PROPOSAL]`.

**Unit/интеграция:** `vitest@5.1.0` (MIT, релиз 2026-11-02), peer `vite ^6.4 || ^7 || ^8`,
`engines.node ^22.12 || ^24 || >=26`; `@vitest/browser-playwright@5.1.0` — browser-режим на Playwright;
`@testing-library/svelte@5.4.2`; `msw@3.0.3` — мок API; `happy-dom@21.0.4` / `jsdom@30.1.3` `[VERIFIED: registry]`.
`jsdom` требует peer `canvas ^3.2.3` — либо ставим `canvas`, либо используем `happy-dom` `[VERIFIED]`.

## D.4 Монорепо: FastAPI + SvelteKit

### Структура

> **Что фактически в пилоте:** монорепо, но **на npm, без workspaces**, и Python-часть — на голом venv
> `[VERIFIED: frontend/package-lock.json (npm), .venv/ в корне, backend/ без pyproject.toml]`. Структура:
>
> ```
> shityo/
> ├── .venv/                    # Python-окружение (uvicorn, pymupdf, ezdxf, shapely, pytest, hypothesis, playwright)
> ├── frontend/                 # SvelteKit (Svelte 5) — приложение
> │   ├── package.json         # npm, без workspaces; зависимости: three + svelte
> │   ├── package-lock.json
> │   ├── svelte.config.js     # конфиг SvelteKit 2 (не vite.config.js!)
> │   ├── vite.config.ts
> │   ├── scripts/             # make-fixtures.py — генерация фикстур API
> │   └── src/
> │       ├── app.html, app.css
> │       └── lib/             # api.ts, data.ts, geometry.ts, types.ts, fixtures/*.json
> ├── backend/                  # Python (FastAPI)
> │   ├── app/
> │   │   ├── main.py           # точка входа
> │   │   ├── api/              # routes.py, schemas.py
> │   │   ├── core/             # geometry.py, measurements.py, sizes.py, validation.py
> │   │   ├── drafts/
> │   │   └── export/           # contour.py, layout.py, pdf.py (pymupdf), dxf.py (ezdxf), svg.py
> │   └── tests/                # test_geometry.py, test_drafts.py
> ├── e2e/                      # Playwright
> │   ├── playwright.config.ts
> │   └── tests/pattern.spec.ts
> └── docs/
> ```
>
> **Расхождение с рекомендацией ниже:** pnpm-workspaces и отдельный `packages/geometry` в пилоте **не используются**;
> общие TS-типы лежат прямо в `frontend/src/lib/types.ts`, а Python-модули — в `backend/app/`. Это работает для
> масштаба пилота (один фронтенд-пакет); pnpm-workspaces имеет смысл, если появится второй TS-пакет или общий
> SDK `[INFERRED]`.

**Рекомендуемая структура (целевая, при масштабировании)**

```
shityo/
├── pnpm-workspace.yaml        # packages: ["frontend", "packages/*"]
├── package.json               # корневые скрипты (dev, build, e2e) + engines
├── frontend/                  # SvelteKit (Svelte 5) — приложение
│   ├── package.json
│   ├── vite.config.js         # ← ВСЯ конфигурация SvelteKit 3 здесь (adapter, paths, csrf)
│   └── src/
│       ├── routes/            # /editor, /3d, /export
│       ├── lib/               # алгебра деталей, 2D-сцена (SVG), 3D-сцена (Threlte)
│       └── ...
├── packages/
│   └── geometry/              # @shityo/geometry — общие TS-типы + чистая геометрия (workspace:*)
├── backend/                   # Python, uv
│   ├── pyproject.toml
│   └── app/
│       ├── main.py            # FastAPI + CORSMiddleware + mount статики
│       ├── api/               # /api/generate, /api/export/*
│       ├── engine/            # параметрические лекала (Python)
│       └── export/            # dxf.py (ezdxf), pdf.py (pymupdf|reportlab), svg.py
├── e2e/                       # Playwright-тесты (в workspace или отдельно)
└── docs/
```

**Инструменты:** pnpm workspaces (npm-пакет `pnpm@12.16.1`, MIT) — `pnpm-workspace.yaml` + протокол `workspace:*`
для внутренних пакетов `[VERIFIED: https://pnpm.io/workspaces]`. Python — `uv@0.13.6` (MIT OR Apache-2.0),
`requires-python >=3.8` `[VERIFIED: PyPI]`. Одновременный запуск dev-серверов — `concurrently@10.0.6` (MIT,
`engines.node >= 22`) `[VERIFIED]`. Turbo (`turbo@2.11.10`, MIT) — по желанию, для кэша задач `[VERIFIED]`.

> **В пилоте вместо этого:** npm + `package-lock.json` в `frontend/`, Python — `.venv` в корне, запуск без
> `concurrently`: E2E-конфиг сам поднимает **два** `webServer` (uvicorn и `npm run preview`) — массив `webServer`
> поддерживается и используется `[VERIFIED: e2e/playwright.config.ts, playwright.config.ts — `webServer: [ {...},
> {...} ]`; `use.baseURL: 'http://127.0.0.1:5173'`]`. Для dev-сервера Vite-прокси `/api` → `127.0.0.1:8000` уже
> настроен `[VERIFIED: frontend/src/lib/api.ts — `export const API_BASE = '/api'` с комментарием про Vite-прокси]`.

### CORS

FastAPI: `from fastapi.middleware.cors import CORSMiddleware`; параметры `allow_origins`, `allow_origin_regex`,
`allow_credentials`, `allow_methods` (по умолчанию `['GET']`), `allow_headers` (по умолчанию `[]`),
`expose_headers`, `max_age` (600 c). Правило: при `allow_credentials=True` нельзя ставить `'*'` в origins/methods/headers —
нужен явный список. Дефолты «рестриктивные», т.е. CORS надо включать явно `[VERIFIED:
https://fastapi.tiangolo.com/tutorial/cors/]`.

**Рекомендация:** в dev — CORS включён на `http://localhost:5173` и `http://127.0.0.1:5173` (наш фронт по контракту
работает на `http://127.0.0.1:5173`) `[VERIFIED: docs/API-CONTRACT.md]`. В prod — **CORS выключаем**, потому что
фронт и API на одном origin (см. ниже) `[PROPOSAL]`.

### Dev-proxy (чтобы не мучиться с CORS в dev)

Vite `server.proxy` проксирует по префиксу пути на `target`, поддерживает `changeOrigin`, `rewrite`, RegExp-ключи
(начиная с `^`), WebSocket через `ws: true` `[VERIFIED: https://vite.dev/config/server-options.html#server-proxy]`.

```js
// frontend/vite.config.ts — ЦЕЛЕВОЙ вариант (SvelteKit 3): конфиг здесь, svelte.config.js больше нет
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ fallback: 'index.html', precompress: true }),
      paths: { base: '' }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
});
```

**В пилоте** то же самое, но в SvelteKit-2-варианте: `kit`-опции живут в `frontend/svelte.config.js`, а
`frontend/vite.config.ts` содержит Vite-часть. Прокси в пилоте **уже настроен** `[VERIFIED:
frontend/vite.config.ts]`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const BACKEND = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: { '/api': { target: BACKEND, changeOrigin: true } }
  }
});
```

Ценная деталь: backend-origin вынесен в env-переменную `BACKEND_ORIGIN` с дефолтом `http://127.0.0.1:8000` — это
правильный способ параметризовать окружение без правки конфига `[VERIFIED]`. На фронте путь API — **относительный**
`API_BASE = '/api'` `[VERIFIED: frontend/src/lib/api.ts]` — то есть в dev браузер ходит на тот же origin, CORS не
участвует, и это работает одинаково для dev и для собранного `preview` `[INFERRED]`.

Тогда в dev фронт ходит на **тот же origin** `http://127.0.0.1:5173/api/...` → CORS вообще не участвует
(это same-origin) `[INFERRED]`. CORS на бэкенде оставляем включённым только на dev-альтернативу (если фронт
поднимают на другом порту) `[PROPOSAL]`. В пилоте относительный `API_BASE = '/api'` уже реализует именно эту
схему `[VERIFIED: frontend/src/lib/api.ts]`.

> **Оговорка про SvelteKit + `server.proxy`:** при проксировании нужно следить, чтобы SvelteKit-роуты (`/editor`,
> `/3d`) не конфликтовали с `/api` — префикс `/api` выбран так, чтобы пересечений не было `[INFERRED]`.

### Build & serving в проде

Два варианта:

1. **Отдельные процессы (рекомендуем для пилота).** `vite build` → `frontend/build/` (статика через `adapter-static`),
   nginx/Caddy раздаёт статику и проксирует `/api` → FastAPI на `127.0.0.1:8000`. Один публичный origin, CORS не нужен,
   фронт и API масштабируются независимо `[PROPOSAL]`.
2. **Всё в одном процессе.** FastAPI монтирует `StaticFiles(directory="frontend/build", html=True)` и свои роуты —
   один порт, один origin, ноль CORS `[PROPOSAL]`. Тогда `adapter-static` без `fallback` не нужен, если все
   маршруты пререндерятся; для SPA-роутов оставляем `fallback: 'index.html'` и в FastAPI отдаём его для
   неизвестных путей `[INFERRED]`.

**Сборка бэкенда:** `uv` даёт воспроизводимые сборки; зависимости FastAPI-стенда:
`fastapi==0.162.0` (MIT, 2026-10-23), `uvicorn==0.54.0` (BSD-3-Clause), `pydantic==2.14.2` (MIT),
`httpx==0.28.1` (BSD-3-Clause), `python-multipart==0.0.33` (Apache-2.0) `[VERIFIED: PyPI]`.
Геометрия: `shapely==2.2.0` (BSD-3-Clause; требует Python ≥3.11, GEOS ≥3.10, NumPy ≥1.26) `[VERIFIED]`.
Экспорт: `ezdxf==1.4.5` (MIT), `reportlab==5.1.0` (BSD), `svglib==2.3.2` (LGPL-3.0) `[VERIFIED]`.
Dev: `pytest==9.2.0`, `pytest-cov==7.1.0`, `ruff==0.17.3` (MIT), `mypy==2.4.1` (MIT) `[VERIFIED: PyPI]`.

### Playwright + монорепо

`webServer` умеет **массив** серверов → поднимаем и uvicorn, и vite одновременно; при массиве `baseURL` надо задать явно
`[VERIFIED: https://playwright.dev/docs/api/class-testconfig#test-config-web-server — «Launch a development web server
(or multiple)», пример `webServer: [ {...}, {...} ]`, и примечание «If `webServer` is specified as an array, you must
explicitly configure the `baseURL`»]`.
Либо один скрипт `concurrently "uv run uvicorn ..." "pnpm --filter frontend dev"` и `webServer: { command: 'pnpm dev:e2e' }` `[PROPOSAL]`.

```ts
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, default: false },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, default: false }
  ],
  webServer: {
    command: 'pnpm dev:e2e',      # concurrently: uvicorn + vite
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

Опция `testProject.default` (1.64) позволяет держать в конфиге три браузера, а гонять только chromium по умолчанию —
`npx playwright test` (chromium), `--project=firefox`, `--project="*"` (все три, CI) `[VERIFIED]`.

---

## E. Итоговый список зависимостей

### E.1 `frontend/package.json` — dependencies

**Фактически в пилоте** `[VERIFIED: frontend/package.json — в `dependencies` только `three`; `paper`, `panzoom`, `zod`,
`nanostores` **не подключены**]`:

| Пакет | Версия | Лицензия | Зачем |
|---|---|---|---|
| `svelte` | `^5.57.3` | MIT | UI + runes |
| `three` | `^0.187.0` | MIT | 3D-рендер |

**Целевой набор** (то, что рекомендуется подключить по мере развития):

| Пакет | Версия | Лицензия | Зачем |
|---|---|---|---|
| `@threlte/core` | `^8.7.0` | MIT | Svelte-биндинги three.js (нужны, когда 3D-превью станет интерактивным) |
| `@threlte/extras` | `^9.23.1` | MIT | OrbitControls-подобное, GLTF-загрузчики, BVH |
| `paper` | `^0.16.0` | MIT | **этап расширения:** boolean ops, offset, метрики по кривым |
| `panzoom` | `^9.4.4` | MIT | pan/zoom SVG-сцены (либо ~100 строк своего кода) |
| `zod` | `^4.6.7` | MIT | валидация данных API на клиенте |
| `nanostores` | `^1.5.5` | MIT | лёгкий общий стейт между виджетами (опц.) |

### E.2 `frontend/package.json` — devDependencies

> **Разделено на «что в пилоте» и «целевой стек».** В пилоте стоит SvelteKit 2 / Vite 7 / TS 5.9.3 / `adapter-auto`
> (см. врезку в начале Части D) — это рабочая, согласованная связка. Целевой стек (SvelteKit 3 / Vite 8 / TS 6) —
> апгрейд, у него отдельные peer-ограничения.

**E.2.1 Фактически в пилоте** `[VERIFIED: frontend/package.json]`

| Пакет | Версия | Лицензия | Зачем |
|---|---|---|---|
| `svelte` | `^5.57.3` | MIT | UI + runes |
| `three` | `^0.187.0` | MIT | 3D-рендер |
| `@sveltejs/kit` | `^2.70.3` | MIT | фреймворк |
| `@sveltejs/vite-plugin-svelte` | `^6.2.4` | MIT | плагин Vite |
| `@sveltejs/adapter-auto` | `^7.0.1` | MIT | адаптер (для статики заменить на `adapter-static`) |
| `vite` | `^7.3.7` | MIT | сборка |
| `typescript` | `^5.9.3` | Apache-2.0 | peer-совместимо с kit 2 |
| `svelte-check` | `^4.7.8` | MIT | `npm run check` |
| `@types/three` | `^0.187.0` | MIT | типы three (в three их нет) |

Плюс отдельно (вне `frontend/package.json`, в общем venv): `playwright==1.64.1` + `pytest==9.2.0` +
`hypothesis==6.170.14` `[VERIFIED: .venv/Lib/site-packages]`.

**E.2.2 Целевой стек (апгрейд на SvelteKit 3)** — из раздела D.2

| Пакет | Версия | Лицензия | Зачем |
|---|---|---|---|
| `@sveltejs/kit` | `^3.1.1` | MIT | фреймворк |
| `@sveltejs/vite-plugin-svelte` | `^7.3.1` | MIT | плагин Vite |
| `@sveltejs/adapter-static` | `^4.0.1` | MIT | статическая сборка (SPA-fallback) |
| `vite` | `^8.3.5` | MIT | сборка (node ≥22.12 / 20.19+) |
| `typescript` | `~6.0.3` | Apache-2.0 | **не 7.x** — peer-ограничения kit/svelte-check/eslint |
| `vitest` | `^5.1.0` | MIT | unit-тесты |
| `@vitest/coverage-v8` | `^5.1.0` | MIT | покрытие |
| `@vitest/browser-playwright` | `^5.1.0` | MIT | browser-режим vitest |
| `happy-dom` | `^21.0.4` | MIT | DOM для vitest |
| `@testing-library/svelte` | `^5.4.2` | MIT | тесты компонентов |
| `msw` | `^3.0.3` | MIT | мок API |
| `@playwright/test` | `^1.64.1` | Apache-2.0 | E2E |
| `eslint` | `^10.14.0` | MIT | линтер |
| `eslint-plugin-svelte` | `^3.23.1` | MIT | правила Svelte |
| `svelte-eslint-parser` | `^1.10.0` | MIT | парсер |
| `typescript-eslint` | `^8.72.1` | MIT | типизированные правила (peer TS <6.1) |
| `prettier` | `^3.9.10` | MIT | форматирование |
| `prettier-plugin-svelte` | `^4.1.1` | MIT | форматирование .svelte |
| `vite-tsconfig-paths` | `^6.1.1` | MIT | резолв `@/*` |
| `@types/node` | `^26.6.6` | MIT | типы Node в конфигах |

Опционально (2D-этап расширения): `paper@^0.16.0` (MIT) — булевы операции над кривыми в браузере.

Опционально (3D-этап): `@threlte/core@^8.7.0`, `@threlte/extras@^9.23.1` (MIT), `@threlte/gltf@^3.1.0` (MIT),
`@gltf-transform/core@^4.5.1` + `functions` + `extensions` (MIT), `draco3d@^1.5.9` (Apache-2.0),
`ktx-parse@^2.0.0` (MIT), `meshoptimizer@^1.3.0` (MIT).

Ткань (этап 2): свой XPBD-солвер (`frontend/src/lib/cloth/xpbd.ts`), без внешних
зависимостей; `@threlte/rapier@^3.5.1` (MIT, только
rigid-body — soft bodies придётся оборачивать самим).

Опционально (клиентский PDF): `jspdf@^4.2.1` (MIT) **или** `pdfkit@^0.20.2` (MIT). Опционально (клиентский DXF):
`@tarikjabiri/dxf@^2.10.0` (MIT).

### E.3 `backend/pyproject.toml` (uv)

**Фактически в пилоте** `[VERIFIED: .venv/Lib/site-packages — reportlab-5.1.0, ezdxf-1.4.5, shapely-2.2.0,
pypdf-6.21.4; **пакетов `pymupdf*` в venv нет**]`:

```
reportlab==5.1.0           # BSD-3-Clause — экспорт PDF 1:1 (ПРИНЯТО; заменил pymupdf по лицензии)
ezdxf==1.4.5               # MIT   — экспорт DXF (AAMA/ASTM)
shapely==2.2.0             # BSD-3-Clause — геометрия (нужны GEOS>=3.10, NumPy>=1.26)
pypdf==6.21.4              # BSD-3-Clause — чтение PDF в тестах (проверка подписей и MediaBox)
# pymupdf==2.1 — ОТКЛОНЁН (AGPL-3.0 / коммерческая Artifex) и УДАЛЁН из venv
```

Плюс базовый стек: `fastapi`, `uvicorn`, `pydantic` — см. реестр PyPI в разделе G.
Dev: `pytest==9.2.0`, `hypothesis==6.170.14` — оба MIT `[VERIFIED: .venv/Lib/site-packages]`.

**Целевой/альтернативный набор** (полный перечень базового стека):

```
fastapi==0.162.0            # MIT
uvicorn[standard]==0.54.0   # BSD-3-Clause
pydantic==2.14.2            # MIT
python-multipart==0.0.33    # Apache-2.0
httpx==0.28.1               # BSD-3-Clause (тесты/API-клиент)
shapely==2.2.0              # BSD-3-Clause
numpy==2.5.4                # BSD-3-Clause AND ... (составная лицензия)
ezdxf==1.4.5                # MIT   — экспорт DXF (AAMA/ASTM)
reportlab==5.1.0            # BSD-3-Clause — экспорт PDF 1:1
pypdf==6.21.4               # BSD-3-Clause — пост-обработка PDF / проверка читаемости подписей в тесте
# опционально: svglib==2.3.2 (LGPL-3.0-or-later), cairosvg==2.9.1 (LGPL-3.0-or-later),
#              weasyprint==70.0 (BSD), pyclipper==1.4.0 (MIT)
```
Dev: `pytest==9.2.0`, `pytest-cov==7.1.0`, `ruff==0.17.3`, `mypy==2.4.1` — все MIT `[VERIFIED: PyPI]`.

> **Не возвращать `pymupdf*` в окружение.** `pymupdf`, `pymupdf4llm`, `pymupdf-layout` — все под AGPL-3.0 или
> коммерческую лицензию Artifex `[VERIFIED: PyPI]`. Сейчас их нет в venv и нет ни одного импорта в коде, то есть
> лицензионный риск закрыт `[VERIFIED: ls .venv/Lib/site-packages + grep по backend/app, frontend/src]`. Если
> кто-то в будущем захочет использовать pymupdf — это должно быть **явное решение с лицензией Artifex**, а не
> «просто добавили зависимость» `[PROPOSAL]`.

### E.4 Одним взглядом: лицензии, которые требуют внимания

| Пакет | Лицензия | Риск | Решение |
|---|---|---|---|
| **`pymupdf`** | **AGPL-3.0 ИЛИ коммерческая лицензия Artifex** | **высокий для SaaS**: AGPL с сетевым триггером требует публикации исходников модификаций при обслуживании пользователей по сети | **РЕШЕНО: отклонён по лицензии, заменён на `reportlab` (BSD-3-Clause) до релиза 2026-11-03; пакеты `pymupdf*` удалены из venv, импортов в коде нет** `[VERIFIED: ls .venv/Lib/site-packages, grep по backend/app + frontend/src]` |
| `pymupdf4llm`, `pymupdf-layout` | как у PyMuPDF (AGPL/коммерческая) | наследуют риск PyMuPDF | **не возвращать в окружение**; в пилоте отсутствуют `[VERIFIED: PyPI + venv]` |
| `reportlab` | BSD-3-Clause | низкий | **ПРИНЯТО** — экспорт PDF в пилоте `[VERIFIED: https://docs.reportlab.com/developerfaqs/ — BSD, «including using it in a commercial package»]` |
| `mannequin-js` | GPL-3.0 | вирусность | не берём `[VERIFIED]` |
| `svglib`, `cairosvg` | LGPL-3.0-or-later | copyleft | не берём (их роль закрыта reportlab) `[VERIFIED]` |
| `clipper2-wasm`, `clipper2-js`, `clipper-lib` | BSL / Boost | не OSI-MIT | не берём, хватает MIT-альтернатив `[VERIFIED]` |
| `ammo.js` | лицензия не объявлена в npm | неизвестно | не берём `[VERIFIED]` |
| `shapely` (+ GEOS) | BSD-3-Clause (+ GEOS LGPL-2.1) | низкий/средний | берём, GEOS — динамическая библиотека `[VERIFIED]` |
| `svg.js` / `@svgdotjs/svg.js` | MIT | низкий | не берём (Svelte умеет SVG сам) `[VERIFIED]` |
| 3D-физика: `three`, `@threlte/*` | MIT | низкий | берём `[VERIFIED]` |
| 3D-физика: **свой XPBD-солвер** | — | нет | кода взятого нет: подход (позиционная динамика с compliance) из `seamer-studio` (MIT) переписан под нашу сетку `[VERIFIED: frontend/src/lib/cloth/xpbd.ts]` |
| всё остальное из списков выше | MIT / Apache-2.0 / BSD-3 | низкий | берём `[VERIFIED]` |

---

## F. Открытые вопросы и риски

| # | Вопрос | Влияние | Как закрыть |
|---|---|---|---|
| 1 | Нужен ли текст **AAMA Annex** (стандарт D6673 снят в 2019, замены нет) для точного экспорта DXF | блокирует «совместимость с Lectra/Optitex» | взять открытый Annex AAMA из PDF «DXF-Ansi-AAMA» + сверить с поведением CLO (их таблица опций экспорта — де-факто спецификация); до этого — экспортировать `Standard DXF` с разбором по слоям `[VERIFIED: store.astm.org/d6673-10.html — «Withdrawn 2019, No replacement»]` |
| 2 | `paper.js` — приемлемое ли качество boolean-операций на кривых с самопересечением | влияет на припуски и вырезы | бенчмарк на реальных деталях (сравнить с `shapely`/эталоном) `[INFERRED]` |
| 3 | `paperjs-offset` на кривых — качество и стабильность | припуски | отдельная проверка; фолбэк — аппроксимация + `js-angusj-clipper` `[VERIFIED: пакет существует, MIT]` |
| 4 | Ткань: сколько частиц и какой солвер тянет мобильный браузер | объём 3D-этапа | **ИЗМЕРЕНО 2026-11-04:** Rapier soft bodies (FEM) — 5,5 шагов/с при 1276 частицах; после огрубления сетки и укрупнения коллайдеров — 11,5 шагов/с при 1084 частицах. Узкое место — не солвер, а столкновения частиц с коллайдерами: без коллайдеров шаг стоит 3,5 мс, с ними 87 мс. Свой PBD-солвер на тех же частицах дал бы порядок 1 мс, но это переписывание физики | см. раздел F.1 `[VERIFIED: e2e/bench-sim.mts, замеры 2026-11-04]` |
| 5 | ~~Лицензия PyMuPDF (AGPL-3.0)~~ | **РЕШЕНО 2026-11-03:** экспорт PDF переведён на `reportlab` (BSD-3-Clause); пакеты `pymupdf*` удалены из venv, импортов в коде нет | не возвращать `pymupdf*` в окружение без явного решения о лицензии Artifex `[VERIFIED]` |
| 5a | **Шрифт с кириллицей для reportlab** | подписи деталей на русском; при отсутствии шрифта с кириллицей — транслитерация (не пустые квадраты) | системный Arial/Verdana/Segoe UI/Tahoma (на Windows проверены — кириллица есть) **или** вендорённый DejaVuSans.ttf; `Vera.ttf` из reportlab не годится. Fallback-транслитерация уже реализована в `_register_fonts()`; для CI/Linux — вендорённый шрифт, иначе подписи останутся латиницей `[VERIFIED: замер fontTools + backend/app/export/pdf.py]` |
| 6 | TypeScript 7 vs 6 | ломает сборку **после апгрейда на SvelteKit 3** (в пилоте TS 5.9.3 — неактуально) | держать `~6.0.3` при апгрейде `[VERIFIED]` |
| 7 | `svelte-konva` не обновлялся с 2025-10-16 | риск, если пойдём в Konva | не критично: Konva — только запасной вариант `[VERIFIED]` |
| 8 | Firefox без WebGPU | ломает WebGPU-путь ткани | дефолт — WebGL/Rapier; WebGPU — opt-in `[VERIFIED: caniuse]` |
| 9 | `pagedjs` / `pdf-lib` / `svg-to-pdfkit` — заброшенные зоны | не берём | экспорт PDF — серверный PyMuPDF (пилот) или reportlab `[VERIFIED]` |
| 10 | Апгрейд SvelteKit 2 → 3 (config → `vite.config.js`, `$lib` → `#lib`, `$app/environment` → `$app/env`) | ломает текущий `svelte.config.js` и алиасы | отдельная задача с чек-листом из D.2; **в пилоте не требуется** `[VERIFIED: frontend/svelte.config.js существует; kit 2.70.3]` |

---

## F.1 Производительность 3D-превью (замеры 2026-11-04)

Замеры: `e2e/perf-3d.mts` (загрузка и кадры в секунду в headless Chromium без
GPU) и `e2e/diag-xpbd.mts` (состояние ткани по шагам).

| Что | Rapier soft bodies | Свой XPBD-солвер |
|---|---|---|
| шаг физики, 542 вершины | 87 мс (11,5 шагов/с) | **1,1 мс (895 шагов/с)** |
| кадров в секунду в 3D (headless, без GPU) | 9 | **144** |
| страница лекала, загружено | 1,8 МБ gzip | **331 КБ** |
| чанк 3D (three + движок) | 1,75 МБ gzip | **530 КБ** |
| сетка | огрублена до 588 частиц | 542 вершины, полная |

Что помогло:

1. **Свой XPBD-солвер вместо Rapier.** Мягкие тела Rapier решают FEM: на
   тысяче частиц шаг стоит десятки миллисекунд, и виноваты не уравнения, а
   столкновения частиц с коллайдерами (без коллайдеров шаг - 3,5 мс). Позиционная
   динамика с compliance на тех же рёбрах даёт шаг за единицы миллисекунд.
   Подход взят из open-source студии `seamer-studio` (MIT, Ahmad Jalil) и
   переписан под нашу сетку: `frontend/src/lib/cloth/xpbd.ts`.
2. **Именованные импорты three.** `import * as THREE` отключал встряхивание
   дерева: в чанк страницы лекала попадал весь three.js.
3. **Ленивая загрузка превью.** `Preview3D.svelte` подключается динамическим
   импортом: страница лекала не платит за движок, пока 3D не включён.
4. **Укрупнённые коллайдеры фигуры.** Столкновения частиц с коллайдерами
   стоили 83 мс из 87 мс шага - стоимость линейна по числу коллайдеров.
5. **Фиксированный шаг физики** 1/60 с, не больше двух шагов на кадр.

Что стоило дороже всего в отладке:

- **Швы не были транзитивными.** Плечевой шов соединяет перед и спинку, а
  рукав пришит к обоим: при попарном слиянии кольцо рукава разрывалось в
  плечевой точке. Лечится объединением через union-find.
- **Радиус манжеты считался как `ширина / pi` вместо `ширина / (2*pi)`** -
  рукав раздувался вдвое, и физика сминала его в складки.
- **Выталкивание из тела добавляло ткани скорость.** В интегрировании
  Верле скорость - это (p - prev)/dt, поэтому смещение от столкновения
  разгоняло ткань, и она «болталась» тем сильнее, чем дольше смотрел.
  Смещение теперь двигает и прошлое положение: импульса от удара нет.

Манекен (2026-11-04): торс с покатыми плечами до уровня дельты, шея с
вытянутой головой, руки по профилю обхвата, ноги от бёдер через колено к
щиколотке и стопа. Пропорции - по канону: голова 1/7,5 роста, макушка на
уровне роста, промежность на половине роста, колено на 0,285 роста
(`en.wikipedia.org/wiki/Body_proportions`). Глубина торса зависит от
телосложения: при отношении бёдер к груди выше 0,99 грудь глубже, чем широка
(женская фигура), иначе наоборот.

Сцена пересобирается при смене мерок: раньше она собиралась один раз в
`onMount`, и 3D-превью показывало прежнюю фигуру - лекало перестраивалось,
а превью оставалось от старых мерок.

Редактор параметров лекала (2026-11-04): на раскладке появились две
перетаскиваемые точки - плечевая (двигает X, положение плечевой точки) и
подмышка (двигает Y, глубину проймы). Значения уходят на сервер отдельным
полем `overrides` в запросе построения; чертёж считает точки по ним, а 2D и
3D перестраиваются по ответу. Точки задаются в сантиметрах от сгиба, как
мерки. Важно: значение читается в момент запроса, а не при планировании
таймера - иначе запрос уходит со старым.

Отступы интерфейса переведены на шкалу кита (`--ui-space-hair` … `--ui-space-section`):
сырых пикселей в `margin`/`padding`/`gap` не осталось ни в одном компоненте.

Открытые дефекты превью (известны, не исправлены):

- **Сборки у проймы.** Длина цепи проймы в лекале (194 мм на сторону)
  короче шва по телу (251 мм): ткань собирается. Лечится в чертеже -
  см. `docs/research/05-freesewing-crosscheck.md`, раздел 2.7.
- **Зубцы на плече.** Острый угол раскладки в плечевой точке ложится на
  скруглённое плечо, ткань между горловиной и проймой растягивается.
  Плечи манекена расширили до дельты - стало меньше, но не чисто: нужна
  трапеция и дельта вместо кольца-конуса.
- **Плоский окат.** Окат рукава в раскладке плоский (высота 65 мм при
  ширине 466 мм), рукав через плечо проходит с трудом.

---

## G. Источники (все проверены 2026-11-03)

**npm / пакеты**
- <https://www.npmjs.com/package/svelte-konva> · <https://registry.npmjs.org/svelte-konva/latest>
- <https://raw.githubusercontent.com/konvajs/svelte-konva/master/README.md> · <https://raw.githubusercontent.com/konvajs/svelte-konva/master/docs/svelte-konva-v1-migration.md>
- <https://konvajs.org/api/Konva.Path.html> · <https://konvajs.org/api/Konva.Transformer.html> · <https://konvajs.org/docs/sandbox/Modify_Curves_with_Anchor_Points.html>
- <https://github.com/konvajs/konva/issues/2072> (нет SVG-экспорта)
- <https://raw.githubusercontent.com/konvajs/konva/master/LICENSE>
- <https://paperjs.org/license> · <https://paperjs.org/reference/pathitem> · <https://paperjs.org/reference/project#exportsvg> · <https://paperjs.org/reference/project#hittest> · <https://raw.githubusercontent.com/paperjs/paper.js/develop/LICENSE.txt> · <https://app.unpkg.com/paper@0.16.0/files/dist> · <https://github.com/paperjs/paper.js/commits/develop.atom> · <https://www.npmjs.com/package/paper-jsdom>
- <https://fabricjs.com/docs/core-concepts/> · <https://github.com/parallax/jsPDF>
- <https://raw.githubusercontent.com/anvaka/panzoom/master/README.md>
- <https://raw.githubusercontent.com/xaviergonz/js-angusj-clipper/master/README.md> · <https://raw.githubusercontent.com/boytchev/mannequin.js/master/LICENSE>
- <https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE> · <https://github.com/mrdoob/three.js/releases.atom> · <https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgpu_compute_cloth.html>
- <https://threlte.xyz/docs/learn/getting-started/installation> · <https://threlte.xyz/docs/learn/advanced/migration-guides/> · <https://raw.githubusercontent.com/threlte/threlte/main/LICENSE.md>
- <https://app.unpkg.com/@dimforge/rapier3d-compat@0.21.0/files/dist/dynamics> · <https://rapier.rs/docs/user_guides/javascript/soft_bodies/> · <https://raw.githubusercontent.com/dimforge/rapier/master/CHANGELOG.md>
- <https://static.makehumancommunity.org/about/license.html> · <https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/LICENSE.md> · <https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/script_samples/index.md> · <https://github.com/makehumancommunity/makehuman/blob/master/makehuman/license.txt>
- <https://raw.githubusercontent.com/ognjen-petrovic/js-dxf/master/README.md> · <https://raw.githubusercontent.com/dxfjs/writer/main/LICENSE.md> · <https://dxf.vercel.app/>
- <https://github.com/Hopding/pdf-lib/releases.atom> · <https://github.com/pagedjs/pagedjs/commits/main.atom>

**Фреймворки и инструменты**
- <https://svelte.dev/docs/svelte/what-are-runes> · <https://svelte.dev/docs/svelte/llms.txt>
- <https://svelte.dev/docs/kit/migrating-to-sveltekit-3> · <https://svelte.dev/docs/kit/adapter-static> · <https://svelte.dev/docs/kit/@sveltejs-kit-vite>
- <https://playwright.dev/docs/release-notes> · <https://playwright.dev/docs/test-configuration> · <https://playwright.dev/docs/library> · <https://playwright.dev/docs/api/class-testconfig#test-config-web-server>
- <https://vite.dev/config/server-options.html#server-proxy>
- <https://fastapi.tiangolo.com/tutorial/cors/>
- <https://pnpm.io/workspaces>
- <https://caniuse.com/webgpu>

**Форматы и стандарты**
- <https://www.astm.org/d6673-04.html> · <https://store.astm.org/d6673-10.html>
- <https://support.clo3d.com/hc/en-us/articles/115000493067-2D-Pattern-DXF-Import-Export>
- <https://ezdxf.readthedocs.io/en/stable/>

**PyPI**
- <https://pypi.org/project/pymupdf/> · <https://pypi.org/project/reportlab/> · <https://pypi.org/project/svglib/> · <https://pypi.org/project/shapely/> · <https://pypi.org/project/ezdxf/> · <https://pypi.org/project/pypdf/> · <https://pypi.org/project/weasyprint/> · <https://pypi.org/project/cairosvg/> · <https://pypi.org/project/pyclipper/> · <https://pypi.org/project/fastapi/> · <https://pypi.org/project/uvicorn/> · <https://pypi.org/project/pydantic/> · <https://pypi.org/project/uv/>

**ReportLab: шрифты и кириллица**
- <https://docs.reportlab.com/reportlab/userguide/ch3_fonts/> — TrueType Font Support (`TTFont` + `pdfmetrics.registerFont`), WinAnsiEncoding у стандартных шрифтов, поведение при отсутствии глифа (`notdef`), рекомендация держать шрифты в поставке приложения
- <https://docs.reportlab.com/developerfaqs/> — §1.3 Licensing: BSD, «including using it in a commercial package»

**ASTM D6673 / AAMA / NIST (формат обмена DXF и градация)**
- <https://www.normsplash.com/Samples/ASTM/191361149/ASTM-D6673-10-en.pdf> — открытый sample D6673-10: §1–4.3.1.6, таблица 23 слоёв, system text, graded nests
- <https://fabricesalvaire.github.io/Patro/resources/file-format/dxf-astm.html> — open-source reference реализация ASTM-формата: назначение слоёв, «layers must be numbered, not named textually»
- <https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5969.pdf> — NIST IR 5969: `GRADE_DELTA`, `GRADE_POINT`, `GRADE_DATA_AT_POINT`, `GRADE_RULE_AT_POINT`
- <https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5823.pdf> — NIST IR 5823: обзор стандартов, Приложение C.1 «AAMA Standards»
- <https://www.astm.org/membership-participation/technical-committees/committee-d13/subcommittee-d13/jurisdiction-d1366> — D13.66: Active 0 / Proposed New 0 / Withdrawn 8

**Внутренние источники пилота (проверено в рабочем дереве 2026-11-03)**
- `frontend/package.json`, `frontend/svelte.config.js`, `frontend/vite.config.ts`, `frontend/src/lib/geometry.ts`, `frontend/src/lib/api.ts`
- `backend/app/export/pdf.py`, `backend/app/export/layout.py`, `backend/app/export/dxf.py`, `backend/app/export/svg.py`, `backend/app/core/geometry.py`
- `e2e/playwright.config.ts`, `e2e/tests/pattern.spec.ts`
- `.venv/Lib/site-packages/` — фактически установленные версии (`reportlab-5.1.0`, `ezdxf-1.4.5`, `shapely-2.2.0`, `pypdf-6.21.4`, `playwright-1.64.1`, `pytest-9.2.0`, `hypothesis-6.170.14`); **`pymupdf*` отсутствуют**; `reportlab-5.1.0.dist-info/METADATA` — «License: BSD license … ReportLab Inc.»
- `backend/app/export/pdf.py` — текущая реализация на reportlab: `_register_fonts()` (TTFont `PatternSans`/`PatternSans-Bold`, fallback Helvetica + транслитерация), `MM_TO_PT`, `STROKE_WIDTHS_MM`, `STROKE_COLORS`, `render_pdf()`, `render_pdf_page()`; **импортов pymupdf/fitz в `backend/app` и `frontend/src` нет**
- `backend/app/export/layout.py` — «Page layout shared by the SVG and PDF exporters»; упоминаний reportlab/pymupdf нет
- `backend/tests/test_export.py` — тесты PDF: `test_pdf_is_a_real_pdf`, `test_pdf_opens_and_has_a4_landscape_mediabox`, `test_pdf_portrait_mediabox`, `test_pdf_single_page_wrapper_has_one_page`, `test_pdf_extracts_piece_label`, `test_pdf_single_page_carries_piece_labels`, `test_pdf_page_count_grows_for_oversized_piece`
- Замер кириллицы fontTools 4.68.0: `C:/Windows/Fonts/{arial,segoeui,tahoma}.ttf` — кириллица есть (3506/3996/3772 глифов); `reportlab/fonts/Vera.ttf` — нет (256 глифов, нет 0x410/0x430/0x44F/0x401)
- Локальный round-trip: `reportlab` 5.1.0 + `TTFont('Arial', 'C:/Windows/Fonts/arial.ttf')`, страница `(841.89, 595.28)` → PDF 76 КБ, шрифты `AAAAAA+ArialMT` / `AAAAAA+Arial-BoldMT` (TrueType-подмножества), извлечённый текст `'Перед Тело 42\nРазмер 42'`, `page.rect = Rect(0, 0, 841.89, 595.28)`
