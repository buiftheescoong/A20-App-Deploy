# 📜 Nhật ký Bảo trì Frontend (Soạn Giáo Án Thông Minh)

Tài liệu này ghi lại các thay đổi quan trọng, quyết định kiến trúc và các "hack" cần lưu ý để đội ngũ FE có thể maintain dễ dàng.

---

## 📅 [2026-04-11] - Khởi tạo & Thiết lập nền móng

### ✅ Đã thực hiện
1.  **Thiết lập Môi trường**:
    - Khởi tạo Next.js 14.2.5 (App Router).
    - Cấu hình TailwindCSS + Vanilla CSS (Hybrid).
    - Tích hợp Supabase Auth.
2.  **Cài đặt thư viện UI chuyên sâu**:
    - `framer-motion`: Cho các hiệu ứng chuyển động cao cấp.
    - `lucide-react`: Bộ icon hiện đại.
    - `clsx` & `tailwind-merge`: Quản lý Class name thông minh.

---

## 📅 [2026-04-11] - Tích hợp & Sửa lỗi Real Mode

### ✅ Đã thực hiện
1.  **Chuyển đổi Real Mode**:
    - Ngắt chế độ `Mock Database` (`USE_MOCK_DB=false`) và `Mock Frontend`.
    - Cấu hình kết nối Supabase Cloud cho toàn bộ dự án.
2.  **Sửa lỗi Critical**:
    - **Lỗi 404 Route**: Bổ sung trang chi tiết giáo án tại `/plans/[id]`.
    - **Lỗi Storage 404**: Cấu hình các Bucket `templates` và `documents` sang chế độ **Public** để cho phép tải file.
    - **Lỗi Mock DB logic**: Sửa lỗi `KeyError: 0` khi tạo giáo án mới trong chế độ Offline.
3.  **Tối ưu hóa**:
    - Sử dụng `Path(__file__)` trong Backend để đảm bảo file `mock_db.json` luôn được tìm thấy chính xác.

### ⚠️ Lưu ý cho Teamate
- **Supabase Schema**: Cần chạy file `backend/scripts/schema.sql` trong SQL Editor của Supabase nếu khởi tạo dự án mới.
- **Storage**: Đảm bảo bucket `documents` luôn ở trạng thái **Public** thì tính năng Tải DOCX mới hoạt động.

---

## 🛠️ Hướng dẫn cho Maintainer mới
- **Chạy dev FE**: `cd frontend && npm run dev`
- **Chạy dev BE**: `python harness.py dev`
- **Design System**: Xem các biến màu chính trong `frontend/app/globals.css`.
