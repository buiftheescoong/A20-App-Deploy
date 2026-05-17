"""
FastAPI entry point for AI Service — Giáo Án Thông Minh V2.

Responsibilities:
- LangGraph orchestration (4 nodes)
- LLM calls (OpenAI, Gemini)
- RAG: embedding + vector search
- Streaming chunks via SSE
- Structured logging + LangSmith tracing

Port: 8000
"""

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging.setup import setup_logging

# Configure structured logging BEFORE any logger creation
setup_logging()

import structlog
from app.logging.middleware import RequestTracingMiddleware
from app.middleware.auth import AIServiceAuthMiddleware
from app.api.health import router as health_router
from app.api.generate import router as generate_router, cleanup_expired_states
from app.api.stream import router as stream_router
from app.api.chat import router as chat_router
from app.api.embed import router as embed_router
from app.api.quality_check import router as quality_check_router
from app.api.docx import router as docx_router


# Set LangSmith env vars before any LangChain imports
os.environ.setdefault("LANGCHAIN_TRACING_V2", str(settings.LANGCHAIN_TRACING_V2).lower())
os.environ.setdefault("LANGCHAIN_API_KEY", settings.LANGSMITH_API_KEY or settings.LANGCHAIN_API_KEY)
os.environ.setdefault("LANGCHAIN_PROJECT", settings.LANGCHAIN_PROJECT)


logger = structlog.get_logger()


async def _cleanup_loop() -> None:
    """Background task: run cleanup_expired_states every 10 minutes."""
    while True:
        await asyncio.sleep(600)
        try:
            cleanup_expired_states()
        except Exception:
            logger.exception("state_store.cleanup_error")


async def _raw_data_ingest_loop() -> None:
    """Background task: index new or changed Markdown files from data/raw."""
    from app.services.raw_data_ingestor import raw_data_ingestor

    while True:
        try:
            await raw_data_ingestor.ingest_once()
        except Exception:
            logger.exception("raw_rag_ingest.loop_error")

        interval = settings.RAW_RAG_INDEX_INTERVAL_SECONDS
        if interval <= 0:
            return
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    # --- Startup ---
    logger.info(
        "app.startup",
        service="ai-service",
        version="2.0.0",
        primary_model=settings.PRIMARY_MODEL,
        tracing=settings.LANGSMITH_TRACING,
    )
    cleanup_task = asyncio.create_task(_cleanup_loop())
    raw_ingest_task = None
    if settings.RAW_RAG_AUTO_INDEX:
        raw_ingest_task = asyncio.create_task(_raw_data_ingest_loop())
    yield
    # --- Shutdown ---
    cleanup_task.cancel()
    if raw_ingest_task:
        raw_ingest_task.cancel()
    from app.services.db import close_db_pool

    await close_db_pool()
    logger.info("app.shutdown", service="ai-service")


app = FastAPI(
    title="Giáo Án Thông Minh V2 — AI Service",
    description="AI Service for generating lesson plans using LangGraph pipeline",
    version="2.0.0",
    lifespan=lifespan,
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    # Internal service only — accessible exclusively via API Gateway (not the public internet).
    # Browser-originated cross-origin requests never reach this service directly, so "*" is safe here.
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(AIServiceAuthMiddleware)

# --- Routers ---
app.include_router(health_router)
app.include_router(generate_router)
app.include_router(stream_router)
app.include_router(chat_router)
app.include_router(embed_router)
app.include_router(quality_check_router)
app.include_router(docx_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
