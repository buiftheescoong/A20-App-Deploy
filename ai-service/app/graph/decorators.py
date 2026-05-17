"""
Node execution logger decorator.
Automatically logs start/complete/error for each graph node.
"""

import time
import functools
from typing import Callable

import structlog

logger = structlog.get_logger()


def log_node(func: Callable) -> Callable:
    """
    Decorator that wraps a graph node function with structured logging.
    
    Logs:
    - node.start: when the node begins execution
    - node.complete: when the node finishes (with duration_ms)
    - node.error: when the node raises an exception (with error details)
    
    Usage:
        @log_node
        @traceable(name="rag_retrieval")
        async def run(state: GraphState) -> dict:
            ...
    """

    @functools.wraps(func)
    async def wrapper(state: dict) -> dict:
        node_name = func.__name__
        plan_id = state.get("plan_id", "unknown")
        start = time.monotonic()

        logger.info(
            "node.start",
            node=node_name,
            plan_id=plan_id,
            iteration=state.get("iteration", 0),
        )

        try:
            result = await func(state)
            elapsed = (time.monotonic() - start) * 1000

            logger.info(
                "node.complete",
                node=node_name,
                plan_id=plan_id,
                duration_ms=round(elapsed),
                iteration=state.get("iteration", 0),
            )

            return result
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000

            logger.error(
                "node.error",
                node=node_name,
                plan_id=plan_id,
                duration_ms=round(elapsed),
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            raise

    return wrapper
