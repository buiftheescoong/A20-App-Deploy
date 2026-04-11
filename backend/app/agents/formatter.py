"""
Formatter Agent — exports lesson plan to DOCX.
Person A owns this file.

Responsibilities:
- Convert lesson plan JSON to DOCX using python-docx
- Handle blank template export for failure path
- Upload DOCX to Supabase Storage
"""

import io
import os
import uuid
import logging
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from app.config import settings
from app.database import supabase

logger = logging.getLogger(__name__)


def create_lesson_plan_docx(plan: dict) -> io.BytesIO:
    """
    Convert a lesson plan JSON to a DOCX document.

    Args:
        plan: Lesson plan JSON dict

    Returns:
        BytesIO buffer containing the DOCX file
    """
    doc = Document()

    metadata = plan.get("metadata", {})

    # ─── Title / Header ───────────────────────────────────────────
    title = doc.add_heading("KẾ HOẠCH BÀI DẠY", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Cover info
    doc.add_paragraph(f"Tên bài dạy: {metadata.get('topic', '')}")
    doc.add_paragraph(f"Môn học: {metadata.get('subject', '')}")
    doc.add_paragraph(f"Lớp: {metadata.get('grade', '')}")
    doc.add_paragraph(
        f"Thời gian thực hiện: {metadata.get('duration_minutes', 45)} phút"
    )
    doc.add_paragraph(f"Mô hình dạy học: {metadata.get('teaching_model', '5E')}")

    # ─── Mục tiêu ─────────────────────────────────────────────────
    doc.add_heading("I. MỤC TIÊU", level=1)
    doc.add_heading("1. Năng lực", level=2)
    objectives = metadata.get("objectives", [])
    for obj in objectives:
        doc.add_paragraph(f"• {obj}", style="List Bullet")

    doc.add_heading("2. Phẩm chất", level=2)
    competencies = metadata.get("competencies", [])
    for comp in competencies:
        doc.add_paragraph(f"• {comp}", style="List Bullet")

    # ─── Thiết bị và học liệu ─────────────────────────────────────
    doc.add_heading("II. THIẾT BỊ VÀ HỌC LIỆU", level=1)
    materials = metadata.get("materials", [])
    for mat in materials:
        doc.add_paragraph(f"• {mat}", style="List Bullet")

    # ─── Tiến trình dạy học ────────────────────────────────────────
    doc.add_heading("III. TIẾN TRÌNH DẠY HỌC", level=1)

    sections = plan.get("sections", {})
    teaching_model = metadata.get("teaching_model", "5E")

    if teaching_model == "5E":
        section_order = [
            ("engage", "Hoạt động 1: KHỞI ĐỘNG (Engage)"),
            ("explore", "Hoạt động 2: KHÁM PHÁ (Explore)"),
            ("explain", "Hoạt động 3: GIẢI THÍCH (Explain)"),
            ("elaborate", "Hoạt động 4: VẬN DỤNG (Elaborate)"),
            ("evaluate", "Hoạt động 5: ĐÁNH GIÁ (Evaluate)"),
        ]
    else:
        section_order = [
            ("opening", "Hoạt động 1: MỞ ĐẦU"),
            ("knowledge", "Hoạt động 2: HÌNH THÀNH KIẾN THỨC"),
            ("practice", "Hoạt động 3: LUYỆN TẬP"),
        ]

    for key, heading in section_order:
        section = sections.get(key, {})
        duration = section.get("duration", "")
        doc.add_heading(f"{heading} ({duration} phút)", level=2)

        content = section.get("content", "")
        if content:
            # Split content into sub-parts if formatted
            doc.add_paragraph(content)

    # Save to buffer
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer


def create_blank_template_docx() -> io.BytesIO:
    """
    Create a blank DOCX template with GDPT 2018 headings but empty content.
    Used for the Failure Path.
    """
    doc = Document()

    title = doc.add_heading("KẾ HOẠCH BÀI DẠY", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph("Tên bài dạy: _______________")
    doc.add_paragraph("Môn học: _______________")
    doc.add_paragraph("Lớp: _______________")
    doc.add_paragraph("Thời gian thực hiện: ___ phút")

    doc.add_heading("I. MỤC TIÊU", level=1)
    doc.add_heading("1. Năng lực", level=2)
    doc.add_paragraph("• ")
    doc.add_heading("2. Phẩm chất", level=2)
    doc.add_paragraph("• ")

    doc.add_heading("II. THIẾT BỊ VÀ HỌC LIỆU", level=1)
    doc.add_paragraph("• ")

    doc.add_heading("III. TIẾN TRÌNH DẠY HỌC", level=1)
    for act_name in [
        "Hoạt động 1: KHỞI ĐỘNG",
        "Hoạt động 2: KHÁM PHÁ",
        "Hoạt động 3: GIẢI THÍCH",
        "Hoạt động 4: VẬN DỤNG",
        "Hoạt động 5: ĐÁNH GIÁ",
    ]:
        doc.add_heading(act_name, level=2)
        doc.add_paragraph("a) Mục tiêu: ")
        doc.add_paragraph("b) Nội dung: ")
        doc.add_paragraph("c) Sản phẩm: ")
        doc.add_paragraph("d) Tổ chức thực hiện: ")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer


async def upload_docx_to_storage(buffer: io.BytesIO, filename: str) -> str:
    """Upload a DOCX buffer to Supabase Storage and return the public URL."""
    try:
        file_bytes = buffer.read()
        path = f"lesson_plans/{filename}"

        supabase.storage.from_("documents").upload(
            path,
            file_bytes,
            file_options={
                "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            },
        )

        url = supabase.storage.from_("documents").get_public_url(path)
        return url
    except Exception as e:
        logger.error(f"Failed to upload DOCX: {e}")
        return ""


async def run_formatter(plan: dict, is_blank_template: bool = False) -> dict:
    """
    Format and export the lesson plan to DOCX.

    Args:
        plan: Lesson plan JSON dict (ignored if is_blank_template=True)
        is_blank_template: Whether to export blank template

    Returns:
        dict with docx_url and is_blank_template
    """
    filename = f"{uuid.uuid4().hex}.docx"

    if is_blank_template:
        buffer = create_blank_template_docx()
    else:
        buffer = create_lesson_plan_docx(plan)

    docx_url = await upload_docx_to_storage(buffer, filename)

    return {
        "docx_url": docx_url,
        "is_blank_template": is_blank_template,
    }
