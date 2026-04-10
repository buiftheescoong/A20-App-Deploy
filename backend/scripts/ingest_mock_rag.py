"""
Script to ingest mock RAG data into Supabase pgvector.
Person B owns this file.

Run: python -m scripts.ingest_mock_rag
"""

import os
import sys
import asyncio

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from openai import OpenAI
from app.config import settings
from app.database import supabase

client = OpenAI(api_key=settings.OPENAI_API_KEY)


# ─── Mock RAG Data ────────────────────────────────────────────────

MOCK_DOCUMENTS = [
    # Toán 10
    {
        "source": "sgk_toan_10_chuong2_ham_so",
        "subject": "Toán",
        "grade": "10",
        "content": (
            "Hàm số bậc nhất y = ax + b (a ≠ 0). "
            "Hàm số bậc nhất có đồ thị là đường thẳng. "
            "Hệ số a quyết định độ dốc của đường thẳng. "
            "Khi a > 0, hàm số đồng biến trên R. "
            "Khi a < 0, hàm số nghịch biến trên R. "
            "Giao điểm với trục Oy tại điểm (0, b)."
        ),
    },
    {
        "source": "sgk_toan_10_chuong2_phuong_trinh",
        "subject": "Toán",
        "grade": "10",
        "content": (
            "Phương trình bậc nhất một ẩn: ax + b = 0 (a ≠ 0). "
            "Nghiệm: x = -b/a. "
            "Phương trình bậc hai: ax² + bx + c = 0 (a ≠ 0). "
            "Công thức nghiệm: x = (-b ± √Δ) / 2a, với Δ = b² - 4ac."
        ),
    },
    {
        "source": "sgk_toan_10_chuong1_menh_de",
        "subject": "Toán",
        "grade": "10",
        "content": (
            "Mệnh đề là câu khẳng định đúng hoặc sai. "
            "Mệnh đề chứa biến: P(x) — chỉ trở thành mệnh đề khi gán giá trị cụ thể cho x. "
            "Phủ định của mệnh đề P là ¬P (not P). "
            "Mệnh đề kéo theo: P ⇒ Q. Mệnh đề tương đương: P ⇔ Q."
        ),
    },
    # Ngữ Văn 10
    {
        "source": "sgk_van_10_tho",
        "subject": "Ngữ Văn",
        "grade": "10",
        "content": (
            "Thể loại thơ: Thơ lục bát, thơ tự do, thơ bốn chữ, năm chữ. "
            "Đặc điểm: nhịp điệu, vần, hình ảnh thơ. "
            "Phân tích thơ: xác định chủ đề, hình ảnh, biện pháp tu từ, "
            "cảm xúc của tác giả, thông điệp bài thơ."
        ),
    },
    {
        "source": "sgk_van_10_truyen_ngan",
        "subject": "Ngữ Văn",
        "grade": "10",
        "content": (
            "Truyện ngắn: Đặc điểm — dung lượng ngắn, tập trung vào một tình huống, "
            "ít nhân vật. Phân tích: tìm hiểu bối cảnh, nhân vật chính, "
            "diễn biến xung đột, đỉnh điểm, kết thúc, chủ đề tư tưởng."
        ),
    },
    # Lịch sử 10
    {
        "source": "sgk_su_10_chuong1",
        "subject": "Lịch sử",
        "grade": "10",
        "content": (
            "Các nền văn minh cổ đại: Ai Cập, Lưỡng Hà, Ấn Độ, Trung Quốc. "
            "Đặc điểm chung: hình thành dọc theo sông lớn, phát triển nông nghiệp, "
            "xuất hiện chữ viết, tổ chức nhà nước sơ khai."
        ),
    },
    # Toán 6
    {
        "source": "sgk_toan_6_so_tu_nhien",
        "subject": "Toán",
        "grade": "6",
        "content": (
            "Tập hợp số tự nhiên N = {0, 1, 2, 3, ...}. "
            "Phép cộng: a + b, tính chất giao hoán, kết hợp. "
            "Phép nhân: a × b, tính chất giao hoán, kết hợp, phân phối. "
            "Phép chia: a ÷ b (b ≠ 0), chia hết và chia có dư."
        ),
    },
    # Vật lý 11
    {
        "source": "sgk_ly_11_dong_dien",
        "subject": "Vật lý",
        "grade": "11",
        "content": (
            "Dòng điện trong kim loại: hạt tải điện là electron tự do. "
            "Định luật Ohm: I = U/R. Điện trở: R = ρl/S. "
            "Mạch nối tiếp: R = R1 + R2. Mạch song song: 1/R = 1/R1 + 1/R2. "
            "Công suất điện: P = U.I = I²R = U²/R."
        ),
    },
]


def get_embedding(text: str) -> list[float]:
    """Generate embedding using OpenAI API."""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small",
    )
    return response.data[0].embedding


def ingest_documents():
    """Ingest all mock documents into Supabase pgvector."""
    print(f"📚 Ingesting {len(MOCK_DOCUMENTS)} mock documents...")

    for doc in MOCK_DOCUMENTS:
        print(f"  → {doc['source']} ({doc['subject']} {doc['grade']})")

        # Generate embedding
        embedding = get_embedding(doc["content"])

        # Insert into Supabase
        record = {
            "source": doc["source"],
            "subject": doc["subject"],
            "grade": doc["grade"],
            "content": doc["content"],
            "embedding": embedding,
        }

        try:
            supabase.table("rag_knowledge_base").insert(record).execute()
            print(f"    ✅ Inserted successfully")
        except Exception as e:
            print(f"    ❌ Error: {e}")

    print("\n✅ Ingestion complete!")


if __name__ == "__main__":
    ingest_documents()
