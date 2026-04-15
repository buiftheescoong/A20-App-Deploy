"""
Intent Router Node — phân loại ý định của user để điều hướng trong LangGraph.

Actions:
  "generate"  → Tạo giáo án mới (lần đầu hoặc re-generate)
  "resume"    → Tiếp tục sau khi user trả lời clarification
  "refine"    → User yêu cầu chỉnh sửa giáo án
  "qa"        → User đặt câu hỏi về giáo án
"""

import json
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

ROUTER_SYSTEM_PROMPT = """Bạn là bộ phân loại ý định trong một hệ thống soạn giáo án AI.

Dựa vào tin nhắn cuối cùng của người dùng và ngữ cảnh, hãy xác định "action":

- "generate"  : Yêu cầu tạo giáo án mới, chưa có giáo án nào, hoặc muốn tạo lại từ đầu
- "resume"    : Người dùng đang trả lời câu hỏi clarification của AI (Ví dụ: "Nhấn mạnh vào đồ thị", "Đây là thêm tài liệu")
- "refine"    : Yêu cầu chỉnh sửa, thay đổi, thêm bớt nội dung giáo án (Ví dụ: "Đổi phần khởi động thành Kahoot", "Thêm ví dụ vào phần 2")
- "qa"        : Đặt câu hỏi, nhờ giải thích, hỏi về nội dung (Ví dụ: "Tại sao lại dùng 5E?", "Mục tiêu này có nghĩa gì?")

Bối cảnh bổ sung:
- Nếu chưa có giáo án (has_plan=false) → ưu tiên "generate" hoặc "resume"
- Nếu đã có giáo án (has_plan=true) → ưu tiên "refine" hoặc "qa"

Chỉ trả về JSON: {"action": "generate"|"resume"|"refine"|"qa", "confidence": 0.0-1.0}
"""


async def run_intent_router(
    last_message: str,
    has_plan: bool,
    is_clarifying: bool,
) -> str:
    """
    Classify user intent and return action string.

    Args:
        last_message: The latest user message
        has_plan: Whether a lesson plan already exists
        is_clarifying: Whether the pipeline is waiting for clarification answers

    Returns:
        action: "generate" | "resume" | "refine" | "qa"
    """
    # Fast-path rules (no LLM needed)
    if not has_plan:
        return "generate"

    if is_clarifying:
        # If AI was waiting for clarification, any user message resumes generation
        return "resume"

    # Use LLM for nuanced classification
    try:
        context = json.dumps(
            {
                "last_message": last_message,
                "has_plan": has_plan,
                "is_clarifying": is_clarifying,
            },
            ensure_ascii=False,
        )

        response = await client.chat.completions.create(
            model=settings.CHEAP_MODEL,
            messages=[
                {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        action = result.get("action", "qa")

        logger.info(
            f"Intent router: '{action}' "
            f"(confidence={result.get('confidence', 0):.2f}) "
            f"for message: '{last_message[:50]}...'"
        )
        return action

    except Exception as e:
        logger.error(f"Intent router error: {e}, defaulting to 'qa'")
        return "qa"
