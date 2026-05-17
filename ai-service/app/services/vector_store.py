"""
Vector Store service — pgvector search wrapper.
Provides high-level interface for embedding storage and similarity search.
"""

import json
import uuid
from typing import Any, Optional

import structlog

from app.config import settings
from app.services.db import get_db_pool
from app.services.embeddings import embedding_service

logger = structlog.get_logger()


class VectorStore:
    """
    Vector store backed by pgvector (PostgreSQL extension).
    Provides:
    - Store embeddings for resource chunks
    - Similarity search across stored embeddings
    - Bulk upsert for resource embedding
    """

    async def store_chunks(
        self,
        resource_id: str,
        chunks: list[str] | list[dict[str, Any]],
    ) -> int:
        """
        Embed and store text chunks for a resource.

        Args:
            resource_id: UUID of the resource
            chunks: List of text chunks to embed and store

        Returns:
            Number of chunks stored
        """
        if not settings.DATABASE_URL or not chunks:
            return 0

        try:
            chunk_payloads = [_coerce_chunk(chunk) for chunk in chunks]
            chunk_texts = [chunk["text"] for chunk in chunk_payloads]
            embeddings = await embedding_service.embed_batch(chunk_texts)

            pool = await get_db_pool()
            if pool is None:
                return 0

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """
                        ALTER TABLE resource_embeddings
                        ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb
                        """
                    )

                    # Delete existing chunks for this resource
                    await conn.execute(
                        "DELETE FROM resource_embeddings WHERE resource_id = $1::uuid",
                        resource_id,
                    )

                    # Insert new chunks
                    for i, (chunk, embedding) in enumerate(zip(chunk_payloads, embeddings)):
                        await conn.execute(
                            """
                            INSERT INTO resource_embeddings (
                                resource_id, chunk_index, chunk_text, embedding, metadata
                            )
                            VALUES ($1::uuid, $2, $3, $4::vector, $5::jsonb)
                            """,
                            resource_id,
                            i,
                            chunk["text"],
                            str(embedding),
                            json.dumps(chunk["metadata"], ensure_ascii=False),
                        )

                    await conn.execute(
                        """
                        UPDATE resources
                        SET is_embedded = true, updated_at = now()
                        WHERE id = $1::uuid
                        """,
                        resource_id,
                    )

            logger.info(
                "vector_store.store.complete",
                resource_id=resource_id,
                chunks_stored=len(chunks),
            )
            return len(chunks)

        except Exception as e:
            logger.error(
                "vector_store.store.error",
                resource_id=resource_id,
                error=str(e),
            )
            return 0

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
        Search for similar chunks using pgvector cosine similarity.
        Delegates to embedding_service.search().
        """
        return await embedding_service.search(
            query=query,
            top_k=top_k,
            filter_subject=filter_subject,
            filter_grade=filter_grade,
            raw_only=raw_only,
            min_score=min_score,
        )

    async def get_resource_text(self, resource_id: str) -> Optional[str]:
        """
        Get the full content_text of a resource by ID.
        Used to resolve system_resource_ids in /ai/generate.
        """
        results = await self.get_resource_texts([resource_id])
        return results.get(resource_id)

    async def get_resource_texts(self, resource_ids: list[str]) -> dict[str, str]:
        """Get content_text for multiple resources in one DB query."""
        contexts = await self.get_resource_contexts(resource_ids)
        return {
            resource_id: str(context["content_text"])
            for resource_id, context in contexts.items()
            if context.get("content_text")
        }

    async def get_resource_contexts(self, resource_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Get citation-ready resource metadata plus content_text for multiple resources."""
        if not resource_ids:
            return {}
        if not settings.DATABASE_URL:
            logger.info("vector_store.get_resources.skip", reason="no_database_url")
            return {}

        valid_ids: list[uuid.UUID] = []
        original_by_uuid: dict[str, str] = {}
        for resource_id in dict.fromkeys(resource_ids):
            try:
                parsed = uuid.UUID(str(resource_id))
            except ValueError:
                logger.warning("vector_store.get_resources.invalid_id", resource_id=resource_id)
                continue
            valid_ids.append(parsed)
            original_by_uuid[str(parsed)] = str(resource_id)

        if not valid_ids:
            return {}

        try:
            pool = await get_db_pool()
            if pool is None:
                return {}

            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        id::text AS id,
                        filename,
                        content_text,
                        category,
                        subject,
                        grade,
                        COALESCE(metadata, '{}'::jsonb) AS metadata
                    FROM resources
                    WHERE id = ANY($1::uuid[])
                    """,
                    valid_ids,
                )

            return {
                original_by_uuid[row["id"]]: {
                    "id": original_by_uuid[row["id"]],
                    "filename": row["filename"],
                    "content_text": row["content_text"],
                    "category": row["category"],
                    "subject": row["subject"],
                    "grade": row["grade"],
                    "metadata": _metadata_to_dict(row["metadata"]),
                }
                for row in rows
                if row["content_text"]
            }

        except Exception as e:
            logger.warning(
                "vector_store.get_resources.error",
                count=len(resource_ids),
                error=str(e),
            )
            return {}


# Singleton instance
vector_store = VectorStore()


def _coerce_chunk(chunk: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(chunk, str):
        return {"text": chunk, "metadata": {}}

    text = str(chunk.get("text", ""))
    metadata = chunk.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    return {"text": text, "metadata": metadata}
