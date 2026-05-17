# Kế hoạch Nâng cấp Kiến trúc V2 — Giáo Án Thông Minh

> **Ngày cập nhật:** 2026-04-24
> **Phiên bản:** V2.0 — Redesign toàn diện
> **Thay đổi chính:** Bỏ clarify giữa luồng, thêm Thư viện Tài nguyên, tách BE thành 2 service, inline editing output

---

## Mục lục

1. [Tổng quan thay đổi so với V1](#1-tổng-quan-thay-đổi-so-với-v1)
2. [Kiến trúc Hệ thống mới](#2-kiến-trúc-hệ-thống-mới)
3. [Stack công nghệ](#3-stack-công-nghệ)
4. [Thiết kế Giao diện mới](#4-thiết-kế-giao-diện-mới)
5. [Luồng User Journey mới](#5-luồng-user-journey-mới)
6. [API Design](#6-api-design)
7. [Agent Architecture (đơn giản hóa)](#7-agent-architecture-đơn-giản-hóa)
8. [Database Schema](#8-database-schema)
9. [Logging & Tracing](#9-logging--tracing)
10. [Phân công 3 roles](#10-phân-công-3-roles)
11. [Sprint Plan](#11-sprint-plan)
12. [Bảng tổng hợp Files](#12-bảng-tổng-hợp-files)

---

## 1. Tổng quan thay đổi so với V1

| # | Thay đổi | V1 (cũ) | V2 (mới) | Lý do |
|---|----------|---------|----------|-------|
| 1 | **Bỏ Clarify giữa luồng** | AI gen giữa chừng dừng lại hỏi → UX tệ | Đặt câu hỏi bổ sung ngay trong form ban đầu (smart form) | Trải nghiệm mượt, không bị ngắt |
| 2 | **Thư viện Tài nguyên** | Không có | User upload tài liệu + Hệ thống cung cấp sẵn SGK/SGV GDPT 2018 → user chọn để soạn giáo án | Tái sử dụng tài liệu, UX tốt hơn |
| 2b | **Tài liệu hệ thống** | Không có | Admin upload sẵn SGK, Sách giáo viên theo môn/lớp → user vào thấy ngay, chọn dùng hoặc tải về | Tiết kiệm thời gian, không cần upload lại |
| 3 | **Thư viện Giáo án** | Dashboard đơn giản | Danh sách giáo án đã gen + xem + xóa | Quản lý output |
| 4 | **Streaming output đẹp** | Markdown thô typewriter | Rich markdown rendering + smooth streaming | UX chuyên nghiệp |
| 5 | **Inline editing** | Chỉ chat để sửa | User trực tiếp click edit trên output, sửa text rồi save | Nhanh hơn chat |
| 6 | **Tách Backend** | 1 FastAPI monolith | API Gateway (Node.js/TS) + AI Service (Python) | Tối ưu từng phần |
| 7 | **Đơn giản hóa Agent** | 7 nodes phức tạp | 4 nodes core + logging/tracing rõ ràng | Dễ debug, maintain |

---

## 2. Kiến trúc Hệ thống mới

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│   Next.js 14 (App Router) + Tailwind + Shadcn/UI                   │
│                                                                     │
│   Pages:                                                            │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│   │ /generate│ │/library  │ │/resources│ │/plans/:id│             │
│   │Smart Form│ │Giáo án   │ │Tài nguyên│ │View+Edit │             │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTPS / SSE
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Node.js / TypeScript)                  │
│                                                                     │
│   Framework: Express/Fastify + tRPC hoặc REST                      │
│   Responsibilities:                                                 │
│   • Auth (Supabase JWT verify)                                     │
│   • File upload + storage (Supabase Storage)                       │
│   • CRUD: lesson_plans, resources, messages                        │
│   • SSE proxy: nhận events từ AI Service → forward to client       │
│   • Rate limiting, validation, error handling                      │
│                                                                     │
│   Port: 3001                                                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP (internal)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  AI SERVICE (Python / FastAPI)                       │
│                                                                     │
│   Framework: FastAPI + LangGraph + LangSmith                       │
│   Responsibilities:                                                 │
│   • LangGraph orchestration (4 nodes)                              │
│   • LLM calls (OpenAI, Gemini)                                    │
│   • RAG: embedding + vector search                                 │
│   • Streaming chunks via SSE                                       │
│   • Structured logging + LangSmith tracing                         │
│                                                                     │
│   Port: 8000                                                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                      │
│                                                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│   │  Supabase    │  │  Supabase    │  │  pgvector    │            │
│   │  PostgreSQL  │  │  Storage     │  │  (embeddings)│            │
│   │  (main DB)   │  │  (files)     │  │              │            │
│   └──────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

### Tại sao tách 2 service?

| Tiêu chí | Monolith Python | Tách Node.js + Python |
|----------|----------------|----------------------|
| **CRUD performance** | Python async OK nhưng không tối ưu | Node.js native event loop, cực nhanh cho I/O |
| **Type safety FE↔BE** | Không share types | TypeScript shared types giữa FE và API Gateway |
| **AI focus** | Lẫn CRUD logic vào agent code | Python service chỉ lo AI, sạch sẽ |
| **Scaling** | Scale cả khối | Scale AI service riêng (GPU/CPU intensive) |
| **Team skill** | 1 người phải biết cả 2 | FE+BE dùng TS, AI Engineer dùng Python |
| **Deployment** | 1 container | 2 containers, scale độc lập |

---

## 3. Stack công nghệ

### Frontend
| Component | Technology | Lý do |
|-----------|-----------|-------|
| Framework | **Next.js 14** (App Router) | SSR, routing, đã có |
| UI Library | **Shadcn/UI** + Radix | Components đẹp, accessible, customizable |
| Styling | **Tailwind CSS** | Đã có, nhanh |
| State | **Zustand** | Nhẹ hơn Redux, đủ dùng |
| Markdown Render | **react-markdown** + remark-gfm | Rich rendering cho streaming output |
| Inline Editor | **Tiptap** hoặc **Plate** (rich text) | WYSIWYG editing trên output |
| File Upload | **react-dropzone** | Drag & drop |
| HTTP | **fetch** native + EventSource | SSE streaming |

### API Gateway (Node.js)
| Component | Technology | Lý do |
|-----------|-----------|-------|
| Runtime | **Node.js 20+** | LTS, stable |
| Framework | **Fastify** | Nhanh hơn Express 2-3x |
| Language | **TypeScript** | Share types với FE |
| Validation | **Zod** | Runtime validation + type inference |
| Auth | **Supabase JS SDK** | JWT verify |
| File handling | **@fastify/multipart** | Stream upload |
| Logging | **Pino** | Structured JSON logs, nhanh |
| ORM | **Drizzle** hoặc **Prisma** | Type-safe DB queries |

### AI Service (Python)
| Component | Technology | Lý do |
|-----------|-----------|-------|
| Framework | **FastAPI** | Async, đã có |
| Orchestration | **LangGraph** | StateGraph, đã có |
| LLM | **OpenAI GPT-4o** + **Gemini** | Đã có |
| Tracing | **LangSmith** | Trace mọi LLM call |
| Logging | **structlog** | Structured JSON logging |
| Embeddings | **text-embedding-3-small** | Đã có |

---

## 4. Thiết kế Giao diện mới

### 4.1 Trang chính — Layout

```
┌─────────────────────────────────────────────────────────┐
│  Logo   [Soạn giáo án]  [Thư viện]  [Tài nguyên]  [👤]│  ← Navbar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    PAGE CONTENT                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Trang /generate — Smart Form (thay thế form cũ + clarify)

```
┌─────────────────────────────────────────────────────────┐
│  📝 Soạn Giáo Án Mới                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Thông tin cơ bản                                       │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Môn học ▼        │  │ Lớp ▼            │              │
│  └─────────────────┘  └─────────────────┘              │
│  ┌─────────────────────────────────────────┐            │
│  │ Tên bài học                              │            │
│  └─────────────────────────────────────────┘            │
│  ┌─────────────────┐                                    │
│  │ Mô hình dạy ▼   │  (5E / 3 giai đoạn)               │
│  └─────────────────┘                                    │
│                                                         │
│  📎 Tài liệu tham khảo                                 │
│  ┌─────────────────────────────────────────┐            │
│  │  Kéo thả file PDF/DOCX vào đây          │            │
│  │  hoặc [Chọn từ Thư viện]                │  ← MỚI   │
│  └─────────────────────────────────────────┘            │
│  📕 SGK Toán 11 (hệ thống) ✕                           │
│  📄 de_cuong_chuong_2.pdf (upload) ✕                   │
│                                                         │
│  ────────────────────────────────────────               │
│  Thông tin bổ sung (thay thế Clarify)         ← MỚI   │
│  ────────────────────────────────────────               │
│  ┌─────────────────────────────────────────┐            │
│  │ Mục tiêu bài học (tùy chọn)             │            │
│  │ VD: HS nhận diện được hàm bậc nhất...   │            │
│  └─────────────────────────────────────────┘            │
│  ┌─────────────────────────────────────────┐            │
│  │ Nội dung muốn nhấn mạnh (tùy chọn)      │            │
│  │ VD: Đồ thị, ứng dụng thực tế...         │            │
│  └─────────────────────────────────────────┘            │
│  ┌─────────────────────────────────────────┐            │
│  │ Yêu cầu đặc biệt (tùy chọn)            │            │
│  │ VD: Dùng Kahoot khởi động, nhóm 4 HS... │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│            [🚀 Tạo Giáo Án]                             │
└─────────────────────────────────────────────────────────┘
```

**Giải thích:** Thay vì AI dừng giữa chừng hỏi "Bạn muốn nhấn mạnh gì?", ta đặt luôn câu hỏi này trong form dưới dạng optional fields. User điền hoặc không — AI vẫn gen được, nhưng nếu có thì output chất lượng hơn.

### 4.3 Trang /generate/[plan_id] — Streaming + Inline Edit

```
┌─────────────────────────────────────────────────────────┐
│  ← Quay lại    Toán - Lớp 11 - Hàm số bậc nhất        │
├───────────────────────────────┬─────────────────────────┤
│                               │                         │
│  📄 Giáo Án                   │  💬 Chat                │
│  ─────────────                │  ─────                  │
│                               │                         │
│  ┌───────────────────────┐    │  🤖 Giáo án đã được     │
│  │ **I. MỤC TIÊU**      │    │  tạo thành công!        │
│  │                       │    │                         │
│  │ 1. Năng lực           │    │  👩‍🏫 Phần khởi động    │
│  │ • Nhận diện hàm...   │    │  đổi thành Kahoot       │
│  │ [✏️ click để sửa]     │    │                         │
│  │                       │    │  🤖 Đã cập nhật ✅      │
│  │ **II. KHỞI ĐỘNG**    │    │                         │
│  │                       │    │                         │
│  │ Trò chơi Kahoot...   │    │  ┌───────────────────┐  │
│  │ [✏️ click để sửa]     │    │  │ Nhập tin nhắn...  │  │
│  │                       │    │  │            [📎][➤]│  │
│  │ ...streaming...       │    │  └───────────────────┘  │
│  └───────────────────────┘    │                         │
│                               │                         │
│  [📥 Tải DOCX] [♻️ Tạo lại]  │                         │
├───────────────────────────────┴─────────────────────────┤
│  Progress: ████████████░░ Đang tạo giáo án... 75%      │
└─────────────────────────────────────────────────────────┘
```

Bố cục: Khung chat bên tay trái, giáo án được sinh bên tay phải
**Inline Edit:** User hover vào section → hiện icon ✏️ → click → section chuyển thành editable (Tiptap editor) → sửa → save → gọi API cập nhật.

### 4.4 Trang /resources — Thư viện Tài nguyên (MỚI)

```
┌─────────────────────────────────────────────────────────┐
│  📚 Thư viện Tài nguyên                 [+ Upload mới] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [📖 Tài liệu hệ thống]  [📁 Tài liệu của tôi]       │  ← Tab switch
│                                                         │
│  ─── Tab: Tài liệu hệ thống ───                       │
│  🔍 Tìm kiếm...    [Môn ▼]  [Lớp ▼]  [Loại ▼]       │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 📕 SGK Toán 11                [SGK] [Lớp 11]      │ │
│  │    Sách giáo khoa Toán 11 — GDPT 2018  •  89 tr   │ │
│  │    [📖 Xem] [📝 Soạn giáo án] [📥 Tải về]         │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ 📗 SGV Vật Lý 10             [SGV] [Lớp 10]       │ │
│  │    Sách giáo viên Vật Lý 10 — GDPT 2018  •  156 tr│ │
│  │    [📖 Xem] [📝 Soạn giáo án] [📥 Tải về]         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ─── Tab: Tài liệu của tôi ───                        │
│  🔍 Tìm kiếm tài liệu...                              │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 📄 Đề cương Vật Lý 10              12 trang       │ │
│  │    Uploaded: 18/04/2026                             │ │
│  │    [📖 Xem] [📝 Soạn giáo án từ tài liệu] [🗑️]   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Tài liệu hệ thống:** SGK, Sách giáo viên GDPT 2018 được admin upload sẵn. User chỉ xem, chọn dùng, tải về — không xóa/sửa được.

**Tài liệu của tôi:** User tự upload, có đầy đủ quyền (xem, dùng, xóa).

**Click "Soạn giáo án"** → chuyển sang /generate với tài liệu đã được pre-select.

### 4.5 Trang /library — Thư viện Giáo án (MỚI)

```
┌─────────────────────────────────────────────────────────┐
│  📋 Thư viện Giáo Án                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔍 Tìm kiếm...    [Môn ▼]  [Lớp ▼]  [Sắp xếp ▼]    │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 📝 Hàm số bậc nhất         Toán - Lớp 11         │ │
│  │    Mô hình: 5E  •  Tạo: 24/04/2026  •  ✅ Đạt    │ │
│  │    [📖 Xem] [📥 Tải DOCX] [🗑️ Xóa]               │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ 📝 Phương trình bậc hai    Toán - Lớp 10         │ │
│  │    Mô hình: 3 GĐ  •  Tạo: 22/04/2026  •  ✅ Đạt │ │
│  │    [📖 Xem] [📥 Tải DOCX] [🗑️ Xóa]               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Showing 1-10 of 23    [< Prev] [Next >]               │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Luồng User Journey mới

### Journey 1: Tạo giáo án từ form (Happy Path — không bị ngắt)

```
User mở /generate
  → Điền: Toán, Lớp 11, Hàm số bậc nhất, Mô hình 5E
  → (Tùy chọn) Upload SGK PDF hoặc chọn từ Thư viện Tài nguyên
  → (Tùy chọn) Điền mục tiêu, nội dung nhấn mạnh, yêu cầu đặc biệt
  → Click "Tạo Giáo Án"
  → POST multipart → API Gateway → AI Service
  → Redirect /generate/{plan_id}
  → SSE stream mở
  → Progress bar: RAG → Generating → Quality Check
  → Output streaming (rich markdown, smooth)
  → Hoàn thành → Inline edit nếu cần
  → Tải DOCX
```

**Không có bước Clarify giữa chừng.** AI sử dụng thông tin user đã điền + RAG context để gen. Nếu thiếu info, AI tự đưa ra giả định hợp lý (ghi chú trong output).

### Journey 2: Tạo giáo án từ Thư viện Tài nguyên

```
User mở /resources
  → Click "Soạn giáo án từ tài liệu" trên file SGK Toán 11
  → Redirect /generate?resource_id=xxx
  → Form đã pre-fill tài liệu, user điền thêm topic + mô hình
  → Tiếp tục như Journey 1
```

### Journey 3: Inline edit sau khi gen

```
Giáo án đã gen xong, hiển thị trên /generate/{plan_id}
  → User hover vào section "Khởi động"
  → Hiện icon ✏️
  → Click → Section chuyển thành editor (Tiptap)
  → User sửa text trực tiếp
  → Click Save → PATCH API cập nhật section
  → Hoặc dùng Chat panel: "Đổi phần khởi động thành Kahoot"
```

### Journey 4: Chat refinement (giữ nguyên từ V1)

```
Giáo án đã gen xong
  → User gõ trong Chat: "Thêm hoạt động nhóm vào phần Khám phá"
  → AI refine chỉ phần đó
  → Output cập nhật, streaming delta
```

---

## 6. API Design

### API Gateway (Node.js) — REST endpoints

```
# Auth
POST   /api/auth/login           → Supabase Auth
POST   /api/auth/register        → Supabase Auth
GET    /api/auth/me              → Current user

# Lesson Plans (CRUD)
POST   /api/plans                → Tạo plan mới + gửi AI Service
GET    /api/plans                → List plans (paginated, filterable)
GET    /api/plans/:id            → Chi tiết 1 plan
PATCH  /api/plans/:id            → Update plan (inline edit save)
DELETE /api/plans/:id            → Xóa plan

# Streaming (SSE proxy)
GET    /api/plans/:id/stream     → SSE proxy từ AI Service

# Chat
POST   /api/plans/:id/chat       → Gửi message + optional files
GET    /api/plans/:id/messages   → Chat history

# Resources (Thư viện Tài nguyên)
POST   /api/resources            → Upload file (multipart) — tài liệu cá nhân
GET    /api/resources             → List user resources (cá nhân)
GET    /api/resources/:id        → Chi tiết + preview
DELETE /api/resources/:id        → Xóa resource (chỉ tài liệu cá nhân)

# System Resources (Tài liệu hệ thống — SGK/SGV)
GET    /api/resources/system      → List system resources (filter: subject, grade, category)
GET    /api/resources/system/:id  → Chi tiết system resource
GET    /api/resources/system/:id/download → Tải file gốc về

# Export
GET    /api/plans/:id/export     → Download DOCX
```

### AI Service (Python) — Internal endpoints

```
# Chỉ API Gateway gọi, không expose ra ngoài
POST   /ai/generate              → Khởi chạy LangGraph pipeline
GET    /ai/stream/:plan_id       → SSE stream events
POST   /ai/chat/:plan_id        → Resume graph với message mới
POST   /ai/embed                 → Embed text → vector
POST   /ai/search                → Vector similarity search
```

---

## 7. Agent Architecture (đơn giản hóa)

### V1 (7 nodes) → V2 (4 nodes core)

**Bỏ:**
- `clarify` node — thay bằng smart form
- `intent_router` node — đơn giản hóa thành function call trong API
- `qa_responder` — gộp vào chat handler (không cần graph)

**Giữ + cải tiến:**

```
┌─────────────────────────────────────────────────┐
│              LangGraph StateGraph                │
│                                                  │
│   ┌──────────┐     ┌──────────┐                 │
│   │  1. RAG  │────▶│2. GENERATE│                │
│   │ Retrieval│     │ (Stream) │                 │
│   └──────────┘     └────┬─────┘                 │
│                         │                        │
│                    ┌────▼─────┐                  │
│                    │3. QUALITY│                  │
│                    │  CHECK   │                  │
│                    └────┬─────┘                  │
│                    ┌────▼─────┐                  │
│                    │4. FORMAT │                  │
│                    │ JSON+DOCX│                  │
│                    └──────────┘                  │
│                                                  │
│   Separate (no graph):                           │
│   • refine() — single LLM call                 │
│   • qa() — single LLM call                     │
└─────────────────────────────────────────────────┘
```

### Graph State (đơn giản hơn)

```python
class GraphState(TypedDict):
    plan_id: str
    user_id: str
    # Input
    subject: str
    grade: str
    topic: str
    teaching_model: str          # "5E" | "3-phase"
    objectives: list[str]        # Từ form (tùy chọn)
    emphasis: str                # Nội dung nhấn mạnh (tùy chọn)
    special_requests: str        # Yêu cầu đặc biệt (tùy chọn)
    uploaded_docs: list[str]     # Text đã parse từ files

    # RAG
    rag_context: list[dict]      # Retrieved chunks

    # Generation
    current_markdown: str        # Pass 1: streaming markdown
    current_plan: dict           # Pass 2: structured JSON
    quality_result: dict         # Quality check result
    iteration: int               # Retry count (max 2)

    # Streaming
    stream_queue: asyncio.Queue  # Push events to SSE

    # Metadata
    error: str | None
```

### Tại sao đơn giản hơn?

| V1 | V2 | Lý do |
|----|-----|-------|
| `intent_router` node (LLM call) | Simple if/else trong API | Không cần LLM để phân loại generate vs refine vs qa |
| `clarify` node + interrupt | Bỏ hoàn toàn | Thông tin bổ sung đã thu thập ở form |
| `qa_responder` node trong graph | Standalone function, không qua graph | QA không cần state phức tạp |
| `refiner` node trong graph | Standalone function, không qua graph | Refine = 1 LLM call, không cần orchestration |
| 7 nodes | 4 nodes core graph + 2 standalone functions | Ít hơn = dễ debug, ít bug |

---

## 8. Database Schema

### Bảng mới/sửa

```sql
-- ============ RESOURCES (THƯ VIỆN TÀI NGUYÊN) ============
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = system resource
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,           -- Supabase Storage URL
    file_size INTEGER,                -- bytes
    page_count INTEGER,
    content_text TEXT,                -- Extracted text (for preview)
    is_embedded BOOLEAN DEFAULT FALSE,-- Đã embed vào pgvector chưa
    is_system BOOLEAN DEFAULT FALSE,  -- TRUE = tài liệu hệ thống (SGK/SGV)
    category TEXT,                    -- 'sgk' | 'sgv' | 'khung_chuong_trinh' | 'khac'
    subject TEXT,                     -- Môn học (Toán, Vật Lý, ...) — dùng cho filter
    grade TEXT,                       -- Lớp (6-12) — dùng cho filter
    description TEXT,                 -- Mô tả ngắn tài liệu
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_resources_user ON resources(user_id);
CREATE INDEX idx_resources_system ON resources(is_system) WHERE is_system = TRUE;
CREATE INDEX idx_resources_subject_grade ON resources(subject, grade) WHERE is_system = TRUE;

-- ============ LESSON PLANS (cập nhật) ============
-- Thêm cột mới vào bảng lesson_plans đã có
ALTER TABLE lesson_plans
    ADD COLUMN IF NOT EXISTS emphasis TEXT,           -- Nội dung nhấn mạnh
    ADD COLUMN IF NOT EXISTS special_requests TEXT,   -- Yêu cầu đặc biệt
    ADD COLUMN IF NOT EXISTS resource_ids UUID[],     -- Link tới resources
    ADD COLUMN IF NOT EXISTS content_markdown TEXT;    -- Markdown output (for inline edit)

-- ============ LESSON PLAN MESSAGES (giữ nguyên) ============
-- Đã có từ V1

-- ============ RAG KNOWLEDGE BASE (giữ nguyên) ============
-- Đã có từ V1

-- ============ RESOURCE EMBEDDINGS ============
CREATE TABLE resource_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
    chunk_index INTEGER,
    chunk_text TEXT,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_resource_emb_resource ON resource_embeddings(resource_id);
CREATE INDEX idx_resource_emb_vector ON resource_embeddings
    USING ivfflat (embedding vector_cosine_ops);
```

---

## 9. Logging & Tracing

### Yêu cầu

1. **Mọi LLM call** phải có trace (input, output, latency, cost, model)
2. **Mọi API request** phải có request_id xuyên suốt từ FE → Gateway → AI Service
3. **Mọi graph node** phải log: node name, input summary, output summary, duration
4. **Error** phải có stack trace + context đầy đủ

### Implementation

#### AI Service — structlog + LangSmith

```python
import structlog
from langsmith import traceable

logger = structlog.get_logger()

@traceable(name="rag_retrieval")   # ← LangSmith trace tự động
async def rag_node(state: GraphState) -> GraphState:
    logger.info("rag.start",
        plan_id=state["plan_id"],
        subject=state["subject"],
        grade=state["grade"],
        topic=state["topic"]
    )

    # ... RAG logic ...

    logger.info("rag.complete",
        plan_id=state["plan_id"],
        chunks_found=len(results),
        top_score=results[0].score if results else 0,
        duration_ms=elapsed
    )
    return state
```

#### API Gateway — Pino + request_id

```typescript
import pino from 'pino';
import { randomUUID } from 'crypto';

// Middleware: inject request_id
app.addHook('onRequest', (req, reply, done) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  reply.header('x-request-id', req.requestId);
  done();
});

// Log format
const logger = pino({
  level: 'info',
  serializers: { req: pino.stdSerializers.req }
});
```

#### Trace Flow

```
Browser → API Gateway → AI Service → LLM
  │            │              │          │
  │     x-request-id    x-request-id    │
  │            │              │          │
  │       Pino log       structlog      LangSmith
  │            │              │          │
  └────────────┴──────────────┴──────────┘
              Tất cả share cùng request_id
```

#### Dashboard tracing

- **LangSmith** (free tier): xem trace từng LLM call, latency, cost
- **Console logs**: structured JSON, có thể pipe vào ELK/Datadog sau
- **Error tracking**: Sentry (optional, thêm sau)

---

## 10. Phân công 3 Roles

### Tổng quan

| Role | Scope | Tech | Deliverables |
|------|-------|------|-------------|
| **FE Engineer** | UI/UX toàn bộ | Next.js, TS, Tailwind, Shadcn | 6 pages + 15 components |
| **BE Engineer** | API Gateway + DB | Node.js, TS, Fastify, Drizzle | 15 endpoints + DB schema + seed data |
| **AI Engineer** | AI Service + Agent | Python, FastAPI, LangGraph | 4 nodes + 2 functions + tracing |

### Chi tiết xem file riêng:
- `FE_TASKS.md` — Chi tiết công việc Frontend
- `BE_TASKS.md` — Chi tiết công việc Backend
- `AI_TASKS.md` — Chi tiết công việc AI Engineer

---

## 11. Sprint Plan

### Sprint 1 (Ngày 1-3): Foundation

| Task | Owner | Priority |
|------|-------|----------|
| Setup Node.js API Gateway project | BE | P0 |
| DB schema migration (resources, lesson_plans update) | BE | P0 |
| Setup project mới: Shadcn/UI, Zustand, layout | FE | P0 |
| Đơn giản hóa LangGraph pipeline (7→4 nodes) | AI | P0 |
| Setup structlog + LangSmith tracing | AI | P0 |

### Sprint 2 (Ngày 4-6): Core Features

| Task | Owner | Priority |
|------|-------|----------|
| CRUD endpoints: plans, resources | BE | P0 |
| SSE proxy endpoint | BE | P0 |
| System resources endpoints + seed data SGK/SGV | BE | P0 |
| Smart Form page (/generate) | FE | P0 |
| Streaming output page (/generate/[id]) | FE | P0 |
| AI generate pipeline hoàn chỉnh | AI | P0 |
| RAG + embedding cho resources (cả system + user) | AI | P0 |

### Sprint 3 (Ngày 7-9): Features + Polish

| Task | Owner | Priority |
|------|-------|----------|
| Chat endpoint + message history | BE | P1 |
| File upload + Supabase Storage | BE | P1 |
| Thư viện Tài nguyên (/resources) — 2 tab: hệ thống + cá nhân | FE | P1 |
| Thư viện Giáo Án (/library) | FE | P1 |
| Inline editor (Tiptap) | FE | P1 |
| Refine + QA standalone functions | AI | P1 |
| Quality checker improvements | AI | P1 |

### Sprint 4 (Ngày 10-12): Integration + Testing

| Task | Owner | Priority |
|------|-------|----------|
| E2E integration testing | ALL | P0 |
| Error handling + edge cases | ALL | P1 |
| DOCX export integration | BE+AI | P1 |
| UI polish + responsive | FE | P2 |
| Performance optimization | ALL | P2 |
| Deploy staging | BE | P1 |

---

## 12. Bảng tổng hợp Files

### API Gateway (Node.js) — MỚI HOÀN TOÀN

```
api-gateway/
├── src/
│   ├── index.ts                    # Fastify entry
│   ├── config.ts                   # Environment config
│   ├── plugins/
│   │   ├── auth.ts                 # Supabase JWT middleware
│   │   ├── cors.ts                 # CORS config
│   │   └── error-handler.ts       # Global error handler
│   ├── routes/
│   │   ├── auth.ts                # /api/auth/*
│   │   ├── plans.ts               # /api/plans/*
│   │   ├── resources.ts           # /api/resources/* (user resources)
│   │   ├── system-resources.ts    # /api/resources/system/* (SGK/SGV)
│   │   ├── chat.ts                # /api/plans/:id/chat
│   │   └── stream.ts              # /api/plans/:id/stream (SSE proxy)
│   ├── services/
│   │   ├── plan.service.ts        # Business logic
│   │   ├── resource.service.ts    # Business logic
│   │   └── ai-client.ts           # HTTP client → AI Service
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema
│   │   ├── client.ts              # DB connection
│   │   └── migrations/            # SQL migrations
│   └── types/
│       └── index.ts               # Shared types
├── package.json
├── tsconfig.json
└── .env
```

### AI Service (Python) — REFACTOR

```
ai-service/
├── app/
│   ├── main.py                     # FastAPI entry
│   ├── config.py                   # Settings
│   ├── api/
│   │   ├── generate.py             # POST /ai/generate
│   │   ├── stream.py               # GET /ai/stream/:plan_id
│   │   ├── chat.py                 # POST /ai/chat/:plan_id
│   │   └── embed.py                # POST /ai/embed
│   ├── graph/
│   │   ├── pipeline.py             # LangGraph StateGraph (4 nodes)
│   │   ├── state.py                # GraphState TypedDict
│   │   ├── nodes/
│   │   │   ├── rag.py              # Node 1: RAG retrieval
│   │   │   ├── generator.py        # Node 2: Generate markdown (stream)
│   │   │   ├── quality_checker.py  # Node 3: Validate
│   │   │   └── formatter.py        # Node 4: JSON + DOCX
│   │   └── standalone/
│   │       ├── refiner.py          # Single LLM call (no graph)
│   │       └── qa.py               # Single LLM call (no graph)
│   ├── services/
│   │   ├── llm.py                  # OpenAI/Gemini client wrapper
│   │   ├── embeddings.py           # Embedding service
│   │   └── vector_store.py         # pgvector search
│   ├── logging/
│   │   ├── setup.py                # structlog config
│   │   └── middleware.py           # Request logging middleware
│   └── schemas/
│       └── lesson_plan.py          # Pydantic models
├── requirements.txt
└── .env
```

### Frontend (Next.js) — REFACTOR

```
frontend/
├── app/
│   ├── layout.tsx                  # Root layout + Navbar
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Auth
│   ├── generate/
│   │   ├── page.tsx                # Smart Form (MỚI: có optional fields)
│   │   └── [planId]/page.tsx       # Streaming + Chat + Inline Edit
│   ├── library/page.tsx            # MỚI: Thư viện Giáo Án
│   ├── resources/page.tsx          # MỚI: Thư viện Tài nguyên
│   └── plans/[id]/page.tsx         # View chi tiết (redirect từ library)
├── components/
│   ├── ui/                         # Shadcn/UI components
│   ├── layout/
│   │   ├── Navbar.tsx              # Navigation bar
│   │   └── Sidebar.tsx             # Optional sidebar
│   ├── generate/
│   │   ├── SmartForm.tsx           # Form + optional fields + dropzone
│   │   ├── StreamingOutput.tsx     # Rich markdown streaming
│   │   ├── InlineEditor.tsx        # Tiptap WYSIWYG per section
│   │   ├── ChatPanel.tsx           # Chat sidebar
│   │   ├── ProgressBar.tsx         # Generation progress
│   │   └── ExportButton.tsx        # Download DOCX
│   ├── library/
│   │   ├── PlanCard.tsx            # Card hiển thị 1 giáo án
│   │   ├── PlanList.tsx            # Danh sách + filter + pagination
│   │   └── DeleteConfirm.tsx       # Dialog xác nhận xóa
│   └── resources/
│       ├── ResourceCard.tsx        # Card hiển thị 1 tài liệu (user)
│       ├── ResourceList.tsx        # Danh sách tài liệu (user)
│       ├── SystemResourceCard.tsx  # Card tài liệu hệ thống (SGK/SGV)
│       ├── SystemResourceList.tsx  # Danh sách + filter tài liệu hệ thống
│       ├── UploadDialog.tsx        # Dialog upload file mới
│       └── ResourcePicker.tsx      # Picker dùng trong SmartForm (cả hệ thống + cá nhân)
├── lib/
│   ├── api.ts                      # API client
│   ├── store.ts                    # Zustand stores
│   ├── types.ts                    # Shared types
│   └── utils.ts                    # Helpers
├── package.json
└── tsconfig.json
```

---

*Cập nhật lần cuối: 2026-04-24 bởi AI System Architect. Mọi thay đổi thiết kế cần cập nhật vào file này.*
