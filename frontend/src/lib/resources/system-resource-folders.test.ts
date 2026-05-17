import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectedSystemResourceName, buildSystemLessonGenerateParams, buildSystemResourceFolders, extractLessonTitle, getLessonTitles } from './system-resource-folders';
import type { SystemResourceSummary } from '../types';

function resource(overrides: Partial<SystemResourceSummary>): SystemResourceSummary {
  return {
    id: 'resource-1',
    filename: 'tap-1-chuong-1.md',
    fileUrl: '/raw/tap-1-chuong-1.md',
    fileSize: null,
    pageCount: null,
    category: 'sgk',
    subject: 'Toan',
    grade: '8',
    description: 'Fallback description',
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('groups system resources by category, subject, grade, and curriculum', () => {
  const folders = buildSystemResourceFolders([
    resource({
      id: 'b',
      filename: 'tap-1-chuong-2.md',
      metadata: { curriculum: 'Ket noi', raw_path: 'b.md', lessons: ['Bai 2', 'Bai 3'] },
    }),
    resource({
      id: 'a',
      filename: 'tap-1-chuong-1.md',
      metadata: { curriculum: 'Ket noi', raw_path: 'a.md', lessons: ['Bai 1'] },
    }),
  ]);

  assert.equal(folders.length, 1);
  assert.equal(folders[0].key, 'sgk|Toan|8|Ket noi');
  assert.deepEqual(folders[0].lessons.map((lesson) => lesson.title), ['Bai 1', 'Bai 2', 'Bai 3']);
});

test('builds generate params with parent resource and selected lesson title', () => {
  const lesson = {
    id: 'resource-1-0',
    title: 'Bai 1',
    resource: resource({ id: 'resource-1' }),
    order: 0,
  };

  const params = buildSystemLessonGenerateParams(lesson);

  assert.equal(params.get('system_resource_id'), 'resource-1');
  assert.equal(params.get('system_lesson_title'), 'Bai 1');
  assert.equal(params.get('topic'), 'Bai 1');
});

test('builds selected resource name without duplicating lesson summary', () => {
  assert.equal(
    buildSelectedSystemResourceName(
      'SGK Toan 8 - Ket noi tri thuc voi cuoc song - Bai 1: DON THUC (+4 bai)',
      'Bai 1: DON THUC',
    ),
    'SGK Toan 8 - Ket noi tri thuc voi cuoc song - Bai 1: DON THUC',
  );
  assert.equal(
    buildSelectedSystemResourceName(
      'SGK Toan 8 - Ket noi tri thuc voi cuoc song - Bai 1: DON THUC (+4 bai)',
      'Bai 2: DA THUC',
    ),
    'SGK Toan 8 - Ket noi tri thuc voi cuoc song - Bai 2: DA THUC',
  );
});

test('derives lesson titles from metadata, filename, then description', () => {
  assert.deepEqual(getLessonTitles(resource({ metadata: { lessons: ['  Lesson A  ', ''] } })), ['Lesson A']);
  assert.deepEqual(getLessonTitles(resource({ filename: 'Bài 12. Tam giac (Toan 8).md' })), ['Bài 12. Tam giac']);
  assert.deepEqual(getLessonTitles(resource({ filename: 'chapter.md', description: 'Chapter fallback' })), ['Chapter fallback']);
});

test('extracts lesson title prefix without parenthetical suffix', () => {
  assert.equal(extractLessonTitle('Bài 4: Phan tich da thuc (tap 1).md'), 'Bài 4: Phan tich da thuc');
});
