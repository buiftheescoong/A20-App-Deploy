"""In-memory generation state helpers.

The service still uses process-local state for active generations; this module
only centralizes creation and cleanup so endpoint modules do not own the shape.
"""

from __future__ import annotations

import time
from typing import Any

import structlog

logger = structlog.get_logger()

state_store: dict[str, dict[str, Any]] = {}

STATE_TTL_SECONDS = 7200


def build_initial_state(
    *,
    plan_id: str,
    request_id: str,
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
    objectives: list[str],
    emphasis: str,
    special_requests: str,
    uploaded_docs: list[str],
    resource_texts: list[str],
    system_resource_texts: list[str],
    resource_contexts: list[dict[str, Any]] | None = None,
    system_resource_contexts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "plan_id": plan_id,
        "request_id": request_id,
        "subject": subject,
        "grade": grade,
        "topic": topic,
        "teaching_model": teaching_model,
        "objectives": objectives,
        "emphasis": emphasis,
        "special_requests": special_requests,
        "uploaded_docs": uploaded_docs,
        "resource_texts": resource_texts,
        "system_resource_texts": system_resource_texts,
        "resource_contexts": resource_contexts or [],
        "system_resource_contexts": system_resource_contexts or [],
        "rag_context": [],
        "generation_blueprint": {},
        "current_markdown": "",
        "current_plan": {},
        "quality_result": {},
        "iteration": 0,
        "stream_queue": None,
        "error": None,
        "_created_at": time.time(),
    }


def cleanup_expired_states(now: float | None = None) -> None:
    """Remove inactive entries older than STATE_TTL_SECONDS."""
    current_time = time.time() if now is None else now
    expired = [
        plan_id
        for plan_id, state in state_store.items()
        if current_time - state.get("_created_at", current_time) > STATE_TTL_SECONDS
        and not (state.get("_pipeline_started") and state.get("stream_queue") is not None)
    ]
    for plan_id in expired:
        del state_store[plan_id]
        logger.info("state_store.cleanup", plan_id=plan_id)


def store_generation_state(plan_id: str, state: dict[str, Any]) -> None:
    state_store[plan_id] = state
