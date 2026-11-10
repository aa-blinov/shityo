"""Демо-ателье для показа: сотрудники, клиенты с историей мерок и заказы.

Заводит ателье через API запущенного сервера (как это сделал бы владелец в
интерфейсе), поэтому данные проходят те же проверки, что и ручной ввод.
Повторный запуск не задваивает данные: если ателье уже есть, скрипт входит
и добавляет только недостающих клиентов и заказы.

Мерки - типовые фигуры размерных рядов ГОСТ с небольшими отклонениями, не
мерки реальных людей. Имена и телефоны вымышлены.

Запуск:
    .venv/Scripts/python.exe scripts/seed_demo.py --api http://127.0.0.1:8000
Вход: demo@shityo.local и пароль из --password (по умолчанию demo-atelier-2026).
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta

EMAIL = "demo@shityo.local"
STAFF = [
    ("Ольга Миронова", "olga@shityo.local", "master"),
    ("Тимур Ахметов", "timur@shityo.local", "master"),
]
# Клиент: имя, телефон, заметка, пол, размер, рост, поправки к меркам.
CLIENTS = [
    (
        "Анна Петрова",
        "+7 900 000-11-01",
        "Сутулость, плечи покатые. Любит длину миди.",
        "female",
        "46",
        164,
        {"waist": 1.5},
    ),
    (
        "Вера Семёнова",
        "+7 900 000-11-02",
        "Высокая грудь, пальто носит свободно.",
        "female",
        "50",
        170,
        {"bust": 2.0},
    ),
    (
        "Галина Орлова",
        "+7 900 000-11-03",
        "Шьёт к юбилею, примерка по субботам.",
        "female",
        "54",
        158,
        {},
    ),
    (
        "Дарья Ким",
        "+7 900 000-11-04",
        "Бельё из кружева, размер под грудью меряли дважды.",
        "female",
        "44",
        164,
        {"waist": -1.0},
    ),
    ("Игорь Белов", "+7 900 000-11-05", "Рубашки только приталенные.", "male", "50", 176, {}),
    (
        "Максим Орехов",
        "+7 900 000-11-06",
        "Брюки без стрелок, посадка средняя.",
        "male",
        "54",
        182,
        {"waist": 2.0},
    ),
]
# Заказ: клиент, модель, название, стадия, индекс мастера (0 - владелец), по старой съёмке.
ORDERS = [
    ("Анна Петрова", "skirt", "Юбка на лето", "toile", 1, True),
    ("Анна Петрова", "dress", "Платье на юбилей подруги", "draft", 1, False),
    ("Вера Семёнова", "coat", "Пальто демисезонное", "cut", 0, False),
    ("Вера Семёнова", "slip", "Комбинация шёлковая", "sew", 1, False),
    ("Галина Орлова", "dress", "Платье-футляр к юбилею", "toile", 0, False),
    ("Дарья Ким", "bralette", "Бралетт из кружева", "draft", 2, False),
    ("Дарья Ким", "briefs", "Трусы к бралетту", "measure", 2, False),
    ("Игорь Белов", "shirt", "Рубашка в клетку", "sew", 2, False),
    ("Игорь Белов", "trousers", "Брюки к пиджаку", "done", 0, False),
    ("Максим Орехов", "boxers", "Боксеры, три пары", "draft", 2, False),
    ("Максим Орехов", "trousers", "Брюки широкие", "measure", 1, False),
]


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/") + "/api"
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def call(self, method: str, path: str, body: object | None = None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            self.base + path, data=data, method=method, headers={"Content-Type": "application/json"}
        )
        with self.opener.open(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None


def body_row(api: Api, model: str, gender: str, size: str, height: int) -> dict:
    rows = api.call("GET", f"/validate/sizes?model={model}&gender={gender}&all_heights=true")
    rows = rows if isinstance(rows, list) else rows.get("rows", [])
    for row in rows:
        if row["size"] == size and row["height"] == height:
            return dict(row["measurements"])
    return dict(rows[0]["measurements"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--password", default="demo-atelier-2026")
    args = parser.parse_args()
    api = Api(args.api)

    try:
        api.call(
            "POST",
            "/auth/register",
            {
                "atelier": "Ателье на Садовой",
                "name": "Ирина Соколова",
                "email": EMAIL,
                "password": args.password,
            },
        )
        print("ателье создано")
    except urllib.error.HTTPError as error:
        if error.code != 409:
            raise
        api.call("POST", "/auth/login", {"email": EMAIL, "password": args.password})
        print("ателье уже есть, вход выполнен")
    api.call(
        "PUT",
        "/atelier",
        {
            "name": "Ателье на Садовой",
            "city": "Алматы",
            "notes": "Пошив на заказ, бельё и верхняя одежда. Пн-сб, 10-19.",
        },
    )

    known = {user["email"] for user in api.call("GET", "/staff")}
    for name, email, role in STAFF:
        if email not in known:
            api.call(
                "POST",
                "/staff",
                {"name": name, "email": email, "password": args.password, "role": role},
            )
    staff = sorted(api.call("GET", "/staff"), key=lambda u: (u["role"] != "owner", u["name"]))
    owner = next(u for u in staff if u["email"] == EMAIL)
    masters = [owner] + [u for u in staff if u["email"] != EMAIL]

    clients = {c["name"]: c for c in api.call("GET", "/clients")}
    now = datetime.now(UTC)
    snapshots: dict[str, list[dict]] = {}
    for name, phone, notes, gender, size, height, tweak in CLIENTS:
        if name not in clients:
            clients[name] = api.call(
                "POST", "/clients", {"name": name, "phone": phone, "notes": notes}
            )
        cid = clients[name]["id"]
        history = api.call("GET", f"/clients/{cid}/snapshots")
        if not history:
            # Полный набор мерок для всех изделий этого пола: объединение строк сетки.
            values: dict[str, float] = {}
            for model in (
                "tee",
                "dress",
                "trousers",
                "briefs",
                "bralette",
                "coat",
                "skirt",
                "boxers",
            ):
                try:
                    values.update(body_row(api, model, gender, size, height))
                except urllib.error.HTTPError:
                    continue
            spring = {k: round(v, 1) for k, v in values.items()}
            autumn = {k: round(v + tweak.get(k, 0.0), 1) for k, v in values.items()}
            api.call(
                "POST",
                f"/clients/{cid}/snapshots",
                {
                    "label": "Весна",
                    "values": spring,
                    "createdAt": (now - timedelta(days=200)).isoformat(),
                },
            )
            api.call(
                "POST",
                f"/clients/{cid}/snapshots",
                {
                    "label": "Осень",
                    "values": autumn,
                    "createdAt": (now - timedelta(days=20)).isoformat(),
                },
            )
            history = api.call("GET", f"/clients/{cid}/snapshots")
        snapshots[name] = history

    catalog = {item["id"]: item for item in api.call("GET", "/catalog")["items"]}
    existing = {p["name"] for p in api.call("GET", "/projects")}
    for index, (name, model, title, stage, master, old) in enumerate(ORDERS):
        if title in existing:
            continue
        item = catalog[model]
        history = snapshots[name]
        source = history[-1] if old else history[0]
        measurements = {
            key: source["values"][key] for key in item["measurements"] if key in source["values"]
        }
        params = {key: spec["default"] for key, spec in item["params"].items()}
        for key in measurements:
            if key in params:
                params[key] = measurements[key]
        project = {
            "version": 1,
            "name": title,
            "model": model,
            "measurements": measurements,
            "params": params,
            "overrides": {},
            "clientId": clients[name]["id"],
            "stage": stage,
            "assigneeId": masters[min(master, len(masters) - 1)]["id"],
            "files": [],
        }
        api.call("PUT", f"/projects/demo-{index + 1}", project)
        print("заказ:", title)
    print(f"готово: войдите как {EMAIL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
