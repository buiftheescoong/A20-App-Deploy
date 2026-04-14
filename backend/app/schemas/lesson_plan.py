"""
Shared Pydantic schemas — Person B creates, Person A imports.
This is the API contract between backend and frontend. DO NOT change after kickoff.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal

# ─── Lesson Plan Content Types ─────────────────────────────────────


class SectionContent(BaseModel):
    """A single section/activity of the lesson plan."""

    title: str
    content: str
    duration: int  # phút


class LessonSections5E(BaseModel):
    """5E model sections."""

    engage: SectionContent
    explore: SectionContent
    explain: SectionContent
    elaborate: SectionContent
    evaluate: SectionContent


class LessonSections3Phase(BaseModel):
    """3-Phase model sections."""

    opening: SectionContent  # Mở đầu
    knowledge: SectionContent  # Hình thành kiến thức
    practice: SectionContent  # Luyện tập


class LessonMetadata(BaseModel):
    """Metadata for a lesson plan."""

    subject: str
    grade: str
    topic: str
    teaching_model: Literal["5E", "3-phase"]
    duration_minutes: int = 45
    objectives: list[str] = []
    competencies: list[str] = []
    materials: list[str] = []


class QualityResult(BaseModel):
    """Quality check result."""

    status: Literal["PASSED", "FAILED"] = "FAILED"
    errors: list[dict] = []  # [{section, issue, suggestion}]


class ClarificationSession(BaseModel):
    """Clarification session when RAG confidence is low."""

    task_id: str
    questions: list[str]
    answers: list[dict] = []  # [{question, answer}]
    status: Literal["pending", "answered"] = "pending"


class LessonPlanJSON(BaseModel):
    """Full lesson plan JSON — the core output of the pipeline."""

    metadata: LessonMetadata
    sections: dict  # Can be 5E or 3-phase format
    rag_sources: list[str] = []
    compliance: QualityResult = QualityResult()
    clarification_needed: bool = False


# ─── API Request/Response Models ───────────────────────────────────


class GenerateRequest(BaseModel):
    """POST /api/generate request body."""

    subject: str
    grade: str
    topic: str
    objectives: list[str]
    teaching_model: Literal["5E", "3-phase"] = "5E"


class EditRequest(BaseModel):
    """POST /api/edit request body."""

    lesson_plan_id: str
    section_id: str  # "engage" | "explore" | "explain" | etc.
    edit_prompt: str  # "Thiết kế lại thành minigame 10 phút"


class CheckRequest(BaseModel):
    """POST /api/check request body."""

    lesson_plan_id: Optional[str] = None
    # File upload handled separately via UploadFile


class StatusResponse(BaseModel):
    """GET /api/status/{task_id} response."""

    task_id: str
    status: Literal[
        "pending", "clarifying", "generating", "retrying", "completed", "failed"
    ]
    progress_step: Optional[str] = None
    lesson_plan_id: Optional[str] = None
    clarification_needed: bool = False
    is_blank_template: bool = False
    error: Optional[str] = None
    draft_content: Optional[dict] = None


class ClarificationResponse(BaseModel):
    """GET /api/clarification/{task_id} response."""

    task_id: str
    questions: list[str]


class ClarificationAnswerRequest(BaseModel):
    """POST /api/clarification/{task_id} request body."""

    answers: list[dict]  # [{question, answer}]
