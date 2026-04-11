"""
LangGraph Pipeline — orchestrates the multi-agent lesson plan generation workflow.
Person A owns this file.

This is the main pipeline that:
1. Intake: parse & validate input, check scope
2. RAG: retrieve knowledge base content
3. Clarification: pause if low confidence
4. Generate: create lesson plan via LLM
5. Quality Check: verify compliance + content quality
6. Retry/Fallback: handle failures
7. Format: export to DOCX
"""

import uuid
import logging
import json
from typing import TypedDict, Literal, Optional

from app.config import settings
from app.agents.intake import run_intake
from app.agents.rag import run_rag
from app.agents.clarification import start_clarification
from app.agents.generator import run_generator
from app.agents.quality_checker import run_quality_check
from app.agents.retry_fallback import generate_with_fallback
from app.agents.formatter import run_formatter
from app.database import (
    update_lesson_plan_by_task_id,
    create_evaluation,
    get_lesson_plan_by_task_id,
)

logger = logging.getLogger(__name__)


# ─── Pipeline State ────────────────────────────────────────────────


class PipelineState(TypedDict):
    task_id: str
    user_id: str
    user_input: dict
    normalized_input: Optional[dict]
    is_out_of_scope: bool
    rag_context: list
    low_confidence: bool
    clarification_questions: list[str]
    clarification_answers: Optional[list[dict]]
    draft_plan: Optional[dict]
    quality_result: Optional[dict]
    iteration: int
    retry_count: int
    current_model: str
    fallback_model: Optional[str]
    status: str
    final_plan: Optional[dict]
    is_blank_template: bool
    docx_url: str
    error: Optional[str]
    progress_step: str


# In-memory task store for tracking pipeline state
# In production, this would be Redis or DB-backed
task_store: dict[str, PipelineState] = {}


def get_task_state(task_id: str) -> Optional[PipelineState]:
    """Get pipeline state for a task."""
    return task_store.get(task_id)


def update_task_state(task_id: str, updates: dict):
    """Update pipeline state for a task."""
    if task_id in task_store:
        task_store[task_id].update(updates)


def _get_resume_state(task_id: str) -> dict:
    """Get the latest stored state when resuming after clarification."""
    return task_store.get(task_id, {})


# ─── Pipeline Execution ───────────────────────────────────────────


async def run_pipeline(
    task_id: str,
    user_id: str,
    user_input: dict,
    clarification_answers: list[dict] = None,
):
    """
    Run the full lesson plan generation pipeline.

    This function is called as a background task.
    If clarification_answers are provided, it resumes from the RAG step.
    """
    previous_state = _get_resume_state(task_id) if clarification_answers else {}

    # Initialize state
    state: PipelineState = {
        "task_id": task_id,
        "user_id": user_id,
        "user_input": user_input,
        "normalized_input": None,
        "is_out_of_scope": False,
        "rag_context": [],
        "low_confidence": False,
        "clarification_questions": [],
        "clarification_answers": clarification_answers,
        "draft_plan": None,
        "quality_result": None,
        "iteration": 0,
        "retry_count": 0,
        "current_model": settings.PRIMARY_MODEL,
        "fallback_model": None,
        "status": "generating",
        "final_plan": None,
        "is_blank_template": False,
        "docx_url": "",
        "error": None,
        "progress_step": "started",
    }

    if previous_state:
        state["normalized_input"] = previous_state.get("normalized_input")
        state["rag_context"] = previous_state.get("rag_context", [])
        state["low_confidence"] = previous_state.get("low_confidence", False)
        state["clarification_questions"] = previous_state.get(
            "clarification_questions", []
        )
        state["current_model"] = previous_state.get(
            "current_model", settings.PRIMARY_MODEL
        )
        state["fallback_model"] = previous_state.get("fallback_model")
        state["retry_count"] = previous_state.get("retry_count", 0)
        state["progress_step"] = previous_state.get("progress_step", "resuming")

    task_store[task_id] = state

    try:
        # ─── STEP 1: Intake ────────────────────────────────────
        if not clarification_answers:
            state["progress_step"] = "intake"
            update_lesson_plan_by_task_id(task_id, {"status": "generating"})

            intake_result = await run_intake(user_input)

            if intake_result.get("out_of_scope"):
                state["is_out_of_scope"] = True
                state["status"] = "failed"
                state["error"] = intake_result.get(
                    "message",
                    "Yêu cầu không liên quan đến soạn giáo án.",
                )
                state["progress_step"] = "out_of_scope"
                update_lesson_plan_by_task_id(
                    task_id,
                    {
                        "status": "failed",
                    },
                )
                task_store[task_id] = state
                return

            state["normalized_input"] = intake_result.get("normalized", user_input)
            state["progress_step"] = "intake_done"
            task_store[task_id] = state

            # ─── STEP 2: RAG ──────────────────────────────────────
            state["progress_step"] = "rag"
            ni = state["normalized_input"]
            rag_result = await run_rag(
                subject=ni["subject"],
                grade=ni["grade"],
                topic=ni["topic"],
                objectives=ni.get("objectives"),
            )

            state["rag_context"] = rag_result["rag_context"]
            state["low_confidence"] = rag_result["low_confidence"]
            state["clarification_questions"] = rag_result.get(
                "clarification_questions", []
            )
            state["progress_step"] = "rag_done"
            task_store[task_id] = state

            # ─── STEP 2.5: Clarification (if needed) ──────────────
            if rag_result["low_confidence"]:
                state["status"] = "clarifying"
                state["progress_step"] = "clarification_needed"
                task_store[task_id] = state

                await start_clarification(
                    task_id=task_id,
                    user_id=user_id,
                    questions=rag_result["clarification_questions"],
                )
                # Pipeline PAUSES here. Will be resumed when teacher answers.
                return
        else:
            # Resuming after clarification
            plan_record = get_lesson_plan_by_task_id(task_id)
            if not plan_record:
                raise ValueError(f"Lesson plan record not found for task {task_id}")

            state["normalized_input"] = {
                "subject": plan_record["subject"],
                "grade": plan_record["grade"],
                "topic": plan_record["topic"],
                "objectives": plan_record.get("objectives", []),
                "teaching_model": plan_record.get("teaching_model", "5E"),
            }
            state["progress_step"] = "rag_done"
            task_store[task_id] = state

        # ─── STEP 3: Generate ──────────────────────────────────
        ni = state["normalized_input"]
        quality_feedback = None

        for iteration in range(settings.MAX_ITERATIONS + 1):
            state["iteration"] = iteration
            state["progress_step"] = "generating"
            state["status"] = "generating"
            task_store[task_id] = state

            try:
                draft = await run_generator(
                    normalized_input=ni,
                    rag_context=state["rag_context"],
                    clarification_answers=state.get("clarification_answers"),
                    quality_feedback=quality_feedback,
                )
                state["draft_plan"] = draft
                state["progress_step"] = "draft_ready"
                task_store[task_id] = state
            except Exception as e:
                logger.error(f"Generator failed on iteration {iteration}: {e}")
                # Try with fallback
                draft, model_used, is_blank = await generate_with_fallback(
                    normalized_input=ni,
                    rag_context=state["rag_context"],
                    clarification_answers=state.get("clarification_answers"),
                    quality_feedback=quality_feedback,
                )
                state["draft_plan"] = draft
                state["current_model"] = model_used
                state["fallback_model"] = model_used or state.get("fallback_model")
                state["is_blank_template"] = is_blank
                task_store[task_id] = state

                if is_blank:
                    break

            # ─── STEP 4: Quality Check ─────────────────────────
            if not state["is_blank_template"] and state["draft_plan"]:
                state["progress_step"] = "quality_checking"
                task_store[task_id] = state

                quality_result = await run_quality_check(state["draft_plan"])
                state["quality_result"] = quality_result
                state["progress_step"] = "quality_done"
                task_store[task_id] = state

                if quality_result["status"] == "PASSED":
                    state["final_plan"] = state["draft_plan"]
                    state["final_plan"]["compliance"] = quality_result
                    break
                else:
                    quality_feedback = quality_result["errors"]
                    logger.info(
                        f"Quality check FAILED on iteration {iteration}. "
                        f"Errors: {len(quality_feedback)}"
                    )
            else:
                break

        # ─── STEP 5: Handle exhausted iterations ──────────────
        if not state.get("final_plan") and not state["is_blank_template"]:
            # Iterations exhausted, try fallback
            state["status"] = "retrying"
            state["progress_step"] = "retrying"
            task_store[task_id] = state

            draft, model_used, is_blank = await generate_with_fallback(
                normalized_input=ni,
                rag_context=state["rag_context"],
                clarification_answers=state.get("clarification_answers"),
            )

            if is_blank:
                state["is_blank_template"] = True
            else:
                state["final_plan"] = draft
                state["current_model"] = model_used
                state["fallback_model"] = model_used or state.get("fallback_model")

            task_store[task_id] = state

        # ─── STEP 6: Format & Export ──────────────────────────
        state["progress_step"] = "exporting"
        task_store[task_id] = state

        formatter_result = await run_formatter(
            plan=state.get("final_plan", {}),
            is_blank_template=state["is_blank_template"],
        )

        state["docx_url"] = formatter_result["docx_url"]
        state["progress_step"] = (
            "blank_template_ready" if state["is_blank_template"] else "export_done"
        )
        state["status"] = "completed" if not state["is_blank_template"] else "failed"
        task_store[task_id] = state

        # ─── Update DB ────────────────────────────────────────
        plan_id_record = get_lesson_plan_by_task_id(task_id)
        plan_id = plan_id_record["id"] if plan_id_record else None

        db_updates = {
            "status": "completed" if not state["is_blank_template"] else "failed",
            "content_json": state.get("final_plan"),
            "docx_url": state["docx_url"],
            "is_blank_template": state["is_blank_template"],
            "compliance_status": (
                state.get("quality_result", {}).get("status", "PENDING")
                if not state["is_blank_template"]
                else "PENDING"
            ),
            "retry_count": state["retry_count"],
            "fallback_model": state.get("fallback_model"),
        }
        update_lesson_plan_by_task_id(task_id, db_updates)

        # Save evaluation
        if plan_id and state.get("quality_result"):
            create_evaluation(
                lesson_plan_id=plan_id,
                is_passed=state["quality_result"]["status"] == "PASSED",
                error_details=state["quality_result"].get("errors", []),
            )

        logger.info(
            f"Pipeline completed for task {task_id}. "
            f"Status: {state['status']}, Blank: {state['is_blank_template']}"
        )

    except Exception as e:
        logger.exception(f"Pipeline error for task {task_id}: {e}")
        state["status"] = "failed"
        state["error"] = str(e)
        state["progress_step"] = "error"
        task_store[task_id] = state

        update_lesson_plan_by_task_id(
            task_id,
            {
                "status": "failed",
            },
        )
