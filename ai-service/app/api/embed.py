"""
POST /ai/embed — Embed text into vector
POST /ai/extract-text — Extract text from file URL
"""

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.embeddings import embedding_service
from app.services.file_parser import file_parser

logger = structlog.get_logger()

router = APIRouter(tags=["embed"])


# ─────────────────────────────────────────────────────────────
# POST /ai/embed
# ─────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    """Request body for /ai/embed."""
    text: str = Field(..., description="Text to embed")


class EmbedResponse(BaseModel):
    """Response for /ai/embed."""
    embedding: list[float]
    model: str
    dimensions: int


@router.post("/ai/embed", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    """
    Embed text into a vector using OpenAI text-embedding-3-small.
    Used by API Gateway to embed resources for vector search.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    logger.info("api.embed", text_length=len(request.text))

    try:
        embedding = await embedding_service.embed(request.text)
        return EmbedResponse(
            embedding=embedding,
            model="text-embedding-3-small",
            dimensions=len(embedding),
        )
    except Exception as e:
        logger.error("api.embed.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
# POST /ai/extract-text
# ─────────────────────────────────────────────────────────────

class ExtractTextRequest(BaseModel):
    """Request body for /ai/extract-text."""
    file_url: str = Field(..., description="URL of the file to extract text from")


class ExtractTextResponse(BaseModel):
    """Response for /ai/extract-text."""
    text: str
    page_count: int
    text_length: int


@router.post("/ai/extract-text", response_model=ExtractTextResponse)
async def extract_text(request: ExtractTextRequest):
    """
    Extract text content from a file URL.
    Supports PDF (pdfplumber), DOCX (python-docx), and plain text.
    Used by API Gateway for file preview and content extraction.
    """
    if not request.file_url.strip():
        raise HTTPException(status_code=400, detail="file_url cannot be empty")

    logger.info("api.extract_text", url=request.file_url[:100])

    try:
        import httpx
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(request.file_url)
            resp.raise_for_status()
            raw_bytes = resp.content

        text = file_parser.extract_from_bytes(raw_bytes, request.file_url)
        page_count = file_parser.get_page_count(raw_bytes, request.file_url)

        return ExtractTextResponse(
            text=text,
            page_count=page_count,
            text_length=len(text),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("api.extract_text.error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")
