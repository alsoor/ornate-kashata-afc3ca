"""Health + available tools probe."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


def _can_import(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


@router.get("/health", response_model=HealthResponse)
async def health():
    s = get_settings()
    tools = {
        "fastapi": True,
        "numpy": _can_import("numpy"),
        "pandas": _can_import("pandas"),
        "torch": _can_import("torch"),
        "tensorflow": _can_import("tensorflow"),
        "langchain": _can_import("langchain"),
        "llama_index": _can_import("llama_index"),
        "openai": _can_import("openai"),
        "google.generativeai": _can_import("google.generativeai"),
        "ollama": _can_import("ollama"),
        "chromadb": _can_import("chromadb"),
        "pinecone": _can_import("pinecone"),
        "transformers": _can_import("transformers"),
        "huggingface_hub": _can_import("huggingface_hub"),
    }
    return HealthResponse(
        status="ok",
        app=s.app_name,
        version=s.app_version,
        llm_provider=s.llm_provider,
        vector_store=s.vector_store,
        tools=tools,
    )
