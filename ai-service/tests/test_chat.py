import pytest
from fastapi import HTTPException

from app.api.chat import ChatRequest, _resolve_chat_state
from app.api.state_store import state_store


def test_resolve_chat_state_uses_active_generation_state():
    state_store.clear()
    state_store["plan-1"] = {
        "current_plan": {"metadata": {"topic": "Active"}},
        "current_markdown": "# Active",
    }

    resolved = _resolve_chat_state(
        "plan-1",
        ChatRequest(
            message="Question",
            current_markdown="# Persisted",
            current_plan={"metadata": {"topic": "Persisted"}},
        ),
    )

    assert resolved["current_markdown"] == "# Active"
    state_store.clear()


def test_resolve_chat_state_hydrates_from_gateway_snapshot_when_state_is_missing():
    state_store.clear()

    resolved = _resolve_chat_state(
        "plan-2",
        ChatRequest(
            message="Them hoat dong nhom",
            current_markdown="# Lesson",
            current_plan={"metadata": {"subject": "Toan"}},
        ),
    )

    assert resolved["plan_id"] == "plan-2"
    assert resolved["current_markdown"] == "# Lesson"
    assert resolved["current_plan"]["metadata"]["subject"] == "Toan"


def test_resolve_chat_state_hydrates_minimal_plan_from_markdown():
    state_store.clear()

    resolved = _resolve_chat_state(
        "plan-3",
        ChatRequest(message="Them vi du", current_markdown="# Lesson"),
    )

    assert resolved["current_plan"]["raw_markdown"] == "# Lesson"
    assert resolved["current_markdown"] == "# Lesson"


def test_resolve_chat_state_raises_when_no_state_or_snapshot_exists():
    state_store.clear()

    with pytest.raises(HTTPException) as exc:
        _resolve_chat_state("missing", ChatRequest(message="Question"))

    assert exc.value.status_code == 404
