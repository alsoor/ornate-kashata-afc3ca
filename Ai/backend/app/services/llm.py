"""LLM providers: OpenAI · Gemini · Ollama (LangChain wrappers)."""
from __future__ import annotations

import asyncio  # NON-BLOCKING
import os
from typing import Any

from app.core.config import Settings
from app.services.persona import EXTRA_PROMPT  # PERSONA: smart assistant brain (added)


def _system_prompt() -> str:
    return (
        "You are Stooorna Ai, the friendly assistant inside the Stooorna app. "
        "Answer in the same language and dialect the user writes in; for Arabic users write simple, natural Gulf-style Arabic. "
        "Be clear, direct and useful: short questions get short answers, reports and comparisons get a complete, well-organised answer. "
        "Do not repeat your name unless asked and do not open with filler. "
        "Write plain text that reads well on a phone; no HTML and no code fences unless the user asks for code. "
        "When the user asks for a table, comparison, schedule or report with figures, answer with ONE Markdown table: "
        "a header row, a separator row like | --- | --- |, then one row per item with the same number of cells in every row. "
        "Keep cells short, no line breaks inside a cell, and put any intro or conclusion as normal text outside the table. "
        "For reports give the key conclusion first, then the details, and always finish the whole answer. "
        "If you are not sure, say so; never invent numbers, links or sources. "
        "If the message contains web search results or file contents, base the answer on them and mention the source link when there is one."
    )


async def chat_completion(
    *,
    message: str,
    history: list[dict[str, str]],
    settings: Settings,
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
) -> dict[str, Any]:
    provider = (provider or settings.llm_provider).lower()
    model = model or _default_model(settings, provider)

    messages = [{"role": "system", "content": _system_prompt() + EXTRA_PROMPT}]  # PERSONA
    for m in history[-20:]:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": message})

    if provider == "openai":
        return await _openai(messages, model, temperature, settings)
    if provider == "gemini":
        return await _gemini(messages, model, temperature, settings)
    if provider == "ollama":
        return await _ollama(messages, model, temperature, settings)
    raise ValueError(f"Unknown provider: {provider}")


def _default_model(settings: Settings, provider: str) -> str:
    if provider == "openai":
        return settings.openai_model
    if provider == "gemini":
        return settings.gemini_model
    return settings.ollama_model or settings.llm_model


def _read_timeout() -> float:
    """Seconds the model may take to answer (reports / tables). Env: AI_READ_TIMEOUT, default 80."""
    try:
        return max(20.0, float(os.getenv("AI_READ_TIMEOUT") or 80))
    except ValueError:
        return 80.0


def _max_tokens() -> int:
    try:
        return max(256, min(8192, int(os.getenv("AI_MAX_TOKENS") or 4096)))
    except ValueError:
        return 4096


async def _openai(messages, model, temperature, settings: Settings) -> dict[str, Any]:
    from openai import AsyncOpenAI

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=_max_tokens(),
        timeout=_read_timeout(),
    )
    choice = resp.choices[0].message.content or ""
    usage = {}
    if resp.usage:
        usage = {
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
            "total_tokens": resp.usage.total_tokens,
        }
    return {"reply": choice, "provider": "openai", "model": model, "usage": usage}


async def _gemini(messages, model, temperature, settings: Settings) -> dict[str, Any]:
    import google.generativeai as genai

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    genai.configure(api_key=settings.gemini_api_key)

    # Flatten chat history for Gemini
    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    parts = []
    for m in messages:
        if m["role"] == "system":
            continue
        prefix = "User" if m["role"] == "user" else "Assistant"
        parts.append(f"{prefix}: {m['content']}")
    prompt = (system + "\n\n" if system else "") + "\n".join(parts) + "\nAssistant:"

    gmodel = genai.GenerativeModel(model)
    # NON-BLOCKING: the SDK call is synchronous; running it in a thread keeps the whole server responsive
    resp = await asyncio.to_thread(
        gmodel.generate_content,
        prompt,
        generation_config={"temperature": temperature, "max_output_tokens": _max_tokens()},  # was default cap: long reports were cut
        request_options={"timeout": _read_timeout()},  # was 30
    )
    text = getattr(resp, "text", None) or str(resp)
    return {"reply": text, "provider": "gemini", "model": model, "usage": {}}


async def _ollama(messages, model, temperature, settings: Settings) -> dict[str, Any]:
    import httpx

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(base_url=settings.ollama_base_url, timeout=120.0) as client:
        r = await client.post("/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
    reply = (data.get("message") or {}).get("content") or data.get("response") or ""
    return {"reply": reply, "provider": "ollama", "model": model, "usage": {}}
