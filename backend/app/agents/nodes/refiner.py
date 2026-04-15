"""
Refiner Node — Sửa đổi giáo án dựa trên yêu cầu chat bằng ngôn ngữ tự nhiên.
"""

import json
import logging
import asyncio
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

REFINER_SYSTEM_PROMPT = """Bạn là một chuyên gia soạn giáo án AI (chuẩn GDPT 2018).
Dưới đây là giáo án hiện tại dạng JSON, kèm theo yêu cầu chỉnh sửa của người dùng.

Hãy phân tích yêu cầu của người dùng, xác định chính xác phần nào (section nào) cần sửa.
Chỉ sửa những phần liên quan đến yêu cầu, giữ nguyên các phần khác.

Stream trả về kết quả giáo án BẰNG ĐỊNH DẠNG JSON MỚI (full json) - NHƯNG CHÚ Ý: 
Bởi vì đang stream partial JSON, hãy cố gắng sửa và trả về định dạng đúng. Hoặc đơn giản là sinh lại bộ JSON đã cập nhật.

Lưu ý: Để stream dễ hơn trên FE, hãy output Markdown trước, hoặc sử dụng format JSON chuẩn.
Ở đây, ta output Markdown text giống như generator_node để sau đó json_converter sẽ parse lại.
Như vậy thống nhất luồng: Refiner sinh Markdown -> JSON Converter parse.
"""

async def run_refiner(
    current_plan: dict,
    user_message: str,
    stream_queue: asyncio.Queue = None,
) -> str:
    """
    Run refiner to output updated Markdown plan, streaming to queue.
    """
    try:
        context = json.dumps({
            "current_plan": current_plan,
            "user_request": user_message
        }, ensure_ascii=False)

        response = await client.chat.completions.create(
            model=settings.PRIMARY_MODEL,
            messages=[
                {"role": "system", "content": REFINER_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            temperature=0.7,
            stream=True
        )

        full_markdown = ""
        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                delta = chunk.choices[0].delta.content
                full_markdown += delta
                if stream_queue:
                    await stream_queue.put({"type": "chunk", "data": {"type": "markdown", "delta": delta}})

        if stream_queue:
            # Emit chat message indicating refinement is done
            await stream_queue.put({"type": "chat", "data": {"role": "assistant", "content": "Giáo án đã được cập nhật thành công theo yêu cầu của bạn. ✅"}})

        return full_markdown

    except Exception as e:
        logger.error(f"Refiner error: {e}")
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": str(e), "recoverable": True}})
        return ""
