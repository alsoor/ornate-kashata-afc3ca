"""Embed + search (Chroma / Pinecone)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.models.schemas import (
    EmbedRequest,
    EmbedResponse,
    SearchHit,
    SearchRequest,
    SearchResponse,
)
from app.services import vectors

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    settings = get_settings()
    if not req.texts:
        raise HTTPException(400, "No texts")
    try:
        ids = await vectors.upsert(
            req.texts,
            collection=req.collection,
            metadata=req.metadata or None,
            settings=settings,
        )
    except Exception as e:
        raise HTTPException(502, f"Embed error: {e}") from e
    return EmbedResponse(ids=ids, collection=req.collection, count=len(ids))


@router.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    settings = get_settings()
    try:
        hits = await vectors.search(
            req.query,
            collection=req.collection,
            top_k=req.top_k,
            settings=settings,
        )
    except Exception as e:
        raise HTTPException(502, f"Search error: {e}") from e
    return SearchResponse(
        hits=[
            SearchHit(
                id=h["id"],
                text=h["text"],
                score=h["score"],
                metadata=h.get("metadata") or {},
            )
            for h in hits
        ]
    )
