/**
 * TypeScript type definitions — shared between frontend components.
 * Person C creates, synced with backend schemas.
 */

export interface GenerateResponse {
  task_id: string;
  status: 'pending';
}

export interface StatusResponse {
  task_id: string;
  status: 'pending' | 'clarifying' | 'generating' | 'retrying' | 'completed' | 'failed';
  progress_step?:
    | 'intake_done'
    | 'rag_done'
    | 'clarification_needed'
    | 'draft_ready'
    | 'quality_done'
    | 'export_done'
    | 'blank_template_ready';
  lesson_plan_id?: string;
  clarification_needed: boolean;
  is_blank_template: boolean;
  error?: string;
  draft_content?: LessonPlanJSON;
}

export interface ClarificationResponse {
  task_id: string;
  questions: string[];
}

export interface SectionContent {
  title: string;
  content: string;
  duration: number;
}

export interface LessonPlanJSON {
  metadata: {
    subject: string;
    grade: string;
    topic: string;
    teaching_model: '5E' | '3-phase';
    duration_minutes: number;
    objectives: string[];
    competencies: string[];
    materials: string[];
  };
  sections: Record<string, SectionContent>;
  rag_sources: string[];
  compliance: {
    status: 'PASSED' | 'FAILED';
    errors: Array<{
      section: string;
      issue: string;
      suggestion: string;
    }>;
  };
  clarification_needed: boolean;
}

export interface LessonPlanResponse {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teaching_model: '5E' | '3-phase';
  objectives: string[];
  content_json: LessonPlanJSON;
  compliance_status: 'PASSED' | 'FAILED' | 'PENDING';
  docx_url?: string;
  is_blank_template: boolean;
  status: string;
  created_at: string;
}
