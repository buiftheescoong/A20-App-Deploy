'use client';

import { useState } from 'react';
import { RefreshCw, MessageSquare, FileText, Loader2 } from 'lucide-react';
import ChatPanel from '@/components/generate/ChatPanel';
import ExportButton from '@/components/generate/ExportButton';
import LessonPlanPreviewEditor from '@/components/generate/LessonPlanPreviewEditor';
import ProgressBar from '@/components/generate/ProgressBar';
import QualityCheckCard from '@/components/QualityCheckCard';
import { usePlanStreaming } from '@/lib/hooks/use-plan-streaming';
import { useParams, useRouter } from '@/lib/navigation';
import { usePlanStore } from '@/lib/stores/plan';
import { cn } from '@/lib/utils';
import type { GenerationPhase } from '@/lib/types';

export default function StreamingPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const [mobileTab, setMobileTab] = useState<'doc' | 'chat'>('doc');
  const { chatResponse, isChatStreaming } = usePlanStreaming(planId);

  const handleRegenerate = () => {
    router.push('/generate');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <ProgressSection />

      <CompletionActions
        planId={planId}
        onRegenerate={handleRegenerate}
      />
      <QualityCheckSection />

      <div className="flex overflow-hidden rounded-xl border border-gray-200 md:hidden">
        <button onClick={() => setMobileTab('doc')} className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors', mobileTab === 'doc' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600')}>
          <FileText className="h-4 w-4" /> Giáo án
        </button>
        <button onClick={() => setMobileTab('chat')} className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors', mobileTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600')}>
          <MessageSquare className="h-4 w-4" /> Chat
        </button>
      </div>

      <div className="flex h-[calc(100vh-15rem)] min-h-[480px] max-h-[760px] gap-4">
        <div className={cn('min-h-0 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:w-[35%] md:flex-col lg:w-[30%]', mobileTab !== 'chat' && 'hidden md:flex')}>
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <MessageSquare className="h-4 w-4 text-blue-600" /> Chat AI
            </h2>
          </div>
          <ChatPanel
            planId={planId}
            chatResponse={chatResponse}
            isChatStreaming={isChatStreaming}
          />
        </div>

        <DocumentPane
          planId={planId}
          mobileTab={mobileTab}
        />
      </div>
    </div>
  );
}

function QualityCheckSection() {
  const isComplete = usePlanStore((state) => state.isComplete);
  const qualityCheck = usePlanStore((state) => state.qualityCheck);
  const compliance = usePlanStore((state) => state.compliance);

  if (!isComplete || (!qualityCheck && compliance !== 'PENDING')) return null;

  return <QualityCheckCard qualityCheck={qualityCheck} compliance={compliance} />;
}

function ProgressSection() {
  const progress = usePlanStore((state) => state.progress);
  const phase = usePlanStore((state) => state.generationPhase);
  const startTime = usePlanStore((state) => state.startTime);
  const error = usePlanStore((state) => state.error);

  return <ProgressBar progress={progress} phase={phase} startTime={startTime} error={error} />;
}

function CompletionActions({
  planId,
  onRegenerate,
}: {
  planId: string;
  onRegenerate: () => void;
}) {
  const isComplete = usePlanStore((state) => state.isComplete);
  const docxUrl = usePlanStore((state) => state.docxUrl);
  const compliance = usePlanStore((state) => state.compliance);
  const phase = usePlanStore((state) => state.generationPhase);

  if (!isComplete) return null;

  const isPreparingDocx = !docxUrl && (phase === 'content_ready' || phase === 'exporting');

  return (
    <div className="flex flex-wrap items-center gap-3 animate-fade-in">
      <ExportButton
        planId={planId}
        docxUrl={docxUrl}
        isPreparing={isPreparingDocx}
      />
      <button onClick={onRegenerate} className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm">
        <RefreshCw className="h-4 w-4" /> Tạo lại
      </button>
      {compliance === 'PASSED' && (
        <span className="badge-passed">Đạt chuẩn GDPT 2018</span>
      )}
      {compliance === 'FAILED' && (
        <span className="badge-failed">Cần xem lại</span>
      )}
    </div>
  );
}

function DocumentPane({
  planId,
  mobileTab,
}: {
  planId: string;
  mobileTab: 'doc' | 'chat';
}) {
  const markdown = usePlanStore((state) => state.markdown);
  const isStreaming = usePlanStore((state) => state.isStreaming);
  const phase = usePlanStore((state) => state.generationPhase);
  const canEdit = usePlanStore((state) => state.isComplete);
  const setPlan = usePlanStore((state) => state.setPlan);
  const deferPreview = (phase === 'queued' || phase === 'streaming' || phase === 'recovering') && !markdown.trim();

  return (
    <div className={cn('min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm', mobileTab !== 'doc' && 'hidden md:block')}>
      {deferPreview ? (
        <DeferredPreviewPlaceholder phase={phase} />
      ) : (
        <LessonPlanPreviewEditor
          planId={planId}
          markdown={markdown}
          isStreaming={isStreaming}
          canEdit={canEdit}
          onSaved={(updatedPlan) => setPlan(updatedPlan)}
        />
      )}
    </div>
  );
}

function DeferredPreviewPlaceholder({ phase }: { phase: GenerationPhase }) {
  const label = phase === 'recovering'
    ? 'Đang nối lại luồng tạo giáo án...'
    : 'Đang tạo giáo án...';

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <FileText className="h-7 w-7" />
        <Loader2 className="absolute -right-1 -top-1 h-5 w-5 animate-spin rounded-full bg-white p-0.5 text-blue-600" />
      </div>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
        Bản xem trước sẽ hiển thị khi nội dung giáo án hoàn tất.
      </p>
    </div>
  );
}
