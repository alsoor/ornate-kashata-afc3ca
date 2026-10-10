"""Image edit + image understanding endpoint for Stooorna Ai.

POST /ai/image-edit   (multipart/form-data)
    prompt : text (what the user wrote)
    images : 1-3 image files
    mode   : "edit" | "understand"  (optional - detected from the prompt when missing)
    lang   : "ar" | "en"            (optional)
-> {"reply": str, "image_base64": str | None, "image_mime": str | None}

Uses the Gemini REST API through httpx (already in requirements.txt - nothing new to install).

Env vars (Railway -> Stooorna Ai service):
    GEMINI_API_KEY        required (same key name config.py already uses)
    GEMINI_IMAGE_MODEL    optional, default gemini-2.5-flash-image   (edits the photo)
    GEMINI_TEXT_MODEL     optional, default gemini-2.5-flash         (describes / reads the photo)
"""
from __future__ import annotations

import base64
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import get_settings

router = APIRouter(prefix="/image-edit", tags=["image"])

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_IMAGES = 3

EDIT_RE = re.compile(
    r"(لبس|البس|ألبس|غير|غيّر|عدل|عدّل|احذف|امسح|شيل|ازل|أزل|ضيف|أضف|اضف|حول|حوّل|اجعل|بدل|استبدل|لون|ارسم|كبر|صغر|حسن|نظار"
    r"|edit|change|make|add|remove|delete|put|wear|replace|turn|convert|erase|background|filter|enhance|colorize|retouch|cartoon|anime)",
    re.I,
)
AR_RE = re.compile(r"[\u0600-\u06FF]")


def _api_key() -> str:
    return get_settings().gemini_api_key or os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")


async def _gemini(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=90.0) as client:
        r = await client.post(
            f"{GEMINI_BASE}/{model}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json=body,
        )
    try:
        data = r.json()
    except Exception:
        data = {}
    if r.status_code >= 400:
        raise RuntimeError((data.get("error") or {}).get("message") or f"Gemini HTTP {r.status_code}")
    return data


def _read_parts(data: dict[str, Any]) -> tuple[str, dict[str, str] | None, str | None]:
    parts = (((data.get("candidates") or [{}])[0]).get("content") or {}).get("parts") or []
    text = ""
    img: dict[str, str] | None = None
    for p in parts:
        if isinstance(p.get("text"), str):
            text += p["text"]
        d = p.get("inlineData") or p.get("inline_data")
        if d and d.get("data") and img is None:
            img = {"mime": d.get("mimeType") or d.get("mime_type") or "image/png", "data": d["data"]}
    blocked = (data.get("promptFeedback") or {}).get("blockReason")
    return text.strip(), img, blocked


@router.get("/health")
async def image_health():
    return {
        "ok": True,
        "has_key": bool(_api_key()),
        "image_model": os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
        "text_model": os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash"),
    }


@router.post("")
async def image_edit(
    prompt: str = Form(""),
    mode: str = Form(""),
    lang: str = Form(""),
    images: list[UploadFile] = File(default=[]),
):
    key = _api_key()
    if not key:
        raise HTTPException(503, "GEMINI_API_KEY is not set on the Stooorna Ai service")

    settings = get_settings()
    limit = settings.max_upload_mb * 1024 * 1024
    parts: list[dict[str, Any]] = []
    for f in images[:MAX_IMAGES]:
        if not (f.content_type or "").startswith("image/"):
            continue
        raw = await f.read()
        if not raw:
            continue
        if len(raw) > limit:
            raise HTTPException(413, f"Image too large (max {settings.max_upload_mb}MB)")
        parts.append({"inline_data": {"mime_type": f.content_type, "data": base64.b64encode(raw).decode()}})
    if not parts:
        raise HTTPException(400, "No image uploaded")

    prompt = (prompt or "").strip()
    ar = (lang == "ar") if lang else bool(AR_RE.search(prompt))
    mode = mode if mode in ("edit", "understand") else ("edit" if prompt and EDIT_RE.search(prompt) else "understand")

    try:
        if mode == "edit":
            model = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
            instruction = (
                f'Edit the attached image according to this request: "{prompt}". '
                "Keep the same people, faces, identity, pose, lighting, background and every other detail "
                "exactly as in the original; change only what was requested. Return the edited image."
            )
            data = await _gemini(
                model,
                key,
                {
                    "contents": [{"role": "user", "parts": [{"text": instruction}, *parts]}],
                    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
                },
            )
            text, img, blocked = _read_parts(data)
            if img:
                return {
                    "reply": text or ("تفضل، هذي الصورة بعد التعديل." if ar else "Here is your edited image."),
                    "image_base64": img["data"],
                    "image_mime": img["mime"],
                }
            if text:
                return {"reply": text}
            if blocked:
                return {
                    "reply": "ما قدرت أعدل هذي الصورة لأسباب تتعلق بالسلامة. جرب صورة أو طلب ثاني."
                    if ar
                    else "I could not edit this image for safety reasons. Try another photo or request."
                }
            return {
                "reply": "ما قدرت أطلع صورة معدلة هالمرة. جرب توضح الطلب أكثر."
                if ar
                else "No edited image came back this time. Try describing the change more clearly."
            }

        model = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
        data = await _gemini(
            model,
            key,
            {
                "systemInstruction": {
                    "parts": [
                        {
                            "text": "You are Stooorna Ai, the assistant inside the Stooorna social app. "
                            "Look carefully at the attached image(s) and answer the user. "
                            "Reply in the same language and dialect the user writes in (Arabic users get Arabic). "
                            "Be clear and concise. If text is visible in the image and the user asks, read or translate it."
                        }
                    ]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt or ("صف لي هذه الصورة." if ar else "Describe this image.")}, *parts],
                    }
                ],
            },
        )
        text, _img, _blocked = _read_parts(data)
        return {"reply": text or ("ما قدرت أفهم الصورة، جرب مرة ثانية." if ar else "I could not read this image, please try again.")}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Image error: {e}") from e
