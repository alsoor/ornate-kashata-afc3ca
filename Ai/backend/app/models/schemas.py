"""Request / response models for Stooorna Ai API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)
    history: list[ChatMessage] = Field(default_factory=list)
    provider: Optional[Literal["openai", "gemini", "ollama"]] = None
    model: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    use_rag: bool = False
    collection: str = "default"


class ChatResponse(BaseModel):
    reply: str
    provider: str
    model: str
    usage: dict[str, Any] = Field(default_factory=dict)


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    collection: str = "default"
    metadata: list[dict[str, Any]] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    ids: list[str]
    collection: str
    count: int


class SearchRequest(BaseModel):
    query: str
    collection: str = "default"
    top_k: int = Field(default=5, ge=1, le=50)


class SearchHit(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    hits: list[SearchHit]


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    llm_provider: str
    vector_store: str
    tools: dict[str, bool]


class ImageGenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    provider: Optional[Literal["openai", "gemini"]] = None
    size: str = "1024x1024"


class ImageGenResponse(BaseModel):
    url: Optional[str] = None
    b64: Optional[str] = None
    provider: str
    note: str = ""
