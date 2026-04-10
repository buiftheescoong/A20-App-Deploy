# SPEC: Soạn Giáo Án Thông Minh — AI Multi-Agent System

> **Version**: 2.0 | **Ngày**: 2026-04-10 | **Scope**: MVP for Startup

---

## 1. AI Product Canvas

| Dimension | Chi tiết |
|---|---|
| **Value** | Giảm 96% thời gian soạn giáo án (từ 1.5–2h → 3–5 phút); chuẩn hóa 100% format GDPT 2018; giảm 70% khối lượng review của Tổ trưởng |
| **Trust** | RAG Accuracy ≥ 95% từ SGK chuẩn; 100% template adherence; Compliance Checker minh bạch — trả về reason cụ thể cho từng lỗi |
| **Feasibility** | Multi-Agent pipeline: Generate → Critique → Refine → Validate (tối đa 2 vòng lặp). FastAPI async + Supabase đủ handle 1K+ GV |
| **Learning Signal** | Log edit patterns của GV → cải thiện prompt theo thời gian; % Passed lần đầu là KPI tối ưu hệ thống |

---

## 2. User Stories × 4 Execution Paths

### Happy Path ✅
GV nhập môn, lớp, bài, mục tiêu → chọn mô hình 5E → AI sinh giáo án đạt chuẩn trong < 3 phút → Compliance Checker: `PASSED` → Export DOCX/PDF → Tải về.

### Low-Confidence Path ⚠️
RAG không tìm được thông tin chính xác trong SGK → Generator vẫn sinh nhưng đánh dấu `⚠️ [Cần kiểm chứng]` vào đoạn nội dung không chắc chắn → GV được cảnh báo rõ ràng, không bị mù về độ tin cậy.

### Failure / Timeout Path ❌
Generator-Checker loop vượt quá `max_iterations = 2` hoặc tổng thời gian > 5 phút → Hệ thống trả về **best-effort draft** (template đã điền heading, để trống nội dung chưa pass) + thông báo lỗi rõ ràng + gợi ý retry.

### Correction Path 🔄
GV nhận giáo án đã generate, yêu cầu sửa cụ thể: _"Thiết kế lại hoạt động nhóm thành minigame 10 phút"_ → Editor Agent chỉ modify đúng section được chỉ định → Re-validate → Export phiên bản mới.

---

## 3. Eval Metrics & Thresholds

| # | Metric | Threshold | Red Flag |
|---|---|---|---|
| 1 | **Template Adherence** | 100% heading bắt buộc có đủ | Thiếu Mục tiêu / Năng lực / Tiến trình |
| 2 | **RAG Accuracy** | ≥ 95% khớp SGK chuẩn | Hallucinate công thức, sai mốc lịch sử |
| 3 | **First-pass Success Rate** | ≥ 80% không cần chỉnh sửa | Response time > 5 phút |
| 4 | **Section Coherence Score** | ≥ 0.8 (cosine sim giữa Học sinh cần đạt & Hoạt động) | Mục tiêu và hoạt động không liên quan nhau |
| 5 | **Edit Distance Stability** | Phần không được yêu cầu sửa: diff ≤ 5% | Editor Agent thay đổi ngoài scope |

> **Eval Automation**: Mỗi lần generate xong, hệ thống tự chạy Eval Suite và lưu kết quả vào bảng `evaluations`. Tổ trưởng có dashboard xem tổng hợp.

---

## 4. Top 5 Failure Modes & Mitigations

### Mode 1: Hallucination nghiêm trọng về kiến thức chuyên môn
- **Trigger**: Bài học mới, từ khóa mơ hồ, thiếu tài liệu tham khảo
- **Hậu quả**: GV dạy thông tin sai → ảnh hưởng học sinh
- **Mitigation**: Bắt buộc RAG từ CSDL SGK chuẩn trước khi generate. Confidence score < 0.7 → tự động fallback sang `⚠️ cần kiểm chứng`. Disclaimer bắt buộc trên mọi output.

### Mode 2: Infinite Loop trong Generator-Checker
- **Trigger**: Generator sai format liên tục → Checker liên tục reject
- **Hậu quả**: Treo hệ thống, tốn API quota, UX tệ
- **Mitigation**: `max_iterations = 2`. Sau 2 fail → trả best-effort + error report. Checker phải trả về structured diff (không phải `true/false`) để Generator biết chính xác cần sửa gì.

### Mode 3: Vỡ format khi export DOCX/PDF
- **Trigger**: LLM sinh markdown lỗi syntax (table không đóng, heading sai level)
- **Hậu quả**: File mở bị trắng / hiển thị sai
- **Mitigation**: LLM output → **JSON Schema chuẩn** (không phải raw markdown) → `python-docx` render từ JSON. Schema validation bắt buộc trước khi export.

### Mode 4: Section Mismatch — Mục tiêu ≠ Hoạt động
- **Trigger**: Generator tạo mục tiêu cao nhưng hoạt động giảng dạy không thể hiện mục tiêu đó
- **Hậu quả**: Giáo án pass template check nhưng chất lượng thực tế thấp
- **Mitigation**: Critique Agent kiểm tra coherence (embedding similarity) giữa `learning_objectives` và `activities`. Nếu score < 0.75 → yêu cầu Generator revise phần activity.

### Mode 5: Scope Creep khi Edit
- **Trigger**: Editor Agent hiểu nhầm yêu cầu, sửa lan sang các section không liên quan
- **Hậu quả**: GV mất nội dung đã chỉnh sửa tốt trước đó
- **Mitigation**: Editor Agent nhận `section_id` cụ thể. Phần ngoài scope bị lock (chỉ đọc). Diff so sánh trước/sau phải hiển thị cho GV xác nhận.

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

| Agent | Role | Model Strategy | Input | Output |
|---|---|---|---|---|
| **Orchestrator** | Điều phối toàn bộ pipeline, quản lý state | Rule-based + LLM routing | User request JSON | Task graph + routing decision |
| **Intake Agent** | Parse & validate input, extract từ file PDF/DOCX | Fast LLM + PDF parser | Raw user input | Normalized JSON payload |
| **RAG Agent** | Truy xuất nội dung từ CSDL SGK | Embedding search (pgvector) | Môn + Bài + Lớp | Chunks kiến thức liên quan |
| **Generator Agent** | Sinh giáo án theo template | GPT-4o / Gemini 1.5 Pro | Normalized input + RAG context + Template | Draft lesson plan JSON |
| **Critique Agent** | Đánh giá coherence & chất lượng nội dung | GPT-4o / Gemini 1.5 Pro | Draft lesson plan | Structured critique report |
| **Compliance Checker Agent** | Kiểm tra tuân thủ GDPT 2018 format | GPT-4o-mini / Claude Haiku | Draft lesson plan | Pass/Fail + error list |
| **Editor Agent** | Sửa giáo án theo yêu cầu cụ thể | GPT-4o | Existing plan + edit prompt + section_id | Updated section JSON |
| **Formatter Agent** | Xuất DOCX/PDF từ JSON chuẩn | Deterministic (python-docx) | Final lesson plan JSON | DOCX + PDF file |

### 6.2 Multi-Agent Workflow

```
[User Input]
     │
     ▼
[Intake Agent] ──parse & validate──► [Normalized JSON]
     │
     ▼
[RAG Agent] ──retrieve SGK chunks──► [Knowledge Context]
     │
     ▼
[Generator Agent] ◄──────────────────────────────────┐
     │ Draft v1                                        │
     ▼                                                 │
[Critique Agent] ──coherence check──► [Critique Report]│
     │                                                 │
     ├─ OK ──► [Compliance Checker Agent]              │
     │              │                                  │ Revise
     │              ├─ PASSED ──► [Formatter Agent]    │
     │              │                   │              │
     │              │                   ▼              │
     │              │            [DOCX + PDF Output]   │
     │              │                                  │
     │              └─ FAILED (iteration < 2) ─────────┘
     │
     └─ Low-quality (iteration < 2) ─────────────────►┘
         (nếu vẫn fail sau 2 vòng → Best-effort output)
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
    "duration_minutes": 45
  },
  "sections": {
    "5E": {
      "engage": { "content": "...", "duration": 5, "confidence": 0.95 },
      "explore": { "content": "...", "duration": 10, "confidence": 0.92 },
      "explain": { "content": "...", "duration": 15, "confidence": 0.90 },
      "elaborate": { "content": "...", "duration": 10, "confidence": 0.88 },
      "evaluate": { "content": "...", "duration": 5, "confidence": 0.93 }
    }
  },
  "materials": ["Sách giáo khoa lớp 10", "Bảng phụ"],
  "compliance": {
    "status": "PASSED",
    "checked_at": "2026-04-10T09:00:00Z",
    "errors": []
  },
  "rag_sources": ["sgk_toan_10_ch2_p45", "sgk_toan_10_ch2_p47"]
}
```

### 6.4 Model Cost Strategy

| Task | Model | Lý do |
|---|---|---|
| Generate (long-form, reasoning) | GPT-4o hoặc Gemini 1.5 Pro | Cần quality cao, output dài |
| Critique & Coherence check | GPT-4o | Cần reasoning về mối liên hệ |
| Compliance Check (JSON validation) | GPT-4o-mini hoặc Claude 3 Haiku | Task rõ ràng, chi phí thấp |
| RAG embedding | text-embedding-3-small | Fast, cheap |

---

## 7. Constraints & Non-Functional Requirements

| Constraint | Value |
|---|---|
| **Response Time** | ≤ 5 phút / generate (target: 3 phút) |
| **Max Iterations** | 2 vòng Generate-Check |
| **Concurrency** | Hỗ trợ ≥ 50 request đồng thời (async FastAPI) |
| **Scale Target** | 1,000+ GV active |
| **RAG Source** | SGK chuẩn của Bộ GD&ĐT (vectorized into pgvector) |
| **Template Lock** | 100% output phải theo schema JSON → không cho LLM tự ý thêm section |
| **Security** | RLS Supabase (mỗi GV chỉ thấy giáo án của mình); tổ trưởng thấy giáo án của tổ |
| **Audit Trail** | Mọi lần generate/edit/check đều được log với timestamp và user_id |