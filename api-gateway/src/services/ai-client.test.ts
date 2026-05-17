import test from 'node:test';
import assert from 'node:assert/strict';
import { AIClient } from './ai-client';

test('AIClient.chat sends persisted lesson snapshot to AI service', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;

  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response('', { status: 200 });
  }) as typeof fetch;

  try {
    const client = new AIClient();
    await client.chat('plan-1', 'Them hoat dong nhom', undefined, 'req-1', {
      markdown: '# Lesson',
      plan: {
        metadata: { subject: 'Toan' },
        raw_markdown: '# Lesson',
      },
    });

    assert.deepEqual(capturedBody, {
      message: 'Them hoat dong nhom',
      file_urls: [],
      current_markdown: '# Lesson',
      current_plan: {
        metadata: { subject: 'Toan' },
        raw_markdown: '# Lesson',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
