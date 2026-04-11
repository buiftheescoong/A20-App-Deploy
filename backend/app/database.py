"""
Supabase client and database helper functions.
Person B owns this file.
"""

import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

# Logic chuyển đổi giữa Real Supabase và Mock Database
if getattr(settings, "USE_MOCK_DB", False):
    logger.info("🛠️ Đang sử dụng Mock Database (Offline Mode)")
    from app.mock_database import mock_supabase as supabase
else:
    logger.info("🌐 Đang sử dụng Real Supabase (Cloud Mode)")
    from supabase import create_client, Client

    supabase: Client = create_client(
        settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
    )


# ─── Lesson Plan Helpers ───────────────────────────────────────────


def create_lesson_plan(user_id: str, data: dict) -> dict:
    """Insert a new lesson plan record."""
    record = {
        "user_id": user_id,
        "subject": data["subject"],
        "grade": data["grade"],
        "topic": data["topic"],
        "teaching_model": data.get("teaching_model", "5E"),
        "objectives": data.get("objectives", []),
        "status": "pending",
        "task_id": data.get("task_id"),
    }
    result = supabase.table("lesson_plans").insert(record).execute()
    return result.data[0] if result.data else {}


def get_lesson_plan(plan_id: str) -> Optional[dict]:
    """Get a lesson plan by ID."""
    result = (
        supabase.table("lesson_plans").select("*").eq("id", plan_id).single().execute()
    )
    return result.data


def get_lesson_plan_by_task_id(task_id: str) -> Optional[dict]:
    """Get a lesson plan by task_id."""
    result = (
        supabase.table("lesson_plans")
        .select("*")
        .eq("task_id", task_id)
        .single()
        .execute()
    )
    return result.data


def get_lesson_plans_by_user(
    user_id: str, limit: int = 20, offset: int = 0
) -> list[dict]:
    """Get all lesson plans for a user, paginated."""
    result = (
        supabase.table("lesson_plans")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []


def update_lesson_plan(plan_id: str, updates: dict) -> dict:
    """Update a lesson plan record."""
    result = supabase.table("lesson_plans").update(updates).eq("id", plan_id).execute()
    return result.data[0] if result.data else {}


def update_lesson_plan_by_task_id(task_id: str, updates: dict) -> dict:
    """Update a lesson plan record by task_id."""
    result = (
        supabase.table("lesson_plans").update(updates).eq("task_id", task_id).execute()
    )
    return result.data[0] if result.data else {}


def delete_lesson_plan(plan_id: str) -> bool:
    """Delete a lesson plan by ID."""
    result = supabase.table("lesson_plans").delete().eq("id", plan_id).execute()
    return bool(result.data)


# ─── Evaluation Helpers ────────────────────────────────────────────


def create_evaluation(
    lesson_plan_id: str, is_passed: bool, error_details: list
) -> dict:
    """Insert an evaluation record."""
    record = {
        "lesson_plan_id": lesson_plan_id,
        "is_passed": is_passed,
        "error_details": error_details,
    }
    result = supabase.table("evaluations").insert(record).execute()
    return result.data[0] if result.data else {}


# ─── Clarification Helpers ─────────────────────────────────────────


def create_clarification_session(
    task_id: str, user_id: str, questions: list[str]
) -> dict:
    """Create a clarification session."""
    record = {
        "task_id": task_id,
        "user_id": user_id,
        "questions": [{"question": q, "answer": None} for q in questions],
        "status": "pending",
    }
    result = supabase.table("clarification_sessions").insert(record).execute()
    return result.data[0] if result.data else {}


def get_clarification_session(task_id: str) -> Optional[dict]:
    """Get a clarification session by task_id."""
    result = (
        supabase.table("clarification_sessions")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at", desc=True)
        .limit(1)
        .single()
        .execute()
    )
    return result.data


def update_clarification_session(task_id: str, answers: list[dict]) -> dict:
    """Update a clarification session with answers."""
    result = (
        supabase.table("clarification_sessions")
        .update({"answers": answers, "status": "answered"})
        .eq("task_id", task_id)
        .execute()
    )
    return result.data[0] if result.data else {}


# ─── Blank Template Helper ─────────────────────────────────────────


def get_blank_template_url() -> str:
    """Get the public URL of the blank template DOCX from Supabase Storage."""
    try:
        result = supabase.storage.from_("templates").get_public_url(
            "blank_template.docx"
        )
        return result
    except Exception as e:
        logger.error(f"Failed to get blank template URL: {e}")
        return ""
