# Nhật ký tuần

Dự án: A20 App 003 - Soạn giáo án thông minh

Mục đích: ghi lại mục tiêu, kết quả, khó khăn và cách nhóm xử lý theo từng tuần.

Cập nhật lần cuối: 2026-05-16

## Tuần 1 - 2026-04-11 đến 2026-04-18

### Mục tiêu

- Xác định vấn đề sản phẩm và phạm vi MVP.
- Chốt luồng người dùng cốt lõi cho giáo viên.
- Chọn nền tảng dữ liệu và hướng kiến trúc ban đầu.

### Kết quả

- Xác định bài toán: giáo viên cần soạn giáo án nhanh hơn nhưng vẫn kiểm soát nội dung cuối.
- Phác thảo PRD, kế hoạch hệ thống và đặc tả kỹ thuật ban đầu.
- Chọn luồng chính: tạo giáo án, xem lại, tinh chỉnh, xuất file và tái sử dụng.
- Chọn Supabase cho auth, database, storage và vector store.

### Khó khăn

- Phạm vi ý tưởng ban đầu quá rộng, gồm nhiều agent, workflow duyệt giáo án và dashboard.
- Nhóm dễ bị cuốn vào các tính năng phụ trước khi chứng minh được giá trị cốt lõi.

### Cách giải quyết

- Thu hẹp MVP vào luồng tạo giáo án và xuất DOCX.
- Đưa các ý tưởng lớn hơn vào backlog, chưa triển khai trong bản đầu.
- Dùng PRD để giữ thống nhất giữa sản phẩm, frontend, backend và AI service.

### AI hỗ trợ

| Công cụ | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Brainstorm PRD và kiến trúc | Chuyển ý tưởng rộng thành các user flow và task triển khai |
| Gemini CLI | So sánh phương án kiến trúc | Giúp cân nhắc monolith và tách service |
| Codex | Rà repo và tài liệu | Giúp đồng bộ tài liệu với code hiện tại |

## Tuần 2 - 2026-04-19 đến 2026-04-26

### Mục tiêu

- Dựng khung ba service.
- Hoàn thiện xác thực cơ bản.
- Có route đầu tiên để tạo giáo án và lưu dữ liệu.

### Kết quả

- Thiết lập frontend React/Vite, API Gateway Fastify và AI Service FastAPI.
- Thêm luồng xác thực Supabase và protected routes ở frontend.
- Tạo schema Drizzle cho `lesson_plans`, `lesson_plan_messages`, `resources`, `resource_embeddings`.
- Triển khai route tạo giáo án cơ bản trong API Gateway.

### Khó khăn

- Cần chốt ranh giới trách nhiệm giữa gateway và AI service.
- Auth, upload, lưu database, gọi AI và streaming dễ bị trộn vào cùng một lớp nếu không phân tách sớm.

### Cách giải quyết

- Quy định API Gateway chịu trách nhiệm xác thực, CRUD, upload và proxy.
- Quy định AI Service chịu trách nhiệm RAG, generation, quality check và DOCX.
- Ghi lại quyết định này trong nhật ký công việc để tránh mô tả sai kiến trúc về sau.

### AI hỗ trợ

| Công cụ | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Lập kế hoạch API routes và review schema | Phát hiện một số field cần có cho giáo án/tài nguyên |
| Codex | Review triển khai và docs | Kiểm tra route và service theo file nguồn thực tế |

## Tuần 3 - 2026-04-27 đến 2026-05-04

### Mục tiêu

- Hoàn thiện luồng theo dõi tiến trình sinh giáo án.
- Xây giao diện preview, chat và thư viện tài nguyên.
- Chuẩn bị nền tảng triển khai.

### Kết quả

- Triển khai Server-Sent Events cho tiến trình generation.
- Thêm trang `/generate/:planId` để xem tiến trình và kết quả.
- Thêm trang tài nguyên cho tài nguyên hệ thống và tài nguyên người dùng upload.
- Thêm chat panel và khung preview/editor cho giáo án.
- Thêm `render.yaml` cho ba service trên Render.

### Khó khăn

- Streaming cần phối hợp cả frontend, gateway và AI service.
- Frontend phải giữ state ổn định khi stream kéo dài hoặc bị reconnect.
- Gateway cần vừa proxy event vừa lưu trạng thái cuối cùng.

### Cách giải quyết

- Dùng SSE vì luồng progress chủ yếu đi một chiều từ server tới browser.
- Gateway expose `/api/plans/:id/stream`, AI Service expose `/ai/stream/:plan_id`.
- Lưu markdown/JSON và status cuối cùng để refresh không làm mất nội dung đã sinh.

### AI hỗ trợ

| Công cụ | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Debug SSE và route | Gợi ý cách xử lý reconnect và error handling |
| Codex | Review docs và kiến trúc | Phát hiện tham chiếu cũ tới giả định Next.js |

## Tuần 4 - 2026-05-05 đến 2026-05-11

### Mục tiêu

- Hoàn thiện pipeline AI.
- Thêm RAG từ dữ liệu chương trình học.
- Hỗ trợ kiểm tra chất lượng và xuất DOCX.

### Kết quả

- Thêm LangGraph pipeline: RAG retrieval, generator, quality check, JSON converter và formatter.
- Thêm ingest Markdown thô từ `data/raw/`.
- Lưu embedding vào `resource_embeddings` bằng pgvector.
- Thêm formatter DOCX bằng `python-docx`.
- Thêm endpoint quality check và trang `/check`.

### Khó khăn

- RAG không chỉ là embedding file; dữ liệu cần metadata rõ để truy xuất có ích.
- Quality check cần cân bằng giữa rule-based checks và nhận xét từ LLM.
- DOCX phải đủ dễ đọc, không chỉ là text thô chuyển sang Word.

### Cách giải quyết

- Chuẩn hóa metadata theo bộ sách, môn, lớp, chương, bài và đường dẫn nguồn.
- Tách quality checker thành các rule bắt buộc và phần AI review bổ sung.
- Viết test riêng cho formatter để kiểm tra khổ giấy, thứ tự section và bảng hoạt động.

### AI hỗ trợ

| Công cụ | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Lập kế hoạch LangGraph và quality check | Giúp tách pipeline thành các node nhỏ, rõ trách nhiệm |
| Codex | Kiểm tra luồng RAG/data | Ghi lại constraint của ingest, retrieval và formatter |

## Tuần 5 - 2026-05-12 đến 2026-05-16

### Mục tiêu

- Dọn tài liệu theo yêu cầu nộp dự án trong ảnh.
- Bổ sung README, kiến trúc, nhật ký tuần, nhật ký công việc và minh chứng đánh giá.
- Kiểm tra lại các lệnh build/test hiện có.

### Kết quả

- Cập nhật README tiếng Việt theo checklist: tên dự án, mô tả, mục tiêu, tính năng, công nghệ, cài đặt, chạy, sử dụng và kiến trúc.
- Hoàn thiện sơ đồ kiến trúc trong `ARCHITECTURE_DIAGRAM.md`.
- Viết lại nhật ký tuần theo mục tiêu, kết quả, khó khăn và cách xử lý.
- Viết nhật ký công việc có phân công, thời gian, trạng thái và ghi chú.
- Tạo `EVALUATION_EVIDENCE.md` để ghi kết quả kiểm thử, chỉ số, phản hồi và checklist ảnh chụp.
- Bổ sung bảng đối chiếu yêu cầu để người chấm có thể kiểm tra nhanh từng tài liệu.

### Khó khăn

- Một số tài liệu cũ còn lẫn tiếng Anh, format mẫu và mô tả kiến trúc cũ.
- Khi chạy kiểm tra, build frontend cần chạy ngoài sandbox; pytest AI Service còn 4 test chưa đạt liên quan quality checker và prompt template.
- Cần phân biệt rõ ảnh yêu cầu tài liệu với ảnh chụp màn hình sản phẩm để không ghi nhầm minh chứng chưa có.

### Cách giải quyết

- Chuẩn hóa tài liệu chính sang tiếng Việt.
- Đưa các link quan trọng lên đầu README để người đọc tìm nhanh.
- Ghi kết quả kiểm tra thật vào minh chứng đánh giá, bao gồm cả lỗi còn tồn tại để nhóm xử lý tiếp.
- Giữ ảnh chụp màn hình sản phẩm ở trạng thái "Chưa chụp" cho đến khi có file thật trong `docs/screenshots/`.

### AI hỗ trợ

| Công cụ | Dùng để làm gì | Kết quả |
|---|---|---|
| Codex | Rà repo, chạy kiểm tra và viết lại tài liệu | Tạo bộ tài liệu nộp dự án bám sát codebase hiện tại |

## Kế hoạch tiếp theo

- Sửa 4 test chưa đạt trong AI Service.
- Dọn lỗi encoding còn lại trong chuỗi UI nếu gặp.
- Chụp ảnh các màn hình demo sau khi chạy đủ env Supabase.
- Mở rộng corpus RAG ngoài dữ liệu lớp 8 nếu phạm vi demo yêu cầu.
