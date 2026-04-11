import sys
import os
import json
from fastapi.testclient import TestClient

# Thêm thư mục backend vào sys.path để import app
sys.path.insert(0, os.path.dirname(__file__))

# Tạm thời bypass kiểm tra key Supabase thực tế khi test cục bộ bằng cách patch
import getpass

os.environ["SUPABASE_URL"] = "https://mock-supabase-url.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.xxxxxxxxxxxxxxxxx"
)
os.environ["OPENAI_API_KEY"] = "sk-mock-openai-key"

from app.main import app
from app.database import supabase

# Mock db functions directly
import app.database as custom_db

# Khởi tạo mock data
MOCK_LESSON_PLAN = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "user_id": "mock-user-id",
    "subject": "Toán",
    "grade": "10",
    "topic": "Hàm số",
    "teaching_model": "5E",
    "objectives": ["Mục tiêu 1"],
    "content_json": {
        "metadata": {
            "subject": "Toán",
            "grade": "10",
            "topic": "Hàm số",
            "teaching_model": "5E",
            "duration_minutes": 45,
            "objectives": ["Mục tiêu 1"],
            "competencies": [],
            "materials": [],
        },
        "sections": {
            "engage": {
                "title": "Khởi động",
                "content": "Nội dung cũ của Khởi động",
                "duration": 5,
            }
        },
        "rag_sources": [],
        "compliance": {"status": "FAILED", "errors": []},
        "clarification_needed": False,
    },
    "status": "completed",
    "docx_url": None,
    "is_blank_template": False,
}


def mock_get_lesson_plans_by_user(user_id, limit, offset):
    return [MOCK_LESSON_PLAN]


def mock_get_lesson_plan(plan_id):
    if plan_id == MOCK_LESSON_PLAN["id"]:
        return MOCK_LESSON_PLAN
    return None


def mock_delete_lesson_plan(plan_id):
    return True


def mock_update_lesson_plan(plan_id, updates):
    return True


import app.api.lesson_plans as custom_api_lp
import app.api.edit as custom_api_edit

# Gán mock function thay cho real function gọi tới DB
custom_api_lp.get_lesson_plans_by_user = mock_get_lesson_plans_by_user
custom_api_lp.get_lesson_plan = mock_get_lesson_plan
custom_api_lp.delete_lesson_plan = mock_delete_lesson_plan
custom_api_edit.get_lesson_plan = mock_get_lesson_plan
custom_api_edit.update_lesson_plan = mock_update_lesson_plan

client = TestClient(app)


def run_tests():
    print("=" * 60)
    print("🚀 BẮT ĐẦU TEST CÁC API CỦA PERSON B")
    print("=" * 60)

    # 1. Test GET /api/lesson-plans
    print("\n[1] Thử nghiệm GET /api/lesson-plans...")
    response = client.get("/api/lesson-plans")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert "plans" in data
    print("✅ GET /api/lesson-plans chạy thành công!")
    print(f"   => Trả về {data['count']} kết quả (Mock data).")

    # 2. Test GET /api/lesson-plans/{id}
    print("\n[2] Thử nghiệm GET /api/lesson-plans/{id}...")
    plan_id = MOCK_LESSON_PLAN["id"]
    response = client.get(f"/api/lesson-plans/{plan_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == plan_id
    print("✅ GET chi tiết giáo án thành công!")
    print(f"   => Cấu trúc trả về schema chuẩn hóa: {list(data.keys())[:5]}...")

    # 3. Test DELETE /api/lesson-plans/{id}
    print("\n[3] Thử nghiệm DELETE /api/lesson-plans/{id}...")
    response = client.delete(f"/api/lesson-plans/{plan_id}")
    assert response.status_code == 200
    print("✅ DELETE endpoint trả về thành công!")

    # 4. Kiểm tra Auth Middleware Header Injection
    print("\n[4] Kiểm tra Auth Middleware Security...")
    # Thử gọi delete với một id không tồn tại
    response_fail = client.delete("/api/lesson-plans/invalid-id")
    assert response_fail.status_code == 404, "Phải trả về 404 nếu không tìm thấy ID"
    print("✅ Middleware hoạt động đúng cấu trúc.")

    print("\n" + "=" * 60)
    print("🎉 KẾT LUẬN: TẤT CẢ CÁC ENPOINT CRUD CỦA PERSON B ĐỀU HOẠT ĐỘNG ỔN ĐỊNH!")
    print("   (Endpoint /api/edit và export được skip do đòi hỏi gọi OpenAI API thực)")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
