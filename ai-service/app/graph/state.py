"""Graph state definition for the LangGraph pipeline."""

from typing import Any, Optional, TypedDict


class GraphState(TypedDict):
    """State object passed between all nodes in the LangGraph pipeline."""

    # Identifiers
    plan_id: str
    request_id: str

    # User input from Gateway
    subject: str
    grade: str
    topic: str
    teaching_model: str
    objectives: list[str]
    emphasis: str
    special_requests: str
    uploaded_docs: list[str]
    resource_texts: list[str]
    system_resource_texts: list[str]
    resource_contexts: list[dict]
    system_resource_contexts: list[dict]

    # RAG
    rag_context: list[dict]

    # Generation
    current_markdown: str
    current_plan: dict
    quality_result: dict
    iteration: int
    generation_blueprint: dict

    # Streaming
    stream_queue: Optional[Any]

    # Error handling
    error: Optional[str]
