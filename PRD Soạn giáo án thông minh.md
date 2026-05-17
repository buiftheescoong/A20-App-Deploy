# PRD - Soan Giao An Thong Minh

Product requirements for A20 App 003.

Last updated: 2026-05-15

## 1. Product Summary

Soan Giao An Thong Minh is an AI-assisted lesson-planning workflow for Vietnamese teachers. It helps teachers generate, review, refine, edit, export, and reuse lesson plans aligned with GDPT 2018 expectations.

The product is not a generic chatbot. It is a structured app with authentication, resource management, generation progress, quality checks, chat refinement, inline editing, and DOCX export.

## 2. Target Users

| User | Need |
|---|---|
| Teacher | Create a high-quality lesson-plan draft quickly and adapt it to a real class |
| Department lead | Review lesson plans for required structure and quality |
| School/admin reviewer | Keep generated plans organized and reusable |

## 3. Problem

Teachers spend significant time preparing repeated lesson-plan structure before they can focus on classroom fit. GDPT 2018-style plans require clear objectives, learning activities, assessment evidence, materials, and teaching-method alignment. Manual review is slow and easy to miss.

## 4. Goals

- Reduce time to first lesson-plan draft.
- Preserve teacher control through chat refinement and inline editing.
- Ground generation with uploaded/system resources when available.
- Provide visible generation progress through SSE.
- Export an editable DOCX.
- Store plans and resources for reuse.

## 5. Non-Goals

- Replace teacher judgment.
- Guarantee perfect factual correctness without review.
- Build an LMS integration in the current scope.
- Provide school-wide analytics dashboards in the current scope.
- Support every grade/subject corpus until data is added and indexed.

## 6. Core User Stories

### Generate Lesson Plan

As a teacher, I can enter subject, grade, topic, teaching model, objectives, special requests, and optional resources so that the system creates a structured lesson plan.

Acceptance criteria:

- Submitting the form creates a `lesson_plans` record.
- API returns `202` and a `plan_id`.
- User is routed to `/generate/:planId`.
- Progress events are visible during generation.
- Final content appears in the preview.

### Review Progress

As a teacher, I can see the current generation phase so that I know whether the system is retrieving context, generating, checking quality, or formatting export.

Acceptance criteria:

- Frontend consumes SSE from `/api/plans/:id/stream`.
- Progress labels update without page refresh.
- Failed or interrupted streams show recoverable error messaging.

### Refine With Chat

As a teacher, I can ask the assistant to answer questions about the plan or revise parts of it.

Acceptance criteria:

- Chat messages are stored in `lesson_plan_messages`.
- QA prompts return an assistant response.
- Refinement prompts update plan markdown when appropriate.
- Updated content can be reviewed before export.

### Inline Edit

As a teacher, I can edit the generated lesson plan directly in the preview.

Acceptance criteria:

- Editable sections can be saved with `PATCH /api/plans/:id`.
- Saved edits update the persisted plan.
- Existing DOCX export is marked stale when content changes.

### Export DOCX

As a teacher, I can download a DOCX file.

Acceptance criteria:

- AI Service formats generated content into DOCX.
- API Gateway exposes export through `/api/plans/:id/export`.
- Frontend disables or warns about stale export after edits.

### Manage Resources

As a teacher, I can view system resources and upload personal resources.

Acceptance criteria:

- `/resources` displays system resources from `GET /api/resources/system`.
- User uploads go through `POST /api/resources`.
- Uploaded resource rows are listed and can be deleted.

### Check Quality

As a reviewer, I can run a quality/compliance check for a plan.

Acceptance criteria:

- `/check` accepts a plan ID.
- Gateway calls AI Service quality check.
- UI displays pass/fail details and suggestions.

## 7. Functional Scope

In scope:

- Supabase login/register.
- Protected plan, resource, library, and check pages.
- Lesson-plan generation with selected teaching model.
- RAG from uploaded/system resource text when indexed.
- SSE progress streaming.
- Chat QA/refinement.
- Inline markdown editing.
- DOCX export.
- Render deployment configuration.

Out of scope for current implementation:

- PDF export.
- Multi-user collaboration on one plan.
- Role-based department review workflows.
- LMS integrations.
- Payments/subscriptions.
- Full school analytics.

## 8. Technical Requirements

- Frontend uses Vite env keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `VITE_USE_MOCK`.
- API Gateway validates Supabase JWTs for protected routes.
- API Gateway owns database writes for browser requests.
- AI Service is called only by API Gateway in production.
- AI Service supports optional `AI_SERVICE_SECRET` internal auth.
- RAG embeddings use OpenAI `text-embedding-3-small` and pgvector.
- Generation pipeline uses LangGraph with max iterations from `MAX_ITERATIONS`.
- DOCX formatting uses `python-docx`.

## 9. Success Metrics

- Time from form submit to visible first result is understandable because progress is visible.
- A complete lesson-plan draft is produced within the expected AI runtime for normal requests.
- Teacher can make at least one refinement without leaving the page.
- Exported DOCX is available for completed plans.
- Generated plans are retrievable from `/library`.

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI output is inaccurate | Use RAG, quality check, and teacher review/editing |
| No relevant corpus for a topic | Ask for uploaded resources or choose a topic covered by `data/raw/` |
| Generation takes too long | Stream progress and keep saved status available |
| Service restart loses transient AI state | Persist completed content and status in database; consider durable job queue later |
| Stale DOCX after edits | Mark export stale and require regenerated export |
| Source text encoding issues | Track separately as source/UI cleanup work |

## 11. Release Checklist

- `frontend` build succeeds.
- `api-gateway` build succeeds.
- `ai-service` tests pass for touched AI code.
- Supabase schema has current tables.
- Health endpoints pass.
- Demo topic matches available indexed resources.
- PR has required summary and changed-file list.
