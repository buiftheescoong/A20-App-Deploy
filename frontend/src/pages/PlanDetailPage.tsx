'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Calendar, FileText, GraduationCap, Loader2, MessageSquare, PenTool } from 'lucide-react';
import ChatPanel from '@/components/generate/ChatPanel';
import ExportButton from '@/components/generate/ExportButton';
import LessonPlanPreviewEditor, { type LessonPlanEditorMode } from '@/components/generate/LessonPlanPreviewEditor';
import QualityCheckCard from '@/components/QualityCheckCard';
import { toast } from '@/components/ui/Toaster';
import { getPlan, getPlanStatus } from '@/lib/api';
import { useParams, useRouter } from '@/lib/navigation';
import { applyAiRefineToPlan } from '@/lib/plans/detail';
import { getQualityCheckFromPlan, mergeQualityCheckIntoSession } from '@/lib/quality-check';
import type { ChatResponse, Plan } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorMode, setEditorMode] = useState<LessonPlanEditorMode>('preview');
  const [mobileTab, setMobileTab] = useState<'doc' | 'chat'>('doc');

  useEffect(() => {
    (async () => {
      try {
        const p = await getPlan(id);
        setPlan(p);
        setEditorMode('preview');
      } catch {
        toast('Không thể tải giáo án', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const qualityCheck = getQualityCheckFromPlan(plan);

  useEffect(() => {
    if (qualityCheck?.status !== 'running') return;

    let cancelled = false;
    async function pollQualityStatus() {
      try {
        const status = await getPlanStatus(id);
        if (cancelled) return;
        setPlan((current) => current ? {
          ...current,
          complianceStatus: status.complianceStatus,
          docxUrl: status.docxUrl,
          sessionState: mergeQualityCheckIntoSession(current.sessionState, status.qualityCheck),
          updatedAt: status.updatedAt,
        } : current);
      } catch {
        // Keep the running state visible; the next poll can recover.
      }
    }

    pollQualityStatus();
    const timer = window.setInterval(pollQualityStatus, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, qualityCheck?.status]);

  const handleAiRefined = (result: ChatResponse) => {
    if (!result.updatedMarkdown) return;

    setPlan((current) => current ? applyAiRefineToPlan(current, result) : current);
    setEditorMode('preview');
    setMobileTab('doc');
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Không tìm thấy giáo án</p>
        <button onClick={() => router.push('/library')} className="mt-2 text-sm text-blue-600">
          Quay về thư viện
        </button>
      </div>
    );
  }

  const canEditPlan = plan.status === 'completed' && Boolean(plan.contentMarkdown);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/library')}
          className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-gray-900">{plan.topic}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> {plan.subject}
            </span>
            <span className="flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" /> Lớp {plan.grade}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {formatDateTime(plan.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.complianceStatus === 'PASSED' && <span className="badge-passed">Đạt chuẩn</span>}
          {plan.complianceStatus === 'FAILED' && <span className="badge-failed">Cần xem lại</span>}
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <ExportButton
          planId={plan.id}
          docxUrl={plan.docxUrl}
        />
        <button
          onClick={() => setEditorMode('edit')}
          disabled={!canEditPlan}
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PenTool className="h-4 w-4" /> Sửa
        </button>
      </div>

      {(qualityCheck || plan.complianceStatus === 'PENDING') && (
        <QualityCheckCard
          qualityCheck={qualityCheck}
          compliance={plan.complianceStatus}
          className="mb-6"
        />
      )}

      <div className="mb-4 flex overflow-hidden rounded-xl border border-gray-200 md:hidden">
        <button
          onClick={() => setMobileTab('doc')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'doc' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600',
          )}
        >
          <FileText className="h-4 w-4" /> Giáo án
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600',
          )}
        >
          <MessageSquare className="h-4 w-4" /> Chat AI
        </button>
      </div>

      <div className="mb-8 flex h-[calc(100vh-14rem)] min-h-[520px] max-h-[760px] gap-4">
        <div className={cn(
          'min-h-0 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:flex md:w-[34%] md:flex-col lg:w-[30%]',
          mobileTab !== 'chat' && 'hidden',
        )}>
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <MessageSquare className="h-4 w-4 text-blue-600" /> Chat AI
            </h2>
          </div>
          <ChatPanel
            planId={plan.id}
            updatePlanStore={false}
            onRefined={handleAiRefined}
          />
        </div>

        <div className={cn(
          'min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm',
          mobileTab !== 'doc' && 'hidden md:block',
        )}>
          <LessonPlanPreviewEditor
            planId={plan.id}
            markdown={plan.contentMarkdown || ''}
            canEdit={canEditPlan}
            mode={editorMode}
            onModeChange={setEditorMode}
            onSaved={setPlan}
            emptyMessage="Giáo án chưa có nội dung"
          />
        </div>
      </div>
    </div>
  );
}
