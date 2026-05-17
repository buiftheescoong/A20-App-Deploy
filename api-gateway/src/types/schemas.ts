import { z } from 'zod/v4';

// ────── Plan Schemas ──────

export const systemResourceLessonSchema = z.object({
  resource_id: z.string().uuid(),
  lesson_title: z.string().trim().min(1).max(500),
});

export const createPlanSchema = z.object({
  subject: z.string().min(1, 'Môn học không được trống'),
  grade: z.string().regex(/^(6|7|8|9|10|11|12)$/, 'Lớp phải từ 6-12'),
  topic: z.string().min(1).max(500, 'Tên bài tối đa 500 ký tự'),
  teaching_model: z.enum(['5E', '3-phase', 'CV-5512']),
  objectives: z.array(z.string()).optional(),
  emphasis: z.string().max(2000).optional(),
  special_requests: z.string().max(2000).optional(),
  resource_ids: z.array(z.string().uuid()).optional(),
  system_resource_ids: z.array(z.string().uuid()).optional(),
  system_resource_lessons: z.array(systemResourceLessonSchema).optional(),
}).superRefine((value, ctx) => {
  if (!value.system_resource_lessons?.length) return;

  const selectedSystemIds = new Set(value.system_resource_ids ?? []);
  value.system_resource_lessons.forEach((selection, index) => {
    if (!selectedSystemIds.has(selection.resource_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['system_resource_lessons', index, 'resource_id'],
        message: 'Lesson resource_id must also be present in system_resource_ids',
      });
    }
  });
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z.object({
  content_markdown: z.string().optional(),
  content_json: z.record(z.string(), z.unknown()).optional(),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const listPlansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  subject: z.string().optional(),
  grade: z.string().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

// ────── Chat Schemas ──────

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// ────── Resource Schemas ──────

export const listSystemResourcesQuerySchema = z.object({
  subject: z.string().optional(),
  grade: z.string().optional(),
  category: z.enum(['sgk', 'sgv', 'khung_chuong_trinh', 'khac']).optional(),
  search: z.string().optional(),
});

export type ListSystemResourcesQuery = z.infer<typeof listSystemResourcesQuerySchema>;

export const listUserResourcesQuerySchema = z.object({
  search: z.string().optional(),
});

export type ListUserResourcesQuery = z.infer<typeof listUserResourcesQuerySchema>;

// ────── Common Param Schemas ──────

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export type UuidParam = z.infer<typeof uuidParamSchema>;

// ────── User type ──────

export interface AuthUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

