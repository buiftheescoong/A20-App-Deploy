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

### 🏗️ Quyết định Kiến trúc
- **Môi trường ảo (venv)**: Backend và các công cụ hỗ trợ (Harness) chạy hoàn toàn trong `venv` để tránh gây bẩn máy Global.
- **Harness CLI**: Luôn sử dụng `python harness.py [lệnh]` để thao tác với dự án.

---

## 🛠️ Hướng dẫn cho Maintainer mới
- **Chạy dev FE**: `cd frontend && npm run dev`
- **Chạy dev BE**: `python harness.py dev`
- **Design System**: Xem các biến màu chính trong `frontend/app/globals.css`.
