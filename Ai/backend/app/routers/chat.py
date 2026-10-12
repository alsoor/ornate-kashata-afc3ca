"""Chat + RAG endpoints."""
from __future__ import annotations

import asyncio  # CLAUDE
import logging  # CLAUDE
import os
import time

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.schemas import ChatRequest, ChatResponse
from app.services import llm, vectors
from app.services import claude_llm  # CLAUDE: second provider

router = APIRouter(prefix="/chat", tags=["chat"])
log = logging.getLogger("stooorna.ai")  # CLAUDE


@router.get("/claude-check")  # CLAUDE: shows the real reason when Claude does not answer
async def claude_check():
    key = claude_llm.api_key()
    info = {"key_set": bool(key), "key_looks_valid": key.startswith("sk-ant-"), "key_length": len(key)}
    if not key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY is not set on this service", **info}
    try:
        r = await claude_llm.chat_completion("Reply with the single word OK", None, timeout=20)
        return {"ok": True, "model": r["model"], "reply": r["reply"], **info}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:400], **info}


@router.get("/gemini-check")  # DIAGNOSTIC: shows the real reason when the main model (Gemini) does not answer
async def gemini_check():
    settings = get_settings()
    info = {"provider": settings.llm_provider, "model": llm._default_model(settings, settings.llm_provider.lower())}
    try:
        r = await asyncio.wait_for(
            llm.chat_completion(message="Reply with the single word OK", history=[], settings=settings, temperature=0),
            timeout=25,
        )
        return {"ok": True, "reply": (r.get("reply") or "")[:100], **info}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "no answer after 25s (check the key, quota and model name)", **info}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:400], **info}


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    settings = get_settings()
    message = req.message.strip()
    if not message:
        raise HTTPException(400, "Empty message")

    # Optional RAG context
    if req.use_rag:
        try:
            hits = await vectors.search(
                message,
                collection=req.collection,
                top_k=5,
                settings=settings,
            )
            if hits:
                ctx = "\n\n".join(f"- {h['text']}" for h in hits)
                message = (
                    f"Use the following context if relevant:\n{ctx}\n\n"
                    f"User question: {req.message}"
                )
        except Exception as e:
            # RAG failure should not block chat
            message = f"{req.message}\n\n(Note: RAG unavailable: {e})"

    history = [{"role": m.role, "content": m.content} for m in req.history]
    # CLAUDE: Gemini is the main provider; Claude is the automatic backup (or the main one if asked).
    want_claude = (
        (getattr(req, "provider", None) or "").lower() in ("claude", "anthropic")
        or claude_llm.primary_is_claude()
    )
    result = None
    errors: list[str] = []

    # TIMEOUT: one total budget for the whole reply (default 85s, just under the app's 90s abort).
    # The first provider gets most of it; if it fails, the backup gets whatever time is left.
    try:
        total_budget = max(30.0, float(os.getenv("AI_TOTAL_TIMEOUT") or 85))
    except ValueError:
        total_budget = 85.0
    # The first provider gets only a short window when a backup exists, so a stuck provider
    # never leaves the user waiting: after AI_PRIMARY_TIMEOUT seconds (default 30) the backup takes over
    # and gets all the remaining time (long reports / tables).
    try:
        primary_cap = max(10.0, float(os.getenv("AI_PRIMARY_TIMEOUT") or 30))
    except ValueError:
        primary_cap = 30.0
    started = time.monotonic()

    def _left() -> float:
        return max(5.0, total_budget - (time.monotonic() - started))

    async def _claude():
        return await claude_llm.chat_completion(
            message=message,
            history=history,
            model=req.model,
            temperature=req.temperature,
            timeout=_left(),
        )

    async def _gemini():
        return await asyncio.wait_for(
            llm.chat_completion(
                message=message,
                history=history,
                settings=settings,
                provider=None if (req.provider or "").lower() in ("claude", "anthropic") else req.provider,
                model=None if (req.model or "").lower().startswith("claude") else req.model,
                temperature=req.temperature,
            ),
            timeout=_left() if not claude_llm.available() else min(_left(), primary_cap),
        )  # was a fixed 25s: long reports timed out

    order = [("Claude", _claude), ("LLM", _gemini)] if want_claude else [("LLM", _gemini), ("Claude", _claude)]
    for name, fn in order:
        if name == "Claude" and not claude_llm.available():
            continue
        if result is None and (time.monotonic() - started) >= total_budget - 5:
            errors.append("time budget used up")
            break  # no time left for another attempt
        try:
            result = await fn()
            break
        except asyncio.TimeoutError:
            errors.append(f"{name} timeout")
        except Exception as e:
            errors.append(f"{name} error: {e}")
            log.warning("[Stooorna Ai] %s failed: %s", name, e)  # CLAUDE
    if result is None:
        raise HTTPException(502, " | ".join(errors) or "LLM error")

    return ChatResponse(
        reply=result["reply"],
        provider=result["provider"],
        model=result["model"],
        usage=result.get("usage") or {},
    )
