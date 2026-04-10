# PLAN TỔNG THỂ: Soạn Giáo Án Thông Minh — Multi-Agent System

> **Version**: 2.0 | **Ngày**: 2026-04-10 | **Loại**: Startup MVP Plan (End-to-End)

---

## 1. Tổng quan kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│   [Form nhập liệu] [Realtime status] [Preview] [Export button]  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│                  BACKEND ORCHESTRATION (FastAPI)                  │
│  [Auth Middleware] [Task Queue] [Agent Orchestrator] [WebSocket] │
└──────────┬──────────────────────────────────────┬───────────────┘
           │                                       │
┌──────────▼──────────┐               ┌────────────▼──────────────┐
│  AI AGENT PIPELINE  │               │   SUPABASE (Database)      │
│  ┌───────────────┐  │               │  [PostgreSQL + pgvector]   │
│  │ Intake Agent  │  │               │  [Auth / RLS]              │
│  ├───────────────┤  │               │  [Storage: PDF/DOCX]       │
│  │   RAG Agent   │  │◄──────────────│  [Realtime subscriptions]  │
│  ├───────────────┤  │               └───────────────────────────-┘
│  │ Generator     │  │
│  ├───────────────┤  │
│  │ Critique      │  │
│  ├───────────────┤  │
│  │ Compliance    │  │
│  ├───────────────┤  │
│  │ Editor        │  │
│  ├───────────────┤  │
│  │ Formatter     │  │
│  └───────────────┘  │
└─────────────────────┘
```

**Tech Stack**:
| Layer | Technology | Lý do chọn |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR + realtime UI dễ dàng |
| Backend | FastAPI (Python) | Async, tương thích tốt với LLM SDK |
| Database | Supabase (PostgreSQL + pgvector) | Auth, Storage, RLS tích hợp sẵn |
| AI Orchestration | LangGraph | Stateful multi-agent graph, built-in retry |
| LLM | GPT-4o + GPT-4o-mini (primary), Gemini 1.5 Pro (fallback) | Chất lượng + chi phí tối ưu |
| Embedding | OpenAI text-embedding-3-small | Fast, cheap, tốt cho tiếng Việt |
| Vector Store | pgvector (trong Supabase) | Không cần infra riêng |
| Document Export | python-docx + reportlab | Render từ JSON, không phụ thuộc Markdown |
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
  grade           TEXT NOT NULL,       -- "10", "11", "12", "6"...
  topic           TEXT NOT NULL,
  teaching_model  TEXT CHECK (teaching_model IN ('5E', 'VNEN', '3-phase')) NOT NULL,
  objectives      TEXT[] NOT NULL,
  content_json    JSONB,               -- Structured lesson plan
  status          TEXT CHECK (status IN ('pending','generating','completed','failed')) DEFAULT 'pending',
  iteration_count INT DEFAULT 0,
  compliance_status TEXT CHECK (compliance_status IN ('PASSED','FAILED','PENDING')),
  docx_url        TEXT,                -- Supabase Storage URL
  pdf_url         TEXT,
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
  score           NUMERIC(3,2),        -- 0.00 - 1.00
  error_details   JSONB,               -- [{section, error_type, message, suggestion}]
  critique_report JSONB,               -- Coherence scores per section
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

GET /api/status/{task_id}  — Polling trạng thái (fallback)
WS  /ws/generate/{task_id} — WebSocket realtime progress (preferred)
  Events: "intake_done" | "rag_done" | "draft_ready" | "critique_done"
          | "compliance_passed" | "compliance_failed" | "export_done"
```

### Lesson Plan — CRUD
```
GET  /api/lesson-plans              — Danh sách (phân trang)
GET  /api/lesson-plans/{id}         — Chi tiết
DELETE /api/lesson-plans/{id}
```

### Compliance Check (standalone)
```
POST /api/check
  Body: { lesson_plan_id } OR { file: DOCX/PDF upload }
  Response: { is_passed, score, error_details[], suggestions[] }
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
  Body: { format: "docx" | "pdf" }
  Response: { download_url }
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
# State passed giữa các node trong LangGraph
class LessonPlanState(TypedDict):
    task_id: str
    user_input: UserInput
    normalized_input: NormalizedInput
    rag_context: list[RAGChunk]
    draft_plan: LessonPlanJSON | None
    critique_report: CritiqueReport | None
    compliance_result: ComplianceResult | None
    iteration: int
    status: Literal["pending","generating","review","passed","failed","exporting"]
    final_plan: LessonPlanJSON | None
    output_urls: dict[str, str]
```

### 4.2 LangGraph Node Definitions

```
START
  │
  ▼
[intake_node]
  Parse input, validate fields, extract PDF/DOCX nếu có
  Output: normalized_input
  │
  ▼
[rag_node]
  Vector search trong pgvector theo subject + grade + topic
  Lấy top-5 chunks liên quan
  Output: rag_context (danh sách chunks + sources)
  │
  ▼
[generator_node]
  System prompt: template cứng (5E/VNEN/3-phase)
  Context: rag_context + user objectives
  Output: draft_plan (JSON Schema)
  │
  ▼
[critique_node]
  Kiểm tra mục tiêu ↔ hoạt động (embedding coherence)
  Kiểm tra thời lượng hợp lý
  Output: critique_report { ok: bool, suggestions: list }
  │
  ├─ ok=True ──► [compliance_node]
  │
  └─ ok=False AND iteration < 2 ──► [generator_node] (revise với critique)
         (nếu iteration >= 2 → skip critique, đi thẳng compliance)
  │
  ▼
[compliance_node]
  Kiểm tra heading GDPT 2018 (rule-based + LLM)
  Output: compliance_result { passed: bool, errors: list }
  │
  ├─ passed=True ──────────────────────────────► [formatter_node]
  │
  └─ passed=False AND iteration < 2 ──► [generator_node] (fix errors)
         (nếu iteration >= 2 → formatter với warning flag)
  │
  ▼
[formatter_node]
  JSON → DOCX (python-docx): heading, table, section mapping
  JSON → PDF (reportlab hoặc DOCX→PDF convert)
  Upload lên Supabase Storage
  Output: { docx_url, pdf_url }
  │
  ▼
END → Update lesson_plans status = "completed"
```

### 4.3 Prompts (System Instructions)

**Generator Agent Prompt (phần quan trọng)**:
```
Bạn là chuyên gia thiết kế giáo án theo chương trình GDPT 2018.
Bạn PHẢI sinh output dưới dạng JSON SCHEMA sau — KHÔNG ĐƯỢC thêm bất kỳ key nào ngoài schema.
Bạn KHÔNG ĐƯỢC bịa đặt kiến thức không có trong [RAG_CONTEXT].
Nếu không có thông tin → điền "⚠️ Cần kiểm chứng: [mô tả ngắn vấn đề]"
Phương pháp dạy học: {teaching_model}
Schema: {LESSON_PLAN_JSON_SCHEMA}
```

**Compliance Checker Agent Prompt**:
```
Bạn là inspector kiểm tra giáo án theo chuẩn GDPT 2018.
Kiểm tra TỪNG mục sau và trả về JSON với trường passed/error cho từng mục:
1. Có đủ [Tên bài dạy, Thời gian, Môn học, Lớp]
2. Có mục [Mục tiêu] với ít nhất 2 năng lực chuyên môn
3. Có mục [Thiết bị và học liệu]
4. Có đủ các bước của mô hình {teaching_model}
5. Mỗi hoạt động có [Mục tiêu hoạt động, Nội dung, Sản phẩm, Tổ chức thực hiện]
Trả về JSON: { passed: bool, errors: [{section, issue, suggestion}] }
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
/plans/[id]              ← Chi tiết giáo án (view + edit)
/plans/[id]/edit         ← Chỉnh sửa giáo án (Editor Agent)
/check                   ← Compliance Checker standalone (upload file)
/analytics               ← Dashboard Tổ trưởng (chỉ role=head_teacher)
```

### 5.2 Key UI Components
- **GenerateForm**: Subject/Grade/Topic dropdowns, Teaching Model selector, File upload (PDF/DOCX), Objectives textarea
- **ProgressTracker**: WebSocket-driven stepper: `Phân tích → Tra cứu SGK → Soạn thảo → Kiểm tra → Hoàn thành`
- **LessonPlanPreview**: Render JSON thành HTML có heading hierarchy, highlight `⚠️` sections
- **ComplianceReport**: Accordion list — passed items (✅) và failed items (❌) với suggestion
- **SectionEditor**: Edit từng section riêng biệt, confirm diff trước khi save
- **ExportPanel**: Download DOCX / PDF buttons

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
```

### Bước 3: Context Assembly
- Top-5 chunks → format thành `<source>` tags
- Confidence score từ cosine similarity: > 0.8 = high, 0.6-0.8 = medium, < 0.6 = low (→ cảnh báo GV)

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
                   └── Storage (DOCX/PDF)
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
GEMINI_API_KEY=           # fallback
LANGCHAIN_TRACING_V2=true # LangSmith monitoring
LANGCHAIN_API_KEY=
```

---

## 8. Roadmap MVP — 6 Tuần

### Phase 1 (Tuần 1-2): Foundation
- [ ] Setup Supabase: schema, RLS, pgvector extension
- [ ] Setup FastAPI: project structure, auth middleware, async patterns
- [ ] Build RAG pipeline: ingest 2-3 môn mẫu (Toán, Văn, Lịch sử)
- [ ] Build Generator Agent: prompt engineering, JSON schema output
- [ ] Unit test: Generator với 10 bài mẫu

### Phase 2 (Tuần 3): Multi-Agent Core
- [ ] Integrate LangGraph: state machine cho pipeline
- [ ] Build Critique Agent + Compliance Checker Agent
- [ ] Implement iteration loop (max 2 vòng)
- [ ] Build Formatter Agent: python-docx template rendering
- [ ] Integration test: end-to-end pipeline với 20 bài test

### Phase 3 (Tuần 4): API & Realtime
- [ ] Expose all FastAPI endpoints
- [ ] Implement WebSocket progress streaming
- [ ] Task queue (async background tasks)
- [ ] Export to DOCX/PDF + Supabase Storage upload
- [ ] API testing (pytest + httpx)

### Phase 4 (Tuần 5): Frontend
- [ ] Next.js setup, Supabase Auth integration
- [ ] GenerateForm + ProgressTracker (WebSocket)
- [ ] LessonPlanPreview + ComplianceReport UI
- [ ] SectionEditor + ExportPanel
- [ ] Analytics dashboard (Tổ trưởng)

### Phase 5 (Tuần 6): Polish & Launch
- [ ] End-to-end testing với GV thật (5-10 người)
- [ ] Performance optimization (response time target < 3 phút)
- [ ] Eval Metrics dashboard setup
- [ ] Deploy to production (Vercel + Railway)
- [ ] Monitoring: LangSmith traces + Supabase logs

---

## 9. Eval & Quality Assurance

### Automated Eval Suite (chạy sau mỗi generate)
```python
def evaluate_lesson_plan(plan: LessonPlanJSON) -> EvalReport:
    results = {}

    # 1. Template Adherence (rule-based)
    results["template"] = check_required_headings(plan)

    # 2. RAG Accuracy (spot check)
    results["rag_accuracy"] = verify_facts_against_rag(plan, plan.rag_sources)

    # 3. Section Coherence (embedding similarity)
    obj_embedding = embed(plan.metadata.objectives)
    activity_embeddings = [embed(s.content) for s in plan.sections.values()]
    results["coherence"] = cosine_similarity(obj_embedding, mean(activity_embeddings))

    # 4. Duration Balance
    results["duration"] = check_duration_sum(plan)  # phải = 45 phút

    return EvalReport(**results)
```

### Golden Test Set
- 50 giáo án mẫu chuẩn (do tổ trưởng cung cấp)
- Chạy regression test mỗi khi thay đổi prompt
- Target: không được giảm > 2% so với baseline

---

## 10. Monitoring & Observability

| Tool | Mục đích |
|---|---|
| **LangSmith** | Trace từng bước agent, latency, token usage |
| **Supabase Dashboard** | DB query performance, Auth logs |
| **Sentry** | Error tracking (FE + BE) |
| **Custom Analytics** | Compliance pass rate, avg generation time, edit frequency |

### Alert Thresholds
- Generation time > 4 phút → alert
- Compliance pass rate < 70% trong 24h → alert
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
> **Q4**: Compliance Checker hoàn toàn bằng LLM hay hybrid rule-based?
> → Đề xuất **hybrid**: rule-based cho heading check (nhanh, chính xác), LLM cho content quality check.