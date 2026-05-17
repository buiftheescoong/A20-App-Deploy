import type { ChatResponse, Message } from '../types';
import { MOCK_MESSAGES } from '../mock-data';
import { apiFetch, USE_MOCK } from './http';
import { delay } from './shared';

export async function sendMessage(planId: string, message: string): Promise<ChatResponse> {
  if (USE_MOCK) {
    await delay(500);
    return { status: 'completed', intent: 'qa', message: null };
  }
  return apiFetch(`/api/plans/${planId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getMessages(planId: string): Promise<{ data: Message[] }> {
  if (USE_MOCK) {
    await delay(300);
    return { data: MOCK_MESSAGES.filter((message) => message.planId === planId) };
  }
  return apiFetch(`/api/plans/${planId}/messages`);
}
