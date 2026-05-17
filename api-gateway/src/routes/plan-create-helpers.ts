import { AppError } from '../plugins/error-handler';
import type { CreatePlanInput } from '../types/schemas';

export interface AiResourceContext {
  id: string;
  filename: string;
  content_text: string;
  category: string | null;
  subject: string | null;
  grade: string | null;
  metadata: Record<string, unknown>;
}

export interface SystemResourceLessonSelection {
  resource_id: string;
  lesson_title: string;
}

export type CreatePlanFormFields = Record<string, string | undefined>;

export const ALLOWED_PLAN_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const MAX_PLAN_FILE_SIZE = 50 * 1024 * 1024;

export function parseJsonField<T>(value: string | undefined, field: string): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new AppError('VALIDATION_ERROR', `${field} must be valid JSON`, 400, [
      { field, message: 'Invalid JSON payload' },
    ]);
  }
}

export function buildCreatePlanRawBody(fields: CreatePlanFormFields) {
  return {
    subject: fields.subject,
    grade: fields.grade,
    topic: fields.topic,
    teaching_model: fields.teaching_model,
    objectives: parseJsonField<string[]>(fields.objectives, 'objectives'),
    emphasis: fields.emphasis || undefined,
    special_requests: fields.special_requests || undefined,
    resource_ids: parseJsonField<string[]>(fields.resource_ids, 'resource_ids'),
    system_resource_ids: parseJsonField<string[]>(fields.system_resource_ids, 'system_resource_ids'),
    system_resource_lessons: parseJsonField<SystemResourceLessonSelection[]>(
      fields.system_resource_lessons,
      'system_resource_lessons',
    ),
  };
}

export function isAllowedPlanFileType(mimetype: string): boolean {
  return ALLOWED_PLAN_FILE_TYPES.includes(mimetype);
}

export function isPlanFileSizeAllowed(size: number): boolean {
  return size <= MAX_PLAN_FILE_SIZE;
}

export function safeUploadFilename(filename: string): string {
  return filename.replace(/[\\/]/g, '_');
}

export function mergeResourceIds(resourceIds: string[] | undefined, uploadedResourceIds: string[]): string[] {
  return Array.from(new Set([...(resourceIds ?? []), ...uploadedResourceIds]));
}

export function buildSystemResourceLessonMap(selections: SystemResourceLessonSelection[] | undefined): Map<string, string> {
  const lessonByResourceId = new Map<string, string>();
  for (const selection of selections ?? []) {
    const lessonTitle = selection.lesson_title.trim();
    if (lessonTitle) {
      lessonByResourceId.set(selection.resource_id, lessonTitle);
    }
  }
  return lessonByResourceId;
}

export function sliceMarkdownLesson(contentText: string, lessonTitle: string): string | null {
  const targetTitle = normalizeLessonTitle(lessonTitle);
  if (!contentText.trim() || !targetTitle) return null;

  const headingPattern = /^(#{1,6})\s+(.+?)\s*$/gm;
  const headings: Array<{ index: number; level: number; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(contentText)) !== null) {
    headings.push({
      index: match.index,
      level: match[1].length,
      title: match[2],
    });
  }

  const startHeadingIndex = headings.findIndex((heading) => normalizeLessonTitle(heading.title) === targetTitle);
  if (startHeadingIndex === -1) return null;

  const startHeading = headings[startHeadingIndex];
  const nextBoundary = headings
    .slice(startHeadingIndex + 1)
    .find((heading) => heading.level <= startHeading.level);
  const endIndex = nextBoundary?.index ?? contentText.length;
  const sliced = contentText.slice(startHeading.index, endIndex).trim();

  return sliced || null;
}

export function buildPlanAiInput(
  body: CreatePlanInput,
  allResourceIds: string[],
  uploadedFileUrls: string[],
  systemResourceTexts: string[],
  resourceContexts: AiResourceContext[] = [],
  systemResourceContexts: AiResourceContext[] = [],
) {
  return {
    subject: body.subject,
    grade: body.grade,
    topic: body.topic,
    teaching_model: body.teaching_model,
    objectives: body.objectives,
    emphasis: body.emphasis,
    special_requests: body.special_requests,
    file_urls: uploadedFileUrls.length > 0 ? uploadedFileUrls : undefined,
    resource_ids: allResourceIds.length > 0 ? allResourceIds : undefined,
    system_resource_ids: body.system_resource_ids,
    system_resource_texts: systemResourceContexts.length === 0 && systemResourceTexts.length > 0 ? systemResourceTexts : undefined,
    resource_contexts: resourceContexts.length > 0 ? resourceContexts : undefined,
    system_resource_contexts: systemResourceContexts.length > 0 ? systemResourceContexts : undefined,
  };
}

export function toAiResourceContext(resource: {
  id: string;
  filename: string;
  contentText: string | null;
  category: string | null;
  subject: string | null;
  grade: string | null;
  metadata: unknown;
}, metadataOverrides: Record<string, unknown> = {}): AiResourceContext {
  const metadata = isRecord(resource.metadata) ? resource.metadata : {};
  return {
    id: resource.id,
    filename: resource.filename,
    content_text: resource.contentText || '',
    category: resource.category,
    subject: resource.subject,
    grade: resource.grade,
    metadata: { ...metadata, ...metadataOverrides },
  };
}

export function getPlanRouteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLessonTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
