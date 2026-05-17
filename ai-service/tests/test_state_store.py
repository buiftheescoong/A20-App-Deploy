from app.api.state_store import (
    STATE_TTL_SECONDS,
    build_initial_state,
    cleanup_expired_states,
    state_store,
    store_generation_state,
)


def test_build_initial_state_preserves_generation_contract():
    state = build_initial_state(
        plan_id="plan-1",
        request_id="req-1",
        subject="Toan",
        grade="8",
        topic="Don thuc",
        teaching_model="5E",
        objectives=["Nhan biet don thuc"],
        emphasis="Hoat dong nhom",
        special_requests="Ngan gon",
        uploaded_docs=["uploaded text"],
        resource_texts=["resource text"],
        system_resource_texts=["system text"],
    )

    assert state["plan_id"] == "plan-1"
    assert state["request_id"] == "req-1"
    assert state["rag_context"] == []
    assert state["generation_blueprint"] == {}
    assert state["current_markdown"] == ""
    assert state["current_plan"] == {}
    assert state["quality_result"] == {}
    assert state["iteration"] == 0
    assert state["stream_queue"] is None
    assert state["error"] is None
    assert "_created_at" in state


def test_cleanup_expired_states_keeps_running_pipeline_state():
    state_store.clear()
    expired_created_at = 1_000.0
    now = expired_created_at + STATE_TTL_SECONDS + 1

    store_generation_state("expired", {"_created_at": expired_created_at})
    store_generation_state(
        "running",
        {
            "_created_at": expired_created_at,
            "_pipeline_started": True,
            "stream_queue": object(),
        },
    )

    cleanup_expired_states(now=now)

    assert "expired" not in state_store
    assert "running" in state_store
    state_store.clear()
