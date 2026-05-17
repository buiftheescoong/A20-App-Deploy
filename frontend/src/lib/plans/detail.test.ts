import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiRefineToPlan } from './detail';
import type { Plan } from '../types';

const basePlan: Plan = {
  id: 'plan-1',
  userId: 'user-1',
  subject: 'Toan',
  grade: '8',
  topic: 'Don thuc',
  teachingModel: '5E',
  objectives: null,
  emphasis: null,
  specialRequests: null,
  resourceIds: null,
  contentMarkdown: '# Old lesson',
  contentJson: null,
  sessionState: { keep: true },
  status: 'completed',
  iterationCount: 1,
  complianceStatus: 'PASSED',
  docxUrl: 'plan-1/giao_an.docx',
  isBlankTemplate: false,
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

test('applyAiRefineToPlan updates markdown, clears stale DOCX, and stores pending quality check', () => {
  const updated = applyAiRefineToPlan(
    basePlan,
    {
      status: 'completed',
      intent: 'refine',
      message: null,
      updatedMarkdown: '# Refined lesson',
      complianceStatus: 'PENDING',
      docxUrl: null,
      qualityCheck: {
        status: 'running',
        source: 'chat_refine',
        startedAt: '2026-05-16T01:00:00.000Z',
      },
    },
    '2026-05-16T01:00:00.000Z',
  );

  assert.equal(updated.contentMarkdown, '# Refined lesson');
  assert.equal(updated.docxUrl, null);
  assert.equal(updated.complianceStatus, 'PENDING');
  assert.equal(updated.sessionState.keep, true);
  assert.deepEqual(updated.sessionState.qualityCheck, {
    status: 'running',
    source: 'chat_refine',
    startedAt: '2026-05-16T01:00:00.000Z',
  });
  assert.equal(updated.updatedAt, '2026-05-16T01:00:00.000Z');
});

test('applyAiRefineToPlan leaves the plan unchanged when no refined markdown is returned', () => {
  const updated = applyAiRefineToPlan(basePlan, {
    status: 'completed',
    intent: 'qa',
    message: null,
  });

  assert.equal(updated, basePlan);
});
