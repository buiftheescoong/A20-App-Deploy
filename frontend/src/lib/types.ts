/**
 * TypeScript type definitions — Giáo Án Thông Minh V2.
 * Synced with API Gateway schemas.
 */

// ────── Plan Types ──────

export type PlanStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type ComplianceStatus = 'PASSED' | 'FAILED' | 'PENDING';
export type TeachingModel = '5E' | '3-phase' | 'CV-5512';
export type QualityCheckStatus = 'running' | 'completed' | 'error';
export type QualityCheckSource = 'inline_edit' | 'chat_refine' | 'manual';
export type GenerationPhase =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'streaming'
  | 'content_ready'
  | 'exporting'
  | 'complete'
  | 'failed'
  | 'recovering';

export interface QualityIssue {
  severity: 'Critical' | 'Major' | 'Minor' | string;
  section: string;
  problem: string;
  suggestion: string;
}

export interface SkippedQualityCheck {
  check: string;
  reason: string;
}

export interface ComplianceReportData {
  is_passed: boolean;
  error_details: string[];
  suggestions: string[];
  status?: string;
  score?: number;
  summary?: string;
  checks?: Record<string, boolean>;
  issues?: QualityIssue[];
  passed_checks?: string[];
  skipped_checks?: SkippedQualityCheck[];
}

export interface QualityCheckSnapshot {
  status: QualityCheckStatus;
  source: QualityCheckSource;
  startedAt?: string;
  completedAt?: string;
  report?: ComplianceReportData;
  error?: string;
}

export interface Plan {
  id: string;
  userId: string;
  subject: string;
  grade: string;
  topic: string;
  teachingModel: TeachingModel;
  objectives: string[] | null;
  emphasis: string | null;
  specialRequests: string | null;
  resourceIds: string[] | null;
  contentMarkdown: string | null;
  contentJson: LessonPlanJSON | null;
  sessionState: Record<string, unknown>;
  status: PlanStatus;
  iterationCount: number;
  complianceStatus: ComplianceStatus | null;
  docxUrl: string | null;
  isBlankTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanInput {
  subject: string;
  grade: string;
  topic: string;
  teaching_model: TeachingModel;
  objectives?: string[];
  emphasis?: string;
  special_requests?: string;
  resource_ids?: string[];
  system_resource_ids?: string[];
  system_resource_lessons?: Array<{
    resource_id: string;
    lesson_title: string;
  }>;
}

export interface UpdatePlanInput {
  content_markdown?: string;
  content_json?: Record<string, unknown>;
}

// ────── Lesson Plan JSON ──────

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
    teaching_model: TeachingModel;
    duration_minutes: number;
    objectives: string[];
    competencies: string[];
    materials: string[];
  };
  sections: Record<string, SectionContent>;
  rag_sources: string[];
  rag_source_details?: Array<{
    id: string;
    title: string;
    type: string;
    raw_path?: string;
    chapter?: string;
    lesson?: string;
    section?: string;
    score?: number;
  }>;
  raw_markdown?: string;
  compliance: {
    status: ComplianceStatus;
    errors: Array<{ section: string; issue: string; suggestion: string }>;
  };
}

// ────── Resource Types ──────

export type ResourceCategory = 'sgk' | 'sgv' | 'khung_chuong_trinh' | 'khac';

export interface Resource {
  id: string;
  userId: string | null;
  filename: string;
  fileUrl: string;
  fileSize: number | null;
  pageCount: number | null;
  contentText: string | null;
  isEmbedded: boolean;
  isSystem: boolean;
  category: ResourceCategory | null;
  subject: string | null;
  grade: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SystemResource extends Resource {
  isSystem: true;
  category: ResourceCategory;
  subject: string;
  grade: string;
  description: string;
}

export interface SystemResourceSummary {
  id: string;
  filename: string;
  fileUrl: string;
  fileSize: number | null;
  pageCount: number | null;
  category: ResourceCategory;
  subject: string;
  grade: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemResourceDetail extends SystemResource {
  contentTextTruncated?: boolean;
}

// ────── Chat Types ──────

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageType = 'chat' | 'refinement';

export interface Message {
  id: string;
  planId: string;
  role: MessageRole;
  content: string;
  messageType: MessageType;
  attachedFiles: unknown[];
  createdAt: string;
}

// ────── SSE Event Types ──────

export interface ProgressEvent {
  step: 'queued' | 'rag' | 'generating' | 'quality_check' | 'formatting' | 'exporting' | 'completed';
  label: string;
}

export interface ChunkEvent {
  type: 'markdown';
  delta: string;
}

export interface ResetEvent {
  reason: 'quality_repair';
  iteration: number;
}

export interface ChatEvent {
  role: 'assistant';
  delta: string;
}

export interface PlanEvent {
  raw_markdown?: string;
  [key: string]: unknown; // Full JSON plan
}

export interface DoneEvent {
  plan_id: string;
  docx_url?: string;
  status: string;
  compliance?: ComplianceStatus;
}

export interface ErrorEvent {
  message: string;
  recoverable: boolean;
}

export type SSEEventType = 'progress' | 'reset' | 'chunk' | 'chat' | 'plan' | 'done' | 'error';

// ────── API Response Types ──────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CreatePlanResponse {
  status: 'accepted';
  plan_id: string;
}

export interface PlanStatusResponse {
  id: string;
  status: PlanStatus;
  complianceStatus: ComplianceStatus | null;
  docxUrl: string | null;
  hasContent: boolean;
  updatedAt: string;
  qualityCheck?: QualityCheckSnapshot;
}

export interface ChatResponse {
  status: string;
  intent: string;
  message: Message | null;
  updatedMarkdown?: string;
  complianceStatus?: ComplianceStatus | null;
  docxUrl?: string | null;
  qualityCheck?: QualityCheckSnapshot | null;
}

export interface ListParams {
  page?: number;
  limit?: number;
  subject?: string;
  grade?: string;
  sort?: 'newest' | 'oldest';
}

export interface SystemResourceListParams {
  subject?: string;
  grade?: string;
  category?: ResourceCategory;
  search?: string;
}

// ────── Constants ──────

export const SUBJECTS = [
  'Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật Lý', 'Hóa Học',
  'Sinh Học', 'Lịch Sử', 'Địa Lý', 'GDCD', 'Tin Học',
  'Công Nghệ', 'Giáo Dục Thể Chất', 'Âm Nhạc', 'Mĩ Thuật',
] as const;

export const GRADES = ['6', '7', '8', '9', '10', '11', '12'] as const;

export const TEACHING_MODELS: { value: TeachingModel; label: string }[] = [
  { value: '5E', label: 'Mô hình 5E (Engage-Explore-Explain-Elaborate-Evaluate)' },
  { value: '3-phase', label: '3 Giai đoạn (Khởi động-Hình thành-Luyện tập)' },
  { value: 'CV-5512', label: 'CV-5512 (Khởi động-Hình thành-Luyện tập-Vận dụng)' },
];

export const RESOURCE_CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: 'sgk', label: 'Sách giáo khoa' },
  { value: 'sgv', label: 'Sách giáo viên' },
  { value: 'khung_chuong_trinh', label: 'Khung chương trình' },
  { value: 'khac', label: 'Khác' },
];
