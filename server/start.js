import { createServer } from 'node:http';
import { fork, spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, sep, extname } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { Policy, secret, equalSecret } from './policy.js';
import { permitsRequest } from './origin.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.TRIPWIRE_PORT || 4177);
const origin = `http://127.0.0.1:${port}`;
await mkdir(join(root, '.local'), { recursive: true });
const policy = new Policy(join(root, '.local', 'tripwire.sqlite'));
const sessionKey = secret();
const sharedKey = 'sk-bf-' + secret();
const recorderKey = secret();
const pluginKey = process.env.TRIPWIRE_PLUGIN_KEY || secret();
const processes = new Set();
const scenarios = new Map();
const tokens = new Map();
const finished = new Map();
const failedDemos = new Set();
let activeDemo;
let shuttingDown = false;

const recorder = fork(join(root, 'server/recorder.js'), [], {
  env: { ...process.env, TRIPWIRE_RECORDER_KEY: recorderKey },
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
});
const recorderInfo = await new Promise((resolve, reject) => {
  recorder.once('message', (info) => resolve(info));
  recorder.once('error', reject);
  recorder.once('exit', () => reject(new Error('Recorder failed to start')));
});
policy.provider = recorderInfo.provider;
const recorderUrl = `http://127.0.0.1:${recorderInfo.port}`;
const standardBinary = join(root, '.local', process.platform === 'win32' ? 'bifrost-http-tripwire.exe' : 'bifrost-http-tripwire');
const standardHost = !process.env.TRIPWIRE_BIFROST_BIN && existsSync(standardBinary) && (process.platform !== 'win32' || process.env.TRIPWIRE_ENGINE === 'standard');
const binary = process.env.TRIPWIRE_BIFROST_BIN || (standardHost ? standardBinary : join(root, '.local', process.platform === 'win32' ? 'bifrost-gateway.exe' : 'bifrost-gateway'));
let embedded;
let embeddedUrl;
let gatewayLog;
if (existsSync(binary)) {
  gatewayLog = createWriteStream(join(root, '.local', 'gateway-startup.log'), { flags: 'w' });
  embedded = spawn(binary, [], { env: { ...process.env, TRIPWIRE_PLUGIN_KEY: pluginKey }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  embedded.stderr.pipe(gatewayLog);
  embedded.stdin.end(JSON.stringify({ controlUrl: origin, recorderUrl, recorderKey, sharedKey, pluginPath: process.env.TRIPWIRE_PLUGIN_PATH, dataDir: join(root, '.local', 'standard-host', String(Date.now())) }));
  embeddedUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { embedded.kill(); reject(new Error('Bifrost startup timed out')); }, 90000);
    let output = '';
    embedded.stdout.on('data', (chunk) => {
      gatewayLog.write(chunk);
      output += chunk;
      const ready = /TRIPWIRE_READY:(\d+)/.exec(output);
      if (ready) { clearTimeout(timeout); resolve('http://127.0.0.1:' + ready[1]); }
    });
    embedded.once('error', (error) => { clearTimeout(timeout); reject(error); });
    embedded.once('exit', () => { clearTimeout(timeout); reject(new Error('Embedded Bifrost exited during startup')); });
  });
  policy.engine = standardHost ? (process.env.TRIPWIRE_PLUGIN_PATH ? 'bifrost-http-dynamic' : 'bifrost-http') : 'bifrost-embedded';
}
const production = process.argv.includes('--production');
const vite = production ? null : await createViteServer({ root, configFile: false, server: { middlewareMode: true, host: '127.0.0.1' }, appType: 'spa' });
const staticRoot = join(root, 'dist');
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 16384) throw new Error('Request too large');
  }
  return input ? JSON.parse(input) : {};
}

function operator(req) {
  return req.headers.cookie?.split(';').some((c) => c.trim() === `tripwire_session=${sessionKey}`);
}

async function recorderFetch(path, options = {}) {
  return fetch(recorderUrl + path, {
    ...options, headers: { ...options.headers, authorization: `Bearer ${recorderKey}` },
    signal: AbortSignal.timeout(5000),
  });
}

async function observe(demo, event) {
  const windowEnd = new Date().toISOString();
  try {
    if (scenarios.get(demo) === 'recorder') throw new Error('Recorder unavailable');
    const response = await recorderFetch('/arrivals');
    if (!response.ok) throw new Error('Recorder unavailable');
    const arrivals = await response.json();
    policy.event(demo, 'observation', {
      ...event, type: 'observation', sequence: undefined,
      decisionSequence: event.sequence, outcome: 'verified',
      arrivals: arrivals.filter((a) => a.requestId === event.requestId && a.time >= event.time && a.time <= windowEnd).length,
      windowStart: event.time, windowEnd,
    });
  } catch {
    policy.event(demo, 'observation', { job: event.job, worker: event.worker, decisionSequence: event.sequence, outcome: 'unavailable' });
  }
}

function startWorkers(demo, associations, documents) {
  for (const worker of ['python', 'node']) {
    const child = worker === 'python'
      ? spawn('python', [join(root, 'server/worker.py')], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
      : spawn(process.execPath, [join(root, 'server/worker.js')], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    processes.add(child);
    const workerAssignments = associations.filter((a) => a.worker === worker);
    child.stdin.end(JSON.stringify({ url: origin, sharedKey, assignments: workerAssignments, documents }));
    let failed = false;
    const onFailure = () => {
      if (failed || shuttingDown) return;
      failed = true;
      failedDemos.add(demo);
      policy.event(demo, 'component-error', { component: worker + ' worker', message: 'Worker exited before finishing. Start a new demo to retry.' });
    };
    child.on('error', onFailure);
    child.stderr.on('data', () => { /* Provider and worker output never enters receipts. */ });
    child.on('exit', (code) => {
      processes.delete(child);
      if (code !== 0) onFailure();
      if (processes.size === 0) policy.event(demo, 'demo-finished', { failed: failedDemos.has(demo) });
    });
  }
}

async function route(req, res) {
  const url = new URL(req.url, origin);
  if (!permitsRequest(req, origin, url.pathname)) return json(res, 403, { error: 'Origin rejected' });
  if (url.pathname === '/api/session' && req.method === 'GET') {
    res.setHeader('Set-Cookie', `tripwire_session=${sessionKey}; HttpOnly; SameSite=Strict; Path=/`);
    return json(res, 200, { mode: 'local-enforcement', engine: policy.engine, provider: policy.provider, activeDemo });
  }

  if (url.pathname.startsWith('/api/')) {
    if (!operator(req)) return json(res, 401, { error: 'Operator session required' });
    if (url.pathname === '/api/demo' && req.method === 'POST') {
      const { scenario = 'standard' } = await body(req);
      if (!['standard', 'recorder', 'readonly', 'boot', 'reconnect'].includes(scenario)) return json(res, 400, { error: 'Unknown scenario' });
      if (processes.size) return json(res, 409, { error: 'A demo is still running. Wait for its workers to finish.' });
      if (scenario === 'boot') return json(res, 503, { error: 'Gateway boot failure scenario' });
      const documents = JSON.parse(await readFile(join(root, 'server/documents.json'), 'utf8'));
      const demo = policy.createDemo(scenario);
      activeDemo = demo.demo;
      scenarios.set(demo.demo, scenario);
      for (const association of demo.associations) tokens.set(association.token, { ...association, demo: demo.demo });
      startWorkers(demo.demo, demo.associations, documents);
      return json(res, 201, { demo: demo.demo, runs: demo.runs });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const demo = url.searchParams.get('demo');
      let cursor = Number(req.headers['last-event-id'] || url.searchParams.get('after') || 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) return json(res, 400, { error: 'Invalid cursor' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = () => {
        for (const event of policy.events(demo, cursor)) {
          res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
          cursor = event.sequence;
        }
        res.write(': heartbeat\n\n');
      };
      send();
      const timer = setInterval(send, 400);
      req.on('close', () => clearInterval(timer));
      return;
    }
    if (url.pathname === '/api/history' && req.method === 'GET') {
      const history = policy.db.prepare('SELECT id,job,state,boundary,engine FROM runs ORDER BY rowid DESC LIMIT 20').all();
      return json(res, 200, history.map(({ id, job, state, boundary, engine }) => ({ runId: id, name: 'Job ' + job.toUpperCase(), state, engine, hasReceipt: Boolean(boundary) })));
    }
    const stopMatch = /^\/api\/runs\/([\w-]+)\/stop$/.exec(url.pathname);
    if (stopMatch && req.method === 'POST') {
      const result = policy.stop(stopMatch[1]);
      return json(res, result.status, result.event ?? { error: 'Stop rejected' });
    }
    const receiptMatch = /^\/api\/runs\/([\w-]+)\/receipt$/.exec(url.pathname);
    if (receiptMatch && req.method === 'GET') {
      const receipt = policy.receipt(receiptMatch[1]);
      return json(res, receipt ? 200 : 404, receipt ?? { error: 'Run not found' });
    }
    return json(res, 404, { error: 'Unknown API route' });
  }

  if (url.pathname === '/internal/decision' && req.method === 'POST') {
    if (!pluginKey || !equalSecret(req.headers.authorization, `Bearer ${pluginKey}`)) return json(res, 401, { error: 'Plugin credential required' });
    const input = await body(req);
    const result = policy.decide(input.association, input.requestId);
    if (result.status === 403) {
      if (embeddedUrl) setTimeout(() => observe(result.demo, result.event), 1000);
      else policy.event(result.demo, 'observation', {
        job: result.event.job, worker: result.event.worker,
        decisionSequence: result.event.sequence, outcome: 'unavailable',
      });
    }
    return json(res, result.status, result.event ?? { error: 'Association rejected' });
  }

  if (url.pathname === '/gateway/v1/chat/completions' && req.method === 'POST') {
    if (!equalSecret(req.headers['x-bifrost-vk'], sharedKey)) return json(res, 401, { error: 'Shared credential rejected' });
    const input = await body(req);
    if (embeddedUrl) {
      const upstream = await fetch(embeddedUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bifrost-vk': sharedKey, ...(standardHost ? { 'x-bf-vk': sharedKey } : {}), 'x-tripwire-association': req.headers['x-tripwire-association'] || '', 'x-request-id': req.headers['x-request-id'] || '' },
        body: JSON.stringify(standardHost ? { ...input, provider: 'openai' } : input), signal: AbortSignal.timeout(8000),
      });
      const output = await upstream.json();
      if (!upstream.ok) {
        const detail = JSON.stringify(output.error ?? output).replaceAll(sharedKey, '[credential]').replaceAll(recorderKey, '[credential]').replaceAll(pluginKey, '[credential]');
        gatewayLog?.write('Provider response HTTP ' + upstream.status + ': ' + detail + '\n');
      }
      const row = policy.db.prepare('SELECT event FROM decisions WHERE id=?').get(req.headers['x-request-id']);
      if (upstream.ok && row) {
        const decision = JSON.parse(row.event);
        const association = tokens.get(req.headers['x-tripwire-association']);
        const arrivalsResponse = await recorderFetch('/arrivals');
        const arrival = (await arrivalsResponse.json()).find((a) => a.requestId === decision.requestId);
        if (arrival && scenarios.get(association.demo) !== 'recorder') policy.event(association.demo, 'arrival', { ...decision, type: 'arrival', sequence: undefined, time: arrival.time, admissionSequence: decision.sequence });
        policy.event(association.demo, 'request-completed', { job: decision.job, worker: decision.worker, requestId: decision.requestId });
      }
      return json(res, upstream.status, output);
    }
    const result = policy.decide(req.headers['x-tripwire-association'], req.headers['x-request-id']);
    if (result.status !== 200) {
      if (result.status === 403) setTimeout(() => observe(result.demo, result.event), 1000);
      return json(res, result.status, result.event ?? { error: 'Association rejected' });
    }
    try {
      const response = await recorderFetch('/model', { method: 'POST', headers: { 'x-request-id': result.event.requestId } });
      const arrivalsResponse = await recorderFetch('/arrivals');
      const arrivals = await arrivalsResponse.json();
      const arrival = arrivals.find((a) => a.requestId === result.event.requestId);
      if (arrival && scenarios.get(result.demo) !== 'recorder') policy.event(result.demo, 'arrival', { ...result.event, type: 'arrival', sequence: undefined, time: arrival.time, admissionSequence: result.event.sequence });
      const answer = await response.json();
      policy.event(result.demo, 'request-completed', { job: result.event.job, worker: result.event.worker, requestId: result.event.requestId });
      return json(res, response.status, answer);
    } catch {
      policy.event(result.demo, 'component-error', { component: 'Upstream recorder', message: 'Upstream request failed.' });
      return json(res, 502, { error: 'Upstream recorder unavailable' });
    }
  }

  if (url.pathname === '/worker/finished' && req.method === 'POST') {
    const association = tokens.get(req.headers['x-tripwire-association']);
    if (!association || !equalSecret(req.headers['x-bifrost-vk'], sharedKey)) return json(res, 401, {});
    const complete = finished.get(association.run) ?? new Set();
    complete.add(association.worker);
    finished.set(association.run, complete);
    if (complete.size === 2) policy.complete(association.run);
    return json(res, 200, {});
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, {});
  if (vite) return vite.middlewares(req, res, () => json(res, 404, {}));
  const file = resolve(staticRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(staticRoot + sep)) return json(res, 404, {});
  try {
    const contents = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
      'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch {
    json(res, 404, { error: 'Static asset unavailable. Build the UI before starting production mode.' });
  }
}

const server = createServer((req, res) => {
  route(req, res).catch(() => {
    if (!res.headersSent) json(res, 400, { error: 'Request failed' });
    else res.end();
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Tripwire local enforcement ready at ${origin}`));
function shutdown() {
  shuttingDown = true;
  for (const child of processes) child.kill();
  if (recorder.connected) recorder.send({ type: 'shutdown' });
  else recorder.kill();
  embedded?.kill();
  server.close();
  vite?.close();
  setTimeout(() => process.exit(), 500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
