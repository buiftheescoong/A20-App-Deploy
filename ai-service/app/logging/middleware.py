"""
Request tracing middleware.
Injects request_id into every log within a request lifecycle.
"""

import time
from uuid import uuid4

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Extracts or generates x-request-id
    2. Binds it to structlog contextvars (all logs in this request share it)
    3. Logs request start/complete with method, path, status, duration
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Extract or generate request_id
        request_id = request.headers.get("x-request-id", str(uuid4()))

        # Clear and bind contextvars for this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start_time = time.monotonic()

        logger.info(
            "request.start",
            method=request.method,
            path=str(request.url.path),
            query=str(request.url.query) if request.url.query else None,
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.monotonic() - start_time) * 1000)
            logger.error(
                "request.error",
                method=request.method,
                path=str(request.url.path),
                duration_ms=duration_ms,
                error=str(exc),
                exc_info=True,
            )
            raise

        duration_ms = round((time.monotonic() - start_time) * 1000)

        logger.info(
            "request.complete",
            method=request.method,
            path=str(request.url.path),
            status=response.status_code,
            duration_ms=duration_ms,
        )

        # Attach request_id to response headers for tracing
        response.headers["x-request-id"] = request_id
        return response
