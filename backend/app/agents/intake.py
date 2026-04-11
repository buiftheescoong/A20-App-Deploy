"""
Intake Agent — parses & validates user input, checks scope.
Person A owns this file.

Responsibilities:
- Parse and normalize user input into NormalizedInput
- Scope guard: reject requests not related to lesson planning
"""

import json
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SCOPE_CHECK_PROMPT = """Bạn là trợ lý AI chuyên hỗ trợ soạn giáo án theo chương trình GDPT 2018.
Đọc yêu cầu của giáo viên và xác định:

1. Yêu cầu có liên quan đến soạn giáo án hoặc chỉnh sửa giáo án không?
2. Nếu KHÔNG → trả về JSON: {"out_of_scope": true, "message": "Mình chỉ có thể hỗ trợ soạn giáo án theo chương trình GDPT 2018. Bạn cần soạn bài nào không?"}
3. Nếu CÓ → trả về JSON: {"out_of_scope": false, "normalized": {"subject": "...", "grade": "...", "topic": "...", "objectives": [...], "teaching_model": "5E"}}

Lưu ý:
- Chỉ trả về JSON, không có text thêm
- Nếu user đã cung cấp đầy đủ thông tin structured, giữ nguyên
- Nếu user cung cấp dạng tự nhiên, parse ra các trường tương ứng
"""


async def run_intake(user_input: dict) -> dict:
    """
    Process user input through the intake agent.
    
    Args:
        user_input: Raw user input dict with subject, grade, topic, objectives, teaching_model
        
    Returns:
        dict with either:
        - {"out_of_scope": True, "message": "..."} 
        - {"out_of_scope": False, "normalized": {...}}
    """
    # If input is already structured with required fields, validate directly
    required_fields = ["subject", "grade", "topic"]
    has_structured = all(field in user_input and user_input[field] for field in required_fields)
    
    if has_structured:
        return {
            "out_of_scope": False,
            "normalized": {
                "subject": user_input["subject"],
                "grade": user_input["grade"],
                "topic": user_input["topic"],
                "objectives": user_input.get("objectives", []),
                "teaching_model": user_input.get("teaching_model", "5E"),
            },
        }

    # Otherwise, use LLM to parse and check scope
    try:
        user_text = json.dumps(user_input, ensure_ascii=False)
        response = await client.chat.completions.create(
            model=settings.CHEAP_MODEL,
            messages=[
                {"role": "system", "content": SCOPE_CHECK_PROMPT},
                {"role": "user", "content": user_text},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        logger.error(f"Intake agent error: {e}")
        # Fall through — if we can't parse, assume in-scope with original data
        return {
            "out_of_scope": False,
            "normalized": user_input,
        }
