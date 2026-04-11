"""
Knowledge Base API — POST /api/kb/upload
Allows teachers to upload their own teaching materials (PDFs, docs) into the RAG Knowledge base.
"""

import logging
import asyncio
from typing import Optional
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, BackgroundTasks

from app.database import supabase
from app.config import settings

import pdfplumber
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI
import io

logger = logging.getLogger(__name__)

router = APIRouter()
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF file."""
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n\n"
    except Exception as e:
        logger.error(f"Error extracting PDF: {e}")
        raise ValueError("Failed to parse PDF file. Ensure it is a valid PDF document.")
    return text


async def process_and_ingest_document(
    filename: str, file_bytes: bytes, subject: str, grade: str, user_id: str
):
    """Background task to extract, chunk, embed, and store document."""
    try:
        logger.info(f"Starting KB ingestion for {filename} (Subject: {subject}, Grade: {grade})")
        
        # 1. Extract text (supports PDF for now)
        if filename.lower().endswith(".pdf"):
            text = extract_text_from_pdf(file_bytes)
        else:
            # Assume text or decode directly if not PDF (can be expanded for docx)
            text = file_bytes.decode("utf-8", errors="ignore")

        if not text.strip():
            logger.warning(f"KB Upload: No text could be extracted from {filename}")
            return

        # 2. Chunking
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ".", " ", ""],
        )
        chunks = text_splitter.split_text(text)
        logger.info(f"Split {filename} into {len(chunks)} chunks.")

        # 3. Embedding and Inserting (Process in batches to avoid rate limits)
        batch_size = 20
        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i : i + batch_size]
            
            # Request embeddings concurrently
            response = await client.embeddings.create(
                input=batch_chunks,
                model="text-embedding-3-small"
            )
            embeddings = [data.embedding for data in response.data]

            records = []
            for j, chunk_text in enumerate(batch_chunks):
                # We identify user uploaded files by appending UserID to source
                # If subject/grade are not provided, we use 'Custom'
                source_id = f"custom_{user_id}_{filename}"
                records.append({
                    "source": source_id,
                    "subject": subject or "Chung",
                    "grade": grade or "Khác",
                    "content": chunk_text,
                    "embedding": embeddings[j]
                })

            # Insert batch into Supabase
            if records:
                try:
                    supabase.table("rag_knowledge_base").insert(records).execute()
                except Exception as e:
                    logger.error(f"Supabase insertion failed for batch: {e}")

        logger.info(f"✅ Successfully ingested {filename} into RAG Knowledge Base.")
    except Exception as e:
        logger.error(f"❌ Failed to ingest {filename}: {e}")


@router.post("/api/kb/upload")
async def upload_knowledge_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject: Optional[str] = Form("Chung"),
    grade: Optional[str] = Form("Khác"),
    user_id: Optional[str] = Form("teacher_upload"),
):
    """
    Upload a document (PDF, TXT) to the personal/shared Knowledge Base.
    The document will be processed, chunked, embedded, and saved to Vector DB in the background.
    """
    if not file.filename.lower().endswith((".pdf", ".txt")):
        raise HTTPException(
            status_code=400, detail="Unsupported file format. Only PDF and TXT are supported."
        )

    # Read bytes synchronously to avoid background task scope issue
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Could not read file.")

    # Start ingestion process in background
    background_tasks.add_task(
        process_and_ingest_document,
        filename=file.filename,
        file_bytes=file_bytes,
        subject=subject,
        grade=grade,
        user_id=user_id,
    )

    return {
        "message": f"File '{file.filename}' has been accepted and is processing.",
        "filename": file.filename,
        "subject": subject,
        "grade": grade,
        "status": "processing"
    }
