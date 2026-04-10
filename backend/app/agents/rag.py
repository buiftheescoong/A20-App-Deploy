"""
RAG Agent — retrieves relevant content from knowledge base.
Person A owns this file, Person B provides the retrieval function.

Responsibilities:
- Vector search in pgvector for relevant SGK content
- Calculate confidence score from cosine similarity
- Generate clarification questions when confidence is low
"""

import logging
from openai import AsyncOpenAI
from app.config import settings
from app.database import supabase

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def get_embedding(text: str) -> list[float]:
    """Generate embedding for a text query."""
    response = await client.embeddings.create(
        input=text,
        model="text-embedding-3-small",
    )
    return response.data[0].embedding


async def search_knowledge_base(
    subject: str,
    grade: str,
    topic: str,
    match_count: int = 5,
) -> tuple[list[dict], float]:
    """
    Search the RAG knowledge base for relevant content.
    
    Returns:
        tuple of (chunks, top_similarity_score)
    """
    query = f"{subject} lớp {grade}: {topic}"
    embedding = await get_embedding(query)

    try:
        # Call Supabase RPC function for vector similarity search
        result = supabase.rpc(
            "match_knowledge",
            {
                "query_embedding": embedding,
                "subject_filter": subject,
                "grade_filter": grade,
                "match_count": match_count,
            },
        ).execute()

        chunks = result.data or []
        top_score = chunks[0]["similarity"] if chunks else 0.0
        return chunks, top_score
    except Exception as e:
        logger.warning(f"RAG search failed, returning empty: {e}")
        return [], 0.0


def generate_clarification_questions(subject: str, grade: str, topic: str) -> list[str]:
    """Generate clarification questions when RAG confidence is low."""
    return [
        f"Bạn có thể mô tả thêm về nội dung bài '{topic}' không?",
        "Bạn có tài liệu tham khảo nào có thể cung cấp thêm không?",
        f"Phần kiến thức nào trong '{topic}' bạn muốn chú trọng trong bài này?",
    ]


async def run_rag(
    subject: str,
    grade: str,
    topic: str,
    objectives: list[str] = None,
) -> dict:
    """
    Run the RAG retrieval pipeline.
    
    Returns:
        dict with:
        - rag_context: list of retrieved chunks
        - low_confidence: bool
        - clarification_questions: list[str] (if low_confidence)
        - top_score: float
    """
    chunks, top_score = await search_knowledge_base(subject, grade, topic)

    low_confidence = top_score < settings.RAG_CONFIDENCE_THRESHOLD

    result = {
        "rag_context": chunks,
        "top_score": top_score,
        "low_confidence": low_confidence,
        "clarification_questions": [],
    }

    if low_confidence:
        result["clarification_questions"] = generate_clarification_questions(
            subject, grade, topic
        )
        logger.info(
            f"Low confidence ({top_score:.2f}) for {subject}/{grade}/{topic}. "
            f"Triggering clarification."
        )

    return result
