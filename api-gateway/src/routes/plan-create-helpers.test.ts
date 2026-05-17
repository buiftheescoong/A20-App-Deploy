import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreatePlanRawBody,
  buildPlanAiInput,
  buildSystemResourceLessonMap,
  isAllowedPlanFileType,
  isPlanFileSizeAllowed,
  mergeResourceIds,
  parseJsonField,
  safeUploadFilename,
  sliceMarkdownLesson,
  toAiResourceContext,
} from './plan-create-helpers';
import { createPlanSchema } from '../types/schemas';

test('parseJsonField parses valid JSON and ignores missing values', () => {
  assert.deepEqual(parseJsonField<string[]>('["a","b"]', 'resource_ids'), ['a', 'b']);
  assert.equal(parseJsonField<string[]>(undefined, 'resource_ids'), undefined);
});

test('parseJsonField throws the gateway validation shape for invalid JSON', () => {
  assert.throws(() => parseJsonField('[', 'objectives'), /objectives must be valid JSON/);
});

test('buildCreatePlanRawBody parses multipart JSON fields and omits blanks', () => {
  const raw = buildCreatePlanRawBody({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teaching_model: '5E',
    objectives: '["Nhan biet"]',
    emphasis: '',
    resource_ids: '["00000000-0000-0000-0000-000000000001"]',
    system_resource_lessons: '[{"resource_id":"00000000-0000-0000-0000-000000000002","lesson_title":"Bai 1"}]',
  });

  assert.deepEqual(raw.objectives, ['Nhan biet']);
  assert.equal(raw.emphasis, undefined);
  assert.deepEqual(raw.resource_ids, ['00000000-0000-0000-0000-000000000001']);
  assert.equal(raw.system_resource_lessons?.[0]?.lesson_title, 'Bai 1');
});

test('plan upload helpers preserve validation and filename behavior', () => {
  assert.equal(isAllowedPlanFileType('application/pdf'), true);
  assert.equal(isAllowedPlanFileType('image/png'), false);
  assert.equal(isPlanFileSizeAllowed(50 * 1024 * 1024), true);
  assert.equal(isPlanFileSizeAllowed(50 * 1024 * 1024 + 1), false);
  assert.equal(safeUploadFilename('folder\\lesson/plan.pdf'), 'folder_lesson_plan.pdf');
});

test('mergeResourceIds keeps existing order and deduplicates uploaded resources', () => {
  assert.deepEqual(mergeResourceIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
});

test('buildSystemResourceLessonMap trims and indexes selected lessons by parent resource', () => {
  const selections = buildSystemResourceLessonMap([
    { resource_id: 'resource-1', lesson_title: '  Bai 1  ' },
    { resource_id: 'resource-2', lesson_title: 'Bai 2' },
  ]);

  assert.equal(selections.get('resource-1'), 'Bai 1');
  assert.equal(selections.get('resource-2'), 'Bai 2');
});

test('sliceMarkdownLesson returns only the selected lesson section', () => {
  const content = [
    '# Chuong I',
    '',
    '## Bai 1: Don thuc',
    'Lesson 1 intro',
    '### Muc 1',
    'Lesson 1 detail',
    '## Bai 2: Da thuc',
    'Lesson 2 intro',
    '### Muc 2',
    'Lesson 2 detail',
    '## Bai 3: Hang dang thuc',
    'Lesson 3 intro',
  ].join('\n');

  const sliced = sliceMarkdownLesson(content, '  Bai 2:  Da thuc ');

  assert.equal(sliced, [
    '## Bai 2: Da thuc',
    'Lesson 2 intro',
    '### Muc 2',
    'Lesson 2 detail',
  ].join('\n'));
});

test('sliceMarkdownLesson is accent-insensitive and returns null when absent', () => {
  const content = '## B\u00e0i 1: \u0110\u01a1n th\u1ee9c\nNoi dung\n## B\u00e0i 2: \u0110a th\u1ee9c\nNoi dung 2';

  assert.equal(sliceMarkdownLesson(content, 'Bai 1: Don thuc'), '## B\u00e0i 1: \u0110\u01a1n th\u1ee9c\nNoi dung');
  assert.equal(sliceMarkdownLesson(content, 'Bai 3: Hang dang thuc'), null);
});

test('createPlanSchema requires lesson selections to reference selected system resources', () => {
  assert.throws(() => createPlanSchema.parse({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teaching_model: '5E',
    system_resource_ids: ['00000000-0000-0000-0000-000000000001'],
    system_resource_lessons: [
      {
        resource_id: '00000000-0000-0000-0000-000000000002',
        lesson_title: 'Bai 1',
      },
    ],
  }), /Lesson resource_id must also be present/);
});

test('buildPlanAiInput omits empty optional arrays', () => {
  const input = buildPlanAiInput({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teaching_model: '5E',
  }, [], [], []);

  assert.equal(input.file_urls, undefined);
  assert.equal(input.resource_ids, undefined);
  assert.equal(input.system_resource_texts, undefined);
  assert.equal(input.subject, 'Toan');
});

test('buildPlanAiInput sends citation-ready resource contexts', () => {
  const context = {
    id: 'res-1',
    filename: 'SGK Toan 8.md',
    content_text: '## Bai 2\nNoi dung bai 2',
    category: 'sgk',
    subject: 'Toan',
    grade: '8',
    metadata: { raw_path: 'data/raw/a.md', selection_scope: 'lesson', lesson: 'Bai 2' },
  };

  const input = buildPlanAiInput({
    subject: 'Toan',
    grade: '8',
    topic: 'Don thuc',
    teaching_model: '5E',
  }, ['res-1'], [], ['Noi dung chuong'], [], [context]);

  assert.equal(input.system_resource_texts, undefined);
  assert.deepEqual(input.system_resource_contexts, [context]);
  assert.equal(input.system_resource_contexts?.[0]?.content_text.includes('Bai 2'), true);
});

test('toAiResourceContext preserves citation metadata and coerces missing content', () => {
  const context = toAiResourceContext({
    id: 'res-1',
    filename: 'SGK.md',
    contentText: null,
    category: 'sgk',
    subject: 'Toan',
    grade: '8',
    metadata: { raw_path: 'data/raw/a.md' },
  }, { lesson: 'Bai 1' });

  assert.equal(context.content_text, '');
  assert.deepEqual(context.metadata, { raw_path: 'data/raw/a.md', lesson: 'Bai 1' });
});
