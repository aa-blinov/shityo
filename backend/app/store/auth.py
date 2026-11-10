"""Сотрудники, пароли и сессии.

Пароль хранится только как хеш Argon2id. Сессия - случайный токен в
httpOnly-cookie; в базе лежит его SHA-256, поэтому утечка коллекции sessions
не даёт войти. Cookie с SameSite=Lax: чужой сайт не отправит запрос с ней
методом POST, PUT или DELETE.

Роли:
    owner   владелец ателье: всё, плюс сотрудники и удаление клиентов;
    master  мастер: клиенты, мерки, заказы и лекала своего ателье.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from pymongo.asynchronous.database import AsyncDatabase

from .db import database

Role = Literal["owner", "master"]

COOKIE = "shityo_session"
SESSION_DAYS = 30
MAX_FAILURES = 5

_hasher = PasswordHasher()
# Хеш для несуществующей почты: проверка занимает то же время, и по задержке
# ответа нельзя узнать, зарегистрирован ли адрес.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


@dataclass(frozen=True)
class Principal:
    user: str
    atelier: str
    role: Role
    name: str
    email: str


def now() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored: str | None, password: str) -> bool:
    try:
        return _hasher.verify(stored or _DUMMY_HASH, password) and stored is not None
    except (VerificationError, InvalidHashError):
        return False


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _secure_cookie() -> bool:
    return os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}


async def start_session(db: AsyncDatabase, response: Response, user: dict) -> None:
    token = secrets.token_urlsafe(32)
    expires = now() + timedelta(days=SESSION_DAYS)
    await db.sessions.insert_one(
        {"_id": _digest(token), "user": user["_id"], "atelier": user["atelier"], "expires": expires}
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=_secure_cookie(),
        path="/",
    )


async def end_session(db: AsyncDatabase, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        await db.sessions.delete_one({"_id": _digest(token)})
    response.delete_cookie(COOKIE, path="/")


async def end_user_sessions(db: AsyncDatabase, user_id: str) -> None:
    await db.sessions.delete_many({"user": user_id})


async def too_many_failures(db: AsyncDatabase, email: str) -> bool:
    return await db.login_failures.count_documents({"email": email}) >= MAX_FAILURES


async def record_failure(db: AsyncDatabase, email: str) -> None:
    await db.login_failures.insert_one({"email": email, "at": now()})


async def clear_failures(db: AsyncDatabase, email: str) -> None:
    await db.login_failures.delete_many({"email": email})


async def current(request: Request, db: AsyncDatabase = Depends(database)) -> Principal:
    """Зависимость: вошедший сотрудник активного ателье или 401."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Нужно войти")
    session = await db.sessions.find_one({"_id": _digest(token)})
    if not session or session["expires"] < now():
        raise HTTPException(status_code=401, detail="Сессия закончилась, войдите снова")
    user = await db.users.find_one({"_id": session["user"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Доступ закрыт")
    return Principal(
        user=user["_id"],
        atelier=user["atelier"],
        role=user["role"],
        name=user["name"],
        email=user["email"],
    )


async def owner(principal: Principal = Depends(current)) -> Principal:
    if principal.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец ателье")
    return principal
