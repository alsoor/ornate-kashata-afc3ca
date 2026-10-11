"""Chat + RAG endpoints."""
from __future__ import annotations

import asyncio  # CLAUDE

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.schemas import ChatRequest, ChatResponse
from app.services import llm, vectors
from app.services import claude_llm  # CLAUDE: second provider

router = APIRouter(prefix="/chat", tags=["chat"])


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

    async def _claude():
        return await claude_llm.chat_completion(
            message=message,
            history=history,
            model=req.model,
            temperature=req.temperature,
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
            timeout=25,
        )

    order = [("Claude", _claude), ("LLM", _gemini)] if want_claude else [("LLM", _gemini), ("Claude", _claude)]
    for name, fn in order:
        if name == "Claude" and not claude_llm.available():
            continue
        try:
            result = await fn()
            break
        except asyncio.TimeoutError:
            errors.append(f"{name} timeout")
        except Exception as e:
            errors.append(f"{name} error: {e}")
    if result is None:
        raise HTTPException(502, " | ".join(errors) or "LLM error")

    return ChatResponse(
        reply=result["reply"],
        provider=result["provider"],
        model=result["model"],
        usage=result.get("usage") or {},
    )
