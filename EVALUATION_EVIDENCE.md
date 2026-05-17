# Minh chứng đánh giá

Dự án: A20 App 003 - Soạn giáo án thông minh

Cập nhật lần cuối: 2026-05-17

## Mục tiêu đánh giá

Tài liệu này ghi lại kết quả kiểm thử, bộ câu hỏi kiểm thử, chỉ số, phản hồi và danh sách ảnh chụp màn hình cần dùng khi nộp hoặc demo dự án.

## Tóm tắt trạng thái

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Build frontend | Đạt | `npm.cmd run build` trong `frontend/` đã build thành công |
| Build API Gateway | Đạt | `npm.cmd run build` trong `api-gateway/` đã build thành công |
| Test AI Service | Chưa đạt hoàn toàn | `45 passed`, `4 failed`, `3 warnings` |
| Tài liệu README | Đạt | Đã có link quan trọng, công nghệ, setup, chạy, sử dụng và kiến trúc |
| Architecture evidence | Đạt | Có `ARCHITECTURE_DIAGRAM.md` với mermaid diagram |
| Nhật ký tuần | Đạt | Có mục tiêu, kết quả, khó khăn và cách giải quyết theo tuần |
| Nhật ký công việc | Đạt | Có công việc, thành viên phụ trách, thời gian, trạng thái và ghi chú |
| Ảnh chụp sản phẩm | Đạt có ghi chú | Đã chụp app thật từ Docker production compose; riêng file DOCX tải xuống chưa chụp trực tiếp vì Codex In-app Browser không hỗ trợ download |

## Kết quả kiểm tra gần nhất

Ngày chạy: 2026-05-15

| Lệnh | Kết quả | Chi tiết |
|---|---|---|
| `npm.cmd run build` trong `frontend/` | Đạt | Vite build thành công, tạo bundle trong `dist/` |
| `npm.cmd run build` trong `api-gateway/` | Đạt | TypeScript compile thành công |
| `.\.venv\Scripts\python.exe -m pytest` trong `ai-service/` | Chưa đạt hoàn toàn | 49 tests collected, 45 passed, 4 failed, 3 warnings |

Ghi chú môi trường:

- Gọi `npm run build` trực tiếp trong PowerShell bị chặn bởi execution policy của `npm.ps1`, nên dùng `npm.cmd run build`.
- Build frontend trong sandbox gặp lỗi quyền truy cập của Vite/esbuild; chạy ngoài sandbox thì đạt.
- Python venv cần chạy bằng `.\.venv\Scripts\python.exe` vì command `python` không có trong PATH của shell hiện tại.
- Ngày 2026-05-16 chỉ rà soát và cập nhật tài liệu; chưa chạy lại toàn bộ build/test nên chưa thay đổi số liệu kiểm thử.
- Ngày 2026-05-17 đã build và chạy Docker production compose bằng lệnh `docker compose --env-file .env.docker -f docker-compose.prod.yml up --build -d`.
- Service Docker đã kiểm tra: frontend `http://localhost:8080` trả `200`, API Gateway `http://localhost:3001/health` trả `status: ok` và `database: connected`, AI Service `http://localhost:8000/ai/health` trả `status: ok`.
- Tài khoản dùng để chụp minh chứng: `congthuanthanh1@gmail.com`. Mật khẩu không được ghi vào tài liệu hoặc ảnh minh chứng.

## Đối chiếu yêu cầu trong ảnh

| Nhóm yêu cầu | Minh chứng hiện có | Trạng thái |
|---|---|---|
| README cần có tên dự án, mô tả, mục tiêu, tính năng, công nghệ, cài đặt, chạy và sử dụng | `README.md` | Đạt |
| Đặt link quan trọng ngay đầu README | `README.md` mục "Liên kết quan trọng" | Đạt |
| Có sơ đồ User, Frontend, Backend/API, Database, AI Agent/LLM, External Services và luồng dữ liệu | `README.md` và `ARCHITECTURE_DIAGRAM.md` | Đạt |
| Weekly journal ghi mục tiêu, kết quả, khó khăn, cách giải quyết theo tuần | `JOURNAL.md` | Đạt |
| Worklog ghi thành viên phụ trách, công việc, thời gian, trạng thái, ghi chú | `WORKLOG.md` | Đạt |
| Evaluation evidence ghi test, bộ câu hỏi, metrics, feedback và ảnh chụp màn hình | `EVALUATION_EVIDENCE.md` | Một phần: ảnh app thật chưa chụp |

## Test chưa đạt cần xử lý

| Test | Vấn đề quan sát được | Hướng xử lý đề xuất |
|---|---|---|
| `test_quality_checker_run_clean_pass_with_llm` | Fake LLM trong test nhận sai chữ ký hàm, làm phần LLM review bị skip | Đồng bộ signature của `FakeLLM.call` với cách `quality_checker` đang gọi |
| `test_quality_checker_run_merges_llm_major_issue` | LLM review bị lỗi chữ ký nên không merge issue Major, kết quả vẫn `PASSED` | Sửa mock hoặc adapter để test phản ánh đúng hành vi mong muốn |
| `test_quality_checker_run_llm_outage_skips_review` | Kỳ vọng skipped check chứa `provider down`, nhưng lỗi thực tế là signature mismatch | Sau khi sửa signature, kiểm tra lại logic ghi `skipped_checks` |
| `test_prompt_templates_cover_supported_models` | Prompt 3-phase chưa chứa chuỗi `VẬN DỤNG` như test kỳ vọng | Cập nhật prompt template hoặc cập nhật kỳ vọng test theo format mới |

## Bộ câu hỏi kiểm thử thủ công

| Mã | Câu hỏi kiểm thử | Kết quả kỳ vọng | Trạng thái |
|---|---|---|---|
| TC-01 | Người dùng có thể đăng nhập bằng Supabase không? | Đăng nhập thành công và vào được route được bảo vệ | Cần chạy với env Supabase thật |
| TC-02 | Form `/generate` có tạo plan mới không? | API tạo plan row và chuyển sang trang streaming | Cần chạy end-to-end |
| TC-03 | Streaming có hiển thị tiến trình không? | Frontend nhận progress qua SSE và cập nhật UI | Cần chạy end-to-end |
| TC-04 | Giáo án sinh ra có lưu lại sau refresh không? | Reload vẫn thấy markdown/JSON đã hoàn tất | Cần chạy end-to-end |
| TC-05 | Chat refinement có thêm phản hồi vào giáo án không? | Tin nhắn được lưu và nội dung được tinh chỉnh | Cần chạy end-to-end |
| TC-06 | Export DOCX có tải được file Word không? | File DOCX mở được, giữ tiêu đề, section và bảng hoạt động | Cần chạy end-to-end |

## Chỉ số hiện tại

| Chỉ số | Giá trị | Nguồn |
|---|---:|---|
| Số test AI Service được thu thập | 49 | Pytest ngày 2026-05-15 |
| Test AI Service pass | 45 | Pytest ngày 2026-05-15 |
| Test AI Service fail | 4 | Pytest ngày 2026-05-15 |
| Build sản phẩm frontend | Đạt | Vite build ngày 2026-05-15 |
| API Gateway TypeScript build | Đạt | `tsc` ngày 2026-05-15 |
| Số service chính | 3 | `frontend/`, `api-gateway/`, `ai-service/` |
| Số route frontend chính được tài liệu hóa | 8 | README |

## Phản hồi và hành động tiếp theo

| Nguồn phản hồi | Nội dung | Hành động |
|---|---|---|
| Kiểm thử tự động | AI Service còn 4 test chưa đạt | Ưu tiên sửa trước khi demo kỹ thuật |
| Rà tài liệu | README cần đủ link quan trọng ở đầu | Đã bổ sung trong README |
| Rà kiến trúc | Cần sơ đồ User, Frontend, Backend/API, Database, AI Agent/LLM, External Services | Đã bổ sung sơ đồ tóm tắt trong README và `ARCHITECTURE_DIAGRAM.md`, kèm sơ đồ chi tiết cho triển khai thực tế |
| Rà quy trình nộp | Cần nhật ký tuần, nhật ký công việc và minh chứng đánh giá | Đã bổ sung/cập nhật các file tương ứng |
| Rà minh chứng ảnh | Không được tính ảnh yêu cầu là ảnh chụp sản phẩm | Giữ checklist ảnh app ở trạng thái chưa chụp cho đến khi có file thật |

## Ảnh chụp màn hình đã dùng khi demo

| Màn hình | File minh chứng | Trạng thái |
|---|---|---|
| Trang đăng nhập | [docs/screenshots/01-login.png](docs/screenshots/01-login.png) | Đã chụp |
| Form tạo giáo án | [docs/screenshots/02-generate-form.png](docs/screenshots/02-generate-form.png) | Đã chụp |
| Kết quả tạo giáo án và trình chỉnh sửa | [docs/screenshots/03-generation-result-editor.png](docs/screenshots/03-generation-result-editor.png) | Đã chụp |
| Chat refinement | [docs/screenshots/04-chat-refinement.png](docs/screenshots/04-chat-refinement.png) | Đã chụp |
| Thư viện giáo án | [docs/screenshots/05-library.png](docs/screenshots/05-library.png) | Đã chụp |
| Tài nguyên dạy học | [docs/screenshots/06-resources.png](docs/screenshots/06-resources.png) | Đã chụp |
| Kiểm tra chất lượng và trạng thái tải DOCX | [docs/screenshots/07-quality-check-docx-download.png](docs/screenshots/07-quality-check-docx-download.png) | Đã chụp màn hình luồng/trạng thái tải DOCX trong app |

## Kết luận đánh giá

Frontend và API Gateway đã build thành công. AI Service có phần lớn test đạt nhưng còn 4 test chưa đạt cần sửa trước khi xem là hoàn tất. Bộ tài liệu nộp dự án đã có README, kiến trúc, nhật ký tuần, nhật ký công việc và minh chứng đánh giá theo yêu cầu trong ảnh. Ảnh chụp sản phẩm thật đã được bổ sung từ bản chạy Docker production compose; riêng ảnh file DOCX sau tải xuống cần chụp lại bằng trình duyệt hoặc môi trường có hỗ trợ download nếu cần minh chứng mở file Word trực tiếp.
