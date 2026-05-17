import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompletedQualityCheckUpdate,
  buildErrorQualityCheckUpdate,
  getPublicQualityCheckSnapshot,
  startQualityCheckRun,
  toQualityReport,
  type StoredQualityCheckSnapshot,
} from './quality-check-helpers';
import type { QualityCheckResult } from '../services/ai-client';

const passedResult: QualityCheckResult = {
  status: 'PASSED',
  score: 96,
  summary: 'Good structure',
  errors: [],
  feedback: '',
  checks: { structure: true },
  issues: [],
  passed_checks: ['structure'],
  skipped_checks: [],
};

test('startQualityCheckRun stores a running snapshot without dropping existing session state', () => {
  const startedAt = new Date('2026-05-16T10:00:00.000Z');
  const run = startQualityCheckRun({ keep: true }, 'inline_edit', {
    runId: 'run-1',
    startedAt,
  });

  assert.equal(run.runId, 'run-1');
  assert.deepEqual(run.sessionState.keep, true);
  assert.deepEqual(run.qualityCheck, {
    status: 'running',
    source: 'inline_edit',
    runId: 'run-1',
    startedAt: startedAt.toISOString(),
  });
});

test('buildCompletedQualityCheckUpdate persists report and PASSED compliance for the current run', () => {
  const run = startQualityCheckRun({}, 'manual', { runId: 'run-1' });
  const completed = buildCompletedQualityCheckUpdate(
    run.sessionState,
    'run-1',
    passedResult,
    new Date('2026-05-16T10:01:00.000Z'),
  );

  assert.ok(completed);
  assert.equal(completed.complianceStatus, 'PASSED');
  assert.equal(completed.qualityCheck.status, 'completed');
  assert.equal(completed.qualityCheck.report?.is_passed, true);
  assert.equal(completed.qualityCheck.report?.score, 96);
});

test('buildCompletedQualityCheckUpdate ignores stale run results', () => {
  const latest = startQualityCheckRun({}, 'inline_edit', { runId: 'run-new' });
  const completed = buildCompletedQualityCheckUpdate(latest.sessionState, 'run-old', passedResult);

  assert.equal(completed, null);
});

test('buildErrorQualityCheckUpdate records error without a compliance change', () => {
  const run = startQualityCheckRun({}, 'chat_refine', { runId: 'run-1' });
  const failed = buildErrorQualityCheckUpdate(run.sessionState, 'run-1', new Error('provider down'));

  assert.ok(failed);
  assert.equal(failed.qualityCheck.status, 'error');
  assert.equal(failed.qualityCheck.error, 'provider down');
});

test('getPublicQualityCheckSnapshot omits the internal runId', () => {
  const qualityCheck: StoredQualityCheckSnapshot = {
    status: 'running',
    source: 'inline_edit',
    runId: 'run-secret',
    startedAt: '2026-05-16T10:00:00.000Z',
  };

  const publicSnapshot = getPublicQualityCheckSnapshot({ qualityCheck });

  assert.deepEqual(publicSnapshot, {
    status: 'running',
    source: 'inline_edit',
    startedAt: '2026-05-16T10:00:00.000Z',
  });
});

test('toQualityReport maps AI quality result to the frontend report shape', () => {
  const report = toQualityReport({
    ...passedResult,
    status: 'FAILED',
    errors: ['Missing assessment'],
    feedback: 'Add a rubric',
  });

  assert.equal(report.is_passed, false);
  assert.deepEqual(report.error_details, ['Missing assessment']);
  assert.deepEqual(report.suggestions, ['Add a rubric']);
});
