"""Convert final lesson-plan markdown to the structured JSON shape."""

from __future__ import annotations

import json

import structlog

from app.config import settings
from app.graph.decorators import log_node
from app.prompts.templates import MARKDOWN_TO_JSON_PROMPT
from app.services.llm import llm_client

logger = structlog.get_logger()


@log_node
async def run(state: dict) -> dict:
    plan_id = state["plan_id"]
    markdown = state.get("current_markdown", "")

    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "formatting", "label": "Đang chuẩn hóa giáo án..."},
        })

    logger.info(
        "json_converter.start",
        plan_id=plan_id,
        model=settings.CHEAP_MODEL,
        markdown_length=len(markdown),
    )

    try:
        json_prompt = MARKDOWN_TO_JSON_PROMPT.format(
            markdown=markdown,
            teaching_model=state.get("teaching_model", "5E"),
        )
        json_response = await llm_client.call(
            prompt=json_prompt,
            model=settings.CHEAP_MODEL,
            temperature=settings.STRUCTURED_OUTPUT_TEMPERATURE,
            response_format={"type": "json_object"},
        )
        plan_json = json.loads(_clean_json_response(json_response))
        if not isinstance(plan_json, dict):
            raise ValueError("JSON conversion did not return an object")
    except Exception as e:
        logger.warning("json_converter.error", plan_id=plan_id, error=str(e))
        plan_json = _fallback_plan(state, markdown, error=str(e))

    plan_json.setdefault("metadata", {})
    plan_json["metadata"].setdefault("subject", state.get("subject", ""))
    plan_json["metadata"].setdefault("grade", state.get("grade", ""))
    plan_json["metadata"].setdefault("topic", state.get("topic", ""))
    plan_json["metadata"].setdefault("teaching_model", state.get("teaching_model", "5E"))
    plan_json.setdefault("sections", {})
    source_details = _rag_source_details(state.get("rag_context", []))
    if source_details:
        plan_json["rag_source_details"] = source_details
        plan_json["rag_sources"] = [source["id"] for source in source_details]
    else:
        plan_json.setdefault("rag_sources", _rag_sources(state.get("rag_context", [])))
        plan_json.setdefault("rag_source_details", [])
    plan_json["raw_markdown"] = markdown

    logger.info(
        "json_converter.complete",
        plan_id=plan_id,
        json_keys=list(plan_json.keys()),
    )
    return {**state, "current_plan": plan_json}


def _clean_json_response(response: str) -> str:
    json_str = response.strip()
    if json_str.startswith("```json"):
        json_str = json_str[7:]
    if json_str.startswith("```"):
        json_str = json_str[3:]
    if json_str.endswith("```"):
        json_str = json_str[:-3]
    return json_str.strip()


def _fallback_plan(state: dict, markdown: str, error: str) -> dict:
    return {
        "metadata": {
            "subject": state.get("subject", ""),
            "grade": state.get("grade", ""),
            "topic": state.get("topic", ""),
            "teaching_model": state.get("teaching_model", "5E"),
            "duration_minutes": 45,
            "objectives": state.get("objectives", []),
            "competencies": [],
            "qualities": [],
            "materials": [],
        },
        "sections": {},
        "rag_sources": _rag_sources(state.get("rag_context", [])),
        "rag_source_details": _rag_source_details(state.get("rag_context", [])),
        "compliance": {"status": "PENDING", "errors": [error]},
        "raw_markdown": markdown,
    }


def _rag_sources(rag_context: list[dict]) -> list[str]:
    sources: list[str] = []
    for chunk in rag_context:
        metadata = chunk.get("metadata") or {}
        source = metadata.get("source_alias") or metadata.get("raw_path") or metadata.get("source_title") or chunk.get("source")
        if source and source not in sources:
            sources.append(str(source))
    return sources


def _rag_source_details(rag_context: list[dict]) -> list[dict]:
    details: list[dict] = []
    seen: set[str] = set()
    for index, chunk in enumerate(rag_context or [], start=1):
        metadata = chunk.get("metadata") or {}
        source_detail = chunk.get("source_detail") or {}
        source_id = str(
            source_detail.get("id")
            or metadata.get("source_alias")
            or chunk.get("source_alias")
            or f"S{index}"
        )
        if source_id in seen:
            continue
        seen.add(source_id)
        details.append({
            "id": source_id,
            "title": source_detail.get("title") or metadata.get("source_title") or chunk.get("source") or source_id,
            "type": source_detail.get("type") or chunk.get("type", "rag"),
            "raw_path": source_detail.get("raw_path") or metadata.get("raw_path", ""),
            "chapter": source_detail.get("chapter") or metadata.get("chapter", ""),
            "lesson": source_detail.get("lesson") or metadata.get("lesson", ""),
            "section": source_detail.get("section") or metadata.get("section", ""),
            "score": source_detail.get("score", chunk.get("score", 0)),
            "resource_id": source_detail.get("resource_id") or chunk.get("resource_id") or metadata.get("resource_id", ""),
            "chunk_id": source_detail.get("chunk_id") or metadata.get("chunk_id", ""),
            "line_start": source_detail.get("line_start") or metadata.get("line_start"),
            "line_end": source_detail.get("line_end") or metadata.get("line_end"),
        })
    return details
