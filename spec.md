# SPEC: Soạn Giáo Án Thông Minh — AI Multi-Agent System

> **Version**: 3.0 | **Ngày**: 2026-04-11 | **Scope**: MVP for Startup

---


## 1. AI Product Canvas

| Dimension | Chi tiết |
|---|---|
| **Value** | Giảm 96% thời gian soạn giáo án (từ 1.5–2h → 3–5 phút); chuẩn hóa 100% format GDPT 2018; giảm 70% khối lượng review của Tổ trưởng |
| **Trust** | Tuân thủ 100% template chuẩn Bộ GD&ĐT; Quality Checker minh bạch — trả về reason cụ thể cho từng lỗi; hỏi lại GV thay vì tự suy đoán khi thiếu thông tin |
| **Feasibility** | Multi-Agent pipeline có Orchestrator Agent điều phối: Orchestrator → Intake → RAG → Generate → Quality Check → Format (tối đa 2 vòng lặp). Orchestrator Agent chịu trách nhiệm điều phối, giám sát, retry/fallback, tối ưu hóa luồng bất đồng bộ. FastAPI async + Supabase đủ handle 1K+ GV |
| **Learning Signal** | Agent memory ghi nhớ preferences của từng GV (môn, template ưa thích, phong cách); Log edit patterns → cải thiện prompt theo thời gian |

---


---

## 1.1. Tối ưu kiến trúc multi-agent

- **Orchestrator Agent**: Điều phối pipeline, giám sát tiến trình, retry/fallback khi lỗi, log trạng thái, tối ưu hóa bất đồng bộ (các agent có thể chạy song song khi phù hợp).
- **Chuẩn hóa giao tiếp**: Các agent giao tiếp qua message/event bus hoặc task queue, input/output rõ ràng, giảm phụ thuộc lẫn nhau.
- **Tối ưu tài nguyên**: Hỗ trợ scale agent động, cache kết quả trung gian, tận dụng container/k8s nếu mở rộng lớn.
- **Tối ưu trải nghiệm**: Phản hồi nhanh với kết quả tạm thời, cho phép can thiệp thủ công từng bước, realtime update.
- **Tối ưu kiểm chuẩn GDPT 2018**: Rule kiểm tra tự động, cập nhật động, tích hợp AI phát hiện lỗi logic/thiếu sót.

---

## 2. User Stories × 5 Execution Paths

### Happy Path ✅
GV nhập môn, lớp, bài, mục tiêu → chọn mô hình 5E → AI sinh giáo án đạt chuẩn trong < 3 phút → Quality Checker: `PASSED` → Export DOCX → Tải về.

### Low-Confidence Path ⚠️
RAG không tìm được đủ thông tin cho chủ đề bài học → **Agent DỪNG lại và hỏi lại GV** với các câu hỏi cụ thể:
- "Bạn có thể mô tả thêm về nội dung bài học này không?"
- "Bạn có tài liệu tham khảo nào có thể upload thêm không? (PDF/DOCX)"
- "Phần kiến thức nào bạn muốn chú trọng trong bài này?"

GV bổ sung thông tin / upload tài liệu → Agent tiếp tục pipeline với context đầy đủ hơn.

> **Lưu ý**: Agent KHÔNG tự sinh nội dung khi thiếu dữ liệu. Thà hỏi lại còn hơn hallucinate.

### Failure / Timeout Path ❌
Generator-Quality Check loop vượt quá `max_iterations = 2` hoặc tổng thời gian > 5 phút sau khi đã retry + fallback model → Hệ thống trả về **template giáo án trắng** (đúng format GDPT 2018, có đủ heading, các mục để trống) để GV tải về tự điền + thông báo lỗi rõ ràng + gợi ý thử lại sau.

### Correction Path 🔄
GV nhận giáo án đã generate, yêu cầu sửa cụ thể: _"Thiết kế lại hoạt động nhóm thành minigame 10 phút"_ → Editor Agent chỉ modify đúng section được chỉ định → Re-validate → Export phiên bản mới.

### Out-of-Scope Path 🚫
GV hỏi nội dung không liên quan đến soạn giáo án (ví dụ: hỏi về thời tiết, tin tức, lập trình...) → Agent từ chối nhẹ nhàng: _"Mình chỉ có thể hỗ trợ các yêu cầu liên quan đến soạn giáo án theo chương trình GDPT 2018. Bạn cần hỗ trợ soạn bài nào không?"_

---

## 3. Eval Metrics & Thresholds

Hệ thống chỉ kiểm tra đúng theo **template chuẩn của Bộ GD&ĐT**, không thêm metric ngoài.

| # | Mục kiểm tra (GDPT 2018) | Kết quả |
|---|---|---|
| 1 | Có đủ thông tin bìa: Tên bài dạy, Môn học, Lớp, Thời gian thực hiện | PASS / FAIL |
| 2 | Mục **Mục tiêu** có ít nhất 2 năng lực chuyên môn + 1 phẩm chất | PASS / FAIL |
| 3 | Mục **Thiết bị và học liệu** được điền | PASS / FAIL |
| 4 | Có đủ các bước/hoạt động của mô hình dạy học (5E: Engage/Explore/Explain/Elaborate/Evaluate; 3-phase: Mở đầu/Hình thành kiến thức/Luyện tập) | PASS / FAIL |
| 5 | Mỗi hoạt động có đủ 4 cột: **Mục tiêu – Nội dung – Sản phẩm – Tổ chức thực hiện** | PASS / FAIL |

> **Eval tự động**: Chạy sau mỗi lần generate. Kết quả lưu vào bảng `evaluations`. Tổ trưởng xem tổng hợp qua dashboard.

---

## 4. Top 5 Failure Modes & Mitigations

### Mode 1: Thiếu thông tin để generate (Low-Confidence)
- **Trigger**: RAG không tìm được nội dung phù hợp với bài học; topic quá mơ hồ
- **Hậu quả**: Nếu tự sinh → hallucinate, dạy sai kiến thức cho học sinh
- **Mitigation**: **Dừng pipeline, hỏi lại GV** — yêu cầu mô tả thêm hoặc upload tài liệu tham khảo. Chỉ tiếp tục khi có đủ context.

### Mode 2: Infinite Loop trong Generator-Quality Checker
- **Trigger**: Generator sai format liên tục → Quality Checker liên tục reject
- **Hậu quả**: Treo hệ thống, tốn API quota, UX tệ
- **Mitigation**: `max_iterations = 2`. Sau 2 fail: (1) Retry với backoff 5s; (2) Nếu vẫn fail → fallback sang model khác; (3) Nếu fallback vẫn fail → trả **template trắng** + error report. Quality Checker trả structured diff (không phải `true/false`) để Generator biết chính xác cần sửa gì.

### Mode 3: Vỡ format khi export DOCX
- **Trigger**: LLM sinh JSON lỗi syntax (table không đóng, key sai tên)
- **Hậu quả**: File mở bị trắng / hiển thị sai
- **Mitigation**: LLM output → **JSON Schema chuẩn** → `python-docx` render từ JSON. JSON schema validation bắt buộc trước khi export. Nếu validation fail → export template trắng thay vì file lỗi.

### Mode 4: Generator sửa nhiều hơn scope yêu cầu (Scope Creep)
- **Trigger**: Editor Agent hiểu nhầm yêu cầu, sửa lan sang các section không liên quan
- **Hậu quả**: GV mất nội dung đã chỉnh sửa tốt trước đó
- **Mitigation**: Editor Agent nhận `section_id` cụ thể. Phần ngoài scope bị lock (chỉ đọc). Diff so sánh trước/sau phải hiển thị cho GV xác nhận trước khi save.

### Mode 5: Model API down / Rate limit
- **Trigger**: OpenAI API lỗi, rate limit 429
- **Hậu quả**: Toàn bộ pipeline fail
- **Mitigation**: Retry 3 lần với exponential backoff → Fallback chain: `GPT-4o → Gemini 1.5 Pro → GPT-4o-mini`. Nếu tất cả đều fail → trả template trắng + notify GV.

---

## 5. ROI Analysis — 3 Kịch bản

| Kịch bản | Thời gian soạn | First-pass Rate | Giá trị tạo ra |
|---|---|---|---|
| **Conservative** (30% GV adopt) | Giảm 50% (~45–60p) | 60% | Giảm stress, nhưng tổ trưởng vẫn tốn công review |
| **Realistic** (70% GV adopt, mục tiêu MVP) | Giảm >96% (~3–5p) | 80% | Review time giảm 70%, nâng năng suất tổ bộ môn rõ rệt |
| **Optimistic** (integrate vào quy trình trường) | Giảm 99% (~1p) | 95%+ | Loại bỏ bottleneck sổ sách, thành tiêu chuẩn của trường/quận |

---

## 6. AI Agent Specification

### 6.1 Agent Roster

| Agent                | Role / Chức năng chính                                                                 | Model/Tech           | Input chính                                    | Output chính                                    |
|----------------------|--------------------------------------------------------------------------------------|----------------------|------------------------------------------------|-------------------------------------------------|
| **Orchestrator Agent** | Điều phối toàn bộ pipeline, quản lý state, retry/fallback, tối ưu bất đồng bộ, log tiến trình. Cho phép mở rộng agent mới dễ dàng. | Rule-based + LLM routing | User request JSON, trạng thái các agent         | Task graph, routing, trạng thái, error handling |
| **Intake Agent**     | Parse & validate input, extract từ file PDF/DOCX, kiểm tra scope (chỉ giáo án)        | Fast LLM + PDF parser | Raw user input                                 | Normalized JSON payload hoặc `out_of_scope_flag` |
| **RAG Agent**        | Truy xuất nội dung từ CSDL SGK; nếu confidence thấp → sinh `clarification_questions`  | Embedding search      | Môn + Bài + Lớp                                | Chunks kiến thức, `low_confidence`, `clarification_questions[]` |
| **Generator Agent**  | Sinh giáo án theo template GDPT 2018, hỗ trợ fallback model, sinh nhiều phiên bản    | GPT-4o / Gemini 1.5 Pro (fallback) | Normalized input, RAG context, Template         | Draft lesson plan JSON                           |
| **Quality Checker Agent** | Kiểm tra đủ heading GDPT 2018 (rule-based) + chất lượng nội dung (LLM), trả về structured diff, gợi ý sửa | GPT-4o-mini / Claude Haiku | Draft lesson plan                              | Pass/Fail, structured error list, suggestions     |
| **Clarification Agent** | Hỏi lại GV khi thiếu thông tin, tổng hợp câu hỏi, nhận phản hồi bổ sung             | LLM + rule           | Context thiếu, câu hỏi cần làm rõ               | Clarification Q&A, context bổ sung               |
| **Editor Agent**     | Sửa giáo án theo yêu cầu cụ thể, lock phần ngoài scope, diff trước/sau              | GPT-4o               | Existing plan, edit prompt, section_id          | Updated section JSON, diff                       |
| **Formatter Agent**  | Xuất DOCX từ JSON chuẩn, validate schema, fallback template trắng nếu lỗi           | python-docx          | Final lesson plan JSON                          | DOCX file, error report nếu fail                  |


### 6.2 Multi-Agent Workflow (Orchestrator-centric, tối ưu hóa)


```
[User Input]
  │
  ▼
[Orchestrator Agent]
  │
  ├─► [Intake Agent] ─parse/validate→ [Normalized JSON]
  │         │
  │         ├─ out_of_scope? → [Từ chối, gợi ý quay lại]
  │         └─ OK → [RAG Agent] ─retrieval→ [RAG context]
  │                        │
  │                        ├─ low_confidence? → [Clarification Agent] ─► hỏi lại GV, nhận bổ sung
  │                        └─ OK → [Generator Agent] (có thể song song nhiều bản nháp)
  │                                         │
  │                                 [Quality Checker Agent] (song song/checkpoint)
  │                                         │
  │                                 ├─ PASSED → [Formatter Agent] → [DOCX Output]
  │                                 └─ FAILED (iteration < 2) → [Generator Agent] (revise)
  │                                         │
  │                                 (iteration >= 2) → [Retry/backoff] → [Fallback Model]
  │                                         │
  │                                 (vẫn fail?) → [Formatter Agent] (template trắng + error report)
  ▼
[Orchestrator tổng hợp kết quả, log trạng thái, trả về frontend]
```

### 6.3 Lesson Plan JSON Schema

```json
{
  "lesson_plan_id": "uuid",
  "metadata": {
    "subject": "Toán",
    "grade": "10",
    "topic": "Hàm số bậc nhất",
    "teaching_model": "5E",
    "objectives": ["HS nhận diện...", "HS vẽ được..."],
    "competencies": ["Tư duy toán học", "Giao tiếp"],
    "duration_minutes": 45,
    "materials": ["Sách giáo khoa lớp 10", "Bảng phụ"]
  },
  "sections": {
    "5E": {
      "engage":    { "content": "...", "duration": 5,  "low_confidence": false },
      "explore":   { "content": "...", "duration": 10, "low_confidence": false },
      "explain":   { "content": "...", "duration": 15, "low_confidence": false },
      "elaborate": { "content": "...", "duration": 10, "low_confidence": false },
      "evaluate":  { "content": "...", "duration": 5,  "low_confidence": false }
    }
  },
  "compliance": {
    "status": "PASSED",
    "checked_at": "2026-04-11T00:00:00Z",
    "errors": []
  },
  "rag_sources": ["sgk_toan_10_ch2_p45"],
  "clarification_needed": false,
  "clarification_questions": []
}
```

### 6.4 Model Cost Strategy

| Task | Model (Primary) | Model (Fallback) | Lý do |
|---|---|---|---|
| Generate (long-form) | GPT-4o | Gemini 1.5 Pro | Cần quality cao, output dài |
| Quality Check | GPT-4o-mini | Claude 3 Haiku | Task rõ ràng, chi phí thấp |
| RAG embedding | text-embedding-3-small | — | Fast, cheap |
| Editor (targeted) | GPT-4o | GPT-4o-mini | Cần hiểu context section riêng lẻ |

### 6.5 Agent Memory

Agent được trang bị 2 lớp memory để cá nhân hoá trải nghiệm:

#### Short-term Memory (Conversation Context)
- Lưu trong LangGraph state suốt session generate
- Bao gồm: RAG context, draft history, critique feedback, clarification Q&A của phiên hiện tại
- Xoá sau khi session kết thúc (task completed / failed)

#### Long-term Memory (User Preferences)
- Lưu trong Supabase (`user_preferences` table)
- Bao gồm:
  - Mô hình dạy học ưa thích (5E / 3-phase)
  - Môn và lớp thường soạn
  - Phong cách: chú trọng hoạt động nhóm, tích hợp công nghệ...
  - Lịch sử các loại lỗi compliance thường gặp

```sql
CREATE TABLE user_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pref_key    TEXT NOT NULL,   -- "preferred_model", "default_subject"...
  pref_value  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, pref_key)
);
```

Agent đọc `user_preferences` tại đầu mỗi session để tự động pre-fill form và điều chỉnh prompt.

### 6.6 Retry & Model Fallback Strategy

```
[LLM Call]
     │
     ├─ SUCCESS ──► continue
     │
     └─ FAIL (timeout / API error / JSON parse error)
          │
          ├─ Retry #1 sau 5s  ──► SUCCESS? continue : next
          ├─ Retry #2 sau 10s ──► SUCCESS? continue : next
          ├─ Retry #3 sau 20s ──► SUCCESS? continue : next
          │
          └─ Tất cả retry fail
               │
               ├─ Fallback sang Gemini 1.5 Pro (nếu model hiện tại là GPT-4o)
               ├─ Fallback sang GPT-4o-mini (nếu vẫn fail)
               │
               └─ Tất cả model fail
                    │
                    └─ Trả về BLANK TEMPLATE + error message rõ ràng
```

**Trigger cho fallback**:
- HTTP 429 (rate limit)
- HTTP 500/503 (server error)
- Timeout > 60s
- JSON parse error sau 2 lần generate

---

## 7. Constraints & Non-Functional Requirements

| Constraint | Value |
|---|---|
| **Response Time** | ≤ 5 phút / generate (target: 3 phút) |
| **Max Iterations** | 2 vòng Generate-Check |
| **Retry** | 3 lần với exponential backoff (5s → 10s → 20s) |
| **Model Fallback** | GPT-4o → Gemini 1.5 Pro → GPT-4o-mini |
| **Concurrency** | Hỗ trợ ≥ 50 request đồng thời (async FastAPI) |
| **Scale Target** | 1,000+ GV active |
| **RAG Source** | SGK chuẩn của Bộ GD&ĐT (vectorized into pgvector) |
| **Template Lock** | 100% output phải theo schema JSON → không cho LLM tự ý thêm section |
| **Scope Guard** | Intake Agent filter: chỉ xử lý yêu cầu liên quan giáo án |
| **Security** | RLS Supabase (mỗi GV chỉ thấy giáo án của mình); tổ trưởng thấy giáo án của tổ |
| **Audit Trail** | Mọi lần generate/edit/check/retry đều được log với timestamp và user_id |