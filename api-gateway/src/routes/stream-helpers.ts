import type { FastifyBaseLogger } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { lessonPlans } from '../db/schema';
import { aiClient } from '../services/ai-client';
import { storageService } from '../services/storage';

export const STREAM_CONNECT_RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000];
export const DOCX_FINALIZE_RETRY_DELAYS_MS = [5_000, 10_000, 15_000];

type StreamLog = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

interface SseWritable {
  write: (chunk: string) => unknown;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseSSEMessage(message: string): { eventType: string; eventData: string } {
  let eventType = '';
  const dataLines: string[] = [];

  for (const line of message.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  return { eventType, eventData: dataLines.join('\n') };
}

export function formatSSE(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function cleanMarkdownFence(markdown: string): string {
  const cleanedMarkdown = markdown.trim();
  const leadingFence = /^```\w*\s*\n/;
  const trailingFence = /\n```\s*$/;
  if (leadingFence.test(cleanedMarkdown) && trailingFence.test(cleanedMarkdown)) {
    return cleanedMarkdown.replace(leadingFence, '').replace(trailingFence, '');
  }
  return cleanedMarkdown;
}

export function isComplianceStatus(value: unknown): value is 'PASSED' | 'FAILED' | 'PENDING' {
  return value === 'PASSED' || value === 'FAILED' || value === 'PENDING';
}

export interface StreamPersistenceState {
  accumulatedMarkdown: string;
  finalPlanJson: Record<string, unknown> | null;
  complianceStatus: string;
}

export function applyStreamPersistenceEvent(
  state: StreamPersistenceState,
  eventType: string,
  parsed: unknown,
): StreamPersistenceState {
  if (eventType === 'reset') {
    return {
      ...state,
      accumulatedMarkdown: '',
      finalPlanJson: null,
      complianceStatus: 'PENDING',
    };
  }

  if (eventType === 'chunk' && isRecord(parsed)) {
    if (parsed.type === 'markdown' && typeof parsed.delta === 'string') {
      return {
        ...state,
        accumulatedMarkdown: state.accumulatedMarkdown + parsed.delta,
      };
    }
    return state;
  }

  if (eventType === 'plan' && isRecord(parsed)) {
    return {
      ...state,
      finalPlanJson: parsed,
      accumulatedMarkdown: typeof parsed.raw_markdown === 'string' && parsed.raw_markdown.trim().length > 0
        ? parsed.raw_markdown
        : state.accumulatedMarkdown,
    };
  }

  if (eventType === 'done' && isRecord(parsed) && isComplianceStatus(parsed.compliance)) {
    return {
      ...state,
      complianceStatus: parsed.compliance,
    };
  }

  return state;
}

export function buildPlanPersistenceUpdate(
  markdown: string,
  planJson: Record<string, unknown> | null,
  complianceStatus: string,
): Record<string, unknown> {
  const cleanedMarkdown = cleanMarkdownFence(markdown);
  return {
    ...(cleanedMarkdown.length > 0 ? { contentMarkdown: cleanedMarkdown } : {}),
    ...(planJson ? { contentJson: planJson } : {}),
    status: 'completed',
    complianceStatus,
    updatedAt: new Date(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Aborted'));
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function openAIStreamWithRetry(
  planId: string,
  requestId: string,
  signal: AbortSignal,
  raw: SseWritable,
  log: StreamLog,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= STREAM_CONNECT_RETRY_DELAYS_MS.length; attempt++) {
    if (signal.aborted) {
      throw new Error('Client disconnected before AI stream connected');
    }

    try {
      return await aiClient.openStream(planId, requestId, signal);
    } catch (error: unknown) {
      lastError = error;

      if (attempt === STREAM_CONNECT_RETRY_DELAYS_MS.length || signal.aborted) {
        break;
      }

      const delayMs = STREAM_CONNECT_RETRY_DELAYS_MS[attempt];
      log.warn({ planId, attempt: attempt + 1, delayMs, err: getErrorMessage(error) }, 'AI stream not ready, retrying');
      try {
        raw.write(formatSSE('progress', {
          step: 'queued',
          label: 'AI đang khởi động, đang thử kết nối lại...',
        }));
      } catch {
        // Ignore socket write failures; the main loop will observe the abort.
      }
      await waitWithAbort(delayMs, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to connect to AI stream');
}

export async function finalizeDocx(planId: string, requestId: string, log: StreamLog): Promise<void> {
  const res = await aiClient.fetchDocx(planId, requestId);

  if (!res.ok) {
    throw new Error(`DOCX not available from AI Service: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `${planId}/giao_an.docx`;
  await storageService.upload('documents', storagePath, buffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  await db.update(lessonPlans)
    .set({ docxUrl: storagePath, status: 'completed', updatedAt: new Date() })
    .where(eq(lessonPlans.id, planId));

  log.info({ planId, storagePath }, 'DOCX uploaded and DB updated');
}

export async function finalizeDocxWithRetry(
  planId: string,
  requestId: string,
  log: StreamLog,
  options: {
    delaysMs?: readonly number[];
    finalize?: (planId: string, requestId: string, log: StreamLog) => Promise<void>;
  } = {},
): Promise<void> {
  const retryDelays = options.delaysMs ?? DOCX_FINALIZE_RETRY_DELAYS_MS;
  const finalize = options.finalize ?? finalizeDocx;
  const maxAttempts = retryDelays.length;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = retryDelays[attempt - 1];
    log.info({ planId, attempt, delayMs: delay }, `DOCX finalize: waiting ${delay / 1000}s before attempt ${attempt}/${maxAttempts}`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await finalize(planId, requestId, log);
      return;
    } catch (error: unknown) {
      log.warn(
        { planId, attempt, maxAttempts, err: getErrorMessage(error) },
        `DOCX finalize attempt ${attempt}/${maxAttempts} failed`,
      );

      if (attempt === maxAttempts) {
        log.error({ planId }, 'DOCX finalize: all retry attempts exhausted');
        throw error;
      }
    }
  }
}
