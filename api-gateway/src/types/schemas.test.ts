import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanSchema, listPlansQuerySchema } from './schemas';

test('createPlanSchema preserves accepted teaching models and UUID arrays', () => {
  const parsed = createPlanSchema.parse({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teaching_model: 'CV-5512',
    resource_ids: ['11111111-1111-4111-8111-111111111111'],
    system_resource_ids: ['22222222-2222-4222-8222-222222222222'],
    system_resource_lessons: [{
      resource_id: '22222222-2222-4222-8222-222222222222',
      lesson_title: '  Bai 1  ',
    }],
  });

  assert.equal(parsed.teaching_model, 'CV-5512');
  assert.deepEqual(parsed.resource_ids, ['11111111-1111-4111-8111-111111111111']);
  assert.deepEqual(parsed.system_resource_lessons, [{
    resource_id: '22222222-2222-4222-8222-222222222222',
    lesson_title: 'Bai 1',
  }]);
});

test('listPlansQuerySchema coerces pagination defaults', () => {
  const parsed = listPlansQuerySchema.parse({ page: '2', limit: '20' });

  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.sort, 'newest');
});

test('createPlanSchema rejects unsupported grades', () => {
  assert.throws(() => createPlanSchema.parse({
    subject: 'Toan',
    grade: '5',
    topic: 'Don thuc',
    teaching_model: '5E',
  }));
});
