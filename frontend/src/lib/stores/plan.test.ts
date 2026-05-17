import test from 'node:test';
import assert from 'node:assert/strict';
import { usePlanStore } from './plan';

test('hydrates completed status when DOCX URL is available', () => {
  usePlanStore.getState().reset();

  usePlanStore.getState().hydrateStatus({
    id: 'plan-1',
    status: 'completed',
    complianceStatus: 'PASSED',
    docxUrl: 'plan-1/giao_an.docx',
    hasContent: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    qualityCheck: {
      status: 'completed',
      source: 'inline_edit',
      report: { is_passed: true, error_details: [], suggestions: [], status: 'PASSED', score: 95 },
    },
  });

  const state = usePlanStore.getState();
  assert.equal(state.generationPhase, 'complete');
  assert.equal(state.isStreaming, false);
  assert.equal(state.isComplete, true);
  assert.equal(state.docxUrl, 'plan-1/giao_an.docx');
  assert.equal(state.compliance, 'PASSED');
  assert.equal(state.qualityCheck?.status, 'completed');
  assert.equal(state.qualityCheck?.report?.score, 95);
});

test('marks generated content as exporting until DOCX exists', () => {
  usePlanStore.getState().reset();

  usePlanStore.getState().hydrateStatus({
    id: 'plan-1',
    status: 'completed',
    complianceStatus: 'PENDING',
    docxUrl: null,
    hasContent: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const state = usePlanStore.getState();
  assert.equal(state.generationPhase, 'exporting');
  assert.equal(state.isComplete, true);
  assert.equal(state.isStreaming, false);
  assert.equal(state.progress?.step, 'exporting');
});

test('failed status transitions stop streaming and expose error', () => {
  usePlanStore.getState().reset();
  usePlanStore.getState().startStreaming('plan-1');

  usePlanStore.getState().hydrateStatus({
    id: 'plan-1',
    status: 'failed',
    complianceStatus: 'FAILED',
    docxUrl: null,
    hasContent: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const state = usePlanStore.getState();
  assert.equal(state.generationPhase, 'failed');
  assert.equal(state.isStreaming, false);
  assert.equal(state.compliance, 'FAILED');
  assert.ok(state.error);
});

test('hydrates running quality check while content waits for DOCX export', () => {
  usePlanStore.getState().reset();

  usePlanStore.getState().hydrateStatus({
    id: 'plan-1',
    status: 'completed',
    complianceStatus: 'PENDING',
    docxUrl: null,
    hasContent: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    qualityCheck: {
      status: 'running',
      source: 'inline_edit',
      startedAt: '2026-01-01T00:00:00.000Z',
    },
  });

  const state = usePlanStore.getState();
  assert.equal(state.generationPhase, 'exporting');
  assert.equal(state.qualityCheck?.status, 'running');
  assert.equal(state.compliance, 'PENDING');
});

test('markContentEdited clears stale DOCX and stores pending quality run', () => {
  usePlanStore.getState().reset();
  usePlanStore.getState().setComplete('plan-1/giao_an.docx', 'PASSED');

  usePlanStore.getState().markContentEdited({
    status: 'running',
    source: 'chat_refine',
    startedAt: '2026-01-01T00:00:00.000Z',
  });

  const state = usePlanStore.getState();
  assert.equal(state.generationPhase, 'exporting');
  assert.equal(state.docxUrl, null);
  assert.equal(state.compliance, 'PENDING');
  assert.equal(state.qualityCheck?.source, 'chat_refine');
});

test('appendMarkdown accumulates streamed preview content while staying live', () => {
  usePlanStore.getState().reset();
  usePlanStore.getState().startStreaming('plan-1');

  usePlanStore.getState().appendMarkdown('# Lesson');
  usePlanStore.getState().appendMarkdown('\n\nBody');

  const state = usePlanStore.getState();
  assert.equal(state.markdown, '# Lesson\n\nBody');
  assert.equal(state.generationPhase, 'streaming');
  assert.equal(state.isStreaming, true);
  assert.equal(state.isComplete, false);
});

test('setMarkdown replaces provisional streamed preview with final content', () => {
  usePlanStore.getState().reset();
  usePlanStore.getState().startStreaming('plan-1');
  usePlanStore.getState().appendMarkdown('# Partial');

  usePlanStore.getState().setMarkdown('# Final\n\nComplete body');

  const state = usePlanStore.getState();
  assert.equal(state.markdown, '# Final\n\nComplete body');
  assert.equal(state.isComplete, true);
});

test('resetStreamingMarkdown clears the old preview before repair chunks append', () => {
  usePlanStore.getState().reset();
  usePlanStore.getState().startStreaming('plan-1');
  usePlanStore.getState().appendMarkdown('# Old draft');
  usePlanStore.getState().setComplete('plan-1/giao_an.docx', 'FAILED');

  usePlanStore.getState().resetStreamingMarkdown();

  let state = usePlanStore.getState();
  assert.equal(state.markdown, '');
  assert.equal(state.generationPhase, 'streaming');
  assert.equal(state.isStreaming, true);
  assert.equal(state.isComplete, false);
  assert.equal(state.docxUrl, null);

  usePlanStore.getState().appendMarkdown('# Repaired draft');

  state = usePlanStore.getState();
  assert.equal(state.markdown, '# Repaired draft');
  assert.equal(state.markdown.includes('Old draft'), false);
});
