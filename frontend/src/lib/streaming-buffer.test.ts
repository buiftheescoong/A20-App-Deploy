import test from 'node:test';
import assert from 'node:assert/strict';
import { createBufferedMarkdownAppender } from './streaming-buffer';

type TimerId = ReturnType<typeof setTimeout>;

function timerId(value: number): TimerId {
  return value as unknown as TimerId;
}

test('buffers multiple markdown chunks into one append per flush window', () => {
  const appended: string[] = [];
  const scheduled: Array<() => void> = [];

  const buffer = createBufferedMarkdownAppender({
    append: (delta) => appended.push(delta),
    schedule: (callback) => {
      scheduled.push(callback);
      return timerId(scheduled.length);
    },
    clear: () => {},
  });

  buffer.push('# Ti');
  buffer.push('tle\n');
  buffer.push('Body');

  assert.deepEqual(appended, []);
  assert.equal(scheduled.length, 1);

  scheduled[0]();

  assert.deepEqual(appended, ['# Title\nBody']);
});

test('manual flush emits pending markdown and prevents duplicate appends', () => {
  const appended: string[] = [];
  const scheduled: Array<() => void> = [];
  let cleared = 0;

  const buffer = createBufferedMarkdownAppender({
    append: (delta) => appended.push(delta),
    schedule: (callback) => {
      scheduled.push(callback);
      return timerId(scheduled.length);
    },
    clear: () => {
      cleared += 1;
    },
  });

  buffer.push('draft');
  buffer.flush();
  scheduled[0]();

  assert.deepEqual(appended, ['draft']);
  assert.equal(cleared, 1);
});

test('cancel clears queued markdown without appending it', () => {
  const appended: string[] = [];
  const scheduled: Array<() => void> = [];

  const buffer = createBufferedMarkdownAppender({
    append: (delta) => appended.push(delta),
    schedule: (callback) => {
      scheduled.push(callback);
      return timerId(scheduled.length);
    },
    clear: () => {},
  });

  buffer.push('discard me');
  buffer.cancel();
  scheduled[0]();

  assert.deepEqual(appended, []);
});
