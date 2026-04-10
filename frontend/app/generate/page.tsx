"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateLessonPlan } from "@/lib/api";

const SUBJECTS = [
  "Toán",
  "Ngữ Văn",
  "Vật lý",
  "Hóa học",
  "Sinh học",
  "Lịch sử",
  "Địa lý",
  "Tiếng Anh",
  "GDCD",
  "Tin học",
  "Công nghệ",
];
const GRADES = ["6", "7", "8", "9", "10", "11", "12"];

export default function GeneratePage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");
  const [teachingModel, setTeachingModel] = useState<"5E" | "3-phase">("5E");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !grade || !topic) {
      setError("Vui lòng điền đầy đủ thông tin");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await generateLessonPlan({
        subject,
        grade,
        topic,
        objectives: objectives
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean),
        teaching_model: teachingModel,
      });

      router.push(`/generate/${result.task_id}`);
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tạo giáo án");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                GA
              </div>
              <span className="font-bold text-lg text-gray-800">
                Giáo Án Thông Minh
              </span>
            </Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-gray-700 font-medium text-sm"
            >
              Dashboard
            </Link>
            <Link
              href="/generate"
              className="text-blue-600 font-semibold text-sm"
            >
              Tạo giáo án
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            ✨ Tạo giáo án mới
          </h1>
          <p className="text-gray-500 mb-8">
            Nhập thông tin bài học — AI sẽ soạn giáo án chuẩn GDPT 2018 cho bạn
          </p>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6"
          >
            {/* Subject & Grade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Môn học *
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="select-field"
                  required
                  id="select-subject"
                >
                  <option value="">Chọn môn học</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Lớp *
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="select-field"
                  required
                  id="select-grade"
                >
                  <option value="">Chọn lớp</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      Lớp {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tên bài học *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="input-field"
                placeholder="Ví dụ: Hàm số bậc nhất"
                required
                id="input-topic"
              />
            </div>

            {/* Objectives */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mục tiêu bài học
              </label>
              <textarea
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                className="input-field min-h-[100px] resize-y"
                placeholder="Mỗi mục tiêu một dòng:&#10;HS nhận diện được đồ thị hàm số bậc nhất&#10;HS vẽ được đồ thị trên mặt phẳng tọa độ"
                rows={4}
                id="input-objectives"
              />
              <p className="text-xs text-gray-400 mt-1">
                Mỗi mục tiêu trên một dòng. Để trống nếu muốn AI tự đề xuất.
              </p>
            </div>

            {/* Teaching Model */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Mô hình dạy học
              </label>
              <div className="flex gap-4">
                <label
                  className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    teachingModel === "5E"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="teaching_model"
                    value="5E"
                    checked={teachingModel === "5E"}
                    onChange={() => setTeachingModel("5E")}
                    className="sr-only"
                  />
                  <div className="font-bold text-gray-800 mb-1">5E Model</div>
                  <div className="text-xs text-gray-500">
                    Engage → Explore → Explain → Elaborate → Evaluate
                  </div>
                </label>

                <label
                  className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    teachingModel === "3-phase"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="teaching_model"
                    value="3-phase"
                    checked={teachingModel === "3-phase"}
                    onChange={() => setTeachingModel("3-phase")}
                    className="sr-only"
                  />
                  <div className="font-bold text-gray-800 mb-1">3 Giai đoạn</div>
                  <div className="text-xs text-gray-500">
                    Mở đầu → Hình thành kiến thức → Luyện tập
                  </div>
                </label>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                ❌ {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-4 text-lg disabled:opacity-50"
              id="btn-generate"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Đang tạo giáo án...
                </span>
              ) : (
                "🚀 Tạo giáo án"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
