# Demo Script - Soan Giao An Thong Minh

Audience: judges, instructors, product reviewers, or investors.

Duration: 8-10 minutes.

Demo URL: `http://localhost:5173`

## Demo Goal

Show that A20 App 003 reduces lesson-plan preparation time while keeping teachers in control:

- Generate a GDPT 2018-style lesson plan.
- Stream progress instead of hiding a long wait.
- Use RAG resources when available.
- Refine the plan through chat and inline edits.
- Export a DOCX file.
- Save and revisit plans in the library.

## Pre-Demo Checklist

- AI Service is running on `http://localhost:8000`.
- API Gateway is running on `http://localhost:3001`.
- Frontend is running on `http://localhost:5173`.
- Supabase credentials are valid.
- A demo user is already logged in.
- At least one system or user resource is available in `/resources`.
- Network tab is open and filtered to `plans` or `stream`.
- A backup generated plan is available in `/library`.

Recommended demo input:

```text
Subject: Toan
Grade: 8
Topic: Don thuc va da thuc nhieu bien
Teaching model: 5E
Special request: Add a short group activity and one real-life application.
```

The raw corpus currently contains Grade 8 Math and Natural Science Markdown resources, so this input is safer than a grade with no indexed content.

## Opening - 45 Seconds

Say:

> Teachers do not need AI to replace their judgment. They need a faster first draft, a reliable compliance check, and a way to adapt the plan to their actual classroom.

Then open `/generate`.

## Part 1 - Create a Plan - 90 Seconds

Actions:

1. Open `/generate`.
2. Fill in subject, grade, topic, and model.
3. Add the special request.
4. Attach or select a relevant resource if available.
5. Click the create button.

Say:

> The teacher gives the same information they would normally write at the top of a lesson plan. The system stores the request, calls the AI service, and immediately moves to the streaming page.

Point out in Network:

- `POST /api/plans`
- `202 Accepted`
- returned `plan_id`

## Part 2 - Streaming Pipeline - 90 Seconds

On `/generate/:planId`, point to the progress bar and streamed result area.

Explain the backend flow:

```text
RAG retrieval -> generation -> quality check -> JSON conversion -> DOCX formatting
```

Say:

> This is not a static loading spinner. The frontend listens to Server-Sent Events from the API Gateway, which proxies the AI Service stream. Teachers can see where the system is in the process.

If generation takes longer than expected, keep narrating the phases and show the already prepared library plan if needed.

## Part 3 - Review and Export - 75 Seconds

After completion:

1. Point to the compliance status.
2. Scroll the generated lesson plan.
3. Click DOCX export when ready.

Say:

> The output is not just chat text. The AI Service converts the lesson into structured JSON and formats it into a downloadable Word document.

## Part 4 - Chat Refinement - 2 Minutes

Use a targeted request:

```text
Add a 5-minute group activity to the Explore phase and keep the total lesson duration unchanged.
```

Say:

> This is where the product becomes a teacher workflow, not a one-shot generator. The teacher asks for a specific change, the system updates the plan, and the teacher reviews it before exporting again.

Optional second prompt:

```text
List the assessment evidence students will produce in this lesson.
```

Use the first prompt to show refinement and the second prompt to show question-answering over the generated plan.

## Part 5 - Inline Edit - 60 Seconds

Actions:

1. Hover or open an editable section.
2. Change a sentence or activity instruction.
3. Save.
4. Mention that export may need to be regenerated if the DOCX is stale.

Say:

> The teacher stays in control. AI creates and refines, but the teacher can still make exact edits.

## Part 6 - Library and Resources - 75 Seconds

Open `/library`.

Say:

> Generated plans are saved, so teachers can reuse and adapt them later.

Open `/resources`.

Say:

> Resources can come from system materials or teacher uploads. These documents support retrieval and grounding for future generations.

## Part 7 - Quality Check - 45 Seconds

Open `/check`, paste a plan ID, and run the quality check.

Say:

> The same quality-check service can be used independently, so reviewers can inspect a generated or previously saved plan.

## Closing - 30 Seconds

Say:

> A20 App 003 turns lesson planning into an assisted workflow: generate, inspect, refine, edit, export, and reuse. The teacher remains the decision-maker, while the system handles the repetitive structure and first draft.

## Backup Plan

| Issue | Response |
|---|---|
| AI generation is slow | Continue explaining the pipeline, then open a prepared plan from `/library` |
| AI Service fails | Show mock mode only if it was prepared beforehand, or use a saved plan |
| Login fails | Use an already authenticated browser profile |
| DOCX is not ready | Explain async formatting and continue with chat/library demo |
| RAG has weak context | Use Grade 8 Math because this repo includes that raw corpus |

## Technical Notes for Q&A

- Frontend is React/Vite, not Next.js.
- Streaming is SSE through API Gateway, not WebSocket.
- AI orchestration is LangGraph inside FastAPI.
- Database tables are managed by Drizzle in `api-gateway/src/db/schema.ts`.
- Raw RAG Markdown lives under `data/raw/`.
- Deployment configuration lives in `render.yaml`.
