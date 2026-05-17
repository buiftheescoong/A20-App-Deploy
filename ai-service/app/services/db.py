"""Shared asyncpg pool helpers for AI-service database access."""

from __future__ import annotations

import asyncio
from typing import Optional

import asyncpg
import structlog

from app.config import settings

logger = structlog.get_logger()

_pool: Optional[asyncpg.Pool] = None
_pool_lock = asyncio.Lock()


def database_url() -> str:
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql+asyncpg://"):
        return db_url.replace("postgresql+asyncpg://", "postgresql://")
    return db_url


async def get_db_pool() -> Optional[asyncpg.Pool]:
    """Return a lazily-created shared DB pool, or None when DB is disabled."""
    global _pool

    if not settings.DATABASE_URL:
        return None
    if _pool is not None:
        return _pool

    async with _pool_lock:
        if _pool is not None:
            return _pool

        _pool = await asyncpg.create_pool(
            database_url(),
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT_SECONDS,
        )
        logger.info(
            "db.pool.created",
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
        )
        return _pool


async def close_db_pool() -> None:
    """Close the shared DB pool during app shutdown."""
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None
    logger.info("db.pool.closed")
