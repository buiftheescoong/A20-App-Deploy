"""
Internal auth middleware for AI Service.

Validates the X-AI-Service-Secret header on all requests except public
health/docs endpoints. When AI_SERVICE_SECRET is empty (dev mode) all
requests are allowed through without any check.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

# Paths that are always allowed without a secret header.
_PUBLIC_PREFIXES = ("/ai/health", "/docs", "/openapi.json", "/redoc")


class AIServiceAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests that don't carry the correct X-AI-Service-Secret header.

    Behaviour:
    - If ``settings.AI_SERVICE_SECRET`` is empty → dev mode, skip all checks.
    - If the request path starts with a public prefix → skip check.
    - Otherwise require the header to match the configured secret exactly;
      return HTTP 401 if it is missing or wrong.
    """

    async def dispatch(self, request: Request, call_next):
        # Dev mode: secret not configured → allow everything.
        if not settings.AI_SERVICE_SECRET:
            return await call_next(request)

        # Public endpoints: health probe, Swagger UI, OpenAPI schema.
        for prefix in _PUBLIC_PREFIXES:
            if request.url.path.startswith(prefix):
                return await call_next(request)

        # Validate shared secret.
        provided = request.headers.get("X-AI-Service-Secret", "")
        if provided != settings.AI_SERVICE_SECRET:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: missing or invalid X-AI-Service-Secret header"},
            )

        return await call_next(request)
