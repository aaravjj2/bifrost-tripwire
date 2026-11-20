import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.TRIPWIRE_URL || 'http://127.0.0.1:4177';
const trialCount = Number(process.argv[2] || 3);
assert.ok(Number.isSafeInteger(trialCount) && trialCount > 0 && trialCount <= 3, 'Choose 1 to 3 trials');
const sessionResponse = await fetch(origin + '/api/session');
assert.ok(sessionResponse.ok, 'Control service unavailable');
const session = await sessionResponse.json();
const cookie = sessionResponse.headers.get('set-cookie').split(';')[0];
const output = join(dirname(dirname(fileURLToPath(import.meta.url))), '.local', 'trials');
await mkdir(output, { recursive: true });
const results = [];

for (let trial = 1; trial <= trialCount; trial++) {
  const response = await fetch(origin + '/api/demo', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'standard' }),
  });
  assert.equal(response.status, 201, 'Wait until the previous demo has finished before running verification');
  const demo = await response.json();
  const jobA = demo.runs.find((run) => run.id === 'a');
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 45000);
  let reader;
  try {
    const eventsResponse = await fetch(origin + '/api/events?demo=' + encodeURIComponent(demo.demo), {
      headers: { Cookie: cookie }, signal: abort.signal,
    });
    assert.ok(eventsResponse.ok);
    reader = eventsResponse.body.getReader();
    const decoder = new TextDecoder();
    const outstanding = new Set();
    const aWorkers = new Set();
    const decisions = new Set();
    const observed = new Set();
    let stopped = false;
    let complete = false;
    let buffer = '';
    while (!complete || observed.size !== 2) {
      const chunk = await reader.read();
      assert.ok(!chunk.done, 'Event stream ended prematurely');
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const packet = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = packet.split('\n').find((line) => line.startsWith('data: '));
        if (!data) continue;
        const event = JSON.parse(data.slice(6));
        assert.notEqual(event.type, 'component-error', 'A worker or recorder failed');
        if (event.type === 'admitted') {
          outstanding.add(event.requestId);
          if (event.job === 'a') aWorkers.add(event.worker);
        }
        if (event.type === 'request-completed') outstanding.delete(event.requestId);
        if (event.type === 'denied' && event.job === 'a') decisions.add(event.sequence);
        if (event.type === 'observation' && decisions.has(event.decisionSequence)) {
          assert.equal(event.outcome, 'verified');
          assert.equal(event.arrivals, 0);
          observed.add(event.decisionSequence);
        }
        if (event.type === 'run-completed' && event.job === 'b') complete = true;
      }
      // Stop only after both A workers have called and all prior admissions drained.
      if (!stopped && aWorkers.size === 2 && outstanding.size === 0) {
        const stop = await fetch(origin + '/api/runs/' + jobA.runId + '/stop', { method: 'POST', headers: { Cookie: cookie } });
        assert.equal(stop.status, 200);
        stopped = true;
      }
    }
    const receipt = await (await fetch(origin + '/api/runs/' + jobA.runId + '/receipt', { headers: { Cookie: cookie } })).json();
    assert.equal(receipt.trialStatus, session.provider === 'smollm2-local' ? 'passed-local-model' : 'passed-local-fixture');
    assert.equal(receipt.engine, session.engine);
    const file = join(output, demo.demo + '.json');
    await writeFile(file, JSON.stringify(receipt, null, 2) + '\n');
    results.push({ trial, engine: receipt.engine, provider: receipt.provider, runId: receipt.runId, ...receipt.counts });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    clearTimeout(deadline);
    await reader?.cancel();
    abort.abort();
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
}
await writeFile(join(output, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
