"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getClarificationQuestions,
  submitClarificationAnswers,
} from "@/lib/api";

export default function ClarifyPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.task_id as string;

  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadQuestions();
  }, [taskId]);

  async function loadQuestions() {
    try {
      const result = await getClarificationQuestions(taskId);
      setQuestions(result.questions);
      setAnswers(new Array(result.questions.length).fill(""));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const formattedAnswers = questions.map((q, i) => ({
        question: q,
        answer: answers[i],
      }));

      await submitClarificationAnswers(taskId, formattedAnswers);
      router.push(`/generate/${taskId}`);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              GA
            </div>
            <span className="font-bold text-lg text-gray-800">
              Giáo Án Thông Minh
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="animate-slide-up">
          {/* Info Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
            <div className="flex gap-3 items-start">
              <span className="text-2xl">💬</span>
              <div>
                <h2 className="font-bold text-amber-800 text-lg mb-1">
                  Cần bổ sung thông tin
                </h2>
                <p className="text-amber-700 text-sm leading-relaxed">
                  AI không tìm đủ tài liệu tham khảo cho bài học này. Vui lòng
                  trả lời các câu hỏi bên dưới để AI có thể soạn giáo án chính
                  xác hơn.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="skeleton h-4 w-3/4 mb-3"></div>
                  <div className="skeleton h-20 w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 space-y-6"
            >
              {questions.map((question, index) => (
                <div key={index}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {index + 1}. {question}
                  </label>
                  <textarea
                    value={answers[index]}
                    onChange={(e) => {
                      const newAnswers = [...answers];
                      newAnswers[index] = e.target.value;
                      setAnswers(newAnswers);
                    }}
                    className="input-field min-h-[80px] resize-y"
                    placeholder="Nhập câu trả lời..."
                    disabled={submitting}
                    id={`input-answer-${index}`}
                  />
                </div>
              ))}

              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                  ❌ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full !py-4 disabled:opacity-50"
                id="btn-submit-clarification"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                    >
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
                    Đang gửi...
                  </span>
                ) : (
                  "📤 Gửi và tiếp tục tạo giáo án"
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
