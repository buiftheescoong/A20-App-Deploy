import type { FastifyBaseLogger } from 'fastify';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { lessonPlans } from '../db/schema';
import { aiClient, type QualityCheckResult } from '../services/ai-client';

export type QualityCheckSource = 'inline_edit' | 'chat_refine' | 'manual';
export type QualityCheckStatus = 'running' | 'completed' | 'error';

export interface QualityReport {
  is_passed: boolean;
  error_details: string[];
  suggestions: string[];
  status?: string;
  score?: number;
  summary?: string;
  checks?: Record<string, boolean>;
  issues?: Array<{
    severity: 'Critical' | 'Major' | 'Minor' | string;
    section: string;
    problem: string;
    suggestion: string;
  }>;
  passed_checks?: string[];
  skipped_checks?: Array<{ check: string; reason: string }>;
}

export interface QualityCheckSnapshot {
  status: QualityCheckStatus;
  source: QualityCheckSource;
  startedAt?: string;
  completedAt?: string;
  report?: QualityReport;
  error?: string;
}

export interface StoredQualityCheckSnapshot extends QualityCheckSnapshot {
  runId: string;
}

type QualityLog = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;

export function startQualityCheckRun(
  sessionState: unknown,
  source: QualityCheckSource,
  options: { runId?: string; startedAt?: Date } = {},
): { runId: string; sessionState: Record<string, unknown>; qualityCheck: StoredQualityCheckSnapshot } {
  const runId = options.runId ?? randomUUID();
  const qualityCheck: StoredQualityCheckSnapshot = {
    status: 'running',
    source,
    runId,
    startedAt: (options.startedAt ?? new Date()).toISOString(),
  };

  return {
    runId,
    qualityCheck,
    sessionState: withQualityCheck(sessionState, qualityCheck),
  };
}

export function buildCompletedQualityCheckUpdate(
  sessionState: unknown,
  runId: string,
  result: QualityCheckResult,
  completedAt: Date = new Date(),
): { sessionState: Record<string, unknown>; complianceStatus: 'PASSED' | 'FAILED'; qualityCheck: StoredQualityCheckSnapshot } | null {
  const current = getStoredQualityCheckSnapshot(sessionState);
  if (!current || current.runId !== runId) return null;

  const report = toQualityReport(result);
  const complianceStatus = report.is_passed ? 'PASSED' : 'FAILED';
  const qualityCheck: StoredQualityCheckSnapshot = {
    ...current,
    status: 'completed',
    completedAt: completedAt.toISOString(),
    report,
  };
  delete qualityCheck.error;

  return {
    qualityCheck,
    complianceStatus,
    sessionState: withQualityCheck(sessionState, qualityCheck),
  };
}

export function buildErrorQualityCheckUpdate(
  sessionState: unknown,
  runId: string,
  error: unknown,
  completedAt: Date = new Date(),
): { sessionState: Record<string, unknown>; qualityCheck: StoredQualityCheckSnapshot } | null {
  const current = getStoredQualityCheckSnapshot(sessionState);
  if (!current || current.runId !== runId) return null;

  const qualityCheck: StoredQualityCheckSnapshot = {
    ...current,
    status: 'error',
    completedAt: completedAt.toISOString(),
    error: getErrorMessage(error),
  };

  return {
    qualityCheck,
    sessionState: withQualityCheck(sessionState, qualityCheck),
  };
}

export function getPublicQualityCheckSnapshot(sessionState: unknown): QualityCheckSnapshot | undefined {
  const snapshot = getStoredQualityCheckSnapshot(sessionState);
  if (!snapshot) return undefined;
  const { runId: _runId, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}

export function toQualityReport(result: QualityCheckResult): QualityReport {
  const status = result.status === 'PASSED' ? 'PASSED' : result.status === 'FAILED' ? 'FAILED' : result.status || 'FAILED';
  return {
    is_passed: status === 'PASSED',
    error_details: result.errors ?? [],
    suggestions: result.feedback ? [result.feedback] : [],
    status,
    score: result.score,
    summary: result.summary ?? '',
    checks: result.checks ?? {},
    issues: result.issues ?? [],
    passed_checks: result.passed_checks ?? [],
    skipped_checks: result.skipped_checks ?? [],
  };
}

export async function persistCompletedQualityCheck(
  planId: string,
  runId: string,
  result: QualityCheckResult,
  completedAt: Date = new Date(),
): Promise<boolean> {
  const [plan] = await db
    .select({ sessionState: lessonPlans.sessionState })
    .from(lessonPlans)
    .where(eq(lessonPlans.id, planId))
    .limit(1);

  if (!plan) return false;

  const update = buildCompletedQualityCheckUpdate(plan.sessionState, runId, result, completedAt);
  if (!update) return false;

  await db
    .update(lessonPlans)
    .set({
      sessionState: update.sessionState,
      complianceStatus: update.complianceStatus,
      updatedAt: new Date(),
    })
    .where(eq(lessonPlans.id, planId));

  return true;
}

export async function persistErroredQualityCheck(
  planId: string,
  runId: string,
  error: unknown,
  completedAt: Date = new Date(),
): Promise<boolean> {
  const [plan] = await db
    .select({ sessionState: lessonPlans.sessionState })
    .from(lessonPlans)
    .where(eq(lessonPlans.id, planId))
    .limit(1);

  if (!plan) return false;

  const update = buildErrorQualityCheckUpdate(plan.sessionState, runId, error, completedAt);
  if (!update) return false;

  await db
    .update(lessonPlans)
    .set({
      sessionState: update.sessionState,
      updatedAt: new Date(),
    })
    .where(eq(lessonPlans.id, planId));

  return true;
}

export async function runQualityCheckAndPersist(params: {
  planId: string;
  markdown: string;
  teachingModel: string;
  source: QualityCheckSource;
  runId: string;
  requestId?: string;
  log: QualityLog;
}): Promise<QualityReport> {
  const { planId, markdown, teachingModel, runId, requestId, log } = params;

  try {
    const result = await aiClient.qualityCheck(planId, markdown, teachingModel, requestId);
    const report = toQualityReport(result);
    const persisted = await persistCompletedQualityCheck(planId, runId, result);
    log.info({ planId, runId, persisted, status: report.status }, 'quality check completed');
    return report;
  } catch (error: unknown) {
    const persisted = await persistErroredQualityCheck(planId, runId, error);
    log.error({ planId, runId, persisted, err: getErrorMessage(error) }, 'quality check failed');
    throw error;
  }
}

export function runQualityCheckInBackground(params: {
  planId: string;
  markdown: string;
  teachingModel: string;
  source: QualityCheckSource;
  runId: string;
  requestId?: string;
  log: QualityLog;
}): void {
  runQualityCheckAndPersist(params).catch(() => {
    // The failure has already been persisted as best-effort state.
  });
}

function withQualityCheck(sessionState: unknown, qualityCheck: StoredQualityCheckSnapshot): Record<string, unknown> {
  const state = isRecord(sessionState) ? { ...sessionState } : {};
  return { ...state, qualityCheck };
}

function getStoredQualityCheckSnapshot(sessionState: unknown): StoredQualityCheckSnapshot | null {
  if (!isRecord(sessionState) || !isRecord(sessionState.qualityCheck)) return null;
  const raw = sessionState.qualityCheck;
  if (!isQualityCheckStatus(raw.status) || !isQualityCheckSource(raw.source) || typeof raw.runId !== 'string') {
    return null;
  }

  const snapshot: StoredQualityCheckSnapshot = {
    status: raw.status,
    source: raw.source,
    runId: raw.runId,
  };
  if (typeof raw.startedAt === 'string') snapshot.startedAt = raw.startedAt;
  if (typeof raw.completedAt === 'string') snapshot.completedAt = raw.completedAt;
  if (isRecord(raw.report)) snapshot.report = raw.report as unknown as QualityReport;
  if (typeof raw.error === 'string') snapshot.error = raw.error;
  return snapshot;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
