import test from 'node:test';
import assert from 'node:assert/strict';
import { Policy } from './policy.js';

test('admission, stop boundary, repeat stop, and run isolation', () => {
  const policy = new Policy(':memory:');
  const demo = policy.createDemo('standard');
  const a = demo.associations.filter((a) => a.job === 'a');
  const b = demo.associations.find((a) => a.job === 'b');
  const admitted = policy.decide(a[0].token, 'before');
  assert.equal(admitted.status, 200);
  const stopped = policy.stop(a[0].run);
  assert.equal(stopped.status, 200);
  assert.deepEqual(policy.stop(a[0].run), stopped);
  for (const association of a) {
    const denial = policy.decide(association.token, association.worker);
    assert.equal(denial.status, 403);
    assert.ok(denial.event.sequence > stopped.event.sequence);
    assert.equal(denial.event.boundarySequence, stopped.event.sequence);
  }
  assert.equal(policy.decide(b.token, 'other-run').status, 200);
  assert.equal(policy.decide(a[0].token, 'before').status, 409);
  assert.equal(policy.decide('invalid', 'missing').status, 401);
  policy.db.close();
});

test('authorization, expiry, receipt incompleteness, and completed states', () => {
  const policy = new Policy(':memory:');
  const readonly = policy.createDemo('readonly');
  assert.equal(policy.stop(readonly.runs[0].runId).status, 403);
  const demo = policy.createDemo('standard');
  const token = demo.associations[0];
  policy.db.prepare('UPDATE associations SET expires=0 WHERE run=?').run(token.run);
  assert.equal(policy.decide(token.token, 'expired').status, 401);
  policy.complete(demo.runs[1].runId);
  assert.equal(policy.stop(demo.runs[1].runId).status, 409);
  assert.equal(policy.receipt(token.run).evidenceStatus, 'incomplete');
  policy.db.close();
});

test('a passing receipt requires two measured denials and B completing after stop', () => {
  const policy = new Policy(':memory:');
  const demo = policy.createDemo('standard');
  const run = demo.runs[0];
  policy.stop(run.runId);
  for (const a of demo.associations.filter((a) => a.job === 'a')) {
    const { event } = policy.decide(a.token, a.worker);
    policy.event(demo.demo, 'observation', { decisionSequence: event.sequence, outcome: 'verified', arrivals: 0 });
  }
  assert.equal(policy.receipt(run.runId).trialStatus, 'incomplete');
  policy.event(demo.demo, 'arrival', { job: 'b', requestId: 'later-b' });
  assert.equal(policy.receipt(run.runId).trialStatus, 'incomplete');
  policy.complete(demo.runs[1].runId);
  const receipt = policy.receipt(run.runId);
  assert.equal(receipt.trialStatus, 'passed-local-fixture');
  assert.deepEqual(receipt.counts, { postStopDenials: 2, measuredDeniedArrivals: 0, jobBPostStopArrivals: 1, jobBCompleted: true });
  policy.db.close();
});

test('the request ceiling limits upstream admissions independently of worker behavior', () => {
  const policy = new Policy(':memory:');
  const demo = policy.createDemo('standard');
  const token = demo.associations[0].token;
  for (let index = 0; index < 60; index++) {
    assert.equal(policy.decide(token, 'ceiling-' + index).status, 200);
  }
  assert.equal(policy.decide(token, 'ceiling-overflow').status, 429);
  policy.stop(demo.runs[0].runId);
  assert.equal(policy.decide(token, 'denied-after-ceiling').status, 403);
  policy.db.close();
});
