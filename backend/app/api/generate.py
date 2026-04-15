"""
Generate API — POST /api/generate 
Accepts multipart/form-data for initial lesson plan generation including file uploads.
"""

import uuid
import logging
import json
from typing import List, Optional
from fastapi import APIRouter, Request, HTTPException, Form, File, UploadFile, BackgroundTasks

from app.database import create_lesson_plan
from app.agents.nodes.file_parser import parse_upload_file

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/generate")
async def generate_lesson_plan(
    request: Request,
    background_tasks: BackgroundTasks,
    subject: str = Form(...),
    grade: str = Form(...),
    topic: str = Form(...),
    objectives: str = Form("[]"),  # Expected JSON string array
    teaching_model: str = Form("5E"),
    files: List[UploadFile] = File(default=[]),
):
    """
    Start lesson plan generation taking multipart data.
    Parses files (if any), saves to DB, and returns plan_id.
    The client will then connect to SSE to trigger graph execution.
    """
    user_id = getattr(request.state, "user_id", "mock-user-id")
    plan_id = str(uuid.uuid4())

    try:
        objectives_list = json.loads(objectives)
    except:
        objectives_list = []

    plan_data = {
        "id": plan_id, # Using plan_id as UUID primary key optionally if schema allows
        "subject": subject,
        "grade": grade,
        "topic": topic,
        "objectives": objectives_list,
        "teaching_model": teaching_model,
        "task_id": plan_id, # legacy compat
        "status": "generating",
        "session_state": {}
    }

    try:
        # Create record 
        create_lesson_plan(user_id, plan_data)
    except Exception as e:
        logger.error(f"Failed to create lesson plan record: {e}")
        raise HTTPException(status_code=500, detail="Failed to create lesson plan")

    # Process files asynchronously to not block the response
    # Wait, if we return plan_id, SSE connects and RAG starts.
    # The RAG needs the parsed file context. 
    # Let's run parsing in background and save to session_state, or parse instantly if small.
    # For MVP, we pass it async.
    background_tasks.add_task(process_initial_files, plan_id, files)

    return {"plan_id": plan_id, "status": "accepted"}

async def process_initial_files(plan_id: str, files: List[UploadFile]):
    """Background task to parse initial files and store in session_state."""
    if not files:
        return
        
    from app.database import update_lesson_plan_by_task_id, get_lesson_plan_by_task_id
    
    parsed_docs_text = []
    for f in files:
        if f.filename:
            content = await f.read()
            parsed_data = await parse_upload_file(f.filename, content, plan_id)
            parsed_docs_text.append(parsed_data["text"])
            
    if parsed_docs_text:
        # Save to session_state so RAG node can pick it up
        plan = get_lesson_plan_by_task_id(plan_id)
        if plan:
            state = plan.get("session_state") or {}
            # We haven't run RAG yet, store in a preliminary place
            state["initial_uploaded_docs"] = parsed_docs_text
            update_lesson_plan_by_task_id(plan_id, {"session_state": state})

