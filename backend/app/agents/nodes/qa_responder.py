"""
QA Responder Node — Trả lời các câu hỏi về giáo án.
"""

import json
import logging
import asyncio
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

QA_SYSTEM_PROMPT = """Bạn là một trợ lý ảo tư vấn và giải đáp thắc mắc về giáo án.
Bạn được cung cấp nội dung của giáo án hiện tại và một số thông tin nền (nếu có).

Nhiệm vụ của bạn là giải đáp câu hỏi của người dùng một cách NGẮN GỌN, SÚC TÍCH, DỄ HIỂU.
Giải thích trực tiếp vào trọng tâm, không cần chào hỏi dài dòng.

Stream câu trả lời của bạn ra.
"""

async def run_qa_responder(
    current_plan: dict,
    user_question: str,
    rag_context: list = None,
    stream_queue: asyncio.Queue = None,
) -> str:
    """
    Run QA and stream reply to the chat interface.
    """
    try:
        context = json.dumps({
            "current_plan": current_plan,
            "rag_context": rag_context,
            "user_question": user_question
        }, ensure_ascii=False)

        response = await client.chat.completions.create(
            model=settings.CHEAP_MODEL,
            messages=[
                {"role": "system", "content": QA_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            temperature=0.5,
            stream=True
        )

        full_reply = ""
        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                delta = chunk.choices[0].delta.content
                full_reply += delta
                if stream_queue:
                    # Type 'chat_delta' to let UI append letters
                    await stream_queue.put({"type": "chat_delta", "data": {"delta": delta}})

        if stream_queue:
            # Emit full message event if needed, but delta should be enough if UI handles it.
            # We can also put a "chat_done" or full "chat" event depending on FE implementation.
            await stream_queue.put({"type": "chat_done", "data": {}})

        return full_reply

    except Exception as e:
        logger.error(f"QA responder error: {e}")
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": str(e), "recoverable": True}})
        return ""
