"""
Node 2: Generator.

Builds a compact lesson blueprint first, then streams the final markdown plan.
JSON conversion remains a later graph node.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

import structlog

from app.config import settings
from app.graph.decorators import log_node
from app.prompts.templates import (
    build_blueprint_prompt,
    build_final_markdown_prompt,
    build_repair_user_prompt,
)
from app.services.llm import llm_client

logger = structlog.get_logger()


def _format_quality_feedback(quality_result: dict) -> str:
    feedback = str(quality_result.get("feedback", "") or "").strip()
    errors = quality_result.get("errors") or []
    if isinstance(errors, list) and errors:
        error_text = "\n".join(f"- {error}" for error in errors)
        return f"{feedback}\n\nCác lỗi cần sửa:\n{error_text}".strip()
    return feedback


def _source_id(chunk: dict[str, Any], index: int) -> str:
    metadata = chunk.get("metadata") or {}
    for candidate in (
        chunk.get("source_alias"),
        metadata.get("source_alias"),
        metadata.get("raw_path"),
        metadata.get("source_title"),
        metadata.get("lesson"),
        chunk.get("source"),
        chunk.get("resource_id"),
    ):
        value = str(candidate or "").strip()
        if value:
            return value
    return f"source_{index}"


def _build_context_pack(rag_context: list[dict[str, Any]]) -> dict[str, Any]:
    """Create one deduplicated context pack from RAG output only."""
    grouped: dict[str, dict[str, Any]] = {}
    text_seen: set[tuple[str, str]] = set()

    for index, chunk in enumerate(rag_context or [], 1):
        text = str(chunk.get("text", "") or "").strip()
        if not text:
            continue

        source_id = _source_id(chunk, index)
        fingerprint = " ".join(text.split()).lower()[:700]
        dedupe_key = (source_id, fingerprint)
        if dedupe_key in text_seen:
            continue
        text_seen.add(dedupe_key)

        metadata = chunk.get("metadata") or {}
        source_detail = chunk.get("source_detail") or {}
        if source_id not in grouped:
            grouped[source_id] = {
                "source_id": source_id,
                "title": source_detail.get("title") or metadata.get("source_title") or chunk.get("source") or source_id,
                "type": chunk.get("type", "rag"),
                "score": chunk.get("score", 0),
                "raw_path": metadata.get("raw_path", ""),
                "chapter": metadata.get("chapter", ""),
                "lesson": metadata.get("lesson", ""),
                "section": metadata.get("section", ""),
                "match_reason": chunk.get("match_reason", ""),
                "resource_id": chunk.get("resource_id") or metadata.get("resource_id") or "",
                "chunk_id": metadata.get("chunk_id", ""),
                "line_start": metadata.get("line_start"),
                "line_end": metadata.get("line_end"),
                "_texts": [],
            }
        grouped[source_id]["_texts"].append(text[: settings.RAG_CHUNK_MAX_CHARS])

    sources: list[dict[str, Any]] = []
    text_parts: list[str] = []
    used_chars = 0
    max_chars = max(0, settings.RAG_CONTEXT_MAX_CHARS)

    for source in grouped.values():
        if max_chars and used_chars >= max_chars:
            break
        source_text = "\n\n".join(source.pop("_texts", []))
        remaining = max_chars - used_chars if max_chars else len(source_text)
        packed_text = source_text[:remaining].rstrip()
        if not packed_text:
            continue

        source["score"] = _safe_float(source.get("score"))
        sources.append(source)
        text_parts.append(
            "\n".join([
                f"<source id=\"{source['source_id']}\">",
                f"title: {source.get('title', '')}",
                f"type: {source.get('type', '')}",
                f"raw_path: {source.get('raw_path', '')}",
                f"chapter: {source.get('chapter', '')}",
                f"lesson: {source.get('lesson', '')}",
                f"section: {source.get('section', '')}",
                f"lines: {source.get('line_start') or ''}-{source.get('line_end') or ''}",
                "content:",
                packed_text,
                "</source>",
            ])
        )
        used_chars += len(packed_text)

    return {
        "sources": sources,
        "source_ids": [source["source_id"] for source in sources],
        "rag_source_details": sources,
        "text": "\n\n".join(text_parts),
        "char_count": used_chars,
    }


async def _build_blueprint(state: dict, context_pack: dict[str, Any], quality_feedback: str) -> dict[str, Any]:
    plan_id = state["plan_id"]
    start_time = time.monotonic()

    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "generating", "label": "Đang lập dàn ý sư phạm..."},
        })

    prompt = build_blueprint_prompt(
        subject=state.get("subject", ""),
        grade=state.get("grade", ""),
        topic=state.get("topic", ""),
        teaching_model=state.get("teaching_model", "5E"),
        context_pack=context_pack,
        objectives=state.get("objectives", []),
        emphasis=state.get("emphasis", ""),
        special_requests=state.get("special_requests", ""),
        quality_feedback=quality_feedback,
    )

    logger.info(
        "generator.blueprint.start",
        plan_id=plan_id,
        model=settings.CHEAP_MODEL,
        source_count=len(context_pack.get("sources", [])),
        context_chars=context_pack.get("char_count", 0),
        has_feedback=bool(quality_feedback),
    )

    try:
        response = await llm_client.call(
            prompt=prompt,
            model=settings.CHEAP_MODEL,
            temperature=settings.STRUCTURED_OUTPUT_TEMPERATURE,
            response_format={"type": "json_object"},
        )
        blueprint = json.loads(_clean_json(response))
        if not isinstance(blueprint, dict) or not _blueprint_valid(blueprint):
            raise ValueError("Blueprint JSON is missing required fields")
    except Exception as e:
        logger.warning(
            "generator.blueprint.error",
            plan_id=plan_id,
            error=str(e),
            duration_ms=round((time.monotonic() - start_time) * 1000),
        )
        blueprint = _fallback_blueprint(state, context_pack)
        blueprint["_fallback_reason"] = str(e)

    logger.info(
        "generator.blueprint.complete",
        plan_id=plan_id,
        valid=_blueprint_valid(blueprint),
        activities=len(blueprint.get("activities", [])) if isinstance(blueprint.get("activities"), list) else 0,
        duration_ms=round((time.monotonic() - start_time) * 1000),
    )
    return blueprint


def _blueprint_valid(blueprint: dict[str, Any]) -> bool:
    activities = blueprint.get("activities")
    return (
        bool(str(blueprint.get("title", "")).strip())
        and isinstance(activities, list)
        and len(activities) > 0
        and all(isinstance(activity, dict) for activity in activities)
    )


def _fallback_blueprint(state: dict, context_pack: dict[str, Any]) -> dict[str, Any]:
    teaching_model = state.get("teaching_model", "5E")
    topic = state.get("topic", "")
    objectives = [str(item).strip() for item in state.get("objectives", []) if str(item).strip()]
    if not objectives:
        objectives = [
            f"Trình bày được kiến thức trọng tâm của bài {topic}.",
            f"Vận dụng được kiến thức bài {topic} để giải quyết nhiệm vụ học tập phù hợp.",
        ]

    if teaching_model == "5E":
        phases = [
            ("Khởi động / Engage", 5),
            ("Khám phá / Explore", 10),
            ("Giải thích / Explain", 12),
            ("Mở rộng / Elaborate", 10),
            ("Đánh giá / Evaluate", 8),
        ]
    else:
        phases = [
            ("Khởi động / Xác định vấn đề", 5),
            ("Hình thành kiến thức mới", 25),
            ("Luyện tập", 10),
            ("Vận dụng", 5),
        ]

    activities = []
    for phase, duration in phases:
        activities.append({
            "phase": phase,
            "duration_minutes": duration,
            "organization": "nhóm nhỏ kết hợp cả lớp",
            "objective": f"Học sinh thực hiện nhiệm vụ của pha {phase.lower()} cho bài {topic}.",
            "content": f"Nhiệm vụ học tập bám mục tiêu bài {topic} và nguồn học liệu đã truy xuất.",
            "product": "Câu trả lời, phiếu học tập hoặc phần trình bày của học sinh.",
            "teacher_actions": [
                "Chuyển giao nhiệm vụ học tập rõ yêu cầu và thời gian.",
                "Theo dõi, hỗ trợ nhóm/cá nhân trong quá trình thực hiện.",
                "Tổ chức học sinh báo cáo, trao đổi và phản biện.",
                "Kết luận, chuẩn hóa kiến thức và định hướng ghi vở.",
            ],
            "student_actions": [
                "Tiếp nhận nhiệm vụ, xác định cách thực hiện.",
                "Làm việc cá nhân/nhóm để hoàn thành sản phẩm học tập.",
                "Báo cáo kết quả, lắng nghe và bổ sung ý kiến.",
                "Ghi nhận kiến thức trọng tâm và tự điều chỉnh sản phẩm.",
            ],
            "assessment": "Giáo viên quan sát, nhận xét sản phẩm học tập và câu trả lời của học sinh.",
        })

    return {
        "title": topic,
        "duration_minutes": 45,
        "objectives": objectives,
        "competencies": objectives[:2],
        "qualities": ["Chăm chỉ trong thực hiện nhiệm vụ học tập.", "Trách nhiệm khi tham gia hoạt động nhóm."],
        "methods": ["Dạy học giải quyết vấn đề", "Thảo luận nhóm", "Vấn đáp gợi mở"],
        "materials": ["SGK hoặc học liệu đã truy xuất", "Phiếu học tập", "Bảng phụ hoặc trình chiếu"],
        "source_ids": context_pack.get("source_ids", []),
        "alignment_chain": [
            "Mục tiêu bài học -> nhiệm vụ học tập -> sản phẩm học sinh -> quan sát/nhận xét/rubric đánh giá"
        ],
        "activities": activities,
        "source_use_note": (
            "Sử dụng các nguồn truy xuất trong source_ids."
            if context_pack.get("source_ids")
            else "Chưa có nguồn truy xuất; giáo viên cần kiểm chứng nội dung chuyên môn trước khi sử dụng."
        ),
    }


def _sanitize_markdown(markdown: str) -> str:
    cleaned = (markdown or "").strip()
    if not cleaned:
        return ""
    leading_fence = re.compile(r"^```(?:markdown|md)?\s*\n", flags=re.I)
    trailing_fence = re.compile(r"\n```\s*$")
    if leading_fence.search(cleaned) and trailing_fence.search(cleaned):
        cleaned = leading_fence.sub("", cleaned)
        cleaned = trailing_fence.sub("", cleaned)
    return cleaned.strip()


def _clean_json(response: str) -> str:
    json_str = (response or "").strip()
    if json_str.startswith("```json"):
        json_str = json_str[7:]
    if json_str.startswith("```"):
        json_str = json_str[3:]
    if json_str.endswith("```"):
        json_str = json_str[:-3]
    return json_str.strip()


def _safe_float(value: Any) -> float:
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return 0.0


@log_node
async def run(state: dict) -> dict:
    """
    Generator node.

    First iteration creates a full markdown lesson plan. Later iterations repair
    the previous markdown using quality feedback, then return the full fixed plan.
    """
    plan_id = state["plan_id"]
    iteration = state.get("iteration", 0)
    quality_result = state.get("quality_result", {}) or {}
    quality_feedback = _format_quality_feedback(quality_result)
    previous_markdown = state.get("current_markdown", "")
    is_repair = iteration > 0 and bool(previous_markdown)
    context_pack = _build_context_pack(state.get("rag_context", []))

    blueprint = await _build_blueprint(state, context_pack, quality_feedback)

    if state.get("stream_queue"):
        label = (
            f"Đang sửa giáo án theo phản hồi... (lần {iteration + 1})"
            if is_repair
            else f"Đang soạn giáo án hoàn chỉnh... (lần {iteration + 1})"
        )
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "generating", "label": label},
        })
        if is_repair:
            await state["stream_queue"].put({
                "event": "reset",
                "data": {"reason": "quality_repair", "iteration": iteration + 1},
            })

    subject = state.get("subject", "")
    grade = state.get("grade", "")
    topic = state.get("topic", "")
    teaching_model = state.get("teaching_model", "5E")
    if is_repair:
        user_prompt = build_repair_user_prompt(
            subject=subject,
            grade=grade,
            topic=topic,
            teaching_model=teaching_model,
            previous_markdown=previous_markdown,
            quality_feedback=quality_feedback,
            blueprint=blueprint,
        )
    else:
        user_prompt = build_final_markdown_prompt(
            subject=subject,
            grade=grade,
            topic=topic,
            teaching_model=teaching_model,
            blueprint=blueprint,
            context_pack=context_pack,
            quality_feedback=quality_feedback,
        )

    logger.info(
        "generator.markdown.start",
        plan_id=plan_id,
        iteration=iteration,
        model=settings.PRIMARY_MODEL,
        repair=is_repair,
        rag_chunks=len(state.get("rag_context", [])),
        source_count=len(context_pack.get("sources", [])),
        context_chars=context_pack.get("char_count", 0),
        blueprint_valid=_blueprint_valid(blueprint),
    )

    full_markdown = ""
    chunk_count = 0
    start_time = time.monotonic()

    try:
        async for chunk in llm_client.stream(
            prompt=user_prompt,
            model=settings.PRIMARY_MODEL,
            system_prompt="Bạn là chuyên gia soạn giáo án GDPT 2018. Chỉ trả về markdown giáo án hoàn chỉnh.",
            temperature=settings.REPAIR_TEMPERATURE if is_repair else settings.GENERATION_TEMPERATURE,
        ):
            full_markdown += chunk
            chunk_count += 1

            if state.get("stream_queue"):
                await state["stream_queue"].put({
                    "event": "chunk",
                    "data": {"type": "markdown", "delta": chunk},
                })
    except Exception as e:
        logger.error(
            "generator.markdown.error",
            plan_id=plan_id,
            error=str(e),
            chunks_received=chunk_count,
            repair=is_repair,
        )
        fallback_markdown = previous_markdown if is_repair else _sanitize_markdown(full_markdown)
        return {
            **state,
            "error": f"Generator failed: {str(e)}",
            "current_markdown": fallback_markdown,
            "current_plan": {},
            "generation_blueprint": blueprint,
            "iteration": iteration + 1,
        }

    sanitized_markdown = _sanitize_markdown(full_markdown)
    error = None
    if not sanitized_markdown:
        error = "Generator returned empty markdown"
        sanitized_markdown = previous_markdown if is_repair else ""
        logger.warning(
            "generator.markdown.empty",
            plan_id=plan_id,
            repair=is_repair,
            kept_previous=bool(sanitized_markdown),
        )

    duration_ms = round((time.monotonic() - start_time) * 1000)
    logger.info(
        "generator.markdown.complete",
        plan_id=plan_id,
        markdown_length=len(sanitized_markdown),
        chunks=chunk_count,
        duration_ms=duration_ms,
        repair=is_repair,
    )

    return {
        **state,
        "current_markdown": sanitized_markdown,
        "current_plan": {},
        "generation_blueprint": blueprint,
        "iteration": iteration + 1,
        "error": error,
    }
