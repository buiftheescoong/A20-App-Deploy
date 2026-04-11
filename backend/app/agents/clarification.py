"""
Clarification Agent — manages the clarification flow when RAG confidence is low.
Person A owns this file.

Responsibilities:
- Store clarification questions in the database
- Pause pipeline until teacher provides answers
- Resume pipeline with enriched context
"""

import logging
from app.database import (
    create_clarification_session,
    get_clarification_session,
    update_clarification_session,
    update_lesson_plan_by_task_id,
)

logger = logging.getLogger(__name__)


async def start_clarification(
    task_id: str,
    user_id: str,
    questions: list[str],
) -> dict:
    """
    Initiate a clarification session.
    Pipeline pauses here until teacher answers.

    Args:
        task_id: The current pipeline task ID
        user_id: The teacher's user ID
        questions: List of clarification questions

    Returns:
        The created clarification session record
    """
    # Update lesson plan status to 'clarifying'
    update_lesson_plan_by_task_id(
        task_id,
        {"status": "clarifying"},
    )

    # Create clarification session in DB
    session = create_clarification_session(task_id, user_id, questions)
    logger.info(
        f"Clarification session created for task {task_id} "
        f"with {len(questions)} questions"
    )

    return session


async def get_clarification_status(task_id: str) -> dict:
    """
    Check clarification status for a task.

    Returns:
        Clarification session dict or None
    """
    return get_clarification_session(task_id)


async def submit_clarification_answers(task_id: str, answers: list[dict]) -> dict:
    """
    Submit teacher's answers to clarification questions.
    This will resume the pipeline.

    Args:
        task_id: The current pipeline task ID
        answers: List of {question, answer} dicts

    Returns:
        Updated clarification session
    """
    session = update_clarification_session(task_id, answers)

    # Update lesson plan status back to 'generating'
    update_lesson_plan_by_task_id(
        task_id,
        {"status": "generating"},
    )

    logger.info(f"Clarification answers submitted for task {task_id}")
    return session
