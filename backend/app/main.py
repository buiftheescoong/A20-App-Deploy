"""
FastAPI application entry point.
Person A sets up, everyone uses.

Includes:
- CORS middleware
- Auth middleware (simplified)
- All API route registrations
- Health check endpoint
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import generate, clarification, check, edit, lesson_plans

# ─── Logging ──────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Soạn Giáo Án Thông Minh — Backend started")
    logger.info(f"Primary model: {settings.PRIMARY_MODEL}")
    logger.info(f"Fallback model: {settings.FALLBACK_MODEL}")
    yield
    logger.info("Backend shutting down")


# ─── App ──────────────────────────────────────────────────────────

app = FastAPI(
    title="Soạn Giáo Án Thông Minh API",
    description="AI Multi-Agent System for Lesson Plan Generation (GDPT 2018)",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth Middleware (Simplified) ─────────────────────────────────

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Simplified auth middleware.
    In production: verify Supabase JWT from Authorization header.
    For now: extract user_id from header or use mock.
    """
    # Skip auth for health check and docs
    if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"]:
        response = await call_next(request)
        return response

    auth_header = request.headers.get("Authorization", "")
    
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        # TODO: Verify Supabase JWT and extract user_id
        # For now, use the token as user_id (mock)
        try:
            from app.database import supabase
            user_response = supabase.auth.get_user(token)
            request.state.user_id = user_response.user.id
        except Exception:
            # Fallback to mock user for development
            request.state.user_id = "mock-user-id"
    else:
        request.state.user_id = "mock-user-id"

    response = await call_next(request)
    return response


# ─── Routes ───────────────────────────────────────────────────────

app.include_router(generate.router, tags=["Generate"])
app.include_router(clarification.router, tags=["Clarification"])
app.include_router(check.router, tags=["Quality Check"])
app.include_router(edit.router, tags=["Edit"])
app.include_router(lesson_plans.router, tags=["Lesson Plans"])


# ─── Health Check ─────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "soan-giao-an-thong-minh",
        "version": "1.0.0",
    }
