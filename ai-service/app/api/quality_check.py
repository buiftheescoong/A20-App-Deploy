"""
POST /ai/quality-check — Run quality check on a lesson plan markdown.
Called by the API Gateway on behalf of the frontend.
"""

import structlog
from fastapi import APIRouter
from typing import Any

from pydantic import BaseModel, Field

from app.graph.nodes.quality_checker import run as quality_checker_run

logger = structlog.get_logger()

router = APIRouter(tags=["quality-check"])


class QualityCheckRequest(BaseModel):
    plan_id: str = Field(..., description="Plan ID for logging")
    markdown: str = Field(..., description="Lesson plan markdown content")
    teaching_model: str = Field(default="5E", description="Teaching model: 5E | 3-phase")


class QualityCheckResponse(BaseModel):
    status: str
    score: int
    summary: str = ""
    errors: list[str]
    feedback: str
    checks: dict[str, bool] = Field(default_factory=dict)
    issues: list[dict[str, Any]] = Field(default_factory=list)
    passed_checks: list[str] = Field(default_factory=list)
    skipped_checks: list[dict[str, str]] = Field(default_factory=list)


@router.post("/ai/quality-check", response_model=QualityCheckResponse)
async def quality_check(request: QualityCheckRequest):
    """
    Run rule-based + LLM quality check on a lesson plan markdown.
    Returns status, score, errors, and feedback.
    """
    logger.info("quality_check.start", plan_id=request.plan_id)

    state = {
        "plan_id": request.plan_id,
        "current_markdown": request.markdown,
        "teaching_model": request.teaching_model,
        "stream_queue": None,
    }

    result_state = await quality_checker_run(state)
    qr = result_state.get("quality_result", {})

    logger.info(
        "quality_check.done",
        plan_id=request.plan_id,
        status=qr.get("status", "UNKNOWN"),
        score=qr.get("score", 0),
    )

    return QualityCheckResponse(
        status=qr.get("status", "FAILED"),
        score=qr.get("score", 0),
        summary=qr.get("summary", ""),
        errors=qr.get("errors", []),
        feedback=qr.get("feedback", ""),
        checks=qr.get("checks", {}),
        issues=qr.get("issues", []),
        passed_checks=qr.get("passed_checks", []),
        skipped_checks=qr.get("skipped_checks", []),
    )
