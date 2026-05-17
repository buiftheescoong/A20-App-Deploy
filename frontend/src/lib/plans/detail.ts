import type { ChatResponse, Plan } from '../types';
import { mergeQualityCheckIntoSession } from '../quality-check';

export function applyAiRefineToPlan(plan: Plan, result: ChatResponse, updatedAt: string = new Date().toISOString()): Plan {
  if (!result.updatedMarkdown) return plan;

  return {
    ...plan,
    contentMarkdown: result.updatedMarkdown,
    complianceStatus: result.complianceStatus ?? 'PENDING',
    docxUrl: result.docxUrl ?? null,
    sessionState: mergeQualityCheckIntoSession(plan.sessionState, result.qualityCheck),
    updatedAt,
  };
}
