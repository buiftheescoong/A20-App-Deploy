import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { resources } from '../db/schema';
import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { listUserResourcesQuerySchema } from '../types/schemas';
import { storageService } from '../services/storage';
import { randomUUID } from 'crypto';

const ALLOWED_FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default async function resourceRoutes(fastify: FastifyInstance) {
  // ────── POST /api/resources — Upload user resource ──────
  fastify.post('/api/resources', async (request, reply) => {
    const user = request.user!;
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'No file uploaded' });
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(data.mimetype)) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Only PDF, DOCX, and TXT files are allowed',
      });
    }

    // Read file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Validate file size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'File size exceeds 50MB limit',
      });
    }

    // Upload to Supabase Storage
    const resourceId = randomUUID();
    const safeFilename = data.filename.replace(/[\\/]/g, '_');
    const storagePath = `${user.id}/${resourceId}/${safeFilename}`;
    const fileUrl = await storageService.upload('resources', storagePath, fileBuffer, data.mimetype);

    // Insert resource record
    const [resource] = await db.insert(resources).values({
      id: resourceId,
      userId: user.id,
      filename: data.filename,
      fileUrl,
      fileSize: fileBuffer.length,
      isSystem: false,
      isEmbedded: false,
      category: 'khac',
      metadata: { originalName: data.filename, mimeType: data.mimetype },
    }).returning();

    request.log.info({ resourceId, filename: data.filename, size: fileBuffer.length }, 'Resource uploaded');

    return reply.code(201).send(resource);
  });

  // ────── GET /api/resources — List user resources ──────
  fastify.get('/api/resources', async (request, reply) => {
    const user = request.user!;
    const query = listUserResourcesQuerySchema.parse(request.query);

    const conditions = [
      eq(resources.userId, user.id),
      eq(resources.isSystem, false),
    ];

    if (query.search) {
      conditions.push(ilike(resources.filename, `%${query.search}%`));
    }

    const data = await db
      .select()
      .from(resources)
      .where(and(...conditions))
      .orderBy(desc(resources.createdAt));

    return reply.send({ data });
  });

  // ────── GET /api/resources/:id — Resource detail ──────
  fastify.get<{ Params: { id: string } }>('/api/resources/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [resource] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.userId, user.id), eq(resources.isSystem, false)))
      .limit(1);

    if (!resource) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Resource not found' });
    }

    return reply.send(resource);
  });

  // ────── DELETE /api/resources/:id — Delete user resource ──────
  fastify.delete<{ Params: { id: string } }>('/api/resources/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    const [resource] = await db
      .select({ id: resources.id, fileUrl: resources.fileUrl })
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.userId, user.id), eq(resources.isSystem, false)))
      .limit(1);

    if (!resource) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Resource not found' });
    }

    // Delete file from storage
    try {
      const storagePath = resource.fileUrl.split('/storage/v1/object/public/resources/')[1];
      if (storagePath) {
        await storageService.delete('resources', storagePath);
      }
    } catch (err) {
      request.log.warn({ err, resourceId: id }, 'Failed to delete from storage');
    }

    // Delete from DB
    await db.delete(resources).where(eq(resources.id, id));

    return reply.code(204).send();
  });
}
