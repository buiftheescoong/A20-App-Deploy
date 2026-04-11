"""
Quality Checker Agent — combines Critique + Compliance checking.
Person A owns this file.

Responsibilities:
- STEP 1: Rule-based checks (headings, structure, GDPT 2018 compliance)
- STEP 2: LLM-based content quality check
- Return structured error list with suggestions
"""

import json
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# ─── STEP 1: Rule-based Compliance Checks ──────────────────────────

REQUIRED_5E_SECTIONS = ["engage", "explore", "explain", "elaborate", "evaluate"]
REQUIRED_3PHASE_SECTIONS = ["opening", "knowledge", "practice"]


def check_required_fields(plan: dict) -> list[dict]:
    """Check that all required header fields are present."""
    errors = []
    metadata = plan.get("metadata", {})

    for field in ["subject", "grade", "topic", "duration_minutes"]:
        if not metadata.get(field):
            errors.append(
                {
                    "section": "metadata",
                    "issue": f"Thiếu trường bắt buộc: {field}",
                    "suggestion": f"Thêm trường '{field}' vào metadata",
                }
            )

    return errors


def check_objectives(plan: dict) -> list[dict]:
    """Check objectives: ≥ 2 competencies + ≥ 1 quality."""
    errors = []
    metadata = plan.get("metadata", {})
    objectives = metadata.get("objectives", [])
    competencies = metadata.get("competencies", [])

    if len(objectives) < 2:
        errors.append(
            {
                "section": "objectives",
                "issue": f"Chỉ có {len(objectives)} mục tiêu, cần ít nhất 2 năng lực chuyên môn",
                "suggestion": "Thêm mục tiêu về năng lực chuyên môn cụ thể",
            }
        )

    if len(competencies) < 1:
        errors.append(
            {
                "section": "competencies",
                "issue": "Thiếu phẩm chất/năng lực cốt lõi",
                "suggestion": "Thêm phẩm chất như: Trung thực, Trách nhiệm, hoặc năng lực tư duy",
            }
        )

    return errors


def check_materials(plan: dict) -> list[dict]:
    """Check that materials/equipment field is filled."""
    errors = []
    metadata = plan.get("metadata", {})
    materials = metadata.get("materials", [])

    if not materials:
        errors.append(
            {
                "section": "materials",
                "issue": "Mục Thiết bị và học liệu trống",
                "suggestion": "Liệt kê thiết bị dạy học và học liệu cần dùng",
            }
        )

    return errors


def check_sections(plan: dict) -> list[dict]:
    """Check that all required sections exist based on teaching model."""
    errors = []
    metadata = plan.get("metadata", {})
    sections = plan.get("sections", {})
    teaching_model = metadata.get("teaching_model", "5E")

    required = (
        REQUIRED_5E_SECTIONS if teaching_model == "5E" else REQUIRED_3PHASE_SECTIONS
    )

    for section_key in required:
        if section_key not in sections:
            errors.append(
                {
                    "section": section_key,
                    "issue": f"Thiếu hoạt động '{section_key}' theo mô hình {teaching_model}",
                    "suggestion": f"Thêm section '{section_key}' với đầy đủ nội dung",
                }
            )
        else:
            section = sections[section_key]
            if not section.get("content"):
                errors.append(
                    {
                        "section": section_key,
                        "issue": f"Hoạt động '{section_key}' chưa có nội dung",
                        "suggestion": "Mô tả chi tiết hoạt động bao gồm: Mục tiêu – Nội dung – Sản phẩm – Tổ chức thực hiện",
                    }
                )

    return errors


def run_rule_based_check(plan: dict) -> list[dict]:
    """Run all rule-based compliance checks."""
    errors = []
    errors.extend(check_required_fields(plan))
    errors.extend(check_objectives(plan))
    errors.extend(check_materials(plan))
    errors.extend(check_sections(plan))
    return errors


# ─── STEP 2: LLM-based Quality Check ──────────────────────────────

QUALITY_CHECK_PROMPT = """Bạn là inspector kiểm tra giáo án theo chuẩn GDPT 2018.
Kiểm tra giáo án sau và đánh giá chất lượng nội dung:

1. Nội dung có phù hợp với mục tiêu bài học không?
2. Các hoạt động có logic và liền mạch không?
3. Phân bổ thời gian có hợp lý không?
4. Mỗi hoạt động có đủ 4 cột thông tin: Mục tiêu hoạt động / Nội dung / Sản phẩm / Tổ chức thực hiện không?

Trả về JSON:
{
  "content_issues": [
    {"section": "<tên section>", "issue": "<vấn đề>", "suggestion": "<gợi ý sửa>"}
  ]
}

Nếu không có vấn đề, trả về: {"content_issues": []}
Chỉ trả JSON, không có text thêm.
"""


async def run_llm_quality_check(plan: dict) -> list[dict]:
    """Run LLM-based content quality check."""
    try:
        response = await client.chat.completions.create(
            model=settings.CHEAP_MODEL,
            messages=[
                {"role": "system", "content": QUALITY_CHECK_PROMPT},
                {"role": "user", "content": json.dumps(plan, ensure_ascii=False)},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("content_issues", [])
    except Exception as e:
        logger.error(f"LLM quality check error: {e}")
        return []  # Non-critical — don't block pipeline


# ─── Combined Quality Check ───────────────────────────────────────


async def run_quality_check(plan: dict) -> dict:
    """
    Run the full quality check pipeline:
    1. Rule-based compliance checks (fast, deterministic)
    2. LLM-based content quality check

    Returns:
        QualityResult dict: { status: "PASSED"|"FAILED", errors: [...] }
    """
    # Step 1: Rule-based
    rule_errors = run_rule_based_check(plan)

    # Step 2: LLM-based
    llm_errors = await run_llm_quality_check(plan)

    all_errors = rule_errors + llm_errors

    result = {
        "status": "PASSED" if len(all_errors) == 0 else "FAILED",
        "errors": all_errors,
    }

    logger.info(
        f"Quality check: {result['status']} — "
        f"{len(rule_errors)} rule errors, {len(llm_errors)} content issues"
    )
    return result
