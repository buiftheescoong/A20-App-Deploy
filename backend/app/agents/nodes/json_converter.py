"""
JSON Converter Node — Convert Markdown streamed by Generator into structured JSON.
This implements the Two-Pass Strategy (ADR-02).
"""

import json
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

CONVERTER_SYSTEM_PROMPT = """Bạn là một bộ phân tích (parser) JSON chuyển đổi giáo án từ định dạng Markdown sang JSON cấu trúc.
Giữ nguyên toàn bộ nội dung, không thêm bớt. 
Dựa vào metadata và nội dung markdown, hãy trích xuất thành đúng cấu trúc JSON sau:

{
  "metadata": {
    "subject": "Tên môn học",
    "grade": "Lớp",
    "topic": "Tên bài học",
    "duration_minutes": 45,
    "teaching_model": "5E" hoặc "3-phase",
    "objectives": ["mục tiêu 1", "mục tiêu 2"],
    "competencies": ["năng lực 1", "năng lực 2"],
    "materials": ["tài liệu 1", "tài liệu 2"]
  },
  "sections": {
    // Đối với mô hình 5E thì key là: "engage", "explore", "explain", "elaborate", "evaluate"
    // Đối với 3-phase thì key là: "opening", "knowledge", "practice"
    "engage": {
      "title": "Tên hoạt động",
      "content": "Nội dung chi tiết của hoạt động (mục tiêu, nội dung, sản phẩm, tổ chức)",
      "duration": 5 // số phút
    }
  }
}

Chỉ trả về JSON, không có text nào khác.
"""

async def run_json_converter(markdown_content: str, metadata: dict) -> dict:
    """
    Run cheap model to convert Markdown plan to JSON.
    """
    if not markdown_content:
        return {}
        
    try:
        user_message = json.dumps({
            "metadata_hint": metadata,
            "markdown_plan": markdown_content
        }, ensure_ascii=False)

        response = await client.chat.completions.create(
            model=settings.CHEAP_MODEL,
            messages=[
                {"role": "system", "content": CONVERTER_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result

    except Exception as e:
        logger.error(f"JSON converter error: {e}")
        return {}
