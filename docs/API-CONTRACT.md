# Контракт API (v1)

Источник истины для фронтенда и для агентов, работающих параллельно.
Любое изменение ломает контракт — обновлять здесь первой.

Базовый URL backend: `http://127.0.0.1:8000`
Фронтенд (dev): `http://127.0.0.1:5173`

## 1. `GET /api/health`

```json
{ "status": "ok", "version": "0.1.0" }
```

## 2. `GET /api/catalog`

Список базовых моделей.

```json
{
  "items": [
    {
      "id": "tee",
      "name": "Футболка",
      "category": "tops",
      "category_label": "Трикотаж",
      "genders": ["male", "female", "kids"],
      "pieces": ["front", "back", "sleeve"],
      "description": "Базовая футболка...",
      "measurements": ["bust", "waist", "height", "shoulder_width", "back_length", "sleeve_length", "neck_circumference"],
      "params": {
        "fit": { "type": "select", "options": [ { "value": "slim", "label": "Прилегающий" } ], "default": "regular" },
        "neckline": { "type": "select", "options": [ { "value": "crew", "label": "Круглая" } ], "default": "crew" },
        "sleeve_length": { "type": "number", "default": 62, "min": 10, "max": 90, "step": 1, "unit": "cm" },
        "length_delta": { "type": "number", "default": 0, "min": -30, "max": 30, "step": 1, "unit": "cm" },
        "ease_bust": { "type": "number", "default": 4, "min": 0, "max": 25, "step": 0.5, "unit": "cm" },
        "ease_length": { "type": "number", "default": 2, "min": 0, "max": 20, "step": 0.5, "unit": "cm" }
      },
      "default_measurements": { "bust": 96, "waist": 84, "height": 176, "shoulder_width": 46, "back_length": 72, "sleeve_length": 62, "neck_circumference": 40 }
    }
  ]
}
```

Значение `params` - **объект параметров фасона**, а не набор мерок. Каждый параметр
описан объектом: `type` (`select` или `number`), `default`, а для `select` - `options`
(список `{value, label}`), для `number` - `min`/`max`/`step`/`unit`. Фронтенд строит
форму управления из этих описаний, не зная конкретной модели.

`GET /api/validate/sizes?model=tee` возвращает **массив** (не объект):

```json
[ { "size": "46", "measurements": { ... }, "dimensions": { "front_width_cm": 52.0, "front_height_cm": 74.0 } } ]
```

## Единицы измерения

- Мерки в запросе — **сантиметры** (антропометрия в привычных единицах).
- Ответ — **миллиметры** (координаты геометрии), в поле `units` стоит `"mm"`.
- Внутри движок работает в сантиметрах, конвертация ×10 на границе API.

## Мерки моделей

Мерки выбираются под модель, а не общие для всех. Справочник с диапазонами:
`backend/app/core/measurements.py`.

| Модель | Мерки |
|---|---|
| `tee`, `shirt` | `bust`, `waist`, `hip`, `height`, `shoulder_width`, `shoulder_slope`, `neck_to_waist`, `waist_to_armpit`, `biceps`, `back_length`, `sleeve_length`, `neck_circumference` |
| `trousers` | `waist`, `hip`, `height`, `crotch_depth`, `inseam_length`, `knee_length`, `knee_circumference` |
| `skirt` | `waist`, `hip`, `height`, `waist_to_hip`, `skirt_length` |

Вертикальные мерки (`neck_to_waist`, `waist_to_armpit`, `waist_to_hip`) нужны
для глубины проймы, линии бёдер и длины корпуса; обхват бицепса - для
ширины рукава, обхват колена - для ширины низа штанов, наклон плеча - для
высоты плечевого шва.

## 3. `POST /api/generate`

Запрос:

```json
{
  "model": "tee",
  "measurements": {
    "bust": 96, "waist": 84, "hip": 98, "height": 176,
    "shoulder_width": 46, "shoulder_slope": 13,
    "neck_to_waist": 44, "waist_to_armpit": 22, "biceps": 32,
    "back_length": 72, "sleeve_length": 62, "neck_circumference": 40
  },
  "params": { "fit": "regular", "neckline": "crew", "sleeve_length": 62, "length_delta": 0, "ease_bust": 8, "ease_length": 2 }
}
```

Ответ:

```json
{
  "model": "tee",
  "size": { "bust": 96, "waist": 84, "hip": 98 },
  "scale_mm": 1.0,
  "units": "mm",
  "pieces": [
    {
      "id": "front",
      "name": "Перед",
      "mirrored": false,
      "cut": 1,
      "outline": [ { "x": 0.0, "y": 0.0 }, ... ],
      "seam_line": [ ... ],
      "seam_allowance_mm": 10,
      "notches": [ { "x": 1, "y": 2, "label": "бок" } ],
      "grainline": { "x1": 0, "y1": 0, "x2": 0, "y2": 100 },
      "internal_lines": [ { "type": "dart", "points": [...] } ],
      "seam_edges": [
        { "label": "пройма", "points": [ ... ] },
        { "label": "плечо", "points": [ ... ] }
      ],
      "bbox": { "x": 0, "y": 0, "width": 500, "height": 700 },
      "area_mm2": 123456.0
    }
  ],
  "warnings": [],
  "errors": [],
  "warning_texts": [],
  "error_texts": [],
  "metrics": { "front_width_cm": 50.0, "front_height_cm": 70.0 }
}
```

`warnings` и `errors` - замечания валидатора объектами
`{ "code": str, "params": {...}, "text": str }`. Код однозначен, по нему
клиент строит перевод на свой язык; `params` - значения для подстановки,
`text` - текст по умолчанию на русском. `warning_texts` и `error_texts` -
те же замечания списком строк, для потребителей, которым коды не нужны.
Список кодов и их русские тексты: `backend/app/core/issues.py`.

Гарантии: координаты в миллиметрах, `outline` — замкнутый контур детали (без
припусков), `seam_line` — то же, что `outline` (совместимость). Припуск
приходит в `seam_allowance_mm`, чтобы клиент показал на экране ровно то,
что уйдёт на печать. `seam_edges` — подписанные швы детали: отрезки
контура, которые сшиваются с другими деталями; по ним проверяется
сопряжение.

## 4. Экспорт

- `GET /api/export/{model}.svg?measurements=...&params=...` — SVG со всеми
  листами раскладки, 1:1 мм.
- `GET /api/export/{model}.dxf?measurements=...&params=...` — DXF (слои CUT,
  SEAM, GRAINLINE, NOTCH, LABEL; AAMA/ASTM-совместимый контур).
- `GET /api/export/{model}.pdf?measurements=...&params=...` — PDF 1:1 мм, листы
  A4/A3 с метками совмещения.

Параметры передаются как JSON в query: `?measurements=<urlencoded json>&params=<urlencoded json>`.
Мерки можно передать частично - недостающие берутся из каталога.

Коды ошибок: `400` — невалидные мерки/параметры (тело `{"detail": [...]}`), `404` — неизвестная модель,
`422` — ошибка валидации pydantic.

## 5. Валидация

- `POST /api/validate` — тот же запрос, что `generate`, ответ:
  `{ "ok": bool, "errors": [...], "warnings": [...], "error_texts": [...], "warning_texts": [...] }`,
  где замечания устроены как в `generate`.
- `GET /api/validate/sizes?model=tee` — таблица размеров: `[{"size":"42","measurements":{...},"dimensions":{...}}]`.
