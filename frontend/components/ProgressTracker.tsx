'use client';

interface ProgressTrackerProps {
  currentStep: string;
  status: string;
}

const STEPS = [
  { key: 'intake', label: 'Phân tích', icon: '📋' },
  { key: 'rag', label: 'Tra cứu SGK', icon: '📚' },
  { key: 'generating', label: 'Soạn thảo', icon: '✍️' },
  { key: 'quality_checking', label: 'Kiểm tra', icon: '🔍' },
  { key: 'exporting', label: 'Hoàn thành', icon: '✅' },
];

function getStepStatus(
  stepKey: string,
  currentStep: string,
  status: string
): 'completed' | 'active' | 'pending' {
  const stepOrder = STEPS.map((s) => s.key);
  const currentIdx = stepOrder.indexOf(mapProgressToStep(currentStep));
  const stepIdx = stepOrder.indexOf(stepKey);

  if (status === 'completed' || status === 'failed') return 'completed';
  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

function mapProgressToStep(progressStep: string): string {
  const map: Record<string, string> = {
    started: 'intake',
    intake: 'intake',
    intake_done: 'rag',
    rag: 'rag',
    rag_done: 'generating',
    clarification_needed: 'rag',
    generating: 'generating',
    draft_ready: 'quality_checking',
    quality_checking: 'quality_checking',
    quality_done: 'exporting',
    retrying: 'generating',
    exporting: 'exporting',
    export_done: 'exporting',
    blank_template_ready: 'exporting',
  };
  return map[progressStep] || 'intake';
}

export default function ProgressTracker({ currentStep, status }: ProgressTrackerProps) {
  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
        Tiến trình tạo giáo án
      </h3>

      <div className="flex items-center">
        {STEPS.map((step, index) => {
          const stepStatus = getStepStatus(step.key, currentStep, status);

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`stepper-dot ${stepStatus}`}>
                  {stepStatus === 'completed' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span>{step.icon}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium whitespace-nowrap ${
                    stepStatus === 'active'
                      ? 'text-blue-600'
                      : stepStatus === 'completed'
                        ? 'text-green-600'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && <div className={`stepper-line ${stepStatus}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
