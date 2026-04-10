"""
Generate API — POST /api/generate + GET /api/status/{task_id}
Person A owns this file.
"""

import uuid
import logging
from fastapi import APIRouter, BackgroundTasks, Request, HTTPException

from app.schemas.lesson_plan import GenerateRequest, StatusResponse
from app.database import create_lesson_plan
from app.agents.pipeline import run_pipeline, get_task_state

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/generate")
async def generate_lesson_plan(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    req: Request,
):
    """
    Start lesson plan generation.
    Returns task_id for polling status.
    """
    # Get user_id from auth middleware (or mock for now)
    user_id = getattr(req.state, "user_id", "mock-user-id")

    task_id = str(uuid.uuid4())

    # Create lesson plan record in DB
    plan_data = {
        "subject": request.subject,
        "grade": request.grade,
        "topic": request.topic,
        "objectives": request.objectives,
        "teaching_model": request.teaching_model,
        "task_id": task_id,
    }

    try:
        create_lesson_plan(user_id, plan_data)
    except Exception as e:
        logger.error(f"Failed to create lesson plan record: {e}")
        raise HTTPException(status_code=500, detail="Failed to create lesson plan")

    # Start pipeline as background task
    user_input = request.model_dump()
    background_tasks.add_task(run_pipeline, task_id, user_id, user_input)

    return {"task_id": task_id, "status": "pending"}


@router.get("/api/status/{task_id}", response_model=StatusResponse)
async def get_generation_status(task_id: str):
    """
    Poll generation status.
    Frontend calls this every 3 seconds.
    """
    state = get_task_state(task_id)

    if not state:
        # Check DB as fallback
        from app.database import get_lesson_plan_by_task_id
        plan = get_lesson_plan_by_task_id(task_id)
        if plan:
            return StatusResponse(
                task_id=task_id,
                status=plan.get("status", "pending"),
                lesson_plan_id=plan.get("id"),
                is_blank_template=plan.get("is_blank_template", False),
                clarification_needed=plan.get("status") == "clarifying",
            )
        raise HTTPException(status_code=404, detail="Task not found")

    return StatusResponse(
        task_id=task_id,
        status=state.get("status", "pending"),
        progress_step=state.get("progress_step"),
        lesson_plan_id=None,  # Will be set after DB query if needed
        clarification_needed=state.get("low_confidence", False) and state.get("status") == "clarifying",
        is_blank_template=state.get("is_blank_template", False),
        error=state.get("error"),
    )
