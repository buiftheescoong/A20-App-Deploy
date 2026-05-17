"""
Node 4: Formatter.
Finalizes JSON structure and generates DOCX file.
"""

import structlog

from app.graph.decorators import log_node
from app.services.docx_formatter import generate_docx_bytes

logger = structlog.get_logger()


def _generate_docx_bytes(plan: dict, markdown: str) -> bytes:
    """Generate DOCX bytes while preserving the existing public API."""
    return generate_docx_bytes(plan, markdown)


@log_node
async def run(state: dict) -> dict:
    """
    Formatter node:
    1. Finalize JSON structure
    2. Generate DOCX bytes
    3. Push 'plan' event (full JSON)
    4. Push 'done' event
    """
    plan_id = state["plan_id"]
    plan = state.get("current_plan", {})
    markdown = state.get("current_markdown", "")
    quality = state.get("quality_result", {})

    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "formatting", "label": "Đang định dạng giáo án..."}
        })

    # Enrich plan with compliance
    plan["compliance"] = {
        "status": quality.get("status", "PENDING"),
        "score": quality.get("score", 0),
        "errors": quality.get("errors", []),
    }
    plan["lesson_plan_id"] = plan_id

    # Generate DOCX
    docx_bytes = _generate_docx_bytes(plan, markdown)
    docx_generated = len(docx_bytes) > 0
    logger.info("formatter.docx", plan_id=plan_id, generated=docx_generated,
                size_bytes=len(docx_bytes))

    # Push plan event
    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "plan",
            "data": plan,
        })
        await state["stream_queue"].put({
            "event": "done",
            "data": {
                "plan_id": plan_id,
                "status": "completed",
                "compliance": quality.get("status", "PENDING"),
                "docx_generated": docx_generated,
            },
        })

    return {
        **state,
        "current_plan": plan,
    }
