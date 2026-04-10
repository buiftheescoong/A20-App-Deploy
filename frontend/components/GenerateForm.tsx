"use client";

import { useState } from "react";
import { generateLessonPlan, type GeneratePayload } from "@/lib/api";

interface GenerateFormProps {
  onSubmit: (taskId: string) => void;
}

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

export default function GenerateForm({ onSubmit }: GenerateFormProps) {
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");
  const [teachingModel, setTeachingModel] = useState<"5E" | "3-phase">("5E");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: GeneratePayload = {
        subject,
        grade,
        topic,
        objectives: objectives
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean),
        teaching_model: teachingModel,
      };

      const result = await generateLessonPlan(payload);
      onSubmit(result.task_id);
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Mục tiêu bài học
        </label>
        <textarea
          value={objectives}
          onChange={(e) => setObjectives(e.target.value)}
          className="input-field min-h-[100px] resize-y"
          placeholder="Mỗi mục tiêu một dòng"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Mô hình dạy học
        </label>
        <div className="flex gap-4">
          {(["5E", "3-phase"] as const).map((model) => (
            <label
              key={model}
              className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                teachingModel === model
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                value={model}
                checked={teachingModel === model}
                onChange={() => setTeachingModel(model)}
                className="sr-only"
              />
              <div className="font-bold text-gray-800">
                {model === "5E" ? "5E Model" : "3 Giai đoạn"}
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          ❌ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !subject || !grade || !topic}
        className="btn-primary w-full !py-4 text-lg disabled:opacity-50"
      >
        {loading ? "Đang tạo..." : "🚀 Tạo giáo án"}
      </button>
    </form>
  );
}
