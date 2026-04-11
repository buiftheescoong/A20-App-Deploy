import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soạn Giáo Án Thông Minh | AI Lesson Planner',
  description:
    'Hệ thống AI Multi-Agent hỗ trợ soạn giáo án theo chuẩn GDPT 2018. Giảm 96% thời gian soạn bài từ 2 giờ xuống 3-5 phút.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
