import type { Plan, QualityCheckSnapshot, QualityCheckSource, QualityCheckStatus } from './types';

export function getQualityCheckFromPlan(plan: Pick<Plan, 'sessionState'> | null | undefined): QualityCheckSnapshot | null {
  return getQualityCheckFromSession(plan?.sessionState);
}

export function getQualityCheckFromSession(sessionState: Record<string, unknown> | null | undefined): QualityCheckSnapshot | null {
  if (!sessionState || !isRecord(sessionState.qualityCheck)) return null;
  const raw = sessionState.qualityCheck;
  if (!isQualityCheckStatus(raw.status) || !isQualityCheckSource(raw.source)) return null;

  return {
    status: raw.status,
    source: raw.source,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    report: isRecord(raw.report) ? raw.report as unknown as QualityCheckSnapshot['report'] : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

export function mergeQualityCheckIntoSession(
  sessionState: Record<string, unknown> | null | undefined,
  qualityCheck: QualityCheckSnapshot | null | undefined,
): Record<string, unknown> {
  const next = sessionState ? { ...sessionState } : {};
  if (qualityCheck) {
    next.qualityCheck = qualityCheck;
  }
  return next;
}

function isQualityCheckStatus(value: unknown): value is QualityCheckStatus {
  return value === 'running' || value === 'completed' || value === 'error';
}

function isQualityCheckSource(value: unknown): value is QualityCheckSource {
  return value === 'inline_edit' || value === 'chat_refine' || value === 'manual';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
