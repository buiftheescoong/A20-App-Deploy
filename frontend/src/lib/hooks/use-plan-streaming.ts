import { startTransition, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toaster';
import { getPlan, getPlanStatus } from '@/lib/api';
import { env } from '@/lib/env';
import { MOCK_STREAMING_MARKDOWN } from '@/lib/mock-data';
import { createBufferedMarkdownAppender } from '@/lib/streaming-buffer';
import { supabase } from '@/lib/supabase';
import { usePlanStore } from '@/lib/stores/plan';
import type { ChunkEvent, ComplianceStatus, LessonPlanJSON, PlanEvent, ProgressEvent, ResetEvent } from '@/lib/types';

const USE_MOCK = env.useMock;
const STREAM_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 6_000];
const STATUS_POLL_MS = 2_500;

function parseEventData<T>(event: Event): T | null {
  if (!(event instanceof MessageEvent)) return null;
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

async function buildStreamUrl(planId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || localStorage.getItem('auth_token') || '';
  const params = new URLSearchParams({ send_chunks: 'true' });
  if (token) params.set('token', token);
  return `${env.apiBaseUrl}/api/plans/${planId}/stream?${params.toString()}`;
}

export function usePlanStreaming(planId: string | undefined) {
  const generationPhase = usePlanStore((state) => state.generationPhase);
  const startStreaming = usePlanStore((state) => state.startStreaming);
  const setProgress = usePlanStore((state) => state.setProgress);
  const setPhase = usePlanStore((state) => state.setPhase);
  const setPlan = usePlanStore((state) => state.setPlan);
  const setPlanJson = usePlanStore((state) => state.setPlanJson);
  const setContentReady = usePlanStore((state) => state.setContentReady);
  const setExporting = usePlanStore((state) => state.setExporting);
  const setComplete = usePlanStore((state) => state.setComplete);
  const setError = usePlanStore((state) => state.setError);
  const setMarkdown = usePlanStore((state) => state.setMarkdown);
  const resetStreamingMarkdown = usePlanStore((state) => state.resetStreamingMarkdown);
  const appendMarkdown = usePlanStore((state) => state.appendMarkdown);

  const [chatResponse, setChatResponse] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const finalMarkdownRef = useRef('');

  useEffect(() => {
    setChatResponse('');
    setIsChatStreaming(false);
    finalMarkdownRef.current = '';
  }, [planId]);

  useEffect(() => {
    if (!USE_MOCK || !planId) return;
    const activePlanId = planId;

    startStreaming(activePlanId, 'queued');
    const fullText = MOCK_STREAMING_MARKDOWN;
    let idx = 0;
    let stepIdx = 0;
    const markdownBuffer = createBufferedMarkdownAppender({
      append: appendMarkdown,
      runFlush: (callback) => startTransition(callback),
    });
    const steps: Array<{ at: number; event: ProgressEvent }> = [
      { at: 0, event: { step: 'queued', label: 'Đang chuẩn bị yêu cầu tạo giáo án...' } },
      { at: 20, event: { step: 'rag', label: 'Đang tra cứu tài liệu SGK...' } },
      { at: 80, event: { step: 'generating', label: 'Đang soạn nội dung giáo án...' } },
      { at: 600, event: { step: 'quality_check', label: 'Đang kiểm tra chất lượng GDPT 2018...' } },
      { at: 700, event: { step: 'formatting', label: 'Đang hoàn thiện định dạng...' } },
    ];

    const timer = setInterval(() => {
      while (stepIdx < steps.length && idx >= steps[stepIdx].at) {
        setProgress(steps[stepIdx].event);
        stepIdx += 1;
      }

      if (idx < fullText.length) {
        const chunkSize = Math.floor(Math.random() * 8) + 2;
        const nextIdx = Math.min(fullText.length, idx + chunkSize);
        markdownBuffer.push(fullText.slice(idx, nextIdx));
        idx = nextIdx;
      } else {
        clearInterval(timer);
        markdownBuffer.flush();
        setMarkdown(fullText);
        setComplete('/mock/lesson_plan.docx', 'PASSED');
      }
    }, 30);

    return () => {
      clearInterval(timer);
      markdownBuffer.flush();
      markdownBuffer.cancel();
    };
  }, [appendMarkdown, planId, setComplete, setMarkdown, setProgress, startStreaming]);

  useEffect(() => {
    if (USE_MOCK || !planId) return;
    const activePlanId = planId;

    let cancelled = false;

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    const markdownBuffer = createBufferedMarkdownAppender({
      append: appendMarkdown,
      runFlush: (callback) => startTransition(callback),
    });

    const hydrateFullPlan = async () => {
      const plan = await getPlan(activePlanId);
      if (!cancelled) {
        setPlan(plan);
      }
    };

    const refreshStatus = async (): Promise<boolean> => {
      const status = await getPlanStatus(activePlanId);
      if (cancelled) return true;
      usePlanStore.getState().hydrateStatus(status);

      if (status.status === 'failed') {
        return true;
      }

      if (status.hasContent) {
        await hydrateFullPlan();
        if (!status.docxUrl) {
          setExporting();
        }
        return true;
      }

      return false;
    };

    const scheduleReconnect = (reason: string) => {
      if (cancelled) return;
      clearRetryTimer();

      const attempt = retryAttemptRef.current;
      if (attempt >= STREAM_RETRY_DELAYS_MS.length) {
        const message = reason || 'Kết nối tạo giáo án bị gián đoạn. Vui lòng tải lại trang để kiểm tra trạng thái.';
        setError(message);
        toast(message, 'error');
        return;
      }

      const delayMs = STREAM_RETRY_DELAYS_MS[attempt];
      retryAttemptRef.current += 1;
      setProgress({ step: 'queued', label: 'Kết nối bị gián đoạn, đang thử nối lại...' });
      setPhase('recovering');
      retryTimerRef.current = setTimeout(connectSSE, delayMs);
    };

    async function connectSSE() {
      if (cancelled || sseRef.current) return;

      const url = await buildStreamUrl(activePlanId);
      if (cancelled) return;

      const sse = new EventSource(url);
      sseRef.current = sse;

      sse.onopen = () => {
        retryAttemptRef.current = 0;
      };

      sse.addEventListener('progress', (event) => {
        const data = parseEventData<ProgressEvent>(event);
        if (data) setProgress(data);
      });

      sse.addEventListener('reset', (event) => {
        const data = parseEventData<ResetEvent>(event);
        if (data?.reason !== 'quality_repair') return;
        markdownBuffer.cancel();
        finalMarkdownRef.current = '';
        resetStreamingMarkdown();
      });

      sse.addEventListener('chat', (event) => {
        const data = parseEventData<{ delta?: string }>(event);
        if (data?.delta) {
          setChatResponse((prev) => prev + data.delta);
          setIsChatStreaming(true);
        }
      });

      sse.addEventListener('chunk', (event) => {
        const data = parseEventData<ChunkEvent>(event);
        if (data?.type === 'markdown' && data.delta) {
          markdownBuffer.push(data.delta);
        }
      });

      sse.addEventListener('plan', (event) => {
        markdownBuffer.flush();
        const data = parseEventData<LessonPlanJSON & PlanEvent>(event);
        if (data) {
          setPlanJson(data);
          if (typeof data.raw_markdown === 'string' && data.raw_markdown.trim().length > 0) {
            finalMarkdownRef.current = data.raw_markdown;
          }
        }
      });

      sse.addEventListener('done', async (event) => {
        markdownBuffer.flush();
        const data = parseEventData<{ docx_url?: string; compliance?: ComplianceStatus }>(event) || {};
        if (finalMarkdownRef.current.trim().length > 0) {
          setMarkdown(finalMarkdownRef.current);
        }
        if (data.docx_url) {
          setComplete(data.docx_url, data.compliance);
        } else {
          setContentReady(data.compliance);
          setExporting();
        }
        setIsChatStreaming(false);
        sse.close();
        sseRef.current = null;

        try {
          await refreshStatus();
        } catch {
          // The status poll below will keep checking DOCX readiness.
        }
      });

      sse.addEventListener('error', async (event) => {
        markdownBuffer.flush();
        const data = parseEventData<{ message?: string; recoverable?: boolean }>(event);
        sse.close();
        sseRef.current = null;

        if (cancelled) return;

        try {
          if (await refreshStatus()) return;
        } catch {
          // If status is also unreachable, fall through to reconnect handling.
        }

        const message = data?.message || 'Kết nối tạo giáo án bị gián đoạn.';
        if (data?.recoverable === false) {
          setError(message);
          toast(message, 'error');
          return;
        }

        scheduleReconnect(message);
      });
    }

    async function start() {
      const current = usePlanStore.getState();
      if (current.planId !== activePlanId || current.generationPhase === 'idle' || current.generationPhase === 'failed') {
        startStreaming(activePlanId, 'queued');
      }

      try {
        if (!(await refreshStatus())) {
          await connectSSE();
        }
      } catch {
        await connectSSE();
      }
    }

    start();

    return () => {
      cancelled = true;
      clearRetryTimer();
      markdownBuffer.flush();
      markdownBuffer.cancel();
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [
    appendMarkdown,
    planId,
    resetStreamingMarkdown,
    setComplete,
    setContentReady,
    setError,
    setExporting,
    setMarkdown,
    setPhase,
    setPlan,
    setPlanJson,
    setProgress,
    startStreaming,
  ]);

  useEffect(() => {
    if (USE_MOCK || !planId) return;
    if (generationPhase !== 'content_ready' && generationPhase !== 'exporting') return;
    const activePlanId = planId;

    let cancelled = false;

    async function tick() {
      try {
        const status = await getPlanStatus(activePlanId);
        if (cancelled) return;
        usePlanStore.getState().hydrateStatus(status);
        if (status.docxUrl) {
          const plan = await getPlan(activePlanId);
          if (!cancelled) setPlan(plan);
        }
      } catch {
        // Keep the UI in "preparing" state; the next poll can recover.
      }
    }

    tick();
    const timer = setInterval(tick, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generationPhase, planId, setPlan]);

  return {
    chatResponse,
    isChatStreaming,
  };
}
