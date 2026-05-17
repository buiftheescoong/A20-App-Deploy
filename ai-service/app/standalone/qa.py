"""
Standalone QA responder — single LLM call to answer questions about the lesson plan.
No LangGraph needed. Does NOT modify the plan.
"""

import json
import time
import asyncio

import structlog

from app.config import settings
from app.services.llm import llm_client

logger = structlog.get_logger()


QA_SYSTEM_PROMPT = """Bạn là trợ lý giáo viên, chuyên trả lời câu hỏi về giáo án.

QUY TẮC:
1. Chỉ trả lời câu hỏi, KHÔNG sửa đổi giáo án
2. Trả lời ngắn gọn, chính xác, dựa trên nội dung giáo án
3. Nếu câu hỏi không liên quan đến giáo án, nói rõ
4. Trả lời bằng tiếng Việt
5. Nếu thông tin không có trong giáo án, nói rõ "Thông tin này không có trong giáo án"
"""


async def answer(
    plan_id: str,
    current_plan: dict,
    question: str,
    stream_queue: asyncio.Queue,
) -> str:
    """
    Answer a question about the lesson plan. Does NOT modify the plan.

    Args:
        plan_id: Unique identifier for the plan
        current_plan: Current plan JSON structure
        question: User's question
        stream_queue: Queue for SSE events

    Returns:
        The full answer text
    """
    start_time = time.monotonic()
    logger.info(
        "qa.start",
        plan_id=plan_id,
        question_preview=question[:100],
    )

    # Build the plan summary for context
    plan_text = json.dumps(current_plan, ensure_ascii=False, indent=2)
    # Truncate if too long to avoid token limits
    if len(plan_text) > 12000:
        plan_text = plan_text[:12000] + "\n... (truncated)"

    prompt = f"""Giáo án hiện tại:
{plan_text}

Câu hỏi của giáo viên:
{question}

Trả lời ngắn gọn, chính xác dựa trên nội dung giáo án."""

    result = ""
    chunk_count = 0

    try:
        async for chunk in llm_client.stream(
            prompt=prompt,
            model=settings.CHEAP_MODEL,
            system_prompt=QA_SYSTEM_PROMPT,
            temperature=0.3,
        ):
            result += chunk
            chunk_count += 1
            await stream_queue.put({
                "event": "chat",
                "data": {"role": "assistant", "delta": chunk},
            })

        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        logger.info(
            "qa.complete",
            plan_id=plan_id,
            answer_length=len(result),
            chunks=chunk_count,
            duration_ms=elapsed_ms,
        )

        return result

    except Exception as e:
        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        logger.error(
            "qa.error",
            plan_id=plan_id,
            error=str(e),
            duration_ms=elapsed_ms,
            exc_info=True,
        )
        await stream_queue.put({
            "event": "error",
            "data": {"message": f"Lỗi khi trả lời: {str(e)}", "recoverable": True},
        })
        return ""
