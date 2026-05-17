"""Small text helpers shared by quality-check parsing and result assembly."""

from __future__ import annotations

from typing import Any
import unicodedata


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text).lower()).replace("Ä‘", "d")
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def has_any(normalized_text: str, phrases: list[str]) -> bool:
    return any(normalize_text(phrase) in normalized_text for phrase in phrases if phrase)


def clean_json(response: str) -> str:
    json_str = (response or "").strip()
    if json_str.startswith("```json"):
        json_str = json_str[7:]
    if json_str.startswith("```"):
        json_str = json_str[3:]
    if json_str.endswith("```"):
        json_str = json_str[:-3]
    return json_str.strip()


def bounded_int(value: Any, default: int) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default
