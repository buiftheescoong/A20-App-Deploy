"""
Generator Agent — Sinh giáo án dưới dạng Markdown (Pass 1 streaming).
This file owns the generation of natural language lesson plans.
"""

import json
import logging
import asyncio
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

GENERATOR_SYSTEM_PROMPT_5E = """Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.

Hãy sinh ra bản giáo án chi tiết và trình bày rõ ràng, đẹp mắt dưới định dạng MARKDOWN.
KHÔNG ĐƯỢC bịa đặt kiến thức không có trong [RAG_CONTEXT] hoặc [CLARIFICATION_ANSWERS].

Phương pháp dạy học: 5E

Bạn cần có các phần chính:
# Thông tin chung
- Môn, Lớp, Tên bài, Thời lượng
- Mục tiêu bài học (Ít nhất 2 năng lực chuyên môn + 1 phẩm chất)
- Thiết bị và học liệu

# Tiến trình dạy học
1. Hoạt động 1: Khởi động (Engage) - [Thời gian]
   - Mục tiêu: ...
   - Nội dung: ...
   - Sản phẩm: ...
   - Tổ chức thực hiện: ...
2. Hoạt động 2: Khám phá (Explore) - [Thời gian]
3. Hoạt động 3: Giải thích (Explain) - [Thời gian]
4. Hoạt động 4: Vận dụng (Elaborate) - [Thời gian]
5. Hoạt động 5: Đánh giá (Evaluate) - [Thời gian]

Lưu ý: Mô tả chi tiết từng hoạt động phải có đủ 4 cột thông tin (Mục tiêu, Nội dung, Sản phẩm, Tổ chức thực hiện).
"""

GENERATOR_SYSTEM_PROMPT_3PHASE = """Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.

Hãy sinh ra bản giáo án chi tiết và trình bày rõ ràng, đẹp mắt dưới định dạng MARKDOWN.
KHÔNG ĐƯỢC bịa đặt kiến thức không có trong [RAG_CONTEXT] hoặc [CLARIFICATION_ANSWERS].

Phương pháp dạy học: 3-phase (Mở đầu – Hình thành kiến thức – Luyện tập)

Bạn cần có các phần chính:
# Thông tin chung
- Môn, Lớp, Tên bài, Thời lượng
- Mục tiêu bài học (Ít nhất 2 năng lực chuyên môn + 1 phẩm chất)
- Thiết bị và học liệu

# Tiến trình dạy học
1. Hoạt động 1: Mở đầu - [Thời gian]
   - Mục tiêu: ...
   - Nội dung: ...
   - Sản phẩm: ...
   - Tổ chức thực hiện: ...
2. Hoạt động 2: Hình thành kiến thức - [Thời gian]
3. Hoạt động 3: Luyện tập - [Thời gian]

Lưu ý: Mô tả chi tiết từng hoạt động phải có đủ 4 cột thông tin (Mục tiêu, Nội dung, Sản phẩm, Tổ chức thực hiện).
"""


def _build_user_prompt(
    normalized_input: dict,
    rag_context: list,
    quality_feedback: list[dict] = None,
) -> str:
    """Build the user prompt with all context."""
    parts = []

    parts.append(f"Môn: {normalized_input.get('subject')}")
    parts.append(f"Lớp: {normalized_input.get('grade')}")
    parts.append(f"Bài: {normalized_input.get('topic')}")
    if normalized_input.get("objectives"):
        parts.append(f"Mục tiêu: {', '.join(normalized_input.get('objectives'))}")

    if rag_context:
        parts.append("\n[RAG_CONTEXT]")
        for i, chunk in enumerate(rag_context):
            content = chunk.get("content", chunk) if isinstance(chunk, dict) else str(chunk)
            parts.append(f"<source_{i+1}>\n{content}\n</source_{i+1}>")

    if quality_feedback:
        parts.append("\n[QUALITY_FEEDBACK — Hãy sửa các lỗi sau]")
        for err in quality_feedback:
            parts.append(f"- {err.get('section', 'N/A')} — {err.get('issue', '')} → Gợi ý: {err.get('suggestion', '')}")

    return "\n".join(parts)


async def run_generator(
    normalized_input: dict,
    rag_context: list,
    quality_feedback: list[dict] = None,
    stream_queue: asyncio.Queue = None,
    model: str = None,
) -> str:
    """
    Generate a lesson plan using LLM, streaming Markdown format.
    """
    teaching_model = normalized_input.get("teaching_model", "5E")
    system_prompt = (
        GENERATOR_SYSTEM_PROMPT_5E
        if teaching_model == "5E"
        else GENERATOR_SYSTEM_PROMPT_3PHASE
    )

    user_prompt = _build_user_prompt(
        normalized_input, rag_context, quality_feedback
    )

    use_model = model or settings.PRIMARY_MODEL

    try:
        response = await client.chat.completions.create(
            model=use_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            stream=True,
        )

        full_markdown = ""
        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                delta = chunk.choices[0].delta.content
                full_markdown += delta
                if stream_queue:
                    await stream_queue.put({"type": "chunk", "data": {"type": "markdown", "delta": delta}})

        logger.info(f"Generator finished streaming markdown using {use_model}")
        return full_markdown
        
    except Exception as e:
        logger.error(f"Generator error with model {use_model}: {e}")
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": str(e), "recoverable": True}})
        return ""
