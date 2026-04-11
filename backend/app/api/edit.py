"""
Edit API — POST /api/edit
Person B owns this file (Person A uses the edit agent).
"""

import json
import logging
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI

from app.schemas.lesson_plan import EditRequest
from app.database import get_lesson_plan, update_lesson_plan
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

EDIT_PROMPT_TEMPLATE = """Bạn là trợ lý chỉnh sửa giáo án. Bạn được yêu cầu chỉ sửa MỘT section cụ thể.

Giáo án hiện tại (phần cần sửa — section "{section_id}"):
{current_section}

Yêu cầu chỉnh sửa:
{edit_prompt}

QUAN TRỌNG:
- CHỈ sửa phần "{section_id}", KHÔNG thay đổi bất kỳ phần nào khác
- Giữ nguyên format JSON
- Trả về JSON cho section đã chỉnh sửa: {{"title": "...", "content": "...", "duration": ...}}
- Chỉ trả JSON, không có text thêm
"""


@router.post("/api/edit")
async def edit_lesson_plan(request: EditRequest):
    """
    Edit a specific section of a lesson plan using the Editor Agent.
    """
    plan = get_lesson_plan(request.lesson_plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    content_json = plan.get("content_json")
    if not content_json:
        raise HTTPException(status_code=400, detail="Lesson plan has no content")

    sections = content_json.get("sections", {})
    if request.section_id not in sections:
        raise HTTPException(
            status_code=400,
            detail=f"Section '{request.section_id}' not found",
        )

    current_section = sections[request.section_id]

    try:
        response = await client.chat.completions.create(
            model=settings.PRIMARY_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": EDIT_PROMPT_TEMPLATE.format(
                        section_id=request.section_id,
                        current_section=json.dumps(current_section, ensure_ascii=False),
                        edit_prompt=request.edit_prompt,
                    ),
                },
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        updated_section = json.loads(response.choices[0].message.content)

        # Update only the specified section
        content_json["sections"][request.section_id] = updated_section
        update_lesson_plan(request.lesson_plan_id, {"content_json": content_json})

        return {
            "lesson_plan_id": request.lesson_plan_id,
            "section_id": request.section_id,
            "updated_section": updated_section,
            "message": f"Section '{request.section_id}' updated successfully",
        }

    except Exception as e:
        logger.error(f"Edit error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to edit section: {str(e)}")
