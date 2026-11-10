"""Подключение к MongoDB: одна база на сервис, ателье разделены полем atelier.

Конструктор лекал работает и без базы: каталог, построение и экспорт не
трогают Mongo. Поэтому подключение ленивое: клиент создаётся при первом
обращении к данным, индексы строятся один раз. Если база недоступна,
запрос к данным получает 503, а построение лекал продолжает работать.

Настройки окружения:
    MONGO_URL  адрес сервера, по умолчанию mongodb://127.0.0.1:27017
    MONGO_DB   имя базы, по умолчанию shityo
"""

from __future__ import annotations

import asyncio
import os

from fastapi import HTTPException
from gridfs import AsyncGridFSBucket
from pymongo import ASCENDING, DESCENDING, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

# Асинхронный клиент привязан к циклу событий, в котором создан. У сервера
# цикл один; тесты поднимают несколько TestClient, у каждого свой цикл.
_clients: dict[asyncio.AbstractEventLoop, AsyncMongoClient] = {}
# Индексы строятся один раз на базу: имя базы задаётся окружением.
_ready: set[str] = set()


def mongo_url() -> str:
    return os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")


def mongo_db_name() -> str:
    return os.environ.get("MONGO_DB", "shityo")


def client() -> AsyncMongoClient:
    loop = asyncio.get_running_loop()
    if loop not in _clients:
        _clients[loop] = AsyncMongoClient(mongo_url(), serverSelectionTimeoutMS=3000, tz_aware=True)
    return _clients[loop]


async def close() -> None:
    current = _clients.pop(asyncio.get_running_loop(), None)
    if current is not None:
        await current.close()


async def _ensure_indexes(db: AsyncDatabase) -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("atelier")
    await db.sessions.create_index("expires", expireAfterSeconds=0)
    await db.login_failures.create_index("at", expireAfterSeconds=15 * 60)
    await db.login_failures.create_index("email")
    # Идентификаторы записей задаёт браузер (они попадают в адреса), поэтому
    # уникальны они только внутри ателье: два ателье могут иметь проект «p-1».
    for name in ("clients", "projects", "custom_projects"):
        await db[name].create_index([("atelier", ASCENDING), ("id", ASCENDING)], unique=True)
    await db.projects.create_index([("atelier", ASCENDING), ("updated", DESCENDING)])
    await db.snapshots.create_index([("atelier", ASCENDING), ("id", ASCENDING)], unique=True)
    await db.snapshots.create_index([("atelier", ASCENDING), ("client", ASCENDING)])
    await db.versions.create_index(
        [("atelier", ASCENDING), ("project", ASCENDING), ("at", DESCENDING)]
    )


async def database() -> AsyncDatabase:
    """Зависимость FastAPI: база с готовыми индексами или 503."""
    name = mongo_db_name()
    db = client()[name]
    if name in _ready:
        return db
    try:
        # create_index идемпотентен: параллельные первые запросы не мешают друг другу.
        await _ensure_indexes(db)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="База данных недоступна") from exc
    _ready.add(name)
    return db


def files_bucket(db: AsyncDatabase) -> AsyncGridFSBucket:
    """Вложения проектов (PDF, SVG, DXF) лежат в GridFS, а не внутри документа."""
    return AsyncGridFSBucket(db, bucket_name="files")
