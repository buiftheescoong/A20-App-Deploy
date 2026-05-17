"""
LLM Client wrapper for OpenAI + Gemini with retry + fallback.
Provides both streaming and non-streaming interfaces.
"""

import asyncio
import json
from typing import AsyncIterator, Optional

import structlog
from openai import AsyncOpenAI
import google.generativeai as genai

from app.config import settings

logger = structlog.get_logger()


class LLMClient:
    """
    Unified LLM client with:
    - OpenAI (primary) 
    - Gemini (fallback)
    - Automatic fallback on error
    - Retry with exponential backoff
    """

    def __init__(self):
        # OpenAI client
        if settings.OPENAI_API_KEY:
            self._openai = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=settings.LLM_TIMEOUT_SECONDS,
            )
        else:
            self._openai = None

        # Gemini client
        if settings.GOOGLE_API_KEY:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
        
        retry_count = max(0, settings.LLM_RETRY_COUNT)
        base_delay = max(1, settings.LLM_RETRY_BASE_DELAY_SECONDS)
        self._retry_delays = [base_delay * (2 ** attempt) for attempt in range(retry_count)]

    def _is_gemini_model(self, model: str) -> bool:
        return "gemini" in model.lower()

    def _is_transient_error(self, error: Exception) -> bool:
        """Return True for errors that are worth retrying (timeouts, rate limits, server errors)."""
        if isinstance(error, (TimeoutError, ConnectionError)):
            return True
        msg = str(error).lower()
        return any(token in msg for token in ("429", "rate limit", "500", "503", "overloaded"))

    async def stream(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        model = model or settings.PRIMARY_MODEL
        primary_is_gemini = self._is_gemini_model(model)

        last_primary_error: Optional[Exception] = None
        for attempt in range(len(self._retry_delays) + 1):
            chunks_yielded = False
            try:
                if primary_is_gemini:
                    async for chunk in self._with_stream_timeout(
                        self._gemini_stream(prompt, system_prompt, model)
                    ):
                        chunks_yielded = True
                        yield chunk
                else:
                    async for chunk in self._with_stream_timeout(
                        self._openai_stream(prompt, model, system_prompt, temperature)
                    ):
                        chunks_yielded = True
                        yield chunk
                return  # success — no fallback needed
            except Exception as e:
                if not chunks_yielded and self._is_transient_error(e) and attempt < len(self._retry_delays):
                    delay = self._retry_delays[attempt]
                    logger.warning(
                        "llm.stream.retry",
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(e),
                    )
                    await asyncio.sleep(delay)
                    last_primary_error = e
                else:
                    last_primary_error = e
                    break

        e = last_primary_error
        logger.warning(
            "llm.fallback",
            primary_model=model,
            error=str(e),
            fallback_model=settings.FALLBACK_MODEL,
        )
        try:
            fallback_is_gemini = self._is_gemini_model(settings.FALLBACK_MODEL)
            if fallback_is_gemini:
                async for chunk in self._with_stream_timeout(
                    self._gemini_stream(prompt, system_prompt, settings.FALLBACK_MODEL)
                ):
                    yield chunk
            else:
                async for chunk in self._with_stream_timeout(
                    self._openai_stream(prompt, settings.FALLBACK_MODEL, system_prompt, temperature)
                ):
                    yield chunk
        except Exception as fallback_error:
            logger.error("llm.all_failed", primary_error=str(e), fallback_error=str(fallback_error))
            raise RuntimeError(f"All LLM providers failed. Primary: {e}, Fallback: {fallback_error}")

    async def call(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        response_format: Optional[dict] = None,
    ) -> str:
        """
        Non-streaming LLM call.
        Used for quality check, JSON conversion, etc.
        """
        model = model or settings.PRIMARY_MODEL

        primary_is_gemini = self._is_gemini_model(model)

        last_primary_error: Optional[Exception] = None
        for attempt in range(len(self._retry_delays) + 1):
            try:
                if primary_is_gemini:
                    return await asyncio.wait_for(
                        self._gemini_call(prompt, system_prompt, model),
                        timeout=settings.LLM_TIMEOUT_SECONDS,
                    )
                else:
                    return await asyncio.wait_for(
                        self._openai_call(prompt, model, system_prompt, temperature, response_format),
                        timeout=settings.LLM_TIMEOUT_SECONDS,
                    )
            except Exception as e:
                if self._is_transient_error(e) and attempt < len(self._retry_delays):
                    delay = self._retry_delays[attempt]
                    logger.warning(
                        "llm.call.retry",
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(e),
                    )
                    await asyncio.sleep(delay)
                    last_primary_error = e
                else:
                    last_primary_error = e
                    break

        e = last_primary_error
        logger.warning("llm.call.fallback", primary_model=model, error=str(e))
        try:
            fallback_is_gemini = self._is_gemini_model(settings.FALLBACK_MODEL)
            if fallback_is_gemini:
                return await asyncio.wait_for(
                    self._gemini_call(prompt, system_prompt, settings.FALLBACK_MODEL),
                    timeout=settings.LLM_TIMEOUT_SECONDS,
                )
            else:
                return await asyncio.wait_for(
                    self._openai_call(
                        prompt,
                        settings.FALLBACK_MODEL,
                        system_prompt,
                        temperature,
                        response_format,
                    ),
                    timeout=settings.LLM_TIMEOUT_SECONDS,
                )
        except Exception as fallback_error:
            logger.error("llm.call.all_failed", primary_error=str(e), fallback_error=str(fallback_error))
            raise RuntimeError(f"All LLM providers failed. Primary: {e}, Fallback: {fallback_error}")

    async def _with_stream_timeout(self, iterator: AsyncIterator[str]) -> AsyncIterator[str]:
        while True:
            try:
                chunk = await asyncio.wait_for(
                    iterator.__anext__(),
                    timeout=settings.LLM_TIMEOUT_SECONDS,
                )
            except StopAsyncIteration:
                return
            yield chunk

    async def _openai_stream(
        self,
        prompt: str,
        model: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """Stream from OpenAI API."""
        if not self._openai:
            raise RuntimeError("OpenAI client not configured (missing OPENAI_API_KEY)")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self._openai.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            temperature=temperature,
        )

        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _openai_call(
        self,
        prompt: str,
        model: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        response_format: Optional[dict] = None,
    ) -> str:
        """Non-streaming OpenAI call."""
        if not self._openai:
            raise RuntimeError("OpenAI client not configured (missing OPENAI_API_KEY)")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = await self._openai.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    async def _gemini_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Stream from Gemini API."""
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("Gemini not configured (missing GOOGLE_API_KEY)")

        model = genai.GenerativeModel(
            model_name or settings.PRIMARY_MODEL,
            system_instruction=system_prompt if system_prompt else None,
        )

        response = await model.generate_content_async(prompt, stream=True)

        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def _gemini_call(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> str:
        """Non-streaming Gemini call."""
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("Gemini not configured (missing GOOGLE_API_KEY)")

        model = genai.GenerativeModel(
            model_name or settings.PRIMARY_MODEL,
            system_instruction=system_prompt if system_prompt else None,
        )

        response = await model.generate_content_async(prompt)
        return response.text or ""


# Singleton instance
llm_client = LLMClient()
