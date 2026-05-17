"""
Standalone refiner function — single LLM call to modify a specific section.
No LangGraph needed. Streams modified content back via stream_queue.
"""

import json
import time
import asyncio
from typing import Optional

import structlog

from app.config import settings
from app.services.llm import llm_client

logger = structlog.get_logger()


REFINER_SYSTEM_PROMPT = """Bạn là chuyên gia chỉnh sửa giáo án theo chương trình GDPT 2018.

NHIỆM VỤ:
- Nhận giáo án hiện tại (markdown) và yêu cầu chỉnh sửa từ giáo viên
- Xác định phần cần chỉnh sửa
- Chỉ trả lại PHẦN ĐÃ SỬA, giữ nguyên format markdown
- Không thay đổi các phần không liên quan

QUY TẮC:
1. Giữ nguyên format markdown gốc
2. Chỉ sửa phần liên quan đến yêu cầu
3. Đảm bảo nội dung chính xác về mặt chuyên môn
4. Tuân thủ chuẩn GDPT 2018
5. Viết bằng tiếng Việt chuẩn
"""
REFINER_SYSTEM_PROMPT += """

CRITICAL OUTPUT CONTRACT:
- Return exactly one complete updated lesson plan in markdown.
- The output must replace the current lesson plan.
- Do not include the old version, previous version, new version labels, a comparison, a diff, or commentary outside the lesson plan.
- Do not wrap the markdown in code fences.
"""


async def refine(
    plan_id: str,
    current_plan: dict,
    current_markdown: str,
    user_message: str,
    stream_queue: asyncio.Queue,
) -> dict:
    """
    Refine a specific section of the lesson plan based on user's request.

    Args:
        plan_id: Unique identifier for the plan
        current_plan: Current plan JSON structure
        current_markdown: Current markdown content
        user_message: User's refinement request
        stream_queue: Queue for SSE events

    Returns:
        Updated plan dict with modified section
    """
    start_time = time.monotonic()
    logger.info(
        "refiner.start",
        plan_id=plan_id,
        message_preview=user_message[:100],
    )

    prompt = f"""Giáo án hiện tại (markdown):
---
{current_markdown}
---

Yêu cầu chỉnh sửa của giáo viên:
{user_message}

Hãy chỉnh sửa phần liên quan. Trả lại TOÀN BỘ giáo án đã sửa (format markdown), đánh dấu phần đã thay đổi bằng comment <!-- CHANGED -->."""

    prompt += """

Output contract:
- Return exactly one complete updated markdown lesson plan.
- Do not include the previous version, the original version, comparison sections, diff markers, explanations, or code fences.
- The returned markdown will replace the current preview and stored lesson plan.
"""

    result = ""
    chunk_count = 0

    try:
        async for chunk in llm_client.stream(
            prompt=prompt,
            model=settings.PRIMARY_MODEL,
            system_prompt=REFINER_SYSTEM_PROMPT,
            temperature=0.7,
        ):
            result += chunk
            chunk_count += 1
            await stream_queue.put({
                "event": "chunk",
                "data": {"type": "markdown", "delta": chunk},
            })

        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        logger.info(
            "refiner.complete",
            plan_id=plan_id,
            result_length=len(result),
            chunks=chunk_count,
            duration_ms=elapsed_ms,
        )

        # Merge the refined content back into the plan
        updated_plan = _merge_refinement(current_plan, result, current_markdown)
        return updated_plan

    except Exception as e:
        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        logger.error(
            "refiner.error",
            plan_id=plan_id,
            error=str(e),
            duration_ms=elapsed_ms,
            exc_info=True,
        )
        await stream_queue.put({
            "event": "error",
            "data": {"message": f"Lỗi khi chỉnh sửa: {str(e)}", "recoverable": True},
        })
        return current_plan


def _merge_refinement(current_plan: dict, refined_markdown: str, original_markdown: str) -> dict:
    """
    Merge refined markdown back into the plan structure.
    Updates current_markdown in the plan and keeps the JSON structure.
    """
    updated = dict(current_plan)
    updated["_refined_markdown"] = refined_markdown
    updated["_original_markdown"] = original_markdown
    return updated
