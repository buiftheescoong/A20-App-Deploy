"""
Clarification API — GET/POST /api/clarification/{task_id}
Person A owns this file.
"""

import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.schemas.lesson_plan import ClarificationResponse, ClarificationAnswerRequest
from app.agents.clarification import (
    get_clarification_status,
    submit_clarification_answers,
)
from app.agents.pipeline import run_pipeline, get_task_state

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/clarification/{task_id}", response_model=ClarificationResponse)
async def get_clarification_questions(task_id: str):
    """
    Get clarification questions for a task (when RAG confidence is low).
    """
    session = await get_clarification_status(task_id)

    if not session:
        # Try getting from pipeline state
        state = get_task_state(task_id)
        if state and state.get("clarification_questions"):
            return ClarificationResponse(
                task_id=task_id,
                questions=state["clarification_questions"],
            )
        raise HTTPException(status_code=404, detail="No clarification session found")

    questions = [
        q.get("question", q) if isinstance(q, dict) else q
        for q in session.get("questions", [])
    ]

    return ClarificationResponse(
        task_id=task_id,
        questions=questions,
    )


@router.post("/api/clarification/{task_id}")
async def submit_answers(
    task_id: str,
    request: ClarificationAnswerRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit teacher's answers to clarification questions.
    Resumes the pipeline with enriched context.
    """
    state = get_task_state(task_id)
    if not state:
        raise HTTPException(status_code=404, detail="Clarification task not found")

    await submit_clarification_answers(task_id, request.answers)

    # Resume pipeline with clarification answers
    user_id = state["user_id"]
    user_input = state["user_input"]

    background_tasks.add_task(
        run_pipeline, task_id, user_id, user_input, request.answers
    )

    return {"task_id": task_id, "status": "generating"}
