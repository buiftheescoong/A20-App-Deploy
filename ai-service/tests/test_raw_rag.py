from pathlib import Path

import pytest


def test_raw_resource_path_parsing_and_heading_chunks():
    from app.services.raw_data_ingestor import RawDataIngestor

    repo_root = Path(__file__).resolve().parents[2]
    raw_dir = repo_root / "data" / "raw"
    path = (
        raw_dir
        / "ket-noi-tri-thuc-voi-cuoc-song"
        / "lop-8"
        / "toan"
        / "tap-1-chuong-1.md"
    )

    ingestor = RawDataIngestor()
    resource = ingestor._build_resource(path, raw_dir)
    chunks = ingestor._chunk_markdown(resource.content_text, resource)

    assert resource.subject == "Toán"
    assert resource.grade == "8"
    assert resource.metadata["raw_path"] == "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-1-chuong-1.md"
    assert resource.lesson_titles[0] == "Bài 1: ĐƠN THỨC"
    assert "Bài 1: ĐƠN THỨC" in resource.filename
    assert "Chương" not in resource.filename
    assert "Bài 2: ĐA THỨC" in resource.description
    assert resource.metadata["lessons"][0] == "Bài 1: ĐƠN THỨC"
    assert resource.metadata["raw_display_version"] == "lesson-display-v1"
    assert chunks
    assert any(
        chunk["metadata"]["lesson"] == "Bài 1: ĐƠN THỨC"
        and "ĐƠN THỨC" in chunk["text"]
        for chunk in chunks
    )


def test_raw_chunk_metadata_contains_required_fields():
    from app.config import settings
    from app.services.raw_data_ingestor import RawDataIngestor

    repo_root = Path(__file__).resolve().parents[2]
    raw_dir = repo_root / "data" / "raw"
    path = raw_dir / "ket-noi-tri-thuc-voi-cuoc-song" / "lop-8" / "khoa-hoc-tu-nhien" / "chuong-1.md"

    ingestor = RawDataIngestor()
    resource = ingestor._build_resource(path, raw_dir)
    chunks = ingestor._chunk_markdown(resource.content_text, resource)
    metadata = chunks[0]["metadata"]

    required = {
        "chunk_id",
        "raw_path",
        "source_title",
        "resource_id",
        "curriculum",
        "subject",
        "grade",
        "chapter",
        "lesson",
        "section",
        "heading_path",
        "line_start",
        "line_end",
        "content_kind",
        "chunk_kind",
        "checksum",
        "chunking_version",
    }
    assert required <= set(metadata)
    assert metadata["subject"] == "Khoa học tự nhiên"
    assert metadata["grade"] == "8"
    assert metadata["chunking_version"] == settings.RAW_RAG_CHUNK_VERSION
    assert metadata["chunking_version"] == "heading-v2"
    assert metadata["chunk_id"].endswith(":p1")
    assert metadata["line_start"] <= metadata["line_end"]
    assert isinstance(metadata["heading_path"], list)
    assert metadata["content_kind"] in {"lesson_content", "objectives", "experiment", "exercise", "example", "summary", "application", "formula", "table"}
    assert any("PHẢN ỨNG HOÁ HỌC" in chunk["text"] for chunk in chunks)


@pytest.mark.asyncio
async def test_raw_ingestor_sets_maintenance_work_mem_before_vector_index(monkeypatch):
    from app.config import settings
    from app.services.raw_data_ingestor import RawDataIngestor

    class FakeConn:
        def __init__(self):
            self.calls = []

        async def execute(self, query, *args):
            self.calls.append((query, args))

    monkeypatch.setattr(settings, "RAW_RAG_INDEX_MAINTENANCE_WORK_MEM", "96MB")
    conn = FakeConn()

    await RawDataIngestor()._ensure_schema(conn)

    set_config_index = next(
        i for i, (query, _args) in enumerate(conn.calls)
        if "set_config('maintenance_work_mem'" in query
    )
    vector_index = next(
        i for i, (query, _args) in enumerate(conn.calls)
        if "USING ivfflat" in query
    )

    assert conn.calls[set_config_index][1] == ("96MB",)
    assert set_config_index < vector_index


@pytest.mark.asyncio
async def test_raw_rag_search_uses_precise_then_fallback_stages(monkeypatch):
    from app.graph.nodes import rag

    class FakeVectorStore:
        def __init__(self):
            self.calls = []

        async def search(self, **kwargs):
            self.calls.append(kwargs)
            return []

    fake = FakeVectorStore()
    monkeypatch.setattr(rag.settings, "RAG_TOP_K", 5)
    monkeypatch.setattr(rag.settings, "RAG_VECTOR_CANDIDATES", 20)
    monkeypatch.setattr(rag.settings, "RAG_MIN_SCORE", 0.35)

    results = await rag._search_raw_context(
        vector_store=fake,
        query="Toán lop 8 Đơn thức",
        subject="Toán",
        grade="8",
    )

    assert results == []
    assert [call["filter_grade"] for call in fake.calls] == ["8", "8", None]
    assert all(call["filter_subject"] == "Toán" for call in fake.calls)
    assert all(call["raw_only"] is True for call in fake.calls)
    assert fake.calls[0]["min_score"] == 0.35
    assert fake.calls[1]["min_score"] < fake.calls[0]["min_score"]


@pytest.mark.asyncio
async def test_rag_node_returns_automatic_raw_chunks(monkeypatch):
    from app.graph.nodes import rag
    import app.services.vector_store as vector_store_module

    class FakeVectorStore:
        async def search(self, **kwargs):
            return [{
                "text": "Source: SGK Toán 8\n\n> **Đơn thức** là biểu thức đại số.",
                "source": "SGK Toán 8 - Kết nối tri thức - Tap 1 Chuong 1",
                "score": 0.82,
                "resource_id": "00000000-0000-0000-0000-000000000001",
                "chunk_index": 1,
                "subject": "Toán",
                "grade": "8",
                "metadata": {
                    "source": "data/raw",
                    "raw_path": "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-1-chuong-1.md",
                    "curriculum": "Kết nối tri thức với cuộc sống",
                    "subject": "Toán",
                    "grade": "8",
                    "chapter": "Chương I: ĐA THỨC",
                    "lesson": "Bài 1: ĐƠN THỨC",
                    "section": "1. ĐƠN THỨC VÀ ĐƠN THỨC THU GỌN",
                    "chunk_kind": "section",
                },
            }]

    monkeypatch.setattr(rag.settings, "DATABASE_URL", "postgresql://example")
    monkeypatch.setattr(rag.settings, "RAG_TOP_K", 3)
    monkeypatch.setattr(vector_store_module, "vector_store", FakeVectorStore())

    state = {
        "plan_id": "test-raw-rag",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "objectives": [],
        "emphasis": "",
        "system_resource_texts": [],
        "resource_texts": [],
        "uploaded_docs": [],
        "stream_queue": None,
    }

    result = await rag.run(state)

    raw_chunks = [chunk for chunk in result["rag_context"] if chunk["type"] == "raw_vector_search"]
    assert raw_chunks
    assert raw_chunks[0]["source_alias"] == "S1"
    assert raw_chunks[0]["metadata"]["source_alias"] == "S1"
    assert raw_chunks[0]["metadata"]["raw_path"].endswith("lop-8/toan/tap-1-chuong-1.md")
    assert raw_chunks[0]["metadata"]["lesson"] == "Bài 1: ĐƠN THỨC"


def test_rag_context_packing_prioritizes_and_dedupes(monkeypatch):
    from app.graph.nodes import rag

    monkeypatch.setattr(rag.settings, "RAG_CONTEXT_MAX_CHARS", 120)
    monkeypatch.setattr(rag.settings, "RAG_CHUNK_MAX_CHARS", 80)

    chunks = [
        {"type": "user_resource", "text": "user resource text", "source": "u1", "score": 0.8},
        {"type": "system_resource", "text": "trusted system resource text", "source": "s1", "score": 1.0},
        {"type": "raw_vector_search", "text": "raw vector lesson chunk", "source": "r1", "score": 0.9},
        {"type": "raw_vector_search", "text": "raw vector lesson chunk", "source": "r1", "score": 0.7},
    ]

    packed = rag._pack_context(chunks)
    packed = rag._assign_source_aliases(packed)

    assert packed[0]["type"] == "system_resource"
    assert packed[0]["source_alias"] == "S1"
    assert packed[1]["type"] == "raw_vector_search"
    assert packed[1]["source_alias"] == "S2"
    assert sum(1 for chunk in packed if chunk["source"] == "r1") == 1
    assert sum(len(chunk["text"]) for chunk in packed) <= 120


def test_query_variants_include_topic_focused_forms():
    from app.graph.nodes import rag

    queries = rag._build_search_queries({
        "subject": "Toán",
        "grade": "8",
        "topic": "Định lí Thalès",
        "objectives": ["Vận dụng tỉ lệ đoạn thẳng"],
        "emphasis": "tam giác",
    })

    assert queries[0].startswith("Toán")
    assert any(query == "Định lí Thalès" for query in queries)
    assert any("Vận dụng" in query for query in queries)


def test_resource_context_chunks_preserve_citation_metadata():
    from app.graph.nodes import rag

    chunks = rag._resource_context_chunks(
        [{
            "id": "resource-1",
            "filename": "SGK Toán 8",
            "content_text": "Nội dung nguồn",
            "category": "sgk",
            "subject": "Toán",
            "grade": "8",
            "metadata": {"raw_path": "raw/toan.md", "lesson": "Bài 1"},
        }],
        chunk_type="system_resource",
        score=1.0,
        match_reason="teacher-selected",
    )
    assigned = rag._assign_source_aliases(chunks)

    assert assigned[0]["source_alias"] == "S1"
    assert assigned[0]["metadata"]["source_title"] == "SGK Toán 8"
    assert assigned[0]["source_detail"]["raw_path"] == "raw/toan.md"


@pytest.mark.asyncio
async def test_rag_node_prioritizes_selected_lesson_context(monkeypatch):
    from app.graph.nodes import rag

    monkeypatch.setattr(rag.settings, "DATABASE_URL", "")

    state = {
        "plan_id": "test-selected-lesson",
        "subject": "Toan",
        "grade": "8",
        "topic": "Bai 2",
        "objectives": [],
        "emphasis": "",
        "system_resource_contexts": [{
            "id": "resource-1",
            "filename": "SGK Toan 8",
            "content_text": "## Bai 2\nSelected lesson only",
            "category": "sgk",
            "subject": "Toan",
            "grade": "8",
            "metadata": {
                "raw_path": "raw/toan.md",
                "selection_scope": "lesson",
                "lesson": "Bai 2",
            },
        }],
        "system_resource_texts": [],
        "resource_texts": [],
        "uploaded_docs": [],
        "stream_queue": None,
    }

    result = await rag.run(state)

    system_chunks = [chunk for chunk in result["rag_context"] if chunk["type"] == "system_resource"]
    assert len(system_chunks) == 1
    assert system_chunks[0]["score"] == 1.0
    assert system_chunks[0]["text"] == "## Bai 2\nSelected lesson only"
    assert "Bai 1" not in system_chunks[0]["text"]
    assert system_chunks[0]["metadata"]["lesson"] == "Bai 2"
    assert system_chunks[0]["metadata"]["selection_scope"] == "lesson"
