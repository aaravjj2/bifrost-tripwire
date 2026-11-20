import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
const lines = createInterface({ input: process.stdin });
let config;
let release;
const gate = new Promise((resolve) => { release = resolve; });
const emit = (event) => process.stdout.write(JSON.stringify({ worker: 'node', ...event }) + '\n');
async function run(job) {
  for (let step = 0; step < (job === 'a' ? 20 : 10); step++) {
    if (step === 1) await gate;
    const requestId = randomUUID();
    const prompt = job === 'a' ? 'Index this paragraph again. Return one topic word. ' + config.documents[0] : 'Summarize this paragraph in five words. ' + config.documents[step];
    const response = await fetch(config.url + '/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bf-vk': config.keys[job], 'x-request-id': requestId, 'x-bf-eh-x-request-id': requestId },
      body: JSON.stringify({ model: 'openai/local/document-step', stream: false, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(10000),
    });
    await response.arrayBuffer();
    emit({ job, requestId, status: response.status, phase: step === 0 ? 'before' : 'after', time: new Date().toISOString() });
    if ([401, 403].includes(response.status)) { emit({ job, done: true, completed: false }); return; }
    if (!response.ok) throw new Error('Provider request failed');
    await new Promise((resolve) => setTimeout(resolve, 1600));
  }
  emit({ job, done: true, completed: true });
}
lines.on('line', (line) => {
  if (config) { if (line === 'continue') release(); return; }
  config = JSON.parse(line);
  Promise.all(['a', 'b'].map(run)).then(() => { lines.close(); process.stdin.destroy(); }).catch(() => { emit({ error: 'Worker request failed' }); process.exit(1); });
});
