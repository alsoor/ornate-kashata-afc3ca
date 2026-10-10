"""Chat + RAG endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.schemas import ChatRequest, ChatResponse
from app.services import llm, vectors

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
    try:
        result = await llm.chat_completion(
            message=message,
            history=history,
            settings=settings,
            provider=req.provider,
            model=req.model,
            temperature=req.temperature,
        )
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}") from e

    return ChatResponse(
        reply=result["reply"],
        provider=result["provider"],
        model=result["model"],
        usage=result.get("usage") or {},
    )
