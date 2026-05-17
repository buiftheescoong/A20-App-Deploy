import { FastifyInstance, FastifyReply } from 'fastify';
import { db } from '../db/client';
import { lessonPlans, resources } from '../db/schema';
import { eq, and, desc, asc, sql, ilike, inArray } from 'drizzle-orm';
import { createPlanSchema, updatePlanSchema, listPlansQuerySchema } from '../types/schemas';
import { aiClient, isAIRequestTimeout } from '../services/ai-client';
import { storageService } from '../services/storage';
import { planCreateRateLimit } from '../plugins/rate-limit';
import { randomUUID } from 'crypto';
import {
  AiResourceContext,
  buildCreatePlanRawBody,
  buildPlanAiInput,
  buildSystemResourceLessonMap,
  getPlanRouteErrorMessage,
  isAllowedPlanFileType,
  isPlanFileSizeAllowed,
  mergeResourceIds,
  safeUploadFilename,
  sliceMarkdownLesson,
  toAiResourceContext,
} from './plan-create-helpers';
import {
  buildDocxContentDisposition,
  buildDocxPlanPayload,
  buildDocxStoragePath,
  DOCX_MIME_TYPE,
  hasExportableDocxContent,
} from './plan-export-helpers';
import {
  getPublicQualityCheckSnapshot,
  runQualityCheckAndPersist,
  runQualityCheckInBackground,
  startQualityCheckRun,
} from './quality-check-helpers';

export default async function planRoutes(fastify: FastifyInstance) {
  // ────── POST /api/plans — Create plan + trigger AI ──────
  fastify.post('/api/plans', planCreateRateLimit, async (request, reply) => {
    const user = request.user!;

    // Parse multipart form data
    const fields: Record<string, string> = {};
    const uploadedResourceIds: string[] = [];
    const uploadedFileUrls: string[] = [];
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value as string;
      } else {
        if (!isAllowedPlanFileType(part.mimetype)) {
          await part.toBuffer();
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            message: 'Only PDF, DOCX, and TXT files are allowed',
          });
        }

        const fileBuffer = await part.toBuffer();
        if (!isPlanFileSizeAllowed(fileBuffer.length)) {
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            message: 'File size exceeds 50MB limit',
          });
        }

        const resourceId = randomUUID();
        const originalFilename = part.filename || `${part.fieldname}-${resourceId}`;
        const safeFilename = safeUploadFilename(originalFilename);
        const storagePath = `${user.id}/${resourceId}/${safeFilename}`;
        const fileUrl = await storageService.upload('resources', storagePath, fileBuffer, part.mimetype);

        const [resource] = await db.insert(resources).values({
          id: resourceId,
          userId: user.id,
          filename: originalFilename,
          fileUrl,
          fileSize: fileBuffer.length,
          isSystem: false,
          isEmbedded: false,
          category: 'khac',
          metadata: {
            originalName: originalFilename,
            mimeType: part.mimetype,
            source: 'plan-create',
          },
        }).returning({ id: resources.id, fileUrl: resources.fileUrl });

        uploadedResourceIds.push(resource.id);
        uploadedFileUrls.push(resource.fileUrl);
      }
    }

    const body = createPlanSchema.parse(buildCreatePlanRawBody(fields));
    const allResourceIds = mergeResourceIds(body.resource_ids, uploadedResourceIds);
    const systemResourceLessonMap = buildSystemResourceLessonMap(body.system_resource_lessons);

    const planId = randomUUID();

    // Resolve system resource content_text if system_resource_ids provided
    let systemResourceTexts: string[] = [];
    let systemResourceContexts: AiResourceContext[] = [];
    if (body.system_resource_ids && body.system_resource_ids.length > 0) {
      const systemResources = await db
        .select({
          id: resources.id,
          filename: resources.filename,
          contentText: resources.contentText,
          category: resources.category,
          subject: resources.subject,
          grade: resources.grade,
          metadata: resources.metadata,
        })
        .from(resources)
        .where(and(eq(resources.isSystem, true), inArray(resources.id, body.system_resource_ids)));

      const foundIds = new Set(systemResources.map((resource) => resource.id));
      const missingId = body.system_resource_ids.find((srId) => !foundIds.has(srId));
      if (missingId) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: `System resource ${missingId} not found`,
        });
      }

      for (const resource of systemResources) {
        const selectedLessonTitle = systemResourceLessonMap.get(resource.id);
        let contentText = resource.contentText || '';
        let metadataOverrides: Record<string, unknown> = {};

        if (selectedLessonTitle) {
          const slicedText = sliceMarkdownLesson(contentText, selectedLessonTitle);
          if (!slicedText) {
            return reply.code(400).send({
              error: 'VALIDATION_ERROR',
              message: `Lesson "${selectedLessonTitle}" not found in system resource ${resource.id}`,
            });
          }

          contentText = slicedText;
          metadataOverrides = {
            selection_scope: 'lesson',
            lesson: selectedLessonTitle,
          };
        }

        if (contentText) {
          systemResourceContexts.push(toAiResourceContext({ ...resource, contentText }, metadataOverrides));
        }
      }
      systemResourceTexts = systemResourceContexts.map((context) => context.content_text);
    }

    let resourceContexts: AiResourceContext[] = [];
    if (allResourceIds.length > 0) {
      const userResources = await db
        .select({
          id: resources.id,
          filename: resources.filename,
          contentText: resources.contentText,
          category: resources.category,
          subject: resources.subject,
          grade: resources.grade,
          metadata: resources.metadata,
        })
        .from(resources)
        .where(and(eq(resources.userId, user.id), eq(resources.isSystem, false), inArray(resources.id, allResourceIds)));

      resourceContexts = userResources
        .filter((resource) => Boolean(resource.contentText))
        .map((resource) => toAiResourceContext(resource));
    }

    // Insert lesson plan record
    const [plan] = await db.insert(lessonPlans).values({
      id: planId,
      userId: user.id,
      subject: body.subject,
      grade: body.grade,
      topic: body.topic,
      teachingModel: body.teaching_model,
      objectives: body.objectives || null,
      emphasis: body.emphasis || null,
      specialRequests: body.special_requests || null,
      resourceIds: allResourceIds.length > 0 ? allResourceIds : null,
      status: 'pending',
      iterationCount: 0,
      complianceStatus: 'PENDING',
    }).returning();

    // Call AI Service in background (non-blocking)
    aiClient
      .generate(
        planId,
        buildPlanAiInput(
          body,
          allResourceIds,
          uploadedFileUrls,
          systemResourceTexts,
          resourceContexts,
          systemResourceContexts,
        ),
        request.id,
      )
      .then(() => {
        request.log.info({ planId }, 'AI generate triggered');
      })
      .catch(async (err) => {
        request.log.error({ planId, err }, 'AI generate failed');
        try {
          await db
            .update(lessonPlans)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(lessonPlans.id, planId));
        } catch (dbErr) {
          request.log.error({ planId, err: dbErr }, 'Failed to mark plan as failed');
        }
      });

    // Update status to generating
    await db
      .update(lessonPlans)
      .set({ status: 'generating' })
      .where(eq(lessonPlans.id, planId));

    return reply.code(202).send({ status: 'accepted', plan_id: planId });
  });

  // ────── GET /api/plans — List plans ──────
  fastify.get('/api/plans', async (request, reply) => {
    const user = request.user!;
    const query = listPlansQuerySchema.parse(request.query);

    const offset = (query.page - 1) * query.limit;
    const orderDir = query.sort === 'newest' ? desc(lessonPlans.createdAt) : asc(lessonPlans.createdAt);

    // Build conditions
    const conditions = [eq(lessonPlans.userId, user.id)];
    if (query.subject) conditions.push(eq(lessonPlans.subject, query.subject));
    if (query.grade) conditions.push(eq(lessonPlans.grade, query.grade));

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const data = await db
      .select({
        id: lessonPlans.id,
        subject: lessonPlans.subject,
        grade: lessonPlans.grade,
        topic: lessonPlans.topic,
        teachingModel: lessonPlans.teachingModel,
        status: lessonPlans.status,
        complianceStatus: lessonPlans.complianceStatus,
        docxUrl: lessonPlans.docxUrl,
        createdAt: lessonPlans.createdAt,
        updatedAt: lessonPlans.updatedAt,
      })
      .from(lessonPlans)
      .where(whereClause)
      .orderBy(orderDir)
      .limit(query.limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonPlans)
      .where(whereClause);

    return reply.send({
      data,
      total: count,
      page: query.page,
      limit: query.limit,
    });
  });

  // ────── GET /api/plans/:id/status — Lightweight generation status ──────
  fastify.get<{ Params: { id: string } }>('/api/plans/:id/status', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [plan] = await db
      .select({
        id: lessonPlans.id,
        status: lessonPlans.status,
        complianceStatus: lessonPlans.complianceStatus,
        docxUrl: lessonPlans.docxUrl,
        sessionState: lessonPlans.sessionState,
        hasContent: sql<boolean>`coalesce(length(${lessonPlans.contentMarkdown}), 0) > 0`,
        updatedAt: lessonPlans.updatedAt,
      })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    const { sessionState, ...status } = plan;
    return reply.send({
      ...status,
      qualityCheck: getPublicQualityCheckSnapshot(sessionState),
    });
  });

  // ────── GET /api/plans/:id — Get plan detail ──────
  fastify.get<{ Params: { id: string } }>('/api/plans/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [plan] = await db
      .select()
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    return reply.send(plan);
  });

  // ────── PATCH /api/plans/:id — Update plan (inline edit) ──────
  fastify.patch<{ Params: { id: string } }>('/api/plans/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;
    const body = updatePlanSchema.parse(request.body);

    // Verify ownership
    const [existing] = await db
      .select({
        id: lessonPlans.id,
        docxUrl: lessonPlans.docxUrl,
        teachingModel: lessonPlans.teachingModel,
        sessionState: lessonPlans.sessionState,
      })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    let qualityRun: ReturnType<typeof startQualityCheckRun> | null = null;
    if (body.content_markdown !== undefined) {
      qualityRun = startQualityCheckRun(existing.sessionState, 'inline_edit');
      updateData.contentMarkdown = body.content_markdown;
      updateData.contentJson = body.content_json ?? null;
      updateData.complianceStatus = 'PENDING';
      updateData.docxUrl = null;
      updateData.sessionState = qualityRun.sessionState;
    } else if (body.content_json !== undefined) {
      updateData.contentJson = body.content_json;
    }

    const [updated] = await db
      .update(lessonPlans)
      .set(updateData)
      .where(eq(lessonPlans.id, id))
      .returning();

    if (body.content_markdown !== undefined && existing.docxUrl) {
      try {
        await storageService.delete('documents', existing.docxUrl);
      } catch (err) {
        request.log.warn({ err, planId: id }, 'Failed to delete stale DOCX from storage');
      }
    }

    if (body.content_markdown !== undefined && qualityRun) {
      runQualityCheckInBackground({
        planId: id,
        markdown: body.content_markdown,
        teachingModel: existing.teachingModel,
        source: 'inline_edit',
        runId: qualityRun.runId,
        requestId: request.id,
        log: request.log,
      });
    }

    return reply.send(updated);
  });

  // ────── DELETE /api/plans/:id — Delete plan ──────
  fastify.delete<{ Params: { id: string } }>('/api/plans/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [plan] = await db
      .select({ id: lessonPlans.id, docxUrl: lessonPlans.docxUrl })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    // Delete DOCX from storage if exists
    if (plan.docxUrl) {
      try {
        await storageService.delete('documents', plan.docxUrl);
      } catch (err) {
        request.log.warn({ err, planId: id }, 'Failed to delete DOCX from storage');
      }
    }

    // Delete from DB (CASCADE deletes messages)
    await db.delete(lessonPlans).where(eq(lessonPlans.id, id));

    return reply.code(204).send();
  });

  // ────── POST /api/plans/:id/quality-check — Run quality check ──────
  fastify.post<{ Params: { id: string } }>('/api/plans/:id/quality-check', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [plan] = await db
      .select({
        id: lessonPlans.id,
        contentMarkdown: lessonPlans.contentMarkdown,
        teachingModel: lessonPlans.teachingModel,
        sessionState: lessonPlans.sessionState,
      })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    if (!plan.contentMarkdown) {
      return reply.code(422).send({ error: 'NOT_READY', message: 'Plan content not yet generated' });
    }

    const qualityRun = startQualityCheckRun(plan.sessionState, 'manual');
    await db
      .update(lessonPlans)
      .set({
        sessionState: qualityRun.sessionState,
        complianceStatus: 'PENDING',
        updatedAt: new Date(),
      })
      .where(eq(lessonPlans.id, id));

    try {
      const report = await runQualityCheckAndPersist({
        planId: id,
        markdown: plan.contentMarkdown,
        teachingModel: plan.teachingModel,
        source: 'manual',
        runId: qualityRun.runId,
        requestId: request.id,
        log: request.log,
      });
      return reply.send(report);
    } catch (err: unknown) {
      request.log.error({ planId: id, err: getPlanRouteErrorMessage(err) }, 'AI quality-check failed');
      if (isAIRequestTimeout(err)) {
        return reply.code(504).send({ error: 'AI_TIMEOUT', message: 'Quality check took too long' });
      }
      return reply.code(502).send({ error: 'AI_SERVICE_ERROR', message: 'Quality check failed' });
    }
  });

  // ────── GET /api/plans/:id/export — Download DOCX ──────
  fastify.get<{ Params: { id: string } }>('/api/plans/:id/export', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [plan] = await db
      .select({
        id: lessonPlans.id,
        subject: lessonPlans.subject,
        grade: lessonPlans.grade,
        topic: lessonPlans.topic,
        teachingModel: lessonPlans.teachingModel,
        objectives: lessonPlans.objectives,
        contentMarkdown: lessonPlans.contentMarkdown,
        contentJson: lessonPlans.contentJson,
        complianceStatus: lessonPlans.complianceStatus,
        docxUrl: lessonPlans.docxUrl,
      })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.id, id), eq(lessonPlans.userId, user.id)))
      .limit(1);

    if (!plan) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Plan not found' });
    }

    if (plan.docxUrl) {
      try {
        const existing = await storageService.download('documents', plan.docxUrl);
        return sendDocx(reply, existing, id);
      } catch (err) {
        request.log.warn({ err, planId: id, docxUrl: plan.docxUrl }, 'Stored DOCX missing, regenerating export');
      }
    }

    if (!hasExportableDocxContent(plan)) {
      return reply.code(422).send({ error: 'NOT_READY', message: 'Lesson content is not ready for DOCX export' });
    }

    let rendered: Response;
    try {
      rendered = await aiClient.renderDocx(
        id,
        buildDocxPlanPayload(plan),
        plan.contentMarkdown || '',
        request.id,
      );
    } catch (err: unknown) {
      request.log.error({ planId: id, err: getPlanRouteErrorMessage(err) }, 'AI DOCX render request failed');
      return reply.code(502).send({ error: 'AI_SERVICE_ERROR', message: 'DOCX rendering failed' });
    }

    if (!rendered.ok) {
      request.log.error({ planId: id, status: rendered.status, body: await rendered.text() }, 'AI DOCX render failed');
      return reply.code(502).send({ error: 'AI_SERVICE_ERROR', message: 'DOCX rendering failed' });
    }

    const buffer = Buffer.from(await rendered.arrayBuffer());
    const storagePath = buildDocxStoragePath(id);
    await storageService.upload('documents', storagePath, buffer, DOCX_MIME_TYPE);
    await db
      .update(lessonPlans)
      .set({ docxUrl: storagePath, status: 'completed', updatedAt: new Date() })
      .where(eq(lessonPlans.id, id));

    return sendDocx(reply, buffer, id);
  });
}

function sendDocx(reply: FastifyReply, buffer: Buffer, planId: string) {
  return reply
    .header('Content-Type', DOCX_MIME_TYPE)
    .header('Content-Disposition', buildDocxContentDisposition(planId))
    .header('Content-Length', String(buffer.length))
    .send(buffer);
}
