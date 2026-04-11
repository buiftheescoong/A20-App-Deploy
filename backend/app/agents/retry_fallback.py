"""
Retry & Model Fallback Agent — handles retries and model switching.
Person A owns this file.

Responsibilities:
- Retry LLM calls with exponential backoff
- Fallback to alternative models when primary fails
- Return blank template flag when all models fail
"""

import asyncio
import logging
from app.config import settings
from app.agents.generator import run_generator

logger = logging.getLogger(__name__)

# Model fallback chain
MODEL_CHAIN = [settings.PRIMARY_MODEL, settings.FALLBACK_MODEL, settings.CHEAP_MODEL]

# Retry delays (seconds)
RETRY_DELAYS = [5, 10]


async def call_with_retry(
    normalized_input: dict,
    rag_context: list[dict],
    clarification_answers: list[dict] = None,
    quality_feedback: list[dict] = None,
    model: str = None,
) -> dict:
    """
    Call the generator with retry logic.

    Retries up to MAX_RETRIES times with exponential backoff.
    """
    use_model = model or settings.PRIMARY_MODEL
    last_error = None

    for attempt in range(settings.MAX_RETRIES + 1):
        try:
            result = await run_generator(
                normalized_input=normalized_input,
                rag_context=rag_context,
                clarification_answers=clarification_answers,
                quality_feedback=quality_feedback,
                model=use_model,
            )
            return result
        except Exception as e:
            last_error = e
            if attempt < settings.MAX_RETRIES:
                delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                logger.warning(
                    f"Retry {attempt + 1}/{settings.MAX_RETRIES} for model {use_model} "
                    f"after {delay}s. Error: {e}"
                )
                await asyncio.sleep(delay)

    raise last_error


async def generate_with_fallback(
    normalized_input: dict,
    rag_context: list[dict],
    clarification_answers: list[dict] = None,
    quality_feedback: list[dict] = None,
) -> tuple[dict, str, bool]:
    """
    Generate with full fallback chain.

    Returns:
        tuple of (result_dict, model_used, is_blank_template)
    """
    for model in MODEL_CHAIN:
        try:
            logger.info(f"Attempting generation with model: {model}")
            result = await call_with_retry(
                normalized_input=normalized_input,
                rag_context=rag_context,
                clarification_answers=clarification_answers,
                quality_feedback=quality_feedback,
                model=model,
            )
            return result, model, False
        except Exception as e:
            logger.error(f"All retries failed for model {model}: {e}")
            continue

    # All models failed → blank template
    logger.error("All models in fallback chain failed. Returning blank template.")
    return {}, "", True
