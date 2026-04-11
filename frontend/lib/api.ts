/**
 * API client — all backend API calls.
 * Person C owns this file.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * Helper to get auth token from Supabase session.
 */
async function getAuthToken(): Promise<string> {
  try {
    const { supabase } = await import("./supabase");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}

/**
 * Base fetch wrapper with auth header.
 */
async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── Generate ────────────────────────────────────────────────────

export interface GeneratePayload {
  subject: string;
  grade: string;
  topic: string;
  objectives: string[];
  teaching_model: "5E" | "3-phase";
}

export async function generateLessonPlan(
  data: GeneratePayload
): Promise<{ task_id: string; status: string }> {
  return apiFetch("/api/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Status ──────────────────────────────────────────────────────

export interface StatusResponse {
  task_id: string;
  status:
    | "pending"
    | "clarifying"
    | "generating"
    | "retrying"
    | "completed"
    | "failed";
  progress_step?: string;
  lesson_plan_id?: string;
  clarification_needed: boolean;
  is_blank_template: boolean;
  error?: string;
}

export async function getStatus(taskId: string): Promise<StatusResponse> {
  return apiFetch(`/api/status/${taskId}`);
}

// ─── Clarification ──────────────────────────────────────────────

export interface ClarificationResponse {
  task_id: string;
  questions: string[];
}

export async function getClarificationQuestions(
  taskId: string
): Promise<ClarificationResponse> {
  return apiFetch(`/api/clarification/${taskId}`);
}

export async function submitClarificationAnswers(
  taskId: string,
  answers: Array<{ question: string; answer: string }>
): Promise<{ task_id: string; status: string }> {
  return apiFetch(`/api/clarification/${taskId}`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

// ─── Lesson Plans ────────────────────────────────────────────────

export interface LessonPlanResponse {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teaching_model: "5E" | "3-phase";
  objectives: string[];
  content_json: any;
  compliance_status: "PASSED" | "FAILED" | "PENDING";
  docx_url?: string;
  is_blank_template: boolean;
  status: string;
  created_at: string;
}

export async function listLessonPlans(): Promise<{
  plans: LessonPlanResponse[];
  count: number;
}> {
  return apiFetch("/api/lesson-plans");
}

export async function getLessonPlan(id: string): Promise<LessonPlanResponse> {
  return apiFetch(`/api/lesson-plans/${id}`);
}

export async function deleteLessonPlan(id: string): Promise<void> {
  return apiFetch(`/api/lesson-plans/${id}`, { method: "DELETE" });
}

// ─── Quality Check ───────────────────────────────────────────────

export async function checkQuality(lessonPlanId: string): Promise<{
  lesson_plan_id: string;
  is_passed: boolean;
  error_details: any[];
  suggestions: string[];
}> {
  return apiFetch("/api/check", {
    method: "POST",
    body: JSON.stringify({ lesson_plan_id: lessonPlanId }),
  });
}

// ─── Export ──────────────────────────────────────────────────────

export async function exportDocx(
  planId: string
): Promise<{ download_url: string; is_blank_template: boolean }> {
  return apiFetch(`/api/export/${planId}`, { method: "POST" });
}

// ─── Edit ────────────────────────────────────────────────────────

export async function editSection(
  lessonPlanId: string,
  sectionId: string,
  editPrompt: string
): Promise<any> {
  return apiFetch("/api/edit", {
    method: "POST",
    body: JSON.stringify({
      lesson_plan_id: lessonPlanId,
      section_id: sectionId,
      edit_prompt: editPrompt,
    }),
  });
}
