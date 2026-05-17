"""
Automatic ingestion for Markdown files under data/raw.

Scans the raw textbook corpus, upserts each file into resources, and stores
chunk embeddings in resource_embeddings. Files are skipped when their checksum
matches the value stored in resources.metadata and embeddings already exist.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from app.config import settings
from app.services.vector_store import vector_store

logger = structlog.get_logger()

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
RAW_RESOURCE_DISPLAY_VERSION = "lesson-display-v1"

SUBJECT_LABELS = {
    "toan": "To\u00e1n",
    "ngu-van": "Ng\u1eef v\u0103n",
    "tieng-anh": "Ti\u1ebfng Anh",
    "vat-ly": "V\u1eadt L\u00fd",
    "hoa-hoc": "H\u00f3a H\u1ecdc",
    "sinh-hoc": "Sinh H\u1ecdc",
    "lich-su": "L\u1ecbch S\u1eed",
    "dia-ly": "\u0110\u1ecba L\u00fd",
    "khoa-hoc-tu-nhien": "Khoa h\u1ecdc t\u1ef1 nhi\u00ean",
}

CURRICULUM_LABELS = {
    "canh-dieu": "C\u00e1nh di\u1ec1u",
    "chan-troi-sang-tao": "Ch\u00e2n tr\u1eddi s\u00e1ng t\u1ea1o",
    "ket-noi-tri-thuc-voi-cuoc-song": "K\u1ebft n\u1ed1i tri th\u1ee9c v\u1edbi cu\u1ed9c s\u1ed1ng",
}


@dataclass(frozen=True)
class RawResource:
    id: str
    path: Path
    relative_path: str
    filename: str
    file_url: str
    file_size: int
    content_text: str
    checksum: str
    curriculum: str
    subject: str
    grade: str
    chapter_slug: str
    chapter: str
    lesson_titles: tuple[str, ...]
    description: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class RawChunk:
    text: str
    metadata: dict[str, Any]


class RawDataIngestor:
    """Indexes new or changed Markdown files from the raw RAG corpus."""

    def resolve_raw_dir(self) -> Path:
        if settings.RAW_RAG_DATA_DIR:
            return Path(settings.RAW_RAG_DATA_DIR).expanduser().resolve()
        # raw_data_ingestor.py -> services -> app -> ai-service -> repo root
        return Path(__file__).resolve().parents[3] / "data" / "raw"

    async def ingest_once(self, force: bool = False) -> dict[str, int]:
        stats = {"found": 0, "indexed": 0, "skipped": 0, "failed": 0}

        if not force and not settings.RAW_RAG_AUTO_INDEX:
            logger.info("raw_rag_ingest.skip", reason="disabled")
            return stats
        if not settings.DATABASE_URL:
            logger.info("raw_rag_ingest.skip", reason="no_database_url")
            return stats
        if not settings.OPENAI_API_KEY:
            logger.info("raw_rag_ingest.skip", reason="no_openai_api_key")
            return stats

        raw_dir = self.resolve_raw_dir()
        if not raw_dir.exists():
            logger.info("raw_rag_ingest.skip", reason="raw_dir_missing", raw_dir=str(raw_dir))
            return stats

        files = sorted(raw_dir.rglob("*.md"))
        stats["found"] = len(files)
        if not files:
            logger.info("raw_rag_ingest.complete", **stats, raw_dir=str(raw_dir))
            return stats

        import asyncpg

        conn = await asyncpg.connect(_database_url())
        try:
            await self._ensure_schema(conn)
            for path in files:
                try:
                    resource = self._build_resource(path, raw_dir)
                    if not force and await self._is_current(conn, resource):
                        stats["skipped"] += 1
                        continue

                    await self._upsert_resource(conn, resource)
                    chunks = self._chunk_markdown(resource.content_text, resource)
                    stored = await vector_store.store_chunks(resource.id, chunks)
                    if stored != len(chunks):
                        stats["failed"] += 1
                        logger.warning(
                            "raw_rag_ingest.file_failed",
                            resource_id=resource.id,
                            path=resource.relative_path,
                            expected_chunks=len(chunks),
                            stored_chunks=stored,
                        )
                        continue

                    await self._mark_embedded(conn, resource, stored)
                    stats["indexed"] += 1
                    logger.info(
                        "raw_rag_ingest.file_indexed",
                        resource_id=resource.id,
                        path=resource.relative_path,
                        chunks=stored,
                    )
                except Exception as exc:
                    stats["failed"] += 1
                    logger.warning(
                        "raw_rag_ingest.file_error",
                        path=str(path),
                        error=str(exc),
                    )
        finally:
            await conn.close()

        logger.info("raw_rag_ingest.complete", **stats, raw_dir=str(raw_dir))
        return stats

    async def _ensure_schema(self, conn: Any) -> None:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resource_embeddings (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
                chunk_index integer NOT NULL,
                chunk_text text NOT NULL,
                embedding vector(1536) NOT NULL,
                metadata jsonb DEFAULT '{}'::jsonb,
                created_at timestamp DEFAULT now(),
                UNIQUE (resource_id, chunk_index)
            )
            """
        )
        await conn.execute(
            """
            ALTER TABLE resource_embeddings
            ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_resource_emb_resource
            ON resource_embeddings(resource_id)
            """
        )
        await self._set_index_maintenance_work_mem(conn)
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_resource_emb_vector
            ON resource_embeddings USING ivfflat (embedding vector_cosine_ops)
            """
        )

    async def _set_index_maintenance_work_mem(self, conn: Any) -> None:
        maintenance_work_mem = settings.RAW_RAG_INDEX_MAINTENANCE_WORK_MEM.strip()
        if not maintenance_work_mem:
            return

        await conn.execute(
            "SELECT set_config('maintenance_work_mem', $1, false)",
            maintenance_work_mem,
        )

    async def _is_current(self, conn: Any, resource: RawResource) -> bool:
        row = await conn.fetchrow(
            """
            SELECT r.metadata, r.is_embedded,
                (SELECT count(*) FROM resource_embeddings re WHERE re.resource_id = r.id) AS chunk_count
            FROM resources r
            WHERE r.id = $1::uuid
            """,
            resource.id,
        )
        if not row:
            return False

        metadata = _metadata_to_dict(row["metadata"])
        return (
            metadata.get("raw_checksum") == resource.checksum
            and metadata.get("raw_chunking_version") == settings.RAW_RAG_CHUNK_VERSION
            and metadata.get("raw_display_version") == RAW_RESOURCE_DISPLAY_VERSION
            and bool(row["is_embedded"])
            and int(row["chunk_count"] or 0) > 0
        )

    async def _upsert_resource(self, conn: Any, resource: RawResource) -> None:
        await conn.execute(
            """
            INSERT INTO resources (
                id, user_id, filename, file_url, file_size, page_count,
                content_text, is_embedded, is_system, category, subject, grade,
                description, metadata, created_at, updated_at
            )
            VALUES (
                $1::uuid, NULL, $2, $3, $4, NULL,
                $5, false, true, 'sgk', $6, $7,
                $8, $9::jsonb, now(), now()
            )
            ON CONFLICT (id) DO UPDATE SET
                filename = EXCLUDED.filename,
                file_url = EXCLUDED.file_url,
                file_size = EXCLUDED.file_size,
                content_text = EXCLUDED.content_text,
                is_embedded = false,
                is_system = true,
                category = EXCLUDED.category,
                subject = EXCLUDED.subject,
                grade = EXCLUDED.grade,
                description = EXCLUDED.description,
                metadata = COALESCE(resources.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                updated_at = now()
            """,
            resource.id,
            resource.filename,
            resource.file_url,
            resource.file_size,
            resource.content_text,
            resource.subject,
            resource.grade,
            resource.description,
            json.dumps(resource.metadata, ensure_ascii=False),
        )

    async def _mark_embedded(self, conn: Any, resource: RawResource, chunk_count: int) -> None:
        metadata = {
            "raw_checksum": resource.checksum,
            "raw_chunk_count": chunk_count,
            "raw_chunking_version": settings.RAW_RAG_CHUNK_VERSION,
            "raw_display_version": RAW_RESOURCE_DISPLAY_VERSION,
            "raw_ingested_by": "ai-service",
        }
        await conn.execute(
            """
            UPDATE resources
            SET is_embedded = true,
                metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                updated_at = now()
            WHERE id = $1::uuid
            """,
            resource.id,
            json.dumps(metadata, ensure_ascii=False),
        )

    def _build_resource(self, path: Path, raw_dir: Path) -> RawResource:
        content = path.read_text(encoding="utf-8")
        rel = path.relative_to(raw_dir).as_posix()
        parts = path.relative_to(raw_dir).parts

        curriculum_slug = parts[0] if len(parts) > 0 else "unknown"
        grade_slug = parts[1] if len(parts) > 1 else ""
        subject_slug = parts[2] if len(parts) > 2 else "khac"

        curriculum = CURRICULUM_LABELS.get(curriculum_slug, _slug_to_title(curriculum_slug))
        subject = SUBJECT_LABELS.get(subject_slug, _slug_to_title(subject_slug))
        grade = grade_slug.removeprefix("lop-") or ""
        chapter_slug = path.stem
        chapter = _slug_to_title(chapter_slug)
        lesson_titles = _extract_lesson_titles(content)
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        resource_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"raw-rag:{rel}"))
        lesson_label = _lesson_display_label(lesson_titles)
        filename = f"SGK {subject} {grade} - {curriculum} - {lesson_label}"
        description = _lesson_description(lesson_titles, curriculum, subject, grade)

        metadata = {
            "source": "data/raw",
            "raw_path": rel,
            "raw_checksum": checksum,
            "raw_chunking_version": settings.RAW_RAG_CHUNK_VERSION,
            "raw_display_version": RAW_RESOURCE_DISPLAY_VERSION,
            "curriculum_slug": curriculum_slug,
            "curriculum": curriculum,
            "subject_slug": subject_slug,
            "chapter_slug": chapter_slug,
            "chapter": chapter,
            "lessons": list(lesson_titles),
        }

        return RawResource(
            id=resource_id,
            path=path,
            relative_path=rel,
            filename=filename,
            file_url=f"raw://data/raw/{rel}",
            file_size=path.stat().st_size,
            content_text=content,
            checksum=checksum,
            curriculum=curriculum,
            subject=subject,
            grade=grade,
            chapter_slug=chapter_slug,
            chapter=chapter,
            lesson_titles=lesson_titles,
            description=description,
            metadata=metadata,
        )

    def _chunk_markdown(self, text: str, resource: RawResource) -> list[dict[str, Any]]:
        max_chars = max(500, settings.RAW_RAG_CHUNK_SIZE)
        overlap = max(0, min(settings.RAW_RAG_CHUNK_OVERLAP, max_chars // 3))
        sections = self._markdown_sections(text, resource)
        chunks: list[dict[str, Any]] = []

        for section in sections:
            parts = _split_text_with_line_ranges(section["text"], max_chars, overlap)
            total_parts = len(parts)
            section_line_start = int(section["metadata"].get("line_start") or 1)
            for part_index, part in enumerate(parts):
                line_start = section_line_start + int(part["line_start"]) - 1
                line_end = section_line_start + int(part["line_end"]) - 1
                metadata = {
                    **section["metadata"],
                    "chunk_part": part_index + 1,
                    "chunk_total_parts": total_parts,
                    "line_start": line_start,
                    "line_end": line_end,
                }
                if total_parts > 1:
                    metadata["chunk_kind"] = f"{metadata['chunk_kind']}_part"
                metadata["chunk_id"] = _chunk_id(resource.relative_path, line_start, line_end, part_index + 1)
                chunks.append({
                    "text": _format_chunk_text(part["text"], resource, metadata),
                    "metadata": metadata,
                })
        return chunks

    def _markdown_sections(self, text: str, resource: RawResource) -> list[dict[str, Any]]:
        sections: list[dict[str, Any]] = []
        chapter = resource.chapter
        lesson = ""
        section_title = ""
        chunk_kind = "document"
        current_lines: list[str] = []
        current_start_line = 1
        heading_stack: list[tuple[int, str]] = []

        def heading_path() -> list[str]:
            return [title for _, title in heading_stack if title]

        def flush(end_line: int) -> None:
            body = "\n".join(current_lines).strip()
            if not body:
                return
            line_start = current_start_line
            line_end = max(line_start, end_line)
            metadata = self._chunk_metadata(
                resource=resource,
                chapter=chapter,
                lesson=lesson,
                section=section_title,
                chunk_kind=chunk_kind,
                heading_path=heading_path(),
                line_start=line_start,
                line_end=line_end,
            )
            metadata["content_kind"] = _content_kind(
                heading=" ".join(heading_path()),
                text=body,
            )
            sections.append({
                "text": body,
                "metadata": metadata,
            })

        for line_number, line in enumerate(text.splitlines(), start=1):
            match = HEADING_RE.match(line.strip())
            if match:
                flush(line_number - 1)
                level = len(match.group(1))
                title = _clean_heading(match.group(2))
                heading_stack = [(stack_level, stack_title) for stack_level, stack_title in heading_stack if stack_level < level]
                heading_stack.append((level, title))
                if level == 1:
                    chapter = title
                    lesson = ""
                    section_title = ""
                    chunk_kind = "chapter"
                elif level == 2:
                    lesson = title
                    section_title = ""
                    chunk_kind = "lesson"
                else:
                    section_title = title
                    chunk_kind = "section"
                current_lines = [line]
                current_start_line = line_number
                continue

            if line.strip() or current_lines:
                current_lines.append(line)

        flush(len(text.splitlines()))

        if not sections and text.strip():
            metadata = self._chunk_metadata(
                resource=resource,
                chapter=chapter,
                lesson="",
                section="",
                chunk_kind="document",
                heading_path=[chapter] if chapter else [],
                line_start=1,
                line_end=max(1, len(text.splitlines())),
            )
            metadata["content_kind"] = _content_kind(heading=chapter, text=text)
            sections.append({
                "text": text.strip(),
                "metadata": metadata,
            })

        return sections

    def _chunk_metadata(
        self,
        resource: RawResource,
        chapter: str,
        lesson: str,
        section: str,
        chunk_kind: str,
        heading_path: list[str],
        line_start: int,
        line_end: int,
    ) -> dict[str, Any]:
        return {
            "source": "data/raw",
            "resource_id": resource.id,
            "source_title": resource.filename,
            "raw_path": resource.relative_path,
            "curriculum": resource.curriculum,
            "subject": resource.subject,
            "grade": resource.grade,
            "chapter": chapter or resource.chapter,
            "chapter_slug": resource.chapter_slug,
            "lesson": lesson,
            "section": section,
            "heading_path": heading_path,
            "line_start": line_start,
            "line_end": line_end,
            "chunk_kind": chunk_kind,
            "checksum": resource.checksum,
            "raw_checksum": resource.checksum,
            "chunking_version": settings.RAW_RAG_CHUNK_VERSION,
        }


def _database_url() -> str:
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql+asyncpg://"):
        return db_url.replace("postgresql+asyncpg://", "postgresql://")
    return db_url


def _metadata_to_dict(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    try:
        return dict(value)
    except Exception:
        return {}


def _slug_to_title(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-") if part)


def _clean_heading(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().strip("#")).strip()


def _extract_lesson_titles(text: str) -> tuple[str, ...]:
    lessons: list[str] = []
    for line in text.splitlines():
        match = HEADING_RE.match(line.strip())
        if not match or len(match.group(1)) != 2:
            continue
        title = _clean_heading(match.group(2))
        if _looks_like_lesson_title(title):
            lessons.append(title)
    return tuple(lessons)


def _looks_like_lesson_title(title: str) -> bool:
    normalized = unicodedata.normalize("NFC", title).casefold()
    return bool(re.match(r"^b\u00e0i(?:\s|\d|:|\.)", normalized))


def _lesson_display_label(lesson_titles: tuple[str, ...]) -> str:
    if not lesson_titles:
        return "T\u00e0i li\u1ec7u b\u00e0i h\u1ecdc"

    first_lesson = lesson_titles[0]
    remaining = len(lesson_titles) - 1
    if remaining <= 0:
        return first_lesson
    return f"{first_lesson} (+{remaining} b\u00e0i)"


def _lesson_description(
    lesson_titles: tuple[str, ...],
    curriculum: str,
    subject: str,
    grade: str,
) -> str:
    source = f"{subject} l\u1edbp {grade} - {curriculum}"
    if not lesson_titles:
        return f"T\u00e0i li\u1ec7u b\u00e0i h\u1ecdc trong SGK {source}."

    lesson_summary = "; ".join(lesson_titles)
    return f"C\u00e1c b\u00e0i trong t\u00e0i nguy\u00ean: {lesson_summary}. SGK {source}."


def _format_chunk_text(text: str, resource: RawResource, metadata: dict[str, Any]) -> str:
    heading_bits = [
        metadata.get("chapter", ""),
        metadata.get("lesson", ""),
        metadata.get("section", ""),
    ]
    headings = " > ".join(bit for bit in heading_bits if bit)
    header = (
        f"Source: {resource.filename}\n"
        f"Chunk ID: {metadata.get('chunk_id', '')}\n"
        f"Curriculum: {resource.curriculum}\n"
        f"Subject: {resource.subject}\n"
        f"Grade: {resource.grade}\n"
        f"Path: {resource.relative_path}\n"
        f"Lines: {metadata.get('line_start', '')}-{metadata.get('line_end', '')}\n"
    )
    if headings:
        header += f"Headings: {headings}\n"
    return f"{header}\n{text.strip()}"


def _split_text(text: str, max_chars: int, overlap: int) -> list[str]:
    return [part["text"] for part in _split_text_with_line_ranges(text, max_chars, overlap)]


def _split_text_with_line_ranges(text: str, max_chars: int, overlap: int) -> list[dict[str, Any]]:
    text = text.strip()
    if len(text) <= max_chars:
        return [{"text": text, "line_start": 1, "line_end": max(1, len(text.splitlines()))}] if text else []

    blocks = _paragraph_blocks(text)
    chunks: list[dict[str, Any]] = []
    current = ""
    current_start = 1
    current_end = 1

    def flush() -> None:
        nonlocal current, current_start, current_end
        clean = current.strip()
        if clean:
            chunks.append({
                "text": clean,
                "line_start": current_start,
                "line_end": current_end,
            })
        carry = _tail(clean, overlap)
        if carry:
            current = carry
            current_start = current_end
        else:
            current = ""

    for block in blocks:
        block_text = block["text"]
        if len(block_text) > max_chars:
            if current.strip():
                flush()
            if current.strip() and len(f"{current}\n\n{block_text}") > max_chars:
                current = ""
            chunks.extend(_split_long_block(block, max_chars, overlap))
            current = ""
            current_start = block["line_end"]
            current_end = block["line_end"]
            continue

        next_text = f"{current}\n\n{block_text}".strip() if current else block_text
        if len(next_text) <= max_chars:
            current = next_text
            current_start = current_start if current else block["line_start"]
            if not chunks and not current:
                current_start = block["line_start"]
            if current == block_text:
                current_start = block["line_start"]
            current_end = block["line_end"]
            continue

        if current:
            flush()

        if current and len(f"{current}\n\n{block_text}") <= max_chars:
            current = f"{current}\n\n{block_text}".strip()
            current_end = block["line_end"]
        else:
            current = block_text
            current_start = block["line_start"]
            current_end = block["line_end"]

    if current:
        chunks.append({
            "text": current.strip(),
            "line_start": current_start,
            "line_end": current_end,
        })

    return chunks


def _paragraph_blocks(text: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current: list[str] = []
    start_line = 1

    def flush(end_line: int) -> None:
        nonlocal current
        if current:
            blocks.append({
                "text": "\n".join(current).strip(),
                "line_start": start_line,
                "line_end": end_line,
            })
            current = []

    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            flush(line_number - 1)
            start_line = line_number + 1
            continue
        if not current:
            start_line = line_number
        current.append(line)
    flush(max(1, len(text.splitlines())))
    return blocks


def _split_long_block(block: dict[str, Any], max_chars: int, overlap: int) -> list[dict[str, Any]]:
    text = block["text"].strip()
    if not text:
        return []

    parts: list[dict[str, Any]] = []
    step = max(1, max_chars - overlap)
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        parts.append({
            "text": text[start:end].strip(),
            "line_start": block["line_start"],
            "line_end": block["line_end"],
        })
        if end >= len(text):
            break
        start += step
    return parts


def _tail(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text if max_chars > 0 else ""
    return text[-max_chars:].lstrip()


def _chunk_id(raw_path: str, line_start: int, line_end: int, part_index: int) -> str:
    return f"{raw_path}:{line_start}-{line_end}:p{part_index}"


def _content_kind(heading: str, text: str) -> str:
    normalized = _fold_ascii(f"{heading}\n{text}")
    if "muc tieu" in normalized:
        return "objectives"
    if "thi nghiem" in normalized or "thuc hanh" in normalized:
        return "experiment"
    if "vi du" in normalized:
        return "example"
    if "bai tap" in normalized or "luyen tap" in normalized:
        return "exercise"
    if "em da hoc" in normalized:
        return "summary"
    if "em co the" in normalized or "van dung" in normalized:
        return "application"
    if "|" in text and "---" in text:
        return "table"
    if "$" in text:
        return "formula"
    return "lesson_content"


def _fold_ascii(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text).casefold()).replace("đ", "d")
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


raw_data_ingestor = RawDataIngestor()
