export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function errorMessage(error: unknown, fallback = 'Da xay ra loi'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `HTTP ${res.status}`;

  try {
    const error = JSON.parse(text);
    return error.message || error.detail || error.error || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}
