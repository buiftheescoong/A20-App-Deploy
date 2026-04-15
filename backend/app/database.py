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
\

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
    if "id" in data:
        record["id"] = data["id"]
        
    result = supabase.table("lesson_plans").insert(record).execute()
    return result.data[0] if result.data else {}


def get_lesson_plan(plan_id: str) -> Optional[dict]:
    """Get a lesson plan by ID."""
    try:
        result = (
            supabase.table("lesson_plans").select("*").eq("id", plan_id).limit(1).execute()
        )
        if not result.data:
            return None
        return result.data[0]
    except Exception as e:
        logger.error(f"Failed to get_lesson_plan: {e}")
        return None


def get_lesson_plan_by_task_id(task_id: str) -> Optional[dict]:
    """Get a lesson plan by task_id."""
    result = (
        supabase.table("lesson_plans")
        .select("*")
        .eq("task_id", task_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


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
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


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


# ─── Chat Message Helpers ──────────────────────────────────────────


def save_message(
    plan_id: str,
    role: str,
    content: str,
    message_type: str = "chat",
    attached_files: list = None,
) -> dict:
    """Save a chat message to lesson_plan_messages or fallback to content_json."""
    import uuid
    import datetime
    
    record = {
        "plan_id": plan_id,
        "role": role,  # 'user' | 'assistant' | 'system'
        "content": content,
        "message_type": message_type,  # 'chat' | 'clarification' | 'refinement'
        "attached_files": attached_files or [],
        "created_at": datetime.datetime.utcnow().isoformat()
    }
    try:
        result = supabase.table("lesson_plan_messages").insert(record).execute()
        return result.data[0] if result.data else {}
    except Exception as e:
        if 'PGRST205' in str(e):
            logger.warning("lesson_plan_messages missing, fallback to content_json")
            try:
                plan = get_lesson_plan(plan_id)
                if plan:
                    content_json = plan.get("content_json") or {}
                    history = content_json.get("_chat_history", [])
                    record["id"] = str(uuid.uuid4())
                    history.append(record)
                    content_json["_chat_history"] = history
                    supabase.table("lesson_plans").update({"content_json": content_json}).eq("id", plan_id).execute()
                    return record
            except Exception as inner_e:
                logger.error(f"Fallback save_message failed: {inner_e}")
        else:
            logger.error(f"Failed to save message: {e}")
        return {}


def get_chat_history(plan_id: str, limit: int = 20) -> list[dict]:
    """Get chat history from database table or fallback to content_json."""
    try:
        result = (
            supabase.table("lesson_plan_messages")
            .select("*")
            .eq("plan_id", plan_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        if 'PGRST205' in str(e):
            plan = get_lesson_plan(plan_id)
            if plan:
                content_json = plan.get("content_json") or {}
                history = content_json.get("_chat_history", [])
                # Return the last `limit` items
                return history[-limit:] if limit > 0 else history
        logger.error(f"Failed to get chat history: {e}")
        return []


# ─── Session State Checkpoint Helpers ─────────────────────────────


def save_checkpoint(plan_id: str, state_key: str, state_value: dict) -> None:
    """
    Save a LangGraph checkpoint to lesson_plans.session_state.
    Uses JSON merge to preserve other checkpoint keys.

    Checkpoints are saved at 3 key moments:
    1. After RAG done (rag_context, normalized_input)
    2. After clarification triggered (clarification_questions)
    3. After generation done (final_plan) — already handled by update_lesson_plan
    """
    try:
        # Get current session_state
        current = get_lesson_plan(plan_id)
        if not current:
            return
            
        try:
            current_state = current.get("session_state", {}) if current else {}
            # Merge new key
            current_state[state_key] = state_value
            supabase.table("lesson_plans").update(
                {"session_state": current_state}
            ).eq("id", plan_id).execute()
        except Exception as e:
            if 'PGRST204' in str(e) or 'PGRST116' in str(e):
                logger.warning("session_state column missing, using content_json as fallback")
                content = current.get("content_json") or {}
                content_state = content.get("_session_state", {})
                content_state[state_key] = state_value
                content["_session_state"] = content_state
                supabase.table("lesson_plans").update({"content_json": content}).eq("id", plan_id).execute()
            else:
                logger.error(f"Failed to save checkpoint [{state_key}]: {e}")
    except Exception as e:
        logger.error(f"Failed to save checkpoint [{state_key}]: {e}")


def get_checkpoint(plan_id: str, state_key: str) -> dict | None:
    """Restore a LangGraph checkpoint from lesson_plans.session_state."""
    try:
        record = get_lesson_plan(plan_id)
        if not record:
            return None
        session_state = record.get("session_state")
        if session_state is None:
            # Fallback to content_json
            content = record.get("content_json") or {}
            session_state = content.get("_session_state", {})
            
        return session_state.get(state_key)
    except Exception as e:
        logger.error(f"Failed to get checkpoint [{state_key}]: {e}")
        return None


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
