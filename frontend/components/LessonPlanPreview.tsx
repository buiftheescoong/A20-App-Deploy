import TypewriterText from './TypewriterText';

interface LessonPlanPreviewProps {
  plan: {
    id?: string;
    subject: string;
    grade: string;
    topic: string;
    teaching_model: string;
    objectives: string[];
    content_json?: any;
    compliance_status?: string;
  };
  isStreaming?: boolean;
}

const SECTION_LABELS_5E: Record<string, string> = {
  engage: 'Hoạt động 1: KHỞI ĐỘNG (Engage)',
  explore: 'Hoạt động 2: KHÁM PHÁ (Explore)',
  explain: 'Hoạt động 3: GIẢI THÍCH (Explain)',
  elaborate: 'Hoạt động 4: VẬN DỤNG (Elaborate)',
  evaluate: 'Hoạt động 5: ĐÁNH GIÁ (Evaluate)',
};

const SECTION_LABELS_3PHASE: Record<string, string> = {
  opening: 'Hoạt động 1: MỞ ĐẦU',
  knowledge: 'Hoạt động 2: HÌNH THÀNH KIẾN THỨC',
  practice: 'Hoạt động 3: LUYỆN TẬP',
};

export default function LessonPlanPreview({ plan, isStreaming }: LessonPlanPreviewProps) {
  const content = plan.content_json;
  if (!content && !isStreaming) return null;

  const metadata = content?.metadata || plan || {};
  const sections = content?.sections || {};
  const compliance = content?.compliance || {};
  const teachingModel = metadata.teaching_model || plan.teaching_model;
  const sectionLabels = teachingModel === '5E' ? SECTION_LABELS_5E : SECTION_LABELS_3PHASE;

  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden min-h-full flex flex-col transition-all duration-500 hover:shadow-2xl">
      {/* Document Header - Paper Look */}
      <div className="p-10 border-b border-gray-50 bg-white">
        <div className="flex justify-between items-start mb-8">
          <div>
            <span className="text-blue-600 font-bold tracking-widest text-xs uppercase mb-2 block">
              Kế hoạch bài dạy
            </span>
            <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">
              {metadata.topic || 'Đang chuẩn bị tiêu đề...'}
            </h2>
          </div>
          {compliance.status && (
            <span
              className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                compliance.status === 'PASSED'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {compliance.status === 'PASSED' ? '✓ Đã kiểm định' : '○ Đang kiểm định'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-2xl bg-gray-50 border border-gray-100/50">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">
              Môn học
            </p>
            <p className="font-semibold text-gray-800">{metadata.subject}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">
              Lớp
            </p>
            <p className="font-semibold text-gray-800">{metadata.grade}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">
              Thời lượng
            </p>
            <p className="font-semibold text-gray-800">{metadata.duration_minutes || 45} phút</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">
              Mô hình
            </p>
            <p className="font-semibold text-gray-800 uppercase">{teachingModel}</p>
          </div>
        </div>
      </div>

      <div className="p-10 space-y-12">
        {/* Objectives */}
        <section className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-blue-500 rounded-full opacity-20"></div>
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black">
              I
            </span>
            Mục tiêu bài học
          </h3>
          <div className="space-y-4 ml-4">
            <div>
              <h4 className="font-bold text-gray-500 text-xs uppercase tracking-widest mb-3">
                Năng lực & Phẩm chất
              </h4>
              <ul className="grid grid-cols-1 gap-3">
                {(metadata.objectives || []).map((obj: string, i: number) => (
                  <li key={i} className="flex gap-3 text-gray-700 leading-relaxed text-sm">
                    <span className="text-blue-500 mt-1.5">•</span>
                    <span>{obj}</span>
                  </li>
                ))}
                {(metadata.competencies || []).map((c: string, i: number) => (
                  <li key={i} className="flex gap-3 text-gray-700 leading-relaxed text-sm">
                    <span className="text-purple-500 mt-1.5">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Sections / Activities */}
        <section className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-purple-500 rounded-full opacity-20"></div>
          <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-black">
              II
            </span>
            Tiến trình dạy học
          </h3>
          <div className="space-y-10 ml-4">
            {Object.entries(sectionLabels).map(([key, label], index) => {
              const section = sections[key];
              if (!section && !isStreaming) return null;

              return (
                <div key={key} className="group">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {label}
                    </h4>
                    {section?.duration && (
                      <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2.5 py-1 rounded-md uppercase tracking-tighter">
                        {section.duration} PHÚT
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 text-base leading-relaxed whitespace-pre-wrap pl-4 border-l-2 border-gray-50 group-hover:border-blue-100 transition-colors">
                    {section?.content ? (
                      isStreaming ? (
                        <TypewriterText text={section.content} speed={2} />
                      ) : (
                        section.content
                      )
                    ) : (
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce"></span>
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        ></span>
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-bounce"
                          style={{ animationDelay: '0.4s' }}
                        ></span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
