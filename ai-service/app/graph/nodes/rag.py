"""
Node 1: RAG Retrieval.

Builds precise context for lesson generation from:
1. Explicitly selected system resources
2. Automatic `data/raw` textbook retrieval
3. User resources
4. Uploaded documents
"""

from __future__ import annotations

from collections import defaultdict
import re
import unicodedata
from typing import Any

import structlog

from app.config import settings
from app.graph.decorators import log_node

logger = structlog.get_logger()


@log_node
async def run(state: dict) -> dict:
    """
    RAG Retrieval node.

    Explicit system resources keep highest priority. Automatic raw RAG fills the
    normal no-selection path by searching chunked `data/raw` Markdown sources.
    """
    plan_id = state["plan_id"]
    subject = state.get("subject", "")
    grade = state.get("grade", "")
    topic = state.get("topic", "")

    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "rag", "label": "Dang tra cứu tài liệu..."},
        })

    rag_context: list[dict[str, Any]] = []

    system_resource_contexts = state.get("system_resource_contexts") or _contexts_from_texts(
        state.get("system_resource_texts", []),
        prefix="system_resource",
        source="selected_system_resource",
    )
    if system_resource_contexts:
        rag_context.extend(_resource_context_chunks(
            system_resource_contexts,
            chunk_type="system_resource",
            score=1.0,
            match_reason="teacher-selected",
        ))
        logger.info("rag.system_resources", plan_id=plan_id, count=len(system_resource_contexts))

    search_queries = _build_search_queries(state)
    try:
        if settings.DATABASE_URL:
            from app.services.vector_store import vector_store

            search_results = []
            merged_keys: set[tuple[str, Any]] = set()
            for search_query in search_queries:
                for result in await _search_raw_context(
                    vector_store=vector_store,
                    query=search_query,
                    subject=subject,
                    grade=grade,
                ):
                    key = _result_key(result)
                    if key in merged_keys:
                        continue
                    merged_keys.add(key)
                    search_results.append({**result, "query_variant": search_query})
            ranked_results = _rerank_and_select(search_results, state)
            for result in ranked_results:
                metadata = result.get("metadata") or {}
                rag_context.append({
                    "text": result["text"],
                    "source": result.get("source", "data/raw"),
                    "score": result.get("score", 0.0),
                    "type": "raw_vector_search",
                    "resource_id": result.get("resource_id"),
                    "chunk_index": result.get("chunk_index"),
                    "metadata": metadata,
                    "match_reason": result.get("match_reason", "raw-rag"),
                    "vector_score": result.get("vector_score", result.get("score", 0.0)),
                    "retrieval_stage": result.get("retrieval_stage"),
                    "query_variant": result.get("query_variant"),
                })
            logger.info(
                "rag.raw_vector_search",
                plan_id=plan_id,
                queries=search_queries,
                result_count=len(ranked_results),
                candidate_count=len(search_results),
            )
        else:
            logger.info("rag.vector_search.skip", plan_id=plan_id, reason="no_database_url")
    except Exception as exc:
        logger.warning("rag.vector_search.error", plan_id=plan_id, error=str(exc))

    resource_contexts = state.get("resource_contexts") or _contexts_from_texts(
        state.get("resource_texts", []),
        prefix="user_resource",
        source="user_resource",
    )
    if resource_contexts:
        rag_context.extend(_resource_context_chunks(
            resource_contexts,
            chunk_type="user_resource",
            score=0.8,
            match_reason="teacher-resource",
        ))

    uploaded_docs = state.get("uploaded_docs", [])
    if uploaded_docs:
        for i, text in enumerate(uploaded_docs):
            rag_context.append({
                "text": text[:settings.MAX_FILE_SIZE_DIRECT],
                "source": f"uploaded_doc_{i + 1}",
                "score": 0.7,
                "type": "uploaded_doc",
                "metadata": {"source": "uploaded_doc"},
            })

    unpacked_count = len(rag_context)
    rag_context = _pack_context(rag_context)
    rag_context = _assign_source_aliases(rag_context)

    logger.info(
        "rag.context_built",
        plan_id=plan_id,
        total_chunks=len(rag_context),
        candidate_chunks=unpacked_count,
        system_chunks=len(system_resource_contexts),
        user_chunks=len(resource_contexts),
        upload_chunks=len(uploaded_docs),
        total_chars=sum(len(str(chunk.get("text", ""))) for chunk in rag_context),
    )

    return {**state, "rag_context": rag_context}


async def _search_raw_context(
    vector_store: Any,
    query: str,
    subject: str,
    grade: str,
) -> list[dict[str, Any]]:
    candidates = max(settings.RAG_TOP_K, settings.RAG_VECTOR_CANDIDATES)
    relaxed_score = max(0.0, settings.RAG_MIN_SCORE - 0.15)
    fallback_score = max(0.0, settings.RAG_MIN_SCORE - 0.25)
    stages = [
        ("exact", subject, grade, settings.RAG_MIN_SCORE, candidates),
        ("relaxed", subject, grade, relaxed_score, candidates),
        ("subject_fallback", subject, None, fallback_score, max(settings.RAG_TOP_K * 3, candidates // 2)),
    ]

    merged: dict[tuple[str, Any], dict[str, Any]] = {}
    for stage, stage_subject, stage_grade, min_score, top_k in stages:
        results = await vector_store.search(
            query=query,
            top_k=top_k,
            filter_subject=stage_subject or None,
            filter_grade=stage_grade or None,
            raw_only=True,
            min_score=min_score,
        )
        for result in results:
            key = (
                str(result.get("resource_id") or result.get("source") or ""),
                result.get("chunk_index", hash(result.get("text", ""))),
            )
            if key not in merged:
                merged[key] = {**result, "retrieval_stage": stage}

        if stage == "exact" and len(merged) >= settings.RAG_TOP_K:
            break
        if stage == "relaxed" and len(merged) >= settings.RAG_TOP_K:
            break

    return list(merged.values())


def _contexts_from_texts(texts: list[str], prefix: str, source: str) -> list[dict[str, Any]]:
    contexts: list[dict[str, Any]] = []
    for index, text in enumerate(texts or [], start=1):
        clean_text = str(text or "").strip()
        if not clean_text:
            continue
        contexts.append({
            "id": f"{prefix}_{index}",
            "filename": f"{prefix}_{index}",
            "content_text": clean_text,
            "category": None,
            "subject": None,
            "grade": None,
            "metadata": {"source": source},
        })
    return contexts


def _resource_context_chunks(
    contexts: list[dict[str, Any]],
    *,
    chunk_type: str,
    score: float,
    match_reason: str,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for index, context in enumerate(contexts or [], start=1):
        text = str(context.get("content_text") or "").strip()
        if not text:
            continue
        metadata = context.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        filename = str(context.get("filename") or context.get("id") or f"{chunk_type}_{index}")
        chunks.append({
            "text": text[:settings.MAX_FILE_SIZE_DIRECT],
            "source": filename,
            "score": score,
            "type": chunk_type,
            "resource_id": context.get("id"),
            "metadata": {
                **metadata,
                "source": metadata.get("source") or chunk_type,
                "source_title": filename,
                "resource_id": context.get("id"),
                "category": context.get("category"),
                "subject": context.get("subject"),
                "grade": context.get("grade"),
                "raw_path": metadata.get("raw_path", ""),
                "chapter": metadata.get("chapter", ""),
                "lesson": metadata.get("lesson", ""),
                "section": metadata.get("section", ""),
            },
            "match_reason": match_reason,
        })
    return chunks


def _pack_context(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate and cap RAG context while preserving high-trust chunks."""
    if not chunks:
        return []

    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks):
        text = str(chunk.get("text", "")).strip()
        if not text:
            continue
        metadata = chunk.get("metadata") or {}
        source_key = _source_identity(chunk)
        text_key = " ".join(sorted(_tokens(text[:1200])))
        dedupe_key = (source_key, text_key)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        unique.append({**chunk, "_pack_index": index})

    def sort_key(chunk: dict[str, Any]) -> tuple[int, float, int]:
        chunk_type = chunk.get("type")
        if chunk_type == "system_resource":
            priority = 0
        elif chunk_type == "raw_vector_search":
            priority = 1
        elif chunk_type == "user_resource":
            priority = 2
        else:
            priority = 3
        return (priority, -_bounded_float(chunk.get("score", 0.0)), chunk.get("_pack_index", 0))

    selected: list[dict[str, Any]] = []
    used_chars = 0
    for chunk in sorted(unique, key=sort_key):
        remaining = settings.RAG_CONTEXT_MAX_CHARS - used_chars
        if remaining <= 0:
            break

        text = str(chunk.get("text", "")).strip()
        max_chunk_chars = min(settings.RAG_CHUNK_MAX_CHARS, remaining)
        packed_text = text[:max_chunk_chars].rstrip()
        if not packed_text:
            continue

        packed = {key: value for key, value in chunk.items() if key != "_pack_index"}
        packed["text"] = packed_text
        packed["packed_truncated"] = len(text) > len(packed_text)
        selected.append(packed)
        used_chars += len(packed_text)

    return selected


def _assign_source_aliases(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aliases: dict[str, str] = {}
    assigned: list[dict[str, Any]] = []
    for chunk in chunks:
        key = _source_identity(chunk)
        if key not in aliases:
            aliases[key] = f"S{len(aliases) + 1}"
        alias = aliases[key]
        metadata = {**(chunk.get("metadata") or {}), "source_alias": alias}
        enriched = {
            **chunk,
            "source_alias": alias,
            "citation": alias,
            "metadata": metadata,
        }
        enriched["source_detail"] = _source_detail(enriched, alias)
        assigned.append(enriched)
    return assigned


def _source_detail(chunk: dict[str, Any], alias: str) -> dict[str, Any]:
    metadata = chunk.get("metadata") or {}
    return {
        "id": alias,
        "title": metadata.get("source_title") or chunk.get("source") or alias,
        "type": chunk.get("type", "rag"),
        "raw_path": metadata.get("raw_path") or "",
        "chapter": metadata.get("chapter") or "",
        "lesson": metadata.get("lesson") or "",
        "section": metadata.get("section") or "",
        "score": _bounded_float(chunk.get("score", 0.0)),
        "vector_score": _bounded_float(chunk.get("vector_score", chunk.get("score", 0.0))),
        "resource_id": str(chunk.get("resource_id") or metadata.get("resource_id") or ""),
        "chunk_id": metadata.get("chunk_id") or "",
        "line_start": metadata.get("line_start"),
        "line_end": metadata.get("line_end"),
    }


def _source_identity(chunk: dict[str, Any]) -> str:
    metadata = chunk.get("metadata") or {}
    return str(
        metadata.get("raw_path")
        or chunk.get("resource_id")
        or metadata.get("resource_id")
        or chunk.get("source")
        or chunk.get("source_alias")
        or ""
    )


def _result_key(result: dict[str, Any]) -> tuple[str, Any]:
    return (
        str(result.get("resource_id") or result.get("source") or ""),
        result.get("chunk_index", hash(result.get("text", ""))),
    )


def _build_search_query(state: dict[str, Any]) -> str:
    objectives = state.get("objectives") or []
    if isinstance(objectives, list):
        objectives_text = " ".join(str(item) for item in objectives)
    else:
        objectives_text = str(objectives)

    parts = [
        state.get("subject", ""),
        f"lop {state.get('grade', '')}",
        state.get("topic", ""),
        objectives_text,
        state.get("emphasis", ""),
    ]
    return " ".join(str(part).strip() for part in parts if str(part).strip())


def _build_search_queries(state: dict[str, Any]) -> list[str]:
    objectives = state.get("objectives") or []
    objectives_text = " ".join(str(item) for item in objectives) if isinstance(objectives, list) else str(objectives)
    subject = str(state.get("subject", "") or "").strip()
    grade = str(state.get("grade", "") or "").strip()
    topic = str(state.get("topic", "") or "").strip()
    emphasis = str(state.get("emphasis", "") or "").strip()

    candidates = [
        _build_search_query(state),
        topic,
        " ".join(part for part in [subject, f"lớp {grade}" if grade else "", topic] if part),
        " ".join(part for part in [topic, objectives_text] if part),
        " ".join(part for part in [topic, emphasis] if part),
        " ".join(_tokens(topic)),
    ]

    queries: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        clean = re.sub(r"\s+", " ", str(candidate or "")).strip()
        key = " ".join(sorted(_tokens(clean)))
        if clean and key and key not in seen:
            seen.add(key)
            queries.append(clean)
    return queries or [_build_search_query(state)]


def _rerank_and_select(results: list[dict[str, Any]], state: dict[str, Any]) -> list[dict[str, Any]]:
    query = _build_search_query(state)
    query_tokens = _tokens(query)
    scored = [_score_result(result, state, query_tokens) for result in results]
    scored.sort(key=lambda item: item["score"], reverse=True)

    selected: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    counts: defaultdict[tuple[str, str], int] = defaultdict(int)
    diversity_limit = max(1, settings.RAG_DIVERSITY_PER_SOURCE)

    for result in scored:
        key = _diversity_key(result)
        if counts[key] >= diversity_limit:
            skipped.append(result)
            continue
        selected.append(result)
        counts[key] += 1
        if len(selected) >= settings.RAG_TOP_K:
            return selected

    for result in skipped:
        selected.append(result)
        if len(selected) >= settings.RAG_TOP_K:
            break

    return selected


def _score_result(
    result: dict[str, Any],
    state: dict[str, Any],
    query_tokens: set[str],
) -> dict[str, Any]:
    metadata = result.get("metadata") or {}
    vector_score = _bounded_float(result.get("score", 0.0))
    lexical_score = _lexical_overlap(query_tokens, " ".join([
        result.get("text", ""),
        metadata.get("chapter", ""),
        metadata.get("lesson", ""),
        metadata.get("section", ""),
    ]))
    metadata_score = _metadata_score(result, state, query_tokens)
    heading_score = _heading_score(result, state)
    final_score = (
        (0.55 * vector_score)
        + (0.20 * lexical_score)
        + (0.15 * metadata_score)
        + (0.10 * heading_score)
    )

    return {
        **result,
        "score": round(final_score, 4),
        "original_score": round(vector_score, 4),
        "vector_score": round(vector_score, 4),
        "lexical_score": round(lexical_score, 4),
        "metadata_score": round(metadata_score, 4),
        "heading_score": round(heading_score, 4),
        "match_reason": (
            f"{result.get('retrieval_stage', 'vector')}; "
            f"vector={vector_score:.2f}; lexical={lexical_score:.2f}; "
            f"metadata={metadata_score:.2f}; heading={heading_score:.2f}"
        ),
    }


def _metadata_score(result: dict[str, Any], state: dict[str, Any], query_tokens: set[str]) -> float:
    metadata = result.get("metadata") or {}
    score = 0.0
    if _same_text(metadata.get("subject") or result.get("subject"), state.get("subject")):
        score += 0.45
    if str(metadata.get("grade") or result.get("grade") or "") == str(state.get("grade") or ""):
        score += 0.35

    heading_text = " ".join([
        metadata.get("chapter", ""),
        metadata.get("lesson", ""),
        metadata.get("section", ""),
    ])
    score += 0.20 * _lexical_overlap(query_tokens, heading_text)
    return min(1.0, score)


def _heading_score(result: dict[str, Any], state: dict[str, Any]) -> float:
    metadata = result.get("metadata") or {}
    topic_tokens = _tokens(state.get("topic", ""))
    if not topic_tokens:
        return 0.0
    heading_text = " ".join([
        metadata.get("lesson", ""),
        metadata.get("section", ""),
        metadata.get("chapter", ""),
        " ".join(metadata.get("heading_path", []) if isinstance(metadata.get("heading_path"), list) else []),
    ])
    return _lexical_overlap(topic_tokens, heading_text)


def _diversity_key(result: dict[str, Any]) -> tuple[str, str]:
    metadata = result.get("metadata") or {}
    source_key = _source_identity(result)
    lesson_key = str(metadata.get("lesson") or metadata.get("chapter") or "")
    return source_key, lesson_key


def _lexical_overlap(query_tokens: set[str], text: str) -> float:
    if not query_tokens:
        return 0.0
    text_tokens = _tokens(text)
    if not text_tokens:
        return 0.0
    return len(query_tokens & text_tokens) / len(query_tokens)


def _tokens(text: str) -> set[str]:
    normalized = unicodedata.normalize("NFD", str(text).lower()).replace("đ", "d")
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return {token for token in re.findall(r"[a-z0-9]+", ascii_text) if len(token) > 1}


def _same_text(left: Any, right: Any) -> bool:
    return _tokens(str(left)) == _tokens(str(right)) and bool(_tokens(str(left)))


def _bounded_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))
