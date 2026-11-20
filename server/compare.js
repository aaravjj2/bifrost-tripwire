import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { secret } from './policy.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const key = secret();
const children = new Set();
const binary = join(root, '.local', process.platform === 'win32' ? 'bifrost-http-tripwire.exe' : 'bifrost-http-tripwire');
const documents = JSON.parse(await readFile(join(root, 'server/documents.json'), 'utf8'));
const trials = [];
let recorder;
try {
  recorder = fork(join(root, 'server/recorder.js'), [], { env: { ...process.env, TRIPWIRE_RECORDER_KEY: key, TRIPWIRE_MODEL_PORT: '4190' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const recorderInfo = await new Promise((resolve, reject) => { recorder.once('message', resolve); recorder.once('exit', () => reject(new Error('Comparison recorder failed'))); recorder.once('error', reject); });
  const recorderURL = 'http://127.0.0.1:' + recorderInfo.port;
  const gateway = spawn(binary, [], { env: { ...process.env, TRIPWIRE_PLUGIN_KEY: key }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  children.add(gateway);
  gateway.stderr.on('data', () => {});
  gateway.stdin.end(JSON.stringify({ recorderUrl: recorderURL, recorderKey: key, sharedKey: 'sk-bf-' + secret(), stock: true, dataDir: join(root, '.local', 'stock-host', randomUUID()) }));
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Stock host startup timed out')), 90000);
    gateway.stdout.on('data', (data) => { const match = /TRIPWIRE_READY:(\d+)/.exec(String(data)); if (match) { clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]); } });
    gateway.once('error', reject); gateway.once('exit', () => reject(new Error('Stock host exited')));
  });
  async function admin(path, body, method = 'POST') {
    const response = await fetch(url + '/api/governance/virtual-keys' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Bifrost-Setup-Token': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok, 'Stock governance operation returned ' + response.status);
    return response.json();
  }
  for (const configuration of ['stock-shared-key', 'stock-per-run-keys']) {
    for (let trial = 1; trial <= 3; trial++) {
      const provisionStart = performance.now();
      const create = async (label) => (await admin('', { name: configuration + '-' + label + '-' + trial, is_active: true, rate_limit: { request_max_limit: configuration === 'stock-shared-key' ? 60 : label === 'a' ? 40 : 20, request_reset_duration: '1h' }, provider_configs: [{ provider: 'openai', allowed_models: ['local/document-step'], key_ids: ['*'], weight: 1 }] })).virtual_key;
      const a = await create('a');
      const b = configuration === 'stock-shared-key' ? a : await create('b');
      assert.ok(typeof a.value === 'string' && a.value.startsWith('sk-bf-'), 'Key creation did not return a usable key');
      const provisioningMs = Math.round(performance.now() - provisionStart);
      const events = [];
      const first = new Set();
      const workerChildren = [];
      let boundary;
      let stopping;
      const deadline = setTimeout(() => { for (const child of workerChildren) child.kill(); }, 45000);
      try {
        const completions = ['python', 'node'].map((worker) => new Promise((resolve, reject) => {
          const child = worker === 'python'
            ? spawn('python3', [join(root, 'server/comparison-worker.py')], { stdio: ['pipe', 'pipe', 'pipe'] })
            : spawn(process.execPath, [join(root, 'server/comparison-worker.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
          children.add(child); workerChildren.push(child);
          child.stderr.on('data', () => {});
          let buffer = '';
          child.stdout.on('data', (chunk) => {
            buffer += chunk;
            let end;
            while ((end = buffer.indexOf('\n')) !== -1) {
              const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
              events.push(event);
              if (event.error) { reject(new Error(event.error)); return; }
              if (event.phase === 'before') {
                if (event.status !== 200) { reject(new Error('Pre-stop request returned ' + event.status)); return; }
                first.add(event.worker + '/' + event.job);
              }
              if (first.size === 4 && !stopping) {
                stopping = admin('/' + a.id, { is_active: false }, 'PUT').then(() => {
                  boundary = new Date().toISOString();
                  for (const running of workerChildren) running.stdin.write('continue\n');
                }).catch(reject);
              }
            }
          });
          child.once('error', reject);
          child.once('exit', (code) => { children.delete(child); code === 0 ? resolve() : reject(new Error(worker + ' comparison worker exited')); });
          child.stdin.write(JSON.stringify({ url, keys: { a: a.value, b: b.value }, documents }) + '\n');
        }));
        await Promise.all(completions);
        await stopping;
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const observationEnd = new Date().toISOString();
        const response = await fetch(recorderURL + '/arrivals', { headers: { Authorization: 'Bearer ' + key } });
        const arrivals = await response.json();
        const denied = events.filter((event) => event.phase === 'after' && [401, 403].includes(event.status));
        const aDenied = denied.filter((event) => event.job === 'a');
        const bIds = new Set(events.filter((event) => event.job === 'b' && event.phase === 'after').map((event) => event.requestId));
        const deniedIds = new Set(denied.map((event) => event.requestId));
        const deniedArrivals = arrivals.filter((arrival) => deniedIds.has(arrival.requestId)).length;
        const bArrivals = arrivals.filter((arrival) => bIds.has(arrival.requestId) && arrival.time >= boundary).length;
        const bComplete = events.filter((event) => event.job === 'b' && event.done && event.completed).length === 2;
        assert.equal(aDenied.length, 2);
        assert.equal(deniedArrivals, 0);
        assert.equal(bComplete, configuration === 'stock-per-run-keys');
        assert.equal(bArrivals, configuration === 'stock-per-run-keys' ? 18 : 0);
        const result = { configuration, trial, engine: 'bifrost-http-stock', provider: recorderInfo.provider, gatewayCredentialsIssued: configuration === 'stock-shared-key' ? 1 : 2, provisioningMs, stopOperatorActions: 1, boundary, observationEnd, postStopADenials: aDenied.length, deniedArrivals, postStopBArrivals: bArrivals, jobBCompleted: bComplete, events };
        trials.push(result);
        console.log(JSON.stringify({ configuration, trial, postStopADenials: aDenied.length, deniedArrivals, postStopBArrivals: bArrivals, jobBCompleted: bComplete }));
      } finally {
        clearTimeout(deadline);
        for (const child of workerChildren) { if (child.exitCode === null) child.kill(); }
      }
    }
  }
  await mkdir(join(root, 'evidence'), { recursive: true });
  await writeFile(join(root, 'evidence', 'stock-comparison.json'), JSON.stringify({ checkedAt: new Date().toISOString(), constraint: 'Participant reports that workers use a fixed gateway credential and per-run gateway-key distribution requires deployment changes.', trials }, null, 2) + '\n');
} finally {
  for (const child of children) child.kill();
  if (recorder?.connected) recorder.send({ type: 'shutdown' });
}
