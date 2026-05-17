import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocxContentDisposition,
  buildDocxPlanPayload,
  buildDocxStoragePath,
  hasExportableDocxContent,
  type PlanForDocxExport,
} from './plan-export-helpers';

const basePlan: PlanForDocxExport = {
  id: 'plan-1',
  subject: 'Toan',
  grade: '8',
  topic: 'Ham so bac nhat',
  teachingModel: 'CV-5512',
  objectives: ['Objective from DB'],
  contentMarkdown: '# Lesson',
  contentJson: {
    metadata: {
      subject: 'Old',
      duration_minutes: 45,
      objectives: ['Objective from JSON'],
    },
    sections: {},
  },
  complianceStatus: 'PASSED',
};

test('buildDocxPlanPayload prefers current DB metadata while preserving JSON fields', () => {
  const payload = buildDocxPlanPayload(basePlan);

  assert.equal(payload.lesson_plan_id, 'plan-1');
  assert.deepEqual(payload.sections, {});
  assert.deepEqual(payload.metadata, {
    subject: 'Toan',
    grade: '8',
    topic: 'Ham so bac nhat',
    teaching_model: 'CV-5512',
    duration_minutes: 45,
    objectives: ['Objective from DB'],
  });
  assert.deepEqual(payload.compliance, { status: 'PASSED', errors: [] });
});

test('hasExportableDocxContent accepts markdown or structured JSON', () => {
  assert.equal(hasExportableDocxContent(basePlan), true);
  assert.equal(hasExportableDocxContent({ ...basePlan, contentMarkdown: '   ' }), true);
  assert.equal(hasExportableDocxContent({ ...basePlan, contentMarkdown: '', contentJson: null }), false);
});

test('DOCX filename helpers are stable and ASCII-safe', () => {
  assert.equal(buildDocxStoragePath('plan-1'), 'plan-1/giao_an.docx');
  assert.equal(buildDocxContentDisposition('plan-1'), 'attachment; filename="giao_an_plan-1.docx"');
});
