"""Extra abilities for Stooorna Ai (all through Gemini REST, nothing new to install).

POST /ai/search          {query, lang}      -> {answer, results:[{title, snippet, url}]}   (Google Search grounding)
POST /ai/image-generate  {prompt}           -> {b64, image_mime, provider, note}           (Gemini image model)
POST /ai/transcribe      form: audio, lang  -> {text}                                      (voice -> text)
POST /ai/file-read       form: file         -> {text, name}                                (PDF / Word / text)

Env vars (same Railway service):
    GEMINI_API_KEY        required
    GEMINI_TEXT_MODEL     optional, default gemini-2.5-flash
    GEMINI_IMAGE_MODEL    optional, default gemini-2.5-flash-image
"""
from __future__ import annotations

import base64
import io
import os
import re
import zipfile
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.routers.image import _api_key, _gemini, _read_parts

router = APIRouter(tags=["extras"])

MAX_FILE_MB = 12
TEXT_MODEL = lambda: os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash")  # noqa: E731
IMAGE_MODEL = lambda: os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")  # noqa: E731


def _need_key() -> str:
    key = _api_key()
    if not key:
        raise HTTPException(503, "GEMINI_API_KEY is not set on the Stooorna Ai service")
    return key


# ------------------------------------------------------------------ web search
class WebSearchReq(BaseModel):
    query: str = Field(..., min_length=1, max_length=400)
    lang: str = "en"


@router.post("/search")
async def web_search(req: WebSearchReq):
    key = _need_key()
    ask = (
        "Search the web and answer briefly and accurately with the latest information. "
        + ("Answer in Arabic. " if req.lang == "ar" else "")
        + f"Question: {req.query}"
    )
    try:
        data = await _gemini(
            TEXT_MODEL(),
            key,
            {"contents": [{"role": "user", "parts": [{"text": ask}]}], "tools": [{"google_search": {}}]},
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Search error: {str(e)[:200]}") from e

    text, _img, _blocked = _read_parts(data)
    cand = (data.get("candidates") or [{}])[0]
    chunks = ((cand.get("groundingMetadata") or {}).get("groundingChunks")) or []
    results: list[dict[str, str]] = []
    for c in chunks[:5]:
        w = c.get("web") or {}
        if w.get("uri"):
            results.append({"title": w.get("title") or "", "snippet": "", "url": w["uri"]})
    return {"answer": text, "results": results}


# ------------------------------------------------------------------ image creation
class ImageGenReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)


@router.post("/image-generate")
async def image_generate(req: ImageGenReq):
    key = _need_key()
    try:
        data = await _gemini(
            IMAGE_MODEL(),
            key,
            {
                "contents": [{"role": "user", "parts": [{"text": f"Create an image: {req.prompt}"}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Image error: {str(e)[:200]}") from e
    text, img, blocked = _read_parts(data)
    if not img:
        raise HTTPException(422, "No image returned" + (f" (blocked: {blocked})" if blocked else ""))
    return {"b64": img["data"], "image_mime": img["mime"], "provider": "gemini", "note": text}


# ------------------------------------------------------------------ voice -> text
@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), lang: str = Form("")):
    key = _need_key()
    raw = await audio.read()
    if not raw:
        raise HTTPException(400, "Empty audio")
    if len(raw) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, "Audio too large")
    mime = (audio.content_type or "audio/webm").split(";")[0].strip() or "audio/webm"
    hint = "Arabic (Gulf dialect)" if lang.startswith("ar") else "the spoken language"
    prompt = f"Transcribe this audio exactly as spoken, in {hint}. Return only the transcript text, nothing else."
    try:
        data = await _gemini(
            TEXT_MODEL(),
            key,
            {"contents": [{"role": "user", "parts": [{"text": prompt}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(raw).decode()}}]}]},
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Transcribe error: {str(e)[:200]}") from e
    text, _img, _blocked = _read_parts(data)
    return {"text": text}


# ------------------------------------------------------------------ files (PDF / Word / text)
def _docx_text(raw: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        xml = z.read("word/document.xml").decode("utf8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab/>", "\t", xml)
    text = re.sub(r"<[^>]+>", "", xml)
    return re.sub(r"&amp;", "&", re.sub(r"&lt;", "<", re.sub(r"&gt;", ">", text))).strip()


@router.post("/file-read")
async def file_read(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {MAX_FILE_MB}MB)")
    name = file.filename or "file"
    low = name.lower()
    if low.endswith(".docx"):
        try:
            return {"name": name, "text": _docx_text(raw)[:60000]}
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"Cannot read Word file: {e}") from e
    if low.endswith(".pdf") or (file.content_type or "") == "application/pdf":
        key = _need_key()
        try:
            data = await _gemini(
                TEXT_MODEL(),
                key,
                {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"text": "Extract all the text of this PDF as plain text, keep the order. Return only the text."},
                                {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(raw).decode()}},
                            ],
                        }
                    ]
                },
            )
        except Exception as e:  # noqa: BLE001
            raise HTTPException(502, f"PDF error: {str(e)[:200]}") from e
        text, _img, _blocked = _read_parts(data)
        return {"name": name, "text": text[:60000]}
    try:
        return {"name": name, "text": raw.decode("utf8", "ignore")[:60000]}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Unsupported file: {e}") from e
