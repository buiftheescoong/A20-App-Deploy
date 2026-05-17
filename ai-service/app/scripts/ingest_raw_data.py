"""Run raw RAG data ingestion once.

Usage:
    python -m app.scripts.ingest_raw_data
"""

import asyncio

from app.logging.setup import setup_logging


async def main() -> None:
    setup_logging()
    from app.services.raw_data_ingestor import raw_data_ingestor

    await raw_data_ingestor.ingest_once(force=True)


if __name__ == "__main__":
    asyncio.run(main())
