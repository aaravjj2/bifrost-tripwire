import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { equalSecret } from './policy.js';

const arrivals = [];
const key = process.env.TRIPWIRE_RECORDER_KEY;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modelBinary = join(root, '.local', 'llama', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
const modelFile = join(root, '.local', 'models', 'SmolLM2-135M-Instruct-Q3_K_M.gguf');
const useModel = process.env.TRIPWIRE_PROVIDER !== 'fixture' && existsSync(modelBinary) && existsSync(modelFile);
let model;
const modelUrl = 'http://127.0.0.1:' + (process.env.TRIPWIRE_MODEL_PORT || '4188');
if (useModel) {
  const modelLog = createWriteStream(join(root, '.local', 'model-' + new URL(modelUrl).port + '.log'), { flags: 'w' });
  model = spawn(modelBinary, ['-m', modelFile, '--host', '127.0.0.1', '--port', new URL(modelUrl).port, '-c', '1024', '-np', '2', '-t', '4', '-n', '8', '--alias', 'local/document-step', '--no-webui'], {
    env: { ...process.env, LLAMA_API_KEY: key },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  for (const output of [model.stdout, model.stderr]) output.on('data', (chunk) => modelLog.write(String(chunk).replaceAll(key, '[credential]')));
  let failed = false;
  model.once('error', () => { failed = true; });
  model.once('exit', () => { failed = true; });
  let ready = false;
  let lastStatus = 'not listening';
  for (let attempt = 0; attempt < 120 && !failed; attempt++) {
    try {
      const response = await fetch(modelUrl + '/v1/models', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(1000) });
      lastStatus = response.status;
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the model to load. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) { model.kill(); throw new Error('Local model could not start, last health status ' + lastStatus); }
}
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!equalSecret(req.headers.authorization, `Bearer ${key}`)) {
    res.writeHead(401).end('{}');
    return;
  }
  if (req.url === '/health') return res.end('{}');
  if (req.url === '/arrivals') return res.end(JSON.stringify(arrivals));
  if (['/model', '/chat/completions', '/v1/chat/completions'].includes(req.url) && req.method === 'POST') {
    const requestId = req.headers['x-request-id'];
    arrivals.push({ requestId, time: new Date().toISOString() });
    if (useModel) {
      try {
        let input = '';
        for await (const chunk of req) {
          input += chunk;
          if (input.length > 16384) throw new Error('Request too large');
        }
        const payload = JSON.parse(input);
        payload.max_tokens = 8;
        payload.temperature = 0;
        payload.stream = false;
        const response = await fetch(modelUrl + '/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
        });
        res.writeHead(response.status);
        res.end(await response.text());
      } catch { res.writeHead(502).end('{"error":"Local model unavailable"}'); }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    res.end(JSON.stringify({ id: requestId, created: Math.floor(Date.now()/1000), model: 'local/document-step', object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Local document step completed.' } }], usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 } }));
    return;
  }
  res.writeHead(404).end('{}');
});
server.listen(0, '127.0.0.1', () => {
  process.send?.({ port: server.address().port, provider: useModel ? 'smollm2-local' : 'local-fixture' });
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  model?.kill();
  server.closeAllConnections();
  server.close();
  if (process.connected) process.disconnect();
}
process.on('message', (message) => { if (message.type === 'shutdown') shutdown(); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('disconnect', shutdown);
