import { randomUUID } from 'node:crypto';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { url, assignments, sharedKey, documents } = JSON.parse(input);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(association) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tripwire-association': association.token,
    'x-bifrost-vk': sharedKey,
  };
  for (let step = 0; step < (association.job === 'a' ? 20 : 10); step++) {
    const prompt = association.job === 'a'
      ? 'Index this paragraph again. Return one topic word. ' + documents[0]
      : 'Summarize this paragraph in five words. ' + documents[step];
    const response = await fetch(`${url}/gateway/v1/chat/completions`, {
      method: 'POST', headers: { ...headers, 'x-request-id': randomUUID() },
      body: JSON.stringify({ model: 'local/document-step', stream: false, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 403 && association.job === 'a') return;
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    await response.arrayBuffer();
    await wait(1600);
  }
  const response = await fetch(`${url}/worker/finished`, { method: 'POST', headers });
  if (!response.ok) throw new Error('Worker completion was rejected');
}
await Promise.all(assignments.map(run));
