# TEAM TASKS — 3 Người Vibe Code Song Song

> **Nguyên tắc không conflict**: Mỗi người owns 1 layer độc lập. Interface (API contract + JSON schema) được đồng ý trước. Merge chỉ xảy ra ở checkpoint.

---

## Phân công tổng quan

| | **Person A** | **Person B** | **Person C** |
|---|---|---|---|
| **Role** | AI Pipeline Lead | Backend Foundation + DB | Frontend Lead |
| **Domain** | `backend/app/agents/` + API endpoints generate/check/edit | `backend/app/database/` + `schemas/` + RAG data + `lesson_plans` API | `frontend/` toàn bộ |
| **Primary branch** | `feat/agent-pipeline` | `feat/backend-foundation` | `feat/frontend` |
| **Merge to main** | Checkpoint ngày 1 18:00 + ngày 2 12:00 | Checkpoint ngày 1 18:00 + ngày 2 12:00 | Cùng lúc |

---

## NGÀY 1

### 08:00–09:00 — Kickoff chung (3 người)

> **Không ai code trong giờ này. Đây là session thiết kế cùng nhau.**

- [ ] Tạo GitHub repo, tạo 3 branch, setup `.env.example`
- [ ] **Person B** chạy SQL tạo schema Supabase (xem `2day-sprint-plan.md` phần DB Schema)
- [ ] **Đồng ý API Contract** — đọc kỹ phần API trong `2day-sprint-plan.md`, không ai được thay đổi sau 9:00
- [ ] **Đồng ý LessonPlanJSON Schema** — copy vào `backend/app/schemas/lesson_plan.py` ngay
- [ ] Setup project structure: tạo đủ thư mục trống, `__init__.py`, placeholder files

---

### 09:00–13:00 — Sprint Sáng Ngày 1

---

#### 🤖 PERSON A — AI Pipeline

**Goal buổi sáng**: LangGraph pipeline chạy được end-to-end, từ input → JSON output (chưa cần export)

**Tasks theo thứ tự**:

```
[ ] 09:00 Setup FastAPI app (main.py, config.py, CORS, health endpoint)
[ ] 09:30 Implement LangGraph state + nodes cơ bản (pipeline.py)
     - State: LessonPlanState (TypedDict)
     - Nodes: intake_node, rag_node, generator_node, compliance_node
     - Edges: kết nối thành graph, max_iter = 1
[ ] 11:00 Implement generator_node
     - System prompt 5E cứng vào code (không config file)
     - Output: JSON schema chuẩn
     - Model: GPT-4o (gọi trực tiếp openai SDK)
[ ] 12:00 Implement compliance_node (simplified)
     - Rule-based: check có đủ 5 section key không (engage/explore/explain/elaborate/evaluate)
     - 1 LLM call: "Kiểm tra mục tiêu có ≥ 2 năng lực không?"
     - Output: { passed: bool, errors: list }
[ ] 12:30 Test pipeline chạy thủ công (python script test, không cần API)
```

**Không làm trong buổi sáng**: formatter, API endpoint, Editor agent

---

#### 🗄️ PERSON B — Backend Foundation

**Goal buổi sáng**: Supabase sẵn sàng, API CRUD chạy, mock RAG data có sẵn

**Tasks theo thứ tự**:

```
[ ] 09:00 Verify Supabase schema đã tạo đúng (test với Supabase dashboard)
[ ] 09:15 Setup Supabase Python client (database.py)
     - supabase-py client
     - Helper functions: get_lesson_plan(id), update_lesson_plan_status(id, status, content)
[ ] 09:45 Tạo Pydantic schemas (schemas/lesson_plan.py)
     - GenerateRequest, LessonPlanResponse, ComplianceResult
     - LessonPlanJSON (nested Pydantic model cho content_json)
[ ] 10:30 Implement API: GET /api/lesson-plans + GET /api/lesson-plans/{id}
     - Auth: đọc token từ header, verify với Supabase
     - Filter theo user_id
[ ] 11:00 Implement RAG mock data
     - Tạo 5 document mẫu (Toán 10, Văn 10, Lịch sử 10, Toán 6, Vật lý 11)
     - Mỗi doc: 3-5 đoạn text ngắn về nội dung bài học mẫu
     - scrip ingest_mock_rag.py: embed + insert vào Supabase pgvector
[ ] 12:00 Implement rag.py (retrieval function)
     - Input: subject, grade, topic
     - Query pgvector, return top-3 chunks
     - Nếu không có kết quả → return empty list (graceful)
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
[ ] 12:00 Build /generate page (layout + form)
     - Import GenerateForm
     - Handle submit → console.log (chưa gọi API)
     - Loading state placeholder
[ ] 12:30 Build /dashboard page (mock data)
     - Table/List với 3-4 row mock
     - Columns: Môn, Lớp, Bài, Trạng thái, Ngày tạo, Actions
```

**Không làm trong buổi sáng**: API calls thật, progress tracker, lesson plan preview

---

### 13:00–14:00 — Lunch Sync Ngày 1

**Demo nhanh 5 phút/người**:
- Person A: Chạy agent pipeline bằng script Python test
- Person B: Show Supabase dashboard có data, gọi GET /api/lesson-plans từ Postman
- Person C: Show trang login + generate form trên browser

**Kiểm tra**: API contract còn khớp không? JSON schema ổn không? Note blocker.

---

### 14:00–18:00 — Sprint Chiều Ngày 1

---

#### 🤖 PERSON A — chiều

```
[ ] 14:00 Implement formatter_node
     - Nhận LessonPlanJSON → python-docx
     - Template: Heading 1 = tên bài, Heading 2 = section, paragraph = content
     - Upload DOCX lên Supabase Storage → return URL
[ ] 15:00 Implement POST /api/generate endpoint
     - Nhận GenerateRequest
     - Insert lesson_plan record (status=pending)
     - Fire background task (FastAPI BackgroundTasks)
     - Return { task_id, status: "pending" }
[ ] 15:30 Implement GET /api/status/{task_id}
     - Query lesson_plans table
     - Return status + progress_step + lesson_plan_id
[ ] 16:00 Implement POST /api/check endpoint
     - Nhận: { lesson_plan_id } hoặc { content_json }
     - Gọi compliance_node
     - Insert vào evaluations table
     - Return ComplianceResult
[ ] 16:30 Implement POST /api/export/{id}
     - Lấy content_json từ DB
     - Gọi formatter_node
     - Return { docx_url }
[ ] 17:00 Test toàn bộ flow: POST /api/generate → poll status → GET lesson-plans/{id}
[ ] 17:30 Fix bugs
```

---

#### 🗄️ PERSON B — chiều

```
[ ] 14:00 Implement GET /api/lesson-plans (phân trang)
     - Query với filter user_id + pagination (limit/offset)
[ ] 14:30 Setup CORS + Auth middleware cho FastAPI
     - Verify Supabase JWT từ Authorization header
     - Inject user_id vào request state
[ ] 15:00 Implement POST /api/edit endpoint
     - Nhận: { lesson_plan_id, section_id, edit_prompt }
     - Gọi GPT-4o với prompt: "Chỉ sửa phần {section_id}, giữ nguyên format JSON"
     - Update content_json trong DB (chỉ phần section đó)
     - Return updated lesson plan
[ ] 16:00 Test auth middleware với Postman (dùng Supabase JWT thật)
[ ] 16:30 Viết .env.example đầy đủ
[ ] 17:00 Đảm bảo tất cả BE endpoints trả đúng schema đã thống nhất
[ ] 17:30 Code review + document API trong README.md ngắn
```

---

#### 🎨 PERSON C — chiều

```
[ ] 14:00 Implement lib/api.ts
     - generateLessonPlan(data) → POST /api/generate
     - getStatus(taskId) → GET /api/status/{taskId}
     - getLessonPlan(id) → GET /api/lesson-plans/{id}
     - checkCompliance(lessonPlanId) → POST /api/check
     - exportDocx(id) → POST /api/export/{id}
     - listLessonPlans() → GET /api/lesson-plans
[ ] 14:30 Wire GenerateForm → API
     - Submit gọi generateLessonPlan()
     - Redirect đến /generate/{task_id}
[ ] 15:00 Build /generate/[task_id] page — Progress Tracker
     - Poll getStatus() mỗi 3 giây
     - Stepper UI: Đang phân tích... → Tra cứu tài liệu... → Soạn thảo... → Kiểm tra... → Hoàn thành
     - Khi status=completed → load lesson plan
[ ] 16:00 Build LessonPlanPreview component
     - Render sections thành blocks đẹp
     - Highlight ⚠️ low_confidence sections bằng màu vàng
     - Show compliance status (badge PASSED/FAILED)
     - Show compliance errors nếu FAILED
[ ] 17:00 Build ExportButton component
     - gọi exportDocx(id)
     - Download file từ URL
[ ] 17:30 Wire /dashboard: gọi listLessonPlans(), render table thật
```

---

### 18:00 — Integration Checkpoint Ngày 1

**Test integration**:
- [ ] FE submit form → gọi được BE (không CORS error)
- [ ] BE trả task_id, FE poll được status
- [ ] Agent chạy → DB update → FE hiện completed
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
     - Handle trường hợp LLM trả về text thừa xung quanh JSON
[ ] 10:00 Implement POST /api/edit (nếu B chưa xong)
[ ] 10:30 Add error handling toàn bộ pipeline
     - Try/catch mọi LLM call
     - Nếu lỗi → update DB status=failed, trả error message
     - Timeout: 4 phút → cancel task
[ ] 11:00 Implement compliance cho file upload (nếu còn time)
     - POST /api/check với file DOCX/PDF
     - Parse text từ file → chạy compliance check
[ ] 11:30 Smoke test toàn bộ API với 3 bài học khác nhau
```

---

#### 🗄️ PERSON B — sáng ngày 2

```
[ ] 08:30 Fix bugs từ integration checkpoint
[ ] 09:00 Thêm mock RAG data cho thêm 3-5 môn
     - Ưu tiên: Toán, Văn, Lý cho lớp 10 và lớp 6
[ ] 09:30 Implement DELETE /api/lesson-plans/{id}
[ ] 09:45 Setup Railway deployment
     - Tạo Railway project, link GitHub repo
     - Set environment variables
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
[ ] 09:00 Build /check page — Standalone Compliance Checker
     - Form: nhập lesson_plan_id HOẶC upload file (nếu BE hỗ trợ)
     - Submit → POST /api/check
     - Show ComplianceReport đẹp
[ ] 10:00 Polish UI toàn bộ
     - Landing page / (đẹp, có call-to-action)
     - Consistent color scheme, typography
     - Loading skeletons cho tất cả states
     - Empty states cho dashboard trống
[ ] 11:00 Error states
     - Form validation (required fields)
     - API error messages hiển thị friendly
     - Generation failed → show retry button
[ ] 11:30 Mobile responsive check (basic)
```

---

### 12:00–13:00 — E2E Test + Bug Fix

**Flow test chung (3 người cùng test)**:

```
1. Đăng ký tài khoản mới
2. Đăng nhập
3. Tạo giáo án: Toán lớp 10, bài "Hàm số bậc nhất", mô hình 5E
4. Xem progress real-time
5. Xem kết quả giáo án đã sinh
6. Download DOCX → mở ra xem format đúng không
7. Vào /check: kiểm tra compliance của giáo án vừa sinh
8. Vào dashboard: xem giáo án trong list
9. Tạo thêm 1 giáo án: Văn lớp 6 → repeat flow
```

**Ghi nhận bugs theo mức độ**:
- 🔴 Blocker: Phải fix trước 14:00
- 🟡 Major: Fix trước 16:00
- 🟢 Minor: Fix nếu còn time

---

### 13:00–14:00 — Lunch + Fix Blocker

---

### 14:00–16:00 — Polish & Final Fixes

**Person A**: Fix remaining backend bugs, ensure DOCX output không bị lỗi format
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
[ ] Test toàn bộ flow trên production
```

---

### 17:00–18:00 — Demo Prep

```
[ ] Tạo 2-3 tài khoản demo (GV + Tổ trưởng)
[ ] Pre-generate 2 giáo án mẫu đẹp (Toán + Văn)
[ ] Chuẩn bị script demo 5 phút:
    1. Show dashboard có sẵn giáo án (30s)
    2. Tạo giáo án mới live (2 phút)
    3. Show compliance check (1 phút)
    4. Download DOCX (30s)
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
    low_confidence: bool = False

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

class ComplianceResult(BaseModel):
    status: Literal["PASSED", "FAILED"]
    errors: list[dict] = []  # [{section, issue, suggestion}]

class LessonPlanJSON(BaseModel):
    metadata: LessonMetadata
    sections: LessonSections5E  # hoặc 3-phase sections
    rag_sources: list[str] = []
    compliance: ComplianceResult

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
  status: "pending" | "generating" | "completed" | "failed";
  progress_step?: "intake_done" | "rag_done" | "draft_ready" | "compliance_done" | "export_done";
  lesson_plan_id?: string;
  error?: string;
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
- [ ] GV tạo được giáo án 5E cho ít nhất 3 môn khác nhau
- [ ] Giáo án hiển thị đầy đủ trên UI
- [ ] Download DOCX mở ra không bị lỗi format
- [ ] Compliance Checker trả về kết quả PASSED/FAILED với lý do cụ thể
- [ ] Toàn bộ flow chạy được trên production URL (không phải localhost)
- [ ] Response time < 5 phút cho generate
