"""
POST /ai/chat/:plan_id — Chat endpoint for refinement and Q&A.
Uses rule-based intent classification to route to refiner or QA.
"""

import asyncio
import json
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.api.generate import state_store
from app.standalone import refiner, qa

logger = structlog.get_logger()

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    """Request body for /ai/chat/:plan_id."""
    message: str = Field(..., description="User's chat message")
    file_urls: list[str] = Field(default_factory=list, description="Optional file URLs")
    current_markdown: Optional[str] = Field(
        default=None,
        description="Current lesson markdown supplied by Gateway for persisted plans",
    )
    current_plan: Optional[dict] = Field(
        default=None,
        description="Current lesson plan snapshot supplied by Gateway for persisted plans",
    )


class ChatResponse(BaseModel):
    """Response for /ai/chat/:plan_id."""
    status: str = "accepted"
    intent: str = ""


# ─────────────────────────────────────────────────────────────
# Rule-based intent classification — NO LLM call
# ─────────────────────────────────────────────────────────────

REFINE_KEYWORDS = [
    "sửa", "đổi", "thêm", "bớt", "làm lại", "thay", "chỉnh",
    "cập nhật", "update", "thay đổi", "bổ sung", "xóa", "loại bỏ",
    "viết lại", "modify", "edit", "change", "remove", "delete",
    "thêm vào", "bỏ đi", "điều chỉnh", "nâng cấp", "cải thiện",
]


def classify_intent(message: str) -> str:
    """
    Rule-based intent classification — no LLM call needed.

    Returns:
        'refine' if message contains modification keywords
        'qa' otherwise
    """
    message_lower = message.lower().strip()

    for keyword in REFINE_KEYWORDS:
        if keyword in message_lower:
            return "refine"

    return "qa"


@router.post("/ai/chat/{plan_id}")
async def chat(plan_id: str, request: ChatRequest):
    """
    Chat endpoint for lesson plan refinement and Q&A.

    Flow:
    1. Classify intent (rule-based, no LLM)
    2. Get plan state from store
    3. Create/reuse stream queue
    4. Route to refiner or QA in background
    5. Return SSE stream with results

    The response is an SSE stream:
    - For refine: emits 'chunk' events with modified markdown
    - For QA: emits 'chat' events with assistant response
    """
    message = request.message
    state = _resolve_chat_state(plan_id, request)

    if not state.get("current_plan"):
        raise HTTPException(
            status_code=400,
            detail="Plan has not been generated yet. Please wait for generation to complete.",
        )

    # Classify intent
    intent = classify_intent(message)

    logger.info(
        "chat.request",
        plan_id=plan_id,
        intent=intent,
        message_preview=message[:80],
    )

    # Create a fresh queue for this chat interaction
    queue = asyncio.Queue()

    async def chat_event_generator():
        """Run chat handler and stream events."""
        try:
            if intent == "refine":
                updated_plan = await refiner.refine(
                    plan_id=plan_id,
                    current_plan=state["current_plan"],
                    current_markdown=state.get("current_markdown", ""),
                    user_message=message,
                    stream_queue=queue,
                )

                # Update stored state with refinement
                if plan_id in state_store:
                    state_store[plan_id]["current_plan"] = updated_plan
                    refined_md = updated_plan.get("_refined_markdown", "")
                    if refined_md:
                        state_store[plan_id]["current_markdown"] = refined_md

                # Signal done
                await queue.put({
                    "event": "done",
                    "data": {
                        "plan_id": plan_id,
                        "status": "refined",
                        "intent": "refine",
                    },
                })

            else:  # QA
                await qa.answer(
                    plan_id=plan_id,
                    current_plan=state["current_plan"],
                    question=message,
                    stream_queue=queue,
                )

                # Signal done
                await queue.put({
                    "event": "done",
                    "data": {
                        "plan_id": plan_id,
                        "status": "answered",
                        "intent": "qa",
                    },
                })

        except Exception as e:
            logger.error(
                "chat.error",
                plan_id=plan_id,
                intent=intent,
                error=str(e),
                exc_info=True,
            )
            await queue.put({
                "event": "error",
                "data": {
                    "message": f"Chat error: {str(e)}",
                    "recoverable": True,
                },
            })

    # Start chat handler in background
    task = asyncio.create_task(chat_event_generator())

    async def sse_generator():
        """Yield SSE events from chat queue."""
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=120)
                except asyncio.TimeoutError:
                    yield {
                        "event": "error",
                        "data": json.dumps(
                            {"message": "Chat timeout", "recoverable": True},
                            ensure_ascii=False,
                        ),
                    }
                    break

                event_type = event.get("event", "message")
                event_data = event.get("data", {})
                data_str = json.dumps(event_data, ensure_ascii=False)

                yield {"event": event_type, "data": data_str}

                if event_type in ("done", "error"):
                    break
        except asyncio.CancelledError:
            pass
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return EventSourceResponse(sse_generator())


def _resolve_chat_state(plan_id: str, request: ChatRequest) -> dict:
    """Return active generation state, or hydrate a temporary state from Gateway."""
    state = state_store.get(plan_id)
    if state and state.get("current_plan"):
        return state

    current_markdown = (request.current_markdown or "").strip()
    current_plan = request.current_plan if isinstance(request.current_plan, dict) else {}

    if not current_plan and current_markdown:
        current_plan = {
            "plan_id": plan_id,
            "raw_markdown": current_markdown,
        }

    if current_plan:
        logger.info(
            "chat.hydrated_from_gateway",
            plan_id=plan_id,
            has_markdown=bool(current_markdown),
        )
        return {
            "plan_id": plan_id,
            "current_plan": current_plan,
            "current_markdown": current_markdown,
        }

    raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
