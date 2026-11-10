"""Вход, ателье и сотрудники.

Регистрация создаёт ателье и его владельца. Остальных сотрудников заводит
владелец: имя, почта и временный пароль, который мастер потом меняет сам.
Писем сервис не отправляет, поэтому приглашений по ссылке нет.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from ..store.auth import (
    Principal,
    clear_failures,
    current,
    end_session,
    end_user_sessions,
    hash_password,
    now,
    owner,
    record_failure,
    start_session,
    too_many_failures,
    verify_password,
)
from ..store.db import database

router = APIRouter(prefix="/api")

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    ),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class RegisterRequest(BaseModel):
    atelier: Name
    name: Name
    email: Email
    password: Password


class LoginRequest(BaseModel):
    email: Email
    password: Annotated[str, StringConstraints(max_length=128)]


class PasswordChange(BaseModel):
    current: Annotated[str, StringConstraints(max_length=128)]
    next: Password


class AtelierUpdate(BaseModel):
    name: Name
    city: Text = ""
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class StaffCreate(BaseModel):
    name: Name
    email: Email
    password: Password
    role: Literal["owner", "master"] = "master"


class StaffUpdate(BaseModel):
    name: Name | None = None
    role: Literal["owner", "master"] | None = None
    active: bool | None = None
    password: Password | None = Field(default=None)


def user_view(user: dict) -> dict:
    return {
        "id": user["_id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "active": user.get("active", True),
    }


def atelier_view(atelier: dict) -> dict:
    return {
        "id": atelier["_id"],
        "name": atelier["name"],
        "city": atelier.get("city", ""),
        "notes": atelier.get("notes", ""),
    }


async def _me(db: AsyncDatabase, user_id: str) -> dict:
    user = await db.users.find_one({"_id": user_id})
    atelier = await db.ateliers.find_one({"_id": user["atelier"]})
    return {"user": user_view(user), "atelier": atelier_view(atelier)}


@router.post("/auth/register", status_code=201)
async def register(
    body: RegisterRequest, response: Response, db: AsyncDatabase = Depends(database)
) -> dict:
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="Эта почта уже зарегистрирована")
    atelier = {
        "_id": str(uuid.uuid4()),
        "name": body.atelier,
        "city": "",
        "notes": "",
        "created": now(),
    }
    user = {
        "_id": str(uuid.uuid4()),
        "atelier": atelier["_id"],
        "name": body.name,
        "email": body.email,
        "role": "owner",
        "active": True,
        "password": hash_password(body.password),
        "created": now(),
    }
    await db.ateliers.insert_one(atelier)
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError as exc:
        await db.ateliers.delete_one({"_id": atelier["_id"]})
        raise HTTPException(status_code=409, detail="Эта почта уже зарегистрирована") from exc
    await start_session(db, response, user)
    return await _me(db, user["_id"])


@router.post("/auth/login")
async def login(
    body: LoginRequest, response: Response, db: AsyncDatabase = Depends(database)
) -> dict:
    if await too_many_failures(db, body.email):
        raise HTTPException(status_code=429, detail="Слишком много попыток, подождите 15 минут")
    user = await db.users.find_one({"email": body.email})
    if not verify_password(user["password"] if user else None, body.password) or not user.get(
        "active", True
    ):
        await record_failure(db, body.email)
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")
    await clear_failures(db, body.email)
    await start_session(db, response, user)
    return await _me(db, user["_id"])


@router.post("/auth/logout", status_code=204)
async def logout(
    request: Request, response: Response, db: AsyncDatabase = Depends(database)
) -> None:
    await end_session(db, request, response)


@router.get("/auth/me")
async def me(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> dict:
    return await _me(db, principal.user)


@router.put("/auth/password", status_code=204)
async def change_password(
    body: PasswordChange,
    request: Request,
    response: Response,
    principal: Principal = Depends(current),
    db: AsyncDatabase = Depends(database),
) -> None:
    user = await db.users.find_one({"_id": principal.user})
    if not verify_password(user["password"], body.current):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
    await db.users.update_one(
        {"_id": principal.user}, {"$set": {"password": hash_password(body.next)}}
    )
    # Остальные устройства выходят: смена пароля обычно значит, что старый ушёл.
    await end_user_sessions(db, principal.user)
    await start_session(db, response, user)


@router.get("/atelier")
async def get_atelier(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> dict:
    return atelier_view(await db.ateliers.find_one({"_id": principal.atelier}))


@router.put("/atelier")
async def update_atelier(
    body: AtelierUpdate,
    principal: Principal = Depends(owner),
    db: AsyncDatabase = Depends(database),
) -> dict:
    await db.ateliers.update_one({"_id": principal.atelier}, {"$set": body.model_dump()})
    return atelier_view(await db.ateliers.find_one({"_id": principal.atelier}))


@router.get("/staff")
async def list_staff(
    principal: Principal = Depends(current), db: AsyncDatabase = Depends(database)
) -> list[dict]:
    users = db.users.find({"atelier": principal.atelier}).sort("name", 1)
    return [user_view(user) async for user in users]


@router.post("/staff", status_code=201)
async def create_staff(
    body: StaffCreate, principal: Principal = Depends(owner), db: AsyncDatabase = Depends(database)
) -> dict:
    user = {
        "_id": str(uuid.uuid4()),
        "atelier": principal.atelier,
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "active": True,
        "password": hash_password(body.password),
        "created": now(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Эта почта уже зарегистрирована") from exc
    return user_view(user)


@router.patch("/staff/{user_id}")
async def update_staff(
    user_id: str,
    body: StaffUpdate,
    principal: Principal = Depends(owner),
    db: AsyncDatabase = Depends(database),
) -> dict:
    user = await db.users.find_one({"_id": user_id, "atelier": principal.atelier})
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    patch: dict = {}
    if body.name is not None:
        patch["name"] = body.name
    if body.role is not None:
        patch["role"] = body.role
    if body.active is not None:
        patch["active"] = body.active
    if body.password is not None:
        patch["password"] = hash_password(body.password)
    demoted = patch.get("role", user["role"]) != "owner" or patch.get("active", True) is False
    if user["role"] == "owner" and demoted:
        owners = await db.users.count_documents(
            {"atelier": principal.atelier, "role": "owner", "active": True}
        )
        if owners <= 1:
            raise HTTPException(
                status_code=400, detail="В ателье должен остаться хотя бы один владелец"
            )
    await db.users.update_one({"_id": user_id}, {"$set": patch})
    if patch.get("active") is False or "password" in patch:
        await end_user_sessions(db, user_id)
    return user_view(await db.users.find_one({"_id": user_id}))
