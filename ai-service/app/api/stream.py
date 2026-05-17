"""
GET /ai/stream/:plan_id — SSE streaming endpoint.
When client connects, creates a queue, runs the pipeline in background,
and yields events from the queue as Server-Sent Events.
"""

import asyncio
import json

import structlog
from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.api.state_store import state_store

logger = structlog.get_logger()

# Per-plan locks to prevent double pipeline start (e.g. React StrictMode double-render)
_pipeline_locks: dict[str, asyncio.Lock] = {}

router = APIRouter(tags=["stream"])


async def run_pipeline(state: dict) -> None:
    """
    Run the LangGraph pipeline in the background.
    Results are pushed to state['stream_queue'].
    """
    plan_id = state.get("plan_id", "unknown")
    queue = state.get("stream_queue")

    try:
        # Import here to avoid circular imports at module level
        from app.graph.pipeline import pipeline

        logger.info("pipeline.start", plan_id=plan_id)

        # LangGraph invoke — runs all nodes in sequence
        result = await pipeline.ainvoke(state)

        # Update the state store with final result
        if plan_id in state_store:
            state_store[plan_id].update({
                "current_markdown": result.get("current_markdown", ""),
                "current_plan": result.get("current_plan", {}),
                "generation_blueprint": result.get("generation_blueprint", {}),
                "quality_result": result.get("quality_result", {}),
                "iteration": result.get("iteration", 0),
                "error": result.get("error"),
            })

        logger.info(
            "pipeline.complete",
            plan_id=plan_id,
            iteration=result.get("iteration", 0),
            quality_status=result.get("quality_result", {}).get("status", "UNKNOWN"),
        )

    except Exception as e:
        logger.error(
            "pipeline.error",
            plan_id=plan_id,
            error=str(e),
            exc_info=True,
        )
        # Push error event to the stream
        if queue:
            try:
                await queue.put({
                    "event": "error",
                    "data": {
                        "message": f"Pipeline error: {str(e)}",
                        "recoverable": False,
                    },
                })
            except Exception:
                pass


@router.get("/ai/plans/{plan_id}/docx")
async def get_docx(plan_id: str):
    """Return DOCX bytes for a completed plan."""
    from fastapi.responses import Response
    state = state_store.get(plan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")

    plan = state.get("current_plan", {})
    markdown = state.get("current_markdown", "")
    if not markdown and not plan:
        raise HTTPException(status_code=404, detail="Plan not yet generated")

    from app.graph.nodes.formatter import _generate_docx_bytes
    docx_bytes = _generate_docx_bytes(plan, markdown)
    if not docx_bytes:
        raise HTTPException(status_code=500, detail="DOCX generation failed")

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=giao_an_{plan_id}.docx"},
    )


@router.get("/ai/stream/{plan_id}")
async def stream(plan_id: str, request: Request):
    """
    SSE endpoint for streaming pipeline events.

    When client connects:
    1. Creates asyncio.Queue
    2. Attaches queue to the plan's state
    3. Runs pipeline in background task
    4. Yields events from queue as SSE

    Event types follow the streaming contract:
    - progress: Pipeline step updates
    - chunk: Markdown content deltas
    - plan: Full JSON lesson plan
    - done: Generation complete
    - error: Error occurred
    """
    state = state_store.get(plan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")

    # Reuse existing queue if pipeline already running (avoids double-connect from StrictMode)
    existing_queue = state.get("stream_queue")
    if existing_queue is not None:
        queue = existing_queue
    else:
        queue = asyncio.Queue()
        state["stream_queue"] = queue

    logger.info("stream.connect", plan_id=plan_id)

    async def event_generator():
        """Generate SSE events from the pipeline queue."""
        # Acquire a per-plan lock to prevent simultaneous starts (e.g. React StrictMode)
        if plan_id not in _pipeline_locks:
            _pipeline_locks[plan_id] = asyncio.Lock()
        async with _pipeline_locks[plan_id]:
            if not state.get("_pipeline_started"):
                state["_pipeline_started"] = True
                task = asyncio.create_task(run_pipeline(state))
            else:
                task = None

        try:
            while True:
                try:
                    # Wait for next event with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=300)
                except asyncio.TimeoutError:
                    logger.warning("stream.timeout", plan_id=plan_id)
                    yield {
                        "event": "error",
                        "data": json.dumps(
                            {"message": "Stream timeout (300s)", "recoverable": False},
                            ensure_ascii=False,
                        ),
                    }
                    break

                event_type = event.get("event", "message")
                event_data = event.get("data", {})

                # Serialize data to JSON string
                data_str = json.dumps(event_data, ensure_ascii=False)

                yield {"event": event_type, "data": data_str}

                # If done or error, stop streaming
                if event_type in ("done", "error"):
                    break

        except asyncio.CancelledError:
            logger.info("stream.cancelled", plan_id=plan_id)
        except Exception as e:
            logger.error("stream.error", plan_id=plan_id, error=str(e))
            yield {
                "event": "error",
                "data": json.dumps(
                    {"message": str(e), "recoverable": False},
                    ensure_ascii=False,
                ),
            }
        finally:
            # Do NOT cancel pipeline — let it finish so state_store gets updated
            _pipeline_locks.pop(plan_id, None)
            logger.info("stream.disconnect", plan_id=plan_id)

    return EventSourceResponse(
        event_generator(),
        ping=15,            # send :ping every 15s to keep connection alive
        send_timeout=300,   # allow up to 5 minutes for slow LLM responses
    )
