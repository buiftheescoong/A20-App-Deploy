"""
Application configuration using Pydantic BaseSettings.
Loads from .env file and environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """AI Service configuration."""

    # --- AI Models ---
    PRIMARY_MODEL: str = "gemini-2.5-flash"
    CHEAP_MODEL: str = "gpt-4o"
    FALLBACK_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # --- API Keys ---
    OPENAI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    LANGSMITH_API_KEY: str = ""

    # --- Database ---
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # --- Pipeline Config ---
    MAX_ITERATIONS: int = 2
    RAG_TOP_K: int = 5
    RAG_VECTOR_CANDIDATES: int = 20
    RAG_MIN_SCORE: float = 0.35
    RAG_DIVERSITY_PER_SOURCE: int = 2
    RAG_CONTEXT_MAX_CHARS: int = 12000
    RAG_CHUNK_MAX_CHARS: int = 3500
    RAG_CACHE_TTL_SECONDS: int = 600
    RAG_SEARCH_CACHE_SIZE: int = 128
    MAX_FILE_SIZE_DIRECT: int = 2000  # chars, above → RAG chunking
    FILE_PARSE_CONCURRENCY: int = 4

    # --- LLM Runtime ---
    LLM_TIMEOUT_SECONDS: int = 180
    LLM_RETRY_COUNT: int = 3
    LLM_RETRY_BASE_DELAY_SECONDS: int = 5
    GENERATION_TEMPERATURE: float = 0.65
    REPAIR_TEMPERATURE: float = 0.35
    STRUCTURED_OUTPUT_TEMPERATURE: float = 0.1

    # --- Database Pool ---
    DB_POOL_MIN_SIZE: int = 1
    DB_POOL_MAX_SIZE: int = 5
    DB_COMMAND_TIMEOUT_SECONDS: int = 60

    # --- Raw RAG indexing ---
    RAW_RAG_AUTO_INDEX: bool = False
    RAW_RAG_DATA_DIR: str = ""
    RAW_RAG_INDEX_INTERVAL_SECONDS: int = 600
    RAW_RAG_CHUNK_SIZE: int = 1800
    RAW_RAG_CHUNK_OVERLAP: int = 180
    RAW_RAG_CHUNK_VERSION: str = "heading-v2"
    RAW_RAG_INDEX_MAINTENANCE_WORK_MEM: str = "128MB"

    # --- Tracing ---
    LANGSMITH_PROJECT: str = "giao-an-thong-minh"
    LANGSMITH_TRACING: bool = True

    # --- LangChain env vars (auto-set for LangSmith) ---
    LANGCHAIN_TRACING_V2: bool = True
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = "giao-an-thong-minh"

    # --- Internal Auth ---
    # Shared secret between API Gateway and AI Service.
    # Empty string = auth disabled (development mode).
    AI_SERVICE_SECRET: str = ""

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


# Singleton instance
settings = Settings()
