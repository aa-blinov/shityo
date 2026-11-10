# API: примеры запросов и ответов

Полный контракт - в `docs/API-CONTRACT.md`. Здесь живые примеры того, что
сервер отдаёт на самом деле.

Базовый URL: `http://127.0.0.1:8000`.

## Каталог

```bash
curl http://127.0.0.1:8000/api/catalog
```

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
      "measurements": ["bust", "waist", "height", "shoulder_width",
                       "back_length", "sleeve_length", "neck_circumference"],
      "params": {
        "fit": { "type": "select", "default": "regular",
                 "options": [ { "value": "slim", "label": "Прилегающий" },
                              { "value": "regular", "label": "Классический" } ] },
        "ease_bust": { "type": "number", "default": 4, "min": 0, "max": 25,
                       "step": 0.5, "unit": "cm" }
      },
      "default_measurements": { "bust": 96, "waist": 84, "height": 176,
                                "shoulder_width": 46, "back_length": 72,
                                "sleeve_length": 62, "neck_circumference": 40 }
    }
  ]
}
```

## Генерация

```bash
curl -X POST http://127.0.0.1:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"tee","measurements":{"bust":104},"params":{"fit":"loose"}}'
```

Мерки в сантиметрах, геометрия в ответе - в миллиметрах.

```json
{
  "model": "tee",
  "size": { "bust": 104, "waist": 84, "height": 176, "shoulder_width": 46,
            "back_length": 72, "sleeve_length": 62, "neck_circumference": 40 },
  "scale_mm": 1.0,
  "units": "mm",
  "pieces": [
    {
      "id": "front",
      "name": "Перед",
      "mirrored": false,
      "cut": 1,
      "outline": [ { "x": 0.0, "y": 0.0 }, { "x": 38.66, "y": 242.3 } ],
      "seam_line": [ { "x": 0.0, "y": 0.0 }, { "x": 38.66, "y": 242.3 } ],
      "notches": [
        { "x": 260.0, "y": 300.0, "label": "пройма" },
        { "x": 260.0, "y": 740.0, "label": "бок" }
      ],
      "grainline": { "x1": 0.0, "y1": 105.0, "x2": 0.0, "y2": 710.0 },
      "internal_lines": [],
      "bbox": { "x": -260.0, "y": -63.5, "width": 520.0, "height": 740.0 },
      "area_mm2": 312845.0
    }
  ],
  "warnings": [],
  "errors": [],
  "warning_texts": [],
  "error_texts": [],
  "metrics": { "front_width_cm": 52.0, "front_height_cm": 74.0 }
}
```

Пустой объект `measurements` означает "взять мерки по умолчанию из каталога".
Частично заданный набор - ошибка: заполнение пропусков молча спрятало бы
опечатку в мерке.

## Проверка

```bash
curl -X POST http://127.0.0.1:8000/api/validate \
  -H "Content-Type: application/json" \
  -d '{"model":"trousers","measurements":{},"params":{}}'
```

```json
{ "ok": true, "errors": [], "warnings": [], "error_texts": [], "warning_texts": [] }
```

`errors` - лекало печатать нельзя (самопересечение контура, припуск вне
границ, мерка вне диапазона). `warnings` - печатать можно, но стоит
посмотреть глазами.

Замечания приходят объектами `{ "code", "params", "text" }`: код однозначен,
по нему клиент строит перевод на свой язык, `text` - текст по умолчанию на
русском. `error_texts` и `warning_texts` - те же замечания списком строк.
Список кодов: `backend/app/core/issues.py`.

## Размерная сетка

Женский и мужской ряды разные: женский по ГОСТ 31396-2009 (рост 164,
размеры 42-54), мужской по ГОСТ 31399-2009 (рост 176, размеры 44-58).
Размер - половина обхвата груди. Параметр `gender` (`female` / `male`)
выбирает ряд; без него отдаётся ряд основного пола модели (первый в
`genders` каталога). Ростовые группы идут с шагом 6 см: 158/164/170 у
женщин, 176 ± 6 у мужчин; вертикальные мерки пересчитываются по росту,
обхваты не меняются. Без `height` отдаются все ростовые группы, с `height` -
одна. `designation` - обозначение типовой фигуры по ГОСТ: рост-грудь-бёдра
у женщин, рост-грудь-талия у мужчин. Мерки ряда - тело без прибавок.

```bash
curl "http://127.0.0.1:8000/api/validate/sizes?model=tee&gender=female&height=164"
```

```json
[
  { "size": "46", "gender": "female", "height": 164, "designation": "164-92-98",
    "measurements": { "bust": 92, "waist": 74, "height": 164, "...": "..." },
    "dimensions": { "front_width_cm": 52.0, "front_height_cm": 74.0,
                    "sleeve_width_cm": 44.2, "sleeve_height_cm": 62.1 } }
]
```

## Экспорт

```bash
# SVG: один лист A4
curl "http://127.0.0.1:8000/api/export/tee.svg" -o tee.svg

# DXF: слои CUT, SEAM, GRAINLINE, NOTCH, LABEL, единицы - миллиметры
curl "http://127.0.0.1:8000/api/export/tee.dxf" -o tee.dxf

# PDF: 1:1, A4 landscape, листы с метками совмещения
curl "http://127.0.0.1:8000/api/export/tee.pdf" -o tee.pdf

# Свои мерки и параметры
curl -G "http://127.0.0.1:8000/api/export/tee.svg" \
  --data-urlencode 'measurements={"bust":110}' \
  --data-urlencode 'params={"fit":"loose","neckline":"v"}' -o tee.svg
```

## Ошибки

| Код | Когда | Тело |
|---|---|---|
| 400 | Не хватает мерок, мерка вне диапазона | `{"detail": "Не хватает мерок: waist, height"}` |
| 404 | Неизвестная модель | `{"detail": "Неизвестная модель: nosuch"}` |
| 422 | Тело запроса не проходит валидацию pydantic | список ошибок полей |


## План печати

`POST /api/print-plan` принимает тело генерации и вложенный объект `paper`:

```json
{"model":"tee","measurements":{},"params":{},"overrides":{},"paper":{"page":"A4","orientation":"portrait","calibration":true}}
```

Ответ содержит `page_count`, `pattern_page_count`, физические размеры листа
`width_mm`/`height_mm`, `margin_mm`, `overlap_mm`, детали `pieces` и листы `sheets`
с номерами страниц и координатами плиток. План и экспорт используют одну геометрию.

PDF и SVG принимают `page=A4|A3|A2|A1|A0|LETTER|LEGAL|FULL` и
`orientation=portrait|landscape`. FULL - один лист для плоттера шириной от 900 мм,
без уменьшения деталей. PDF дополнительно принимает `calibration=true` (контрольный
квадрат 50×50 мм и схема сборки первой страницей) и `download=true` (скачивание
вместо открытия в просмотрщике). По умолчанию API: A4, landscape, без калибровки.
Интерфейс предлагает A4 portrait с калибровкой. Для FULL калибровка отключается.

PDF, SVG и DXF принимают `allowances=false` (в `paper` плана печати и
пользовательского экспорта - `"allowances": false`): печатается только линия шва,
без припусков. По умолчанию - с припусками: сплошная линия реза и пунктиром линия
шва. Детали без шва посередине печатаются половиной со сгибом («1 деталь со
сгибом»), по сгибу припуска нет; подпись детали говорит, как кроить, и какие
припуски включены. Ответ `/api/generate` содержит у каждой детали `cut_outline` -
линию реза целой детали с припусками по срезам (как на печати), а также
`hem_allowance_mm` и `edge_allowances_mm`.

Печатать PDF нужно в масштабе 100%, без подгонки. Поля стандартных листов - 10 мм,
перекрытие плиток - 8 мм. Формат бумаги не меняет масштаб лекала.


## Пользовательские детали

`POST /api/custom/generate`, `POST /api/custom/print-plan` и
`POST /api/custom/export/{svg|dxf|pdf}` принимают готовые контуры в
миллиметрах:

```json
{"pieces":[{"id":"piece-1","name":"Перед","outline":[{"x":0,"y":0},{"x":200,"y":0},{"x":200,"y":300},{"x":0,"y":300}],"cut":1,"seam_allowance_mm":10,"mirrored":false,"notches":[],"grainline":null,"internal_lines":[]}],"paper":{"page":"A4","orientation":"portrait","calibration":true}}
```

Сервер проверяет площадь, число точек, припуск и уникальность
идентификаторов. Ответ `/custom/generate` совпадает по форме с `/generate`,
но `model` равен `custom`.

## Каталог источника

`GET /api/library` возвращает `kind=official-source-catalog`, `source_url` и
`items` — 85 реальных моделей: 73 FreeSewing, 6 Mood Sewciety, 6 Tiana’s Closet.
`sources` содержит проверенные сайты издателей. Запись содержит `id`, `name`,
`description`, `section`, `author`, `difficulty`, `image`, `url`, `editor_url`,
`examples` (title/url/image), `code_license`, `source_version`, `code_url`,
`verified_on`, `integration=external`. Это ссылки на оригинальные конструкции,
а не идентификаторы для /api/generate. Собственные основы по-прежнему находятся
в /api/catalog; генерация поддерживает их исходные четыре идентификатора.


Для дополнительных издателей `difficulty`, `code_license`, `source_version`,
`code_url`, `editor_url` могут быть null: значения не выдумываются. Поля
`provider`, `image_srcset`, `access`, `download_url` описывают реальный источник,
варианты изображения и условия получения PDF (у Mood — email-required).
## Данные ателье

Данные лежат в MongoDB (`MONGO_URL`, `MONGO_DB`), вложения в GridFS. Все запросы,
кроме входа и регистрации, требуют сессии: httpOnly-cookie `shityo_session`
(SameSite=Lax, 30 дней). Ателье берётся из сессии; чужие записи отвечают 404.

| Метод и путь | Кто | Что делает |
| --- | --- | --- |
| POST /api/auth/register | все | Новое ателье и его владелец, сразу входит |
| POST /api/auth/login | все | Вход; после 5 неудач за 15 минут - 429 |
| POST /api/auth/logout | сотрудник | Выход |
| GET /api/auth/me | сотрудник | Сотрудник и ателье |
| PUT /api/auth/password | сотрудник | Смена своего пароля, остальные сессии закрываются |
| GET, PUT /api/atelier | сотрудник, владелец | Реквизиты ателье |
| GET, POST /api/staff, PATCH /api/staff/{id} | сотрудник, владелец | Сотрудники, роль, доступ, новый пароль |
| GET, POST /api/clients | сотрудник | Клиенты со счётчиком съёмок и датой последней |
| GET, PATCH /api/clients/{id} | сотрудник | Карточка клиента |
| DELETE /api/clients/{id} | владелец | Клиент и его съёмки; заказы остаются без клиента |
| GET, POST /api/clients/{id}/snapshots, DELETE .../{sid} | сотрудник | История мерок |
| GET /api/projects, GET, PUT, PATCH, DELETE /api/projects/{id} | сотрудник | Заказы: проект целиком, стадия, мастер |
| GET, POST /api/projects/{id}/versions | сотрудник | Последние 30 версий, без дублей подряд |
| GET /api/files/{id} | сотрудник | Вложение проекта из GridFS |
| GET, PUT, DELETE /api/custom-projects/{id} | сотрудник | Свои выкройки |
| POST /api/import, GET /api/export | сотрудник | Перенос и резервная копия JSON |

Проект проверяется на сервере: модель из каталога, мерки в пределах
`measurement_ranges`, клиент и мастер из этого же ателье, до 10 файлов по 1 МБ
(только PDF, SVG, DXF). Новый файл приходит как `dataUrl`, сохранённый
возвращается с `url`. Импорт не перезаписывает существующие записи и считает
пропущенные в `skipped`.
