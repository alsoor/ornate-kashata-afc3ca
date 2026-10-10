"""LLM providers: OpenAI · Gemini · Ollama (LangChain wrappers)."""
from __future__ import annotations

from typing import Any

from app.core.config import Settings


def _system_prompt() -> str:
    return (
        "You are Stooorna Ai — a helpful assistant inside the Stooorna app. "
        "Answer clearly. Prefer Arabic when the user writes in Arabic. "
        "You can help with text, tables, ideas, and app-related questions."
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

    messages = [{"role": "system", "content": _system_prompt()}]
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


async def _openai(messages, model, temperature, settings: Settings) -> dict[str, Any]:
    from openai import AsyncOpenAI

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
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
    resp = gmodel.generate_content(
        prompt,
        generation_config={"temperature": temperature},
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
