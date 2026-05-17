import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { resources } from '../db/schema';
import { eq, and, ilike, or, sql } from 'drizzle-orm';
import { listSystemResourcesQuerySchema } from '../types/schemas';
import { storageService } from '../services/storage';

export default async function systemResourceRoutes(fastify: FastifyInstance) {
  // ────── GET /api/resources/system — List system resources ──────
  fastify.get('/api/resources/system', async (request, reply) => {
    const query = listSystemResourcesQuerySchema.parse(request.query);

    const conditions = [eq(resources.isSystem, true)];
    if (query.subject) conditions.push(eq(resources.subject, query.subject));
    if (query.grade) conditions.push(eq(resources.grade, query.grade));
    if (query.category) conditions.push(eq(resources.category, query.category));
    if (query.search) {
      conditions.push(
        or(
          ilike(resources.filename, `%${query.search}%`),
          ilike(resources.description, `%${query.search}%`),
        )!,
      );
    }

    const data = await db
      .select({
        id: resources.id,
        filename: resources.filename,
        fileUrl: resources.fileUrl,
        fileSize: resources.fileSize,
        pageCount: resources.pageCount,
        category: resources.category,
        subject: resources.subject,
        grade: resources.grade,
        description: resources.description,
        metadata: resources.metadata,
        createdAt: resources.createdAt,
      })
      .from(resources)
      .where(and(...conditions))
      .orderBy(resources.subject, sql`${resources.grade}::int`, resources.category, resources.filename);

    return reply.send({ data });
  });

  // ────── GET /api/resources/system/:id — System resource detail ──────
  fastify.get<{ Params: { id: string } }>('/api/resources/system/:id', async (request, reply) => {
    const { id } = request.params;

    const [resource] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.isSystem, true)))
      .limit(1);

    if (!resource) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'System resource not found' });
    }

    // Truncate content_text for preview (full text is large)
    const preview = resource.contentText
      ? resource.contentText.substring(0, 2000)
      : null;

    return reply.send({
      ...resource,
      contentText: preview,
      contentTextTruncated: resource.contentText ? resource.contentText.length > 2000 : false,
    });
  });

  // ────── GET /api/resources/system/:id/download — Download system resource file ──────
  fastify.get<{ Params: { id: string } }>('/api/resources/system/:id/download', async (request, reply) => {
    const { id } = request.params;

    const [resource] = await db
      .select({ id: resources.id, fileUrl: resources.fileUrl, filename: resources.filename })
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.isSystem, true)))
      .limit(1);

    if (!resource) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'System resource not found' });
    }

    // Generate signed URL (1 hour expiry)
    try {
      const signedUrl = await storageService.getSignedUrl('system-resources', resource.fileUrl, 3600);
      return reply.redirect(signedUrl);
    } catch (err) {
      request.log.error({ err, resourceId: id }, 'Failed to generate download URL');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Could not generate download link',
      });
    }
  });
}
