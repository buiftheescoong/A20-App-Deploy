"""
LangGraph Pipeline — orchestrates the multi-agent lesson plan generation workflow.
This replaces the old procedural pipeline with a StateGraph.
"""

import uuid
import logging
import json
import asyncio
from typing import TypedDict, Literal, Optional, Annotated
import operator

# LangGraph
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

from app.config import settings
from app.agents.intake import run_intake
from app.agents.rag import run_rag
from app.agents.generator import run_generator
from app.agents.quality_checker import run_quality_check
from app.agents.formatter import run_formatter
from app.database import (
    update_lesson_plan_by_task_id,
    create_evaluation,
    get_lesson_plan_by_task_id,
    save_checkpoint,
    save_message,
)

# New Nodes
from app.agents.nodes.intent_router import run_intent_router
from app.agents.nodes.file_parser import chunk_text
from app.agents.nodes.refiner import run_refiner
from app.agents.nodes.qa_responder import run_qa_responder
from app.agents.nodes.json_converter import run_json_converter

logger = logging.getLogger(__name__)

# Replace built-in add operator with our own to avoid import issues if taking raw dicts
def add_messages(left: list, right: list):
    return left + right

class GraphState(TypedDict):
    plan_id: str
    user_id: str
    messages: Annotated[list[BaseMessage], add_messages]
    user_input: dict
    normalized_input: Optional[dict]
    uploaded_docs: list[str]  # Text from uploaded files
    rag_context: list
    low_confidence: bool
    clarification_questions: list[str]
    current_plan: Optional[dict]  # JSON plan
    current_markdown: Optional[str] # Markdown plan during streaming pass 1
    quality_result: Optional[dict]
    iteration: int
    action: str  # "generate"|"refine"|"qa"|"resume"
    stream_queue: Optional[asyncio.Queue]
    is_blank_template: bool
    docx_url: str
    error: Optional[str]


# ─── LangGraph Nodes ──────────────────────────────────────────────────────────

async def intent_router_node(state: GraphState) -> dict:
    """Classify the user intent to route to the correct path."""
    messages = state.get("messages", [])
    has_plan = state.get("current_plan") is not None
    is_clarifying = len(state.get("clarification_questions", [])) > 0
    
    # Send progress to UI if stream_queue exists
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "router", "label": "Đang phân tích yêu cầu..."}})

    if not messages:
        # Initial form submission
        action = "generate"
    else:
        last_message = messages[-1].content
        action = await run_intent_router(last_message, has_plan, is_clarifying)

    return {"action": action}


async def rag_retrieval_node(state: GraphState) -> dict:
    """Intake validation + RAG combining file text and VectorDB."""
    user_input = state.get("user_input", {})
    uploaded_docs = state.get("uploaded_docs", [])
    
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "rag", "label": "Đang chuẩn bị ngữ cảnh & SGK..."}})

    normalized_input = state.get("normalized_input")
    if not normalized_input:
        intake_result = await run_intake(user_input)
        if intake_result.get("out_of_scope"):
             return {"error": "Out of scope", "is_blank_template": True}
        normalized_input = intake_result.get("normalized", user_input)

    # Convert uploaded_docs text into chunks for RAG or pass directly
    rag_result = await run_rag(
        subject=normalized_input.get("subject", ""),
        grade=normalized_input.get("grade", ""),
        topic=normalized_input.get("topic", ""),
        objectives=normalized_input.get("objectives", []),
        user_doc_chunks=uploaded_docs
    )

    # If the user has supplied chat messages, it means they are answering our clarification
    # We must bypass the low_confidence check to avoid an infinite loop, and inject their answers.
    messages = state.get("messages", [])
    if messages:
        rag_result["low_confidence"] = False
        rag_result["clarification_questions"] = []
        # Join HumanMessages to append to context
        from langchain_core.messages import HumanMessage
        user_answers = "\n".join([m.content for m in messages if isinstance(m, HumanMessage)])
        if user_answers:
            rag_result["rag_context"].append({"clarification_answers": user_answers})

    # Checkpoint 1
    save_checkpoint(state["plan_id"], "rag_done", {
        "rag_context": rag_result["rag_context"],
        "normalized_input": normalized_input
    })

    return {
        "normalized_input": normalized_input,
        "rag_context": rag_result["rag_context"],
        "low_confidence": rag_result.get("low_confidence", False),
        "clarification_questions": rag_result.get("clarification_questions", [])
    }


async def generator_node(state: GraphState) -> dict:
    """Generate Markdown lesson plan (Pass 1 of streaming strategy)."""
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "generating", "label": "AI đang soạn thảo..."}})

    # Retrieve quality feedback if we are iterating
    quality_result = state.get("quality_result") or {}
    quality_feedback = quality_result.get("errors") if quality_result.get("status") == "FAILED" else None

    # This calls run_generator which we should modify to stream to state["stream_queue"] and return markdown
    # Note: the old run_generator returned a dict, we will update it to stream markdown.
    markdown_plan = await run_generator(
        normalized_input=state["normalized_input"],
        rag_context=state["rag_context"],
        quality_feedback=quality_feedback,
        stream_queue=state.get("stream_queue")
    )
    
    iteration = state.get("iteration", 0) + 1
    return {"current_markdown": markdown_plan, "iteration": iteration}


async def json_converter_node(state: GraphState) -> dict:
    """Convert generated Markdown plan into structured JSON (Pass 2)."""
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "formatting", "label": "Đang định dạng chuẩn hóa..."}})
        
    markdown_plan = state.get("current_markdown", "")
    metadata_hint = state.get("normalized_input") or {}
    
    json_plan = await run_json_converter(markdown_plan, metadata_hint)
    return {"current_plan": json_plan}


async def quality_check_node(state: GraphState) -> dict:
    """Check compliance of the generated JSON plan."""
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "quality", "label": "Đang kiểm định chất lượng..."}})
        
    plan = state.get("current_plan")
    if not plan:
        return {"error": "No plan to check"}
        
    quality_result = await run_quality_check(plan)
    return {"quality_result": quality_result}


async def refiner_node(state: GraphState) -> dict:
    """Refine existing plan based on user natural language chat."""
    if state.get("stream_queue"):
        await state["stream_queue"].put({"type": "progress", "data": {"step": "refining", "label": "Đang hiệu chỉnh theo ý kiến..."}})
        
    messages = state.get("messages", [])
    user_message = messages[-1].content if messages else ""
    current_plan = state.get("current_plan", {})
    
    markdown_plan = await run_refiner(current_plan, user_message, state.get("stream_queue"))
    return {"current_markdown": markdown_plan}


async def qa_responder_node(state: GraphState) -> dict:
    """Answer user questions about the plan without modifying it."""
    messages = state.get("messages", [])
    user_question = messages[-1].content if messages else ""
    
    await run_qa_responder(
        current_plan=state.get("current_plan", {}),
        user_question=user_question,
        rag_context=state.get("rag_context", []),
        stream_queue=state.get("stream_queue")
    )
    return {}


async def clarify_node(state: GraphState) -> dict:
    """Trigger clarification to user and pause."""
    questions = state.get("clarification_questions", [])
    
    # Checkpoint 2
    save_checkpoint(state["plan_id"], "clarifying", {
        "clarification_questions": questions
    })
    
    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "type": "clarify",
            "data": {"questions": questions}
        })
    return {}

# ─── LangGraph Graph Definition ───────────────────────────────────────────────

def route_intent(state: GraphState) -> str:
    return state.get("action", "generate")

def route_rag(state: GraphState) -> str:
    if state.get("error"):
         return "error"
    if state.get("low_confidence"):
         return "clarify"
    return "generator"

def route_quality(state: GraphState) -> str:
    res = state.get("quality_result", {})
    if res.get("status") == "PASSED" or state.get("iteration", 0) >= settings.MAX_ITERATIONS:
        return "done"
    return "generator"

def route_error(state: GraphState) -> str:
    return "done" if state.get("error") else END


workflow = StateGraph(GraphState)

workflow.add_node("intent_router", intent_router_node)
workflow.add_node("rag_retrieval", rag_retrieval_node)
workflow.add_node("generator", generator_node)
workflow.add_node("json_converter", json_converter_node)
workflow.add_node("quality_check", quality_check_node)
workflow.add_node("refiner", refiner_node)
workflow.add_node("qa_responder", qa_responder_node)
workflow.add_node("clarify", clarify_node)

workflow.set_entry_point("intent_router")

workflow.add_conditional_edges("intent_router", route_intent, {
    "generate": "rag_retrieval",
    "resume": "rag_retrieval",
    "refine": "refiner",
    "qa": "qa_responder"
})

workflow.add_conditional_edges("rag_retrieval", route_rag, {
    "generator": "generator",
    "clarify": "clarify",
    "error": END
})

# Generator always goes to json_converter to parse Markdown
workflow.add_edge("generator", "json_converter")

# Refiner also goes to json_converter (since it generates Markdown)
workflow.add_edge("refiner", "json_converter")

workflow.add_edge("json_converter", "quality_check")

workflow.add_conditional_edges("quality_check", route_quality, {
    "done": END,
    "generator": "generator"
})

workflow.add_edge("clarify", END)  # Interrupts naturally by ending current run
workflow.add_edge("qa_responder", END)

app_graph = workflow.compile()


# ─── Main Entry Point ─────────────────────────────────────────────────────────

async def run_pipeline_graph(plan_id: str, stream_queue: asyncio.Queue = None):
    """
    Execute the compiled LangGraph for a given plan_id.
    This replaces run_pipeline().
    """
    logger.info(f"Starting graph execution for plan {plan_id}")
    
    # 1. Fetch DB records
    plan_record = get_lesson_plan_by_task_id(plan_id) # old schema used task_id=plan_id
    if not plan_record:
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": "Plan not found"}})
        return
        
    user_input = {
        "subject": plan_record.get("subject"),
        "grade": plan_record.get("grade"),
        "topic": plan_record.get("topic"),
        "objectives": plan_record.get("objectives", []),
        "teaching_model": plan_record.get("teaching_model", "5E"),
    }
    session_state = plan_record.get("session_state")
    if session_state is None:
        content = plan_record.get("content_json") or {}
        session_state = content.get("_session_state", {})

    if plan_record.get("status") == "completed":
        if stream_queue:
            await stream_queue.put({
                "type": "done",
                "data": {"plan_id": plan_id, "docx_url": plan_record.get("docx_url"), "status": "completed"}
            })
        logger.info(f"Plan {plan_id} is already completed. Bypassing execution.")
        return

    clarification_questions = session_state.get("clarifying", {}).get("clarification_questions", [])
    if clarification_questions:
        if stream_queue:
            await stream_queue.put({
                "type": "clarify",
                "data": {"questions": clarification_questions}
            })
        logger.info(f"Plan {plan_id} is waiting for clarification. Pausing pipeline execution.")
        return

    # Base state
    init_state: GraphState = {
        "plan_id": plan_id,
        "user_id": "", # Unused for now
        "messages": [], # Handled asynchronously in chat.py
        "user_input": user_input,
        "normalized_input": session_state.get("rag_done", {}).get("normalized_input"),
        "uploaded_docs": session_state.get("initial_uploaded_docs", []), 
        "rag_context": session_state.get("rag_done", {}).get("rag_context", []),
        "low_confidence": False,
        "clarification_questions": clarification_questions,
        "current_plan": plan_record.get("content_json") if plan_record.get("status") == "completed" else None,
        "current_markdown": None,
        "quality_result": None,
        "iteration": 0,
        "action": "generate",
        "stream_queue": stream_queue,
        "is_blank_template": False,
        "docx_url": plan_record.get("docx_url", ""),
        "error": None
    }
    
    # Run graph
    try:
        final_state = await app_graph.ainvoke(init_state)
        
        # Check if the graph exited gracefully with an error (e.g. out of scope)
        if final_state.get("error"):
            if stream_queue:
                await stream_queue.put({"type": "error", "data": {"message": final_state["error"], "recoverable": False}})
            update_lesson_plan_by_task_id(plan_id, {"status": "failed"})
            return
            
        # Checkpoint 3 and formatting
        if final_state.get("current_plan") and final_state.get("action") in ["generate", "resume", "refine"]:
           plan = final_state["current_plan"]
           compliance = final_state.get("quality_result") or {}
           plan["compliance"] = compliance
           
           # Export DOCX
           if stream_queue:
               await stream_queue.put({"type": "progress", "data": {"step": "export", "label": "Đang xuất file Word..."}})
               
           formatter_result = await run_formatter(plan=plan, is_blank_template=final_state.get("is_blank_template", False))
           docx_url = formatter_result["docx_url"]
           
           update_lesson_plan_by_task_id(plan_id, {
               "status": "completed",
               "content_json": plan,
               "docx_url": docx_url,
               "compliance_status": compliance.get("status", "PENDING")
           })
           
           # Evaluation
           create_evaluation(
               lesson_plan_id=plan_id,
               is_passed=compliance.get("status", "PASSED") == "PASSED",
               error_details=compliance.get("errors", [])
           )
           
           if stream_queue:
               await stream_queue.put({"type": "plan", "data": plan})
               await stream_queue.put({"type": "done", "data": {"plan_id": plan_id, "docx_url": docx_url, "status": "completed"}})
               
    except Exception as e:
        logger.exception(f"Graph execution failed: {e}")
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": str(e), "recoverable": False}})
        update_lesson_plan_by_task_id(plan_id, {"status": "failed"})

