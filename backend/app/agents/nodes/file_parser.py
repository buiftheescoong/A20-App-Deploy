"""
File Parser Node — parse nội dung từ file upload của user.

Tiered Strategy (ADR-01):
  text_length < 2000 chars  →  return raw text (FAST PATH — đưa thẳng vào prompt)
  text_length >= 2000 chars →  chunk → embed → pgvector (RAG PATH)
                                → return top-k relevant chunks

Supported formats: PDF, DOCX, TXT
Libraries: pdfplumber (PDF), python-docx (DOCX) — already in requirements.txt
"""

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Threshold for switching from direct injection to RAG
FAST_PATH_CHAR_LIMIT = 2000
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def parse_pdf(content: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    try:
        import pdfplumber

        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts)
    except Exception as e:
        logger.error(f"PDF parse error: {e}")
        return ""


def parse_docx(content: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    try:
        from docx import Document

        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as e:
        logger.error(f"DOCX parse error: {e}")
        return ""


def parse_txt(content: bytes) -> str:
    """Decode TXT bytes."""
    for encoding in ["utf-8", "utf-16", "latin-1"]:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


async def embed_and_store_chunks(
    chunks: list[str],
    plan_id: str,
    filename: str,
) -> list[str]:
    """
    Embed chunks and store in pgvector knowledge_base.
    Returns top-k relevant chunks for immediate use.
    """
    try:
        from openai import AsyncOpenAI
        from app.config import settings
        from app.database import supabase

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        relevant_chunks = []
        for i, chunk in enumerate(chunks[:20]):  # Limit to 20 chunks to avoid timeout
            try:
                response = await client.embeddings.create(
                    input=chunk,
                    model="text-embedding-3-small",
                )
                embedding = response.data[0].embedding

                # Store in knowledge_base linked to this plan
                supabase.table("knowledge_base").insert({
                    "content": chunk,
                    "embedding": embedding,
                    "source": filename,
                    "metadata": {"plan_id": plan_id, "chunk_index": i},
                }).execute()

                relevant_chunks.append(chunk)
            except Exception as e:
                logger.warning(f"Failed to embed chunk {i}: {e}")
                continue

        logger.info(f"Embedded {len(relevant_chunks)}/{len(chunks)} chunks from {filename}")
        # Return first 5 as immediate context
        return relevant_chunks[:5]

    except Exception as e:
        logger.error(f"Embed and store error: {e}")
        return chunks[:3]  # Fallback: return first 3 raw chunks


async def parse_upload_file(
    filename: str,
    content: bytes,
    plan_id: Optional[str] = None,
) -> dict:
    """
    Parse an uploaded file and return usable text context.

    Returns:
        {
            "text": str,            # Text to inject into prompt (fast path) or top chunks (rag path)
            "path": "fast"|"rag",   # Which path was taken
            "filename": str,
            "char_count": int,
        }
    """
    # Step 1: Parse raw text based on file type
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        raw_text = parse_pdf(content)
    elif ext in ("docx", "doc"):
        raw_text = parse_docx(content)
    elif ext == "txt":
        raw_text = parse_txt(content)
    else:
        logger.warning(f"Unsupported file type: {ext}, treating as txt")
        raw_text = parse_txt(content)

    if not raw_text.strip():
        logger.warning(f"No text extracted from {filename}")
        return {"text": "", "path": "fast", "filename": filename, "char_count": 0}

    char_count = len(raw_text)
    logger.info(f"Parsed {filename}: {char_count} chars")

    # Step 2: Tiered strategy
    if char_count < FAST_PATH_CHAR_LIMIT:
        # FAST PATH: inject raw text directly into prompt
        logger.info(f"File '{filename}' → FAST PATH ({char_count} chars)")
        return {
            "text": raw_text,
            "path": "fast",
            "filename": filename,
            "char_count": char_count,
        }
    else:
        # RAG PATH: chunk, embed, store
        logger.info(f"File '{filename}' → RAG PATH ({char_count} chars)")
        chunks = chunk_text(raw_text)

        if plan_id:
            top_chunks = await embed_and_store_chunks(chunks, plan_id, filename)
        else:
            # No plan_id — just return first few chunks directly
            top_chunks = chunks[:3]

        combined = "\n\n---\n\n".join(top_chunks)
        return {
            "text": combined,
            "path": "rag",
            "filename": filename,
            "char_count": char_count,
        }
