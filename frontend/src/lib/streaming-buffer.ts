export const STREAM_MARKDOWN_FLUSH_MS = 80;

type TimerId = ReturnType<typeof setTimeout>;

interface BufferedMarkdownAppenderOptions {
  append: (delta: string) => void;
  flushDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => TimerId;
  clear?: (timer: TimerId) => void;
  runFlush?: (callback: () => void) => void;
}

export interface BufferedMarkdownAppender {
  push: (delta: string) => void;
  flush: () => void;
  cancel: () => void;
}

export function createBufferedMarkdownAppender({
  append,
  flushDelayMs = STREAM_MARKDOWN_FLUSH_MS,
  schedule = setTimeout,
  clear = clearTimeout,
  runFlush = (callback) => callback(),
}: BufferedMarkdownAppenderOptions): BufferedMarkdownAppender {
  let pendingMarkdown = '';
  let flushTimer: TimerId | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clear(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    clearFlushTimer();
    if (!pendingMarkdown) return;

    const delta = pendingMarkdown;
    pendingMarkdown = '';
    runFlush(() => append(delta));
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = schedule(flush, flushDelayMs);
  };

  return {
    push(delta) {
      if (!delta) return;
      pendingMarkdown += delta;
      scheduleFlush();
    },
    flush,
    cancel() {
      clearFlushTimer();
      pendingMarkdown = '';
    },
  };
}
