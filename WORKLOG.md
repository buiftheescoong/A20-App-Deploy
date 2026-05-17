# Nhật ký công việc

Dự án: A20 App 003 - Soạn giáo án thông minh

Mục đích: ghi lại thành viên phụ trách, công việc, thời gian, trạng thái hoàn thành, ghi chú triển khai, quyết định kỹ thuật và rủi ro.

Cập nhật lần cuối: 2026-05-16

## Trạng thái hiện tại

Dự án đang ở trạng thái MVP ba service:

- `frontend/`: React 18, Vite, Tailwind CSS, React Router, Zustand.
- `api-gateway/`: Fastify, TypeScript, Drizzle ORM, Supabase integration.
- `ai-service/`: FastAPI, LangGraph, OpenAI/Gemini, RAG, DOCX formatting.
- `data/raw/`: Corpus Markdown cho RAG chương trình học.

Luồng chính:

```text
Form giáo viên -> API Gateway -> AI Service -> SSE progress -> lưu giáo án -> chat/edit -> xuất DOCX
```

## Bảng phân công tổng hợp

| Thời gian | Công việc | Thành viên phụ trách | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 2026-04-11 đến 2026-04-18 | Xác định PRD và MVP user flow | Product/docs | Xong | Tập trung vào generate, refine, export và reuse |
| 2026-04-11 đến 2026-04-18 | Chọn kiến trúc service | Cả nhóm | Xong | Tách frontend, gateway và AI service |
| 2026-04-19 đến 2026-04-26 | Tạo database schema ban đầu | Backend | Xong | Drizzle schema cho plans, messages, resources, embeddings |
| 2026-04-19 đến 2026-04-26 | Thêm Supabase auth path | Frontend/backend | Xong | Protected routes và JWT verification |
| 2026-04-19 đến 2026-04-26 | Xây route tạo giáo án | Backend | Xong | `POST /api/plans` |
| 2026-04-19 đến 2026-04-26 | Thêm SmartForm frontend | Frontend | Xong | Field bắt buộc và tùy chọn |
| 2026-04-27 đến 2026-05-04 | Thêm SSE stream proxy | Backend/AI | Xong | Gateway proxy stream từ AI Service |
| 2026-04-27 đến 2026-05-04 | Thêm trang streaming | Frontend | Xong | Progress, preview và export |
| 2026-04-27 đến 2026-05-04 | Thêm thư viện tài nguyên | Frontend/backend | Xong | Tab hệ thống và cá nhân |
| 2026-05-05 đến 2026-05-11 | Xây LangGraph pipeline | AI | Xong | RAG, generate, check, JSON, format |
| 2026-05-05 đến 2026-05-11 | Thêm raw data ingestion | AI/data | Xong | `python -m app.scripts.ingest_raw_data` |
| 2026-05-05 đến 2026-05-11 | Lưu resource embeddings | AI/data | Xong | pgvector chunks |
| 2026-05-05 đến 2026-05-11 | Thêm DOCX formatter | AI | Xong | `python-docx`, có test formatter |
| 2026-05-05 đến 2026-05-11 | Thêm quality-check endpoint | AI/backend | Xong | Dùng bởi trang `/check` |
| 2026-05-12 đến 2026-05-15 | Thêm chat refinement flow | Frontend/backend/AI | Xong | QA và refinement paths |
| 2026-05-12 đến 2026-05-15 | Thêm inline editing support | Frontend/backend | Xong | `PATCH /api/plans/:id` |
| 2026-05-12 đến 2026-05-15 | Chuẩn bị demo script | Docs | Xong | Cập nhật theo Vite và corpus hiện tại |
| 2026-05-12 đến 2026-05-15 | Hoàn thiện README, nhật ký tuần, nhật ký công việc, minh chứng đánh giá | Docs | Xong | Bám theo checklist tài liệu trong ảnh |
| 2026-05-15 | Chạy build/test để lấy minh chứng | Docs/QA | Một phần | Frontend và gateway build đạt; AI pytest còn 4 test chưa đạt |
| 2026-05-16 | Đối chiếu tài liệu với yêu cầu trong ảnh | Docs | Xong | Bổ sung checklist README, sơ đồ tóm tắt kiến trúc và trạng thái ảnh chụp chưa có |

## Quyết định kiến trúc

### ADR-1 - Tách Frontend, API Gateway và AI Service - 2026-04-12

**Bối cảnh:** Sản phẩm cần cả hành vi web app thông thường và các tác vụ AI nặng. Nếu gom auth, CRUD, upload, RAG, LLM calls và DOCX formatting vào một service, code sẽ khó vận hành và khó bảo trì.

**Các phương án đã cân nhắc:**

- Một FastAPI monolith.
- Một backend Node.js duy nhất.
- Tách Node.js API Gateway và Python AI Service.

**Quyết định:** Dùng kiến trúc tách lớp: frontend React/Vite, API Gateway Fastify và AI Service FastAPI.

**Tác động:** Mỗi lớp có trách nhiệm rõ. Gateway xử lý phần hướng ra browser, AI Service xử lý thư viện AI/Python. Local development cần chạy ba terminal.

### ADR-2 - Dùng React/Vite cho frontend - 2026-04-14

**Bối cảnh:** Planning cũ từng nhắc Next.js, nhưng triển khai hiện tại là Vite với React Router.

**Các phương án đã cân nhắc:**

- Tiếp tục với Next.js.
- Dùng React/Vite và client-side routing.

**Quyết định:** Dùng React/Vite.

**Tác động:** Frontend local chạy tại `http://localhost:5173`. Env keys dùng `VITE_*`. Tài liệu không mô tả app là Next.js.

### ADR-3 - Dùng Supabase cho Auth, Database, Storage và pgvector - 2026-04-15

**Bối cảnh:** MVP cần auth, lưu giáo án, lưu file và vector search mà không muốn vận hành nhiều dịch vụ hạ tầng.

**Các phương án đã cân nhắc:**

- Dùng Supabase cho toàn bộ data services.
- Tách riêng PostgreSQL, S3-compatible storage, auth provider và vector DB.

**Quyết định:** Dùng Supabase làm nền tảng chung.

**Tác động:** MVP setup nhanh hơn. Độ ổn định production phụ thuộc vào cấu hình env Supabase và rule auth/RLS đúng.

### ADR-4 - Dùng SSE cho tiến trình generation - 2026-04-20

**Bối cảnh:** Sinh giáo án là tác vụ lâu hơn request CRUD thông thường, giáo viên cần thấy tiến trình.

**Các phương án đã cân nhắc:**

- Polling trạng thái giáo án.
- WebSocket.
- Server-Sent Events.

**Quyết định:** Dùng SSE qua API Gateway.

**Tác động:** Frontend nghe `/api/plans/:id/stream`. Gateway proxy event từ AI Service và lưu trạng thái hoàn tất.

### ADR-5 - Dùng LangGraph pipeline cho điều phối AI - 2026-04-26

**Bối cảnh:** Generation cần retrieval, draft, kiểm tra, chuyển đổi cấu trúc và formatting.

**Các phương án đã cân nhắc:**

- Một prompt lớn.
- Chuỗi function Python thủ công.
- State machine bằng LangGraph.

**Quyết định:** Dùng LangGraph với các node RAG retrieval, generator, quality check, JSON converter và formatter.

**Tác động:** Pipeline dễ inspect và mở rộng hơn. Quality check fail có thể quay lại generator cho đến `MAX_ITERATIONS`.

### ADR-6 - Ingest corpus Markdown thô cho RAG - 2026-05-01

**Bối cảnh:** Tài nguyên hệ thống cần text thật có thể search, không chỉ là placeholder row.

**Các phương án đã cân nhắc:**

- Chỉ seed placeholder resource rows.
- Lưu PDF trực tiếp và parse mỗi request.
- Ingest Markdown đã chuẩn hóa trong `data/raw/`.

**Quyết định:** Ingest Markdown vào `resources` và `resource_embeddings`.

**Tác động:** RAG có thể retrieve chunk kèm metadata hữu ích. Phạm vi corpus hiện tại còn giới hạn và cần mở rộng có chủ đích.

### ADR-7 - Sinh DOCX trong AI Service - 2026-05-03

**Bối cảnh:** Sản phẩm phải cung cấp file Word có thể chỉnh sửa.

**Các phương án đã cân nhắc:**

- Sinh DOCX ở frontend.
- Sinh DOCX trong API Gateway.
- Sinh DOCX trong AI Service bằng thư viện Python.

**Quyết định:** Sinh DOCX trong AI Service.

**Tác động:** Formatting nằm gần structured lesson-plan JSON. Gateway có thể proxy hoặc lưu output export.

### ADR-8 - Giữ AI prompt logging tự động - 2026-05-13

**Bối cảnh:** Quy định dự án yêu cầu ghi log prompt AI, nhưng nhóm không nên cập nhật prompt log thủ công.

**Các phương án đã cân nhắc:**

- Cập nhật `PROMPT_LOG.md` thủ công.
- Dùng hooks tự động.

**Quyết định:** Dùng hooks đã cấu hình và chạy `bash scripts/setup_hooks.sh` trước khi làm PR.

**Tác động:** Không commit `.ai-log/*.jsonl`. Log sẽ được submit khi `git push`.

## Ghi chú triển khai

### Tạo giáo án

- Frontend gửi multipart form data từ `SmartForm`.
- Gateway validate field bằng Zod.
- Gateway upload file đính kèm lên Supabase Storage.
- Gateway tạo plan row trước khi gọi AI Service.
- AI generation được trigger background.

### Streaming

- Frontend dùng `EventSource`.
- Gateway endpoint là `/api/plans/:id/stream`.
- AI Service endpoint là `/ai/stream/:plan_id`.
- Gateway lưu content và status cuối cùng sau khi stream hoàn tất.

### Tài nguyên và RAG

- File upload của user được lưu thành resources.
- Tài nguyên hệ thống có thể được seed hoặc ingest từ `data/raw/`.
- Resource sau ingest có metadata về bộ sách, môn, lớp, chương, bài và đường dẫn nguồn.
- Embedding được lưu trong `resource_embeddings`.

### Export

- DOCX generation chạy trong AI Service.
- API Gateway expose export qua plan routes.
- Nếu nội dung bị edit sau khi DOCX đã tạo, file export hiện có có thể trở thành stale.

## Rủi ro và việc cần làm tiếp

| Rủi ro | Mức độ | Việc cần làm |
|---|---|---|
| AI Service pytest còn 4 test chưa đạt | Cao | Sửa mock LLM call signature/skipped check và cập nhật prompt template cho 3-phase |
| Trạng thái AI đang chạy nằm trong memory | Trung bình | Cân nhắc durable job state hoặc queue khi lên production |
| Corpus RAG còn giới hạn | Trung bình | Thêm Markdown cho nhiều lớp/môn hơn |
| Sai cấu hình Supabase env có thể làm local run fail | Trung bình | Giữ `.env.example` và guide luôn cập nhật |
| Placeholder system resource dễ bị hiểu nhầm là dữ liệu đã embed | Thấp | Làm rõ trong docs và nhãn UI |

## Checklist PR

- Chạy `bash scripts/setup_hooks.sh` trước khi tạo PR.
- Không commit `.ai-log/*.jsonl`.
- PR description cần có:

```markdown
## Summary
<mô tả thay đổi>

## Changes
- <danh sách file thay đổi>
```

- Chạy kiểm tra phù hợp với phần đã sửa:

```bash
cd frontend && npm run build
cd ../api-gateway && npm run build
cd ../ai-service && pytest
```
