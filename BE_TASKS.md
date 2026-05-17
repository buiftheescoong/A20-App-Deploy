# ⚙️ BE Engineer — Chi tiết công việc

> **Project:** Giáo Án Thông Minh V2
> **Stack:** Node.js 20+, TypeScript, Fastify, Drizzle ORM, Supabase (PostgreSQL + Storage + Auth), Pino
> **Ngày tạo:** 2026-04-24

---

## Tổng quan

BE Engineer chịu trách nhiệm xây dựng API Gateway bằng Node.js/TypeScript. Gateway này đứng giữa Frontend và AI Service (Python), xử lý: Auth, CRUD, file upload, SSE proxy, validation, logging.

**Tại sao Node.js thay vì Python cho API Gateway?**
- TypeScript share types với Frontend (1 language stack)
- Node.js event loop tối ưu cho I/O-bound CRUD operations
- Python service chỉ tập trung AI logic (sạch, dễ maintain)
- Scale độc lập: Gateway scale theo request, AI Service scale theo compute

---

## Phase 1: Project Setup (Ngày 1-2)

### Task 1.1: Khởi tạo project
- [ ] `mkdir api-gateway && cd api-gateway && npm init -y`
- [ ] Cài dependencies:
  ```bash
  npm install fastify @fastify/cors @fastify/multipart @fastify/helmet
  npm install drizzle-orm postgres dotenv zod pino pino-pretty
  npm install @supabase/supabase-js
  npm install -D typescript @types/node tsx drizzle-kit
  ```
- [ ] `tsconfig.json` — strict mode, ESM
- [ ] `.env` file:
  ```
  PORT=3001
  DATABASE_URL=postgresql://...
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  SUPABASE_ANON_KEY=eyJ...
  AI_SERVICE_URL=http://localhost:8000
  NODE_ENV=development
  ```
- [ ] Folder structure:
  ```
  src/
  ├── index.ts
  ├── config.ts
  ├── plugins/
  ├── routes/
  ├── services/
  ├── db/
  └── types/
  ```

### Task 1.2: Fastify app setup (`src/index.ts`)
- [ ] Fastify instance với Pino logger
- [ ] Register plugins: CORS, helmet, multipart, auth
- [ ] Register route modules
- [ ] Error handler global
- [ ] Graceful shutdown

### Task 1.3: Auth plugin (`src/plugins/auth.ts`)
- [ ] Middleware: verify Supabase JWT từ `Authorization: Bearer <token>`
- [ ] Decode token → extract `user_id`, `email`
- [ ] Attach user info vào `request.user`
- [ ] Skip auth cho: `POST /api/auth/login`, `POST /api/auth/register`
- [ ] Return 401 nếu token invalid/expired

### Task 1.4: Request ID + Logging middleware
- [ ] Generate `x-request-id` (UUID) nếu chưa có trong header
- [ ] Attach vào response header
- [ ] Forward tới AI Service trong mọi internal call
- [ ] Pino log format:
  ```json
  {
    "level": "info",
    "requestId": "abc-123",
    "method": "POST",
    "url": "/api/plans",
    "userId": "user-456",
    "statusCode": 201,
    "duration": 45
  }
  ```

---

## Phase 2: Database (Ngày 2-3)

### Task 2.1: Drizzle schema (`src/db/schema.ts`)

```typescript
import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const planStatusEnum = pgEnum('plan_status', [
  'pending', 'generating', 'completed', 'failed'
]);

export const lessonPlans = pgTable('lesson_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  subject: text('subject').notNull(),
  grade: text('grade').notNull(),
  topic: text('topic').notNull(),
  teachingModel: text('teaching_model').notNull(),  // '5E' | '3-phase'
  objectives: text('objectives').array(),
  emphasis: text('emphasis'),
  specialRequests: text('special_requests'),
  resourceIds: uuid('resource_ids').array(),
  contentMarkdown: text('content_markdown'),
  contentJson: jsonb('content_json'),
  sessionState: jsonb('session_state').default({}),
  status: planStatusEnum('status').default('pending'),
  iterationCount: integer('iteration_count').default(0),
  complianceStatus: text('compliance_status'),       // 'PASSED' | 'FAILED' | 'PENDING'
  docxUrl: text('docx_url'),
  isBlankTemplate: boolean('is_blank_template').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const lessonPlanMessages = pgTable('lesson_plan_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => lessonPlans.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                      // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  messageType: text('message_type').default('chat'), // 'chat' | 'refinement'
  attachedFiles: jsonb('attached_files').default([]),
  createdAt: timestamp('created_at').defaultNow(),
});

export const resourceCategoryEnum = pgEnum('resource_category', [
  'sgk', 'sgv', 'khung_chuong_trinh', 'khac'
]);

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),                              // NULL = system resource
  filename: text('filename').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  pageCount: integer('page_count'),
  contentText: text('content_text'),
  isEmbedded: boolean('is_embedded').default(false),
  isSystem: boolean('is_system').default(false),        // TRUE = tài liệu hệ thống (SGK/SGV)
  category: resourceCategoryEnum('category'),            // 'sgk' | 'sgv' | 'khung_chuong_trinh' | 'khac'
  subject: text('subject'),                              // Môn học — dùng cho filter (Toán, Vật Lý, ...)
  grade: text('grade'),                                  // Lớp — dùng cho filter (6-12)
  description: text('description'),                      // Mô tả ngắn tài liệu
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### Task 2.2: Migration
- [ ] `npx drizzle-kit generate:pg` — generate SQL migration
- [ ] `npx drizzle-kit push:pg` — apply to Supabase
- [ ] Verify tables created trong Supabase dashboard
- [ ] Seed data (optional): vài resources mẫu

### Task 2.2b: Seed System Resources (`src/db/seed-system-resources.ts`)

Script import tài liệu SGK/SGV có sẵn vào hệ thống:

- [ ] Upload files SGK/SGV vào Supabase Storage bucket `system-resources`
- [ ] Insert records vào bảng `resources` với `is_system=true`, `user_id=NULL`
- [ ] Mỗi record cần: filename, file_url, category (sgk/sgv), subject, grade, description, page_count
- [ ] Extract text (gọi AI Service) để lưu content_text
- [ ] (Async) Trigger embedding cho RAG

**Danh sách tài liệu ban đầu (ví dụ):**
```typescript
const SYSTEM_RESOURCES = [
  { filename: 'SGK Toán 10', category: 'sgk', subject: 'Toán', grade: '10', description: 'Sách giáo khoa Toán 10 — Chương trình GDPT 2018' },
  { filename: 'SGK Toán 11', category: 'sgk', subject: 'Toán', grade: '11', description: 'Sách giáo khoa Toán 11 — Chương trình GDPT 2018' },
  { filename: 'SGV Toán 10', category: 'sgv', subject: 'Toán', grade: '10', description: 'Sách giáo viên Toán 10 — Hướng dẫn giảng dạy' },
  { filename: 'SGK Vật Lý 10', category: 'sgk', subject: 'Vật Lý', grade: '10', description: 'Sách giáo khoa Vật Lý 10 — Chương trình GDPT 2018' },
  // ... thêm các môn/lớp khác
];
```

- [ ] Script chạy: `npx tsx src/db/seed-system-resources.ts`
- [ ] Idempotent: chạy lại không tạo duplicate (check by filename + category + subject + grade)

### Task 2.3: DB client (`src/db/client.ts`)
- [ ] Drizzle + postgres.js connection
- [ ] Connection pooling config
- [ ] Health check query

---

## Phase 3: CRUD Routes (Ngày 3-5)

### Task 3.1: Plans routes (`src/routes/plans.ts`)

```typescript
// POST /api/plans — Tạo plan mới
// Input: FormData { subject, grade, topic, teaching_model, objectives?, emphasis?, special_requests?, files[]?, resource_ids[]?, system_resource_ids[]? }
// Logic:
//   1. Validate input (Zod)
//   2. Upload files[] tới Supabase Storage → get URLs
//   3. Nếu có system_resource_ids: verify tồn tại trong DB (is_system=true), lấy content_text
//   4. Insert lesson_plans record → status='pending'
//   5. Call AI Service: POST /ai/generate { plan_id, ...input, file_urls, system_resource_ids }
//   6. Return { plan_id } (202 Accepted)

// GET /api/plans — List plans
// Query: ?page=1&limit=10&subject=Toán&grade=11&sort=newest
// Logic:
//   1. Query lesson_plans WHERE user_id = req.user.id
//   2. Apply filters + pagination
//   3. Return { data: Plan[], total, page }

// GET /api/plans/:id — Get plan detail
// Logic:
//   1. Query lesson_plans WHERE id AND user_id
//   2. 404 if not found
//   3. Return plan with content

// PATCH /api/plans/:id — Update plan (inline edit)
// Input: { content_markdown?: string, content_json?: object }
// Logic:
//   1. Verify ownership
//   2. Update record
//   3. Return updated plan

// DELETE /api/plans/:id — Delete plan
// Logic:
//   1. Verify ownership
//   2. Delete from DB (CASCADE deletes messages)
//   3. Delete DOCX from Supabase Storage
//   4. Return 204
```

### Task 3.2: User Resources routes (`src/routes/resources.ts`)

```typescript
// POST /api/resources — Upload resource (tài liệu cá nhân)
// Input: FormData { file }
// Logic:
//   1. Validate file type (PDF, DOCX, TXT only)
//   2. Validate file size (max 50MB)
//   3. Upload to Supabase Storage bucket 'resources'
//   4. Extract text (gọi AI Service: POST /ai/extract-text)
//   5. Insert resources record (is_system=false, user_id=req.user.id)
//   6. (Async) Trigger embedding nếu file lớn
//   7. Return Resource

// GET /api/resources — List user's own resources
// Query: ?search=toan
// Logic:
//   1. Query resources WHERE user_id = req.user.id AND is_system = false
//   2. Optional search by filename
//   3. Return Resource[]

// GET /api/resources/:id — Get resource detail
// Logic:
//   1. Verify ownership (user_id = req.user.id)
//   2. Return resource + preview text

// DELETE /api/resources/:id — Delete resource (chỉ tài liệu cá nhân)
// Logic:
//   1. Verify ownership (user_id = req.user.id AND is_system = false)
//   2. Delete from Supabase Storage
//   3. Delete from DB (CASCADE deletes embeddings)
//   4. Return 204
```

### Task 3.2b: System Resources routes (`src/routes/system-resources.ts`)

```typescript
// GET /api/resources/system — List system resources (SGK/SGV có sẵn)
// Query: ?subject=Toán&grade=11&category=sgk&search=hàm+số
// Auth: ✅ (user phải đăng nhập để xem)
// Logic:
//   1. Query resources WHERE is_system = true
//   2. Apply filters: subject, grade, category
//   3. Optional search by filename/description
//   4. Return SystemResource[] (sorted by subject → grade)

// GET /api/resources/system/:id — Get system resource detail
// Auth: ✅
// Logic:
//   1. Query resources WHERE id AND is_system = true
//   2. 404 if not found
//   3. Return resource + preview text (content_text truncated)

// GET /api/resources/system/:id/download — Download file gốc
// Auth: ✅
// Logic:
//   1. Query resources WHERE id AND is_system = true
//   2. 404 if not found
//   3. Get signed URL from Supabase Storage (expires 1h)
//   4. Redirect hoặc proxy file download
```

### Task 3.3: Chat routes (`src/routes/chat.ts`)

```typescript
// POST /api/plans/:id/chat — Send message
// Input: FormData { message, files[]? }
// Logic:
//   1. Verify plan ownership
//   2. Upload files nếu có
//   3. Save user message → lesson_plan_messages
//   4. Forward tới AI Service: POST /ai/chat/:plan_id { message, file_urls }
//   5. Return 202 Accepted (response comes via SSE)

// GET /api/plans/:id/messages — Get chat history
// Query: ?limit=50
// Logic:
//   1. Verify plan ownership
//   2. Query lesson_plan_messages WHERE plan_id ORDER BY created_at
//   3. Return Message[]
```

### Task 3.4: Export route

```typescript
// GET /api/plans/:id/export — Download DOCX
// Logic:
//   1. Verify plan ownership
//   2. Get plan.docx_url
//   3. If exists: redirect/proxy Supabase Storage URL
//   4. If not: trigger AI Service to generate DOCX → return
```

---

## Phase 4: SSE Proxy (Ngày 5-6)

### Task 4.1: Stream route (`src/routes/stream.ts`)

**Đây là phần quan trọng nhất — proxy SSE từ AI Service tới Frontend.**

```typescript
// GET /api/plans/:id/stream — SSE proxy
// Logic:
//   1. Verify plan ownership
//   2. Set headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
//   3. Open HTTP connection tới AI Service: GET /ai/stream/:plan_id
//   4. Pipe events từ AI Service → Client
//   5. Handle:
//      - AI Service disconnect → retry or error event to client
//      - Client disconnect → close AI Service connection
//      - Timeout → close both
//   6. Forward x-request-id header

fastify.get('/api/plans/:id/stream', async (request, reply) => {
  const { id } = request.params;
  // Verify ownership...

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Request-Id': request.requestId,
  });

  const aiStream = await fetch(`${AI_SERVICE_URL}/ai/stream/${id}`, {
    headers: { 'X-Request-Id': request.requestId }
  });

  const reader = aiStream.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply.raw.write(decoder.decode(value));
    }
  } catch (err) {
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`);
  } finally {
    reply.raw.end();
  }
});
```

### Task 4.2: AI Service client (`src/services/ai-client.ts`)

```typescript
// HTTP client wrapper cho AI Service
class AIClient {
  private baseUrl: string;

  // POST /ai/generate — trigger generation
  async generate(planId: string, input: GenerateInput): Promise<void>

  // GET /ai/stream/:planId — open SSE stream (return ReadableStream)
  async openStream(planId: string, requestId: string): Promise<ReadableStream>

  // POST /ai/chat/:planId — forward chat message
  async chat(planId: string, message: string, fileUrls?: string[]): Promise<void>

  // POST /ai/embed — embed text
  async embed(text: string): Promise<number[]>

  // POST /ai/extract-text — extract text from file URL
  async extractText(fileUrl: string): Promise<{ text: string; pageCount: number }>
}
```

---

## Phase 5: Validation & Error Handling (Ngày 6-7)

### Task 5.1: Zod schemas (`src/types/schemas.ts`)

```typescript
import { z } from 'zod';

export const createPlanSchema = z.object({
  subject: z.string().min(1),
  grade: z.string().regex(/^(6|7|8|9|10|11|12)$/),
  topic: z.string().min(1).max(500),
  teaching_model: z.enum(['5E', '3-phase']),
  objectives: z.array(z.string()).optional(),
  emphasis: z.string().max(2000).optional(),
  special_requests: z.string().max(2000).optional(),
  resource_ids: z.array(z.string().uuid()).optional(),           // tài liệu cá nhân
  system_resource_ids: z.array(z.string().uuid()).optional(),    // tài liệu hệ thống (SGK/SGV)
});

export const updatePlanSchema = z.object({
  content_markdown: z.string().optional(),
  content_json: z.record(z.unknown()).optional(),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

export const listPlansQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  subject: z.string().optional(),
  grade: z.string().optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const listSystemResourcesQuerySchema = z.object({
  subject: z.string().optional(),
  grade: z.string().optional(),
  category: z.enum(['sgk', 'sgv', 'khung_chuong_trinh', 'khac']).optional(),
  search: z.string().optional(),
});
```

### Task 5.2: Error handler (`src/plugins/error-handler.ts`)
- [ ] Catch Zod validation errors → 400 with field errors
- [ ] Catch auth errors → 401
- [ ] Catch not found → 404
- [ ] Catch AI Service errors → 502
- [ ] Catch unknown errors → 500 + log full stack
- [ ] Error response format:
  ```json
  {
    "error": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [{ "field": "grade", "message": "Must be 6-12" }]
  }
  ```

### Task 5.3: Rate limiting
- [ ] Rate limit per user: 10 plans/hour, 100 messages/hour
- [ ] Rate limit global: 1000 req/min
- [ ] Return 429 with `Retry-After` header

---

## Phase 6: File Upload & Storage (Ngày 7-8)

### Task 6.1: Supabase Storage setup
- [ ] Create buckets:
  - `resources` — user uploaded documents (PDF, DOCX)
  - `system-resources` — tài liệu hệ thống SGK/SGV (admin upload, all users read)
  - `plans` — generated DOCX files
- [ ] Set bucket policies:
  - `resources`: authenticated users can upload/read own files
  - `system-resources`: public read (authenticated), admin-only write
  - `plans`: authenticated users can read own files
- [ ] File size limits: 50MB for resources, 200MB for system-resources

### Task 6.2: Upload service (`src/services/storage.ts`)
```typescript
class StorageService {
  // Upload file to Supabase Storage
  async upload(bucket: string, path: string, file: Buffer, contentType: string): Promise<string>

  // Delete file from Supabase Storage
  async delete(bucket: string, path: string): Promise<void>

  // Get signed URL (temporary access)
  async getSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string>
}
```

---

## Phase 7: Integration & Testing (Ngày 9-10)

### Task 7.1: Integration with AI Service
- [ ] Verify AI Service health check: `GET /ai/health`
- [ ] Test generate flow: POST /api/plans → AI Service → SSE → client
- [ ] Test chat flow: POST /api/plans/:id/chat → AI Service → SSE update
- [ ] Test error scenarios: AI Service down, timeout, LLM error

### Task 7.2: API tests
- [ ] Unit tests cho Zod schemas
- [ ] Integration tests cho mỗi route (vitest + supertest)
- [ ] SSE streaming test
- [ ] Auth middleware test
- [ ] File upload test

### Task 7.3: Docker setup
- [ ] `Dockerfile` cho API Gateway
- [ ] `docker-compose.yml` (Gateway + AI Service + PostgreSQL local)
- [ ] Health check endpoint: `GET /health`

---

## Endpoint Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | ❌ | Login |
| POST | /api/auth/register | ❌ | Register |
| GET | /api/auth/me | ✅ | Current user |
| POST | /api/plans | ✅ | Create plan + trigger AI |
| GET | /api/plans | ✅ | List plans |
| GET | /api/plans/:id | ✅ | Get plan detail |
| PATCH | /api/plans/:id | ✅ | Update plan (inline edit) |
| DELETE | /api/plans/:id | ✅ | Delete plan |
| GET | /api/plans/:id/stream | ✅ | SSE proxy |
| POST | /api/plans/:id/chat | ✅ | Send chat message |
| GET | /api/plans/:id/messages | ✅ | Chat history |
| GET | /api/plans/:id/export | ✅ | Download DOCX |
| POST | /api/resources | ✅ | Upload user resource |
| GET | /api/resources | ✅ | List user resources |
| GET | /api/resources/:id | ✅ | User resource detail |
| DELETE | /api/resources/:id | ✅ | Delete user resource |
| GET | /api/resources/system | ✅ | List system resources (SGK/SGV) |
| GET | /api/resources/system/:id | ✅ | System resource detail |
| GET | /api/resources/system/:id/download | ✅ | Download system resource file |
| GET | /health | ❌ | Health check |

**Total: 20 endpoints**

---

## Giao tiếp với AI Engineer

BE cần thoả thuận API contract với AI Service:

```
AI Service endpoints (Python FastAPI):
  POST /ai/generate        { plan_id, subject, grade, topic, teaching_model, objectives, emphasis, special_requests, file_urls, resource_ids, system_resource_ids }
  GET  /ai/stream/:plan_id  → SSE events (progress, chunk, plan, done, error)
  POST /ai/chat/:plan_id   { message, file_urls }
  POST /ai/extract-text    { file_url } → { text, page_count }
  POST /ai/embed           { text } → { embedding: number[] }
  GET  /ai/health           → { status: "ok" }

Lưu ý: `system_resource_ids` là danh sách ID tài liệu hệ thống (SGK/SGV) user chọn.
Gateway cần resolve content_text từ DB trước khi forward tới AI Service,
hoặc AI Service tự query từ DB (tùy thiết kế — recommend Gateway resolve).
```

---

*File này dành riêng cho BE Engineer. Xem ARCHITECTURE_UPGRADE_PLAN.md cho tổng quan hệ thống.*
