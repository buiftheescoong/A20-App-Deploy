# Kế hoạch triển khai Backend Foundation (Person B)

Dựa trên tài liệu dự án (`team-tasks.md`, `codebase.md`, `2day-sprint-plan.md`), bạn (Person B) chịu trách nhiệm thiết lập nền tảng Backend, Database (Supabase), cấu trúc Schema và một số API Endpoint cốt lõi. Dưới đây là kế hoạch chi tiết được phân rã theo 2 ngày Sprint.

> [!NOTE]
> Vai trò của bạn là tạo "móng" vững chắc để Person A (AI Pipeline) và Person C (Frontend) có thể tiến hành tích hợp. Đảm bảo đúng API Contract thiết kế từ đầu.

## Proposed Changes

---

### [Phần 1: Khởi động & Database (Sáng Ngày 1)]

Tập trung vào việc chuẩn bị cơ sở dữ liệu và cấu hình helper.

#### [NEW] `scripts/schema.sql` (Thực thi trên Supabase)
- Chạy SQL tạo các bảng: `lesson_plans`, `evaluations`, `clarification_sessions`, `rag_knowledge_base`.
- Kích hoạt extension `pgvector`.
- Cấu hình Row Level Security (RLS) policies.

#### [MODIFY/NEW] `backend/app/database.py`
- Khởi tạo kết nối với Supabase client qua `supabase-py`.
- Viết các hàm helper CRUD: `create_lesson_plan`, `get_lesson_plan`, `update_lesson_plan`, `get_lesson_plans_by_user`, `delete_lesson_plan`.
- Thêm helper cho Clarification flow và lấy public URL của `blank_template.docx` từ storage `templates`.

#### [NEW] Supabase Storage
- Tự tay tạo bucket `templates` (public) trên Supabase Dashboard.
- Upload file `blank_template.docx` (file chuẩn GDPT 2018 nhưng trống nội dung).

---

### [Phần 2: Pydantic Schemas & RAG DB (Sáng Ngày 1)]

Đảm bảo API format chuẩn 100% để Persion A và C có thể code mà không sợ conflict.

#### [MODIFY] `backend/app/schemas/lesson_plan.py`
- Định nghĩa mô hình data: `GenerateRequest`, `StatusResponse`, `LessonPlanJSON` (5E và 3-phase).
- Định nghĩa `ClarificationSession` schema.
- **Lưu ý:** Không tự ý thay đổi schema này sau khi chốt (chậm nhất 09:00). Mọi member sẽ "import" từ đây.

#### [NEW] Ingest Mock RAG Data (`scripts/ingest_mock_rag.py`)
- Chuẩn bị script để nạp 5 document mẫu (Toán 10, Văn 10, Lịch sử 10, Toán 6, Vật lý 11).
- Embed văn bản dùng `text-embedding-3-small` và insert vào bảng `rag_knowledge_base` (Supabase).
- Verify data trên Supabase Dashboard.

---

### [Phần 3: Khởi tạo CRUD Endpoints (Chiều Ngày 1)]

Nhận API list, detail và delete lesson plans.

#### [MODIFY] `backend/app/api/lesson_plans.py`
- `GET /api/lesson-plans`: Trả về danh sách giáo án (hỗ trợ phân trang limit/offset), filter theo `user_id`.
- `GET /api/lesson-plans/{id}`: Xem chi tiết record.
- `DELETE /api/lesson-plans/{id}`: Xóa record. Khớp kiểm tra user ID.
- Inject middleware Auth từ Supabase JWT thông qua Request state (sẽ cần file config CORS + backend middleware `main.py`).

#### [MODIFY] `backend/app/api/edit.py`
- `POST /api/edit`: Endpoint nhận `lesson_plan_id`, `section_id` và `edit_prompt`.
- Gọi LLM (ví dụ GPT-4o) truyền lệnh: "Chỉ sửa block [{section_id}]...".
- Cập nhật lại một phần JSON content trong DB thông qua helper.

---

### [Phần 4: Triển khai Hạ tầng & Hoàn thiện (Chiều Ngày 1 & Sáng Ngày 2)]

Đưa Backend lên môi trường Production.

#### [MODIFY] Môi trường (`.env.example`)
- Đảm bảo đầy đủ list Key mẫu: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (cho fallback), `CORS_ORIGINS`.

#### [NEW] Infrastructure / Railway
- Deploy nhánh FastAPI lên Railway/Render.
- Test endpoint health-check trên public URL.
- Thông báo team cập nhật `NEXT_PUBLIC_API_BASE_URL` trỏ vào Railway.

#### [NEW] Thêm dữ liệu RAG
- Tiếp tục bổ sung mock data cho SGK 3 môn còn lại để team test end-to-end các tình huống "low-confidence" khi hỏi chủ đề hiếm.

## User Review Required

> [!WARNING]
> Mặc dù trong source code hiện tại đã có khung sườn cơ bản cho `database.py` và `lesson_plans.py`, bạn phải trực tiếp verify các config Supabase Dashboard như Row Level Security (RLS) để middleware không chặn CORS hoặc bị lỗi Authentication.

## Open Questions

> [!IMPORTANT]
> 1. Bạn đã có sẵn `blank_template.docx` để trực tiếp upload lên bucket chưa hay cần mình giúp tạo đoạn Script sinh file DOCX đó?
> 2. Theo assignment, Person B làm API `POST /api/edit`. Nhưng trong phần code review, file `backend/app/api/edit.py` đang được assign cho `Person A/B`. Bạn có ưu tiên implement LLM call trong `edit.py` luôn không hay nhường cho Person A?
> 3. Hạ tầng Deployment: Nhóm đã thống nhất dùng **Railway** cho bài lab này chưa để mình có thể build config cụ thể?

## Verification Plan

### Automated Tests
- Test pipeline RAG script: `python -m scripts.ingest_mock_rag`
- Chạy thử backend qua:
  ```bash
  uvicorn app.main:app --reload --port 8000
  ```

### Manual Verification
1. Dùng Postman để GET `/api/lesson-plans` (truyền JWT thật từ Supabase).
2. Login bằng Supabase (giao diện Frontend của Person C) và verify middleware không ném lỗi 401/403.
3. Tracking trên Supabase Dashboard logs xem request POST insert data vào table diễn ra chuẩn chỉ hay không.
