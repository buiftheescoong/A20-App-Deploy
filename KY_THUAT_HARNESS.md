# 🛡️ Kỹ Thuật Harness Engineering (Bản Tiếng Việt)

Tài liệu này chi tiết về hạ tầng kỹ thuật (Harness) được thiết lập để hỗ trợ quá trình phát triển dự án bằng AI.

## 🏗️ Cấu trúc "Harness"

Hệ thống Harness của chúng ta bao gồm 4 trụ cột chính:

### 1. Khả năng quan sát (Observability)
Mọi tương tác giữa Con người và AI đều được ghi lại một cách minh bạch.
- **Log Files**: Lưu trữ tại `.ai-log/session.jsonl`.
- **Hooks**: Script `scripts/submit_log.py` tự động đẩy log lên server mỗi khi thực hiện lệnh `git push`. Điều này đảm bảo quá trình học tập và làm việc của chúng ta luôn được lưu vết.

### 2. Rào chắn bảo vệ (Guardrails)
Chúng ta thiết lập các quy tắc nghiêm ngặt để AI không làm hỏng dự án.
- **`AGENTS.md`**: Chứa các quy tắc "bất di bất dịch" mà mọi AI Agent phải tuân theo.
- **PR Requirements**: Quy định định dạng mô tả Pull Request để đảm bảo tính dễ hiểu.

### 3. Xác minh tự động (Automated Verification)
Đây là "bộ lọc" quan trọng nhất để đảm bảo chất lượng code.
- **Pre-push Hook**: Trước khi code được đẩy lên, hệ thống sẽ tự động chạy:
    1.  `scripts/verify_harness.py`: Kiểm tra xem các cấu hình hook và môi trường có đúng không.
    2.  `scripts/run_tests.py`: Chạy toàn bộ các bài unit test (pytest).
- **Quy tắc**: Nếu bất kỳ bài kiểm tra nào thất bại, lệnh `git push` sẽ bị chặn (tùy cấu hình) hoặc ít nhất sẽ cảnh báo mạnh mẽ.

### 4. Quy trình tự động hóa (Automation)
- **`setup_hooks.sh`**: Script duy nhất để thiết lập toàn bộ môi trường cho một nhà phát triển mới hoặc AI Agent mới.
- **Template**: Mẫu Pull Request sẵn có tại `.github/pull_request_template.md`.

---

## 🛠️ Cách bảo trì Harness

Nếu bạn muốn thay đổi cách hệ thống hoạt động:
1.  **Thêm test**: Viết file test mới vào thư mục `tests/` và chạy `python scripts/run_tests.py`.
2.  **Cập nhật quy tắc AI**: Sửa đổi file `AGENTS.md`.
3.  **Thay đổi Logic Push**: Chỉnh sửa file `.git/hooks/pre-push` thông qua script `setup_hooks.sh`.

---

## 🛑 Lưu ý Quan Trọng (CAUTION)

> [!CAUTION]
> Đừng bao giờ tắt các script hooks này trừ khi có lý do cực kỳ đặc biệt. Việc tắt harness sẽ làm mất đi khả năng kiểm soát chất lượng code của AI.

---

*Harness này được thiết kế để bạn có thể tự tin "Vibe Coding" mà không sợ làm hỏng dự án.*
