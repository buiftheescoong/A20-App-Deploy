import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { lessonPlans, lessonPlanMessages } from '../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { chatMessageSchema } from '../types/schemas';
import { aiClient, isAIRequestTimeout } from '../services/ai-client';
import { storageService } from '../services/storage';
import { chatRateLimit } from '../plugins/rate-limit';
import { getErrorMessage, parseSSEMessage } from './stream-helpers';
import { buildChatPlanSnapshot } from './chat-helpers';
import {
  getPublicQualityCheckSnapshot,
  runQualityCheckInBackground,
  startQualityCheckRun,
} from './quality-check-helpers';

export default async function chatRoutes(fastify: FastifyInstance) {
  // ────── POST /api/plans/:id/chat — Send chat message ──────
  fastify.post<{ Params: { id: string } }>('/api/plans/:id/chat', chatRateLimit, async (request, reply) => {
    const user = request.user!;
    const { id: planId } = request.params;
    const body = chatMessageSchema.parse(request.body);

    // Verify plan ownership
    const [plan] = await db
      .select({
        id: lessonPlans.id,
        subject: lessonPlans.subject,
        grade: lessonPlans.grade,
        topic: lessonPlans.topic,
        docxUrl: lessonPlans.docxUrl,
        teachingModel: lessonPlans.teachingModel,
        contentMarkdown: lessonPlans.contentMarkdown,
        contentJson: lessonPlans.contentJson,
        sessionState: lessonPlans.sessionState,
      })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    // Save user message to DB
    await db.insert(lessonPlanMessages).values({
      planId,
      role: 'user',
      content: body.message,
      messageType: 'chat',
      attachedFiles: [],
    });

    // Forward to AI Service and WAIT for the full response
    let accumulatedContent = '';
    let intent = 'qa';

    try {
      const res = await aiClient.chat(planId, body.message, undefined, request.id, {
        markdown: plan.contentMarkdown,
        plan: buildChatPlanSnapshot(plan),
      });
      request.log.info({ planId }, 'Chat forwarded to AI, reading SSE response...');

      const responseBody = res.body;
      if (responseBody) {
        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const sseMessages = sseBuffer.split('\n\n');
          sseBuffer = sseMessages.pop() || '';

          for (const msg of sseMessages) {
            try {
              const { eventType, eventData } = parseSSEMessage(msg);
              if (!eventType || !eventData) continue;

              if (eventType === 'chunk') {
                const parsed = JSON.parse(eventData);
                if (parsed.type === 'markdown' && parsed.delta) {
                  accumulatedContent += parsed.delta;
                }
              } else if (eventType === 'chat') {
                const parsed = JSON.parse(eventData);
                if (parsed.delta) {
                  accumulatedContent += parsed.delta;
                }
              } else if (eventType === 'done') {
                const parsed = JSON.parse(eventData);
                if (parsed.intent) intent = parsed.intent;
              }
            } catch {
              // Skip unparseable SSE messages
            }
          }
        }
      }
    } catch (err: unknown) {
      request.log.error({ planId, err: getErrorMessage(err) }, 'Chat AI service error');
      if (isAIRequestTimeout(err)) {
        return reply.code(504).send({ error: 'AI_TIMEOUT', message: 'AI service took too long to respond' });
      }
      return reply.code(502).send({ error: 'AI_ERROR', message: 'Lỗi xử lý từ AI' });
    }

    // Save assistant response to DB
    if (accumulatedContent.length > 0) {
      // For refine: save short confirmation as chat message, update lesson plan content
      // For QA: save the full answer as the chat message
      const chatContent = intent === 'refine'
        ? '✅ Đã chỉnh sửa giáo án theo yêu cầu.'
        : accumulatedContent;

      const [savedMsg] = await db.insert(lessonPlanMessages).values({
        planId,
        role: 'assistant',
        content: chatContent,
        messageType: intent === 'refine' ? 'refinement' : 'chat',
        attachedFiles: [],
      }).returning();

      // If refine, update contentMarkdown with the full content
      let qualityCheck: ReturnType<typeof getPublicQualityCheckSnapshot> | null = null;
      if (intent === 'refine') {
        const qualityRun = startQualityCheckRun(plan.sessionState, 'chat_refine');
        const [updatedPlan] = await db.update(lessonPlans)
          .set({
            contentMarkdown: accumulatedContent,
            complianceStatus: 'PENDING',
            docxUrl: null,
            sessionState: qualityRun.sessionState,
            updatedAt: new Date(),
          })
          .where(eq(lessonPlans.id, planId))
          .returning({ sessionState: lessonPlans.sessionState });

        qualityCheck = getPublicQualityCheckSnapshot(updatedPlan.sessionState) ?? null;

        if (plan.docxUrl) {
          try {
            await storageService.delete('documents', plan.docxUrl);
          } catch (err) {
            request.log.warn({ err, planId }, 'Failed to delete stale DOCX after refinement');
          }
        }

        runQualityCheckInBackground({
          planId,
          markdown: accumulatedContent,
          teachingModel: plan.teachingModel,
          source: 'chat_refine',
          runId: qualityRun.runId,
          requestId: request.id,
          log: request.log,
        });
      }

      request.log.info({ planId, intent, contentLength: accumulatedContent.length }, 'Chat response saved');

      return reply.send({
        status: 'completed',
        intent,
        message: savedMsg,
        // Send the full markdown for refine so frontend can update display
        ...(intent === 'refine' ? {
          updatedMarkdown: accumulatedContent,
          complianceStatus: 'PENDING',
          docxUrl: null,
          qualityCheck,
        } : {}),
      });
    }

    return reply.send({
      status: 'completed',
      intent,
      message: null,
    });
  });

  // ────── GET /api/plans/:id/messages — Get chat history ──────
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/plans/:id/messages',
    async (request, reply) => {
      const user = request.user!;
      const { id: planId } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);

      // Verify plan ownership
      const [plan] = await db
        .select({ id: lessonPlans.id })
        .from(lessonPlans)
        .where(and(eq(lessonPlans.id, planId), eq(lessonPlans.userId, user.id)))
        .limit(1);

      if (!plan) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
      }

      const messages = await db
        .select()
        .from(lessonPlanMessages)
        .where(eq(lessonPlanMessages.planId, planId))
        .orderBy(asc(lessonPlanMessages.createdAt))
        .limit(limit);

      return reply.send({ data: messages });
    },
  );
}
