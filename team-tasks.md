# TEAM TASKS — 3 Người Vibe Code Song Song

> **Nguyên tắc không conflict**: Mỗi người owns 1 layer độc lập. Interface (API contract + JSON schema) được đồng ý trước. Merge chỉ xảy ra ở checkpoint.

---

## Phân công tổng quan

| | **Person A** | **Person B** | **Person C** |
|---|---|---|---|
| **Role** | AI Pipeline Lead | Backend Foundation + DB | Frontend Lead |
| **Domain** | `backend/app/agents/` + API endpoints generate/clarification/check/edit | `backend/app/database/` + `schemas/` + RAG data + `lesson_plans` API | `frontend/` toàn bộ |
| **Primary branch** | `feat/agent-pipeline` | `feat/backend-foundation` | `feat/frontend` |
| **Merge to main** | Checkpoint ngày 1 18:00 + ngày 2 12:00 | Checkpoint ngày 1 18:00 + ngày 2 12:00 | Cùng lúc |

---

## NGÀY 1

### 08:00–09:00 — Kickoff chung (3 người)

> **Không ai code trong giờ này. Đây là session thiết kế cùng nhau.**

- [ ] Tạo GitHub repo, tạo 3 branch, setup `.env.example`
- [ ] **Person B** chạy SQL tạo schema Supabase (xem `2day-sprint-plan.md` phần DB Schema) — bao gồm bảng `clarification_sessions`
- [ ] **Person B** upload `blank_template.docx` lên Supabase Storage bucket `templates/`
- [ ] **Đồng ý API Contract** — đọc kỹ phần API trong `2day-sprint-plan.md`, không ai được thay đổi sau 9:00
- [ ] **Đồng ý LessonPlanJSON Schema** — copy vào `backend/app/schemas/lesson_plan.py` ngay
- [ ] Setup project structure: tạo đủ thư mục trống, `__init__.py`, placeholder files

---

### 09:00–13:00 — Sprint Sáng Ngày 1

---

#### 🤖 PERSON A — AI Pipeline

**Goal buổi sáng**: LangGraph pipeline chạy được end-to-end, từ input → JSON output (chưa cần export). Bao gồm scope check và clarification trigger.

**Tasks theo thứ tự**:

```
[ ] 09:00 Setup FastAPI app (main.py, config.py, CORS, health endpoint)
[ ] 09:30 Implement LangGraph state + nodes cơ bản (pipeline.py)
     - State: LessonPlanState (TypedDict) — bao gồm is_out_of_scope, low_confidence,
              clarification_questions, clarification_answers, retry_count, is_blank_template
     - Nodes: intake_node, rag_node, clarification_node, generator_node, quality_checker_node,
              retry_fallback_node, formatter_node
     - Edges: kết nối thành graph, max_iter = 1
[ ] 09:45 Implement intake_node (bao gồm scope check)
     - Parse input
     - Kiểm tra: có liên quan đến soạn giáo án không?
     - Nếu out_of_scope → trả thông báo từ chối, dừng pipeline
[ ] 10:30 Implement generator_node
     - System prompt template GDPT 2018 cứng vào code
     - Output: JSON schema chuẩn
     - Model: GPT-4o (gọi trực tiếp openai SDK)
[ ] 11:30 Implement quality_checker_node (gộp critique + compliance)
     - STEP 1 Rule-based: check đủ heading, mục tiêu, thiết bị, sections, 4 cột hoạt động
     - STEP 2 LLM call: kiểm tra chất lượng nội dung
     - Output: { passed: bool, errors: [{section, issue, suggestion}] }
[ ] 12:30 Test pipeline chạy thủ công với 1 bài mẫu (python script test)
```

**Không làm trong buổi sáng**: clarification_node, retry_fallback_node, formatter, API endpoint

---

#### 🗄️ PERSON B — Backend Foundation

**Goal buổi sáng**: Supabase sẵn sàng, API CRUD chạy, mock RAG data có sẵn, blank_template.docx upload xong

**Tasks theo thứ tự**:

```
[ ] 09:00 Verify Supabase schema đã tạo đúng (test với Supabase dashboard)
          -- Bao gồm bảng clarification_sessions
[ ] 09:15 Upload blank_template.docx lên Supabase Storage bucket "templates/"
          -- Tạo file DOCX với đủ heading GDPT 2018 nhưng nội dung trống
[ ] 09:30 Setup Supabase Python client (database.py)
     - supabase-py client
     - Helper: get_lesson_plan(id), update_lesson_plan_status(id, status, content)
     - Helper: get_blank_template_url() → trả URL của blank_template.docx
[ ] 10:00 Tạo Pydantic schemas (schemas/lesson_plan.py)
     - GenerateRequest, LessonPlanResponse, QualityResult
     - ClarificationSession (questions + answers)
     - LessonPlanJSON (nested Pydantic model)
[ ] 10:45 Implement API: GET /api/lesson-plans + GET /api/lesson-plans/{id}
     - Auth: đọc token từ header, verify với Supabase
     - Filter theo user_id
     - Response bao gồm is_blank_template flag
[ ] 11:15 Implement RAG mock data
     - Tạo 5 document mẫu (Toán 10, Văn 10, Lịch sử 10, Toán 6, Vật lý 11)
     - Mỗi doc: 3-5 đoạn text ngắn về nội dung bài học mẫu
     - script ingest_mock_rag.py: embed + insert vào Supabase pgvector
[ ] 12:00 Implement rag.py (retrieval function)
     - Input: subject, grade, topic
     - Query pgvector, return top-3 chunks + similarity scores
     - Nếu top score < 0.6 → set low_confidence=True, return empty chunks
     - Sinh clarification_questions khi low_confidence
[ ] 12:30 Chạy ingest script, verify data trong Supabase
```

**Không làm trong buổi sáng**: generate endpoint, export, edit endpoint

---

#### 🎨 PERSON C — Frontend

**Goal buổi sáng**: Auth hoạt động, layout xong, GenerateForm UI hoàn chỉnh (chưa cần gọi real API)

**Tasks theo thứ tự**:

```
[ ] 09:00 Setup Next.js 14 project
     - npx create-next-app frontend --typescript --app --tailwind
     - Install: @supabase/supabase-js, @supabase/auth-helpers-nextjs
[ ] 09:30 Setup Supabase Auth
     - lib/supabase.ts: createBrowserClient
     - Middleware: protect routes (require login)
[ ] 10:00 Build layout + Navigation component
     - Header: Logo + user info + logout
     - Sidebar hoặc top nav: Dashboard / Tạo giáo án / Kiểm tra
[ ] 10:30 Build /login page
     - Email + password form
     - Supabase signInWithPassword
     - Redirect sau login → /dashboard
[ ] 11:00 Build GenerateForm component (key UI)
     - Select: Môn học (Toán/Văn/Lý/Hóa/Sử/Địa...)
     - Select: Lớp (6,7,8,9,10,11,12)
     - Input: Tên bài học
     - Textarea: Mục tiêu bài học (multi-line)
     - Radio: Mô hình dạy học (5E / 3-phase)
     - Button: "Tạo giáo án"
[ ] 11:30 Build ClarificationDialog component (UI hỏi bổ sung)
     - Hiển thị khi status = "clarifying"
     - List câu hỏi với textarea cho từng câu trả lời
     - Button "Gửi và tiếp tục"
     - Note: chưa cần handle, chỉ cần UI đẹp
[ ] 12:00 Build /generate page + /dashboard (mock data)
```

**Không làm trong buổi sáng**: API calls thật, progress tracker, lesson plan preview, BlankTemplateAlert

---

### 13:00–14:00 — Lunch Sync Ngày 1

**Demo nhanh 5 phút/người**:
- Person A: Chạy agent pipeline bằng script Python test — test cả case low_confidence trigger
- Person B: Show Supabase có data, blank_template.docx trong Storage, gọi GET /api/lesson-plans
- Person C: Show login + GenerateForm + ClarificationDialog UI trên browser

**Kiểm tra**: API contract còn khớp không? Clarification flow có điểm nào mờ không? Note blocker.

---

### 14:00–18:00 — Sprint Chiều Ngày 1

---

#### 🤖 PERSON A — chiều

```
[ ] 14:00 Implement clarification_node
     - Khi rag_node set low_confidence=True → dừng pipeline
     - Lưu questions vào bảng clarification_sessions
     - Pipeline PAUSE, chờ GV trả lời (poll /api/clarification/{task_id})
     - Khi GV trả lời → pipeline resume với clarification_answers trong state
[ ] 14:45 Implement retry_fallback_node
     - Wrapper LLM call với tenacity: retry 2 lần, wait 5s và 10s
     - Nếu vẫn fail → switch sang fallback model (Gemini hoặc GPT-4o-mini)
     - Nếu tất cả fail → set is_blank_template=True
[ ] 15:15 Implement formatter_node
     - Nếu is_blank_template=False: JSON → DOCX (python-docx)
     - Nếu is_blank_template=True: lấy URL blank_template.docx từ Supabase Storage
     - Cả 2 trường hợp đều update docx_url trong DB
[ ] 16:00 Implement POST /api/generate endpoint
     - Nhận GenerateRequest
     - Insert lesson_plan record (status=pending)
     - Fire background task
     - Return { task_id, status: "pending" }
[ ] 16:30 Implement GET /api/status/{task_id}
     - Return status + progress_step + clarification_needed + is_blank_template
[ ] 16:45 Implement GET + POST /api/clarification/{task_id}
     - GET: trả questions từ clarification_sessions
     - POST: lưu answers, resume pipeline
[ ] 17:15 Implement POST /api/check + POST /api/export/{id}
[ ] 17:45 Test toàn bộ flow: generate → clarification → resume → quality check → export
```

---

#### 🗄️ PERSON B — chiều

```
[ ] 14:00 Implement GET /api/lesson-plans (phân trang)
[ ] 14:30 Setup CORS + Auth middleware cho FastAPI
     - Verify Supabase JWT từ Authorization header
     - Inject user_id vào request state
[ ] 15:00 Implement POST /api/edit endpoint
     - Nhận: { lesson_plan_id, section_id, edit_prompt }
     - Gọi GPT-4o: "Chỉ sửa phần {section_id}, giữ nguyên format JSON"
     - Update content_json trong DB (chỉ phần section đó)
     - Return updated lesson plan
[ ] 16:00 Implement DELETE /api/lesson-plans/{id}
[ ] 16:30 Test auth middleware với Postman (dùng Supabase JWT thật)
[ ] 17:00 Viết .env.example đầy đủ (bao gồm GEMINI_API_KEY)
[ ] 17:30 Đảm bảo tất cả BE endpoints trả đúng schema + is_blank_template flag
```

---

#### 🎨 PERSON C — chiều

```
[ ] 14:00 Implement lib/api.ts
     - generateLessonPlan(data) → POST /api/generate
     - getStatus(taskId) → GET /api/status/{taskId}
     - getClarificationQuestions(taskId) → GET /api/clarification/{taskId}
     - submitClarificationAnswers(taskId, answers) → POST /api/clarification/{taskId}
     - getLessonPlan(id) → GET /api/lesson-plans/{id}
     - checkQuality(lessonPlanId) → POST /api/check
     - exportDocx(id) → POST /api/export/{id}
     - listLessonPlans() → GET /api/lesson-plans
[ ] 14:30 Wire GenerateForm → API + redirect to /generate/{task_id}
[ ] 15:00 Build /generate/[task_id] page — Progress Tracker
     - Poll getStatus() mỗi 3 giây
     - Stepper UI: Đang phân tích... → Tra cứu SGK... → [Cần bổ sung?] → Soạn thảo... → Kiểm tra... → Hoàn thành
     - Khi status=clarifying → redirect đến /generate/{task_id}/clarify
     - Khi status=completed → load lesson plan
[ ] 15:30 Build /generate/[task_id]/clarify page
     - Gọi getClarificationQuestions()
     - Render form Q&A (mỗi câu hỏi 1 textarea)
     - Submit → submitClarificationAnswers() → redirect về progress page
[ ] 16:15 Build LessonPlanPreview
     - Render sections thành blocks đẹp
     - Show compliance badge (PASSED/FAILED)
     - Show error list nếu FAILED
[ ] 16:45 Build BlankTemplateAlert component
     - Hiển thị khi is_blank_template=True
     - Thông báo: "Hệ thống không thể tạo nội dung tự động lần này. Template trắng đã được chuẩn bị để bạn tự điền."
     - Nút "Tải template về"
[ ] 17:15 Build ExportButton + wire /dashboard
```

---

### 18:00 — Integration Checkpoint Ngày 1

**Test integration**:
- [ ] FE submit form → gọi được BE (không CORS error)
- [ ] BE trả task_id, FE poll được status
- [ ] Test Happy Path: Agent chạy → DB update → FE hiện completed
- [ ] Test Clarification Path: status=clarifying → FE redirect → user điền → resume → completed
- [ ] FE render được lesson plan JSON

**Nếu tất cả xanh → Ngày 1 thành công!** Có thể push code và nghỉ.

---

## NGÀY 2

### 08:30 — Standup (15 phút)

Mỗi người trả lời:
1. Đã làm được gì tối qua (nếu có)/hiện tại còn gì?
2. Hôm nay ưu tiên gì?
3. Có blocker gì không?

---

### 08:30–12:00 — Sprint Sáng Ngày 2

---

#### 🤖 PERSON A — sáng ngày 2

```
[ ] 08:30 Fix bugs từ integration checkpoint
[ ] 09:00 Harden generator prompt
     - Test với 5 môn khác nhau
     - Ensure output luôn đúng JSON schema
     - Test scope check: hỏi về thời tiết → phải từ chối
[ ] 09:30 Test Failure Path end-to-end
     - Simulate API fail → verify retry logic hoạt động
     - Verify blank template được trả về đúng
     - Verify is_blank_template=True trong DB + API response
[ ] 10:00 Add error handling toàn bộ pipeline
     - Try/catch mọi LLM call
     - Nếu lỗi → update DB status=failed, trả error message
     - Timeout: 4 phút → cancel task → trả blank template
[ ] 10:30 Implement quality check cho file upload (nếu còn time)
     - POST /api/check với file DOCX
     - Parse text từ file → chạy quality check
[ ] 11:00 Smoke test toàn bộ API với 3 bài học khác nhau + 1 case out-of-scope
```

---

#### 🗄️ PERSON B — sáng ngày 2

```
[ ] 08:30 Fix bugs từ integration checkpoint
[ ] 09:00 Thêm mock RAG data cho thêm 3 môn
     - Ưu tiên: Toán, Văn, Lý cho lớp 10 và lớp 6
     - Test case low-confidence: tạo topic rất obscure → verify pipeline hỏi lại
[ ] 09:30 Setup Railway deployment
     - Tạo Railway project, link GitHub repo
     - Set environment variables (bao gồm GEMINI_API_KEY cho fallback)
     - Deploy backend
     - Verify health endpoint
[ ] 10:30 Test toàn bộ backend trên Railway URL
[ ] 11:00 Cập nhật FRONTEND .env.local trỏ vào Railway URL thật
[ ] 11:30 Hỗ trợ Person A nếu cần (debug pipeline)
```

---

#### 🎨 PERSON C — sáng ngày 2

```
[ ] 08:30 Fix bugs từ integration checkpoint
[ ] 09:00 Build /check page — Standalone Quality Checker
     - Form: nhập lesson_plan_id HOẶC upload file (nếu BE hỗ trợ)
     - Submit → POST /api/check
     - Show QualityReport đẹp (passed items ✅, failed items ❌ với suggestion)
[ ] 09:45 Polish ClarificationDialog
     - UX rõ ràng: giải thích tại sao cần thêm thông tin
     - Loading state khi submit
     - Disable form sau khi submit
[ ] 10:15 Polish BlankTemplateAlert
     - Rõ ràng về lý do fail (show error message từ BE)
     - Hướng dẫn cách dùng template trắng
     - Nút retry (gọi lại generate)
[ ] 10:45 Polish UI toàn bộ
     - Consistent color scheme, typography
     - Loading skeletons
     - Empty states cho dashboard
     - Out-of-scope response hiển thị thân thiện
[ ] 11:30 Mobile responsive check (basic)
```

---

### 12:00–13:00 — E2E Test + Bug Fix

**Flow test chung (3 người cùng test)**:

```
Flow 1 — Happy Path:
  1. Đăng ký tài khoản mới → Đăng nhập
  2. Tạo giáo án: Toán lớp 10, bài "Hàm số bậc nhất", mô hình 5E
  3. Xem progress → thấy "Hoàn thành"
  4. Xem giáo án → Download DOCX → mở ra check format

Flow 2 — Clarification Path:
  5. Tạo giáo án với topic mơ hồ (RAG không tìm được)
  6. Thấy status "clarifying" → vào trang clarify → điền câu trả lời
  7. Submit → tiếp tục generate → xem kết quả

Flow 3 — Failure / Blank Template Path:
  8. Simulate timeout hoặc max iteration → xem BlankTemplateAlert
  9. Download blank template → mở DOCX → check format đúng chuẩn

Flow 4 — Quality Check:
  10. Vào /check → upload giáo án → xem kết quả pass/fail với chi tiết

Flow 5 — Out of Scope:
  11. Thử hỏi: "Cho mình biết thời tiết hôm nay?" → xem thông báo từ chối
```

**Ghi nhận bugs theo mức độ**:
- 🔴 Blocker: Phải fix trước 14:00
- 🟡 Major: Fix trước 16:00
- 🟢 Minor: Fix nếu còn time

---

### 13:00–14:00 — Lunch + Fix Blocker

---

### 14:00–16:00 — Polish & Final Fixes

**Person A**: Fix remaining backend bugs, verify retry/fallback hoạt động đúng, check blank template DOCX format
**Person B**: Monitor Railway deploy, fix infrastructure issues nếu có
**Person C**: UI polish, thêm animations nhỏ, fix responsive

---

### 16:00–17:00 — Deploy Production

```
[ ] Person B: Verify Railway (BE) đang chạy ổn
[ ] Person C: Deploy Vercel (FE)
    - vercel --prod từ frontend/ folder
    - Set env vars trong Vercel dashboard
[ ] Test production URL (không phải localhost)
[ ] Test toàn bộ 5 flow trên production
```

---

### 17:00–18:00 — Demo Prep

```
[ ] Tạo 2-3 tài khoản demo (GV + Tổ trưởng)
[ ] Pre-generate 2 giáo án mẫu đẹp (Toán + Văn)
[ ] Chuẩn bị script demo 5 phút:
    1. Show dashboard có sẵn giáo án (30s)
    2. Tạo giáo án mới live — Happy Path (2 phút)
    3. Demo Clarification Path: topic mơ hồ → hỏi lại (1 phút)
    4. Show Quality Check (30s)
    5. Download DOCX (30s)
[ ] Backup: chụp screenshot/record video phòng demo fail
```

---

## Interface chuẩn giữa các người (không được thay đổi sau 09:00 ngày 1)

### Python Types (Person A & B dùng chung)

```python
# backend/app/schemas/lesson_plan.py — Person B tạo, Person A dùng

from pydantic import BaseModel
from typing import Optional, Literal

class SectionContent(BaseModel):
    title: str
    content: str
    duration: int  # phút

class LessonSections5E(BaseModel):
    engage: SectionContent
    explore: SectionContent
    explain: SectionContent
    elaborate: SectionContent
    evaluate: SectionContent

class LessonMetadata(BaseModel):
    subject: str
    grade: str
    topic: str
    teaching_model: Literal["5E", "3-phase"]
    duration_minutes: int = 45
    objectives: list[str]
    competencies: list[str] = []
    materials: list[str] = []

class QualityResult(BaseModel):
    status: Literal["PASSED", "FAILED"]
    errors: list[dict] = []  # [{section, issue, suggestion}]

class ClarificationSession(BaseModel):
    task_id: str
    questions: list[str]
    answers: list[dict] = []  # [{question, answer}]
    status: Literal["pending", "answered"] = "pending"

class LessonPlanJSON(BaseModel):
    metadata: LessonMetadata
    sections: LessonSections5E
    rag_sources: list[str] = []
    compliance: QualityResult
    clarification_needed: bool = False

class GenerateRequest(BaseModel):
    subject: str
    grade: str
    topic: str
    objectives: list[str]
    teaching_model: Literal["5E", "3-phase"] = "5E"
```

### API Response Format (Person B & C dùng chung)

```typescript
// frontend/lib/types.ts — Person C tạo

interface GenerateResponse {
  task_id: string;
  status: "pending";
}

interface StatusResponse {
  task_id: string;
  status: "pending" | "clarifying" | "generating" | "retrying" | "completed" | "failed";
  progress_step?: "intake_done" | "rag_done" | "clarification_needed" | "draft_ready"
               | "quality_done" | "export_done" | "blank_template_ready";
  lesson_plan_id?: string;
  clarification_needed: boolean;
  is_blank_template: boolean;
  error?: string;
}

interface ClarificationResponse {
  task_id: string;
  questions: string[];
}

interface LessonPlanResponse {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teaching_model: "5E" | "3-phase";
  objectives: string[];
  content_json: LessonPlanJSON;
  compliance_status: "PASSED" | "FAILED" | "PENDING";
  docx_url?: string;
  is_blank_template: boolean;
  status: string;
  created_at: string;
}
```

---

## Rules chống conflict

1. **Branch isolation**: Mỗi người chỉ commit vào branch của mình
2. **Shared files**: `schemas/lesson_plan.py` và `lib/types.ts` — Person B và C tạo, notify team trước khi sửa
3. **Không tự ý sửa API contract**: Bất kỳ thay đổi nào phải báo team trong group chat trước
4. **Import từ schemas**: Person A không tự define types, import từ `schemas/` của Person B
5. **Checkpoint merge**: Merge vào `main` chỉ tại checkpoint (18:00 ngày 1 và 12:00 ngày 2)
6. **Conflict rule**: Nếu có conflict khi merge → người merge phải báo người kia review trước khi resolve

---

## Communication

| Kênh | Dùng cho |
|---|---|
| **Group chat** (Zalo/Slack/Discord) | Real-time blocker, API contract changes |
| **GitHub PR comments** | Code review tại checkpoint |
| **Standup ngắn** | 08:00 ngày 1, 08:30 ngày 2, 13:00 ngày 2 |
| **Pair vibe code** | Khi 1 người bị stuck > 30 phút → call ngay |

---

## Checklist Done (Definition of Done cho Sprint)

### MVP đạt khi:
- [ ] GV có thể đăng ký, đăng nhập
- [ ] GV tạo được giáo án 5E cho ít nhất 3 môn khác nhau (Happy Path)
- [ ] Khi thông tin thiếu → hệ thống hỏi lại GV và tiếp tục sau khi nhận câu trả lời (Clarification Path)
- [ ] Khi system fail hoàn toàn → GV nhận được template DOCX trắng đúng chuẩn GDPT 2018 (Failure Path)
- [ ] Hệ thống từ chối yêu cầu không liên quan đến giáo án một cách thân thiện (Out-of-scope)
- [ ] Giáo án hiển thị đầy đủ trên UI
- [ ] Download DOCX mở ra không bị lỗi format
- [ ] Quality Checker trả về kết quả PASSED/FAILED với lý do cụ thể
- [ ] Toàn bộ flow chạy được trên production URL (không phải localhost)
- [ ] Response time < 5 phút cho generate
