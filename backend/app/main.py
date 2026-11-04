"""Точка входа HTTP-сервиса.

Запуск: uvicorn app.main:app --app-dir backend --port 8000
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router

app = FastAPI(
    title="Параметрические лекала",
    version="0.1.0",
    description="Детерминированный генератор лекал одежды по меркам и параметрам фасона.",
)

# Фронтенд живёт на отдельном dev-сервере, поэтому CORS включён для localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root() -> dict:
    return {"service": "pattern-engine", "docs": "/docs"}
