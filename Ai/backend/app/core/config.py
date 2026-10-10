"""Stooorna Ai — independent settings (env-driven)."""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Ai/ root (backend/app/core -> ../../../)
AI_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = AI_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(AI_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "Stooorna Ai"
    app_version: str = "1.0.0"
    debug: bool = False
    api_prefix: str = "/ai"

    # CORS — allow Stooorna web app
    cors_origins: str = "http://localhost:3000,http://localhost:5173,https://stooorna.com"

    # Default LLM provider: openai | gemini | ollama
    llm_provider: Literal["openai", "gemini", "ollama"] = "ollama"
    llm_model: str = "llama3.2"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # Ollama (local)
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"

    # Embeddings
    embedding_provider: Literal["openai", "ollama", "huggingface"] = "ollama"
    embedding_model: str = "nomic-embed-text"

    # Vector store: chroma | pinecone | memory
    vector_store: Literal["chroma", "pinecone", "memory"] = "chroma"
    chroma_path: str = str(DATA_DIR / "chroma")
    pinecone_api_key: str = ""
    pinecone_index: str = "stooorna-ai"
    pinecone_cloud: str = "aws"
    pinecone_region: str = "us-east-1"

    # Hugging Face
    hf_token: str = ""
    hf_home: str = str(DATA_DIR / "huggingface")

    # Uploads
    upload_dir: str = str(DATA_DIR / "uploads")
    max_upload_mb: int = 25

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
