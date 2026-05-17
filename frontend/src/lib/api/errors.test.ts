import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, parseErrorMessage } from './errors';
import { withTimeoutSignal } from './timeout';

test('parseErrorMessage preserves gateway message priority', async () => {
  const response = new Response(JSON.stringify({ error: 'IGNORED', message: 'Gateway message' }), {
    status: 400,
  });

  assert.equal(await parseErrorMessage(response), 'Gateway message');
});

test('parseErrorMessage falls back to plain text body', async () => {
  const response = new Response('plain failure', { status: 502 });

  assert.equal(await parseErrorMessage(response), 'plain failure');
});

test('errorMessage handles unknown thrown values', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('bad'), 'bad');
  assert.equal(errorMessage({}), 'Da xay ra loi');
});

test('withTimeoutSignal forwards caller aborts', () => {
  const caller = new AbortController();
  const timeout = withTimeoutSignal(caller.signal, 0);

  caller.abort();

  assert.equal(timeout.signal.aborted, true);
  assert.equal(timeout.didTimeout(), false);
  timeout.cleanup();
});
