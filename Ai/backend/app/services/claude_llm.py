"""Claude (Anthropic) provider for Stooorna Ai.

Standalone: uses httpx (already installed with openai) and the ANTHROPIC_API_KEY env var.
Optional env vars:
  CLAUDE_MODEL         (default: claude-haiku-5-5)
  AI_PRIMARY_PROVIDER  (set to "claude" to try Claude before Gemini)
  CLAUDE_MAX_TOKENS    (default: 4096 — long reports / big tables need room)
"""
from __future__ import annotations

import os
from typing import Any

import httpx

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
DEFAULT_MODEL = "claude-haiku-5-5"

SYSTEM_PROMPT = (
    "You are Stooorna Ai, the friendly assistant inside the Stooorna social app. "
    "LANGUAGE: always answer in the same language and dialect the user writes in "
    "(Arabic users usually write Gulf Arabic: answer in simple, natural Arabic, not stiff formal Arabic). "
    "STYLE: be clear, direct and useful. Short questions get short answers; reports, plans and comparisons get a complete, well-organised answer. "
    "Do not repeat your own name unless the user asks who you are, and do not open with filler like 'Of course!'. "
    "FORMAT: write plain text that reads well on a phone. Use short paragraphs. Use simple numbered lines or '-' bullets for steps. "
    "Do not use HTML, and avoid heavy Markdown (no headings with #, no code fences) unless the user asks for code. "
    "TABLES: when the user asks for a table, a comparison, a schedule, a report with figures, or when the data is naturally rows and columns, "
    "answer with ONE Markdown table: a header row, then a separator row like | --- | --- |, then one row per item, same number of cells in every row. "
    "Keep each cell short (a few words), put units in the header, never put line breaks inside a cell, and write any intro or conclusion as normal text outside the table. "
    "For Arabic requests write the table headers in Arabic. "
    "REPORTS: put the key conclusion first, then the details; finish the whole answer, never stop mid-sentence. "
    "ACCURACY: if you are not sure, say so instead of guessing; never invent numbers, links or sources. "
    "If the message contains web search results or file contents, base your answer on them and mention the source link when there is one. "
    "If the message contains a device date and time, use it only when the user asks about time or date."
)


def _max_tokens() -> int:
    try:
        return max(256, min(8192, int(os.getenv("CLAUDE_MAX_TOKENS") or 4096)))
    except ValueError:
        return 4096


def api_key() -> str:
    return (os.getenv("ANTHROPIC_API_KEY") or "").strip()


def available() -> bool:
    return bool(api_key())


def primary_is_claude() -> bool:
    return (os.getenv("AI_PRIMARY_PROVIDER") or "").strip().lower() in ("claude", "anthropic")


def _clean_history(history: list[dict[str, str]], message: str) -> list[dict[str, str]]:
    """Claude needs: starts with 'user', roles alternate, no empty text."""
    msgs: list[dict[str, str]] = []
    for m in history or []:
        role = "assistant" if m.get("role") in ("assistant", "model", "ai") else "user"
        text = str(m.get("content") or "").strip()
        if not text:
            continue
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + text
        else:
            msgs.append({"role": role, "content": text})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    if msgs and msgs[-1]["role"] == "user":
        msgs[-1]["content"] += "\n" + message
    else:
        msgs.append({"role": "user", "content": message})
    return msgs


async def chat_completion(
    message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    temperature: float | None = None,
    timeout: float = 85.0,  # was 40: long reports / tables need more time
) -> dict[str, Any]:
    key = api_key()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    use_model = (model if model and model.lower().startswith("claude") else None) or os.getenv("CLAUDE_MODEL") or DEFAULT_MODEL
    body: dict[str, Any] = {
        "model": use_model,
        "max_tokens": _max_tokens(),
        "system": SYSTEM_PROMPT,
        "messages": _clean_history(history or [], message),
    }
    if temperature is not None:
        body["temperature"] = max(0.0, min(1.0, float(temperature)))

    headers = {"x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=10.0)) as client:
        r = await client.post(API_URL, headers=headers, json=body)
    if r.status_code >= 400:
        raise RuntimeError(f"Claude HTTP {r.status_code}: {r.text[:300]}")

    data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if not text:
        raise RuntimeError("Claude returned an empty reply")
    usage = data.get("usage") or {}
    return {
        "reply": text,
        "provider": "claude",
        "model": data.get("model", use_model),
        "usage": {"input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0)},
    }
