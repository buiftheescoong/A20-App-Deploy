'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { GenerationPhase, ProgressEvent } from '@/lib/types';
import { CheckCircle, Cpu, FileCheck2, FileCog, Loader2, Search, ShieldCheck, TimerReset } from 'lucide-react';

const STEPS: Array<{ key: ProgressEvent['step']; label: string; icon: typeof TimerReset }> = [
  { key: 'queued', label: 'Chuẩn bị', icon: TimerReset },
  { key: 'rag', label: 'Tìm tài liệu', icon: Search },
  { key: 'generating', label: 'Soạn giáo án', icon: Cpu },
  { key: 'quality_check', label: 'Kiểm tra', icon: ShieldCheck },
  { key: 'formatting', label: 'Chuẩn hóa', icon: FileCog },
  { key: 'exporting', label: 'Tạo DOCX', icon: FileCheck2 },
  { key: 'completed', label: 'Sẵn sàng', icon: CheckCircle },
];

interface Props {
  progress: ProgressEvent | null;
  phase: GenerationPhase;
  startTime: number | null;
  error?: string | null;
}

function fallbackProgressForPhase(phase: GenerationPhase): ProgressEvent {
  if (phase === 'submitting') return { step: 'queued', label: 'Đang gửi yêu cầu tạo giáo án...' };
  if (phase === 'recovering') return { step: 'queued', label: 'Mất kết nối tạm thời, đang nối lại...' };
  if (phase === 'exporting' || phase === 'content_ready') {
    return { step: 'exporting', label: 'Giáo án đã sẵn sàng, đang chuẩn bị file DOCX...' };
  }
  if (phase === 'complete') return { step: 'completed', label: 'Hoàn thành, file DOCX đã sẵn sàng.' };
  if (phase === 'failed') return { step: 'queued', label: 'Tạo giáo án bị gián đoạn.' };
  return { step: 'queued', label: 'Đang chuẩn bị...' };
}

export default function ProgressBar({ progress, phase, startTime, error }: Props) {
  const [now, setNow] = useState(Date.now());
  const effectiveProgress = progress ?? fallbackProgressForPhase(phase);
  const currentIdx = Math.max(0, STEPS.findIndex((s) => s.key === effectiveProgress.step));
  const isFinished = phase === 'complete';
  const isFailed = phase === 'failed';

  useEffect(() => {
    if (!startTime || isFinished || isFailed) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [startTime, isFinished, isFailed]);

  const elapsed = startTime ? Math.round((now - startTime) / 1000) : 0;
  const pct = isFinished ? 100 : Math.round(((currentIdx + 0.35) / STEPS.length) * 100);
  const label = isFailed ? error || 'Tạo giáo án bị gián đoạn.' : effectiveProgress.label;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
            isFailed ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-purple-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-start justify-between gap-1">
        {STEPS.map((step, i) => {
          const isDone = isFinished || i < currentIdx;
          const isActive = !isFinished && !isFailed && i === currentIdx;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-500',
                  isDone && 'bg-green-500 text-white shadow-md shadow-green-500/30',
                  isActive && 'bg-blue-500 text-white shadow-md shadow-blue-500/30 animate-pulse',
                  isFailed && i === currentIdx && 'bg-red-500 text-white shadow-md shadow-red-500/30',
                  !isDone && !isActive && !(isFailed && i === currentIdx) && 'bg-gray-100 text-gray-400',
                )}
              >
                {isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isDone ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  'hidden max-w-full text-center text-xs font-medium sm:block',
                  isDone && 'text-green-600',
                  isActive && 'text-blue-600',
                  isFailed && i === currentIdx && 'text-red-600',
                  !isDone && !isActive && 'text-gray-400',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span className={cn('font-medium', isFailed && 'text-red-600')}>{label}</span>
        {!isFinished && !isFailed && startTime && <span className="shrink-0">{elapsed}s</span>}
      </div>
    </div>
  );
}
