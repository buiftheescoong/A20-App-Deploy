# 2-DAY VIBE CODE SPRINT — Soạn Giáo Án Thông Minh

> **Team**: 3 người | **Thời gian**: 2 ngày (Ngày 1 + Ngày 2) | **Mode**: Vibe coding với AI tools
> **Mục tiêu**: Working demo end-to-end có thể show, không phải production-ready

---

## Đánh giá khối lượng công việc

### Plan gốc (6 tuần) → 2 ngày: phải cắt thông minh

| Feature | Plan gốc | Sprint 2 ngày | Lý do |
|---|---|---|---|
| Auth (login/signup) | ✅ Full | ✅ Giữ | Tiny effort với Supabase Auth |
| DB Schema + RLS | ✅ Full | ✅ Giữ (simplified) | Cần ngay từ đầu |
| RAG pipeline thật (SGK) | ✅ Full | ⚡ Mock data (3-5 tài liệu sample) | Ingest SGK đầy đủ mất cả ngày |
| Generator Agent | ✅ Full | ✅ Giữ | Core feature |
| Critique Agent | ✅ Full | ❌ Bỏ | Redundant với Compliance khi time-box |
| Compliance Checker | ✅ Full | ✅ Giữ (simplified: rule-based + 1 LLM call) | Core feature |
| Editor Agent | ✅ Full | ⚡ Basic (free-text edit prompt only) | Full editor quá phức tạp |
| DOCX Export | ✅ Full | ✅ Giữ | Core output |
| PDF Export | ✅ Full | ❌ Bỏ → DOCX only | python-docx đủ dùng |
| WebSocket realtime | ✅ Full | ⚡ Polling (3s interval) | WebSocket setup mất thời gian |
| Frontend: 9 pages | ✅ Full | ⚡ 5 pages cốt lõi | Cắt analytics + edit page riêng |
| Analytics dashboard | ✅ Full | ❌ Bỏ | Nice-to-have, không có time |
| Monitoring (LangSmith) | ✅ Full | ⚡ Console log only | Setup sau |
| Multi-model fallback | ✅ Full | ❌ Bỏ (1 LLM duy nhất) | Đơn giản hóa |
| 5E + VNEN + 3-phase | ✅ 3 models | ⚡ 5E + 3-phase (bỏ VNEN) | VNEN ít dùng nhất |

---

## MVP Scope — 2 ngày

### ✅ Must-have (Demo được)
1. **Auth**: Đăng nhập / Đăng ký (Supabase Auth)
2. **Generate**: Form nhập → AI pipeline → Hiển thị giáo án → Download DOCX
3. **Dashboard**: Danh sách giáo án của mình
4. **Compliance Check**: Upload giáo án có sẵn → trả kết quả pass/fail + lỗi cụ thể
5. **Basic Edit**: Nhập yêu cầu sửa → AI modify section cụ thể

### ⚡ Simplified (Vẫn làm nhưng stripped-down)
- RAG: Dùng 3–5 tài liệu mẫu thay vì toàn bộ SGK
- Polling thay WebSocket
- Compliance: Rule-based heading check + 1 LLM call
- Iteration loop: Tối đa 1 vòng (thay vì 2) để giảm latency

### ❌ Bỏ khỏi sprint này
- PDF export, Analytics dashboard, VNEN model
- Critique Agent, Multi-model fallback, LangSmith
- Full RAG ingestion SGK

---

## Architecture Sprint (Simplified)

```
[Next.js Frontend]
     │
     │ HTTP REST (polling /api/status)
     ▼
[FastAPI Backend]
  ├─ POST /api/generate  → background task → agent pipeline
  ├─ GET  /api/status/{id}
  ├─ POST /api/check
  ├─ POST /api/edit
  ├─ GET  /api/lesson-plans
  └─ POST /api/export/{id}  → return DOCX download URL
     │
     ├─► [LangGraph Pipeline]
     │    intake → rag_mock → generator → compliance → formatter
     │
     └─► [Supabase]
          ├── PostgreSQL (lesson_plans, evaluations, users)
          └── Storage (DOCX files)
```

---

## Tech Stack Sprint (Giữ nguyên, không thay đổi)

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + TailwindCSS |
| Backend | FastAPI (Python 3.11+) |
| DB + Auth + Storage | Supabase |
| AI Pipeline | LangGraph + OpenAI GPT-4o |
| Document Export | python-docx |
| Deployment | Vercel (FE) + Railway (BE) — ngay cuối ngày 2 |

---

## Timeline 2 ngày

### 🌅 NGÀY 1 — "Build the engine"

| Thời gian | Milestone |
|---|---|
| 8:00 - 9:00 | **Kickoff**: Setup repo, Supabase project, env vars, cấu trúc folder. Sync API contract + JSON schema (3 người cùng đồng ý) |
| 9:00 - 13:00 | **Sprint sáng**: Mỗi người làm domain riêng (xem team-tasks.md) |
| 13:00 - 14:00 | **Lunch sync**: Demo nhanh từng người. Check API contract còn đúng không. Fix blocker |
| 14:00 - 18:00 | **Sprint chiều**: Tiếp tục. Person C bắt đầu gọi BE real API |
| 18:00 - 19:00 | **Integration checkpoint**: FE gọi được `/api/generate` và nhận task_id. DB có record. Agent chạy được |

### 🌆 NGÀY 2 — "Polish & connect"

| Thời gian | Milestone |
|---|---|
| 8:00 - 8:30 | **Standup**: Tình trạng từng người, blocker cần giải quyết |
| 8:30 - 12:00 | **Sprint sáng**: Finish features còn dang dở, wire up toàn bộ flow |
| 12:00 - 13:00 | **Full E2E test**: Chạy thử flow generate từ đầu đến cuối. Ghi nhận bugs |
| 13:00 - 14:00 | **Lunch + bug fixes** |
| 14:00 - 16:00 | **Polish UI**, fix edge cases, thêm loading states, error messages |
| 16:00 - 17:00 | **Deploy**: Vercel (FE) + Railway (BE) lên production |
| 17:00 - 18:00 | **Demo prep**: Chuẩn bị script demo, test lần cuối trên production |

---

## API Contract (Đồng ý trước khi code — Ngày 1, 8:00-9:00)

### POST /api/generate
```json
Request:
{
  "subject": "Toán",
  "grade": "10",
  "topic": "Hàm số bậc nhất",
  "objectives": ["HS nhận diện được...", "HS vẽ được..."],
  "teaching_model": "5E"
}

Response:
{ "task_id": "uuid", "status": "pending" }
```

### GET /api/status/{task_id}
```json
Response:
{
  "task_id": "uuid",
  "status": "generating" | "completed" | "failed",
  "progress_step": "rag_done" | "draft_ready" | "compliance_done" | "export_done",
  "lesson_plan_id": "uuid" | null,
  "error": null | "string"
}
```

### GET /api/lesson-plans/{id}
```json
Response:
{
  "id": "uuid",
  "subject": "Toán",
  "grade": "10",
  "topic": "...",
  "teaching_model": "5E",
  "content_json": { ...LessonPlanJSON },
  "compliance_status": "PASSED" | "FAILED" | "PENDING",
  "docx_url": "https://...",
  "status": "completed",
  "created_at": "..."
}
```

### Lesson Plan JSON Schema (chuẩn dùng chung)
```json
{
  "metadata": {
    "subject": "Toán",
    "grade": "10",
    "topic": "Hàm số bậc nhất",
    "teaching_model": "5E",
    "duration_minutes": 45,
    "objectives": ["..."],
    "competencies": ["Tư duy toán học", "Giao tiếp"],
    "materials": ["SGK", "Bảng phụ"]
  },
  "sections": {
    "engage":    { "title": "Khởi động", "content": "...", "duration": 5,  "low_confidence": false },
    "explore":   { "title": "Khám phá",  "content": "...", "duration": 10, "low_confidence": false },
    "explain":   { "title": "Giải thích","content": "...", "duration": 15, "low_confidence": false },
    "elaborate": { "title": "Vận dụng",  "content": "...", "duration": 10, "low_confidence": false },
    "evaluate":  { "title": "Đánh giá",  "content": "...", "duration": 5,  "low_confidence": false }
  },
  "rag_sources": ["mock_toan_10_ham_so_bac_nhat"],
  "compliance": {
    "status": "PASSED",
    "errors": []
  }
}
```

---

## DB Schema Sprint (Simplified — 3 bảng cốt lõi)

```sql
-- Chạy trong Supabase SQL Editor ngay ngày 1

CREATE TABLE lesson_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject          TEXT NOT NULL,
  grade            TEXT NOT NULL,
  topic            TEXT NOT NULL,
  teaching_model   TEXT NOT NULL DEFAULT '5E',
  objectives       TEXT[] NOT NULL DEFAULT '{}',
  content_json     JSONB,
  status           TEXT DEFAULT 'pending',  -- pending|generating|completed|failed
  task_id          TEXT,                     -- background task tracking
  compliance_status TEXT DEFAULT 'PENDING',
  docx_url         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id  UUID REFERENCES lesson_plans(id) ON DELETE CASCADE,
  is_passed       BOOLEAN NOT NULL,
  score           NUMERIC(3,2),
  error_details   JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON lesson_plans FOR ALL USING (user_id = auth.uid());
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_eval" ON evaluations FOR SELECT
  USING (lesson_plan_id IN (SELECT id FROM lesson_plans WHERE user_id = auth.uid()));
```

---

## Project Structure

```
A20-App-003/
├── backend/                    ← Person A + B
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py           ← env vars
│   │   ├── database.py         ← Supabase client
│   │   ├── api/
│   │   │   ├── generate.py     ← Person A
│   │   │   ├── check.py        ← Person A
│   │   │   ├── edit.py         ← Person A
│   │   │   └── lesson_plans.py ← Person B
│   │   ├── agents/             ← Person A owns
│   │   │   ├── pipeline.py     ← LangGraph graph
│   │   │   ├── generator.py
│   │   │   ├── compliance.py
│   │   │   ├── formatter.py
│   │   │   └── rag.py
│   │   └── schemas/            ← Shared types (Person B sets up)
│   │       └── lesson_plan.py
│   ├── scripts/
│   │   └── ingest_mock_rag.py  ← Person B
│   ├── requirements.txt
│   └── .env
│
├── frontend/                   ← Person C owns
│   ├── app/
│   │   ├── page.tsx            ← Landing
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── generate/
│   │   │   ├── page.tsx        ← Generate form
│   │   │   └── [task_id]/page.tsx ← Progress + result
│   │   └── check/page.tsx      ← Compliance checker
│   ├── components/
│   │   ├── GenerateForm.tsx
│   │   ├── ProgressTracker.tsx
│   │   ├── LessonPlanPreview.tsx
│   │   ├── ComplianceReport.tsx
│   │   └── ExportButton.tsx
│   ├── lib/
│   │   ├── api.ts              ← API client (gọi backend)
│   │   └── supabase.ts         ← Supabase client (auth only)
│   └── .env.local
│
├── PRD Soạn giáo án thông minh.md
├── spec.md
├── plan.md
├── 2day-sprint-plan.md         ← File này
└── team-tasks.md               ← Phân công chi tiết
```

---

## Rủi ro & Mitigation trong 2 ngày

| Rủi ro | Khả năng | Mitigation |
|---|---|---|
| LangGraph pipeline chậm > 5 phút | Cao | Giảm max_iter về 1, timeout 3 phút → trả draft |
| FE và BE API contract không khớp | Cao | **Đồng ý schema trước 9:00 ngày 1, không thay đổi** |
| Supabase RLS block request | Trung bình | Test với service_role_key trước, thêm RLS sau |
| python-docx output sai format | Trung bình | Có template .docx mẫu cứng ngay từ đầu |
| Deploy Railway fail | Thấp | Có fallback: chạy BE local + ngrok |
