"""Данные ателье: клиенты, съёмки мерок, заказы (проекты), версии, файлы.

Каждый запрос видит только своё ателье: фильтр по atelier стоит в каждом
обращении к базе, а идентификатор ателье берётся из сессии, не из запроса.
Идентификаторы записей задаёт браузер (они уже живут в адресах и резервных
копиях), поэтому сервер проверяет их формат и уникальность внутри ателье.

Проект проверяется и здесь: модель из каталога, мерки в допустимых пределах,
клиент и ответственный мастер из этого же ателье. Полную проверку параметров
фасона делает построение лекала, а не хранилище.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Response
from gridfs.errors import NoFile
from pydantic import BaseModel, Field, StringConstraints, field_validator
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from ..core.validation import MEASUREMENT_RANGES
from ..drafts import CATALOG
from ..store.auth import Principal, current, owner, now
from ..store.db import database, files_bucket

router = APIRouter(prefix="/api")

RecordId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9-]{1,80}$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Stage = Literal["measure", "draft", "toile", "cut", "sew", "done"]

MAX_FILES = 10
MAX_FILE_BYTES = 1_000_000
MAX_VERSIONS = 30
MAX_VALUES = 120
MAX_CUSTOM_BYTES = 2_000_000
ALLOWED_FILE_TYPES = (".pdf", ".svg", ".dxf")
MODELS = {item["id"]: item for item in CATALOG}


def iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z") if isinstance(value, datetime) else value


def parse_time(value: str | None) -> datetime:
    if not value:
        return now()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Некорректная дата") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=now().tzinfo)


def finite_values(values: dict[str, float]) -> dict[str, float]:
    if len(values) > MAX_VALUES or not all(
        isinstance(v, (int, float)) and math.isfinite(v) for v in values.values()
    ):
        raise ValueError("мерки должны быть конечными числами")
    return values


# ---------------------------------------------------------------- клиенты


class ClientIn(BaseModel):
    name: Name
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] = ""
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class ClientCreate(ClientIn):
    id: RecordId | None = None


class ClientPatch(BaseModel):
    name: Name | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class SnapshotIn(BaseModel):
    id: RecordId | None = None
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] = ""
    values: dict[str, float]
    createdAt: str | None = None

    _values = field_validator("values")(finite_values)


def client_view(doc: dict, stats: dict | None = None) -> dict:
    stats = stats or {}
    return {
        "id": doc["id"],
        "name": doc["name"],
        "phone": doc.get("phone", ""),
        "notes": doc.get("notes", ""),
        "createdAt": iso(doc["created"]),
        "updatedAt": iso(doc.get("updated", doc["created"])),
        "snapshots": stats.get("count", 0),
        "lastMeasuredAt": iso(stats.get("last")),
    }


def snapshot_view(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "clientId": doc["client"],
        "label": doc.get("label", ""),
        "createdAt": iso(doc["created"]),
        "values": doc["values"],
    }


async def _snapshot_stats(
    db: AsyncDatabase, atelier: str, client_id: str | None = None
) -> dict[str, dict]:
    match: dict = {"atelier": atelier}
    if client_id:
        match["client"] = client_id
    rows = await db.snapshots.aggregate(
        [
            {"$match": match},
            {"$group": {"_id": "$client", "count": {"$sum": 1}, "last": {"$max": "$created"}}},
        ]
    )
    return {row["_id"]: row async for row in rows}


async def _client(db: AsyncDatabase, atelier: str, client_id: str) -> dict:
    doc = await db.clients.find_one({"atelier": atelier, "id": client_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return doc


async def insert_client(
    db: AsyncDatabase, principal: Principal, body: ClientCreate, created: datetime | None = None
) -> dict:
    stamp = created or now()
    doc = {
        "atelier": principal.atelier,
        "id": body.id or str(uuid.uuid4()),
        "name": body.name,
        "phone": body.phone,
        "notes": body.notes,
        "created": stamp,
        "updated": stamp,
        "by": principal.user,
    }
    await db.clients.insert_one(doc)
    return doc


async def insert_snapshot(
    db: AsyncDatabase, principal: Principal, client_id: str, body: SnapshotIn
) -> dict:
    created = parse_time(body.createdAt)
    doc = {
        "atelier": principal.atelier,
        "id": body.id or str(uuid.uuid4()),
        "client": client_id,
        "label": body.label or created.date().isoformat(),
        "values": body.values,
        "created": created,
        "by": principal.user,
    }
    await db.snapshots.insert_one(doc)
    return doc


@router.get("/clients")
async def list_clients(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> list[dict]:
    stats = await _snapshot_stats(db, principal.atelier)
    docs = db.clients.find({"atelier": principal.atelier}).sort("name", 1)
    return [client_view(doc, stats.get(doc["id"])) async for doc in docs]


@router.post("/clients", status_code=201)
async def create_client(
    body: ClientCreate,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    try:
        doc = await insert_client(db, principal, body)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=409, detail="Клиент с таким идентификатором уже есть"
        ) from exc
    return client_view(doc)


@router.get("/clients/{client_id}")
async def get_client(
    client_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    doc = await _client(db, principal.atelier, client_id)
    stats = await _snapshot_stats(db, principal.atelier, client_id)
    return client_view(doc, stats.get(client_id))


@router.patch("/clients/{client_id}")
async def update_client(
    client_id: RecordId,
    body: ClientPatch,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    patch = {key: value for key, value in body.model_dump().items() if value is not None}
    patch["updated"] = now()
    doc = await db.clients.find_one_and_update(
        {"atelier": principal.atelier, "id": client_id},
        {"$set": patch},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    stats = await _snapshot_stats(db, principal.atelier, client_id)
    return client_view(doc, stats.get(client_id))


@router.delete("/clients/{client_id}", status_code=204)
async def delete_client(
    client_id: RecordId,
    principal: Principal = Depends(owner),
    db: AsyncDatabase = Depends(database),
) -> None:
    await _client(db, principal.atelier, client_id)
    await db.snapshots.delete_many({"atelier": principal.atelier, "client": client_id})
    # Заказы клиента остаются: в них лекала и файлы. Они становятся «без клиента».
    await db.projects.update_many(
        {"atelier": principal.atelier, "clientId": client_id}, {"$unset": {"clientId": ""}}
    )
    await db.clients.delete_one({"atelier": principal.atelier, "id": client_id})


@router.get("/clients/{client_id}/snapshots")
async def list_snapshots(
    client_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> list[dict]:
    await _client(db, principal.atelier, client_id)
    docs = db.snapshots.find({"atelier": principal.atelier, "client": client_id}).sort(
        "created", -1
    )
    return [snapshot_view(doc) async for doc in docs]


@router.post("/clients/{client_id}/snapshots", status_code=201)
async def create_snapshot(
    client_id: RecordId,
    body: SnapshotIn,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    await _client(db, principal.atelier, client_id)
    try:
        doc = await insert_snapshot(db, principal, client_id, body)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Такая съёмка уже есть") from exc
    await db.clients.update_one(
        {"atelier": principal.atelier, "id": client_id}, {"$set": {"updated": now()}}
    )
    return snapshot_view(doc)


@router.delete("/clients/{client_id}/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(
    client_id: RecordId,
    snapshot_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> None:
    result = await db.snapshots.delete_one(
        {"atelier": principal.atelier, "client": client_id, "id": snapshot_id}
    )
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Съёмка не найдена")


# ---------------------------------------------------------------- заказы


class FileIn(BaseModel):
    id: RecordId
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    type: Annotated[str, StringConstraints(max_length=100)] = "application/octet-stream"
    size: int = Field(gt=0, le=MAX_FILE_BYTES)
    uploadedAt: str | None = None
    dataUrl: str | None = None


class ProjectIn(BaseModel):
    version: Literal[1] = 1
    name: Name
    model: str
    measurements: dict[str, float]
    params: dict[str, float | str]
    overrides: dict[str, float] = {}
    clientId: RecordId | Literal[""] | None = None
    stage: Stage | None = None
    assigneeId: Annotated[str, StringConstraints(max_length=80)] | None = None
    files: list[FileIn] = Field(default_factory=list, max_length=MAX_FILES)
    updated: str | None = None

    _measurements = field_validator("measurements")(finite_values)
    _overrides = field_validator("overrides")(finite_values)

    @field_validator("params")
    @classmethod
    def _params(cls, value: dict[str, float | str]) -> dict[str, float | str]:
        if len(value) > MAX_VALUES:
            raise ValueError("слишком много параметров")
        for item in value.values():
            if isinstance(item, str) and len(item) > 80:
                raise ValueError("слишком длинное значение параметра")
            if isinstance(item, float) and not math.isfinite(item):
                raise ValueError("параметр должен быть конечным числом")
        return value


class ProjectPatch(BaseModel):
    stage: Stage | None = None
    clientId: RecordId | Literal[""] | None = None
    assigneeId: Annotated[str, StringConstraints(max_length=80)] | None = None
    name: Name | None = None


class VersionIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
    state: dict[str, dict[str, Any]]
    at: str | None = None
    id: RecordId | None = None

    @field_validator("state")
    @classmethod
    def _state(cls, value: dict) -> dict:
        if set(value) != {"measurements", "params", "overrides"}:
            raise ValueError("версия хранит мерки, параметры и правки точек")
        if len(json.dumps(value)) > 50_000:
            raise ValueError("версия слишком большая")
        return value


def file_view(meta: dict) -> dict:
    return {
        "id": meta["id"],
        "name": meta["name"],
        "type": meta["type"],
        "size": meta["size"],
        "uploadedAt": iso(meta["uploaded"]),
        "url": f"/api/files/{meta['grid']}",
    }


def project_view(doc: dict, names: dict[str, str] | None = None) -> dict:
    view = {
        "version": 1,
        "id": doc["id"],
        "name": doc["name"],
        "model": doc["model"],
        "updated": iso(doc["updated"]),
        "createdAt": iso(doc.get("created", doc["updated"])),
        "measurements": doc["measurements"],
        "params": doc["params"],
        "overrides": doc.get("overrides", {}),
        "files": [file_view(meta) for meta in doc.get("files", [])],
        "stage": doc.get("stage", "draft"),
    }
    for key in ("clientId", "assigneeId"):
        if doc.get(key):
            view[key] = doc[key]
    if doc.get("by") and names is not None:
        view["updatedBy"] = names.get(doc["by"], "")
    return view


async def _staff_names(db: AsyncDatabase, atelier: str) -> dict[str, str]:
    return {
        user["_id"]: user["name"] async for user in db.users.find({"atelier": atelier}, {"name": 1})
    }


async def _check_links(
    db: AsyncDatabase, principal: Principal, client_id: str | None, assignee: str | None
) -> None:
    if client_id and not await db.clients.find_one({"atelier": principal.atelier, "id": client_id}):
        raise HTTPException(status_code=422, detail="Клиент не найден в этом ателье")
    if assignee and not await db.users.find_one({"atelier": principal.atelier, "_id": assignee}):
        raise HTTPException(status_code=422, detail="Мастер не найден в этом ателье")


def _check_model(body: ProjectIn) -> None:
    item = MODELS.get(body.model)
    if not item:
        raise HTTPException(status_code=422, detail="Неизвестная модель")
    extra = set(body.measurements) - set(item["measurements"])
    if extra:
        raise HTTPException(status_code=422, detail=f"Лишние мерки: {', '.join(sorted(extra))}")
    for key, value in body.measurements.items():
        low, high = MEASUREMENT_RANGES.get(key, (-math.inf, math.inf))
        if not low <= value <= high:
            raise HTTPException(status_code=422, detail=f"Мерка {key} вне пределов {low}-{high}")
    extra_params = set(body.params) - set(item["params"])
    if extra_params:
        raise HTTPException(
            status_code=422, detail=f"Лишние параметры: {', '.join(sorted(extra_params))}"
        )


def _decode(data_url: str) -> bytes:
    head, _, payload = data_url.partition(",")
    if not head.startswith("data:") or not payload:
        raise HTTPException(status_code=422, detail="Файл должен быть data URL")
    try:
        raw = (
            base64.b64decode(payload, validate=True)
            if head.endswith(";base64")
            else payload.encode()
        )
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Файл повреждён") from exc
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 1 МБ")
    return raw


async def _store_files(
    db: AsyncDatabase,
    principal: Principal,
    project_id: str,
    incoming: list[FileIn],
    existing: list[dict],
) -> list[dict]:
    """Новые файлы (с dataUrl) ложатся в GridFS, убранные из проекта - удаляются."""
    bucket = files_bucket(db)
    known = {meta["id"]: meta for meta in existing}
    result: list[dict] = []
    seen: set[str] = set()
    for item in incoming:
        if item.id in seen:
            raise HTTPException(status_code=422, detail="Файлы повторяются")
        seen.add(item.id)
        if item.dataUrl is None:
            if item.id not in known:
                raise HTTPException(status_code=422, detail=f"Файл {item.name} не найден")
            result.append(known[item.id])
            continue
        if not item.name.lower().endswith(ALLOWED_FILE_TYPES):
            raise HTTPException(status_code=422, detail="Прикладываются только PDF, SVG и DXF")
        raw = _decode(item.dataUrl)
        grid = await bucket.upload_from_stream(
            item.name,
            raw,
            metadata={"atelier": principal.atelier, "project": project_id, "type": item.type},
        )
        if item.id in known:
            await _delete_grid(db, known[item.id]["grid"])
        result.append(
            {
                "id": item.id,
                "name": item.name,
                "type": item.type,
                "size": len(raw),
                "uploaded": parse_time(item.uploadedAt),
                "grid": str(grid),
            }
        )
    for meta in existing:
        if meta["id"] not in seen:
            await _delete_grid(db, meta["grid"])
    return result


async def _delete_grid(db: AsyncDatabase, grid: str) -> None:
    try:
        await files_bucket(db).delete(ObjectId(grid))
    except (NoFile, InvalidId):
        pass


async def save_project(
    db: AsyncDatabase,
    principal: Principal,
    project_id: str,
    body: ProjectIn,
    keep_time: bool = False,
) -> dict:
    _check_model(body)
    client_id = body.clientId or None
    await _check_links(db, principal, client_id, body.assigneeId)
    current_doc = await db.projects.find_one({"atelier": principal.atelier, "id": project_id})
    files = await _store_files(
        db, principal, project_id, body.files, (current_doc or {}).get("files", [])
    )
    stamp = parse_time(body.updated) if keep_time else now()
    doc = {
        "atelier": principal.atelier,
        "id": project_id,
        "name": body.name,
        "model": body.model,
        "measurements": body.measurements,
        "params": body.params,
        "overrides": body.overrides,
        "stage": body.stage or "draft",
        "files": files,
        "updated": stamp,
        "by": principal.user,
    }
    unset: dict = {}
    for key, value in (("clientId", client_id), ("assigneeId", body.assigneeId)):
        if value:
            doc[key] = value
        else:
            unset[key] = ""
    update: dict = {"$set": doc, "$setOnInsert": {"created": stamp}}
    if unset:
        update["$unset"] = unset
    return await db.projects.find_one_and_update(
        {"atelier": principal.atelier, "id": project_id},
        update,
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


async def _project(db: AsyncDatabase, atelier: str, project_id: str) -> dict:
    doc = await db.projects.find_one({"atelier": atelier, "id": project_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return doc


@router.get("/projects")
async def list_projects(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> list[dict]:
    names = await _staff_names(db, principal.atelier)
    docs = db.projects.find({"atelier": principal.atelier}).sort("updated", -1)
    return [project_view(doc, names) async for doc in docs]


@router.get("/projects/{project_id}")
async def get_project(
    project_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    names = await _staff_names(db, principal.atelier)
    return project_view(await _project(db, principal.atelier, project_id), names)


@router.put("/projects/{project_id}")
async def put_project(
    project_id: RecordId,
    body: ProjectIn,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    doc = await save_project(db, principal, project_id, body)
    return project_view(doc, await _staff_names(db, principal.atelier))


@router.patch("/projects/{project_id}")
async def patch_project(
    project_id: RecordId,
    body: ProjectPatch,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    await _project(db, principal.atelier, project_id)
    fields = body.model_dump(exclude_unset=True)
    await _check_links(
        db, principal, fields.get("clientId") or None, fields.get("assigneeId") or None
    )
    update: dict = {"$set": {"updated": now(), "by": principal.user}}
    for key, value in fields.items():
        if key in ("clientId", "assigneeId") and not value:
            update.setdefault("$unset", {})[key] = ""
        elif value is not None:
            update["$set"][key] = value
    doc = await db.projects.find_one_and_update(
        {"atelier": principal.atelier, "id": project_id},
        update,
        return_document=ReturnDocument.AFTER,
    )
    return project_view(doc, await _staff_names(db, principal.atelier))


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> None:
    doc = await _project(db, principal.atelier, project_id)
    for meta in doc.get("files", []):
        await _delete_grid(db, meta["grid"])
    await db.versions.delete_many({"atelier": principal.atelier, "project": project_id})
    await db.projects.delete_one({"_id": doc["_id"]})


def version_view(doc: dict) -> dict:
    return {"id": doc["id"], "at": iso(doc["at"]), "name": doc["name"], "state": doc["state"]}


async def list_versions_raw(db: AsyncDatabase, atelier: str, project_id: str) -> list[dict]:
    docs = (
        db.versions.find({"atelier": atelier, "project": project_id})
        .sort("at", -1)
        .limit(MAX_VERSIONS)
    )
    return [version_view(doc) async for doc in docs]


async def add_version(
    db: AsyncDatabase, principal: Principal, project_id: str, body: VersionIn
) -> list[dict]:
    latest = await db.versions.find_one(
        {"atelier": principal.atelier, "project": project_id}, sort=[("at", -1)]
    )
    if not (latest and latest["state"] == body.state and latest["name"] == body.name):
        await db.versions.insert_one(
            {
                "atelier": principal.atelier,
                "project": project_id,
                "id": body.id or str(uuid.uuid4()),
                "at": parse_time(body.at),
                "name": body.name,
                "state": body.state,
                "by": principal.user,
            }
        )
        stale = (
            db.versions.find({"atelier": principal.atelier, "project": project_id}, {"_id": 1})
            .sort("at", -1)
            .skip(MAX_VERSIONS)
        )
        ids = [doc["_id"] async for doc in stale]
        if ids:
            await db.versions.delete_many({"_id": {"$in": ids}})
    return await list_versions_raw(db, principal.atelier, project_id)


@router.get("/projects/{project_id}/versions")
async def list_versions(
    project_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> list[dict]:
    await _project(db, principal.atelier, project_id)
    return await list_versions_raw(db, principal.atelier, project_id)


@router.post("/projects/{project_id}/versions")
async def create_version(
    project_id: RecordId,
    body: VersionIn,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> list[dict]:
    await _project(db, principal.atelier, project_id)
    return await add_version(db, principal, project_id, body)


@router.get("/files/{grid_id}")
async def download_file(
    grid_id: str, principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
):
    try:
        stream = await files_bucket(db).open_download_stream(ObjectId(grid_id))
    except (NoFile, InvalidId) as exc:
        raise HTTPException(status_code=404, detail="Файл не найден") from exc
    metadata = stream.metadata or {}
    if metadata.get("atelier") != principal.atelier:
        raise HTTPException(status_code=404, detail="Файл не найден")
    data = await stream.read()
    name = stream.filename or "file"
    return Response(
        content=data,
        media_type=metadata.get("type") or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{_quote(name)}"},
    )


def _quote(name: str) -> str:
    from urllib.parse import quote

    return quote(name, safe="")


# ---------------------------------------------------------------- свои выкройки


class CustomIn(BaseModel):
    model_config = {"extra": "allow"}
    id: RecordId
    name: Name
    updated: str | None = None


def custom_view(doc: dict) -> dict:
    return doc["data"]


async def save_custom(db: AsyncDatabase, principal: Principal, body: dict) -> dict:
    if len(json.dumps(body)) > MAX_CUSTOM_BYTES:
        raise HTTPException(status_code=413, detail="Выкройка слишком большая")
    parsed = CustomIn.model_validate(body)
    data = {**body, "updated": iso(parse_time(parsed.updated))}
    await db.custom_projects.update_one(
        {"atelier": principal.atelier, "id": parsed.id},
        {"$set": {"data": data, "updated": parse_time(parsed.updated), "by": principal.user}},
        upsert=True,
    )
    return data


@router.get("/custom-projects")
async def list_custom(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> list[dict]:
    docs = db.custom_projects.find({"atelier": principal.atelier}).sort("updated", -1)
    return [custom_view(doc) async for doc in docs]


@router.put("/custom-projects/{project_id}")
async def put_custom(
    project_id: RecordId,
    body: dict[str, Any],
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    if body.get("id") != project_id:
        raise HTTPException(status_code=422, detail="Идентификатор в адресе и в теле не совпадает")
    return await save_custom(db, principal, body)


@router.delete("/custom-projects/{project_id}", status_code=204)
async def delete_custom(
    project_id: RecordId,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> None:
    await db.custom_projects.delete_one({"atelier": principal.atelier, "id": project_id})


# ---------------------------------------------------------------- перенос и копия


class ImportClients(BaseModel):
    clients: list[dict[str, Any]] = []
    snapshots: list[dict[str, Any]] = []


class ImportRequest(BaseModel):
    designProjects: list[dict[str, Any]] = []
    designVersions: dict[str, list[dict[str, Any]]] = {}
    clients: ImportClients = ImportClients()
    customProjects: list[dict[str, Any]] = []


@router.post("/import")
async def import_data(
    body: ImportRequest,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> dict:
    """Перенос из браузера или из резервной копии.

    Записи, которые уже есть в ателье, не перезаписываются: повторный перенос
    безопасен. Неверная запись пропускается и попадает в счётчик skipped.
    """
    counts = {"clients": 0, "snapshots": 0, "projects": 0, "versions": 0, "custom": 0, "skipped": 0}
    for raw in body.clients.clients:
        try:
            item = ClientCreate.model_validate({**raw, "notes": str(raw.get("notes", ""))[:500]})
            if await db.clients.find_one({"atelier": principal.atelier, "id": item.id}):
                continue
            await insert_client(db, principal, item, parse_time(raw.get("createdAt")))
            counts["clients"] += 1
        except Exception:  # noqa: BLE001 - одна плохая запись не срывает перенос
            counts["skipped"] += 1
    for raw in body.clients.snapshots:
        try:
            item = SnapshotIn.model_validate(raw)
            client_id = str(raw.get("clientId", ""))
            if not await db.clients.find_one({"atelier": principal.atelier, "id": client_id}):
                raise ValueError
            if await db.snapshots.find_one({"atelier": principal.atelier, "id": item.id}):
                continue
            await insert_snapshot(db, principal, client_id, item)
            counts["snapshots"] += 1
        except Exception:  # noqa: BLE001
            counts["skipped"] += 1
    for raw in body.designProjects:
        try:
            project_id = RecordIdModel.model_validate({"id": raw.get("id")}).id
            if await db.projects.find_one({"atelier": principal.atelier, "id": project_id}):
                continue
            item = ProjectIn.model_validate(raw)
            await save_project(db, principal, project_id, item, keep_time=True)
            counts["projects"] += 1
            for version in body.designVersions.get(project_id, [])[:MAX_VERSIONS]:
                try:
                    await add_version(db, principal, project_id, VersionIn.model_validate(version))
                    counts["versions"] += 1
                except Exception:  # noqa: BLE001
                    counts["skipped"] += 1
        except Exception:  # noqa: BLE001
            counts["skipped"] += 1
    for raw in body.customProjects:
        try:
            if await db.custom_projects.find_one(
                {"atelier": principal.atelier, "id": raw.get("id")}
            ):
                continue
            await save_custom(db, principal, raw)
            counts["custom"] += 1
        except Exception:  # noqa: BLE001
            counts["skipped"] += 1
    return counts


class RecordIdModel(BaseModel):
    id: RecordId


@router.get("/export")
async def export_data(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> dict:
    """Резервная копия ателье. Файлы вложены как data URL: копия самодостаточна."""
    atelier = await db.ateliers.find_one({"_id": principal.atelier})
    bucket = files_bucket(db)
    projects = []
    versions: dict[str, list[dict]] = {}
    async for doc in db.projects.find({"atelier": principal.atelier}).sort("updated", -1):
        view = project_view(doc)
        files = []
        for meta in doc.get("files", []):
            try:
                stream = await bucket.open_download_stream(ObjectId(meta["grid"]))
                payload = base64.b64encode(await stream.read()).decode()
            except (NoFile, InvalidId):
                continue
            entry = file_view(meta)
            entry.pop("url")
            entry["dataUrl"] = f"data:{meta['type']};base64,{payload}"
            files.append(entry)
        view["files"] = files
        projects.append(view)
        versions[doc["id"]] = await list_versions_raw(db, principal.atelier, doc["id"])
    clients = [
        client_view(doc)
        async for doc in db.clients.find({"atelier": principal.atelier}).sort("name", 1)
    ]
    snapshots = [
        snapshot_view(doc) async for doc in db.snapshots.find({"atelier": principal.atelier})
    ]
    custom = [
        custom_view(doc) async for doc in db.custom_projects.find({"atelier": principal.atelier})
    ]
    return {
        "exportedAt": iso(now()),
        "atelier": {
            "name": atelier["name"],
            "city": atelier.get("city", ""),
            "notes": atelier.get("notes", ""),
        },
        "designProjects": projects,
        "designVersions": versions,
        "clients": {"clients": clients, "snapshots": snapshots},
        "customProjects": custom,
    }
