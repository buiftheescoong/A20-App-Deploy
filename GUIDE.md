# Local Run and QA Guide

This guide matches the current A20 App 003 stack:

- Frontend: React + Vite at `http://localhost:5173`
- API Gateway: Fastify at `http://localhost:3001`
- AI Service: FastAPI + LangGraph at `http://localhost:8000`
- Database/auth/storage: Supabase PostgreSQL, Auth, Storage, pgvector

Last updated: 2026-05-16

## 1. First-Time Setup

Install prompt logging hooks:

```bash
bash scripts/setup_hooks.sh
```

Install dependencies:

```bash
cd ai-service
python -m venv venv
venv/Scripts/activate
pip install -r requirements.txt

cd ../api-gateway
npm install

cd ../frontend
npm install
```

## 2. Environment Files

Frontend: copy `frontend/.env.example` to `frontend/.env`.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:3001
VITE_USE_MOCK=false
```

API Gateway: copy `api-gateway/.env.example` to `api-gateway/.env`.

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:3000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_SECRET=
```

AI Service: create `ai-service/.env`.

```env
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
LANGSMITH_API_KEY=
LANGCHAIN_API_KEY=
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=...
AI_SERVICE_SECRET=
RAW_RAG_AUTO_INDEX=false
RAW_RAG_DATA_DIR=
```

Use the same non-empty `AI_SERVICE_SECRET` in API Gateway and AI Service if you want internal service auth enabled. Leave both empty for local development.

## 3. Database Setup

Create/update tables:

```bash
cd api-gateway
npm run db:push
```

Optional placeholder system-resource seed:

```bash
npm run db:seed
```

Optional raw Markdown RAG ingestion from `data/raw/`:

```bash
cd ../ai-service
venv/Scripts/activate
python -m app.scripts.ingest_raw_data
```

RAG ingestion requires `DATABASE_URL`, `OPENAI_API_KEY`, and the pgvector extension.

## 4. Start with Docker

Copy the Docker environment template and fill in the external Supabase and AI provider values:

```bash
cp .env.docker.example .env.docker
```

Run the development stack with hot reload:

```bash
docker compose --env-file .env.docker up --build
```

Open `http://localhost:5173`. The containers expose:

- Frontend: `http://localhost:5173`
- API Gateway: `http://localhost:3001`
- AI Service: `http://localhost:8000`

For production-style local validation, build and run the Nginx/static frontend plus production API images:

```bash
docker compose --env-file .env.docker -f docker-compose.prod.yml up --build
```

Open `http://localhost:8080` for the production-style frontend. The hosted Supabase project is still used for auth, database, storage, and pgvector.

## 5. Start Without Docker

Open three terminals.

Terminal 1 - AI Service:

```bash
cd ai-service
venv/Scripts/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 - API Gateway:

```bash
cd api-gateway
npm run dev
```

Terminal 3 - Frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

## 6. Smoke Test

Health checks:

```bash
curl http://localhost:8000/ai/health
curl http://localhost:3001/health
```

Expected:

- AI Service returns status `ok`.
- API Gateway returns status `ok` or `degraded`; `degraded` usually means the database is not reachable.

## 7. Manual QA Flow

1. Auth:
   Open `/login`, create or sign in with a Supabase user, and confirm the app redirects into the protected area.

2. Resources:
   Open `/resources`, check the system-resource tab, upload a PDF/DOCX/text resource in the user-resource tab, and verify it appears in the list.

3. Generate:
   Open `/generate`, enter subject, grade, topic, teaching model, optional objectives/resources, then submit.

4. Streaming:
   Confirm `POST /api/plans` returns `202` with `plan_id`, then confirm `/generate/:planId` receives SSE progress from `/api/plans/:id/stream`.

5. Completion:
   Confirm the final lesson plan renders, compliance status appears, and DOCX export becomes available.

6. Chat refinement:
   Ask a targeted change in the chat panel, such as `Add a 5-minute group activity to the Explore phase`, and confirm the lesson content updates.

7. Library:
   Open `/library`, view the generated plan, filter/search if needed, and test delete only with disposable data.

8. Quality check:
   Open `/check`, enter a lesson plan ID, and confirm the compliance report loads.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend calls the wrong backend | Missing or old env keys | Set `VITE_API_BASE_URL=http://localhost:3001` |
| Frontend shows mock data | Mock mode enabled | Set `VITE_USE_MOCK=false` |
| API Gateway returns database errors | Missing/invalid Supabase connection | Check `DATABASE_URL`, run `npm run db:push` |
| API Gateway returns 401 | Missing Supabase session/JWT | Log in again and check browser storage/session |
| SSE does not connect | Token, CORS, or AI Service issue | Check `/api/plans/:id/stream`, `FRONTEND_ORIGINS`, and AI logs |
| `502` or AI trigger failure | AI Service is not running | Start FastAPI on port 8000 |
| DOCX export disabled | Formatter still running or stale edit | Wait for export poll or regenerate DOCX after edits |
| Port already in use | Old process still running | Stop the old terminal or kill the process using that port |
| Docker frontend cannot log in | Missing Vite Supabase build values | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.docker` |
| Docker API cannot reach AI Service | Localhost used inside a container | Set `AI_SERVICE_URL=http://ai-service:8000` in Compose overrides |

Windows port lookup:

```powershell
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

## 9. Build and Test

```bash
cd frontend
npm run build

cd ../api-gateway
npm run build

cd ../ai-service
pytest
```

Run these before PR review when the touched area can affect app behavior.

Containerized checks:

```bash
docker compose --env-file .env.docker run --rm frontend npm run build
docker compose --env-file .env.docker run --rm api-gateway npm run build
docker compose --env-file .env.docker run --rm ai-service pytest
```
