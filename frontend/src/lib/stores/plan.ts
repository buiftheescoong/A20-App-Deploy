import { create } from 'zustand';
import type {
  ComplianceStatus,
  GenerationPhase,
  LessonPlanJSON,
  Plan,
  PlanStatusResponse,
  ProgressEvent,
  QualityCheckSnapshot,
} from '../types';
import { getQualityCheckFromPlan } from '../quality-check';

interface PlanState {
  // Current plan being viewed/generated
  currentPlan: Plan | null;
  planId: string | null;

  // Generation state machine
  generationPhase: GenerationPhase;
  isStreaming: boolean;
  markdown: string;
  planJson: LessonPlanJSON | null;
  progress: ProgressEvent | null;
  isComplete: boolean;
  docxUrl: string | null;
  compliance: ComplianceStatus | null;
  qualityCheck: QualityCheckSnapshot | null;
  error: string | null;
  startTime: number | null;

  // Actions
  startSubmitting: () => void;
  setPhase: (phase: GenerationPhase) => void;
  setPlan: (plan: Plan) => void;
  hydrateStatus: (status: PlanStatusResponse) => void;
  startStreaming: (planId: string, phase?: Extract<GenerationPhase, 'queued' | 'recovering' | 'streaming'>) => void;
  appendMarkdown: (delta: string) => void;
  setProgress: (progress: ProgressEvent) => void;
  setPlanJson: (json: LessonPlanJSON) => void;
  setContentReady: (compliance?: ComplianceStatus) => void;
  setExporting: () => void;
  setComplete: (docxUrl?: string | null, compliance?: ComplianceStatus | null) => void;
  setQualityCheck: (qualityCheck: QualityCheckSnapshot | null, compliance?: ComplianceStatus | null, docxUrl?: string | null) => void;
  markContentEdited: (qualityCheck?: QualityCheckSnapshot | null) => void;
  setError: (error: string) => void;
  setMarkdown: (markdown: string) => void;
  resetStreamingMarkdown: () => void;
  reset: () => void;
}

const queuedProgress: ProgressEvent = {
  step: 'queued',
  label: 'Đang chuẩn bị yêu cầu tạo giáo án...',
};

const exportingProgress: ProgressEvent = {
  step: 'exporting',
  label: 'Giáo án đã sẵn sàng, đang chuẩn bị file DOCX...',
};

const completedProgress: ProgressEvent = {
  step: 'completed',
  label: 'Hoàn thành, file DOCX đã sẵn sàng.',
};

function isLivePhase(phase: GenerationPhase): boolean {
  return phase === 'queued' || phase === 'streaming' || phase === 'recovering';
}

function phaseFromProgress(step: ProgressEvent['step']): GenerationPhase {
  if (step === 'queued') return 'queued';
  if (step === 'exporting') return 'exporting';
  if (step === 'completed') return 'complete';
  return 'streaming';
}

export const usePlanStore = create<PlanState>((set) => ({
  currentPlan: null,
  planId: null,
  generationPhase: 'idle',
  isStreaming: false,
  markdown: '',
  planJson: null,
  progress: null,
  isComplete: false,
  docxUrl: null,
  compliance: null,
  qualityCheck: null,
  error: null,
  startTime: null,

  startSubmitting: () => set({
    generationPhase: 'submitting',
    isStreaming: false,
    markdown: '',
    planJson: null,
    progress: queuedProgress,
    isComplete: false,
    docxUrl: null,
    compliance: null,
    qualityCheck: null,
    error: null,
    startTime: Date.now(),
  }),

  setPhase: (phase) => set((state) => ({
    generationPhase: phase,
    isStreaming: isLivePhase(phase),
    progress: phase === 'queued' ? queuedProgress : state.progress,
  })),

  setPlan: (plan) => {
    const hasContent = Boolean(plan.contentMarkdown);
    const hasDocx = Boolean(plan.docxUrl);
    set({
      currentPlan: plan,
      planId: plan.id,
      generationPhase: hasDocx ? 'complete' : hasContent ? 'exporting' : plan.status === 'failed' ? 'failed' : 'queued',
      markdown: plan.contentMarkdown || '',
      planJson: plan.contentJson || null,
      progress: hasDocx ? completedProgress : hasContent ? exportingProgress : queuedProgress,
      isStreaming: !hasContent && plan.status !== 'failed',
      isComplete: hasContent,
      docxUrl: plan.docxUrl,
      compliance: plan.complianceStatus,
      qualityCheck: getQualityCheckFromPlan(plan),
      error: plan.status === 'failed' ? 'Tạo giáo án thất bại. Vui lòng thử lại.' : null,
      startTime: null,
    });
  },

  hydrateStatus: (status) => set((state) => {
    if (status.status === 'failed') {
      return {
        generationPhase: 'failed',
        isStreaming: false,
        error: 'Tạo giáo án thất bại. Vui lòng thử lại.',
        compliance: status.complianceStatus,
        qualityCheck: status.qualityCheck ?? null,
        docxUrl: status.docxUrl,
      };
    }

    if (status.docxUrl) {
      return {
        generationPhase: 'complete',
        isStreaming: false,
        isComplete: true,
        docxUrl: status.docxUrl,
        compliance: status.complianceStatus,
        qualityCheck: status.qualityCheck ?? state.qualityCheck,
        progress: completedProgress,
        error: null,
      };
    }

    if (status.hasContent) {
      if (state.generationPhase === 'exporting' && state.docxUrl === null) {
        return {
          compliance: status.complianceStatus,
          qualityCheck: status.qualityCheck ?? state.qualityCheck,
          error: null,
        };
      }
      return {
        generationPhase: 'exporting',
        isStreaming: false,
        isComplete: true,
        docxUrl: null,
        compliance: status.complianceStatus,
        qualityCheck: status.qualityCheck ?? state.qualityCheck,
        progress: exportingProgress,
        error: null,
      };
    }

    return {
      generationPhase: state.generationPhase === 'recovering' ? 'recovering' : 'queued',
      isStreaming: true,
      progress: state.progress ?? queuedProgress,
      qualityCheck: status.qualityCheck ?? state.qualityCheck,
      error: null,
    };
  }),

  startStreaming: (planId, phase = 'queued') => set({
    planId,
    generationPhase: phase,
    isStreaming: true,
    markdown: '',
    planJson: null,
    progress: queuedProgress,
    isComplete: false,
    docxUrl: null,
    compliance: null,
    qualityCheck: null,
    error: null,
    startTime: Date.now(),
  }),

  appendMarkdown: (delta) => set((state) => ({
    markdown: state.markdown + delta,
    generationPhase: 'streaming',
    isStreaming: true,
    error: null,
  })),

  setProgress: (progress) => set({
    progress,
    generationPhase: phaseFromProgress(progress.step),
    isStreaming: isLivePhase(phaseFromProgress(progress.step)),
    error: null,
  }),

  setPlanJson: (json) => set({ planJson: json }),

  setContentReady: (compliance) => set({
    generationPhase: 'content_ready',
    isStreaming: false,
    isComplete: true,
    compliance: compliance || 'PENDING',
    error: null,
  }),

  setExporting: () => set((state) => {
    if (state.generationPhase === 'exporting') {
      return {};
    }
    return {
      generationPhase: 'exporting',
      isStreaming: false,
      isComplete: true,
      docxUrl: null,
      progress: exportingProgress,
      error: null,
    };
  }),

  setComplete: (docxUrl, compliance) => set({
    generationPhase: docxUrl ? 'complete' : 'content_ready',
    isStreaming: false,
    isComplete: true,
    docxUrl: docxUrl || null,
    compliance: compliance || 'PENDING',
    progress: docxUrl ? completedProgress : exportingProgress,
    error: null,
  }),

  setQualityCheck: (qualityCheck, compliance, docxUrl) => set((state) => ({
    qualityCheck,
    compliance: compliance ?? state.compliance,
    docxUrl: docxUrl === undefined ? state.docxUrl : docxUrl,
  })),

  markContentEdited: (qualityCheck) => set({
    generationPhase: 'exporting',
    isStreaming: false,
    isComplete: true,
    docxUrl: null,
    compliance: 'PENDING',
    qualityCheck: qualityCheck ?? null,
    progress: exportingProgress,
    error: null,
  }),

  setError: (error) => set({
    generationPhase: 'failed',
    isStreaming: false,
    error,
  }),

  setMarkdown: (markdown) => set({
    markdown,
    isComplete: Boolean(markdown.trim()),
  }),

  resetStreamingMarkdown: () => set({
    generationPhase: 'streaming',
    isStreaming: true,
    markdown: '',
    planJson: null,
    isComplete: false,
    docxUrl: null,
    compliance: null,
    qualityCheck: null,
    error: null,
  }),

  reset: () => set({
    currentPlan: null,
    planId: null,
    generationPhase: 'idle',
    isStreaming: false,
    markdown: '',
    planJson: null,
    progress: null,
    isComplete: false,
    docxUrl: null,
    compliance: null,
    qualityCheck: null,
    error: null,
    startTime: null,
  }),
}));
