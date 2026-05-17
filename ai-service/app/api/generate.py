"""
POST /ai/generate — Kick off lesson plan generation pipeline.
Receives request from API Gateway, stores initial state, returns 202 accepted.
"""

import asyncio
from uuid import uuid4

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings
from app.api.state_store import build_initial_state, cleanup_expired_states, state_store, store_generation_state
from app.services.file_parser import file_parser
from app.services.vector_store import vector_store

logger = structlog.get_logger()

router = APIRouter(tags=["generate"])

async def _parse_uploaded_files(plan_id: str, file_urls: list[str]) -> list[str]:
    """Extract uploaded file text concurrently with a bounded fanout."""
    if not file_urls:
        return []

    semaphore = asyncio.Semaphore(max(1, settings.FILE_PARSE_CONCURRENCY))

    async def parse_one(url: str) -> str:
        async with semaphore:
            try:
                text = await file_parser.extract_from_url(url)
                return text.strip()
            except Exception as e:
                logger.warning(
                    "generate.file_parse_error",
                    plan_id=plan_id,
                    url=url[:100],
                    error=str(e),
                )
                return ""

    parsed = await asyncio.gather(*(parse_one(url) for url in file_urls))
    return [text for text in parsed if text]


class GenerateRequest(BaseModel):
    """Request body for /ai/generate."""
    plan_id: str = Field(..., description="Unique plan ID from Gateway")
    request_id: str = Field(default_factory=lambda: str(uuid4()), description="Trace ID")
    subject: str = Field(..., description="Môn học")
    grade: str = Field(..., description="Lớp")
    topic: str = Field(..., description="Tên bài học")
    teaching_model: str = Field(default="5E", description="Mô hình dạy: 5E | 3-phase")
    objectives: list[str] = Field(default_factory=list, description="Mục tiêu bài học")
    emphasis: str = Field(default="", description="Nội dung muốn nhấn mạnh")
    special_requests: str = Field(default="", description="Yêu cầu đặc biệt")
    file_urls: list[str] = Field(default_factory=list, description="URLs of uploaded files")
    resource_ids: list[str] = Field(default_factory=list, description="User resource IDs")
    system_resource_ids: list[str] = Field(
        default_factory=list,
        description="System resource IDs (SGK/SGV) user selected",
    )
    system_resource_texts: list[str] = Field(
        default_factory=list,
        description="Pre-resolved system resource texts from Gateway (avoids redundant DB lookup)",
    )
    resource_contexts: list[dict] = Field(
        default_factory=list,
        description="User resource metadata plus content_text for citation-aware RAG",
    )
    system_resource_contexts: list[dict] = Field(
        default_factory=list,
        description="System resource metadata plus content_text for citation-aware RAG",
    )


class GenerateResponse(BaseModel):
    """Response for /ai/generate."""
    status: str = "accepted"
    plan_id: str
    request_id: str


@router.post("/ai/generate", response_model=GenerateResponse, status_code=202)
async def generate(request: GenerateRequest):
    """
    Khởi chạy pipeline tạo giáo án.

    1. Parse files from file_urls
    2. Resolve system_resource_ids → get content text from DB
    3. Initialize GraphState
    4. Store state (waiting for SSE connection via /ai/stream/:plan_id)
    5. Return 202 accepted
    """
    plan_id = request.plan_id
    request_id = request.request_id

    logger.info(
        "generate.start",
        plan_id=plan_id,
        request_id=request_id,
        subject=request.subject,
        grade=request.grade,
        topic=request.topic,
        teaching_model=request.teaching_model,
        file_urls_count=len(request.file_urls),
        resource_ids_count=len(request.resource_ids),
        system_resource_ids_count=len(request.system_resource_ids),
    )

    # --- 1. Parse uploaded files ---
    uploaded_docs = await _parse_uploaded_files(plan_id, request.file_urls)

    # --- 2. Resolve system resource IDs → content text ---
    # Use pre-resolved texts from Gateway if provided; otherwise resolve from IDs
    system_resource_contexts: list[dict] = []
    system_resource_texts: list[str] = []
    if request.system_resource_contexts:
        system_resource_contexts = _valid_contexts(request.system_resource_contexts)
        system_resource_texts = [str(item["content_text"]) for item in system_resource_contexts]
        logger.info(
            "generate.system_resource_contexts_from_gateway",
            plan_id=plan_id,
            count=len(system_resource_contexts),
        )
    elif request.system_resource_texts:
        system_resource_texts = list(request.system_resource_texts)
        system_resource_contexts = [
            _context_from_text(text, index, "system_resource")
            for index, text in enumerate(system_resource_texts, start=1)
        ]
        logger.info(
            "generate.system_resources_from_gateway",
            plan_id=plan_id,
            count=len(system_resource_texts),
        )
    else:
        resource_map = await vector_store.get_resource_contexts(request.system_resource_ids)
        for sr_id in request.system_resource_ids:
            context = resource_map.get(sr_id)
            if context:
                system_resource_contexts.append(context)
                system_resource_texts.append(str(context["content_text"]))
            else:
                logger.warning(
                    "generate.system_resource_not_found",
                    plan_id=plan_id,
                    resource_id=sr_id,
                )

    # --- 2b. Resolve user resource IDs → content text ---
    resource_contexts: list[dict] = []
    resource_texts: list[str] = []
    if request.resource_contexts:
        resource_contexts = _valid_contexts(request.resource_contexts)
        resource_texts = [str(item["content_text"]) for item in resource_contexts]
    else:
        resource_map = await vector_store.get_resource_contexts(request.resource_ids)
        for r_id in request.resource_ids:
            context = resource_map.get(r_id)
            if context:
                resource_contexts.append(context)
                resource_texts.append(str(context["content_text"]))
            else:
                logger.warning(
                    "generate.resource_not_found",
                    plan_id=plan_id,
                    resource_id=r_id,
                )

    # --- 3. Initialize GraphState ---
    initial_state = build_initial_state(
        plan_id=plan_id,
        request_id=request_id,
        subject=request.subject,
        grade=request.grade,
        topic=request.topic,
        teaching_model=request.teaching_model,
        objectives=request.objectives,
        emphasis=request.emphasis,
        special_requests=request.special_requests,
        uploaded_docs=uploaded_docs,
        resource_texts=resource_texts,
        system_resource_texts=system_resource_texts,
        resource_contexts=resource_contexts,
        system_resource_contexts=system_resource_contexts,
    )

    # --- 4. Store state ---
    store_generation_state(plan_id, initial_state)

    logger.info(
        "generate.accepted",
        plan_id=plan_id,
        uploaded_docs=len(uploaded_docs),
        user_resources=len(resource_texts),
        system_resources=len(system_resource_texts),
    )

    return GenerateResponse(
        status="accepted",
        plan_id=plan_id,
        request_id=request_id,
    )


def _valid_contexts(items: list[dict]) -> list[dict]:
    contexts: list[dict] = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        text = str(item.get("content_text") or "").strip()
        if not text:
            continue
        metadata = item.get("metadata") or {}
        contexts.append({
            "id": str(item.get("id") or f"resource_{index}"),
            "filename": str(item.get("filename") or f"resource_{index}"),
            "content_text": text,
            "category": item.get("category"),
            "subject": item.get("subject"),
            "grade": item.get("grade"),
            "metadata": metadata if isinstance(metadata, dict) else {},
        })
    return contexts


def _context_from_text(text: str, index: int, prefix: str) -> dict:
    return {
        "id": f"{prefix}_{index}",
        "filename": f"{prefix}_{index}",
        "content_text": text,
        "category": None,
        "subject": None,
        "grade": None,
        "metadata": {"source": prefix},
    }
