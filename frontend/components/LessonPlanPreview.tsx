"use client";

interface LessonPlanPreviewProps {
  plan: {
    id: string;
    subject: string;
    grade: string;
    topic: string;
    teaching_model: string;
    objectives: string[];
    content_json: any;
    compliance_status: string;
  };
}

const SECTION_LABELS_5E: Record<string, string> = {
  engage: "Hoạt động 1: KHỞI ĐỘNG (Engage)",
  explore: "Hoạt động 2: KHÁM PHÁ (Explore)",
  explain: "Hoạt động 3: GIẢI THÍCH (Explain)",
  elaborate: "Hoạt động 4: VẬN DỤNG (Elaborate)",
  evaluate: "Hoạt động 5: ĐÁNH GIÁ (Evaluate)",
};

const SECTION_LABELS_3PHASE: Record<string, string> = {
  opening: "Hoạt động 1: MỞ ĐẦU",
  knowledge: "Hoạt động 2: HÌNH THÀNH KIẾN THỨC",
  practice: "Hoạt động 3: LUYỆN TẬP",
};

export default function LessonPlanPreview({ plan }: LessonPlanPreviewProps) {
  const content = plan.content_json;
  if (!content) return null;

  const metadata = content.metadata || {};
  const sections = content.sections || {};
  const compliance = content.compliance || {};
  const teachingModel = metadata.teaching_model || plan.teaching_model;
  const sectionLabels =
    teachingModel === "5E" ? SECTION_LABELS_5E : SECTION_LABELS_3PHASE;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
        <h2 className="text-2xl font-bold mb-1">KẾ HOẠCH BÀI DẠY</h2>
        <div className="grid grid-cols-2 gap-2 text-sm opacity-90 mt-3">
          <div>
            <span className="opacity-70">Môn:</span>{" "}
            <strong>{metadata.subject || plan.subject}</strong>
          </div>
          <div>
            <span className="opacity-70">Lớp:</span>{" "}
            <strong>{metadata.grade || plan.grade}</strong>
          </div>
          <div>
            <span className="opacity-70">Bài:</span>{" "}
            <strong>{metadata.topic || plan.topic}</strong>
          </div>
          <div>
            <span className="opacity-70">Thời gian:</span>{" "}
            <strong>{metadata.duration_minutes || 45} phút</strong>
          </div>
        </div>

        {/* Compliance badge */}
        <div className="mt-4">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
              compliance.status === "PASSED"
                ? "bg-green-400/20 text-green-100 border border-green-300/30"
                : "bg-red-400/20 text-red-100 border border-red-300/30"
            }`}
          >
            {compliance.status === "PASSED" ? "✅ PASSED" : "❌ FAILED"}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Objectives */}
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2">
            I. MỤC TIÊU
          </h3>
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-700 text-sm">Năng lực:</h4>
            <ul className="list-disc pl-6 text-gray-600 space-y-1 text-sm">
              {(metadata.objectives || plan.objectives || []).map(
                (obj: string, i: number) => (
                  <li key={i}>{obj}</li>
                )
              )}
            </ul>
            {metadata.competencies?.length > 0 && (
              <>
                <h4 className="font-semibold text-gray-700 text-sm mt-3">
                  Phẩm chất:
                </h4>
                <ul className="list-disc pl-6 text-gray-600 space-y-1 text-sm">
                  {metadata.competencies.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        {/* Materials */}
        {metadata.materials?.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2">
              II. THIẾT BỊ VÀ HỌC LIỆU
            </h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-1 text-sm">
              {metadata.materials.map((m: string, i: number) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Sections / Activities */}
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">
            III. TIẾN TRÌNH DẠY HỌC
          </h3>
          <div className="space-y-4">
            {Object.entries(sectionLabels).map(([key, label]) => {
              const section = sections[key];
              if (!section) return null;

              return (
                <div
                  key={key}
                  className="bg-gray-50 rounded-xl p-5 border border-gray-100"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-gray-800">{label}</h4>
                    {section.duration && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                        {section.duration} phút
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Compliance Errors */}
        {compliance.errors?.length > 0 && (
          <section>
            <h3 className="text-lg font-bold text-red-600 mb-3 border-b border-red-200 pb-2">
              ⚠️ Lỗi cần lưu ý
            </h3>
            <div className="space-y-2">
              {compliance.errors.map((err: any, i: number) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm"
                >
                  <div className="font-medium text-red-700">
                    [{err.section}] {err.issue}
                  </div>
                  {err.suggestion && (
                    <div className="text-red-500 mt-1">
                      💡 {err.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
