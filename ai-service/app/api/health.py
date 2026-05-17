"""
Health check endpoint.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/ai/health")
async def health_check():
    """
    Health check endpoint for load balancers and monitoring.
    Returns service status and configured models.
    """
    from app.config import settings

    return {
        "status": "ok",
        "service": "ai-service",
        "version": "2.0.0",
        "models": {
            "primary": settings.PRIMARY_MODEL,
            "cheap": settings.CHEAP_MODEL,
            "fallback": settings.FALLBACK_MODEL,
            "embedding": settings.EMBEDDING_MODEL,
        },
        "tracing": {
            "langsmith": settings.LANGSMITH_TRACING,
            "project": settings.LANGSMITH_PROJECT,
        },
    }
