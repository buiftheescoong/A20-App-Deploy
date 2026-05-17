export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_REQUEST_TIMEOUT_MS = 120_000;
export const EXPORT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 6_000];

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
