"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* ─── Navbar ──────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              GA
            </div>
            <span className="text-white font-bold text-xl">
              Giáo Án Thông Minh
            </span>
          </div>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="px-5 py-2.5 text-white/80 hover:text-white transition-colors font-medium"
            >
              Đăng nhập
            </Link>
            <Link
              href="/login"
              className="btn-primary !py-2.5 !px-5 !text-sm"
            >
              Bắt đầu miễn phí
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-blue-300 text-sm font-medium mb-8 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Powered by GPT-4o & Multi-Agent AI
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight">
            Soạn giáo án{" "}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              trong 3 phút
            </span>
          </h1>

          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            Hệ thống AI đa tác tử tự động soạn giáo án theo chuẩn GDPT 2018.
            Giảm 96% thời gian soạn bài, chuẩn hóa 100% format, giảm 70% khối
            lượng review.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="btn-primary !py-4 !px-8 text-lg"
              id="hero-cta"
            >
              🚀 Tạo giáo án ngay
            </Link>
            <a
              href="#features"
              className="px-8 py-4 rounded-xl bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/20 transition-all text-lg"
            >
              Tìm hiểu thêm →
            </a>
          </div>
        </div>
      </section>

      {/* ─── Stats ───────────────────────────────────────────── */}
      <section className="pb-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { value: "96%", label: "Giảm thời gian soạn bài", icon: "⚡" },
            { value: "3 phút", label: "Thời gian trung bình", icon: "⏱️" },
            { value: "100%", label: "Chuẩn format GDPT 2018", icon: "✅" },
          ].map((stat, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-6 text-center border border-white/10 card-hover"
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-4xl font-extrabold text-white mb-1">
                {stat.value}
              </div>
              <div className="text-gray-400 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────── */}
      <section id="features" className="pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
            Tính năng nổi bật
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: "🤖",
                title: "AI Multi-Agent Pipeline",
                desc: "6 agent chuyên biệt phối hợp: Phân tích → Tra cứu SGK → Soạn thảo → Kiểm tra → Xuất file",
              },
              {
                icon: "📋",
                title: "Chuẩn GDPT 2018",
                desc: "Tự động kiểm tra đầy đủ mục tiêu, năng lực, phẩm chất, thiết bị & học liệu theo chuẩn Bộ GD&ĐT",
              },
              {
                icon: "💬",
                title: "Hỏi lại khi thiếu thông tin",
                desc: "Khi không đủ dữ liệu, AI sẽ hỏi GV bổ sung thay vì tự bịa nội dung — đảm bảo chính xác",
              },
              {
                icon: "📄",
                title: "Export DOCX chuẩn",
                desc: "Xuất file Word đúng format, mở ra sẵn sàng in. Nếu lỗi → tự động trả template trắng đúng chuẩn",
              },
            ].map((feat, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-8 border border-white/10 card-hover"
              >
                <div className="text-4xl mb-4">{feat.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {feat.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────── */}
      <section className="pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center glass rounded-3xl p-12 border border-white/10">
          <h2 className="text-3xl font-bold text-white mb-4">
            Sẵn sàng tiết kiệm thời gian?
          </h2>
          <p className="text-gray-400 mb-8">
            Bắt đầu soạn giáo án chỉ trong vài phút. Không cần cài đặt phức
            tạp.
          </p>
          <Link href="/login" className="btn-primary !py-4 !px-8 text-lg">
            Đăng ký miễn phí →
          </Link>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-5xl mx-auto text-center text-gray-500 text-sm">
          © 2026 Soạn Giáo Án Thông Minh — VinUNI A20 Team
        </div>
      </footer>
    </div>
  );
}
