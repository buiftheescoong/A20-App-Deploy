"""
Lesson Plans CRUD API — GET/DELETE /api/lesson-plans
Person B owns this file.
"""

import logging
from fastapi import APIRouter, Request, HTTPException, Query

from app.database import (
    get_lesson_plans_by_user,
    get_lesson_plan,
    delete_lesson_plan,
)
from app.agents.formatter import run_formatter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/lesson-plans")
async def list_lesson_plans(
    req: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """
    Get paginated list of lesson plans for the authenticated user.
    """
    user_id = getattr(req.state, "user_id", "mock-user-id")

    try:
        plans = get_lesson_plans_by_user(user_id, limit=limit, offset=offset)
        return {
            "plans": plans,
            "count": len(plans),
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Failed to fetch lesson plans: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch lesson plans")


@router.get("/api/lesson-plans/{plan_id}")
async def get_lesson_plan_detail(plan_id: str):
    """
    Get a single lesson plan by ID.
    """
    plan = get_lesson_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    return plan


@router.delete("/api/lesson-plans/{plan_id}")
async def delete_lesson_plan_endpoint(plan_id: str, req: Request):
    """
    Delete a lesson plan.
    """
    user_id = getattr(req.state, "user_id", "mock-user-id")

    plan = get_lesson_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    if plan.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    success = delete_lesson_plan(plan_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete")

    return {"message": "Deleted successfully"}


@router.post("/api/export/{plan_id}")
async def export_lesson_plan(plan_id: str):
    """
    Export a lesson plan to DOCX format.
    """
    plan = get_lesson_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    # If already exported, return existing URL
    if plan.get("docx_url"):
        return {
            "download_url": plan["docx_url"],
            "is_blank_template": plan.get("is_blank_template", False),
        }

    # Otherwise, generate DOCX
    content_json = plan.get("content_json")
    is_blank = not content_json

    result = await run_formatter(
        plan=content_json or {},
        is_blank_template=is_blank,
    )

    # Update DB with URL
    from app.database import update_lesson_plan
    update_lesson_plan(plan_id, {
        "docx_url": result["docx_url"],
        "is_blank_template": result["is_blank_template"],
    })

    return {
        "download_url": result["docx_url"],
        "is_blank_template": result["is_blank_template"],
    }
