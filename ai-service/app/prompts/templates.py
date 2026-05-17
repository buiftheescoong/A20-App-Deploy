"""
Prompt builders for lesson-plan generation, quality review, and JSON conversion.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=4)
def _load_reference(name: str) -> str:
    repo_root = Path(__file__).resolve().parents[3]
    path = repo_root / "references" / name
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _teaching_model_label(teaching_model: str) -> str:
    if teaching_model == "5E":
        return "5E"
    if teaching_model == "CV-5512":
        return "CV-5512"
    return "3-phase"


def _phase_contract(teaching_model: str) -> dict[str, Any]:
    if teaching_model == "5E":
        return {
            "label": "5E",
            "activity_count": 5,
            "phases": [
                "Hoạt động 1: Khởi động / Engage",
                "Hoạt động 2: Khám phá / Explore",
                "Hoạt động 3: Giải thích / Explain",
                "Hoạt động 4: Mở rộng / Elaborate",
                "Hoạt động 5: Đánh giá / Evaluate",
            ],
            "duration_hint": "5 + 10 + 12 + 10 + 8 = 45 phút",
            "extra_rules": [
                "Explore phải để học sinh tự khám phá trước khi giáo viên chốt kiến thức.",
                "Evaluate phải có minh chứng đánh giá cụ thể, không chỉ giao bài về nhà.",
            ],
        }
    if teaching_model == "CV-5512":
        return {
            "label": "CV-5512",
            "activity_count": 4,
            "phases": [
                "Hoạt động 1: Khởi động / Xác định vấn đề",
                "Hoạt động 2: Hình thành kiến thức mới",
                "Hoạt động 3: Luyện tập",
                "Hoạt động 4: VẬN DỤNG",
            ],
            "duration_hint": "5 + 25 + 10 + 5 = 45 phút",
            "extra_rules": [
                "Mỗi hoạt động phải có mục tiêu, sản phẩm, tổ chức thực hiện và phương án đánh giá.",
                "Tổ chức thực hiện phải dùng bảng 2 cột giáo viên/học sinh với 4 bước: chuyển giao, thực hiện, báo cáo thảo luận, kết luận nhận định.",
                "Không tạo cột Nội dung riêng trong bảng tổ chức thực hiện của CV-5512.",
            ],
        }
    return {
        "label": "3-phase",
        "activity_count": 4,
        "phases": [
            "Hoạt động 1: Khởi động / Xác định vấn đề",
            "Hoạt động 2: Hình thành kiến thức mới",
            "Hoạt động 3: Luyện tập",
            "Hoạt động 4: Vận dụng",
        ],
        "duration_hint": "5 + 25 + 10 + 5 = 45 phút",
        "extra_rules": [
            "Hoạt động hình thành kiến thức phải giúp học sinh chiếm lĩnh kiến thức mới qua nhiệm vụ học tập.",
            "Hoạt động LUYỆN TẬP và VẬN DỤNG phải khác nhau rõ ràng về mục đích và sản phẩm.",
        ],
    }


def _format_list(items: list[str]) -> str:
    clean_items = [str(item).strip() for item in items if str(item).strip()]
    if not clean_items:
        return "- Chưa có mục tiêu riêng từ giáo viên; suy luận mục tiêu từ chủ đề và nguồn học liệu."
    return "\n".join(f"- {item}" for item in clean_items)


def get_quality_checklist() -> str:
    return _load_reference("quality-checklist.md")


def build_blueprint_prompt(
    *,
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
    context_pack: dict[str, Any],
    objectives: list[str],
    emphasis: str,
    special_requests: str,
    quality_feedback: str = "",
) -> str:
    """Build the non-streaming planning prompt used before final markdown."""
    contract = _phase_contract(teaching_model)
    sources = context_pack.get("sources", [])
    source_summary = json.dumps(sources, ensure_ascii=False, indent=2) if sources else "[]"
    source_text = context_pack.get("text", "") or "Không có nguồn học liệu được truy xuất."
    feedback = quality_feedback.strip() or "Không có feedback; đây là lần sinh đầu tiên."

    return f"""Bạn là chuyên gia thiết kế giáo án GDPT 2018. Hãy lập blueprint JSON ngắn gọn trước khi viết giáo án.

Ngữ cảnh bài học:
- Môn học: {subject}
- Lớp: {grade}
- Bài: {topic}
- Mô hình dạy học: {contract["label"]}
- Tổng thời lượng: 45 phút
- Gợi ý phân bổ thời gian: {contract["duration_hint"]}

Mục tiêu giáo viên cung cấp:
{_format_list(objectives)}

Nội dung cần nhấn mạnh:
{emphasis or "Không có."}

Yêu cầu đặc biệt:
{special_requests or "Không có."}

Feedback chất lượng cần sửa nếu đang retry:
{feedback}

Nguồn học liệu hợp lệ. Chỉ được trích dẫn các source_id trong danh sách này:
{source_summary}

Nội dung nguồn học liệu:
{source_text}

Yêu cầu mô hình dạy học:
- Phải có đúng {contract["activity_count"]} hoạt động chính.
- Thứ tự pha bắt buộc: {"; ".join(contract["phases"])}.
- {" ".join(contract["extra_rules"])}

Trả về DUY NHẤT một JSON object hợp lệ, không markdown fence, không giải thích. JSON phải có các key:
{{
  "title": "tên bài học",
  "duration_minutes": 45,
  "objectives": ["2-4 mục tiêu quan sát được, bám nguồn và yêu cầu giáo viên"],
  "competencies": ["năng lực chuyên môn", "năng lực chung gắn với hành động"],
  "qualities": ["phẩm chất gắn với hành vi học tập"],
  "methods": ["phương pháp/kĩ thuật dạy học sẽ xuất hiện lại trong hoạt động"],
  "materials": ["thiết bị, học liệu, phiếu học tập hoặc nguồn thật được dùng"],
  "source_ids": ["source_id thật đã dùng; để [] nếu không có nguồn"],
  "alignment_chain": ["mục tiêu -> phương pháp/học liệu -> hoạt động -> minh chứng đánh giá"],
  "activities": [
    {{
      "phase": "tên pha đúng mô hình",
      "duration_minutes": 0,
      "organization": "cá nhân/cặp đôi/nhóm/cả lớp",
      "objective": "mục tiêu riêng của hoạt động",
      "content": "nội dung/nhiệm vụ cụ thể",
      "product": "sản phẩm học tập quan sát được",
      "teacher_actions": ["chuyển giao", "hỗ trợ thực hiện", "tổ chức báo cáo", "kết luận nhận định"],
      "student_actions": ["tiếp nhận", "thực hiện", "báo cáo thảo luận", "ghi nhận hoàn thiện"],
      "assessment": "hình thức + căn cứ + người đánh giá"
    }}
  ],
  "source_use_note": "nêu cách dùng nguồn; nếu không có nguồn thì ghi cần giáo viên kiểm chứng chuyên môn"
}}

Ràng buộc:
- Tổng duration_minutes của activities phải bằng 45.
- Không dùng placeholder, dấu ba chấm, ô trống, hoặc nội dung mẫu chưa thay thế.
- Không bịa tên sách, tác giả, tài liệu hoặc citation ngoài source_id hợp lệ.
- Khi một mục tiêu, học liệu, ví dụ, thí nghiệm hoặc nội dung chuyên môn dựa trên nguồn, ghi source_id dạng S1/S2 trong `source_ids`.
- Nếu nguồn thiếu, đưa giả định sư phạm hợp lý và đánh dấu cần giáo viên kiểm chứng, không bịa nguồn."""


def build_final_markdown_prompt(
    *,
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
    blueprint: dict[str, Any],
    context_pack: dict[str, Any],
    quality_feedback: str = "",
) -> str:
    """Build the streaming prompt that turns a blueprint into final markdown."""
    contract = _phase_contract(teaching_model)
    blueprint_text = json.dumps(blueprint, ensure_ascii=False, indent=2)
    source_ids = ", ".join(context_pack.get("source_ids", [])) or "không có nguồn truy xuất"
    source_summary = json.dumps(context_pack.get("sources", []), ensure_ascii=False, indent=2)
    feedback_block = ""
    if quality_feedback.strip():
        feedback_block = f"\nFeedback cần khắc phục trong bản cuối:\n{quality_feedback.strip()}\n"

    return f"""Bạn là chuyên gia soạn giáo án GDPT 2018. Viết giáo án hoàn chỉnh bằng tiếng Việt từ blueprint bên dưới.

Thông tin cố định:
- Môn học: {subject}
- Lớp: {grade}
- Bài: {topic}
- Mô hình: {contract["label"]}
- Thời lượng: 45 phút
- Source id hợp lệ: {source_ids}
{feedback_block}
NGUỒN HỌC LIỆU HỢP LỆ:
{source_summary}

BLUEPRINT:
{blueprint_text}

Yêu cầu đầu ra markdown:
- Chỉ trả về markdown giáo án hoàn chỉnh, không giải thích ngoài giáo án, không dùng markdown fence.
- Bắt đầu bằng `# KẾ HOẠCH BÀI DẠY`, sau đó có Môn học, Lớp, Bài, Thời gian thực hiện.
- Có đúng các mục chính: `## I. MỤC TIÊU`, `## II. PHƯƠNG PHÁP DẠY HỌC VÀ KĨ THUẬT DẠY HỌC`, `## III. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU`, `## IV. TIẾN TRÌNH DẠY HỌC`.
- Mục I có năng lực và phẩm chất cụ thể, quan sát được.
- Mục II liệt kê phương pháp/kĩ thuật và các phương pháp này phải xuất hiện lại trong hoạt động.
- Mục III chỉ liệt kê học liệu thật từ blueprint/source id hoặc học liệu giáo viên có thể chuẩn bị; không bịa citation.
- Với học liệu và nội dung chuyên môn lấy từ nguồn, gắn citation dạng `[S1]`, `[S2]` ngay sau câu/cụm liên quan; chỉ dùng source id hợp lệ.
- Mục IV có đúng {contract["activity_count"]} hoạt động chính theo thứ tự: {"; ".join(contract["phases"])}.
- Mỗi hoạt động phải có thời lượng, hình thức tổ chức, mục tiêu, nội dung/nhiệm vụ, sản phẩm, bảng 2 cột GV/HS, phương án đánh giá.
- Bảng GV/HS của mỗi hoạt động phải có đủ 4 hàng: Chuyển giao nhiệm vụ học tập; Thực hiện nhiệm vụ học tập; Báo cáo thảo luận; Kết luận, nhận định.
- Tổng thời lượng hoạt động bằng 45 phút.
- Không để placeholder, dấu ba chấm, ô bảng trống, hoặc dòng mẫu chưa thay thế.
- Sau mục IV, thêm `## V. NGUỒN HỌC LIỆU VÀ TRÍCH DẪN` liệt kê từng source id đã dùng, tên nguồn, bài/mục nếu có.
- Nội dung chuyên môn phải bám blueprint và nguồn học liệu; khi thiếu nguồn, ghi rõ giả định cần giáo viên kiểm chứng trong phần học liệu hoặc ghi chú cuối giáo án."""


def build_generation_user_prompt(
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
) -> str:
    return (
        f"Hãy soạn giáo án hoàn chỉnh cho bài: {topic}\n"
        f"Môn: {subject}, Lớp: {grade}\n"
        f"Mô hình: {_teaching_model_label(teaching_model)}\n"
        "Chỉ trả về markdown giáo án hoàn chỉnh."
    )


def build_generator_system_prompt(
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
    rag_context: list[dict],
    objectives: list[str],
    emphasis: str,
    special_requests: str,
    quality_feedback: str,
    system_resource_texts: list[str],
    uploaded_docs: list[str],
) -> str:
    """Compatibility wrapper for older tests/callers.

    New generator code builds a context pack itself and calls
    `build_blueprint_prompt` plus `build_final_markdown_prompt`.
    """
    context_sources = []
    context_text_parts = []
    for index, chunk in enumerate(rag_context, 1):
        metadata = chunk.get("metadata") or {}
        source_id = str(metadata.get("raw_path") or metadata.get("source_title") or chunk.get("source") or f"source_{index}")
        context_sources.append({
            "source_id": source_id,
            "title": metadata.get("source_title") or chunk.get("source") or source_id,
            "type": chunk.get("type", "rag"),
        })
        context_text_parts.append(f"<source id=\"{source_id}\">\n{chunk.get('text', '')}\n</source>")
    context_pack = {
        "sources": context_sources,
        "source_ids": [source["source_id"] for source in context_sources],
        "text": "\n\n".join(context_text_parts),
    }
    blueprint_prompt = build_blueprint_prompt(
        subject=subject,
        grade=grade,
        topic=topic,
        teaching_model=teaching_model,
        context_pack=context_pack,
        objectives=objectives,
        emphasis=emphasis,
        special_requests=special_requests,
        quality_feedback=quality_feedback,
    )
    final_prompt = build_final_markdown_prompt(
        subject=subject,
        grade=grade,
        topic=topic,
        teaching_model=teaching_model,
        blueprint={},
        context_pack=context_pack,
        quality_feedback=quality_feedback,
    )
    return f"{blueprint_prompt}\n\n---\n\n{final_prompt}"


def build_repair_user_prompt(
    subject: str,
    grade: str,
    topic: str,
    teaching_model: str,
    previous_markdown: str,
    quality_feedback: str,
    blueprint: dict[str, Any] | None = None,
) -> str:
    blueprint_text = json.dumps(blueprint or {}, ensure_ascii=False, indent=2)
    return f"""Bản nháp giáo án dưới đây chưa đạt kiểm tra chất lượng.

Thông tin bài học:
- Môn: {subject}
- Lớp: {grade}
- Bài: {topic}
- Mô hình: {_teaching_model_label(teaching_model)}

Feedback cần sửa:
{quality_feedback}

Blueprint mới cần tuân thủ:
{blueprint_text}

Bản nháp hiện tại:
---
{previous_markdown}
---

Hãy trả về TOÀN BỘ giáo án markdown đã sửa, không giải thích ngoài giáo án.
Yêu cầu sửa:
- Sửa trực tiếp từng lỗi trong feedback.
- Giữ lại các phần đã đúng nếu không mâu thuẫn với feedback.
- Bảo đảm đủ hoạt động theo mô hình, đủ bảng GV/HS và phương án đánh giá.
- Không để placeholder, dấu ba chấm, markdown fence, hoặc ô bảng trống."""


QUALITY_CHECK_PROMPT = """Bạn là chuyên gia kiểm tra chất lượng giáo án theo chuẩn GDPT 2018.

Dùng checklist chuẩn nội bộ sau làm nguồn đánh giá chính:
{quality_checklist}

NGỮ CẢNH BÀI HỌC:
- Môn: {subject}
- Lớp: {grade}
- Bài: {topic}
- Mô hình dạy học: {teaching_model}

GIÁO ÁN CẦN KIỂM TRA:
{lesson_markdown}

TRẢ VỀ JSON (CHỈ JSON, KHÔNG THÊM TEXT). Dùng đúng schema sau:
{{
    "status": "PASSED" hoặc "FAILED",
    "score": 0-100,
    "summary": "Tóm tắt ngắn bằng tiếng Việt về chất lượng giáo án.",
    "issues": [
        {{
            "severity": "Critical" hoặc "Major" hoặc "Minor",
            "section": "Mục hoặc hoạt động liên quan",
            "problem": "Vấn đề cụ thể, ưu tiên lỗi ảnh hưởng khả năng sử dụng",
            "suggestion": "Cách sửa ngắn gọn, hành động được"
        }}
    ],
    "passed_checks": ["Tên kiểm tra đã đánh giá và đạt"],
    "skipped_checks": [
        {{
            "check": "Tên kiểm tra không thể đánh giá",
            "reason": "Lý do thiếu dữ liệu hoặc ngoài phạm vi"
        }}
    ],
    "checks": {{
        "content_accuracy": true/false,
        "gdpt_2018_compliance": true/false,
        "pedagogical_alignment": true/false,
        "age_appropriate": true/false,
        "no_fabricated_sources": true/false
    }},
    "errors": ["Legacy: chỉ lặp lại problem ngắn gọn nếu có issue"],
    "feedback": "Legacy: gộp suggestion ngắn gọn, cụ thể bằng tiếng Việt"
}}

Quy tắc bắt buộc:
- Không tự động PASS nếu có lỗi Critical hoặc Major.
- Nếu thiếu dữ liệu để kiểm tra căn cứ học liệu, đưa vào skipped_checks thay vì issues.
- Không lặp lại lỗi cấu trúc đã rõ nếu không thêm được insight mới; tập trung vào chất lượng sư phạm, độ chính xác nội dung, và căn cứ học liệu.
"""


MARKDOWN_TO_JSON_PROMPT = """Bạn là công cụ chuyển đổi giáo án từ markdown sang JSON.

Chuyển giáo án markdown sau sang JSON hợp lệ. CHỈ TRẢ VỀ JSON.
Không thêm markdown fence, không thêm chú thích, không dùng dấu ba chấm.

GIÁO ÁN MARKDOWN:
{markdown}

JSON phải có dạng:
{{
  "metadata": {{
    "subject": "string",
    "grade": "string",
    "topic": "string",
    "teaching_model": "{teaching_model}",
    "objectives": ["string"],
    "competencies": ["string"],
    "qualities": ["string"],
    "duration_minutes": 45,
    "materials": ["string"]
  }},
  "sections": {{
    "section_key": {{
      "title": "string",
      "objective": "string",
      "content": "string",
      "product": "string",
      "organization": "string",
      "assessment": "string",
      "duration": 0
    }}
  }},
  "rag_sources": ["raw_path hoặc title của source đã dùng"],
  "rag_source_details": [
    {{
      "id": "S1",
      "title": "tên nguồn",
      "type": "raw_vector_search",
      "raw_path": "đường dẫn nếu có",
      "chapter": "chương nếu có",
      "lesson": "bài nếu có",
      "section": "mục nếu có",
      "score": 0.0
    }}
  ],
  "compliance": {{
    "status": "PENDING",
    "errors": []
  }}
}}
"""
