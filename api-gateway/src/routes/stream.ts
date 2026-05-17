import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { lessonPlans } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { applyStreamPersistenceEvent, buildPlanPersistenceUpdate, getErrorMessage } from './stream-helpers';
import { aiClient } from '../services/ai-client';
import { storageService } from '../services/storage';

const STREAM_CONNECT_RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000];

type StreamLog = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

/**
 * SSE Proxy Route — pipes events from AI Service to the Frontend client.
 *
 * Event contract (FE listens for these event types):
 *   event: progress → {"step": "rag"|"generating"|"quality_check"|"formatting", "label": "..."}
 *   event: chunk    → {"type": "markdown", "delta": "..."}
 *   event: chat     → {"role": "assistant", "delta": "..."}
 *   event: plan     → {full JSON lesson plan}
 *   event: done     → {"plan_id": "...", "docx_url": "...", "status": "completed", ...}
 *   event: error    → {"message": "...", "recoverable": true|false}
 */
export default async function streamRoutes(fastify: FastifyInstance) {
  // ────── GET /api/plans/:id/stream — SSE proxy ──────
  fastify.get<{ Params: { id: string }; Querystring: { send_chunks?: string } }>(
    '/api/plans/:id/stream',
    async (request, reply) => {
      const user = request.user!;
      const { id: planId } = request.params;
      const requestId = request.id;
      const forwardMarkdownChunks = request.query.send_chunks !== 'false';

      // 1. Verify plan ownership
      const [plan] = await db
        .select({ id: lessonPlans.id, status: lessonPlans.status })
        .from(lessonPlans)
        .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.userId, user.id)))
        .limit(1);

      if (!plan) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      // 2. Set SSE headers on the raw response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Request-Id': requestId,
        'Access-Control-Allow-Origin': request.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      // Flush headers immediately
      reply.raw.flushHeaders();

      request.log.info({ planId, requestId, forwardMarkdownChunks }, 'SSE stream opened');

      reply.raw.write(formatSSE('progress', {
        step: 'queued',
        label: 'Đang chuẩn bị kết nối tạo giáo án...',
      }));

      // Send keepalive every 15s to prevent proxy/browser timeouts
      const keepalive = setInterval(() => {
        try { reply.raw.write(':keepalive\n\n'); } catch {}
      }, 15_000);

      // 3. Create an abort controller for client disconnect
      const abortController = new AbortController();

      // Detect client disconnect
      request.raw.on('close', () => {
        request.log.info({ planId }, 'SSE client disconnected');
        abortController.abort();
      });

      // 4. Open upstream SSE connection to AI Service
      let aiResponse: Response;
      try {
        aiResponse = await openAIStreamWithRetry(
          planId,
          requestId,
          abortController.signal,
          reply.raw,
          request.log,
        );
      } catch (err: unknown) {
        request.log.error({ planId, err: getErrorMessage(err) }, 'Failed to connect to AI Service stream');

        // Send error event to client
        const errorEvent = formatSSE('error', {
          message: 'Could not connect to AI Service. Please try again later.',
          recoverable: false,
        });
        reply.raw.write(errorEvent);
        reply.raw.end();
        return;
      }

      // 5. Pipe events from AI Service → Client
      const body = aiResponse.body;
      if (!body) {
        const errorEvent = formatSSE('error', {
          message: 'AI Service returned empty stream',
          recoverable: false,
        });
        reply.raw.write(errorEvent);
        reply.raw.end();
        return;
      }

      // Accumulate markdown content to persist to DB after stream ends
      let accumulatedMarkdown = '';
      let complianceStatus = 'PENDING';
      let finalPlanJson: Record<string, unknown> | null = null;
      let sseBuffer = '';  // Buffer for incomplete SSE messages

      try {
        const reader = body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Check if client already disconnected
          if (abortController.signal.aborted) {
            request.log.info({ planId }, 'Stopping SSE pipe — client disconnected');
            reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            request.log.info({ planId }, 'AI Service stream ended');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          if (forwardMarkdownChunks) {
            reply.raw.write(chunk);
          }

          // Parse SSE events to accumulate markdown content
          // Normalize \r\n to \n (sse_starlette uses \r\n)
          sseBuffer += chunk.replace(/\r\n/g, '\n');
          const messages = sseBuffer.split('\n\n');
          // Keep the last potentially incomplete message in the buffer
          sseBuffer = messages.pop() || '';

          for (const msg of messages) {
            try {
              const { eventType, eventData } = parseSSEMessage(msg);
              if (!eventType || !eventData) continue;

              const parsed = JSON.parse(eventData);
              const persistence = applyStreamPersistenceEvent(
                { accumulatedMarkdown, finalPlanJson, complianceStatus },
                eventType,
                parsed,
              );
              accumulatedMarkdown = persistence.accumulatedMarkdown;
              finalPlanJson = persistence.finalPlanJson;
              complianceStatus = persistence.complianceStatus;

              if (eventType === 'chunk') {
                if (!forwardMarkdownChunks && parsed.type !== 'markdown') {
                  reply.raw.write(formatSSE(eventType, parsed));
                }
              } else if (eventType === 'plan') {
                if (!forwardMarkdownChunks) {
                  reply.raw.write(formatSSE(eventType, parsed));
                }
              } else if (eventType === 'done') {
                if (!forwardMarkdownChunks) {
                  reply.raw.write(formatSSE(eventType, parsed));
                }
              } else if (!forwardMarkdownChunks) {
                reply.raw.write(formatSSE(eventType, parsed));
              }
            } catch {
              // Skip unparseable SSE messages — don't break the pipe
            }
          }
        }
      } catch (err: unknown) {
        // Don't send error if client already disconnected
        if (!abortController.signal.aborted) {
          request.log.error({ planId, err: getErrorMessage(err) }, 'SSE stream interrupted');

          const errorEvent = formatSSE('error', {
            message: 'Stream interrupted. Please refresh to check status.',
            recoverable: true,
          });
          try {
            reply.raw.write(errorEvent);
          } catch {
            // Client socket may already be destroyed
          }
        }
      } finally {
        clearInterval(keepalive);
        // 6. Ensure connection is closed
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        request.log.info({ planId, markdownLength: accumulatedMarkdown.length, hasPlanJson: Boolean(finalPlanJson) }, 'SSE stream closed');

        // 7. Save accumulated markdown and final JSON content to DB immediately
        if (accumulatedMarkdown.length > 0 || finalPlanJson) {
          try {
            await db.update(lessonPlans)
              .set(buildPlanPersistenceUpdate(accumulatedMarkdown, finalPlanJson, complianceStatus))
              .where(eq(lessonPlans.id, planId));
            request.log.info({ planId, markdownLength: accumulatedMarkdown.length, hasPlanJson: Boolean(finalPlanJson) }, 'Generated content saved to DB');
          } catch (dbErr: unknown) {
            request.log.error({ planId, err: getErrorMessage(dbErr) }, 'Failed to save content markdown');
          }
        }

        // 8. After content saved, fetch DOCX with retry logic
        finalizeDocxWithRetry(planId, requestId, request.log).catch(async (err: unknown) => {
          request.log.error({ planId, err: getErrorMessage(err) }, 'Failed to finalize DOCX after all retries');
          // Content already saved above; ensure status is completed
          await db.update(lessonPlans)
            .set({ status: 'completed', updatedAt: new Date() })
            .where(eq(lessonPlans.id, planId));
        });
      }

      // Prevent Fastify from trying to send a response (we already handled it)
      return;
    },
  );
}

/**
 * Parse a normalized Server-Sent Event message.
 */
function parseSSEMessage(message: string): { eventType: string; eventData: string } {
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

/**
 * Format a Server-Sent Event string.
 */
function formatSSE(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function openAIStreamWithRetry(
  planId: string,
  requestId: string,
  signal: AbortSignal,
  raw: { write: (chunk: string) => unknown },
  log: StreamLog,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= STREAM_CONNECT_RETRY_DELAYS_MS.length; attempt++) {
    if (signal.aborted) {
      throw new Error('Client disconnected before AI stream connected');
    }

    try {
      return await aiClient.openStream(planId, requestId, signal);
    } catch (err: unknown) {
      lastError = err;

      if (attempt === STREAM_CONNECT_RETRY_DELAYS_MS.length || signal.aborted) {
        break;
      }

      const delayMs = STREAM_CONNECT_RETRY_DELAYS_MS[attempt];
      log.warn({ planId, attempt: attempt + 1, delayMs, err: getErrorMessage(err) }, 'AI stream not ready, retrying');
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

function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
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

/**
 * After stream ends: fetch DOCX from AI Service, upload to Storage, update DB.
 */
async function finalizeDocx(planId: string, requestId: string, log: StreamLog): Promise<void> {
  const res = await aiClient.fetchDocx(planId, requestId);

  if (!res.ok) {
    throw new Error(`DOCX not available from AI Service: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `${planId}/giao_an.docx`;
  await storageService.upload('documents', storagePath, buffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  // Store path (not full URL) so getSignedUrl works correctly
  await db.update(lessonPlans)
    .set({ docxUrl: storagePath, status: 'completed', updatedAt: new Date() })
    .where(eq(lessonPlans.id, planId));

  log.info({ planId, storagePath }, 'DOCX uploaded and DB updated');
}

/**
 * Retry wrapper for finalizeDocx with exponential backoff.
 * 3 attempts with delays: 5s, 10s, 15s before each attempt.
 */
async function finalizeDocxWithRetry(planId: string, requestId: string, log: StreamLog): Promise<void> {
  const RETRY_DELAYS_MS = [5_000, 10_000, 15_000];
  const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Wait before each attempt (give AI Service time to finalize)
    const delay = RETRY_DELAYS_MS[attempt - 1];
    log.info({ planId, attempt, delayMs: delay }, `DOCX finalize: waiting ${delay / 1000}s before attempt ${attempt}/${MAX_ATTEMPTS}`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await finalizeDocx(planId, requestId, log);
      return; // Success — exit retry loop
    } catch (err: unknown) {
      log.warn(
        { planId, attempt, maxAttempts: MAX_ATTEMPTS, err: getErrorMessage(err) },
        `DOCX finalize attempt ${attempt}/${MAX_ATTEMPTS} failed`,
      );

      if (attempt === MAX_ATTEMPTS) {
        log.error({ planId }, 'DOCX finalize: all retry attempts exhausted');
        throw err;
      }
    }
  }
}
