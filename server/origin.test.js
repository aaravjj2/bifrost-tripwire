import test from 'node:test';
import assert from 'node:assert/strict';
import { permitsRequest } from './origin.js';
const origin = 'http://127.0.0.1:4177';

test('a link from another site can open the public UI but cannot read a session', () => {
  const request = { method: 'GET', headers: { 'sec-fetch-site': 'cross-site' } };
  assert.equal(permitsRequest(request, origin, '/'), true);
  assert.equal(permitsRequest(request, origin, '/assets/app.js'), true);
  assert.equal(permitsRequest(request, origin, '/api/session'), false);
});
test('stop mutations require the expected browser origin', () => {
  assert.equal(permitsRequest({ method: 'POST', headers: { origin: 'https://other.example' } }, origin, '/api/runs/a/stop'), false);
  assert.equal(permitsRequest({ method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin' } }, origin, '/api/runs/a/stop'), true);
  assert.equal(permitsRequest({ method: 'POST', headers: { origin, 'sec-fetch-site': 'cross-site' } }, origin, '/api/runs/a/stop'), false);
});
test('loopback workers and command-line verification can use their authenticated routes', () => {
  assert.equal(permitsRequest({ method: 'POST', headers: {} }, origin, '/gateway/v1/chat/completions'), true);
});
