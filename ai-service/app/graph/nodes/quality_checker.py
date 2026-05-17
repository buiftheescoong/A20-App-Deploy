"""
Node 3: Quality Checker.

The checker is intentionally split into:
1. Markdown parsing helpers.
2. Deterministic structural/export-readiness rules.
3. Optional LLM review normalization and merge.

The public pipeline contract remains `PASSED` / `FAILED`, but the result also
contains structured issues, passed checks, and skipped checks so repair prompts
and manual review can be more precise.
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

from app.config import settings
from app.graph.decorators import log_node
from app.graph.nodes.quality_text import (
    bounded_int,
    clean_json,
    has_any,
    normalize_text,
)
from app.prompts.templates import QUALITY_CHECK_PROMPT, get_quality_checklist
from app.services.llm import llm_client

logger = structlog.get_logger()

_SEVERITY_PENALTY = {"Critical": 25, "Major": 10, "Minor": 3}
_SEVERITIES = set(_SEVERITY_PENALTY)

_MODEL_PHASES = {
    "5E": [
        ["khởi động", "gắn kết", "engage"],
        ["khám phá", "explore"],
        ["giải thích", "explain", "hình thành kiến thức"],
        ["mở rộng", "elaborate", "vận dụng"],
        ["đánh giá", "evaluate"],
    ],
    "CV-5512": [
        ["khởi động", "xác định vấn đề"],
        ["hình thành kiến thức"],
        ["luyện tập"],
        ["vận dụng"],
    ],
    "3-phase": [
        ["khởi động", "mở đầu", "xác định vấn đề"],
        ["hình thành kiến thức"],
        ["luyện tập"],
        ["vận dụng"],
    ],
}

_MODEL_PHASE_LABELS = {
    "5E": [
        "Khởi động / Engage",
        "Khám phá / Explore",
        "Giải thích / Explain",
        "Mở rộng / Elaborate",
        "Đánh giá / Evaluate",
    ],
    "CV-5512": [
        "Khởi động / Xác định vấn đề",
        "Hình thành kiến thức mới",
        "Luyện tập",
        "Vận dụng",
    ],
    "3-phase": [
        "Khởi động / Xác định vấn đề",
        "Hình thành kiến thức mới",
        "Luyện tập",
        "Vận dụng",
    ],
}

_ASSESSMENT_TERMS = [
    "phương án đánh giá",
    "hình thức đánh giá",
    "căn cứ đánh giá",
    "rubric",
    "quan sát",
    "nhận xét",
    "phản hồi",
    "tự đánh giá",
    "đánh giá đồng đẳng",
]


def _rule_based_check(
    markdown: str,
    teaching_model: str,
    subject: str = "",
    topic: str = "",
    rag_context: list[dict[str, Any]] | None = None,
) -> dict:
    """Run deterministic structural and export-readiness validation."""
    issues: list[dict[str, str]] = []
    passed_checks: list[str] = []
    skipped_checks: list[dict[str, str]] = []
    checks: dict[str, bool] = {}
    text = markdown or ""
    model = teaching_model if teaching_model in _MODEL_PHASES else "3-phase"
    parsed = _parse_markdown(text)

    if not text.strip():
        _add_issue(issues, "Critical", "Toàn bộ giáo án đang trống.", "Sinh lại nội dung giáo án hoàn chỉnh.")
        return _result_from_issues(checks, issues, passed_checks, skipped_checks, should_run_llm=False)

    _check_cover_info(parsed, issues, passed_checks, checks)
    _check_main_sections(parsed, issues, passed_checks, checks)
    _check_section_content(parsed, issues, passed_checks, checks)
    _check_model_phases(parsed, model, issues, passed_checks, checks)
    _check_activity_requirements(parsed, issues, passed_checks, checks)
    _check_placeholders(text, issues, passed_checks, checks)
    _check_duration(parsed, issues, passed_checks, checks)
    _check_topic(parsed, topic, issues, passed_checks)
    _check_source_grounding(parsed, rag_context or [], issues, passed_checks, skipped_checks, checks)

    critical_or_major = any(issue["severity"] in {"Critical", "Major"} for issue in issues)
    return _result_from_issues(
        checks,
        issues,
        passed_checks,
        skipped_checks,
        should_run_llm=not critical_or_major,
    )


@log_node
async def run(state: dict) -> dict:
    """Quality Checker — deterministic validation plus optional LLM review."""
    plan_id = state["plan_id"]
    markdown = state.get("current_markdown", "")
    teaching_model = state.get("teaching_model", "5E")

    if state.get("stream_queue"):
        await state["stream_queue"].put({
            "event": "progress",
            "data": {"step": "quality_check", "label": "Đang kiểm tra chất lượng..."},
        })

    rule_result = _rule_based_check(
        markdown=markdown,
        teaching_model=teaching_model,
        subject=state.get("subject", ""),
        topic=state.get("topic", ""),
        rag_context=state.get("rag_context", []),
    )
    logger.info(
        "qc.rules",
        plan_id=plan_id,
        passed=rule_result["rule_passed"],
        issues=len(rule_result["issues"]),
        score=rule_result["score"],
    )

    if not rule_result["should_run_llm"]:
        logger.info("qc.result", plan_id=plan_id, status=rule_result["status"], score=rule_result["score"])
        return {**state, "quality_result": _public_result(rule_result)}

    llm_result = await _llm_quality_check(state, markdown, teaching_model)
    merged = _merge_results(rule_result, llm_result)
    logger.info("qc.result", plan_id=plan_id, status=merged["status"], score=merged["score"])
    return {**state, "quality_result": _public_result(merged)}


# ---------------------------------------------------------------------------
# Parsing layer
# ---------------------------------------------------------------------------


def _parse_markdown(markdown: str) -> dict[str, Any]:
    text = markdown or ""
    sections = _parse_main_sections(text)
    process_text = sections.get("IV", {}).get("text", text)
    activities = _parse_activities(process_text)
    return {
        "text": text,
        "norm": _normalize(text),
        "sections": sections,
        "activities": activities,
        "main_activities": [activity for activity in activities if not activity["is_subactivity"]],
    }


def _parse_main_sections(text: str) -> dict[str, dict[str, Any]]:
    matches = list(
        re.finditer(
            r"(?im)^\s*(?:#{1,6}\s*)?(?P<roman>IV|III|II|I)\.\s*(?P<title>.+?)\s*$",
            text,
        )
    )
    sections: dict[str, dict[str, Any]] = {}
    for index, match in enumerate(matches):
        roman = match.group("roman").upper()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections[roman] = {
            "title": match.group("title").strip(),
            "start": match.start(),
            "end": end,
            "text": text[match.start():end],
            "norm_title": _normalize(match.group("title")),
        }
    return sections


def _parse_activities(process_text: str) -> list[dict[str, Any]]:
    matches = list(
        re.finditer(
            r"(?im)^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*hoạt\s*động\s+"
            r"(?P<number>\d+(?:\.\d+)?)\s*[:.\-–]\s*(?P<title>.+?)\s*(?:\*\*)?\s*$",
            process_text,
        )
    )
    activities: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        number = match.group("number")
        end = matches[index + 1].start() if index + 1 < len(matches) else len(process_text)
        body = process_text[match.start():end]
        title = _strip_markdown(match.group("title"))
        duration = _duration_from_text(body)
        activities.append({
            "number": number,
            "title": title,
            "heading": _strip_markdown(match.group(0)),
            "text": body,
            "norm": _normalize(body),
            "norm_title": _normalize(title),
            "duration_minutes": duration,
            "is_subactivity": "." in number,
        })
    return activities


def _strip_markdown(text: str) -> str:
    return re.sub(r"[*_`#]+", "", text or "").strip()


# ---------------------------------------------------------------------------
# Deterministic rule layer
# ---------------------------------------------------------------------------


def _check_cover_info(parsed: dict[str, Any], issues: list[dict[str, str]], passed: list[str], checks: dict[str, bool]) -> None:
    norm = parsed["norm"]
    checks["has_cover_info"] = all(
        _has_any(norm, group)
        for group in (["môn học", "môn:"], ["lớp:", "lớp "], ["bài:", "tên bài", "bài dạy"])
    )
    if checks["has_cover_info"]:
        passed.append("Thông tin mở đầu có môn học, lớp và tên bài.")
        return
    _add_issue(
        issues,
        "Major",
        "Thiếu thông tin mở đầu về môn học, lớp hoặc tên bài.",
        "Bổ sung môn học, lớp, tên bài và thời lượng ở phần đầu giáo án.",
    )


def _check_main_sections(parsed: dict[str, Any], issues: list[dict[str, str]], passed: list[str], checks: dict[str, bool]) -> None:
    sections = parsed["sections"]
    required = ["I", "II", "III", "IV"]
    missing = [roman for roman in required if roman not in sections]
    checks["has_required_sections"] = not missing
    if missing:
        checks["has_required_sections"] = False
        for roman in missing:
            severity = "Critical" if roman in {"I", "IV"} else "Major"
            label = {
                "I": "MỤC TIÊU",
                "II": "PHƯƠNG PHÁP DẠY HỌC VÀ KĨ THUẬT DẠY HỌC",
                "III": "THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU",
                "IV": "TIẾN TRÌNH DẠY HỌC",
            }[roman]
            _add_issue(
                issues,
                severity,
                f"Thiếu mục {roman}. {label}.",
                f"Bổ sung mục {roman}. {label} theo đúng mẫu giáo án.",
            )
    else:
        passed.append("Có đủ bốn mục chính I-IV.")

    ordered = [roman for roman, section in sorted(sections.items(), key=lambda item: item[1]["start"]) if roman in required]
    checks["main_sections_in_order"] = ordered == required
    if checks["main_sections_in_order"]:
        passed.append("Các mục chính I-IV đúng thứ tự.")
    else:
        _add_issue(
            issues,
            "Major",
            "Các mục chính I-IV chưa đúng thứ tự.",
            "Sắp xếp lại theo thứ tự I. Mục tiêu, II. Phương pháp, III. Thiết bị/học liệu, IV. Tiến trình.",
        )


def _check_section_content(parsed: dict[str, Any], issues: list[dict[str, str]], passed: list[str], checks: dict[str, bool]) -> None:
    sections = parsed["sections"]
    objective_text = _normalize(sections.get("I", {}).get("text", ""))
    method_text = _normalize(sections.get("II", {}).get("text", ""))
    material_text = _normalize(sections.get("III", {}).get("text", ""))

    checks["has_objectives"] = (
        _has_any(objective_text, ["mục tiêu"])
        and _has_any(objective_text, ["năng lực"])
        and _has_any(objective_text, ["phẩm chất"])
    )
    if checks["has_objectives"]:
        passed.append("Mục tiêu có năng lực và phẩm chất.")
    else:
        _add_issue(
            issues,
            "Major",
            "Phần mục tiêu chưa đủ năng lực và phẩm chất.",
            "Bổ sung ít nhất 2 biểu hiện năng lực và 1 phẩm chất gắn với bài học.",
            "I. Mục tiêu",
        )

    checks["has_methods"] = _has_any(method_text, ["phương pháp"]) and _has_any(method_text, ["kĩ thuật", "kỹ thuật"])
    if checks["has_methods"]:
        passed.append("Mục phương pháp/kĩ thuật dạy học có nội dung.")
    else:
        _add_issue(
            issues,
            "Major",
            "Thiếu mục phương pháp dạy học và kĩ thuật dạy học.",
            "Thêm mục II về phương pháp/kĩ thuật và dùng lại chúng trong hoạt động.",
            "II. Phương pháp dạy học",
        )

    checks["has_materials"] = _has_any(material_text, ["thiết bị"]) and _has_any(material_text, ["học liệu", "tài liệu"])
    if checks["has_materials"]:
        passed.append("Mục thiết bị và học liệu có nội dung.")
    else:
        _add_issue(
            issues,
            "Major",
            "Thiếu hoặc để trống thiết bị dạy học và học liệu.",
            "Liệt kê thiết bị, học liệu, phiếu học tập hoặc tài liệu tham khảo cụ thể.",
            "III. Thiết bị dạy học và học liệu",
        )


def _check_model_phases(
    parsed: dict[str, Any],
    model: str,
    issues: list[dict[str, str]],
    passed: list[str],
    checks: dict[str, bool],
) -> None:
    activities = parsed["main_activities"]
    phase_groups = _MODEL_PHASES[model]
    phase_labels = _MODEL_PHASE_LABELS[model]
    expected_count = len(phase_groups)

    checks["has_expected_activity_count"] = len(activities) == expected_count
    if checks["has_expected_activity_count"]:
        passed.append(f"Có đúng {expected_count} hoạt động chính theo mô hình {model}.")
    else:
        _add_issue(
            issues,
            "Major",
            f"Số hoạt động chính là {len(activities)}, chưa khớp mô hình {model} cần {expected_count} hoạt động.",
            f"Điều chỉnh để có đúng {expected_count} hoạt động chính: {', '.join(phase_labels)}.",
            "IV. Tiến trình dạy học",
        )

    phase_positions: list[int | None] = []
    for group in phase_groups:
        position = None
        for activity_index, activity in enumerate(activities):
            if _has_any(activity["norm_title"], group):
                position = activity_index
                break
        phase_positions.append(position)

    missing_indices = [index for index, position in enumerate(phase_positions) if position is None]
    checks["has_all_phases"] = not missing_indices
    if missing_indices:
        missing_labels = [phase_labels[index] for index in missing_indices]
        severity = "Critical" if 0 in missing_indices or 1 in missing_indices or len(missing_indices) >= 2 else "Major"
        _add_issue(
            issues,
            severity,
            f"Thiếu hoạt động theo mô hình {model}: {', '.join(missing_labels)}.",
            f"Bổ sung đủ các pha bắt buộc của mô hình {model} theo đúng thứ tự.",
            "IV. Tiến trình dạy học",
        )
    else:
        passed.append(f"Có đủ các pha bắt buộc của mô hình {model}.")

    found_positions = [position for position in phase_positions if position is not None]
    checks["phases_in_order"] = found_positions == sorted(found_positions) and len(found_positions) == len(set(found_positions))
    if checks["phases_in_order"]:
        passed.append(f"Các pha của mô hình {model} đúng thứ tự.")
    else:
        _add_issue(
            issues,
            "Major",
            f"Thứ tự hoạt động chưa khớp mô hình {model}.",
            f"Sắp xếp hoạt động theo thứ tự: {', '.join(phase_labels)}.",
            "IV. Tiến trình dạy học",
        )


def _check_activity_requirements(
    parsed: dict[str, Any],
    issues: list[dict[str, str]],
    passed: list[str],
    checks: dict[str, bool],
) -> None:
    activities = parsed["main_activities"]
    if not activities:
        _add_issue(
            issues,
            "Critical",
            "Mục tiến trình chưa có hoạt động dạy học chính.",
            "Bổ sung các hoạt động chính theo mô hình dạy học đã chọn.",
            "IV. Tiến trình dạy học",
        )
        checks["has_activity_tables"] = False
        checks["has_assessment"] = False
        return

    missing_duration: list[str] = []
    missing_assessment: list[str] = []
    table_results: list[dict[str, bool]] = []

    for activity in activities:
        section = f"Hoạt động {activity['number']}: {activity['title']}"
        norm = activity["norm"]

        if activity["duration_minutes"] is None:
            missing_duration.append(section)

        if _has_any(norm, ["mục tiêu"]):
            passed.append(f"{section}: có mục tiêu hoạt động.")
        else:
            _add_issue(issues, "Major", "Thiếu mục tiêu hoạt động.", "Thêm mục tiêu quan sát được cho hoạt động.", section)

        if _has_any(norm, ["nội dung", "nhiệm vụ"]):
            passed.append(f"{section}: có nội dung/nhiệm vụ.")
        else:
            _add_issue(issues, "Major", "Thiếu nội dung hoặc nhiệm vụ học tập.", "Mô tả nhiệm vụ học tập cụ thể.", section)

        if _has_any(norm, ["sản phẩm"]):
            passed.append(f"{section}: có sản phẩm học tập.")
        else:
            _add_issue(issues, "Major", "Thiếu sản phẩm học tập.", "Nêu sản phẩm quan sát được sau hoạt động.", section)

        if _has_any(norm, ["tổ chức thực hiện"]):
            passed.append(f"{section}: có tổ chức thực hiện.")
        else:
            _add_issue(issues, "Critical", "Thiếu phần tổ chức thực hiện.", "Bổ sung bảng tổ chức thực hiện GV/HS.", section)

        if _has_any(norm, _ASSESSMENT_TERMS):
            passed.append(f"{section}: có phương án đánh giá.")
        else:
            missing_assessment.append(section)

        table_result = _teacher_student_table_result(activity["text"])
        table_results.append(table_result)
        if not table_result["found"]:
            _add_issue(
                issues,
                "Critical",
                "Thiếu bảng tổ chức thực hiện 2 cột cho giáo viên và học sinh.",
                "Thêm bảng GV/HS với 4 hàng: chuyển giao, thực hiện, báo cáo, kết luận.",
                section,
            )
        elif not table_result["exact_columns"]:
            _add_issue(
                issues,
                "Critical",
                "Bảng tổ chức thực hiện không có đúng 2 cột giáo viên/học sinh.",
                "Chỉ dùng 2 cột: Hoạt động của giáo viên và Hoạt động của học sinh.",
                section,
            )
        else:
            passed.append(f"{section}: bảng GV/HS có đúng 2 cột.")

        if table_result["found"] and not table_result["has_required_rows"]:
            _add_issue(
                issues,
                "Major",
                "Bảng GV/HS thiếu một hoặc nhiều bước bắt buộc.",
                "Bổ sung đủ 4 hàng: chuyển giao, thực hiện, báo cáo, kết luận.",
                section,
            )
        elif table_result["found"]:
            passed.append(f"{section}: bảng GV/HS có đủ 4 bước tổ chức.")

        if table_result["found"] and not table_result["no_empty_cells"]:
            _add_issue(
                issues,
                "Major",
                "Bảng GV/HS còn ô trống hoặc placeholder.",
                "Điền nội dung cụ thể cho mọi ô bắt buộc trong bảng.",
                section,
            )

    if missing_duration:
        severity = "Major" if len(missing_duration) == len(activities) else "Minor"
        _add_issue(
            issues,
            severity,
            "Một hoặc nhiều hoạt động chưa nêu thời lượng.",
            "Thêm thời lượng cụ thể cho từng hoạt động.",
            ", ".join(missing_duration[:3]),
        )
    else:
        passed.append("Tất cả hoạt động chính có thời lượng.")

    if missing_assessment:
        severity = "Major" if len(missing_assessment) == len(activities) else "Minor"
        _add_issue(
            issues,
            severity,
            "Một hoặc nhiều hoạt động chưa có phương án đánh giá.",
            "Thêm hình thức, căn cứ và người thực hiện đánh giá cho từng hoạt động.",
            ", ".join(missing_assessment[:3]),
        )
    else:
        passed.append("Tất cả hoạt động chính có phương án đánh giá.")

    checks["has_activity_tables"] = bool(table_results) and all(
        result["found"] and result["exact_columns"] and result["has_required_rows"] and result["no_empty_cells"]
        for result in table_results
    )
    checks["has_assessment"] = not missing_assessment


def _check_placeholders(text: str, issues: list[dict[str, str]], passed: list[str], checks: dict[str, bool]) -> None:
    checks["no_placeholders"] = not _has_placeholder(text)
    if checks["no_placeholders"]:
        passed.append("Không phát hiện placeholder, dấu ba chấm hoặc dòng trống bắt buộc.")
        return
    _add_issue(
        issues,
        "Critical",
        "Giáo án còn placeholder, dấu ba chấm hoặc dòng nội dung trống.",
        "Thay toàn bộ nội dung mẫu bằng nội dung dạy học cụ thể.",
    )


def _check_duration(parsed: dict[str, Any], issues: list[dict[str, str]], passed: list[str], checks: dict[str, bool]) -> None:
    duration_result = _duration_check(parsed["text"], parsed["main_activities"])
    checks["duration_consistent"] = duration_result["ok"]
    if duration_result["ok"]:
        passed.append("Tổng thời lượng hoạt động không vượt thời lượng bài học.")
        return
    _add_issue(issues, duration_result["severity"], duration_result["problem"], duration_result["suggestion"])


def _check_topic(parsed: dict[str, Any], topic: str, issues: list[dict[str, str]], passed: list[str]) -> None:
    if not topic:
        return
    if _has_any(parsed["norm"], [topic]):
        passed.append("Tên bài trong giáo án khớp chủ đề yêu cầu.")
        return
    _add_issue(
        issues,
        "Major",
        "Tên bài trong giáo án chưa khớp chủ đề yêu cầu.",
        f"Điều chỉnh tiêu đề và nội dung về đúng bài '{topic}'.",
    )


def _check_source_grounding(
    parsed: dict[str, Any],
    rag_context: list[dict[str, Any]],
    issues: list[dict[str, str]],
    passed: list[str],
    skipped: list[dict[str, str]],
    checks: dict[str, bool],
) -> None:
    if not rag_context:
        checks["source_grounded"] = False
        skipped.append({
            "check": "Reference material grounding",
            "reason": "Không có rag_context hoặc học liệu tham chiếu để đối chiếu.",
        })
        return

    checks["source_grounded"] = _mentions_known_source(parsed["text"], rag_context)
    if checks["source_grounded"]:
        passed.append("Giáo án có nhắc tới nguồn học liệu đã truy xuất.")
        return

    _add_issue(
        issues,
        "Minor",
        "Chưa nêu rõ nguồn học liệu đã dùng từ RAG hoặc tài liệu tham chiếu.",
        "Ghi tên hoặc đường dẫn nguồn RAG/học liệu đã sử dụng trong mục học liệu.",
        "III. Thiết bị dạy học và học liệu",
    )


# ---------------------------------------------------------------------------
# LLM review and merge layer
# ---------------------------------------------------------------------------


async def _llm_quality_check(state: dict, markdown: str, teaching_model: str) -> dict:
    plan_id = state["plan_id"]
    try:
        qc_prompt = QUALITY_CHECK_PROMPT.format(
            quality_checklist=get_quality_checklist()[:16000],
            subject=state.get("subject", ""),
            grade=state.get("grade", ""),
            topic=state.get("topic", ""),
            teaching_model=teaching_model,
            lesson_markdown=markdown[:10000],
        )
        resp = await llm_client.call(
            prompt=qc_prompt,
            model=settings.CHEAP_MODEL,
            temperature=settings.STRUCTURED_OUTPUT_TEMPERATURE,
            response_format={"type": "json_object"},
        )
        raw = json.loads(_clean_json(resp))
        return _normalize_llm_result(raw)
    except Exception as e:
        logger.warning("qc.llm.error", plan_id=plan_id, error=str(e))
        return _llm_skipped_result(str(e))


def _normalize_llm_result(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return _llm_skipped_result("LLM response was not a JSON object")

    issues = _normalize_issues(raw.get("issues", []))
    raw_errors = raw.get("errors", [])
    errors = raw_errors if isinstance(raw_errors, list) else []
    score = _bounded_int(raw.get("score"), default=_score_from_issues(issues))
    normalized_status = _normalize_status(raw.get("status"))

    if not issues and errors:
        severity = "Major" if normalized_status == "FAILED" or score < 85 else "Minor"
        issues = [
            {
                "severity": severity,
                "section": "Đánh giá LLM",
                "problem": str(error),
                "suggestion": str(raw.get("feedback", "") or "Rà soát và sửa lỗi theo mô tả."),
            }
            for error in errors
        ]
    score = min(score, _score_from_issues(issues))

    checks = raw.get("checks", {})
    checks = {str(key): bool(value) for key, value in checks.items()} if isinstance(checks, dict) else {}

    skipped_checks = _normalize_skipped_checks(raw.get("skipped_checks", []))
    passed_checks = (
        [str(item) for item in raw.get("passed_checks", []) if str(item).strip()]
        if isinstance(raw.get("passed_checks", []), list)
        else []
    )

    status = _status_from_issues(issues, score)
    if normalized_status == "FAILED" and not issues and score >= 85:
        score = min(score, 84)
        status = "FAILED"

    return _result_from_issues(
        checks,
        issues,
        passed_checks,
        skipped_checks,
        should_run_llm=False,
        score_override=score,
        summary=str(raw.get("summary", "") or "").strip(),
    )


def _llm_skipped_result(reason: str) -> dict:
    return _result_from_issues(
        checks={"llm_review_completed": False},
        issues=[],
        passed_checks=[],
        skipped_checks=[{"check": "LLM pedagogical/content review", "reason": reason}],
        should_run_llm=False,
        score_override=100,
        summary="Không chạy được đánh giá LLM; giữ kết quả rule-based.",
    )


def _merge_results(rule_result: dict, llm_result: dict) -> dict:
    issues = [*rule_result.get("issues", []), *llm_result.get("issues", [])]
    checks = {**rule_result.get("checks", {}), **llm_result.get("checks", {})}
    passed = _dedupe_strings([*rule_result.get("passed_checks", []), *llm_result.get("passed_checks", [])])
    skipped = _dedupe_skipped([*rule_result.get("skipped_checks", []), *llm_result.get("skipped_checks", [])])
    score = min(_bounded_int(rule_result.get("score"), 100), _bounded_int(llm_result.get("score"), 100))
    return _result_from_issues(
        checks,
        issues,
        passed,
        skipped,
        should_run_llm=False,
        score_override=score,
    )


def _public_result(result: dict) -> dict:
    """Return stable public fields while hiding internal control flags."""
    return {
        "status": result["status"],
        "score": result["score"],
        "summary": result["summary"],
        "errors": result["errors"],
        "feedback": result["feedback"],
        "checks": result["checks"],
        "issues": result["issues"],
        "passed_checks": result["passed_checks"],
        "skipped_checks": result["skipped_checks"],
    }


# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------


def _result_from_issues(
    checks: dict[str, bool],
    issues: list[dict[str, str]],
    passed_checks: list[str],
    skipped_checks: list[dict[str, str]],
    should_run_llm: bool,
    score_override: int | None = None,
    summary: str = "",
) -> dict:
    normalized_issues = _normalize_issues(issues)
    computed_score = _score_from_issues(normalized_issues)
    score = min(_bounded_int(score_override, default=computed_score), computed_score) if score_override is not None else computed_score
    status = _status_from_issues(normalized_issues, score)
    errors = [f"{issue['section']}: {issue['problem']}" for issue in normalized_issues]
    feedback = "; ".join(_dedupe_strings(issue["suggestion"] for issue in normalized_issues if issue.get("suggestion")))
    return {
        "checks": checks,
        "errors": errors,
        "issues": normalized_issues,
        "feedback": feedback,
        "score": score,
        "status": status,
        "summary": summary or _summary_for(status, score, normalized_issues, skipped_checks),
        "passed_checks": _dedupe_strings(passed_checks),
        "skipped_checks": _dedupe_skipped(skipped_checks),
        "rule_passed": status == "PASSED",
        "should_run_llm": should_run_llm and status == "PASSED" and score >= 85,
    }


def _score_from_issues(issues: list[dict[str, str]]) -> int:
    return max(0, 100 - sum(_SEVERITY_PENALTY.get(issue.get("severity", "Major"), 10) for issue in issues))


def _status_from_issues(issues: list[dict[str, str]], score: int) -> str:
    has_blocking_issue = any(issue["severity"] in {"Critical", "Major"} for issue in issues)
    return "PASSED" if not has_blocking_issue and score >= 85 else "FAILED"


def _summary_for(status: str, score: int, issues: list[dict[str, str]], skipped: list[dict[str, str]]) -> str:
    if not issues:
        suffix = " Một số kiểm tra phụ đã được bỏ qua." if skipped else ""
        return f"Giáo án đạt các kiểm tra chất lượng chính với điểm {score}/100.{suffix}"
    counts = {severity: sum(1 for issue in issues if issue["severity"] == severity) for severity in _SEVERITIES}
    return (
        f"Giáo án {status} với điểm {score}/100: "
        f"{counts['Critical']} lỗi Critical, {counts['Major']} lỗi Major, {counts['Minor']} lỗi Minor."
    )


def _add_issue(
    issues: list[dict[str, str]],
    severity: str,
    problem: str,
    suggestion: str,
    section: str = "Toàn bộ giáo án",
) -> None:
    issues.append({
        "severity": severity if severity in _SEVERITIES else "Major",
        "section": section,
        "problem": problem,
        "suggestion": suggestion,
    })


def _normalize_issues(items: Any) -> list[dict[str, str]]:
    if not isinstance(items, list):
        return []
    issues: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity", "Major")).strip()
        if severity not in _SEVERITIES:
            severity = "Major"
        problem = str(item.get("problem") or item.get("issue") or "").strip()
        if not problem:
            continue
        issues.append({
            "severity": severity,
            "section": str(item.get("section") or "Toàn bộ giáo án").strip(),
            "problem": problem,
            "suggestion": str(item.get("suggestion") or "Rà soát và sửa lỗi theo mô tả.").strip(),
        })
    return issues


def _normalize_skipped_checks(items: Any) -> list[dict[str, str]]:
    if not isinstance(items, list):
        return []
    skipped: list[dict[str, str]] = []
    for item in items:
        if isinstance(item, dict):
            check = str(item.get("check") or "").strip()
            reason = str(item.get("reason") or "").strip()
        else:
            check = str(item).strip()
            reason = ""
        if check:
            skipped.append({"check": check, "reason": reason or "Không đủ dữ liệu để đánh giá."})
    return skipped


def _normalize_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"passed", "pass", "đạt", "dat"}:
        return "PASSED"
    return "FAILED" if raw else "PASSED"


def _dedupe_strings(items: Any) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        value = str(item).strip()
        key = _normalize(value)
        if value and key not in seen:
            seen.add(key)
            deduped.append(value)
    return deduped


def _dedupe_skipped(items: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in items:
        check = str(item.get("check", "")).strip()
        reason = str(item.get("reason", "")).strip()
        key = _normalize(f"{check}:{reason}")
        if check and key not in seen:
            seen.add(key)
            deduped.append({"check": check, "reason": reason or "Không đủ dữ liệu để đánh giá."})
    return deduped


# ---------------------------------------------------------------------------
# Low-level table/duration helpers
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    return normalize_text(text)


def _has_any(normalized_text: str, phrases: list[str]) -> bool:
    return has_any(normalized_text, phrases)


def _has_placeholder(text: str) -> bool:
    if re.search(r"\{\{[^}]+\}\}", text):
        return True
    if re.search(r"(?m)^\s*(?:[-*]\s*)?(?:\.{3}|…)\s*$", text):
        return True
    if re.search(r"(?m)^\s*[-*]\s*$", text):
        return True
    return False


def _duration_check(text: str, activities: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    declared = _declared_duration(text)
    if activities is None:
        activity_total = _activity_duration_sum(text)
    else:
        durations = [activity.get("duration_minutes") for activity in activities if activity.get("duration_minutes") is not None]
        activity_total = sum(int(duration) for duration in durations)
    if activity_total == 0:
        return {
            "ok": False,
            "severity": "Major",
            "problem": "Chưa nêu thời lượng cụ thể cho các hoạt động.",
            "suggestion": "Thêm thời lượng cho từng hoạt động và bảo đảm tổng không vượt quá thời lượng bài học.",
        }
    if activity_total > declared + 2:
        return {
            "ok": False,
            "severity": "Major",
            "problem": f"Tổng thời lượng hoạt động khoảng {activity_total} phút, vượt thời lượng bài học {declared} phút.",
            "suggestion": "Điều chỉnh thời lượng các hoạt động để tổng không vượt thời lượng bài học.",
        }
    return {"ok": True}


def _declared_duration(text: str) -> int:
    match = re.search(r"(?i)(?:thời gian|thời lượng).*?(\d{1,3})\s*phút", text)
    if match:
        return int(match.group(1))
    return 45


def _duration_from_text(text: str) -> int | None:
    match = re.search(r"(?i)(?:thời gian|thời lượng)?\s*:?\s*(\d{1,3})(?:\s*(?:-|–|đến)\s*(\d{1,3}))?\s*phút", text)
    if match:
        return int(match.group(2) or match.group(1))
    return None


def _activity_duration_sum(text: str) -> int:
    process_match = re.search(r"(?i)(?:iv\.|tiến trình dạy học)", text)
    process_text = text[process_match.start():] if process_match else text
    total = 0
    for line in process_text.splitlines():
        norm_line = _normalize(line)
        if "phut" not in norm_line:
            continue
        if not _has_any(norm_line, ["hoạt động", "thời lượng", "phút"]):
            continue
        match = re.search(r"(\d{1,3})(?:\s*(?:-|–|đến)\s*(\d{1,3}))?\s*phút", line, flags=re.I)
        if match:
            total += int(match.group(2) or match.group(1))
    return total


def _teacher_student_table_result(text: str) -> dict[str, bool]:
    empty_result = {"found": False, "exact_columns": False, "has_required_rows": False, "no_empty_cells": False}
    for table in _markdown_tables(text):
        header = table[0] if table else []
        header_norm = [_normalize(cell) for cell in header]
        has_teacher = len(header_norm) >= 1 and _has_any(header_norm[0], ["hoạt động của giáo viên", "giáo viên"])
        has_student = len(header_norm) >= 2 and _has_any(header_norm[1], ["hoạt động của học sinh", "học sinh"])
        exact_columns = len(header) == 2 and has_teacher and has_student
        if not (has_teacher and has_student):
            continue

        data_rows = [row for row in table[1:] if not _is_separator_row(row)]
        joined_rows = [_normalize(" ".join(row)) for row in data_rows]
        has_required_rows = all(
            any(_has_any(row_text, [phrase]) for row_text in joined_rows)
            for phrase in ["chuyển giao", "thực hiện nhiệm vụ", "báo cáo", "kết luận"]
        )
        no_empty_cells = all(
            len(row) == len(header) and all(cell.strip() and not _has_placeholder(cell) for cell in row)
            for row in data_rows
        )
        return {
            "found": True,
            "exact_columns": exact_columns,
            "has_required_rows": has_required_rows,
            "no_empty_cells": no_empty_cells,
        }
    return empty_result


def _markdown_tables(text: str) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    current: list[list[str]] = []
    for line in text.splitlines():
        cells = _split_table_row(line)
        if cells:
            current.append(cells)
            continue
        if current:
            tables.append(current)
            current = []
    if current:
        tables.append(current)
    return [table for table in tables if len(table) >= 2]


def _split_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|") or "|" not in stripped[1:]:
        return []
    return [cell.strip() for cell in stripped.strip("|").split("|")]


def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells)


def _mentions_known_source(text: str, rag_context: list[dict[str, Any]]) -> bool:
    norm_text = _normalize(text)
    for chunk in rag_context:
        metadata = chunk.get("metadata") or {}
        candidates = [
            metadata.get("source_alias"),
            chunk.get("source_alias"),
            metadata.get("raw_path"),
            metadata.get("source_title"),
            metadata.get("lesson"),
            metadata.get("chapter"),
            chunk.get("source"),
        ]
        if any(candidate and _normalize(str(candidate)) in norm_text for candidate in candidates):
            return True
    return False


def _clean_json(response: str) -> str:
    return clean_json(response)


def _bounded_int(value: Any, default: int) -> int:
    return bounded_int(value, default)
