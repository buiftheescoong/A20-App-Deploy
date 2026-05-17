"""
Embedding Service — OpenAI text-embedding-3-small wrapper.
Provides single and batch embedding, plus pgvector similarity search.
"""

import copy
import json
import re
import time
import unicodedata
from typing import Any, Optional

import structlog
from openai import AsyncOpenAI

from app.config import settings
from app.services.db import get_db_pool

logger = structlog.get_logger()


class EmbeddingService:
    """
    Embedding service using OpenAI text-embedding-3-small.
    Provides:
    - Single text embedding
    - Batch text embedding
    - pgvector similarity search (when DB is connected)
    """

    def __init__(self):
        if settings.OPENAI_API_KEY:
            self._client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=settings.LLM_TIMEOUT_SECONDS,
            )
        else:
            self._client = None
        self._query_embedding_cache: dict[str, tuple[float, list[float]]] = {}
        self._search_cache: dict[tuple[Any, ...], tuple[float, list[dict]]] = {}

    async def embed(self, text: str) -> list[float]:
        """Embed a single text string into a vector."""
        if not self._client:
            raise RuntimeError("OpenAI client not configured (missing OPENAI_API_KEY)")

        # Truncate very long texts to avoid token limits
        text = text[:8000] if len(text) > 8000 else text

        try:
            response = await self._client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=text,
            )
            embedding = response.data[0].embedding
            logger.debug(
                "embedding.single",
                text_length=len(text),
                vector_dim=len(embedding),
            )
            return embedding
        except Exception as e:
            logger.error("embedding.error", error=str(e), text_length=len(text))
            raise

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in a single API call."""
        if not self._client:
            raise RuntimeError("OpenAI client not configured (missing OPENAI_API_KEY)")

        if not texts:
            return []

        # Truncate each text
        truncated = [t[:8000] for t in texts]

        try:
            response = await self._client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=truncated,
            )
            embeddings = [item.embedding for item in response.data]
            logger.info(
                "embedding.batch",
                count=len(texts),
                vector_dim=len(embeddings[0]) if embeddings else 0,
            )
            return embeddings
        except Exception as e:
            logger.error("embedding.batch.error", error=str(e), count=len(texts))
            raise

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filter_subject: Optional[str] = None,
        filter_grade: Optional[str] = None,
        raw_only: bool = False,
        min_score: Optional[float] = None,
    ) -> list[dict]:
        """
        Search pgvector for similar chunks.
        Returns list of {text, source, score, resource_id}.

        Note: Requires DATABASE_URL to be configured and pgvector extension enabled.
        Falls back to empty results if DB is not available.
        """
        if not settings.DATABASE_URL:
            logger.info("embedding.search.skip", reason="no_database_url")
            return []

        try:
            cache_key = self._search_cache_key(
                query=query,
                top_k=top_k,
                filter_subject=filter_subject,
                filter_grade=filter_grade,
                raw_only=raw_only,
                min_score=min_score,
            )
            cached = self._get_search_cache(cache_key)
            if cached is not None:
                logger.info(
                    "embedding.search.cache_hit",
                    query_preview=query[:50],
                    results=len(cached),
                )
                return cached

            query_embedding = await self._embed_query_cached(query)
            pool = await get_db_pool()
            if pool is None:
                logger.info("embedding.search.skip", reason="no_database_pool")
                return []

            async with pool.acquire() as conn:
                where_clauses = []
                params = [str(query_embedding), top_k]
                param_idx = 3

                if filter_subject:
                    where_clauses.append(f"r.subject = ${param_idx}")
                    params.append(filter_subject)
                    param_idx += 1

                if filter_grade:
                    where_clauses.append(f"r.grade = ${param_idx}")
                    params.append(filter_grade)
                    param_idx += 1

                if raw_only:
                    where_clauses.append(
                        "(r.metadata->>'source' = 'data/raw' OR re.metadata->>'source' = 'data/raw')"
                    )

                if min_score is not None:
                    where_clauses.append(f"(1 - (re.embedding <=> $1::vector)) >= ${param_idx}")
                    params.append(min_score)
                    param_idx += 1

                where_sql = ""
                if where_clauses:
                    where_sql = "AND " + " AND ".join(where_clauses)

                sql = f"""
                    SELECT
                        re.chunk_text,
                        re.chunk_index,
                        re.resource_id,
                        COALESCE(re.metadata, '{{}}'::jsonb) AS chunk_metadata,
                        COALESCE(r.metadata, '{{}}'::jsonb) AS resource_metadata,
                        r.filename AS source,
                        r.subject,
                        r.grade,
                        r.category,
                        r.is_system,
                        1 - (re.embedding <=> $1::vector) AS score
                    FROM resource_embeddings re
                    JOIN resources r ON r.id = re.resource_id
                    WHERE COALESCE(r.is_embedded, false) = true {where_sql}
                    ORDER BY re.embedding <=> $1::vector
                    LIMIT $2
                """

                rows = await conn.fetch(sql, *params)

                results = []
                for row in rows:
                    chunk_metadata = _metadata_to_dict(row["chunk_metadata"])
                    resource_metadata = _metadata_to_dict(row["resource_metadata"])
                    metadata = {**resource_metadata, **chunk_metadata}
                    results.append({
                        "text": row["chunk_text"],
                        "source": row["source"],
                        "score": float(row["score"]),
                        "resource_id": str(row["resource_id"]),
                        "chunk_index": row["chunk_index"],
                        "subject": row["subject"],
                        "grade": row["grade"],
                        "category": row["category"],
                        "is_system": bool(row["is_system"]),
                        "metadata": metadata,
                    })

                logger.info(
                    "embedding.search.complete",
                    query_preview=query[:50],
                    results=len(results),
                    top_score=results[0]["score"] if results else 0,
                )
                self._set_search_cache(cache_key, results)
                return results

        except ImportError:
            logger.warning("embedding.search.skip", reason="asyncpg_not_installed")
            return []
        except Exception as e:
            logger.warning("embedding.search.error", error=str(e))
            return []

    async def _embed_query_cached(self, query: str) -> list[float]:
        key = _normalize_cache_text(query)
        now = time.monotonic()
        cached = self._query_embedding_cache.get(key)
        if cached and now - cached[0] <= settings.RAG_CACHE_TTL_SECONDS:
            return list(cached[1])

        embedding = await self.embed(query)
        self._query_embedding_cache[key] = (now, list(embedding))
        _trim_cache(self._query_embedding_cache, settings.RAG_SEARCH_CACHE_SIZE)
        return embedding

    def _search_cache_key(
        self,
        query: str,
        top_k: int,
        filter_subject: Optional[str],
        filter_grade: Optional[str],
        raw_only: bool,
        min_score: Optional[float],
    ) -> tuple[Any, ...]:
        return (
            _normalize_cache_text(query),
            top_k,
            _normalize_cache_text(filter_subject or ""),
            str(filter_grade or ""),
            raw_only,
            round(min_score, 4) if min_score is not None else None,
            settings.EMBEDDING_MODEL,
        )

    def _get_search_cache(self, key: tuple[Any, ...]) -> Optional[list[dict]]:
        cached = self._search_cache.get(key)
        if not cached:
            return None
        ts, value = cached
        if time.monotonic() - ts > settings.RAG_CACHE_TTL_SECONDS:
            self._search_cache.pop(key, None)
            return None
        return copy.deepcopy(value)

    def _set_search_cache(self, key: tuple[Any, ...], value: list[dict]) -> None:
        self._search_cache[key] = (time.monotonic(), copy.deepcopy(value))
        _trim_cache(self._search_cache, settings.RAG_SEARCH_CACHE_SIZE)


# Singleton instance
embedding_service = EmbeddingService()


def _metadata_to_dict(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    try:
        return dict(value)
    except Exception:
        return {}


def _normalize_cache_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text).lower()).replace("đ", "d")
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text))


def _trim_cache(cache: dict, max_size: int) -> None:
    while max_size > 0 and len(cache) > max_size:
        cache.pop(next(iter(cache)))
