export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface PlanForDocxExport {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teachingModel: string;
  objectives: string[] | null;
  contentMarkdown: string | null;
  contentJson: unknown;
  complianceStatus: string | null;
}

export function buildDocxStoragePath(planId: string): string {
  return `${planId}/giao_an.docx`;
}

export function buildDocxFilename(planId: string): string {
  return `giao_an_${planId}.docx`;
}

export function buildDocxContentDisposition(planId: string): string {
  return `attachment; filename="${buildDocxFilename(planId)}"`;
}

export function hasExportableDocxContent(plan: PlanForDocxExport): boolean {
  return Boolean(plan.contentMarkdown?.trim()) || isRecord(plan.contentJson);
}

export function buildDocxPlanPayload(plan: PlanForDocxExport): Record<string, unknown> {
  const contentJson = isRecord(plan.contentJson) ? plan.contentJson : {};
  const metadata = isRecord(contentJson.metadata) ? contentJson.metadata : {};
  const compliance = isRecord(contentJson.compliance)
    ? contentJson.compliance
    : { status: plan.complianceStatus ?? 'PENDING', errors: [] };

  return {
    ...contentJson,
    metadata: {
      ...metadata,
      subject: plan.subject,
      grade: plan.grade,
      topic: plan.topic,
      teaching_model: plan.teachingModel,
      objectives: plan.objectives ?? (Array.isArray(metadata.objectives) ? metadata.objectives : []),
    },
    compliance,
    lesson_plan_id: plan.id,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
