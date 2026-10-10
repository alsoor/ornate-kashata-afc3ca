"""Vector store: Chroma (default) · Pinecone · in-memory fallback."""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any

from app.core.config import Settings

_memory: dict[str, list[dict[str, Any]]] = {}


def _id_for(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


async def embed_texts(texts: list[str], settings: Settings) -> list[list[float]]:
    """Return embeddings for a list of texts."""
    provider = settings.embedding_provider
    if provider == "openai":
        return await _embed_openai(texts, settings)
    if provider == "ollama":
        return await _embed_ollama(texts, settings)
    if provider == "huggingface":
        return _embed_hf(texts, settings)
    raise ValueError(f"Unknown embedding provider: {provider}")


async def _embed_openai(texts: list[str], settings: Settings) -> list[list[float]]:
    from openai import AsyncOpenAI

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in resp.data]


async def _embed_ollama(texts: list[str], settings: Settings) -> list[list[float]]:
    import httpx

    out: list[list[float]] = []
    async with httpx.AsyncClient(base_url=settings.ollama_base_url, timeout=120.0) as client:
        for t in texts:
            r = await client.post(
                "/api/embeddings",
                json={"model": settings.embedding_model, "prompt": t},
            )
            r.raise_for_status()
            out.append(r.json()["embedding"])
    return out


def _embed_hf(texts: list[str], settings: Settings) -> list[list[float]]:
    from sentence_transformers import SentenceTransformer

    model_name = settings.embedding_model or "sentence-transformers/all-MiniLM-L6-v2"
    model = SentenceTransformer(model_name)
    vectors = model.encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in vectors]


async def upsert(
    texts: list[str],
    *,
    collection: str,
    metadata: list[dict[str, Any]] | None,
    settings: Settings,
) -> list[str]:
    meta = metadata or [{} for _ in texts]
    while len(meta) < len(texts):
        meta.append({})
    ids = [str(uuid.uuid4()) for _ in texts]
    vectors = await embed_texts(texts, settings)

    store = settings.vector_store
    if store == "chroma":
        _chroma_upsert(collection, ids, texts, vectors, meta, settings)
    elif store == "pinecone":
        _pinecone_upsert(collection, ids, texts, vectors, meta, settings)
    else:
        bucket = _memory.setdefault(collection, [])
        for i, t, v, m in zip(ids, texts, vectors, meta):
            bucket.append({"id": i, "text": t, "vector": v, "metadata": m})
    return ids


async def search(
    query: str,
    *,
    collection: str,
    top_k: int,
    settings: Settings,
) -> list[dict[str, Any]]:
    qv = (await embed_texts([query], settings))[0]
    store = settings.vector_store
    if store == "chroma":
        return _chroma_search(collection, qv, top_k, settings)
    if store == "pinecone":
        return _pinecone_search(collection, qv, top_k, settings)
    return _memory_search(collection, qv, top_k)


def _chroma_client(settings: Settings):
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=settings.chroma_path,
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def _chroma_upsert(collection, ids, texts, vectors, meta, settings: Settings):
    client = _chroma_client(settings)
    col = client.get_or_create_collection(collection)
    col.upsert(ids=ids, documents=texts, embeddings=vectors, metadatas=meta)


def _chroma_search(collection, qv, top_k, settings: Settings) -> list[dict[str, Any]]:
    client = _chroma_client(settings)
    try:
        col = client.get_collection(collection)
    except Exception:
        return []
    res = col.query(query_embeddings=[qv], n_results=top_k)
    hits = []
    docs = (res.get("documents") or [[]])[0]
    ids = (res.get("ids") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    for i, doc, meta, dist in zip(ids, docs, metas, dists):
        score = 1.0 / (1.0 + float(dist)) if dist is not None else 0.0
        hits.append({"id": i, "text": doc or "", "score": score, "metadata": meta or {}})
    return hits


def _pinecone_upsert(collection, ids, texts, vectors, meta, settings: Settings):
    from pinecone import Pinecone

    if not settings.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY is not set")
    pc = Pinecone(api_key=settings.pinecone_api_key)
    index = pc.Index(settings.pinecone_index)
    vectors_payload = [
        {"id": i, "values": v, "metadata": {**(m or {}), "text": t, "collection": collection}}
        for i, t, v, m in zip(ids, texts, vectors, meta)
    ]
    index.upsert(vectors=vectors_payload, namespace=collection)


def _pinecone_search(collection, qv, top_k, settings: Settings) -> list[dict[str, Any]]:
    from pinecone import Pinecone

    if not settings.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY is not set")
    pc = Pinecone(api_key=settings.pinecone_api_key)
    index = pc.Index(settings.pinecone_index)
    res = index.query(vector=qv, top_k=top_k, namespace=collection, include_metadata=True)
    hits = []
    for m in res.get("matches") or []:
        md = m.get("metadata") or {}
        hits.append(
            {
                "id": m.get("id", ""),
                "text": md.get("text", ""),
                "score": float(m.get("score") or 0),
                "metadata": md,
            }
        )
    return hits


def _memory_search(collection: str, qv: list[float], top_k: int) -> list[dict[str, Any]]:
    import math

    bucket = _memory.get(collection) or []
    scored = []
    for item in bucket:
        v = item["vector"]
        # cosine similarity
        dot = sum(a * b for a, b in zip(qv, v))
        na = math.sqrt(sum(a * a for a in qv)) or 1.0
        nb = math.sqrt(sum(b * b for b in v)) or 1.0
        scored.append((dot / (na * nb), item))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "id": item["id"],
            "text": item["text"],
            "score": float(score),
            "metadata": item.get("metadata") or {},
        }
        for score, item in scored[:top_k]
    ]
