export function buildChatPlanSnapshot(plan: {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  teachingModel: string;
  contentMarkdown: string | null;
  contentJson: unknown;
}) {
  if (plan.contentJson && typeof plan.contentJson === 'object' && !Array.isArray(plan.contentJson)) {
    return {
      ...(plan.contentJson as Record<string, unknown>),
      raw_markdown: plan.contentMarkdown || undefined,
    };
  }

  return {
    plan_id: plan.id,
    metadata: {
      subject: plan.subject,
      grade: plan.grade,
      topic: plan.topic,
      teaching_model: plan.teachingModel,
    },
    raw_markdown: plan.contentMarkdown || '',
  };
}
