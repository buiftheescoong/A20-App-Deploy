"""
Configuration module — loads environment variables for the application.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

    # OpenAI
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Gemini (fallback model)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # LLM Model Configuration
    PRIMARY_MODEL: str = os.getenv("PRIMARY_MODEL", "gpt-4o")
    FALLBACK_MODEL: str = os.getenv("FALLBACK_MODEL", "gemini-1.5-pro")
    CHEAP_MODEL: str = os.getenv("CHEAP_MODEL", "gpt-4o-mini")

    # Pipeline Configuration
    MAX_ITERATIONS: int = int(os.getenv("MAX_ITERATIONS", "1"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "2"))
    GENERATION_TIMEOUT_SECONDS: int = int(os.getenv("GENERATION_TIMEOUT_SECONDS", "180"))
    RAG_CONFIDENCE_THRESHOLD: float = float(os.getenv("RAG_CONFIDENCE_THRESHOLD", "0.6"))

    # Server
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")

    # Blank template
    BLANK_TEMPLATE_PATH: str = os.getenv(
        "BLANK_TEMPLATE_PATH", "assets/blank_template.docx"
    )


settings = Settings()
