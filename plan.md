# PLAN TỔNG THỂ: Soạn Giáo Án Thông Minh — Multi-Agent System

> **Version**: 3.0 | **Ngày**: 2026-04-11 | **Loại**: Startup MVP Plan (End-to-End)

---


## 1. Tổng quan kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                      │
│   [Form nhập liệu] [Realtime status] [Preview] [Export]        │
└───────────────────────────┬────────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼────────────────────────────────────┐
│                  BACKEND ORCHESTRATION (FastAPI)               │
│  [Auth Middleware] [Task Queue] [Orchestrator Agent] [WS]      │
└──────────┬──────────────────────────────────────┬─────────────┘
           │                                       │
┌──────────▼────────────┐               ┌──────────▼─────────────┐
│   MULTI-AGENT PIPELINE│               │   SUPABASE (DB)        │
│  ┌───────────────┐    │               │  [PostgreSQL+vector]   │
│  │ Intake Agent  │    │               │  [Auth / RLS]          │
│  ├───────────────┤    │◄──────────────│  [Storage: DOCX]       │
│  │   RAG Agent   │    │               │  [Realtime subs]       │
│  ├───────────────┤    │               │  [user_preferences]    │
│  │ Generator     │    │               └───────────────────────┘
│  ├───────────────┤    │
│  │ QualityCheck  │    │
│  ├───────────────┤    │
│  │ Clarification │    │
│  ├───────────────┤    │
│  │ Editor        │    │
│  ├───────────────┤    │
│  │ Formatter     │    │
│  └───────────────┘    │
└───────────────────────┘
```

**Orchestrator Agent** là trung tâm điều phối, giám sát tiến trình, retry/fallback, tối ưu hóa bất đồng bộ (các agent có thể chạy song song khi phù hợp), log trạng thái, mở rộng dễ dàng.

**Tối ưu hệ thống:**
- Giao tiếp agent qua message/event bus hoặc task queue, input/output rõ ràng, giảm phụ thuộc lẫn nhau.
- Tự động scale agent, cache kết quả trung gian, tận dụng container/k8s nếu mở rộng lớn.
- Phản hồi nhanh với kết quả tạm thời, cho phép can thiệp thủ công từng bước, realtime update.
- Rule kiểm tra tự động, cập nhật động, tích hợp AI phát hiện lỗi logic/thiếu sót.

**Tech Stack**:
| Layer | Technology | Lý do chọn |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR + realtime UI dễ dàng |
| Backend | FastAPI (Python) | Async, tương thích tốt với LLM SDK |
| Database | Supabase (PostgreSQL + pgvector) | Auth, Storage, RLS tích hợp sẵn |
| AI Orchestration | LangGraph | Stateful multi-agent graph, built-in retry/checkpoint |
| LLM | GPT-4o (primary), Gemini 1.5 Pro (fallback), GPT-4o-mini (fallback cuối) | Chất lượng + chi phí tối ưu, đảm bảo availability |
| Embedding | OpenAI text-embedding-3-small | Fast, cheap, tốt cho tiếng Việt |
| Vector Store | pgvector (trong Supabase) | Không cần infra riêng |
| Document Export | python-docx | Render từ JSON, không phụ thuộc Markdown |
| Deployment | Vercel (FE) + Railway/Render (BE) | Serverless-friendly, dễ CI/CD |
| Task Queue | Supabase Realtime + background task | Polling/WebSocket cho long-running gen |

---

## 2. Database Schema (Supabase PostgreSQL)

### Table: `users`
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT CHECK (role IN ('teacher', 'head_teacher')) NOT NULL,
  school_id   UUID REFERENCES schools(id),
  subject     TEXT,          -- Môn dạy (dành cho GV)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `schools`
```sql
CREATE TABLE schools (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT
);
```

### Table: `lesson_plans`
```sql
CREATE TABLE lesson_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  grade           TEXT NOT NULL,
  topic           TEXT NOT NULL,
  teaching_model  TEXT CHECK (teaching_model IN ('5E', '3-phase')) NOT NULL,
  objectives      TEXT[] NOT NULL,
  content_json    JSONB,               -- Structured lesson plan
  status          TEXT CHECK (status IN ('pending','clarifying','generating','completed','failed')) DEFAULT 'pending',
  iteration_count INT DEFAULT 0,
  retry_count     INT DEFAULT 0,       -- Số lần retry
  fallback_model  TEXT,               -- Model được dùng nếu fallback
  compliance_status TEXT CHECK (compliance_status IN ('PASSED','FAILED','PENDING')),
  docx_url        TEXT,               -- Supabase Storage URL (final plan hoặc blank template)
  is_blank_template BOOLEAN DEFAULT FALSE, -- TRUE nếu đây là template trắng do failure
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `evaluations`
```sql
CREATE TABLE evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id  UUID REFERENCES lesson_plans(id) ON DELETE CASCADE,
  checked_by      TEXT CHECK (checked_by IN ('system','head_teacher')),
  is_passed       BOOLEAN NOT NULL,
  error_details   JSONB,  -- [{section, error_type, message, suggestion}]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `edit_history`
```sql
CREATE TABLE edit_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id  UUID REFERENCES lesson_plans(id),
  user_id         UUID REFERENCES users(id),
  section_id      TEXT NOT NULL,       -- "engage", "explore", etc.
  before_content  JSONB,
  after_content   JSONB,
  edit_prompt     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `rag_knowledge_base`
```sql
CREATE TABLE rag_knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,           -- "sgk_toan_10_chuong2"
  subject     TEXT NOT NULL,
  grade       TEXT NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),            -- text-embedding-3-small
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON rag_knowledge_base USING ivfflat (embedding vector_cosine_ops);
```

### Table: `user_preferences` *(Long-term Agent Memory)*
```sql
CREATE TABLE user_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pref_key    TEXT NOT NULL,   -- "preferred_model", "default_subject", "teaching_style"
  pref_value  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, pref_key)
);
```

### Table: `clarification_sessions`
```sql
CREATE TABLE clarification_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         TEXT NOT NULL,
  user_id         UUID REFERENCES auth.users(id),
  questions       JSONB NOT NULL,      -- [{question, answer, answered_at}]
  status          TEXT DEFAULT 'pending', -- pending | answered
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security
```sql
-- GV chỉ thấy giáo án của mình
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_own" ON lesson_plans
  FOR ALL USING (user_id = auth.uid());

-- Tổ trưởng thấy giáo án của tất cả GV trong trường
CREATE POLICY "head_teacher_school" ON lesson_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u1, users u2
      WHERE u1.id = auth.uid() AND u1.role = 'head_teacher'
      AND u2.id = lesson_plans.user_id
      AND u2.school_id = u1.school_id
    )
  );
```

---

## 3. Backend API Endpoints (FastAPI)

### Authentication
```
POST /api/auth/login       — Supabase Auth JWT
POST /api/auth/logout
GET  /api/auth/me
```

### Lesson Plan — Generate
```
POST /api/generate
  Body: {
    subject, grade, topic, objectives[],
    teaching_model, reference_files[] (optional)
  }
  Response: { task_id, status: "pending" }

GET /api/status/{task_id}  — Polling trạng thái
WS  /ws/generate/{task_id} — WebSocket realtime progress (preferred)
  Events: "intake_done" | "rag_done" | "clarification_needed"
        | "draft_ready" | "quality_check_done"
        | "quality_passed" | "quality_failed" | "retrying"
        | "fallback_model" | "export_done" | "blank_template_ready"
```

### Clarification (khi Low-Confidence Path)
```
GET  /api/clarification/{task_id}      — Lấy danh sách câu hỏi cần GV trả lời
POST /api/clarification/{task_id}
  Body: { answers: [{question_id, answer}], additional_files: [] }
  Response: { task_id, status: "generating" }  — tiếp tục pipeline
```

### Lesson Plan — CRUD
```
GET    /api/lesson-plans           — Danh sách (phân trang)
GET    /api/lesson-plans/{id}      — Chi tiết
DELETE /api/lesson-plans/{id}
```

### Quality Check (standalone)
```
POST /api/check
  Body: { lesson_plan_id } OR { file: DOCX/PDF upload }
  Response: { is_passed, error_details[], suggestions[] }
```

### Edit
```
POST /api/edit
  Body: {
    lesson_plan_id,
    section_id,        -- "engage" | "explore" | "explain"...
    edit_prompt        -- "Thiết kế lại thành minigame 10 phút"
  }
  Response: { task_id }
```

### Export
```
POST /api/export/{lesson_plan_id}
  Body: { format: "docx" }
  Response: { download_url, is_blank_template: bool }
```

### Analytics (Tổ trưởng)
```
GET /api/analytics/school-summary   — Compliance rate, avg generation time
GET /api/analytics/teacher/{id}     — Lịch sử & chất lượng của 1 GV
```

---

## 4. Multi-Agent Pipeline (LangGraph)

### 4.1 Agent State Graph

```python
class LessonPlanState(TypedDict):
    task_id: str
    user_input: UserInput
    normalized_input: NormalizedInput | None
    is_out_of_scope: bool
    rag_context: list[RAGChunk]
    low_confidence: bool
    clarification_questions: list[str]
    clarification_answers: list[dict] | None   # GV trả lời
    draft_plan: LessonPlanJSON | None
    quality_result: QualityResult | None
    iteration: int
    retry_count: int
    current_model: str                          # Model đang dùng
    fallback_model: str | None                  # Model fallback nếu cần
    status: Literal["pending","clarifying","generating","passed","failed","exporting"]
    final_plan: LessonPlanJSON | None
    is_blank_template: bool
    output_urls: dict[str, str]
    # Memory
    memory_context: AgentMemory                 # Short-term session memory
    user_preferences: dict                      # Long-term từ Supabase
```

### 4.2 LangGraph Node Definitions

```
START
  │
  ▼
[intake_node]
  Parse input, validate fields, extract PDF/DOCX nếu có
  Kiểm tra scope: có liên quan đến soạn giáo án không?
  Output: normalized_input | is_out_of_scope=True
  │
  ├─ is_out_of_scope=True ──► [out_of_scope_node] → trả thông báo từ chối
  │
  ▼
[rag_node]
  Vector search trong pgvector theo subject + grade + topic
  Tính confidence score từ cosine similarity của top-k results
  Nếu confidence thấp → sinh clarification_questions
  Output: rag_context + low_confidence + clarification_questions
  │
  ├─ low_confidence=True ──► [clarification_node]
  │        Gửi câu hỏi cho GV. DỪNG pipeline, chờ GV trả lời.
  │        GV bổ sung → tiếp tục vào [rag_node] với context mới.
  │
  ▼
[generator_node]
  System prompt: template cứng (5E / 3-phase) theo chuẩn GDPT 2018
  Context: rag_context + user objectives + clarification_answers
  Output: draft_plan (JSON Schema)
  │
  ▼
[quality_checker_node]   ← Gộp từ Critique + Compliance Checker
  STEP 1 — Rule-based (fast):
    Kiểm tra đủ heading GDPT 2018 (Tên bài, Môn, Lớp, Thời gian)
    Kiểm tra Mục tiêu có ≥ 2 năng lực + 1 phẩm chất
    Kiểm tra đủ bước theo model (5E hoặc 3-phase)
    Kiểm tra mỗi hoạt động có đủ 4 cột
  STEP 2 — LLM call (quality):
    Đánh giá nội dung có phù hợp mục tiêu không
  Output: quality_result { passed: bool, errors: [{section, issue, suggestion}] }
  │
  ├─ passed=True ──────────────────────────────► [formatter_node]
  │
  └─ passed=False AND iteration < 2 ──► [generator_node] (revise with errors)
         (nếu iteration >= 2 → đi đến retry/fallback)
  │
  ▼
[retry_fallback_node]   ← Kích hoạt khi exhausted iterations
  Retry 3 lần với exponential backoff (5s, 10s, 20s)
  Nếu vẫn fail → switch model (GPT-4o → Gemini 1.5 Pro → GPT-4o-mini)
  Retry 1 lần với model mới
  Nếu tất cả fail → is_blank_template=True
  │
  ▼
[formatter_node]
  Nếu is_blank_template=False: JSON → DOCX (python-docx)
  Nếu is_blank_template=True: Export DOCX template trắng (đúng format GDPT 2018, headings có sẵn, nội dung trống)
  Upload lên Supabase Storage
  Output: { docx_url, is_blank_template }
  │
  ▼
END → Update lesson_plans status = "completed" | "failed_blank_template"
```

### 4.3 Prompts (System Instructions)

**Intake Agent Prompt (Scope Guard)**:
```
Bạn là trợ lý AI chuyên hỗ trợ soạn giáo án theo chương trình GDPT 2018.
Đọc yêu cầu của giáo viên và xác định:
1. Yêu cầu có liên quan đến soạn giáo án hoặc chỉnh sửa giáo án không?
2. Nếu KHÔNG → trả về { "out_of_scope": true, "message": "Mình chỉ có thể hỗ trợ soạn giáo án theo chương trình GDPT 2018. Bạn cần soạn bài nào không?" }
3. Nếu CÓ → parse và normalize thông tin đầu vào.
```

**Generator Agent Prompt**:
```
Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.
Bạn PHẢI sinh output dưới dạng JSON SCHEMA sau — KHÔNG ĐƯỢC thêm bất kỳ key nào ngoài schema.
Bạn KHÔNG ĐƯỢC bịa đặt kiến thức không có trong [RAG_CONTEXT] hoặc [CLARIFICATION_ANSWERS].
Phương pháp dạy học: {teaching_model}
Schema: {LESSON_PLAN_JSON_SCHEMA}
```

**Quality Checker Agent Prompt**:
```
Bạn là inspector kiểm tra giáo án theo chuẩn GDPT 2018.
Kiểm tra TỪNG mục sau và trả về JSON với trường passed/error cho từng mục:
1. Có đủ [Tên bài dạy, Thời gian, Môn học, Lớp]
2. Có mục [Mục tiêu] với ít nhất 2 năng lực chuyên môn + 1 phẩm chất
3. Có mục [Thiết bị và học liệu]
4. Có đủ các bước của mô hình {teaching_model}
5. Mỗi hoạt động có đủ 4 cột: Mục tiêu hoạt động / Nội dung / Sản phẩm / Tổ chức thực hiện
Trả về JSON: { passed: bool, errors: [{section, issue, suggestion}] }
```

### 4.4 Memory Architecture

#### Short-term Memory (Session Context)
Lưu trong `LessonPlanState` suốt session:

```python
class AgentMemory(TypedDict):
    session_id: str
    rag_context_summary: str          # Tóm tắt context đã load
    clarification_history: list[dict] # Q&A trong phiên này
    draft_history: list[str]          # Các version draft đã thử
    quality_feedback_history: list    # Feedback từ Quality Checker
    user_corrections: list[str]       # Các yêu cầu chỉnh sửa trong phiên
```

#### Long-term Memory (User Preferences)
Đọc từ Supabase `user_preferences` đầu mỗi session:

```python
# Khởi tạo session: load preferences
def load_user_preferences(user_id: str) -> dict:
    return supabase.table("user_preferences") \
        .select("pref_key, pref_value") \
        .eq("user_id", user_id).execute()

# Cập nhật sau session: upsert preferences
def update_user_preferences(user_id: str, key: str, value: any):
    supabase.table("user_preferences").upsert({
        "user_id": user_id,
        "pref_key": key,
        "pref_value": value
    }).execute()
```

**Preference keys được theo dõi**:
- `preferred_teaching_model`: "5E" / "3-phase"
- `default_subject`, `default_grade`
- `common_compliance_errors`: loại lỗi hay gặp → prompt generator tránh trước
- `teaching_style_notes`: ghi chú bổ sung tự động từ feedback

### 4.5 Retry & Model Fallback Strategy

```python
from tenacity import retry, stop_after_attempt, wait_exponential

MODEL_CHAIN = ["gpt-4o", "gemini-1.5-pro", "gpt-4o-mini"]

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=5, max=20)
)
async def call_llm_with_retry(prompt: str, model: str) -> str:
    return await llm_client.call(model=model, prompt=prompt)

async def generate_with_fallback(state: LessonPlanState) -> LessonPlanState:
    for model in MODEL_CHAIN:
        try:
            state["current_model"] = model
            result = await call_llm_with_retry(prompt, model)
            return result
        except Exception as e:
            state["retry_count"] += 1
            log_retry_event(state["task_id"], model, str(e))
            continue

    # Tất cả model đều fail → trả template trắng
    state["is_blank_template"] = True
    return state
```

---

## 5. Frontend Design (Next.js)

### 5.1 Page Structure
```
/                        ← Landing page (giới thiệu sản phẩm)
/login                   ← Đăng nhập (Supabase Auth)
/dashboard               ← Danh sách giáo án của GV
/generate                ← Form tạo giáo án mới
/generate/[task_id]      ← Realtime progress + Preview kết quả
/generate/[task_id]/clarify ← UI hỏi bổ sung thông tin (Low-Confidence Path)
/plans/[id]              ← Chi tiết giáo án (view + edit)
/plans/[id]/edit         ← Chỉnh sửa giáo án (Editor Agent)
/check                   ← Quality Checker standalone (upload file)
/analytics               ← Dashboard Tổ trưởng (chỉ role=head_teacher)
```

### 5.2 Key UI Components
- **GenerateForm**: Subject/Grade/Topic dropdowns, Teaching Model selector, File upload (PDF/DOCX), Objectives textarea
- **ProgressTracker**: WebSocket-driven stepper: `Phân tích → Tra cứu SGK → [Hỏi bổ sung?] → Soạn thảo → Kiểm tra → Hoàn thành`
- **ClarificationDialog**: Hiển thị khi Low-Confidence → Form Q&A + upload tài liệu bổ sung
- **LessonPlanPreview**: Render JSON thành HTML có heading hierarchy
- **BlankTemplateAlert**: Khi Failure Path → thông báo rõ, nút download template trắng
- **ComplianceReport**: Accordion list — passed items (✅) và failed items (❌) với suggestion
- **SectionEditor**: Edit từng section riêng biệt, confirm diff trước khi save
- **ExportPanel**: Download DOCX button

---

## 6. RAG Pipeline — Xây dựng Knowledge Base

### Bước 1: Thu thập & Xử lý SGK
```
Input: PDF SGK chuẩn (Bộ GD&ĐT) cho tất cả môn + lớp
↓
PDF Parser (pdfplumber/pymupdf)
↓
Chunking: Theo chương/mục (semantic chunks ~500 tokens)
↓
Metadata gắn: { subject, grade, chapter, page }
↓
Embedding (text-embedding-3-small)
↓
Insert vào pgvector (Supabase)
```

### Bước 2: Retrieval tại Runtime
```python
query = f"{subject} lớp {grade}: {topic} — {objectives}"
embedding = openai.embeddings.create(input=query, model="text-embedding-3-small")
results = supabase.rpc("match_knowledge", {
    "query_embedding": embedding,
    "subject_filter": subject,
    "grade_filter": grade,
    "match_count": 5
})

# Đánh giá confidence
top_score = results[0]["similarity"]
if top_score < 0.6:
    low_confidence = True  # → trigger clarification
```

### Bước 3: Context Assembly
- Top-5 chunks → format thành `<source>` tags cho Generator
- Nếu `low_confidence=True` → pipeline dừng, sinh `clarification_questions` để hỏi GV

---

## 7. Deployment Architecture

```
Developer → GitHub Push
    │
    ├──► Vercel CI/CD ──► Next.js Frontend (vercel.app)
    │
    └──► Railway/Render CI/CD ──► FastAPI Backend (railway.app / render.com)
              │
              └──► Supabase (managed)
                   ├── PostgreSQL + pgvector
                   ├── Auth (JWT)
                   └── Storage (DOCX)
```

### Environment Variables
```bash
# Frontend (.env.local)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=

# Backend (.env)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=           # fallback model
LANGCHAIN_TRACING_V2=true # LangSmith monitoring
LANGCHAIN_API_KEY=
```

---

## 8. Roadmap MVP — 6 Tuần

### Phase 1 (Tuần 1-2): Foundation
- [ ] Setup Supabase: schema (kể cả `user_preferences`, `clarification_sessions`), RLS, pgvector
- [ ] Setup FastAPI: project structure, auth middleware, async patterns
- [ ] Build RAG pipeline: ingest 2-3 môn mẫu (Toán, Văn, Lịch sử)
- [ ] Build Generator Agent: prompt engineering, JSON schema output
- [ ] Unit test: Generator với 10 bài mẫu

### Phase 2 (Tuần 3): Multi-Agent Core
- [ ] Integrate LangGraph: state machine cho pipeline
- [ ] Build Quality Checker Agent (gộp Critique + Compliance)
- [ ] Implement Clarification flow (Low-Confidence Path)
- [ ] Implement Retry + Model Fallback + Blank Template export
- [ ] Implement iteration loop (max 2 vòng)
- [ ] Build Formatter Agent: python-docx template rendering
- [ ] Integration test: end-to-end với 20 bài test

### Phase 3 (Tuần 4): API & Realtime
- [ ] Expose all FastAPI endpoints (kể cả `/api/clarification`)
- [ ] Implement WebSocket progress streaming (kể cả event `clarification_needed`)
- [ ] Task queue (async background tasks)
- [ ] Export to DOCX + Blank Template fallback
- [ ] API testing (pytest + httpx)

### Phase 4 (Tuần 5): Frontend
- [ ] Next.js setup, Supabase Auth integration
- [ ] GenerateForm + ProgressTracker (WebSocket)
- [ ] ClarificationDialog UI
- [ ] LessonPlanPreview + ComplianceReport UI
- [ ] BlankTemplateAlert + ExportPanel
- [ ] SectionEditor
- [ ] Analytics dashboard (Tổ trưởng)

### Phase 5 (Tuần 6): Polish & Launch
- [ ] End-to-end testing với GV thật (5-10 người)
- [ ] Performance optimization (response time target < 3 phút)
- [ ] Deploy to production (Vercel + Railway)
- [ ] Monitoring: LangSmith traces + Supabase logs

---

## 9. Eval & Quality Assurance

### Automated Eval Suite (chỉ kiểm tra chuẩn Bộ GD&ĐT)
```python
def evaluate_lesson_plan(plan: LessonPlanJSON) -> EvalReport:
    results = {}

    # Kiểm tra thông tin bìa
    results["header"] = check_required_fields(
        plan, ["subject", "grade", "topic", "duration_minutes"]
    )

    # Kiểm tra Mục tiêu: ≥ 2 năng lực + ≥ 1 phẩm chất
    results["objectives"] = check_objectives_structure(plan.metadata.objectives)

    # Kiểm tra Thiết bị & học liệu
    results["materials"] = len(plan.metadata.materials) > 0

    # Kiểm tra đủ bước theo mô hình
    results["sections"] = check_required_sections(plan, plan.metadata.teaching_model)

    # Kiểm tra mỗi hoạt động có đủ 4 cột
    results["activity_columns"] = check_activity_columns(plan)

    return EvalReport(**results)
```

### Golden Test Set
- 20 giáo án mẫu chuẩn (do tổ trưởng cung cấp)
- Chạy regression test mỗi khi thay đổi prompt
- Target: pass rate ≥ 95%

---

## 10. Monitoring & Observability

| Tool | Mục đích |
|---|---|
| **LangSmith** | Trace từng bước agent, latency, token usage, retry events |
| **Supabase Dashboard** | DB query performance, Auth logs |
| **Sentry** | Error tracking (FE + BE) |
| **Custom Analytics** | Compliance pass rate, avg generation time, clarification rate, fallback rate |

### Alert Thresholds
- Generation time > 4 phút → alert
- Compliance pass rate < 70% trong 24h → alert
- Clarification rate > 30% (RAG quality issue) → alert
- Fallback model usage > 10% → alert (OpenAI API issue)
- Error rate > 5% → alert

---

## 11. Open Questions & Decisions

> [!IMPORTANT]
> **Q1**: SGK PDF có sẵn không hay cần xin phép Bộ GD&ĐT?
> → Nếu không có → dùng curriculum outlines từ website chính thức làm RAG source tạm thời.

> [!IMPORTANT]
> **Q2**: LangGraph vs AutoGen vs custom orchestration?
> → Đề xuất **LangGraph** vì: stateful, có built-in retry/checkpoint, dễ debug với LangSmith.

> [!NOTE]
> **Q3**: WebSocket hay polling cho progress tracking?
> → Đề xuất **WebSocket** là primary (UX tốt hơn). Polling là fallback cho môi trường không support WS.

> [!NOTE]
> **Q4**: Blank template DOCX — pre-built hay generate on-the-fly?
> → Đề xuất **pre-built template** (1 file DOCX mẫu lưu trong Supabase Storage), chỉ cần copy & return URL khi Failure Path xảy ra. Nhanh và đáng tin cậy hơn generate on-the-fly.