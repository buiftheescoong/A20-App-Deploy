import type {
  CreatePlanInput,
  CreatePlanResponse,
  ListParams,
  PaginatedResponse,
  Plan,
  PlanStatusResponse,
  UpdatePlanInput,
} from '../types';
import { MOCK_PLANS } from '../mock-data';
import { apiFetch, USE_MOCK } from './http';
import { delay, UPLOAD_REQUEST_TIMEOUT_MS, type ApiFetchOptions } from './shared';

export async function createPlan(data: CreatePlanInput, files: File[] = []): Promise<CreatePlanResponse> {
  if (USE_MOCK) {
    await delay(800);
    return { status: 'accepted', plan_id: 'mock-plan-new' };
  }

  const formData = new FormData();
  formData.append('subject', data.subject);
  formData.append('grade', data.grade);
  formData.append('topic', data.topic);
  formData.append('teaching_model', data.teaching_model);
  if (data.objectives) formData.append('objectives', JSON.stringify(data.objectives));
  if (data.emphasis) formData.append('emphasis', data.emphasis);
  if (data.special_requests) formData.append('special_requests', data.special_requests);
  if (data.resource_ids) formData.append('resource_ids', JSON.stringify(data.resource_ids));
  if (data.system_resource_ids) formData.append('system_resource_ids', JSON.stringify(data.system_resource_ids));
  if (data.system_resource_lessons) formData.append('system_resource_lessons', JSON.stringify(data.system_resource_lessons));
  files.forEach((file) => formData.append('files', file));

  return apiFetch('/api/plans', { method: 'POST', body: formData, timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS });
}

export async function getPlans(params: ListParams = {}, options: ApiFetchOptions = {}): Promise<PaginatedResponse<Plan>> {
  if (USE_MOCK) {
    await delay(400);
    return { data: MOCK_PLANS, total: MOCK_PLANS.length, page: 1, limit: 10 };
  }

  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.subject) qs.set('subject', params.subject);
  if (params.grade) qs.set('grade', params.grade);
  if (params.sort) qs.set('sort', params.sort);
  return apiFetch(`/api/plans?${qs}`, options);
}

export async function getPlan(id: string, options: ApiFetchOptions = {}): Promise<Plan> {
  if (USE_MOCK) {
    await delay(300);
    const plan = MOCK_PLANS.find((item) => item.id === id);
    return plan || MOCK_PLANS[0];
  }
  return apiFetch(`/api/plans/${id}`, options);
}

export async function getPlanStatus(id: string, options: ApiFetchOptions = {}): Promise<PlanStatusResponse> {
  if (USE_MOCK) {
    await delay(200);
    const plan = MOCK_PLANS.find((item) => item.id === id) || MOCK_PLANS[0];
    return {
      id,
      status: plan.status,
      complianceStatus: plan.complianceStatus,
      docxUrl: plan.docxUrl,
      hasContent: Boolean(plan.contentMarkdown),
      updatedAt: plan.updatedAt,
    };
  }
  return apiFetch(`/api/plans/${id}/status`, options);
}

export async function updatePlan(id: string, data: UpdatePlanInput): Promise<Plan> {
  if (USE_MOCK) {
    await delay(500);
    return { ...MOCK_PLANS[0], ...data } as Plan;
  }
  return apiFetch(`/api/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deletePlan(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    return;
  }
  return apiFetch(`/api/plans/${id}`, { method: 'DELETE' });
}
