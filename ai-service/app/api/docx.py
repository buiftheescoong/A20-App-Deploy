"""DOCX rendering endpoint for saved lesson plans."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.docx_formatter import generate_docx_bytes

router = APIRouter(tags=["docx"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class DocxRenderRequest(BaseModel):
    """Request body for rendering a saved lesson plan to DOCX."""

    plan_id: str = Field(..., description="Lesson plan ID from the API Gateway")
    plan: dict = Field(default_factory=dict, description="Structured lesson plan JSON/metadata")
    markdown: str = Field(default="", description="Saved lesson plan markdown")


@router.post("/ai/docx")
async def render_docx(request: DocxRenderRequest):
    """Render saved lesson content to DOCX bytes."""
    if not request.markdown.strip() and not request.plan:
        raise HTTPException(status_code=422, detail="Plan content is not ready for DOCX export")

    docx_bytes = generate_docx_bytes(request.plan, request.markdown)
    if not docx_bytes:
        raise HTTPException(status_code=500, detail="DOCX generation failed")

    return Response(
        content=docx_bytes,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename=giao_an_{request.plan_id}.docx"},
    )
