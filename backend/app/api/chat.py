"""
Chat Controller.
Handles all subsequent chat interactions, refine requests, and clarification answers.
"""

import logging
from typing import List
from fastapi import APIRouter, Form, File, UploadFile, HTTPException

from app.database import get_lesson_plan_by_task_id, save_message
from app.agents.nodes.file_parser import parse_upload_file
from langchain_core.messages import HumanMessage

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/chat/{plan_id}")
async def process_chat(
    plan_id: str,
    message: str = Form(...),
    files: List[UploadFile] = File(default=[])
):
    """
    Accept chat input (and optional files) on an existing plan.
    It saves the context and the stream endpoint will process the graph logic.
    Returns 202 Accepted.
    Note: For MVP, the stream endpoint needs to know a new message arrived, 
    but since our LangGraph run_pipeline_graph is triggered by the SSE endpoint, 
    we must understand that saving the message is what we can do here, 
    but how does the graph run again?
    Wait, in a real UI, POST /api/chat saves the message, and since SSE is open, 
    do we trigger the graph from here?
    Yes, we need a way to run the graph and push to the existing queue, or 
    the frontend reconnects the SSE? 
    Actually, the plan requested:
    A3 -->|"Resume Graph"| Router
    For now, we can run the pipeline graph asynchronously from here but NOT stream it, 
    Wait, we need the existing open SSE connection's queue.
    For simplicity: if the UI calls this, the UI expects the SSE to produce chunks.
    We will store a global registry of queues, or we can just let this endpoint call the graph if no direct stream attach, but we want streaming!
    Let's handle this by saving the message to DB and signaling the graph.
    """
    plan = get_lesson_plan_by_task_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")

    attached_files_meta = []
    parsed_docs_text = []

    # Parse and store files
    for f in files:
        if f.filename:
            content = await f.read()
            parsed_data = await parse_upload_file(f.filename, content, plan_id)
            attached_files_meta.append({
                "filename": f.filename,
                "path": parsed_data["path"],
                "char_count": parsed_data["char_count"]
            })
            parsed_docs_text.append(parsed_data["text"])

    # Save user message to database
    save_message(
        plan_id=plan_id,
        role="user",
        content=message,
        message_type="chat",
        attached_files=attached_files_meta
    )

    # Note: To stream, the ideal architecture is to let the SSE endpoint listen to a Redis PubSub,
    # and this POST publishes to it. 
    # For MVP without Redis: we can just return 202, and the FE can close and reopen the SSE
    # OR we use a global dictionary of queues.
    # Let's use a global queue dict for MVP so we can push to the same SSE session.
    from app.api.stream import GLOBAL_STREAM_QUEUES
    
    q = GLOBAL_STREAM_QUEUES.get(plan_id)
    if q:
        # Launch graph task, passing the new message and docs
        # We can pass them through a state update
        from app.agents.pipeline import app_graph, GraphState
        from app.database import update_lesson_plan_by_task_id
        import asyncio
        from app.agents.pipeline import run_pipeline_graph
        
        # Actually, running run_pipeline_graph again might overwrite or reset. 
        # For MVP, we will update the DB and let the run_pipeline_graph resume.
        asyncio.create_task(resume_graph(plan_id, message, parsed_docs_text, q))
    
    return {"status": "accepted", "plan_id": plan_id}


async def resume_graph(plan_id, message, parsed_docs_text, stream_queue):
    """Helper to resume graph with new user message."""
    from app.database import get_lesson_plan_by_task_id, save_checkpoint
    from app.agents.pipeline import app_graph, GraphState
    import logging
    logger = logging.getLogger(__name__)
    
    # Clear the clarification lock in the database immediately when user responds
    save_checkpoint(plan_id, "clarifying", {"clarification_questions": []})
    
    plan_record = get_lesson_plan_by_task_id(plan_id)
    session_state = plan_record.get("session_state")
    if session_state is None:
        content = plan_record.get("content_json") or {}
        session_state = content.get("_session_state", {})
    
    init_state: GraphState = {
        "plan_id": plan_id,
        "user_id": "", 
        "messages": [HumanMessage(content=message)],
        "user_input": plan_record.get("content_json") or {},
        "normalized_input": session_state.get("rag_done", {}).get("normalized_input"),
        "uploaded_docs": parsed_docs_text, 
        "rag_context": session_state.get("rag_done", {}).get("rag_context", []),
        "low_confidence": False,
        "clarification_questions": session_state.get("clarifying", {}).get("clarification_questions", []),
        "current_plan": plan_record.get("content_json") if plan_record.get("status") == "completed" else None,
        "current_markdown": None,
        "quality_result": None,
        "iteration": 0,
        "action": "resume", # Default, Router will override
        "stream_queue": stream_queue,
        "is_blank_template": False,
        "docx_url": plan_record.get("docx_url", ""),
        "error": None
    }
    
    from app.agents.pipeline import run_pipeline_graph
    # We cheat a bit by re-using run_pipeline_graph logic but skipping the DB fetch
    # Wait, we can just run ainvoke and do the post-processing
    
    try:
        from app.agents.formatter import run_formatter
        from app.database import update_lesson_plan_by_task_id, create_evaluation
        final_state = await app_graph.ainvoke(init_state)
        
        # Checkpoint 3 and formatting
        if final_state.get("current_plan") and final_state.get("action") in ["generate", "resume", "refine"]:
           plan = final_state["current_plan"]
           compliance = final_state.get("quality_result", {})
           plan["compliance"] = compliance
           
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
           
           if stream_queue:
               await stream_queue.put({"type": "plan", "data": plan})
               await stream_queue.put({"type": "done", "data": {"plan_id": plan_id, "docx_url": docx_url, "status": "completed"}})
               
    except Exception as e:
        logger.exception(f"Graph execution failed on chat resume: {e}")
        if stream_queue:
            await stream_queue.put({"type": "error", "data": {"message": str(e), "recoverable": False}})
