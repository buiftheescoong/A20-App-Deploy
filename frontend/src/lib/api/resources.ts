import type { Resource, SystemResourceDetail, SystemResourceListParams, SystemResourceSummary } from '../types';
import { MOCK_SYSTEM_RESOURCES, MOCK_USER_RESOURCES } from '../mock-data';
import { API_BASE, apiFetch, getToken, USE_MOCK } from './http';
import { delay, UPLOAD_REQUEST_TIMEOUT_MS, type ApiFetchOptions } from './shared';

export async function uploadResource(file: File): Promise<Resource> {
  if (USE_MOCK) {
    await delay(1500);
    return {
      ...MOCK_USER_RESOURCES[0],
      id: `ur-${Date.now()}`,
      filename: file.name,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
    };
  }
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/api/resources', { method: 'POST', body: formData, timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS });
}

export async function getResources(search?: string, options: ApiFetchOptions = {}): Promise<{ data: Resource[] }> {
  if (USE_MOCK) {
    await delay(300);
    let list = MOCK_USER_RESOURCES;
    if (search) list = list.filter((resource) => resource.filename.toLowerCase().includes(search.toLowerCase()));
    return { data: list };
  }
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch(`/api/resources${qs}`, options);
}

export async function deleteResource(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    return;
  }
  return apiFetch(`/api/resources/${id}`, { method: 'DELETE' });
}

export async function getSystemResources(params: SystemResourceListParams = {}, options: ApiFetchOptions = {}): Promise<{ data: SystemResourceSummary[] }> {
  if (USE_MOCK) {
    await delay(300);
    let list = MOCK_SYSTEM_RESOURCES;
    if (params.subject) list = list.filter((resource) => resource.subject === params.subject);
    if (params.grade) list = list.filter((resource) => resource.grade === params.grade);
    if (params.category) list = list.filter((resource) => resource.category === params.category);
    if (params.search) {
      const search = params.search.toLowerCase();
      list = list.filter((resource) => resource.filename.toLowerCase().includes(search) || resource.description.toLowerCase().includes(search));
    }
    return { data: list };
  }
  const qs = new URLSearchParams();
  if (params.subject) qs.set('subject', params.subject);
  if (params.grade) qs.set('grade', params.grade);
  if (params.category) qs.set('category', params.category);
  if (params.search) qs.set('search', params.search);
  return apiFetch(`/api/resources/system?${qs}`, options);
}

export async function getSystemResource(id: string, options: ApiFetchOptions = {}): Promise<SystemResourceDetail> {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_SYSTEM_RESOURCES.find((resource) => resource.id === id) || MOCK_SYSTEM_RESOURCES[0];
  }
  return apiFetch(`/api/resources/system/${id}`, options);
}

export async function downloadSystemResource(id: string): Promise<void> {
  if (USE_MOCK) {
    window.open('/mock/sample.pdf', '_blank');
    return;
  }
  const target = window.open('', '_blank');
  const token = await getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `${API_BASE}/api/resources/system/${id}/download${qs}`;
  if (target) {
    target.location.href = url;
  } else {
    window.location.href = url;
  }
}
