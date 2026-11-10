"""Хранилище ателье: вход, разделение ателье, роли, заказы, файлы, перенос.

Тесты работают с настоящей MongoDB (docker compose up -d mongo), каждый в
своей временной базе. Без сервера тесты пропускаются с понятной причиной.
"""

from __future__ import annotations

import base64
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.errors import PyMongoError

URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")


def _mongo_available() -> bool:
    try:
        MongoClient(URL, serverSelectionTimeoutMS=1500).admin.command("ping")
        return True
    except PyMongoError:
        return False


pytestmark = pytest.mark.skipif(
    not _mongo_available(), reason="MongoDB недоступна: docker compose up -d mongo"
)


@pytest.fixture
def app(monkeypatch):
    name = f"shityo_test_{uuid.uuid4().hex[:12]}"
    monkeypatch.setenv("MONGO_DB", name)
    from app.main import app as fastapi_app

    yield fastapi_app
    MongoClient(URL).drop_database(name)


def register(app, email: str, atelier: str = "Ателье") -> TestClient:
    client = TestClient(app)
    client.__enter__()
    response = client.post(
        "/api/auth/register",
        json={"atelier": atelier, "name": "Мария", "email": email, "password": "секретный-пароль"},
    )
    assert response.status_code == 201, response.text
    return client


def project(**extra) -> dict:
    return {
        "version": 1,
        "name": "Юбка",
        "model": "skirt",
        "measurements": {},
        "params": {},
        "overrides": {},
        **extra,
    }


def test_register_login_and_logout(app):
    owner = register(app, "maria@example.com")
    me = owner.get("/api/auth/me").json()
    assert me["user"]["role"] == "owner"
    assert me["atelier"]["name"] == "Ателье"
    assert (
        owner.post(
            "/api/auth/register",
            json={
                "atelier": "Б",
                "name": "Б",
                "email": "maria@example.com",
                "password": "12345678",
            },
        ).status_code
        == 409
    )

    assert owner.post("/api/auth/logout").status_code == 204
    assert owner.get("/api/clients").status_code == 401
    assert (
        owner.post(
            "/api/auth/login", json={"email": "MARIA@example.com", "password": "секретный-пароль"}
        ).status_code
        == 200
    )
    assert owner.get("/api/clients").status_code == 200


def test_login_is_throttled_after_failures(app):
    register(app, "a@example.com")
    anonymous = TestClient(app)
    for _ in range(5):
        assert (
            anonymous.post(
                "/api/auth/login", json={"email": "a@example.com", "password": "неверный"}
            ).status_code
            == 401
        )
    response = anonymous.post(
        "/api/auth/login", json={"email": "a@example.com", "password": "секретный-пароль"}
    )
    assert response.status_code == 429


def test_ateliers_do_not_see_each_other(app):
    first = register(app, "one@example.com", "Первое")
    second = register(app, "two@example.com", "Второе")
    client = first.post("/api/clients", json={"name": "Анна"}).json()
    data_url = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()
    saved = first.put(
        "/api/projects/p-1",
        json=project(
            clientId=client["id"],
            files=[
                {
                    "id": "f-1",
                    "name": "a.svg",
                    "type": "image/svg+xml",
                    "size": 6,
                    "dataUrl": data_url,
                }
            ],
        ),
    ).json()

    assert second.get("/api/clients").json() == []
    assert second.get("/api/projects").json() == []
    assert second.get(f"/api/clients/{client['id']}").status_code == 404
    assert second.get("/api/projects/p-1").status_code == 404
    assert second.get(saved["files"][0]["url"]).status_code == 404
    # Тот же идентификатор в другом ателье - отдельный проект.
    assert second.put("/api/projects/p-1", json=project(name="Чужая")).status_code == 200
    assert first.get("/api/projects/p-1").json()["name"] == "Юбка"
    # Клиент другого ателье не привязывается к проекту.
    assert second.put("/api/projects/p-2", json=project(clientId=client["id"])).status_code == 422


def test_roles_limit_masters(app):
    owner = register(app, "owner@example.com")
    created = owner.post(
        "/api/staff",
        json={"name": "Ольга", "email": "olga@example.com", "password": "пароль-ольги"},
    )
    assert created.status_code == 201
    master = TestClient(app)
    master.__enter__()
    assert (
        master.post(
            "/api/auth/login", json={"email": "olga@example.com", "password": "пароль-ольги"}
        ).status_code
        == 200
    )

    client = master.post("/api/clients", json={"name": "Анна", "phone": "+7 900"}).json()
    assert (
        master.post(
            "/api/staff", json={"name": "X", "email": "x@example.com", "password": "12345678"}
        ).status_code
        == 403
    )
    assert master.delete(f"/api/clients/{client['id']}").status_code == 403
    assert master.put("/api/atelier", json={"name": "Новое"}).status_code == 403
    assert owner.delete(f"/api/clients/{client['id']}").status_code == 204

    me = owner.get("/api/auth/me").json()["user"]
    assert owner.patch(f"/api/staff/{me['id']}", json={"role": "master"}).status_code == 400
    olga = next(
        user for user in owner.get("/api/staff").json() if user["email"] == "olga@example.com"
    )
    assert owner.patch(f"/api/staff/{olga['id']}", json={"active": False}).status_code == 200
    assert master.get("/api/clients").status_code == 401


def test_project_validation_files_and_versions(app):
    owner = register(app, "p@example.com")
    assert (
        owner.put("/api/projects/p-1", json=project(measurements={"waist": 500})).status_code == 422
    )
    assert owner.put("/api/projects/p-1", json=project(model="nope")).status_code == 422

    payload = b"%PDF-1.4 test"
    data_url = "data:application/pdf;base64," + base64.b64encode(payload).decode()
    files = [
        {
            "id": "f-1",
            "name": "plan.pdf",
            "type": "application/pdf",
            "size": len(payload),
            "dataUrl": data_url,
        }
    ]
    saved = owner.put("/api/projects/p-1", json=project(files=files, stage="toile")).json()
    assert saved["stage"] == "toile"
    url = saved["files"][0]["url"]
    assert owner.get(url).content == payload

    # Повторное сохранение без dataUrl оставляет файл, без файла - удаляет его.
    kept = owner.put(
        "/api/projects/p-1",
        json=project(files=[{k: v for k, v in files[0].items() if k != "dataUrl"}]),
    ).json()
    assert kept["files"][0]["url"] == url
    owner.put("/api/projects/p-1", json=project())
    assert owner.get(url).status_code == 404

    state = {"measurements": {"waist": 70}, "params": {}, "overrides": {}}
    owner.post("/api/projects/p-1/versions", json={"name": "Сохранено", "state": state})
    versions = owner.post(
        "/api/projects/p-1/versions", json={"name": "Сохранено", "state": state}
    ).json()
    assert len(versions) == 1
    for index in range(35):
        versions = owner.post(
            "/api/projects/p-1/versions", json={"name": f"v{index}", "state": state}
        ).json()
    assert len(versions) == 30

    patched = owner.patch("/api/projects/p-1", json={"stage": "done"}).json()
    assert patched["stage"] == "done"
    assert owner.delete("/api/projects/p-1").status_code == 204
    assert owner.get("/api/projects/p-1").status_code == 404


def test_snapshots_history(app):
    owner = register(app, "s@example.com")
    client = owner.post("/api/clients", json={"name": "Анна"}).json()
    owner.post(
        f"/api/clients/{client['id']}/snapshots",
        json={"label": "Первая", "values": {"waist": 70}, "createdAt": "2026-01-01T00:00:00Z"},
    )
    owner.post(
        f"/api/clients/{client['id']}/snapshots", json={"label": "Вторая", "values": {"waist": 72}}
    )
    history = owner.get(f"/api/clients/{client['id']}/snapshots").json()
    assert [item["label"] for item in history] == ["Вторая", "Первая"]
    listed = owner.get("/api/clients").json()[0]
    assert listed["snapshots"] == 2
    assert listed["lastMeasuredAt"] == history[0]["createdAt"]
    assert (
        owner.post(
            f"/api/clients/{client['id']}/snapshots", json={"values": {"waist": "много"}}
        ).status_code
        == 422
    )


def test_import_is_idempotent_and_export_is_self_contained(app):
    owner = register(app, "i@example.com")
    client_id = str(uuid.uuid4())
    data_url = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()
    payload = {
        "clients": {
            "clients": [
                {"id": client_id, "name": "Анна", "notes": "", "createdAt": "2026-01-01T00:00:00Z"}
            ],
            "snapshots": [
                {
                    "id": str(uuid.uuid4()),
                    "clientId": client_id,
                    "label": "Основные",
                    "createdAt": "2026-01-02T00:00:00Z",
                    "values": {"waist": 70},
                }
            ],
        },
        "designProjects": [
            project(
                id="p-1",
                clientId=client_id,
                updated="2026-02-01T10:00:00Z",
                files=[
                    {
                        "id": "f-1",
                        "name": "a.svg",
                        "type": "image/svg+xml",
                        "size": 6,
                        "uploadedAt": "2026-02-01T10:00:00Z",
                        "dataUrl": data_url,
                    }
                ],
            ),
            {"id": "broken", "name": "Битый"},
        ],
        "designVersions": {
            "p-1": [
                {
                    "id": "v-1",
                    "at": "2026-02-01T10:00:00Z",
                    "name": "Сохранено",
                    "state": {"measurements": {}, "params": {}, "overrides": {}},
                }
            ]
        },
        "customProjects": [
            {"id": "c-1", "name": "Своя", "updated": "2026-02-01T10:00:00Z", "pieces": []}
        ],
    }
    first = owner.post("/api/import", json=payload).json()
    assert first == {
        "clients": 1,
        "snapshots": 1,
        "projects": 1,
        "versions": 1,
        "custom": 1,
        "skipped": 1,
    }
    second = owner.post("/api/import", json=payload).json()
    assert second["projects"] == 0 and second["clients"] == 0

    imported = owner.get("/api/projects/p-1").json()
    assert imported["updated"] == "2026-02-01T10:00:00Z"
    assert imported["clientId"] == client_id

    backup = owner.get("/api/export").json()
    assert backup["designProjects"][0]["files"][0]["dataUrl"] == data_url
    assert backup["clients"]["clients"][0]["name"] == "Анна"
    assert backup["customProjects"][0]["name"] == "Своя"
