# CODEBASE — Soạn Giáo Án Thông Minh

> **Ngày tạo**: 2026-04-11 | **Tech Stack**: FastAPI + Next.js 14 + Supabase + LangGraph + GPT-4o

---

## 1. Tổng quan kiến trúc

```
┌──────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                         │
│  Landing → Login → Dashboard → Generate → Progress → Check      │
│  TailwindCSS • Supabase Auth • Polling (3s)                     │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTP REST
┌─────────────────────────▼────────────────────────────────────────┐
│                   BACKEND (FastAPI)                               │
│  Auth Middleware → API Routers → Background Tasks                │
└──────────┬──────────────────────────────────┬────────────────────┘
           │                                   │
┌──────────▼──────────────┐      ┌─────────────▼───────────────────┐
│   AI AGENT PIPELINE     │      │   SUPABASE                       │
│                         │      │   PostgreSQL + pgvector           │
│   Intake (scope guard)  │      │   Auth (JWT + RLS)               │
│   ↓                     │      │   Storage (DOCX files)           │
│   RAG (vector search)   │◄────►│                                  │
│   ↓                     │      └──────────────────────────────────┘
│   [Clarification?]      │
│   ↓                     │
│   Generator (LLM)       │
│   ↓                     │
│   Quality Checker       │
│   ↓                     │
│   [Retry/Fallback?]     │
│   ↓                     │
│   Formatter (DOCX)      │
└─────────────────────────┘
```

---

## 2. Cấu trúc thư mục

```
A20-App-003/
│
├── backend/                          ← Python FastAPI backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   ← FastAPI entry point, CORS, auth middleware, router registration
│   │   ├── config.py                 ← Settings class, load từ .env (Supabase, OpenAI, Gemini, pipeline params)
│   │   ├── database.py              ← Supabase client + helper functions (CRUD lesson_plans, evaluations, clarification)
│   │   │
│   │   ├── api/                      ← API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── generate.py           ← POST /api/generate + GET /api/status/{task_id}
│   │   │   ├── clarification.py      ← GET + POST /api/clarification/{task_id}
│   │   │   ├── check.py              ← POST /api/check
│   │   │   ├── edit.py               ← POST /api/edit
│   │   │   └── lesson_plans.py       ← GET/DELETE /api/lesson-plans + POST /api/export/{id}
│   │   │
│   │   ├── agents/                   ← AI agent modules (pipeline core)
│   │   │   ├── __init__.py
│   │   │   ├── pipeline.py           ← Main orchestrator — state machine, task_store, run_pipeline()
│   │   │   ├── intake.py             ← Parse input + scope guard (reject non-lesson-plan requests)
│   │   │   ├── rag.py                ← Vector search pgvector + confidence scoring + clarification trigger
│   │   │   ├── clarification.py      ← Pause/resume pipeline khi low confidence
│   │   │   ├── generator.py          ← LLM lesson plan generation (5E & 3-phase prompts)
│   │   │   ├── quality_checker.py    ← Rule-based GDPT 2018 check + LLM content quality check
│   │   │   ├── retry_fallback.py     ← Retry with backoff + model fallback chain (GPT-4o → Gemini → GPT-4o-mini)
│   │   │   └── formatter.py          ← JSON → DOCX (python-docx) + blank template generation
│   │   │
│   │   └── schemas/                  ← Shared Pydantic types (API contract — KHÔNG thay đổi tự ý)
│   │       ├── __init__.py
│   │       └── lesson_plan.py        ← SectionContent, LessonPlanJSON, GenerateRequest, StatusResponse, etc.
│   │
│   ├── scripts/
│   │   ├── schema.sql                ← Full Supabase SQL: tables + pgvector + RPC + RLS policies
│   │   └── ingest_mock_rag.py        ← Script embed + insert 8 mock documents (5 môn) vào pgvector
│   │
│   ├── requirements.txt              ← Python dependencies
│   └── .env.example                  ← Backend env template
│
├── frontend/                         ← Next.js 14 (App Router) frontend
│   ├── app/
│   │   ├── layout.tsx                ← Root layout, metadata SEO, font Inter
│   │   ├── globals.css               ← Design system: glass, gradients, btn-primary, input-field, stepper, badge
│   │   ├── page.tsx                  ← Landing page (hero + stats + features + CTA)
│   │   ├── login/
│   │   │   └── page.tsx              ← Login / Signup (toggle) với Supabase Auth
│   │   ├── dashboard/
│   │   │   └── page.tsx              ← Lesson plan list (cards) + empty state + nav
│   │   ├── generate/
│   │   │   ├── page.tsx              ← Generate form (subject, grade, topic, objectives, teaching model)
│   │   │   └── [task_id]/
│   │   │       ├── page.tsx          ← Progress tracker + polling + result preview
│   │   │       └── clarify/
│   │   │           └── page.tsx      ← Clarification Q&A page (low-confidence path)
│   │   └── check/
│   │       └── page.tsx              ← Standalone quality checker (input plan ID → xem kết quả)
│   │
│   ├── components/
│   │   ├── GenerateForm.tsx          ← Reusable form: subject/grade selects, topic input, teaching model radio
│   │   ├── ProgressTracker.tsx       ← 5-step stepper: Phân tích → Tra cứu → Soạn thảo → Kiểm tra → Hoàn thành
│   │   ├── ClarificationDialog.tsx   ← Q&A form component (questions + textarea answers)
│   │   ├── LessonPlanPreview.tsx     ← Full lesson plan renderer (header + objectives + materials + sections)
│   │   ├── ComplianceReport.tsx      ← Pass/fail checklist + detailed error list
│   │   ├── BlankTemplateAlert.tsx    ← Failure path alert (download template + retry button)
│   │   └── ExportButton.tsx          ← DOCX download button
│   │
│   ├── lib/
│   │   ├── api.ts                    ← API client: generateLessonPlan, getStatus, getClarificationQuestions, etc.
│   │   ├── supabase.ts               ← Supabase browser client (auth only)
│   │   └── types.ts                  ← TypeScript interfaces: StatusResponse, LessonPlanJSON, etc.
│   │
│   ├── package.json                  ← Dependencies: next, react, @supabase/supabase-js, tailwindcss
│   ├── tsconfig.json
│   ├── tailwind.config.js            ← Custom colors (primary, accent), animations (fade-in, slide-up)
│   ├── postcss.config.js
│   └── .env.example                  ← Frontend env template
│
├── .env.example                      ← Root combined env template (BE + FE)
├── .gitignore
├── spec.md                           ← Product specification
├── plan.md                           ← Technical plan
├── 2day-sprint-plan.md               ← Sprint plan + API contract + DB schema
├── team-tasks.md                     ← Task assignments per person per time slot
└── codebase.md                       ← File này
```

---

## 3. API Endpoints

| Method | Endpoint | Mô tả | Owner |
|--------|----------|--------|-------|
| `GET` | `/health` | Health check | — |
| `POST` | `/api/generate` | Bắt đầu tạo giáo án → trả `task_id` | Person A |
| `GET` | `/api/status/{task_id}` | Poll trạng thái pipeline (FE gọi mỗi 3s) | Person A |
| `GET` | `/api/clarification/{task_id}` | Lấy câu hỏi clarification | Person A |
| `POST` | `/api/clarification/{task_id}` | GV gửi trả lời → resume pipeline | Person A |
| `POST` | `/api/check` | Quality check standalone | Person A |
| `POST` | `/api/edit` | Sửa 1 section cụ thể bằng LLM | Person A/B |
| `GET` | `/api/lesson-plans` | Danh sách giáo án (phân trang) | Person B |
| `GET` | `/api/lesson-plans/{id}` | Chi tiết 1 giáo án | Person B |
| `DELETE` | `/api/lesson-plans/{id}` | Xóa giáo án | Person B |
| `POST` | `/api/export/{id}` | Export DOCX → trả download URL | Person B |

---

## 4. Database Schema (Supabase PostgreSQL)

### `lesson_plans`
| Column | Type | Mô tả |
|--------|------|--------|
| `id` | UUID PK | Auto-generated |
| `user_id` | UUID FK → auth.users | Người tạo |
| `subject` | TEXT | Môn học |
| `grade` | TEXT | Lớp |
| `topic` | TEXT | Tên bài |
| `teaching_model` | TEXT | "5E" hoặc "3-phase" |
| `objectives` | TEXT[] | Danh sách mục tiêu |
| `content_json` | JSONB | Nội dung giáo án (LessonPlanJSON) |
| `status` | TEXT | pending / clarifying / generating / completed / failed |
| `task_id` | TEXT | ID để poll trạng thái |
| `retry_count` | INT | Số lần retry |
| `fallback_model` | TEXT | Model fallback nếu dùng |
| `compliance_status` | TEXT | PASSED / FAILED / PENDING |
| `docx_url` | TEXT | URL file DOCX trong Supabase Storage |
| `is_blank_template` | BOOLEAN | TRUE nếu là template trắng (failure path) |
| `created_at` | TIMESTAMPTZ | Thời gian tạo |

### `evaluations`
| Column | Type | Mô tả |
|--------|------|--------|
| `id` | UUID PK | |
| `lesson_plan_id` | UUID FK | |
| `is_passed` | BOOLEAN | Kết quả check |
| `error_details` | JSONB | [{section, issue, suggestion}] |

### `clarification_sessions`
| Column | Type | Mô tả |
|--------|------|--------|
| `id` | UUID PK | |
| `task_id` | TEXT | |
| `user_id` | UUID FK | |
| `questions` | JSONB | [{question, answer}] |
| `answers` | JSONB | |
| `status` | TEXT | pending / answered |

### `rag_knowledge_base`
| Column | Type | Mô tả |
|--------|------|--------|
| `id` | UUID PK | |
| `source` | TEXT | Nguồn (e.g., "sgk_toan_10_chuong2") |
| `subject` | TEXT | Môn |
| `grade` | TEXT | Lớp |
| `content` | TEXT | Nội dung text |
| `embedding` | VECTOR(1536) | Embedding từ text-embedding-3-small |

---

## 5. AI Agent Pipeline

### Pipeline Flow
```
User Input → [Intake] → [RAG] → [Clarification?] → [Generator] → [Quality Check] → [Retry?] → [Formatter] → DOCX
```

### Agent Details

| Agent | File | Chức năng | Model |
|-------|------|-----------|-------|
| **Intake** | `agents/intake.py` | Parse input, scope guard (reject non-lesson requests) | GPT-4o-mini |
| **RAG** | `agents/rag.py` | Vector search pgvector, tính confidence, sinh clarification questions | text-embedding-3-small |
| **Clarification** | `agents/clarification.py` | Pause pipeline, lưu questions vào DB, resume khi GV trả lời | — |
| **Generator** | `agents/generator.py` | Sinh giáo án JSON theo template 5E hoặc 3-phase | GPT-4o (primary) |
| **Quality Checker** | `agents/quality_checker.py` | Rule-based GDPT 2018 check + LLM content check | GPT-4o-mini |
| **Retry/Fallback** | `agents/retry_fallback.py` | Retry 2 lần (5s, 10s backoff) + fallback chain | GPT-4o → Gemini → GPT-4o-mini |
| **Formatter** | `agents/formatter.py` | JSON → DOCX (python-docx), blank template nếu fail | — |

### Pipeline State (`pipeline.py`)
```python
class PipelineState(TypedDict):
    task_id: str
    user_id: str
    user_input: dict
    normalized_input: dict | None
    is_out_of_scope: bool
    rag_context: list
    low_confidence: bool
    clarification_questions: list[str]
    clarification_answers: list[dict] | None
    draft_plan: dict | None
    quality_result: dict | None
    iteration: int                    # Hiện tại max = 1
    retry_count: int                  # Max = 2
    current_model: str
    status: str                       # pending|clarifying|generating|completed|failed
    is_blank_template: bool
    docx_url: str
    error: str | None
    progress_step: str                # FE dùng để hiển thị stepper
```

> ⚠️ Pipeline state lưu in-memory (`task_store` dict). Restart server = mất state.

---

## 6. Execution Paths

### ✅ Happy Path
```
User → Generate form → POST /api/generate → task_id
  → FE poll GET /api/status/{task_id} mỗi 3s
  → Pipeline: Intake ✓ → RAG ✓ (confidence ≥ 0.6) → Generator → Quality Check PASSED → Formatter
  → status=completed → FE show LessonPlanPreview → Download DOCX
```

### ⚠️ Low-Confidence Path (Clarification)
```
  → RAG: confidence < 0.6 → low_confidence=True
  → Pipeline PAUSE → status=clarifying → progress_step=clarification_needed
  → FE redirect → /generate/{task_id}/clarify
  → GV trả lời → POST /api/clarification/{task_id}
  → Pipeline RESUME → Generator (with enriched context) → ...
```

### ❌ Failure Path (Blank Template)
```
  → Generator fail → Retry 2 lần (5s, 10s backoff)
  → Fallback: GPT-4o → Gemini 1.5 Pro → GPT-4o-mini
  → Tất cả fail → is_blank_template=True
  → Formatter: tạo DOCX template trắng (đủ heading GDPT 2018, nội dung trống)
  → FE show BlankTemplateAlert → Download template trắng
```

### 🚫 Out-of-Scope Path
```
  → Intake Agent: "Cho mình biết thời tiết?" → out_of_scope=True
  → Pipeline STOP → status=failed → error="Mình chỉ có thể hỗ trợ soạn giáo án..."
  → FE show rejection message
```

---

## 7. Lesson Plan JSON Schema

```json
{
  "metadata": {
    "subject": "Toán",
    "grade": "10",
    "topic": "Hàm số bậc nhất",
    "teaching_model": "5E",
    "duration_minutes": 45,
    "objectives": ["HS nhận diện được...", "HS vẽ được..."],
    "competencies": ["Tư duy toán học", "Giao tiếp"],
    "materials": ["SGK Toán 10", "Bảng phụ"]
  },
  "sections": {
    "engage":    { "title": "Khởi động",  "content": "...", "duration": 5 },
    "explore":   { "title": "Khám phá",   "content": "...", "duration": 10 },
    "explain":   { "title": "Giải thích",  "content": "...", "duration": 15 },
    "elaborate": { "title": "Vận dụng",   "content": "...", "duration": 10 },
    "evaluate":  { "title": "Đánh giá",   "content": "...", "duration": 5 }
  },
  "rag_sources": ["sgk_toan_10_chuong2_ham_so"],
  "compliance": {
    "status": "PASSED",
    "errors": []
  },
  "clarification_needed": false
}
```

---

## 8. Frontend Pages & Components

### Pages
| Path | Mô tả | Key logic |
|------|--------|-----------|
| `/` | Landing page | Hero + stats + features, link to login |
| `/login` | Login / Signup | Supabase `signInWithPassword` / `signUp`, redirect → `/dashboard` |
| `/dashboard` | Danh sách giáo án | `listLessonPlans()`, card grid, status badges, empty state |
| `/generate` | Form tạo giáo án | Subject/Grade selects, topic input, teaching model radio, `generateLessonPlan()` |
| `/generate/[task_id]` | Progress + kết quả | Poll `getStatus()` mỗi 3s, ProgressTracker, LessonPlanPreview |
| `/generate/[task_id]/clarify` | Q&A bổ sung | `getClarificationQuestions()`, textarea answers, `submitClarificationAnswers()` |
| `/check` | Kiểm tra giáo án | Input plan ID, `checkQuality()`, ComplianceReport |

### Components
| Component | Props | Chức năng |
|-----------|-------|-----------|
| `ProgressTracker` | `currentStep`, `status` | 5-step stepper với animation active/completed/pending |
| `LessonPlanPreview` | `plan` | Render JSON → heading hierarchy (Mục tiêu, Thiết bị, Tiến trình) |
| `ComplianceReport` | `isPassed`, `errors`, `suggestions` | Checklist ✅/❌ + detailed error accordion |
| `BlankTemplateAlert` | `taskId`, `onRetry` | Warning banner + download template + retry button |
| `ClarificationDialog` | `taskId`, `questions`, `onSubmitted` | Q&A form + submit |
| `ExportButton` | `planId` | Download DOCX button |
| `GenerateForm` | `onSubmit` | Reusable form component |

---

## 9. Shared Files (KHÔNG tự ý thay đổi)

> Các file dưới đây là API contract giữa 3 người. **Phải báo team trước khi sửa.**

| File | Mô tả | Ai tạo |
|------|--------|--------|
| `backend/app/schemas/lesson_plan.py` | Pydantic types: `GenerateRequest`, `StatusResponse`, `LessonPlanJSON`, etc. | Person B |
| `frontend/lib/types.ts` | TypeScript interfaces tương ứng | Person C |
| `frontend/lib/api.ts` | API client functions (paths, request/response shapes) | Person C |

---

## 10. Environment Variables

### Backend (`backend/.env`)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
PRIMARY_MODEL=gpt-4o
FALLBACK_MODEL=gemini-1.5-pro
CHEAP_MODEL=gpt-4o-mini
MAX_ITERATIONS=1
MAX_RETRIES=2
RAG_CONFIDENCE_THRESHOLD=0.6
CORS_ORIGINS=http://localhost:3000
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

---

## 11. Chạy dự án

### Backend
```bash
cd backend
cp .env.example .env        # Fill API keys
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local  # Fill Supabase keys + API URL
npm install
npm run dev                  # → http://localhost:3000
```

### Supabase Setup
1. Vào Supabase Dashboard → SQL Editor → paste `backend/scripts/schema.sql` → Run
2. Storage → tạo bucket `templates` (public) + `documents` (public)
3. Chạy mock RAG: `cd backend && python -m scripts.ingest_mock_rag`

---

## 12. Ownership & Branching

| Person | Role | Branch | Owns |
|--------|------|--------|------|
| **A** | AI Pipeline Lead | `feat/agent-pipeline` | `agents/*`, `api/generate.py`, `api/clarification.py`, `api/check.py`, `api/edit.py` |
| **B** | Backend Foundation | `feat/backend-foundation` | `database.py`, `schemas/*`, `api/lesson_plans.py`, `scripts/*` |
| **C** | Frontend Lead | `feat/frontend` | `frontend/*` toàn bộ |

### Merge rules
- Merge vào `dev` chỉ tại integration checkpoints
- Shared files (`schemas/lesson_plan.py`, `lib/types.ts`) → notify team trước khi sửa
- Nếu conflict → người merge báo owner file review trước khi resolve

---

## 13. Quality Check — 5 mục kiểm tra GDPT 2018

| # | Mục kiểm tra | Logic |
|---|-------------|-------|
| 1 | Thông tin bìa (Tên bài, Môn, Lớp, Thời gian) | Rule-based: check `metadata` fields |
| 2 | Mục tiêu ≥ 2 năng lực + 1 phẩm chất | Rule-based: count `objectives` + `competencies` |
| 3 | Thiết bị và học liệu được điền | Rule-based: `materials.length > 0` |
| 4 | Đủ bước theo mô hình (5E: 5 sections, 3-phase: 3 sections) | Rule-based: check section keys |
| 5 | Mỗi hoạt động có 4 cột (Mục tiêu–Nội dung–Sản phẩm–Tổ chức) | LLM-based: content quality assessment |

---

## 14. Mock RAG Data (8 documents)

| Source | Môn | Lớp |
|--------|-----|-----|
| `sgk_toan_10_chuong2_ham_so` | Toán | 10 |
| `sgk_toan_10_chuong2_phuong_trinh` | Toán | 10 |
| `sgk_toan_10_chuong1_menh_de` | Toán | 10 |
| `sgk_van_10_tho` | Ngữ Văn | 10 |
| `sgk_van_10_truyen_ngan` | Ngữ Văn | 10 |
| `sgk_su_10_chuong1` | Lịch sử | 10 |
| `sgk_toan_6_so_tu_nhien` | Toán | 6 |
| `sgk_ly_11_dong_dien` | Vật lý | 11 |
