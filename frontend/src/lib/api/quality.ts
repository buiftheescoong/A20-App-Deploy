import { apiFetch, fetchWithAuth, USE_MOCK } from './http';
import { parseErrorMessage } from './errors';
import { delay, EXPORT_RETRY_DELAYS_MS } from './shared';
import type { ComplianceReportData } from '../types';

export type { ComplianceReportData } from '../types';

export async function downloadDocx(planId: string): Promise<void> {
  if (USE_MOCK) {
    window.open('/mock/lesson_plan.docx', '_blank');
    return;
  }
  let res: Response | null = null;

  for (let attempt = 0; attempt <= EXPORT_RETRY_DELAYS_MS.length; attempt++) {
    res = await fetchWithAuth(`/api/plans/${planId}/export`, { timeoutMs: 45_000 });
    if (res.ok) break;
    if (res.status !== 404 || attempt === EXPORT_RETRY_DELAYS_MS.length) {
      throw new Error(await parseErrorMessage(res));
    }
    await delay(EXPORT_RETRY_DELAYS_MS[attempt]);
  }

  if (!res?.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `giao_an_${planId}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function checkQuality(planId: string): Promise<ComplianceReportData> {
  if (USE_MOCK) {
    await delay(800);
    return {
      is_passed: true,
      error_details: [],
      suggestions: ['Bổ sung phần đánh giá năng lực học sinh.'],
    };
  }
  return apiFetch(`/api/plans/${planId}/quality-check`, { method: 'POST' });
}
