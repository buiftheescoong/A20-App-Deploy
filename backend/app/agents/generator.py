"""
Generator Agent — generates lesson plans following GDPT 2018 standards.
Person A owns this file.

Responsibilities:
- Generate lesson plan JSON following the schema
- Use RAG context and clarification answers for grounding
- Output must strictly follow LessonPlanJSON schema
"""

import json
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

GENERATOR_SYSTEM_PROMPT_5E = """Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.

Bạn PHẢI sinh output dưới dạng JSON theo schema sau — KHÔNG ĐƯỢC thêm bất kỳ key nào ngoài schema.
Bạn KHÔNG ĐƯỢC bịa đặt kiến thức không có trong [RAG_CONTEXT] hoặc [CLARIFICATION_ANSWERS].

Phương pháp dạy học: 5E

JSON Schema bắt buộc:
{{
  "metadata": {{
    "subject": "<Tên môn>",
    "grade": "<Lớp>",
    "topic": "<Tên bài>",
    "teaching_model": "5E",
    "duration_minutes": 45,
    "objectives": ["<Mục tiêu 1>", "<Mục tiêu 2>", ...],
    "competencies": ["<Năng lực 1>", "<Năng lực 2>"],
    "materials": ["<Thiết bị 1>", "<Học liệu 1>"]
  }},
  "sections": {{
    "engage":    {{ "title": "Khởi động",  "content": "<Mô tả hoạt động chi tiết: Mục tiêu – Nội dung – Sản phẩm – Tổ chức thực hiện>", "duration": 5 }},
    "explore":   {{ "title": "Khám phá",   "content": "<...>", "duration": 10 }},
    "explain":   {{ "title": "Giải thích",  "content": "<...>", "duration": 15 }},
    "elaborate": {{ "title": "Vận dụng",   "content": "<...>", "duration": 10 }},
    "evaluate":  {{ "title": "Đánh giá",   "content": "<...>", "duration": 5 }}
  }},
  "rag_sources": [],
  "compliance": {{ "status": "PASSED", "errors": [] }},
  "clarification_needed": false
}}

YÊU CẦU BẮT BUỘC:
1. Mục tiêu phải có ÍT NHẤT 2 năng lực chuyên môn + 1 phẩm chất
2. Mục Thiết bị và học liệu PHẢI được điền đầy đủ
3. Mỗi hoạt động phải mô tả đủ 4 nội dung: Mục tiêu hoạt động – Nội dung – Sản phẩm – Tổ chức thực hiện
4. Tổng thời gian các hoạt động phải = duration_minutes
5. Chỉ trả về JSON, không có text thêm bên ngoài
"""

GENERATOR_SYSTEM_PROMPT_3PHASE = """Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.

Bạn PHẢI sinh output dưới dạng JSON theo schema sau.
Phương pháp dạy học: 3-phase (Mở đầu – Hình thành kiến thức – Luyện tập)

JSON Schema bắt buộc:
{{
  "metadata": {{
    "subject": "<Tên môn>",
    "grade": "<Lớp>",
    "topic": "<Tên bài>",
    "teaching_model": "3-phase",
    "duration_minutes": 45,
    "objectives": ["<Mục tiêu 1>", "<Mục tiêu 2>", ...],
    "competencies": ["<Năng lực 1>", "<Năng lực 2>"],
    "materials": ["<Thiết bị 1>", "<Học liệu 1>"]
  }},
  "sections": {{
    "opening":   {{ "title": "Mở đầu",               "content": "<...>", "duration": 5 }},
    "knowledge": {{ "title": "Hình thành kiến thức",  "content": "<...>", "duration": 30 }},
    "practice":  {{ "title": "Luyện tập",             "content": "<...>", "duration": 10 }}
  }},
  "rag_sources": [],
  "compliance": {{ "status": "PASSED", "errors": [] }},
  "clarification_needed": false
}}

YÊU CẦU BẮT BUỘC:
1. Mục tiêu phải có ÍT NHẤT 2 năng lực chuyên môn + 1 phẩm chất
2. Mục Thiết bị và học liệu PHẢI được điền đầy đủ
3. Mỗi hoạt động phải mô tả đủ 4 nội dung: Mục tiêu hoạt động – Nội dung – Sản phẩm – Tổ chức thực hiện
4. Tổng thời gian các hoạt động phải = duration_minutes
5. Chỉ trả về JSON, không có text thêm bên ngoài
"""


def _build_user_prompt(
    normalized_input: dict,
    rag_context: list[dict],
    clarification_answers: list[dict] = None,
    quality_feedback: list[dict] = None,
) -> str:
    """Build the user prompt with all context."""
    parts = []

    # User request
    parts.append(f"Môn: {normalized_input['subject']}")
    parts.append(f"Lớp: {normalized_input['grade']}")
    parts.append(f"Bài: {normalized_input['topic']}")
    if normalized_input.get("objectives"):
        parts.append(f"Mục tiêu: {', '.join(normalized_input['objectives'])}")

    # RAG context
    if rag_context:
        parts.append("\n[RAG_CONTEXT]")
        for i, chunk in enumerate(rag_context):
            content = (
                chunk.get("content", chunk) if isinstance(chunk, dict) else str(chunk)
            )
            parts.append(f"<source_{i+1}>{content}</source_{i+1}>")

    # Clarification answers
    if clarification_answers:
        parts.append("\n[CLARIFICATION_ANSWERS]")
        for qa in clarification_answers:
            parts.append(f"Q: {qa.get('question', '')}")
            parts.append(f"A: {qa.get('answer', '')}")

    # Quality feedback (for revision)
    if quality_feedback:
        parts.append("\n[QUALITY_FEEDBACK — Hãy sửa các lỗi sau]")
        for err in quality_feedback:
            parts.append(
                f"- Section: {err.get('section', 'N/A')} — {err.get('issue', '')} → Gợi ý: {err.get('suggestion', '')}"
            )

    return "\n".join(parts)


async def run_generator(
    normalized_input: dict,
    rag_context: list[dict],
    clarification_answers: list[dict] = None,
    quality_feedback: list[dict] = None,
    model: str = None,
) -> dict:
    """
    Generate a lesson plan using LLM.

    Args:
        normalized_input: Parsed user input
        rag_context: Retrieved RAG chunks
        clarification_answers: Teacher's answers to clarification questions
        quality_feedback: Errors from quality checker (for revision)
        model: Override model (for fallback)

    Returns:
        Parsed lesson plan JSON dict
    """
    teaching_model = normalized_input.get("teaching_model", "5E")
    system_prompt = (
        GENERATOR_SYSTEM_PROMPT_5E
        if teaching_model == "5E"
        else GENERATOR_SYSTEM_PROMPT_3PHASE
    )

    user_prompt = _build_user_prompt(
        normalized_input, rag_context, clarification_answers, quality_feedback
    )

    use_model = model or settings.PRIMARY_MODEL

    try:
        response = await client.chat.completions.create(
            model=use_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        result = json.loads(content)

        # Add RAG sources
        if rag_context:
            result["rag_sources"] = [
                chunk.get("source", f"source_{i}")
                for i, chunk in enumerate(rag_context)
                if isinstance(chunk, dict)
            ]

        logger.info(f"Generator produced lesson plan using model {use_model}")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Generator JSON parse error: {e}")
        raise
    except Exception as e:
        logger.error(f"Generator error with model {use_model}: {e}")
        raise
