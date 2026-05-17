'use client';

import { Link } from 'react-router-dom';
import { PenTool, BookOpen, Library, FolderOpen, Sparkles, Clock, CheckCircle } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-purple-800 to-pink-700" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,119,198,0.3),transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            Phiên bản 2.0 — AI Multi-Agent
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Soạn giáo án{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-pink-300">
              thông minh
            </span>
            <br />
            cùng trí tuệ nhân tạo
          </h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto mb-10">
            Giảm 96% thời gian soạn bài từ 2 giờ xuống 3-5 phút.
            Tuân thủ 100% chuẩn GDPT 2018.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/generate"
              className="btn-primary flex items-center gap-2 text-lg px-8 py-4"
            >
              <PenTool className="w-5 h-5" />
              Bắt đầu soạn giáo án
            </Link>
            <Link
              to="/resources"
              className="btn-secondary flex items-center gap-2 text-lg px-8 py-4"
            >
              <FolderOpen className="w-5 h-5" />
              Xem tài nguyên
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Clock,
              title: 'Nhanh chóng',
              desc: 'Chỉ 3-5 phút để hoàn thành một giáo án đầy đủ, thay vì 2 giờ soạn thủ công.',
              color: 'from-blue-500 to-cyan-500',
            },
            {
              icon: CheckCircle,
              title: 'Chuẩn GDPT 2018',
              desc: 'Tự động kiểm tra chất lượng theo khung chương trình giáo dục phổ thông.',
              color: 'from-green-500 to-emerald-500',
            },
            {
              icon: BookOpen,
              title: 'Kho tài liệu sẵn',
              desc: 'Tích hợp SGK, SGV chính hãng. Chọn tài liệu → AI tham chiếu khi soạn.',
              color: 'from-purple-500 to-pink-500',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
