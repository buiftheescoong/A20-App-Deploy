import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, pgEnum, customType } from 'drizzle-orm/pg-core';

// ────── Enums ──────

export const planStatusEnum = pgEnum('plan_status', [
  'pending', 'generating', 'completed', 'failed',
]);

export const resourceCategoryEnum = pgEnum('resource_category', [
  'sgk', 'sgv', 'khung_chuong_trinh', 'khac',
]);

// ────── Lesson Plans ──────

export const lessonPlans = pgTable('lesson_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  subject: text('subject').notNull(),
  grade: text('grade').notNull(),
  topic: text('topic').notNull(),
  teachingModel: text('teaching_model').notNull(),       // '5E' | '3-phase'
  objectives: text('objectives').array(),
  emphasis: text('emphasis'),
  specialRequests: text('special_requests'),
  resourceIds: uuid('resource_ids').array(),
  contentMarkdown: text('content_markdown'),
  contentJson: jsonb('content_json'),
  sessionState: jsonb('session_state').default({}),
  status: planStatusEnum('status').default('pending'),
  iterationCount: integer('iteration_count').default(0),
  complianceStatus: text('compliance_status'),            // 'PASSED' | 'FAILED' | 'PENDING'
  docxUrl: text('docx_url'),
  isBlankTemplate: boolean('is_blank_template').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ────── Lesson Plan Messages ──────

export const lessonPlanMessages = pgTable('lesson_plan_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => lessonPlans.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                           // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  messageType: text('message_type').default('chat'),      // 'chat' | 'refinement'
  attachedFiles: jsonb('attached_files').default([]),
  createdAt: timestamp('created_at').defaultNow(),
});

// ────── Resources ──────

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),                                 // NULL = system resource
  filename: text('filename').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  pageCount: integer('page_count'),
  contentText: text('content_text'),
  isEmbedded: boolean('is_embedded').default(false),
  isSystem: boolean('is_system').default(false),           // TRUE = tài liệu hệ thống (SGK/SGV)
  category: resourceCategoryEnum('category'),              // 'sgk' | 'sgv' | 'khung_chuong_trinh' | 'khac'
  subject: text('subject'),                                // Môn học (Toán, Vật Lý, ...)
  grade: text('grade'),                                    // Lớp (6-12)
  description: text('description'),                        // Mô tả ngắn tài liệu
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
});

// ────── RAG Embeddings ──────

export const resourceEmbeddings = pgTable('resource_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

// ────── Type helpers ──────

export type LessonPlan = typeof lessonPlans.$inferSelect;
export type NewLessonPlan = typeof lessonPlans.$inferInsert;
export type LessonPlanMessage = typeof lessonPlanMessages.$inferSelect;
export type NewLessonPlanMessage = typeof lessonPlanMessages.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type ResourceEmbedding = typeof resourceEmbeddings.$inferSelect;
export type NewResourceEmbedding = typeof resourceEmbeddings.$inferInsert;
