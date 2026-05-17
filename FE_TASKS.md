# 🎨 FE Engineer — Chi tiết công việc

> **Project:** Giáo Án Thông Minh V2
> **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI, Zustand, Tiptap, react-markdown
> **Ngày tạo:** 2026-04-24

---

## Tổng quan

FE Engineer chịu trách nhiệm toàn bộ giao diện người dùng. Mục tiêu: tạo trải nghiệm mượt mà, streaming output đẹp, inline editing, và 2 trang mới (Thư viện Tài nguyên + Thư viện Giáo Án).

---

## Phase 1: Setup & Foundation (Ngày 1-2)

### Task 1.1: Setup project mới
- [ ] Cài Shadcn/UI: `npx shadcn-ui@latest init`
- [ ] Cài dependencies: `zustand`, `react-markdown`, `remark-gfm`, `react-dropzone`, `@tiptap/react`, `lucide-react`
- [ ] Cấu hình Tailwind theme (colors, fonts cho giáo dục VN)
- [ ] Tạo layout chung: `app/layout.tsx` với Navbar

### Task 1.2: Navbar component
- [ ] Logo + tên app
- [ ] Navigation links: Soạn giáo án, Thư viện, Tài nguyên
- [ ] User avatar dropdown (profile, logout)
- [ ] Mobile responsive hamburger menu
- [ ] Active link indicator

### Task 1.3: Zustand stores
- [ ] `useAuthStore` — user info, token
- [ ] `usePlanStore` — current plan data, streaming state
- [ ] `useResourceStore` — user resources list, upload state
- [ ] `useSystemResourceStore` — system resources list (SGK/SGV), filters (subject, grade, category)
- [ ] `useLibraryStore` — plans list, filters, pagination

### Task 1.4: API client (`lib/api.ts`)
- [ ] Base URL config (env variable)
- [ ] Auth header injection (Bearer token)
- [ ] Error handling wrapper
- [ ] Type-safe fetch functions:
  ```typescript
  // Plans
  createPlan(data: CreatePlanInput): Promise<{ plan_id: string }>
  getPlans(params: ListParams): Promise<PaginatedResponse<Plan>>
  getPlan(id: string): Promise<Plan>
  updatePlan(id: string, data: UpdatePlanInput): Promise<Plan>
  deletePlan(id: string): Promise<void>

  // User Resources
  uploadResource(file: File): Promise<Resource>
  getResources(): Promise<Resource[]>
  deleteResource(id: string): Promise<void>

  // System Resources (SGK/SGV có sẵn)
  getSystemResources(params?: { subject?: string; grade?: string; category?: string; search?: string }): Promise<SystemResource[]>
  getSystemResource(id: string): Promise<SystemResource>
  downloadSystemResource(id: string): Promise<Blob>

  // Chat
  sendMessage(planId: string, message: string, files?: File[]): Promise<void>
  getMessages(planId: string): Promise<Message[]>

  // SSE
  openStream(planId: string): EventSource

  // Export
  downloadDocx(planId: string): Promise<Blob>
  ```

### Task 1.5: TypeScript types (`lib/types.ts`)
- [ ] `Plan`, `PlanStatus`, `CreatePlanInput`, `UpdatePlanInput`
- [ ] `Resource`, `ResourceUpload`
- [ ] `SystemResource` — extends Resource với `is_system: true`, `category`, `subject`, `grade`, `description`
- [ ] `ResourceCategory` — `'sgk' | 'sgv' | 'khung_chuong_trinh' | 'khac'`
- [ ] `Message`, `MessageRole`
- [ ] `SSEEvent`, `StreamChunk`, `ProgressEvent`
- [ ] `PaginatedResponse<T>`, `ListParams`

---

## Phase 2: Core Pages (Ngày 3-5)

### Task 2.1: Smart Form — `/generate/page.tsx`

**Mô tả:** Thay thế form cũ + loại bỏ clarify flow. Tất cả thông tin thu thập tại đây.

- [ ] **Section 1: Thông tin cơ bản (bắt buộc)**
  - Select: Môn học (dropdown với danh sách môn GDPT 2018)
  - Select: Lớp (6-12)
  - Input: Tên bài học (text, required)
  - Select: Mô hình dạy học (5E / 3 giai đoạn)

- [ ] **Section 2: Tài liệu tham khảo (tùy chọn)**
  - Dropzone: Kéo thả PDF/DOCX/TXT (upload trực tiếp)
  - File list: hiện file đã chọn + nút xóa + file size
  - Button: "Chọn từ Thư viện" → mở ResourcePicker modal (cả hệ thống + cá nhân)
  - Hiện tài liệu đã chọn với badge phân biệt:
    - 📕 "SGK Toán 11" (hệ thống) ✕
    - 📄 "de_cuong.pdf" (upload) ✕
    - 📁 "Tài liệu của tôi" (thư viện cá nhân) ✕

- [ ] **Section 3: Thông tin bổ sung (tùy chọn) — THAY THẾ CLARIFY**
  - Textarea: "Mục tiêu bài học" (placeholder gợi ý)
  - Textarea: "Nội dung muốn nhấn mạnh" (placeholder gợi ý)
  - Textarea: "Yêu cầu đặc biệt" (placeholder: "VD: Dùng Kahoot khởi động, nhóm 4 HS...")
  - Collapsible section (mặc định mở, có thể collapse)

- [ ] **Submit button:** "🚀 Tạo Giáo Án"
  - Loading state khi submit
  - Gửi `FormData` (multipart) tới API Gateway
  - Redirect tới `/generate/{plan_id}` sau khi nhận response

- [ ] **URL params:**
  - `?resource_id=xxx` — pre-fill tài liệu cá nhân từ Thư viện
  - `?system_resource_id=xxx` — pre-fill tài liệu hệ thống (SGK/SGV)

### Task 2.2: Streaming Output — `/generate/[planId]/page.tsx`

**Mô tả:** Trang chính hiển thị output giáo án đang gen + chat panel bên phải.

- [ ] **Layout 2 cột:**
  - Trái (60-70%): Document output (streaming markdown)
  - Phải (30-40%): Chat panel
  - Responsive: mobile → 1 cột, tab switch giữa Doc và Chat

- [ ] **Progress Bar (top)**
  - Steps: RAG → Generating → Quality Check → Done
  - Animated progress based on SSE `progress` events
  - Show elapsed time

- [ ] **SSE Connection**
  ```typescript
  useEffect(() => {
    const sse = new EventSource(`${API_BASE}/api/plans/${planId}/stream`);

    sse.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
    });

    sse.addEventListener('chunk', (e) => {
      const data = JSON.parse(e.data);
      setMarkdown(prev => prev + data.delta);
    });

    sse.addEventListener('plan', (e) => {
      const data = JSON.parse(e.data);
      setPlanJSON(data);
    });

    sse.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setIsComplete(true);
      setDocxUrl(data.docx_url);
      sse.close();
    });

    sse.addEventListener('error', (e) => {
      handleError(e);
      sse.close();
    });

    return () => sse.close();
  }, [planId]);
  ```

- [ ] **StreamingOutput component**
  - Render markdown bằng `react-markdown` + `remark-gfm`
  - Smooth scroll-to-bottom khi có content mới
  - Syntax highlighting cho code blocks (nếu có)
  - Table rendering đẹp (bảng giáo án)
  - Heading styling phù hợp (I, II, III...)
  - Cursor animation ở cuối khi đang streaming

- [ ] **Sau khi gen xong:**
  - Hiện nút "📥 Tải DOCX"
  - Hiện nút "♻️ Tạo lại"
  - Badge "✅ Đạt chuẩn GDPT 2018" hoặc "⚠️ Cần xem lại"
  - Mỗi section hiện icon ✏️ khi hover → click để inline edit

### Task 2.3: Chat Panel component

- [ ] Message list (scroll, auto-scroll to bottom)
- [ ] Message bubbles:
  - User: màu xanh, align phải
  - AI: màu xám/trắng, align trái, streaming typewriter
  - System: centered, italic, nhỏ hơn
- [ ] Input bar:
  - Textarea (auto-resize)
  - Button 📎 (attach file)
  - Button ➤ (send)
  - Enter to send, Shift+Enter newline
- [ ] Loading indicator khi AI đang phản hồi
- [ ] Gọi `POST /api/plans/:id/chat` khi send

### Task 2.4: Inline Editor (Tiptap)

- [ ] Khi user click ✏️ trên 1 section:
  - Section chuyển từ markdown view → Tiptap rich text editor
  - Toolbar nhỏ: Bold, Italic, List, Undo, Redo
  - Nút Save + Cancel
- [ ] Save: gọi `PATCH /api/plans/:id` với content mới
- [ ] Cancel: revert về content cũ
- [ ] Chỉ 1 section được edit tại 1 thời điểm

---

## Phase 3: New Pages (Ngày 6-8)

### Task 3.1: Thư viện Tài nguyên — `/resources/page.tsx`

**Layout 2 tab:** Trang có 2 tab chính, mặc định hiện tab "Tài liệu hệ thống" (vì user mới vào thấy ngay nội dung hữu ích).

- [ ] **Header:** Title "Thư viện Tài nguyên" + nút "Upload mới" (luôn hiện)
- [ ] **Tabs:** `[📖 Tài liệu hệ thống]` `[📁 Tài liệu của tôi]`

#### Tab 1: Tài liệu hệ thống (default active)

- [ ] **Filter bar:** [Môn ▼] [Lớp ▼] [Loại ▼ (SGK/SGV)] + 🔍 Tìm kiếm
- [ ] **System resource list:**
  - Card layout, mỗi card:
    - Icon theo loại (📕 SGK, 📗 SGV)
    - Tên tài liệu + badge loại + badge lớp
    - Mô tả ngắn (description)
    - Số trang
  - Actions: [📖 Xem] [📝 Soạn giáo án] [📥 Tải về]
- [ ] **Click "Soạn giáo án":** `router.push('/generate?system_resource_id=${id}')`
- [ ] **Click "Tải về":** Download file gốc (GET /api/resources/system/:id/download)
- [ ] **Click "Xem":** Mở preview panel/modal hiện content_text
- [ ] **Empty state:** "Đang chuẩn bị tài liệu hệ thống..."

#### Tab 2: Tài liệu của tôi

- [ ] **Search bar:** Tìm kiếm theo tên file
- [ ] **User resource list:**
  - Card layout hoặc table layout (toggle)
  - Mỗi item: icon file type, tên, size, ngày upload
  - Actions: Xem, Soạn giáo án từ đây, Xóa
- [ ] **Upload dialog (modal):**
  - Dropzone
  - Uploading progress bar
  - Success → refresh list
- [ ] **Click "Soạn giáo án từ tài liệu":**
  - `router.push('/generate?resource_id=${id}')`
- [ ] **Xóa:** Confirm dialog → DELETE API → refresh list
- [ ] **Empty state:** Illustration + "Chưa có tài liệu nào. Upload tài liệu để bắt đầu!"

### Task 3.2: Thư viện Giáo Án — `/library/page.tsx`

- [ ] **Header:** Title
- [ ] **Filters:**
  - Dropdown: Môn học
  - Dropdown: Lớp
  - Sort: Mới nhất / Cũ nhất
- [ ] **Plan list:**
  - Card layout
  - Mỗi card: Tên bài, Môn-Lớp, Mô hình, Ngày tạo, Badge đạt/không đạt
  - Actions: Xem, Tải DOCX, Xóa
- [ ] **Click "Xem":** `router.push('/plans/${id}')`
- [ ] **Xóa:** Confirm dialog → DELETE API → refresh list
- [ ] **Pagination:** Page-based hoặc infinite scroll
- [ ] **Empty state:** "Chưa có giáo án nào. Bắt đầu soạn ngay!"

### Task 3.3: Plan Detail — `/plans/[id]/page.tsx`

- [ ] Full-page view giáo án (rich markdown)
- [ ] Sidebar hoặc top bar: metadata (môn, lớp, ngày, trạng thái)
- [ ] Actions: Tải DOCX, Sửa (→ redirect /generate/[id]), Xóa
- [ ] Chat history (nếu có)

---

## Phase 4: Polish (Ngày 9-10)

### Task 4.1: Loading & Error states
- [ ] Skeleton loaders cho mỗi page
- [ ] Error boundary component
- [ ] Toast notifications (success, error)
- [ ] 404 page
- [ ] Network error retry UI

### Task 4.2: Responsive design
- [ ] Mobile: Navbar → hamburger
- [ ] Mobile: 2-column → 1-column + tabs
- [ ] Tablet: adjusted spacing
- [ ] Test trên Chrome, Safari, Firefox

### Task 4.3: Animations & micro-interactions
- [ ] Page transitions (framer-motion optional)
- [ ] Streaming cursor blink animation
- [ ] Button hover/press states
- [ ] Card hover lift effect
- [ ] Progress bar animation

### Task 4.4: Accessibility
- [ ] Keyboard navigation
- [ ] ARIA labels
- [ ] Focus management
- [ ] Color contrast (WCAG AA)

---

## Components Checklist

| Component | File | Priority | Status |
|-----------|------|----------|--------|
| Navbar | `components/layout/Navbar.tsx` | P0 | ⬜ |
| SmartForm | `components/generate/SmartForm.tsx` | P0 | ⬜ |
| StreamingOutput | `components/generate/StreamingOutput.tsx` | P0 | ⬜ |
| ChatPanel | `components/generate/ChatPanel.tsx` | P0 | ⬜ |
| InlineEditor | `components/generate/InlineEditor.tsx` | P1 | ⬜ |
| ProgressBar | `components/generate/ProgressBar.tsx` | P0 | ⬜ |
| ExportButton | `components/generate/ExportButton.tsx` | P1 | ⬜ |
| SystemResourceCard | `components/resources/SystemResourceCard.tsx` | P0 | ⬜ |
| SystemResourceList | `components/resources/SystemResourceList.tsx` | P0 | ⬜ |
| ResourceCard | `components/resources/ResourceCard.tsx` | P1 | ⬜ |
| ResourceList | `components/resources/ResourceList.tsx` | P1 | ⬜ |
| UploadDialog | `components/resources/UploadDialog.tsx` | P1 | ⬜ |
| ResourcePicker | `components/resources/ResourcePicker.tsx` | P0 | ⬜ |
| PlanCard | `components/library/PlanCard.tsx` | P1 | ⬜ |
| PlanList | `components/library/PlanList.tsx` | P1 | ⬜ |
| DeleteConfirm | `components/library/DeleteConfirm.tsx` | P2 | ⬜ |
| Skeleton | `components/ui/Skeleton.tsx` | P2 | ⬜ |

---

## Dependencies cần cài

```bash
# Shadcn/UI
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card dialog dropdown-menu input label select separator sheet tabs textarea toast

# Core
npm install zustand react-markdown remark-gfm react-dropzone lucide-react

# Rich text editor
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# Optional
npm install framer-motion  # animations
npm install date-fns       # date formatting
```

---

## API Contract (FE cần từ BE)

FE sẽ gọi các endpoint sau. BE cần implement đúng contract:

```typescript
// POST /api/plans — tạo plan mới
Request: FormData { subject, grade, topic, teaching_model, objectives?, emphasis?, special_requests?, files[]?, resource_ids[]?, system_resource_ids[]? }
Response: { plan_id: string }

// GET /api/plans/:id/stream — SSE
Events: progress, chunk, plan, done, error

// GET /api/plans — list
Query: ?page=1&limit=10&subject=Toán&grade=11&sort=newest
Response: { data: Plan[], total: number, page: number }

// PATCH /api/plans/:id — inline edit
Request: { content_markdown: string } hoặc { sections: { [key]: string } }
Response: Plan

// DELETE /api/plans/:id
Response: 204

// POST /api/plans/:id/chat
Request: FormData { message, files[]? }
Response: 202

// GET /api/plans/:id/messages
Response: Message[]

// POST /api/resources — upload (tài liệu cá nhân)
Request: FormData { file }
Response: Resource

// GET /api/resources — list user resources
Response: Resource[]

// DELETE /api/resources/:id — xóa tài liệu cá nhân
Response: 204

// GET /api/resources/system — list system resources (SGK/SGV)
Query: ?subject=Toán&grade=11&category=sgk&search=hàm+số
Response: SystemResource[]

// GET /api/resources/system/:id — chi tiết system resource
Response: SystemResource

// GET /api/resources/system/:id/download — tải file gốc
Response: Blob

// GET /api/plans/:id/export
Response: Blob (DOCX)
```

---

## Xóa files cũ

- [ ] `frontend/app/generate/[task_id]/clarify/` — toàn bộ thư mục
- [ ] `frontend/components/ClarificationDialog.tsx` — nếu còn
- [ ] Mọi reference tới polling `setInterval`, `pollStatus`

---

*File này dành riêng cho FE Engineer. Xem ARCHITECTURE_UPGRADE_PLAN.md cho tổng quan hệ thống.*
