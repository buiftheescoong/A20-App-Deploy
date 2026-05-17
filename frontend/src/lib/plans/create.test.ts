import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreatePlanPayload, parseObjectiveLines } from './create';

test('parseObjectiveLines trims blank lines', () => {
  assert.deepEqual(parseObjectiveLines('  A\n\nB  \n'), ['A', 'B']);
});

test('buildCreatePlanPayload maps selected resources to gateway schema', () => {
  const payload = buildCreatePlanPayload({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teachingModel: 'CV-5512',
    objectives: 'Nhan biet\nVan dung',
    emphasis: '',
    specialRequests: 'Lam viec nhom',
    selectedResources: [
      { id: 'sys-1', type: 'system', lessonTitle: 'Bai 1' },
      { id: 'user-1', type: 'user' },
      { id: 'upload-1', type: 'upload' },
    ],
  });

  assert.deepEqual(payload.objectives, ['Nhan biet', 'Van dung']);
  assert.equal(payload.emphasis, undefined);
  assert.equal(payload.special_requests, 'Lam viec nhom');
  assert.deepEqual(payload.resource_ids, ['user-1']);
  assert.deepEqual(payload.system_resource_ids, ['sys-1']);
  assert.deepEqual(payload.system_resource_lessons, [{ resource_id: 'sys-1', lesson_title: 'Bai 1' }]);
});
