"""
Quality Check API — POST /api/check
Person A owns this file.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas.lesson_plan import CheckRequest
from app.database import get_lesson_plan
from app.agents.quality_checker import run_quality_check

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/check")
async def check_lesson_plan(request: CheckRequest):
    """
    Run quality check on a lesson plan.
    Standalone endpoint for checking existing plans.
    """
    if not request.lesson_plan_id:
        raise HTTPException(status_code=400, detail="lesson_plan_id is required")

    plan_record = get_lesson_plan(request.lesson_plan_id)
    if not plan_record:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    content_json = plan_record.get("content_json")
    if not content_json:
        raise HTTPException(status_code=400, detail="Lesson plan has no content to check")

    result = await run_quality_check(content_json)

    return {
        "lesson_plan_id": request.lesson_plan_id,
        "is_passed": result["status"] == "PASSED",
        "error_details": result["errors"],
        "suggestions": [err.get("suggestion", "") for err in result["errors"]],
    }
