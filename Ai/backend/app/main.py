"""Stooorna Ai — independent FastAPI service."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import chat, extras, health, image, rag  # IMAGE-PATCH: added `image` ; EXTRAS: search / image-generate / transcribe / file-read

settings = get_settings()

# Ensure data dirs exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# CORS-FIX: the Ai API is public and cookie-free, so any Stooorna origin may call it:
# https://www.stooorna.com (with www), the Capacitor / WebView app (https://localhost, capacitor://localhost) and any other host.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(rag.router, prefix=settings.api_prefix)
app.include_router(image.router, prefix=settings.api_prefix)  # IMAGE-PATCH: POST /ai/image-edit
app.include_router(extras.router, prefix=settings.api_prefix)  # EXTRAS: /ai/search, /ai/image-generate, /ai/transcribe, /ai/file-read


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "docs": f"{settings.api_prefix}/docs",
        "health": f"{settings.api_prefix}/health",
    }
