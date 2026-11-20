import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemote } from '../remote.js';

test('refresh reattaches to the existing run and restores stop identity without starting workers', async () => {
  const originalStream = globalThis.EventSource;
  const originalFetch = globalThis.fetch;
  const requests = [];
  let stream;
  globalThis.EventSource = class {
    constructor(url) { this.url = url; stream = this; }
    close() { this.closed = true; }
  };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true }; };
  try {
    const events = [];
    const remote = createRemote('standard', (event) => events.push(event), 'existing-demo');
    await remote.start();
    assert.equal(requests.length, 0);
    assert.equal(stream.url, '/api/events?demo=existing-demo');
    stream.onmessage({ data: JSON.stringify({ type: 'registered', runs: [{ id: 'a', runId: 'existing-a', canStop: true }] }) });
    await remote.stop('a');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/runs/existing-a/stop');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(events.at(-1).type, 'stop-pending');
    remote.dispose();
    assert.equal(stream.closed, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStream) globalThis.EventSource = originalStream;
    else delete globalThis.EventSource;
  }
});
