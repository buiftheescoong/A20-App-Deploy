# TÀI LIỆU CHI TIẾT HỆ THỐNG BACKEND — A20-App-003

Tài liệu này mô tả chi tiết toàn bộ kiến trúc, thành phần và quy trình vận hành của Hệ thống Backend "Soạn Giáo Án Thông Minh".

## 1. Tổng quan Kiến Trúc (Architecture Overview)

Backend được phát triển bằng **Python 3.11+**, sử dụng framework **FastAPI**. Nhiệm vụ chính là tiếp nhận request từ Web Frontend (Next.js), xử lý logic AI Multi-Agent thông qua **LangGraph** (sử dụng GPT-4o / Gemini), và lưu trữ dữ liệu tại **Supabase** (PostgreSQL + pgvector).

```text
Frontend (Next.js) ──(REST API)──> FastAPI (Backend)
                                       │
      ┌────────────────────────────────┼────────────────────────────────┐
      ▼                                ▼                                ▼
[ AI Pipeline ]                  [ Supabase DB ]                  [ Utils ]
- RAG (text-embedding)           - lesson_plans                   - DOCX Formatter
- Generator Agent (LLM)          - evaluations                    - Health Checks
- Rule-based Quality Checker     - clarification_sessions         - Middleware (Auth)
- Retry & Fallback (Gemini)      - rag_knowledge_base
```

---

## 2. Cấu Trúc Thư Mục (Directory Structure)

```text
backend/
├── app/
│   ├── main.py                 # Core Entry Point. Configures CORS, Auth Middleware, and Routers.
│   ├── config.py               # Load Environment variables (Supabase keys, OpenAI, Gemini).
│   ├── database.py             # Client Supabase and DB CRUD helpers.
│   ├── api/                    # Route Handlers
│   │   ├── check.py            # Quality Check Standalone endpoint
│   │   ├── clarification.py    # endpoints cho luồng hỏi đáp RAG mập mờ
│   │   ├── edit.py             # LLM chỉnh sửa cụ thể 1 block section
│   │   ├── generate.py         # Trigger AI Pipeline
│   │   └── lesson_plans.py     # CRUD API cho bài giảng (Get list, Get detail, Delete, Export)
│   ├── agents/                 # Logic Core của Multi-Agent AI (LangGraph)
│   │   ├── pipeline.py         # State machine orchestration 
│   │   ├── intake.py           # Scope guard (kiểm tra input có đúng là bài học không)
│   │   ├── rag.py              # Xử lý Vector DB retrieval từ pgvector
│   │   ├── clarification.py    # Lưu state chờ người dùng
│   │   ├── generator.py        # LLM Gọi Prompt tạo JSON bài giảng
│   │   ├── quality_checker.py  # Rule-based validation đối chiếu GDPT 2018
│   │   ├── retry_fallback.py   # Chain backoff & xử lý LLM lỗi với mô hình fallback
│   │   └── formatter.py        # Export JSON thành DOCX
│   └── schemas/                # Data types API Contract giữa Frontend và Backend
│       └── lesson_plan.py      # Pydantic models (LessonPlanJSON, QualityResult,...)
├── scripts/
│   ├── schema.sql              # Supabase Database Schema, Indexes, RLS
│   ├── ingest_mock_rag.py      # Nạp data mẫu vào vector DB 
│   └── create_blank_template.py# Auto-generate blank_template.docx
├── test_person_b.py            # Local tests dành cho thao tác DB CRUD
└── requirements.txt            # Thư viện core (FastAPI, supabase, langchain, openai)
```

---

## 3. Hệ thống CSDL (Database Schema - Supabase)

Hệ thống sử dụng **Supabase (PostgreSQL)** kèm Extension `pgvector` phục vụ tính năng RAG.

**Các bảng chính:**
1. **`lesson_plans`**: Chứa thông tin bài giảng, cấu trúc JSON (đã qua format), ID task của LangGraph, lịch sử tạo và trạng thái compliance.
2. **`evaluations`**: Lưu trữ lịch sử Quality Check thông qua quy tắc GDPT 2018.
3. **`clarification_sessions`**: Ghi nhận những câu hỏi Backend chưa chắc chắn, cần Giáo viên trợ giúp (ví dụ topic quá khó).
4. **`rag_knowledge_base`**: Chứa hàng ngàn/triệu document text đã được *embedding* sang không gian vector (1536 chiều) phục vụ Semantic Search.
5. **Storage bucket `templates`**: Nơi lưu trữ file DOCX dự phòng trong trường hợp Fail / Trống.

---

## 4. API Endpoints

### 4.1. Core APIs (Quản lý User & Bài học) - *Person B*
- **`GET /api/lesson-plans`**: Lấy danh sách lesson plans phân trang (limit, offset) theo user hiện hành.
- **`GET /api/lesson-plans/{id}`**: Trích xuất chi tiết JSON của 1 giáo án cụ thể.
- **`DELETE /api/lesson-plans/{id}`**: Xóa giáo án.
- **`POST /api/export/{id}`**: Xuất JSON bài học ra dạng MS Word DOCX, update vào Supabase Storage.
- **`POST /api/edit`**: Gửi 1 prompt LLM để chỉnh sửa *duy nhất 1 block Section* của bài học.

### 4.2. Agent APIs (Quá trình Gen giáo án) - *Person A*
- **`POST /api/generate`**: Trigger quy trình Graph Pipeline ban đầu. Trả về `task_id`.
- **`GET /api/status/{task_id}`**: Polling endpoint cho Frontend (chạy mỗi 3s) lấy trạng thái graph pipeline (Pending, generating, completed, v.v.).
- **`GET /api/clarification/{task_id}`**: Kéo câu hỏi nếu pipeline bị pause vì thiếu ngữ cảnh.
- **`POST /api/clarification/{task_id}`**: Giáo viên submit câu trả lời, resume pipeline.
- **`POST /api/check`**: Request đánh giá chất lượng (Rule-based checklist).

---

## 5. Trái tim của Hệ Thống: AI Agent Pipeline Flow

Luồng làm việc (Workflow) khi người dùng ấn **"Tạo bộ giáo án"** bị chi phối bởi LangGraph theo 5 nodes sau:

1. **Intake Agent**: Kiểm duyệt prompt của người dùng. Nếu nội dung thuộc dạng hỏi thời tiết, chat phiếm -> Reject ngay lập tức để tiết kiệm token.
2. **RAG Agent**: 
   - Lấy Topic text dùng OpenAI Embedding model (`text-embedding-3-small`) để vector hóa.
   - Truy vấn `match_knowledge` trên pgvector.
   - Nếu `confidence_score` > 0.6 -> Truyền Context đi tiếp.
   - Nếu < 0.6 -> Kích hoạt **Clarification Node** -> Hệ thống đứng hình (Pause Pipeline) -> Thông báo về Frontend đòi GV nạp thông tin thêm.
3. **Generator Agent**: LLM chính (`GPT-4o`) nhận context từ RAG, Output Schema Constraint nghiêm ngặt (theo sườn 5E hoặc 3-Phase).
4. **Quality Checker**: Đối chiếu chuỗi array JSON xem có thiếu Heading Thiết bị, Mục tiêu, Trình tự không?
5. **Retry / Fallback**: 
   - Nếu LLM format sai, retry. 
   - Nếu đứt mạng, fallback sang model **Gemini 1.5 Pro**, rồi đến **GPT-4o-mini**. 
   - Nếu Failed hoàn toàn: Kích hoạt `is_blank_template=True` điền DOCX trắng cho Giáo viên chữa cháy.

---

## 6. Hướng Dẫn Cài Đặt (Development Environment)

**Yêu cầu hệ thống:** Python 3.11+, Git.

**Bước 1: Clone và Cài đặt Environment**
```bash
cd backend
python -m venv venv
# Đối với Windows:
.\venv\Scripts\activate
# Đối với Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

**Bước 2: Cài đặt Biến môi trường**
Sao chép `.env.example` thành `.env` và nhập toàn bộ thông tin API.
```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
PRIMARY_MODEL=gpt-4o
```

**Bước 3: Nạp dữ liệu Vector RAG & Chạy Server**
```bash
# Thiết lập Data ban đầu cho Supabase
python -m scripts.ingest_mock_rag

# Bật Server FastAPI
uvicorn app.main:app --reload --port 8000
```
*(Server chạy tại: http://localhost:8000/docs với giao diện test Swagger UI)*
