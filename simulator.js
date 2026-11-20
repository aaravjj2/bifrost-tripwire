export const workers = [
  { id: 'python', name: 'Python worker' },
  { id: 'node', name: 'Node worker' },
];

export const jobs = [
  { id: 'a', name: 'Job A', description: 'Document indexing with retries' },
  { id: 'b', name: 'Job B', description: 'Document summarization' },
];

export function createSimulator(scenario, receive) {
  const sessionId = crypto.randomUUID().slice(0, 8);
  const timers = new Set();
  const missed = [];
  const recordedArrivals = [];
  const runs = jobs.map((job) => ({
    ...job,
    runId: `run-${sessionId}-${job.id}`,
    canStop: scenario !== 'readonly',
  }));
  let sequence = 0;
  let requestCount = 0;
  let disconnected = false;
  let stopRequested = false;
  let boundary;
  let aFinished = false;

  function after(ms, callback) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, ms);
    timers.add(timer);
  }

  function publish(type, fields = {}) {
    const event = { type, sequence: ++sequence, time: new Date().toISOString(), ...fields };
    if (disconnected) missed.push(event);
    else receive(event);
    return event;
  }

  function signal(type, fields = {}) {
    receive({ type, ...fields });
  }

  function attempt(job, worker) {
    const number = ++requestCount;
    const identity = {
      job,
      worker,
      requestId: `gw-${sessionId}-${number}`,
      correlationId: `req-${sessionId}-${number}`,
    };

    if (job === 'a' && boundary) {
      const denial = publish('denied', { ...identity, reason: 'Run stop policy', boundarySequence: boundary.sequence });
      after(1050, () => {
        const windowEnd = new Date().toISOString();
        const matches = recordedArrivals.filter((arrival) =>
          arrival.correlationId === denial.correlationId && arrival.time >= denial.time && arrival.time <= windowEnd,
        );
        publish('observation', {
          ...identity,
          decisionSequence: denial.sequence,
          outcome: scenario === 'recorder' ? 'unavailable' : 'verified',
          ...(scenario === 'recorder' ? {} : { arrivals: matches.length, windowStart: denial.time, windowEnd }),
        });
      });
      return;
    }

    const admission = publish('admitted', identity);
    if (scenario !== 'recorder') {
      after(140, () => {
        recordedArrivals.push(publish('arrival', { ...identity, admissionSequence: admission.sequence }));
      });
    }
    after(1250, () => publish('request-completed', identity));
  }

  function retryA(worker, remaining) {
    if (stopRequested || aFinished) return;
    attempt('a', worker);
    if (remaining > 1) after(3400, () => retryA(worker, remaining - 1));
  }

  function start() {
    after(540, () => {
      if (scenario === 'boot') {
        signal('boot-failed');
        return;
      }
      publish('registered', { runs });
      after(240, () => retryA('python', 11));
      after(630, () => retryA('node', 11));
      after(500, () => attempt('b', 'python'));
      after(940, () => attempt('b', 'node'));
      after(8200, () => attempt('b', 'python'));
      after(16200, () => attempt('b', 'node'));
      after(17600, () => publish('run-completed', { job: 'b' }));
      after(36200, () => {
        if (stopRequested) return;
        aFinished = true;
        publish('run-completed', { job: 'a' });
      });
    });
  }

  function stop(job) {
    if (job !== 'a' || stopRequested || aFinished || scenario === 'readonly') return;
    stopRequested = true;
    signal('stop-pending');
    if (scenario === 'reconnect') {
      after(520, () => {
        disconnected = true;
        signal('stop-unknown');
      });
      after(3700, () => {
        disconnected = false;
        for (const event of missed.splice(0)) receive(event, { replayed: true });
        signal('reconnected');
      });
    }
    after(880, () => {
      boundary = publish('stop-committed', { job, operator: 'Demo operator', policyVersion: 'tripwire-demo/v1' });
      after(410, () => attempt('a', 'python'));
      after(920, () => attempt('a', 'node'));
    });
  }

  function dispose() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  return { start, stop, dispose };
}
