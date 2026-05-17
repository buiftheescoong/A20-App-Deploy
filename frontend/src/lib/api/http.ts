import { env } from '../env';
import { supabase } from '../supabase';
import { parseErrorMessage } from './errors';
import { DEFAULT_REQUEST_TIMEOUT_MS, type ApiFetchOptions } from './shared';
import { withTimeoutSignal } from './timeout';

export const API_BASE = env.apiBaseUrl;
export const USE_MOCK = env.useMock;

export async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token') || '';
  }
  return '';
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function fetchWithAuth(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, ...fetchOptions } = options;
  const token = await getToken();
  const headers = new Headers(fetchOptions.headers);
  const hasBody = Boolean(fetchOptions.body);
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', createRequestId());
  }

  const timeout = withTimeoutSignal(signal, timeoutMs);

  try {
    return await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new Error('Yêu cầu mất quá lâu, vui lòng thử lại.');
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await fetchWithAuth(path, options);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
