"""
Structured logging configuration using structlog.
Provides JSON-formatted, context-enriched logs.
"""

import io
import os
import sys
import logging
import structlog

# Force UTF-8 encoding on Windows to prevent cp1252 errors with Vietnamese text
os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def _make_utf8_logger_factory():
    """Create a logger factory that writes UTF-8 to stdout, avoiding Windows cp1252 errors."""
    try:
        utf8_stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except AttributeError:
        # Fallback if stdout doesn't have a buffer (e.g. in some test environments)
        utf8_stdout = sys.stdout
    return structlog.PrintLoggerFactory(file=utf8_stdout)


def setup_logging(log_level: int = logging.INFO) -> None:
    """
    Configure structlog for the entire application.
    
    Features:
    - JSON output for production log aggregation
    - ISO timestamp
    - Contextvars for request-scoped data (request_id, plan_id)
    - Stack trace rendering for errors
    - Log level filtering
    - UTF-8 output on Windows
    """
    structlog.configure(
        processors=[
            # Merge contextvars (request_id, plan_id, etc.)
            structlog.contextvars.merge_contextvars,
            # Add log level
            structlog.processors.add_log_level,
            # ISO timestamp
            structlog.processors.TimeStamper(fmt="iso"),
            # Stack info for debug
            structlog.processors.StackInfoRenderer(),
            # Exception formatting
            structlog.processors.format_exc_info,
            # Unicode for Vietnamese text
            structlog.processors.UnicodeDecoder(),
            # JSON output — ensure_ascii=True for safe Windows console output
            structlog.processors.JSONRenderer(ensure_ascii=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=_make_utf8_logger_factory(),
        cache_logger_on_first_use=False,
    )

    # Also configure stdlib logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
    )

