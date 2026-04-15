"""
SSE Streaming Controller.
Handles Server-Sent Events for real-time progress and chunks updates.
"""

import json
import asyncio
import logging
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.agents.pipeline import run_pipeline_graph

logger = logging.getLogger(__name__)

router = APIRouter()

# Global registry for SSE queues mapped by plan_id
GLOBAL_STREAM_QUEUES = {}

@router.get("/api/stream/{plan_id}")
async def stream_lesson_plan(plan_id: str, request: Request):
    """
    SSE endpoint tracking LangGraph execution for a specific plan.
    Provides real-time updates for:
    - Progress steps (Retrieving, generating...)
    - Chat chunks (delta text)
    - Full plan JSON
    - Done/Error status
    """
    async def event_generator():
        # Setup a queue to receive events from the graph nodes
        queue = asyncio.Queue()
        GLOBAL_STREAM_QUEUES[plan_id] = queue
        
        # Start graph execution in the background
        task = asyncio.create_task(run_pipeline_graph(plan_id, queue))
        
        try:
            while True:
                # If client disconnected, cancel the graph task
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from stream for plan {plan_id}")
                    task.cancel()
                    break

                # Wait for next event from the queue
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    
                    # Yield SSE formatted message
                    # sse_starlette interprets dict with standard fields
                    yield {
                        "event": event.get("type", "message"),
                        "data": json.dumps(event.get("data", {}), ensure_ascii=False)
                    }

                    if event.get("type") == "error":
                        # We only break on fatal errors to prevent zombies, but let done stay alive 
                        # so the queue can receive chat stream updates!
                        break

                except asyncio.TimeoutError:
                    # Heartbeat or just check connection status
                    continue

        except asyncio.CancelledError:
            pass
        finally:
            if plan_id in GLOBAL_STREAM_QUEUES:
                del GLOBAL_STREAM_QUEUES[plan_id]
            if not task.done():
                task.cancel()
                
    return EventSourceResponse(event_generator())
