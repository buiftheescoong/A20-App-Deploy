import type { CreatePlanInput, TeachingModel } from '../types';

export interface SelectedPlanResource {
  id: string;
  type: 'system' | 'user' | 'upload';
  lessonTitle?: string;
}

export interface CreatePlanFormValues {
  subject: string;
  grade: string;
  topic: string;
  teachingModel: TeachingModel;
  objectives: string;
  emphasis: string;
  specialRequests: string;
  selectedResources: SelectedPlanResource[];
}

export function parseObjectiveLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildCreatePlanPayload(values: CreatePlanFormValues): CreatePlanInput {
  const objectives = parseObjectiveLines(values.objectives);
  const systemResourceIds = values.selectedResources
    .filter((resource) => resource.type === 'system')
    .map((resource) => resource.id);
  const userResourceIds = values.selectedResources
    .filter((resource) => resource.type === 'user')
    .map((resource) => resource.id);
  const systemResourceLessons = values.selectedResources
    .filter((resource) => resource.type === 'system' && resource.lessonTitle)
    .map((resource) => ({
      resource_id: resource.id,
      lesson_title: resource.lessonTitle!,
    }));

  return {
    subject: values.subject,
    grade: values.grade,
    topic: values.topic,
    teaching_model: values.teachingModel,
    objectives: objectives.length > 0 ? objectives : undefined,
    emphasis: values.emphasis || undefined,
    special_requests: values.specialRequests || undefined,
    resource_ids: userResourceIds.length > 0 ? userResourceIds : undefined,
    system_resource_ids: systemResourceIds.length > 0 ? systemResourceIds : undefined,
    system_resource_lessons: systemResourceLessons.length > 0 ? systemResourceLessons : undefined,
  };
}
