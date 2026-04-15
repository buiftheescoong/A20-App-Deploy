/**
 * API client — all backend API calls.
 * Person C owns this file.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

/**
 * Helper to get auth token from Supabase session.
 */
async function getAuthToken(): Promise<string> {
  try {
    const { supabase } = await import('./supabase');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}

/**
 * Base fetch wrapper with auth header.
 */
async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
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
  teaching_model: '5E' | '3-phase';
}

/**
 * Start lesson plan generation with optional file uploads.
 * Uses multipart/form-data.
 */
export async function generateLessonPlan(
  data: GeneratePayload,
  files: File[] = []
): Promise<{ plan_id: string; status: string }> {
  const formData = new FormData();
  formData.append('subject', data.subject);
  formData.append('grade', data.grade);
  formData.append('topic', data.topic);
  formData.append('objectives', JSON.stringify(data.objectives));
  formData.append('teaching_model', data.teaching_model);
  
  files.forEach((file) => {
    formData.append('files', file);
  });

  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── SSE Streaming ───────────────────────────────────────────────

/**
 * Opens an SSE connection to stream lesson plan progress and content.
 */
export function openSSEStream(planId: string): EventSource {
  // EventSource doesn't natively support headers, so we pass token via query if needed
  // Or if using cookies/sessions, it just works. 
  // For now, let's assume the backend allows it or we'd need a library like fetch-event-source
  return new EventSource(`${API_BASE}/api/stream/${planId}`);
}

// ─── Chat / Refinement ───────────────────────────────────────────

/**
 * Send a chat message (question or refinement) with optional files.
 */
export async function sendChatMessage(
  planId: string,
  message: string,
  files: File[] = []
): Promise<void> {
  const formData = new FormData();
  formData.append('message', message);
  files.forEach((file) => {
    formData.append('files', file);
  });

  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/api/chat/${planId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
}

// ─── Lesson Plans ────────────────────────────────────────────────

export interface LessonPlanResponse {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teaching_model: '5E' | '3-phase';
  objectives: string[];
  content_json: any;
  compliance_status: 'PASSED' | 'FAILED' | 'PENDING';
  docx_url?: string;
  is_blank_template: boolean;
  status: string;
  created_at: string;
}

export async function listLessonPlans(): Promise<{
  plans: LessonPlanResponse[];
  count: number;
}> {
  return apiFetch('/api/lesson-plans');
}

export async function getLessonPlan(id: string): Promise<LessonPlanResponse> {
  return apiFetch(`/api/lesson-plans/${id}`);
}

export async function deleteLessonPlan(id: string): Promise<void> {
  return apiFetch(`/api/lesson-plans/${id}`, { method: 'DELETE' });
}

// ─── Quality Check ───────────────────────────────────────────────

export async function checkQuality(lessonPlanId: string): Promise<{
  lesson_plan_id: string;
  is_passed: boolean;
  error_details: any[];
  suggestions: string[];
}> {
  return apiFetch('/api/check', {
    method: 'POST',
    body: JSON.stringify({ lesson_plan_id: lessonPlanId }),
  });
}

// ─── Export ──────────────────────────────────────────────────────

export async function exportDocx(
  planId: string
): Promise<{ download_url: string; is_blank_template: boolean }> {
  return apiFetch(`/api/export/${planId}`, { method: 'POST' });
}

