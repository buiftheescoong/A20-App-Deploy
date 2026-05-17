import { config } from '../config';

/** Timeout for SSE stream connections (5 minutes) */
const SSE_STREAM_TIMEOUT_MS = 5 * 60 * 1000;
const GENERATION_TRIGGER_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 2 * 60 * 1000;
const QUALITY_CHECK_TIMEOUT_MS = 90_000;
const DOCX_FETCH_TIMEOUT_MS = 30_000;

export function isAIRequestTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export interface QualityIssue {
  severity: 'Critical' | 'Major' | 'Minor' | string;
  section: string;
  problem: string;
  suggestion: string;
}

export interface SkippedQualityCheck {
  check: string;
  reason: string;
}

export interface QualityCheckResult {
  status: string;
  score: number;
  summary?: string;
  errors: string[];
  feedback: string;
  checks?: Record<string, boolean>;
  issues?: QualityIssue[];
  passed_checks?: string[];
  skipped_checks?: SkippedQualityCheck[];
}

/**
 * HTTP client wrapper for AI Service (Python FastAPI at port 8000).
 * Forwards x-request-id for distributed tracing.
 * Adds X-AI-Service-Secret header for internal auth when configured.
 */
export class AIClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.aiServiceUrl;
  }

  /** Build auth header(s) for internal Gateway→AI Service calls. */
  private authHeaders(): Record<string, string> {
    return config.aiServiceSecret ? { 'X-AI-Service-Secret': config.aiServiceSecret } : {};
  }

  /** POST /ai/generate — trigger lesson plan generation */
  async generate(
    planId: string,
    input: {
      subject: string;
      grade: string;
      topic: string;
      teaching_model: string;
      objectives?: string[];
      emphasis?: string;
      special_requests?: string;
      file_urls?: string[];
      resource_ids?: string[];
      system_resource_ids?: string[];
      system_resource_texts?: string[];
      resource_contexts?: unknown[];
      system_resource_contexts?: unknown[];
    },
    requestId?: string,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({ plan_id: planId, request_id: requestId, ...input }),
      signal: AbortSignal.timeout(GENERATION_TRIGGER_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI Service /ai/generate failed (${res.status}): ${body}`);
    }
  }

  /**
   * GET /ai/stream/:planId — open SSE stream from AI Service.
   * Returns the raw fetch Response so the caller can read its body.
   * The caller is responsible for reading and closing the stream.
   *
   * @param externalAbort – Optional AbortSignal to cancel the stream
   *                        when the downstream client disconnects.
   */
  async openStream(
    planId: string,
    requestId: string,
    externalAbort?: AbortSignal,
  ): Promise<Response> {
    // Combine the external abort (client disconnect) with a timeout abort
    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort();
    }, SSE_STREAM_TIMEOUT_MS);

    // Build a combined signal: either external abort or timeout
    const combinedController = new AbortController();

    const cleanup = () => {
      clearTimeout(timer);
    };

    const onExternalAbort = () => { combinedController.abort(); cleanup(); };
    const onTimeout = () => { combinedController.abort(); cleanup(); };

    if (externalAbort) {
      if (externalAbort.aborted) {
        cleanup();
        combinedController.abort();
      } else {
        externalAbort.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    timeoutController.signal.addEventListener('abort', onTimeout, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/ai/stream/${planId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          ...this.authHeaders(),
          'X-Request-Id': requestId,
        },
        signal: combinedController.signal,
      });

      if (!res.ok) {
        cleanup();
        const body = await res.text();
        throw new Error(`AI Service /ai/stream failed (${res.status}): ${body}`);
      }

      return res;
    } catch (err) {
      cleanup();
      throw err;
    }
  }

  /** POST /ai/chat/:planId — forward chat message, returns SSE Response */
  async chat(
    planId: string,
    message: string,
    fileUrls?: string[],
    requestId?: string,
    current?: {
      markdown?: string | null;
      plan?: Record<string, unknown> | null;
    },
  ): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/ai/chat/${planId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({
        message,
        file_urls: fileUrls || [],
        ...(current?.markdown ? { current_markdown: current.markdown } : {}),
        ...(current?.plan ? { current_plan: current.plan } : {}),
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI Service /ai/chat failed (${res.status}): ${body}`);
    }
    return res;
  }

  /** POST /ai/quality-check — run quality check on plan markdown */
  async qualityCheck(
    planId: string,
    markdown: string,
    teachingModel: string,
    requestId?: string,
  ): Promise<QualityCheckResult> {
    const res = await fetch(`${this.baseUrl}/ai/quality-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({ plan_id: planId, markdown, teaching_model: teachingModel }),
      signal: AbortSignal.timeout(QUALITY_CHECK_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI Service /ai/quality-check failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<QualityCheckResult>;
  }

  /** GET /ai/plans/:planId/docx — fetch DOCX bytes */
  async fetchDocx(planId: string, requestId?: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/ai/plans/${planId}/docx`, {
      headers: {
        ...this.authHeaders(),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      signal: AbortSignal.timeout(DOCX_FETCH_TIMEOUT_MS),
    });
    return res;
  }

  /** POST /ai/docx - render saved lesson content into DOCX bytes */
  async renderDocx(
    planId: string,
    plan: Record<string, unknown>,
    markdown: string,
    requestId?: string,
  ): Promise<Response> {
    return fetch(`${this.baseUrl}/ai/docx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: JSON.stringify({ plan_id: planId, plan, markdown }),
      signal: AbortSignal.timeout(DOCX_FETCH_TIMEOUT_MS),
    });
  }
}

export const aiClient = new AIClient();
