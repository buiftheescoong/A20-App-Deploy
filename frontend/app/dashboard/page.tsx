"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { listLessonPlans, type LessonPlanResponse } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<LessonPlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserName(user.user_metadata?.full_name || user.email || "Giáo viên");

      const result = await listLessonPlans();
      setPlans(result.plans || []);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const statusLabel: Record<string, { text: string; class: string }> = {
    completed: { text: "Hoàn thành", class: "badge-passed" },
    failed: { text: "Thất bại", class: "badge-failed" },
    pending: { text: "Đang chờ", class: "badge-pending" },
    generating: { text: "Đang tạo", class: "badge-pending" },
    clarifying: { text: "Cần bổ sung", class: "badge-pending" },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              GA
            </div>
            <span className="font-bold text-lg text-gray-800">
              Giáo Án Thông Minh
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-blue-600 font-semibold text-sm"
            >
              Dashboard
            </Link>
            <Link
              href="/generate"
              className="text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
            >
              Tạo giáo án
            </Link>
            <Link
              href="/check"
              className="text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
            >
              Kiểm tra
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Xin chào,{" "}
              <span className="font-semibold text-gray-700">{userName}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
              id="btn-logout"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Title + CTA */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Giáo án của tôi
            </h1>
            <p className="text-gray-500 mt-1">
              Quản lý và tạo mới giáo án chuẩn GDPT 2018
            </p>
          </div>
          <Link href="/generate" className="btn-primary" id="btn-new-plan">
            ✨ Tạo giáo án mới
          </Link>
        </div>

        {/* Plans List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="skeleton h-5 w-3/4 mb-3"></div>
                <div className="skeleton h-4 w-1/2 mb-4"></div>
                <div className="skeleton h-3 w-full mb-2"></div>
                <div className="skeleton h-3 w-2/3"></div>
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Chưa có giáo án nào
            </h3>
            <p className="text-gray-400 mb-6">
              Bắt đầu tạo giáo án đầu tiên của bạn ngay!
            </p>
            <Link href="/generate" className="btn-primary">
              ✨ Tạo giáo án mới
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const status = statusLabel[plan.status] || statusLabel.pending;
              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover block"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-800 line-clamp-2">
                      {plan.topic}
                    </h3>
                    <span className={status.class}>{status.text}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md font-medium">
                      {plan.subject}
                    </span>
                    <span>Lớp {plan.grade}</span>
                    <span>•</span>
                    <span>{plan.teaching_model}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(plan.created_at).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {plan.is_blank_template && (
                    <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      ⚠️ Template trắng — cần tự điền nội dung
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
