-- ═══════════════════════════════════════════════════════════════
-- Soạn Giáo Án Thông Minh — Database Schema
-- Run this in Supabase SQL Editor on Day 1
-- ═══════════════════════════════════════════════════════════════

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Core Tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lesson_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  grade             TEXT NOT NULL,
  topic             TEXT NOT NULL,
  teaching_model    TEXT NOT NULL DEFAULT '5E',
  objectives        TEXT[] NOT NULL DEFAULT '{}',
  content_json      JSONB,
  status            TEXT DEFAULT 'pending',  -- pending|clarifying|generating|completed|failed
  task_id           TEXT,
  retry_count       INT DEFAULT 0,
  fallback_model    TEXT,
  compliance_status TEXT DEFAULT 'PENDING',
  docx_url          TEXT,
  is_blank_template BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id  UUID REFERENCES lesson_plans(id) ON DELETE CASCADE,
  is_passed       BOOLEAN NOT NULL,
  score           NUMERIC(3,2),
  error_details   JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clarification_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users(id),
  questions  JSONB NOT NULL DEFAULT '[]',
  answers    JSONB DEFAULT '[]',
  status     TEXT DEFAULT 'pending',   -- pending | answered
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RAG Knowledge Base ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rag_knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  subject     TEXT NOT NULL,
  grade       TEXT NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rag_kb_embedding_idx 
  ON rag_knowledge_base USING ivfflat (embedding vector_cosine_ops);

-- ─── RPC Function for Vector Search ─────────────────────────────

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(1536),
  subject_filter TEXT,
  grade_filter TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  subject TEXT,
  grade TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rkb.id,
    rkb.source,
    rkb.subject,
    rkb.grade,
    rkb.content,
    1 - (rkb.embedding <=> query_embedding) AS similarity
  FROM rag_knowledge_base rkb
  WHERE rkb.subject = subject_filter
    AND rkb.grade = grade_filter
  ORDER BY rkb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Row Level Security ──────────────────────────────────────────

ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_own_plans" ON lesson_plans
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_own_evals" ON evaluations
  FOR SELECT USING (
    lesson_plan_id IN (SELECT id FROM lesson_plans WHERE user_id = auth.uid())
  );

ALTER TABLE clarification_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_own_clarify" ON clarification_sessions
  FOR ALL USING (user_id = auth.uid());

-- ─── Storage Bucket ──────────────────────────────────────────────
-- Run this in Supabase Dashboard > Storage:
-- 1. Create bucket "templates" (public)
-- 2. Create bucket "documents" (public)
-- 3. Upload blank_template.docx to templates/blank_template.docx
