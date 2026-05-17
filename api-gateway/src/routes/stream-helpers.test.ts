import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStreamPersistenceEvent,
  buildPlanPersistenceUpdate,
  cleanMarkdownFence,
  finalizeDocxWithRetry,
  formatSSE,
  isComplianceStatus,
  parseSSEMessage,
  waitWithAbort,
  type StreamPersistenceState,
} from './stream-helpers';

const log = {
  info() {},
  warn() {},
  error() {},
};

test('parseSSEMessage joins multi-line data payloads', () => {
  const parsed = parseSSEMessage('event: chunk\ndata: {"a":1}\ndata: {"b":2}\n');

  assert.equal(parsed.eventType, 'chunk');
  assert.equal(parsed.eventData, '{"a":1}\n{"b":2}');
});

test('formatSSE preserves event name and JSON payload', () => {
  assert.equal(formatSSE('done', { status: 'completed' }), 'event: done\ndata: {"status":"completed"}\n\n');
});

test('cleanMarkdownFence only strips wrapping fences', () => {
  assert.equal(cleanMarkdownFence('```markdown\n# Title\n```'), '# Title');
  assert.equal(cleanMarkdownFence('# Title\n```inline```'), '# Title\n```inline```');
});

test('isComplianceStatus accepts only public compliance values', () => {
  assert.equal(isComplianceStatus('PASSED'), true);
  assert.equal(isComplianceStatus('FAILED'), true);
  assert.equal(isComplianceStatus('PENDING'), true);
  assert.equal(isComplianceStatus('UNKNOWN'), false);
});

test('buildPlanPersistenceUpdate preserves final markdown and JSON plan', () => {
  const update = buildPlanPersistenceUpdate('```markdown\n# Lesson\n```', { rag_sources: ['S1'] }, 'PASSED');

  assert.equal(update.contentMarkdown, '# Lesson');
  assert.deepEqual(update.contentJson, { rag_sources: ['S1'] });
  assert.equal(update.complianceStatus, 'PASSED');
  assert.equal(update.status, 'completed');
  assert.ok(update.updatedAt instanceof Date);
});

test('applyStreamPersistenceEvent clears old markdown on reset before repair chunks', () => {
  let state: StreamPersistenceState = {
    accumulatedMarkdown: '# Old draft',
    finalPlanJson: { raw_markdown: '# Old draft' },
    complianceStatus: 'FAILED',
  };

  state = applyStreamPersistenceEvent(state, 'reset', { reason: 'quality_repair', iteration: 2 });
  state = applyStreamPersistenceEvent(state, 'chunk', { type: 'markdown', delta: '# Repaired draft' });

  assert.equal(state.accumulatedMarkdown, '# Repaired draft');
  assert.equal(state.accumulatedMarkdown.includes('Old draft'), false);
  assert.equal(state.finalPlanJson, null);
  assert.equal(state.complianceStatus, 'PENDING');
});

test('waitWithAbort rejects when caller aborts', async () => {
  const controller = new AbortController();
  const promise = waitWithAbort(1_000, controller.signal);
  controller.abort();

  await assert.rejects(promise, /Aborted/);
});

test('finalizeDocxWithRetry retries until injected finalizer succeeds', async () => {
  let attempts = 0;

  await finalizeDocxWithRetry('plan-1', 'req-1', log, {
    delaysMs: [0, 0, 0],
    finalize: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('not ready');
    },
  });

  assert.equal(attempts, 3);
});
