"""
Tests for the LangGraph pipeline — Phase 2.
Tests pipeline structure, state flow, and conditional edges.
"""

import asyncio
import json
import pytest


# ============================
# Test GraphState
# ============================

def test_graph_state_creation():
    """Test GraphState can be created with required fields."""
    from app.graph.state import GraphState

    state: GraphState = {
        "plan_id": "test-plan-001",
        "request_id": "req-001",
        "subject": "Toán",
        "grade": "10",
        "topic": "Hàm số bậc nhất",
        "teaching_model": "5E",
        "objectives": ["HS nhận diện được hàm bậc nhất"],
        "emphasis": "",
        "special_requests": "",
        "uploaded_docs": [],
        "resource_texts": [],
        "system_resource_texts": [],
        "rag_context": [],
        "generation_blueprint": {},
        "current_markdown": "",
        "current_plan": {},
        "quality_result": {},
        "iteration": 0,
        "stream_queue": None,
        "error": None,
    }

    assert state["plan_id"] == "test-plan-001"
    assert state["subject"] == "Toán"
    assert state["teaching_model"] == "5E"
    assert state["iteration"] == 0


def test_graph_state_with_system_resources():
    """Test GraphState with system resource texts."""
    from app.graph.state import GraphState

    state: GraphState = {
        "plan_id": "test-plan-002",
        "request_id": "req-002",
        "subject": "Vật Lý",
        "grade": "11",
        "topic": "Động lực học",
        "teaching_model": "3-phase",
        "objectives": [],
        "emphasis": "Thí nghiệm thực hành",
        "special_requests": "Dùng hoạt động nhóm",
        "uploaded_docs": ["Nội dung file PDF..."],
        "resource_texts": [],
        "system_resource_texts": ["Nội dung SGK Vật Lý 11..."],
        "rag_context": [],
        "generation_blueprint": {},
        "current_markdown": "",
        "current_plan": {},
        "quality_result": {},
        "iteration": 0,
        "stream_queue": None,
        "error": None,
    }

    assert state["teaching_model"] == "3-phase"
    assert len(state["system_resource_texts"]) == 1
    assert len(state["uploaded_docs"]) == 1


# ============================
# Test Pipeline Structure
# ============================

def test_pipeline_builds_successfully():
    """Test that the pipeline compiles without errors."""
    from app.graph.pipeline import build_pipeline

    compiled = build_pipeline()
    assert compiled is not None


def test_pipeline_singleton():
    """Test that the pipeline singleton is accessible."""
    from app.graph.pipeline import pipeline

    assert pipeline is not None


# ============================
# Test should_retry logic
# ============================

def test_should_retry_passes_when_quality_passed():
    """Test should_retry returns 'pass' when quality check passes."""
    from app.graph.pipeline import should_retry

    state = {
        "quality_result": {"status": "PASSED"},
        "iteration": 1,
    }
    assert should_retry(state) == "pass"


def test_should_retry_retries_when_quality_failed():
    """Test should_retry returns 'retry' when quality check fails."""
    from app.graph.pipeline import should_retry

    state = {
        "quality_result": {"status": "FAILED"},
        "iteration": 1,
    }
    assert should_retry(state) == "retry"


def test_should_retry_passes_at_max_iterations():
    """Test should_retry returns 'pass' at max iterations even if failed."""
    from app.graph.pipeline import should_retry

    state = {
        "quality_result": {"status": "FAILED"},
        "iteration": 2,  # MAX_ITERATIONS default is 2
    }
    assert should_retry(state) == "pass"


def test_should_retry_with_no_quality_result():
    """Test should_retry with empty quality result."""
    from app.graph.pipeline import should_retry

    state = {
        "quality_result": {},
        "iteration": 0,
    }
    assert should_retry(state) == "retry"


# ============================
# Test RAG Node
# ============================

@pytest.mark.asyncio
async def test_rag_node_with_system_resources():
    """Test RAG node merges system resources correctly."""
    from app.graph.nodes.rag import run as rag_run

    state = {
        "plan_id": "test-rag-001",
        "subject": "Toán",
        "grade": "10",
        "topic": "Hàm số bậc nhất",
        "system_resource_texts": ["SGK Toán 10 - Chương 2: Hàm số bậc nhất..."],
        "resource_texts": [],
        "uploaded_docs": ["File PDF nội dung..."],
        "stream_queue": None,
    }

    result = await rag_run(state)
    assert "rag_context" in result
    assert len(result["rag_context"]) >= 2  # system + uploaded
    # System resource should have highest score
    system_chunks = [c for c in result["rag_context"] if c["type"] == "system_resource"]
    assert len(system_chunks) == 1
    assert system_chunks[0]["score"] == 1.0


@pytest.mark.asyncio
async def test_rag_node_empty_context():
    """Test RAG node with no context returns empty list."""
    from app.graph.nodes.rag import run as rag_run

    state = {
        "plan_id": "test-rag-002",
        "subject": "Toán",
        "grade": "10",
        "topic": "Test",
        "system_resource_texts": [],
        "resource_texts": [],
        "uploaded_docs": [],
        "stream_queue": None,
    }

    result = await rag_run(state)
    assert result["rag_context"] == []


@pytest.mark.asyncio
async def test_rag_node_with_stream_queue():
    """Test RAG node pushes progress to stream queue."""
    from app.graph.nodes.rag import run as rag_run

    queue = asyncio.Queue()
    state = {
        "plan_id": "test-rag-003",
        "subject": "Toán",
        "grade": "10",
        "topic": "Test",
        "system_resource_texts": [],
        "resource_texts": [],
        "uploaded_docs": [],
        "stream_queue": queue,
    }

    await rag_run(state)
    event = await queue.get()
    assert event["event"] == "progress"
    assert event["data"]["step"] == "rag"


# ============================
# Test Quality Checker Rules
# ============================

def test_rule_based_check_valid_5e():
    """Test rule-based check with valid 5E plan."""
    from app.graph.nodes.quality_checker import _rule_based_check

    valid_markdown = """
    # KẾ HOẠCH BÀI DẠY
    **Môn học:** Toán
    **Lớp:** 10
    **Bài:** Hàm số bậc nhất
    **Thời gian:** 45 phút

    ## I. MỤC TIÊU
    ### 1. Năng lực
    - Nhận diện được hàm bậc nhất
    - Vẽ được đồ thị
    ### 2. Phẩm chất
    - Chăm chỉ khi hoàn thành nhiệm vụ nhóm

    ## II. PHƯƠNG PHÁP DẠY HỌC VÀ KĨ THUẬT DẠY HỌC
    - Phương pháp: dạy học giải quyết vấn đề, hoạt động nhóm
    - Kĩ thuật: khăn trải bàn, hỏi đáp nhanh

    ## III. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU
    - SGK, thước kẻ, phiếu học tập

    ## IV. TIẾN TRÌNH DẠY HỌC
    ### Hoạt động 1: KHỞI ĐỘNG / Engage
    Thời lượng: 5 phút
    Hình thức tổ chức: cả lớp
    **Mục tiêu:** Tạo hứng thú
    **Nội dung:** Trò chơi nhận diện đồ thị
    **Sản phẩm:** Câu trả lời
    **Tổ chức thực hiện:**
    | Hoạt động của giáo viên | Hoạt động của học sinh |
    |---|---|
    | Chuyển giao nhiệm vụ học tập: nêu câu hỏi mở đầu | Tiếp nhận nhiệm vụ |
    | Thực hiện nhiệm vụ học tập: hỗ trợ học sinh | Thực hiện nhiệm vụ |
    | Báo cáo thảo luận: gọi đại diện trả lời | Báo cáo kết quả |
    | Kết luận, nhận định: chốt vấn đề | Ghi nhận nhiệm vụ |
    **Phương án đánh giá:** Quan sát câu trả lời nhanh.

    ### Hoạt động 2: KHÁM PHÁ / Explore
    Thời lượng: 12 phút
    Hình thức tổ chức: nhóm nhỏ
    **Mục tiêu:** Khám phá dạng hàm số bậc nhất
    **Nội dung:** Phân tích bảng giá trị
    **Sản phẩm:** Bảng nhận xét nhóm
    **Tổ chức thực hiện:**
    | Hoạt động của giáo viên | Hoạt động của học sinh |
    |---|---|
    | Chuyển giao nhiệm vụ học tập: phát phiếu | Tiếp nhận nhiệm vụ |
    | Thực hiện nhiệm vụ học tập: quan sát nhóm | Thảo luận nhóm |
    | Báo cáo thảo luận: mời nhóm trình bày | Báo cáo kết quả |
    | Kết luận, nhận định: chuẩn hóa kiến thức | Ghi vở |
    **Phương án đánh giá:** Nhận xét phiếu học tập.

    ### Hoạt động 3: GIẢI THÍCH / Explain
    Thời lượng: 12 phút
    Hình thức tổ chức: cả lớp
    **Mục tiêu:** Hình thành khái niệm và cách vẽ đồ thị
    **Nội dung:** Giáo viên hệ thống kiến thức
    **Sản phẩm:** Ghi chép khái niệm
    **Tổ chức thực hiện:**
    | Hoạt động của giáo viên | Hoạt động của học sinh |
    |---|---|
    | Chuyển giao nhiệm vụ học tập: yêu cầu nêu quy tắc | Tiếp nhận nhiệm vụ |
    | Thực hiện nhiệm vụ học tập: dẫn dắt ví dụ | Trả lời câu hỏi |
    | Báo cáo thảo luận: tổng hợp ý kiến | Bổ sung ý kiến |
    | Kết luận, nhận định: chốt công thức | Ghi nhận kiến thức |
    **Phương án đánh giá:** Hỏi đáp kiểm tra hiểu bài.

    ### Hoạt động 4: MỞ RỘNG / Elaborate
    Thời lượng: 10 phút
    Hình thức tổ chức: cá nhân
    **Mục tiêu:** Vận dụng vào bài toán thực tế
    **Nội dung:** Bài tập lập hàm số từ tình huống
    **Sản phẩm:** Bài làm cá nhân
    **Tổ chức thực hiện:**
    | Hoạt động của giáo viên | Hoạt động của học sinh |
    |---|---|
    | Chuyển giao nhiệm vụ học tập: giao bài tập | Tiếp nhận nhiệm vụ |
    | Thực hiện nhiệm vụ học tập: hỗ trợ cá nhân | Làm bài |
    | Báo cáo thảo luận: chọn bài trình bày | Trình bày lời giải |
    | Kết luận, nhận định: sửa lỗi thường gặp | Hoàn thiện bài |
    **Phương án đánh giá:** Chấm nhanh sản phẩm.

    ### Hoạt động 5: ĐÁNH GIÁ / Evaluate
    Thời lượng: 6 phút
    Hình thức tổ chức: cá nhân
    **Mục tiêu:** Kiểm tra mức độ đạt mục tiêu
    **Nội dung:** Phiếu thoát lớp
    **Sản phẩm:** Câu trả lời cuối giờ
    **Tổ chức thực hiện:**
    | Hoạt động của giáo viên | Hoạt động của học sinh |
    |---|---|
    | Chuyển giao nhiệm vụ học tập: phát phiếu đánh giá | Tiếp nhận nhiệm vụ |
    | Thực hiện nhiệm vụ học tập: theo dõi thời gian | Hoàn thành phiếu |
    | Báo cáo thảo luận: thu phản hồi | Nộp phiếu |
    | Kết luận, nhận định: nhận xét chung | Ghi nhớ nhiệm vụ về nhà |
    **Phương án đánh giá:** Tự đánh giá và giáo viên phản hồi.
    """

    result = _rule_based_check(valid_markdown, "5E")
    assert result["rule_passed"] is True
    assert len(result["errors"]) == 0


def test_rule_based_check_missing_objectives():
    """Test rule-based check catches missing objectives."""
    from app.graph.nodes.quality_checker import _rule_based_check

    bad_markdown = """
    # KẾ HOẠCH BÀI DẠY
    **Môn học:** Toán
    **Lớp:** 10
    **Bài:** Test

    ## II. THIẾT BỊ VÀ HỌC LIỆU
    - SGK
    """

    result = _rule_based_check(bad_markdown, "5E")
    assert result["rule_passed"] is False
    assert any("năng lực" in e.lower() or "mục tiêu" in e.lower() for e in result["errors"])


def test_rule_based_check_rejects_placeholders():
    """Test rule-based check catches unresolved placeholders."""
    from app.graph.nodes.quality_checker import _rule_based_check

    markdown = """
    **Môn học:** Toán
    **Lớp:** 8
    **Bài:** Đơn thức
    **Thời gian:** 45 phút
    ## I. MỤC TIÊU
    - {{objective}}
    """

    result = _rule_based_check(markdown, "3-phase")
    assert result["rule_passed"] is False
    assert any("placeholder" in error.lower() or "dấu ba chấm" in error.lower() for error in result["errors"])


def _quality_plan_fixture(
    model: str = "5E",
    *,
    omit_phase: str | None = None,
    swap_order: bool = False,
    table_mode: str = "valid",
    include_assessment: bool = True,
    durations: list[int] | None = None,
    topic: str = "Hàm số bậc nhất",
) -> str:
    if model == "5E":
        phases = [
            ("KHỞI ĐỘNG / Engage", 5),
            ("KHÁM PHÁ / Explore", 10),
            ("GIẢI THÍCH / Explain", 12),
            ("MỞ RỘNG / Elaborate", 10),
            ("ĐÁNH GIÁ / Evaluate", 8),
        ]
    else:
        phases = [
            ("KHỞI ĐỘNG / Xác định vấn đề", 5),
            ("HÌNH THÀNH KIẾN THỨC MỚI", 25),
            ("LUYỆN TẬP", 10),
            ("VẬN DỤNG", 5),
        ]

    if omit_phase:
        phases = [phase for phase in phases if omit_phase.lower() not in phase[0].lower()]
    if swap_order and len(phases) >= 3:
        phases[1], phases[2] = phases[2], phases[1]
    if durations:
        phases = [(phase, durations[index]) for index, (phase, _) in enumerate(phases)]

    def table_for(index: int) -> str:
        if table_mode == "missing" and index == 1:
            return ""
        if table_mode == "empty_cell" and index == 1:
            return """
| Hoạt động của giáo viên | Hoạt động của học sinh |
|---|---|
| Chuyển giao nhiệm vụ học tập: nêu nhiệm vụ |  |
| Thực hiện nhiệm vụ học tập: hỗ trợ | Thực hiện nhiệm vụ |
| Báo cáo thảo luận: gọi đại diện | Báo cáo kết quả |
| Kết luận, nhận định: chuẩn hóa | Ghi nhận kiến thức |
"""
        return """
| Hoạt động của giáo viên | Hoạt động của học sinh |
|---|---|
| Chuyển giao nhiệm vụ học tập: nêu nhiệm vụ | Tiếp nhận nhiệm vụ |
| Thực hiện nhiệm vụ học tập: hỗ trợ | Thực hiện nhiệm vụ |
| Báo cáo thảo luận: gọi đại diện | Báo cáo kết quả |
| Kết luận, nhận định: chuẩn hóa | Ghi nhận kiến thức |
"""

    activity_blocks = []
    for index, (phase, duration) in enumerate(phases, 1):
        assessment = "**Phương án đánh giá:** Giáo viên quan sát, nhận xét sản phẩm học tập." if include_assessment else ""
        activity_blocks.append(f"""
### Hoạt động {index}: {phase}
Thời lượng: {duration} phút
Hình thức tổ chức: nhóm nhỏ kết hợp cả lớp
**Mục tiêu:** Học sinh thực hiện nhiệm vụ của pha {phase.lower()}.
**Nội dung:** Nhiệm vụ học tập về {topic}.
**Sản phẩm:** Câu trả lời hoặc phiếu học tập.
**Tổ chức thực hiện:**
{table_for(index)}
{assessment}
""")

    return f"""
# KẾ HOẠCH BÀI DẠY
**Môn học:** Toán
**Lớp:** 8
**Bài:** {topic}
**Thời gian:** 45 phút

## I. MỤC TIÊU
### 1. Năng lực
- Nhận diện được kiến thức trọng tâm của bài {topic}.
- Vận dụng được kiến thức để giải quyết nhiệm vụ học tập.
### 2. Phẩm chất
- Chăm chỉ khi hoàn thành nhiệm vụ nhóm.

## II. PHƯƠNG PHÁP DẠY HỌC VÀ KĨ THUẬT DẠY HỌC
- Phương pháp: dạy học giải quyết vấn đề, thảo luận nhóm.
- Kĩ thuật: hỏi đáp nhanh, khăn trải bàn.

## III. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU
- SGK Toán 8, phiếu học tập, bảng phụ.

## IV. TIẾN TRÌNH DẠY HỌC
{''.join(activity_blocks)}
"""


def test_rule_based_check_valid_cv5512():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("CV-5512"), "CV-5512")

    assert result["rule_passed"] is True
    assert result["issues"] == []


def test_rule_based_check_missing_phase():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("5E", omit_phase="Evaluate"), "5E")

    assert result["rule_passed"] is False
    assert result["checks"]["has_all_phases"] is False
    assert any("Thiếu hoạt động" in error for error in result["errors"])


def test_rule_based_check_wrong_phase_order():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("5E", swap_order=True), "5E")

    assert result["rule_passed"] is False
    assert result["checks"]["phases_in_order"] is False
    assert any("Thứ tự hoạt động" in error for error in result["errors"])


def test_rule_based_check_missing_activity_table():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase", table_mode="missing"), "3-phase")

    assert result["rule_passed"] is False
    assert result["checks"]["has_activity_tables"] is False
    assert any("Thiếu bảng" in error for error in result["errors"])


def test_rule_based_check_rejects_empty_table_cell():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase", table_mode="empty_cell"), "3-phase")

    assert result["rule_passed"] is False
    assert any("ô trống" in error for error in result["errors"])


def test_rule_based_check_missing_assessment():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase", include_assessment=False), "3-phase")

    assert result["rule_passed"] is False
    assert result["checks"]["has_assessment"] is False
    assert any("phương án đánh giá" in error.lower() for error in result["errors"])


def test_rule_based_check_duration_mismatch():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase", durations=[20, 20, 20, 20]), "3-phase")

    assert result["rule_passed"] is False
    assert result["checks"]["duration_consistent"] is False
    assert any("vượt thời lượng" in error for error in result["errors"])


def test_rule_based_check_topic_mismatch():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase", topic="Đơn thức"), "3-phase", topic="Tam giác")

    assert result["rule_passed"] is False
    assert any("chưa khớp chủ đề" in error for error in result["errors"])


def test_rule_based_check_skips_source_grounding_without_rag():
    from app.graph.nodes.quality_checker import _rule_based_check

    result = _rule_based_check(_quality_plan_fixture("3-phase"), "3-phase")

    assert result["rule_passed"] is True
    assert any(item["check"] == "Reference material grounding" for item in result["skipped_checks"])


@pytest.mark.asyncio
async def test_quality_checker_run_clean_pass_with_llm(monkeypatch):
    from app.graph.nodes import quality_checker

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "status": "PASSED",
                "score": 96,
                "summary": "Giáo án tốt.",
                "issues": [],
                "passed_checks": ["Nội dung chính xác"],
                "skipped_checks": [],
                "checks": {"content_accuracy": True},
                "errors": [],
                "feedback": "",
            })

    monkeypatch.setattr(quality_checker, "llm_client", FakeLLM())

    result = await quality_checker.run({
        "plan_id": "qc-clean-pass",
        "subject": "Toán",
        "grade": "8",
        "topic": "Hàm số bậc nhất",
        "teaching_model": "5E",
        "current_markdown": _quality_plan_fixture("5E"),
        "rag_context": [],
        "stream_queue": None,
    })

    qr = result["quality_result"]
    assert qr["status"] == "PASSED"
    assert qr["issues"] == []
    assert "summary" in qr
    assert "Nội dung chính xác" in qr["passed_checks"]


@pytest.mark.asyncio
async def test_quality_checker_run_merges_llm_major_issue(monkeypatch):
    from app.graph.nodes import quality_checker

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "status": "FAILED",
                "score": 82,
                "summary": "Cần sửa nội dung.",
                "issues": [{
                    "severity": "Major",
                    "section": "Hoạt động 2",
                    "problem": "Nhiệm vụ khám phá còn quá chung.",
                    "suggestion": "Thêm dữ liệu hoặc câu hỏi cụ thể cho học sinh phân tích.",
                }],
                "passed_checks": [],
                "skipped_checks": [],
                "checks": {"pedagogical_alignment": False},
                "errors": [],
                "feedback": "",
            })

    monkeypatch.setattr(quality_checker, "llm_client", FakeLLM())

    result = await quality_checker.run({
        "plan_id": "qc-llm-major",
        "subject": "Toán",
        "grade": "8",
        "topic": "Hàm số bậc nhất",
        "teaching_model": "5E",
        "current_markdown": _quality_plan_fixture("5E"),
        "rag_context": [],
        "stream_queue": None,
    })

    qr = result["quality_result"]
    assert qr["status"] == "FAILED"
    assert qr["score"] <= 90
    assert any(issue["section"] == "Hoạt động 2" for issue in qr["issues"])
    assert "Thêm dữ liệu" in qr["feedback"]


@pytest.mark.asyncio
async def test_quality_checker_run_malformed_llm_json_skips_review(monkeypatch):
    from app.graph.nodes import quality_checker

    class FakeLLM:
        async def call(self, **kwargs):
            return "not json"

    monkeypatch.setattr(quality_checker, "llm_client", FakeLLM())

    result = await quality_checker.run({
        "plan_id": "qc-bad-json",
        "subject": "Toán",
        "grade": "8",
        "topic": "Hàm số bậc nhất",
        "teaching_model": "5E",
        "current_markdown": _quality_plan_fixture("5E"),
        "rag_context": [],
        "stream_queue": None,
    })

    qr = result["quality_result"]
    assert qr["status"] == "PASSED"
    assert any(item["check"] == "LLM pedagogical/content review" for item in qr["skipped_checks"])


@pytest.mark.asyncio
async def test_quality_checker_run_llm_outage_skips_review(monkeypatch):
    from app.graph.nodes import quality_checker

    class FakeLLM:
        async def call(self, **kwargs):
            raise RuntimeError("provider down")

    monkeypatch.setattr(quality_checker, "llm_client", FakeLLM())

    result = await quality_checker.run({
        "plan_id": "qc-llm-down",
        "subject": "Toán",
        "grade": "8",
        "topic": "Hàm số bậc nhất",
        "teaching_model": "5E",
        "current_markdown": _quality_plan_fixture("5E"),
        "rag_context": [],
        "stream_queue": None,
    })

    qr = result["quality_result"]
    assert qr["status"] == "PASSED"
    assert any("provider down" in item["reason"] for item in qr["skipped_checks"])


@pytest.mark.asyncio
async def test_quality_checker_run_feedback_is_retry_friendly():
    from app.graph.nodes import quality_checker

    result = await quality_checker.run({
        "plan_id": "qc-retry-feedback",
        "teaching_model": "3-phase",
        "current_markdown": _quality_plan_fixture("3-phase", table_mode="missing"),
        "stream_queue": None,
    })

    qr = result["quality_result"]
    assert qr["status"] == "FAILED"
    assert qr["errors"]
    assert "Bổ sung" in qr["feedback"] or "Thêm" in qr["feedback"]
    assert all({"severity", "section", "problem", "suggestion"} <= set(issue) for issue in qr["issues"])


def test_prompt_templates_cover_supported_models():
    """Test prompt generation mentions required model-specific phases."""
    from app.prompts.templates import build_blueprint_prompt, build_final_markdown_prompt

    base = {
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
    }
    planning_base = {
        **base,
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "quality_feedback": "",
    }
    context_pack = {
        "sources": [{"source_id": "sgk-toan-8", "title": "SGK Toán 8", "type": "raw_vector_search"}],
        "source_ids": ["sgk-toan-8"],
        "text": '<source id="sgk-toan-8">Nội dung SGK</source>',
    }
    blueprint = {
        "title": "Đơn thức",
        "duration_minutes": 45,
        "activities": [{"phase": "Khởi động", "duration_minutes": 5}],
    }

    blueprint_prompt = build_blueprint_prompt(teaching_model="5E", context_pack=context_pack, **planning_base)
    prompt_5e = build_final_markdown_prompt(
        teaching_model="5E", blueprint=blueprint, context_pack=context_pack, **base
    )
    prompt_3_phase = build_final_markdown_prompt(
        teaching_model="3-phase", blueprint=blueprint, context_pack=context_pack, **base
    )
    prompt_cv = build_final_markdown_prompt(
        teaching_model="CV-5512", blueprint=blueprint, context_pack=context_pack, **base
    )

    assert "Engage" in prompt_5e and "Evaluate" in prompt_5e
    assert "Vận dụng" in prompt_3_phase or "VẬN DỤNG" in prompt_3_phase
    assert "CV-5512" in prompt_cv and "PHƯƠNG PHÁP" in prompt_cv
    assert "{{" not in prompt_5e and "}}" not in prompt_5e
    assert "TÀI LIỆU HỆ THỐNG" not in blueprint_prompt
    assert "TÀI LIỆU UPLOAD" not in blueprint_prompt


def test_refiner_prompt_requires_one_replacement_document():
    """Test chat refinements are prompted as latest-only replacements."""
    from app.standalone import refiner

    prompt = refiner.REFINER_SYSTEM_PROMPT

    assert "Return exactly one complete updated lesson plan" in prompt
    assert "Do not include the old version" in prompt
    assert "comparison" in prompt
    assert "diff" in prompt


def test_generator_context_pack_dedupes_rag_sources(monkeypatch):
    """Test generator builds one deduplicated context pack from rag_context."""
    from app.graph.nodes import generator

    monkeypatch.setattr(generator.settings, "RAG_CONTEXT_MAX_CHARS", 500)
    monkeypatch.setattr(generator.settings, "RAG_CHUNK_MAX_CHARS", 300)
    pack = generator._build_context_pack([
        {
            "text": "SGK chunk",
            "source": "sgk",
            "score": 0.9,
            "type": "raw_vector_search",
            "metadata": {"raw_path": "raw/sgk.md", "lesson": "Bài 1"},
        },
        {
            "text": "SGK chunk",
            "source": "sgk",
            "score": 0.8,
            "type": "raw_vector_search",
            "metadata": {"raw_path": "raw/sgk.md", "lesson": "Bài 1"},
        },
        {
            "text": "Uploaded teacher note",
            "source": "uploaded_doc_1",
            "score": 0.7,
            "type": "uploaded_doc",
            "metadata": {"source": "uploaded_doc"},
        },
    ])

    assert pack["source_ids"] == ["raw/sgk.md", "uploaded_doc_1"]
    assert pack["text"].count("SGK chunk") == 1
    assert "Uploaded teacher note" in pack["text"]


def test_generator_context_pack_prefers_citation_alias(monkeypatch):
    """Test source aliases become the prompt-facing source IDs."""
    from app.graph.nodes import generator

    monkeypatch.setattr(generator.settings, "RAG_CONTEXT_MAX_CHARS", 500)
    monkeypatch.setattr(generator.settings, "RAG_CHUNK_MAX_CHARS", 300)

    pack = generator._build_context_pack([
        {
            "text": "SGK chunk",
            "source": "sgk",
            "source_alias": "S1",
            "score": 0.9,
            "type": "raw_vector_search",
            "metadata": {
                "source_alias": "S1",
                "raw_path": "raw/sgk.md",
                "lesson": "Bài 1",
                "chunk_id": "raw/sgk.md:1-10:p1",
            },
            "source_detail": {
                "id": "S1",
                "title": "SGK Toán 8",
                "type": "raw_vector_search",
                "raw_path": "raw/sgk.md",
                "lesson": "Bài 1",
                "score": 0.9,
            },
        },
    ])

    assert pack["source_ids"] == ["S1"]
    assert pack["rag_source_details"][0]["title"] == "SGK Toán 8"
    assert '<source id="S1">' in pack["text"]


@pytest.mark.asyncio
async def test_generator_does_not_convert_json(monkeypatch):
    """Test generator plans with a blueprint call, then streams markdown only."""
    from app.graph.nodes import generator

    captured = {"calls": [], "streams": []}

    class FakeLLM:
        async def call(self, **kwargs):
            captured["calls"].append(kwargs)
            return json.dumps({
                "title": "Đơn thức",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            captured["streams"].append(kwargs)
            yield "# Markdown"

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-generator-no-json",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "system_resource_texts": [],
        "uploaded_docs": [],
        "quality_result": {},
        "current_markdown": "",
        "stream_queue": None,
        "iteration": 0,
    }

    result = await generator.run(state)
    assert result["current_markdown"] == "# Markdown"
    assert result["current_plan"] == {}
    assert result["generation_blueprint"]["title"] == "Đơn thức"
    assert len(captured["calls"]) == 1
    assert "blueprint JSON" in captured["calls"][0]["prompt"]
    assert "Chuyển giáo án markdown" not in captured["calls"][0]["prompt"]
    assert "BLUEPRINT" in captured["streams"][0]["prompt"]


@pytest.mark.asyncio
async def test_generator_repair_receives_feedback(monkeypatch):
    """Test repair iteration sends previous markdown and QC feedback."""
    from app.graph.nodes import generator

    captured = {}

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "title": "Đơn thức",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            captured["prompt"] = kwargs["prompt"]
            yield "# Fixed"

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-generator-repair",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "system_resource_texts": [],
        "uploaded_docs": [],
        "quality_result": {"feedback": "Thiếu bảng GV/HS", "errors": ["Thiếu đánh giá"]},
        "current_markdown": "# Old draft",
        "stream_queue": None,
        "iteration": 1,
    }

    result = await generator.run(state)
    assert result["current_markdown"] == "# Fixed"
    assert "# Old draft" in captured["prompt"]
    assert "Thiếu bảng GV/HS" in captured["prompt"]
    assert "TOÀN BỘ" in captured["prompt"]


@pytest.mark.asyncio
async def test_generator_repair_emits_reset_before_repair_chunks(monkeypatch):
    """Test repair iteration clears the streamed preview before new markdown."""
    from app.graph.nodes import generator

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "title": "Lesson",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            yield "# Fixed"

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    queue = asyncio.Queue()
    state = {
        "plan_id": "test-generator-repair-reset",
        "subject": "Math",
        "grade": "8",
        "topic": "Linear functions",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "system_resource_texts": [],
        "uploaded_docs": [],
        "quality_result": {"feedback": "Fix the table", "errors": []},
        "current_markdown": "# Old draft",
        "stream_queue": queue,
        "iteration": 1,
    }

    await generator.run(state)

    events = []
    while not queue.empty():
        events.append(await queue.get())

    event_types = [event["event"] for event in events]
    reset_index = event_types.index("reset")
    chunk_index = event_types.index("chunk")

    assert reset_index < chunk_index
    assert events[reset_index]["data"] == {"reason": "quality_repair", "iteration": 2}


@pytest.mark.asyncio
async def test_generator_first_iteration_does_not_emit_reset(monkeypatch):
    """Test first generation streams normally without a reset boundary."""
    from app.graph.nodes import generator

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "title": "Lesson",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            yield "# Draft"

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    queue = asyncio.Queue()
    state = {
        "plan_id": "test-generator-first-no-reset",
        "subject": "Math",
        "grade": "8",
        "topic": "Linear functions",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "quality_result": {},
        "current_markdown": "",
        "stream_queue": queue,
        "iteration": 0,
    }

    await generator.run(state)

    events = []
    while not queue.empty():
        events.append(await queue.get())

    assert "reset" not in [event["event"] for event in events]


@pytest.mark.asyncio
async def test_generator_sanitizes_wrapping_code_fence(monkeypatch):
    """Test generator strips a wrapping markdown fence before storing output."""
    from app.graph.nodes import generator

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "title": "Đơn thức",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            yield "```markdown\n# Markdown\n```"

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-generator-sanitize",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "quality_result": {},
        "current_markdown": "",
        "stream_queue": None,
        "iteration": 0,
    }

    result = await generator.run(state)
    assert result["current_markdown"] == "# Markdown"


@pytest.mark.asyncio
async def test_generator_empty_repair_keeps_previous_markdown(monkeypatch):
    """Test an empty repair response does not replace the last usable draft."""
    from app.graph.nodes import generator

    class FakeLLM:
        async def call(self, **kwargs):
            return json.dumps({
                "title": "Đơn thức",
                "duration_minutes": 45,
                "activities": [{"phase": "Engage", "duration_minutes": 5}],
            })

        async def stream(self, **kwargs):
            if False:
                yield ""

    monkeypatch.setattr(generator, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-generator-empty-repair",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "objectives": [],
        "emphasis": "",
        "special_requests": "",
        "rag_context": [],
        "quality_result": {"feedback": "Thiếu đánh giá", "errors": []},
        "current_markdown": "# Old draft",
        "stream_queue": None,
        "iteration": 1,
    }

    result = await generator.run(state)
    assert result["current_markdown"] == "# Old draft"
    assert result["error"] == "Generator returned empty markdown"


@pytest.mark.asyncio
async def test_json_converter_runs_after_final_markdown(monkeypatch):
    """Test JSON converter creates plan JSON and preserves final raw markdown."""
    from app.graph.nodes import json_converter

    class FakeLLM:
        async def call(self, **kwargs):
            return '{"metadata":{"subject":"Toán","grade":"8","topic":"Đơn thức","teaching_model":"5E"},"sections":{},"rag_sources":[],"compliance":{"status":"PENDING","errors":[]}}'

    monkeypatch.setattr(json_converter, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-json-converter",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "current_markdown": "# Final markdown",
        "rag_context": [],
        "stream_queue": None,
    }

    result = await json_converter.run(state)
    assert result["current_plan"]["metadata"]["topic"] == "Đơn thức"
    assert result["current_plan"]["raw_markdown"] == "# Final markdown"


@pytest.mark.asyncio
async def test_json_converter_preserves_rag_source_details(monkeypatch):
    """Test JSON output stores citation aliases and source details from RAG."""
    from app.graph.nodes import json_converter

    class FakeLLM:
        async def call(self, **kwargs):
            return '{"metadata":{"subject":"Toán","grade":"8","topic":"Đơn thức","teaching_model":"5E"},"sections":{},"rag_sources":[],"compliance":{"status":"PENDING","errors":[]}}'

    monkeypatch.setattr(json_converter, "llm_client", FakeLLM())
    state = {
        "plan_id": "test-json-citations",
        "subject": "Toán",
        "grade": "8",
        "topic": "Đơn thức",
        "teaching_model": "5E",
        "current_markdown": "# Final markdown\nNguồn: [S1]",
        "rag_context": [{
            "source": "SGK Toán 8",
            "source_alias": "S1",
            "score": 0.91,
            "type": "raw_vector_search",
            "metadata": {
                "source_alias": "S1",
                "raw_path": "raw/toan.md",
                "lesson": "Bài 1",
                "section": "Đơn thức",
                "chunk_id": "raw/toan.md:1-8:p1",
            },
            "source_detail": {
                "id": "S1",
                "title": "SGK Toán 8",
                "type": "raw_vector_search",
                "raw_path": "raw/toan.md",
                "lesson": "Bài 1",
                "section": "Đơn thức",
                "score": 0.91,
            },
        }],
        "stream_queue": None,
    }

    result = await json_converter.run(state)

    assert result["current_plan"]["rag_sources"] == ["S1"]
    assert result["current_plan"]["rag_source_details"][0]["raw_path"] == "raw/toan.md"


# ============================
# Test Formatter Node
# ============================

@pytest.mark.asyncio
async def test_formatter_node():
    """Test formatter produces correct output."""
    from app.graph.nodes.formatter import run as formatter_run

    queue = asyncio.Queue()
    state = {
        "plan_id": "test-fmt-001",
        "current_plan": {
            "metadata": {
                "subject": "Toán",
                "grade": "10",
                "topic": "Test",
                "teaching_model": "5E",
                "objectives": [],
                "competencies": ["Tư duy"],
                "qualities": ["Chăm chỉ"],
                "duration_minutes": 45,
                "materials": ["SGK"],
            },
            "sections": {},
        },
        "current_markdown": "# Test markdown",
        "quality_result": {"status": "PASSED", "score": 90, "errors": []},
        "stream_queue": queue,
        "iteration": 1,
    }

    result = await formatter_run(state)
    assert result["current_plan"]["lesson_plan_id"] == "test-fmt-001"
    assert result["current_plan"]["compliance"]["status"] == "PASSED"

    # Check events pushed to queue
    events = []
    while not queue.empty():
        events.append(await queue.get())
    event_types = [e["event"] for e in events]
    assert "progress" in event_types
    assert "plan" in event_types
    assert "done" in event_types


# ============================
# Test Node Decorator
# ============================

@pytest.mark.asyncio
async def test_log_node_decorator():
    """Test log_node decorator wraps function correctly."""
    from app.graph.decorators import log_node

    @log_node
    async def test_node(state):
        return {**state, "processed": True}

    state = {"plan_id": "test", "iteration": 0}
    result = await test_node(state)
    assert result["processed"] is True


@pytest.mark.asyncio
async def test_log_node_decorator_error():
    """Test log_node decorator handles errors."""
    from app.graph.decorators import log_node

    @log_node
    async def failing_node(state):
        raise ValueError("Test error")

    state = {"plan_id": "test", "iteration": 0}
    with pytest.raises(ValueError, match="Test error"):
        await failing_node(state)
