import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatPlanSnapshot } from './chat-helpers';

test('buildChatPlanSnapshot preserves structured plan and adds markdown for AI chat hydration', () => {
  const snapshot = buildChatPlanSnapshot({
    id: 'plan-1',
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teachingModel: '5E',
    contentMarkdown: '# Updated lesson',
    contentJson: {
      metadata: { subject: 'Toan', grade: '8', topic: 'Don thuc' },
      sections: { engage: { title: 'Start' } },
    },
  });

  const record = snapshot as Record<string, unknown>;
  assert.deepEqual(record.metadata, { subject: 'Toan', grade: '8', topic: 'Don thuc' });
  assert.deepEqual(record.sections, { engage: { title: 'Start' } });
  assert.equal(record.raw_markdown, '# Updated lesson');
});

test('buildChatPlanSnapshot falls back to metadata and markdown when contentJson is absent', () => {
  const snapshot = buildChatPlanSnapshot({
    id: 'plan-2',
    subject: 'Vat ly',
    grade: '11',
    topic: 'Dinh luat Newton',
    teachingModel: '3-phase',
    contentMarkdown: '# Lesson',
    contentJson: null,
  });

  assert.deepEqual(snapshot, {
    plan_id: 'plan-2',
    metadata: {
      subject: 'Vat ly',
      grade: '11',
      topic: 'Dinh luat Newton',
      teaching_model: '3-phase',
    },
    raw_markdown: '# Lesson',
  });
});
