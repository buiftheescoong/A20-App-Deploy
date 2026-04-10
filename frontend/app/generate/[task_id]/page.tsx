"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getStatus, getLessonPlan, type StatusResponse } from "@/lib/api";
import LessonPlanPreview from "@/components/LessonPlanPreview";
import BlankTemplateAlert from "@/components/BlankTemplateAlert";
import ExportButton from "@/components/ExportButton";
import ProgressTracker from "@/components/ProgressTracker";

export default function GenerateProgressPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.task_id as string;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [lessonPlan, setLessonPlan] = useState<any>(null);
  const [error, setError] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    pollStatus();
    intervalRef.current = setInterval(pollStatus, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskId]);

  async function pollStatus() {
    try {
      const result = await getStatus(taskId);
      setStatus(result);

      // Redirect to clarification page if needed
      if (result.status === "clarifying") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.push(`/generate/${taskId}/clarify`);
        return;
      }

      // Stop polling when done
      if (
        result.status === "completed" ||
        result.status === "failed"
      ) {
        if (intervalRef.current) clearInterval(intervalRef.current);

        // Load the full lesson plan
        if (result.lesson_plan_id) {
          try {
            const plan = await getLessonPlan(result.lesson_plan_id);
            setLessonPlan(plan);
          } catch (e) {
            console.error("Failed to load lesson plan:", e);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }

  const isComplete =
    status?.status === "completed" || status?.status === "failed";

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
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            ← Quay về Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Progress Tracker */}
        <div className="mb-10">
          <ProgressTracker
            currentStep={status?.progress_step || "started"}
            status={status?.status || "pending"}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600">
            ❌ {error}
          </div>
        )}

        {/* Out-of-scope */}
        {status?.error && status.status === "failed" && !status.is_blank_template && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="text-5xl mb-4">🚫</div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">
              Không thể xử lý yêu cầu
            </h2>
            <p className="text-gray-500 mb-6">{status.error}</p>
            <Link href="/generate" className="btn-primary">
              Thử lại
            </Link>
          </div>
        )}

        {/* Blank Template Alert */}
        {status?.is_blank_template && (
          <BlankTemplateAlert
            taskId={taskId}
            onRetry={() => router.push("/generate")}
          />
        )}

        {/* Generating... */}
        {!isComplete && !error && (
          <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-6">
              <svg
                className="animate-spin h-8 w-8 text-blue-600"
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
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              AI đang soạn giáo án...
            </h2>
            <p className="text-gray-500">
              Quá trình này thường mất 2-3 phút. Vui lòng đợi.
            </p>
          </div>
        )}

        {/* Lesson Plan Preview */}
        {isComplete && lessonPlan && !status?.is_blank_template && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">
                ✅ Giáo án hoàn thành!
              </h2>
              <ExportButton planId={lessonPlan.id} />
            </div>
            <LessonPlanPreview plan={lessonPlan} />
          </div>
        )}
      </main>
    </div>
  );
}
