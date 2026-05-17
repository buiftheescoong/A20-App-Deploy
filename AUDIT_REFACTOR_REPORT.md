# Practical Reliability Audit And Refactor Report

Updated: 2026-05-16

## Baseline

This pass kept public REST/SSE behavior unchanged and focused on reliability-first cleanup.

Verification baseline:

- Frontend tests: `npm.cmd test` passed, 24 tests.
- Frontend build: `npm.cmd run build` passed when run outside the sandbox; the sandboxed run cannot read the Vite config path.
- API gateway tests: `npm.cmd test` passed, 35 tests.
- API gateway build: `npm.cmd run build` passed.
- AI service tests: `.codex-venv\Scripts\python.exe -m pytest` passed, 65 tests.

AI-service Python was unblocked by creating an ignored local `ai-service/.codex-venv` from the bundled Codex Python runtime and installing `ai-service/requirements.txt`. The existing `ai-service/.venv` points to a user Python installation unavailable to the sandbox user.

## Findings

### Critical

- A real Google service-account credential was tracked at `test/ai-worker/credentials.json`.
  - Action taken: removed the tracked secret file, added `test/ai-worker/credentials.example.json`, and ignored `credentials.json`.
  - Required follow-up: rotate/revoke the exposed service-account key in Google Cloud. Removing it from git does not invalidate the leaked key.

### High

- `test/ai-worker/` appears to be legacy/reference OCR pipeline code, separate from the production `ai-service/`.
  - Evidence: production routes and services do not reference `test/ai-worker`; it has its own source tree, Dockerfile, tests, data, and credential file.
  - Decision: keep it for now, but mark it as legacy/reference until an owner confirms whether to delete, migrate, or archive it.

- Stale architecture docs describe a Next.js/Shadcn frontend while the current implementation is React 18 + Vite + React Router.
  - Evidence: `ARCHITECTURE_UPGRADE_PLAN.md` and `FE_TASKS.md` contain Next.js/Shadcn setup instructions; `README.md` and `frontend/package.json` reflect Vite/React.
  - Recommended follow-up: move old planning docs under an archive heading or refresh them so new contributors do not follow the wrong stack.

### Medium

- Large modules remain difficult to review safely:
  - `ai-service/app/graph/nodes/quality_checker.py`
  - `ai-service/app/services/raw_data_ingestor.py`
  - `api-gateway/src/routes/plans.ts`
  - `frontend/src/components/generate/SmartForm.tsx`
  - Action taken: first helper extraction wave reduced create-plan and quality text coupling while preserving behavior.

- AI provider dependency warning: `google.generativeai` is deprecated.
  - Evidence: AI-service tests pass but emit a package deprecation warning.
  - Recommended follow-up: plan a provider-client migration to `google.genai` behind the existing `llm_client` abstraction.

- Internal AI-service auth is disabled when `AI_SERVICE_SECRET` is empty.
  - Evidence: `ai-service/app/middleware/auth.py` intentionally allows all non-public endpoints in dev mode.
  - Recommended follow-up: enforce a non-empty secret in deployed environments and document local-only behavior.

### Low

- Frontend and gateway both know the create-plan multipart wire shape.
  - Action taken: extracted and tested mapping helpers so future contract drift is easier to detect.

- Request ID forwarding is already implemented across frontend, gateway, and AI service, but should stay covered by integration smoke tests.

## Refactors Completed

- API gateway:
  - Extracted multipart create-plan body construction into `buildCreatePlanRawBody`.
  - Moved AI resource context mapping into `toAiResourceContext`.
  - Added tests for multipart JSON parsing, blank optional omission, and citation metadata preservation.

- Frontend:
  - Extracted create-plan payload construction into `frontend/src/lib/plans/create.ts`.
  - Added tests for objective parsing and system/user resource mapping.
  - Updated `SmartForm` to call the helper instead of building the gateway payload inline.

- AI service:
  - Added `quality_text.py` for normalization, phrase matching, JSON-fence cleanup, and bounded integer parsing.
  - Delegated quality checker text helpers to the extracted module without changing `_rule_based_check` or pipeline outputs.

- Repo hygiene:
  - Removed the tracked credential file from `test/ai-worker/`.
  - Added a non-secret credential example.
  - Added `credentials.json` to `.gitignore`.

## Remaining Work

- Split the rest of `quality_checker.py` into parsing, deterministic rule checks, LLM review, result assembly, and table/duration helpers.
- Split `raw_data_ingestor.py` into file discovery, chunk metadata extraction, embedding/index writes, and audit helpers.
- Split `plans.ts` route handlers further once route-level integration coverage is added.
- Refresh or archive stale V2 planning docs that no longer match the current stack.
- Add a local smoke checklist for protected navigation, generate form submission, streaming page rendering, resources, quality check, and DOCX export.
- Decide the fate of `test/ai-worker/` with the project owner.
