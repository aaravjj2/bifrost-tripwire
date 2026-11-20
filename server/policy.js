import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const hash = (value) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function equalSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class Policy {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, demo TEXT, job TEXT, state TEXT, writable INTEGER, boundary TEXT);
      CREATE TABLE IF NOT EXISTS associations (token TEXT PRIMARY KEY, run TEXT, worker TEXT, expires INTEGER);
      CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, event TEXT);
      CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, demo TEXT, event TEXT);
      UPDATE runs SET state='expired' WHERE state='active';
    `);
    if (!this.db.prepare('PRAGMA table_info(runs)').all().some((column) => column.name === 'engine')) {
      this.db.exec("ALTER TABLE runs ADD COLUMN engine TEXT NOT NULL DEFAULT 'node-reference'");
    }
    if (!this.db.prepare('PRAGMA table_info(runs)').all().some((column) => column.name === 'provider')) {
      this.db.exec("ALTER TABLE runs ADD COLUMN provider TEXT NOT NULL DEFAULT 'local-fixture'");
    }
    this.engine = 'node-reference';
    this.provider = 'local-fixture';
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  event(demo, type, fields = {}) {
    const event = { type, time: new Date().toISOString(), ...fields };
    const result = this.db.prepare('INSERT INTO events (demo,event) VALUES (?,?)').run(demo, JSON.stringify(event));
    event.sequence = Number(result.lastInsertRowid);
    return event;
  }

  createDemo(scenario) {
    return this.transaction(() => {
      const demo = randomUUID();
      const associations = [];
      const runs = ['a', 'b'].map((job) => {
        const run = {
          id: job, runId: `run-${randomUUID()}`,
          name: `Job ${job.toUpperCase()}`,
          description: job === 'a' ? 'Document indexing with retries' : 'Document summarization',
          canStop: scenario !== 'readonly',
        };
        this.db.prepare('INSERT INTO runs (id,demo,job,state,writable,boundary,engine,provider) VALUES (?,?,?,?,?,NULL,?,?)').run(run.runId, demo, job, 'active', Number(run.canStop), this.engine, this.provider);
        for (const worker of ['python', 'node']) {
          const token = secret();
          this.db.prepare('INSERT INTO associations VALUES (?,?,?,?)').run(hash(token), run.runId, worker, Date.now() + 180000);
          associations.push({ run: run.runId, job, worker, token });
        }
        return run;
      });
      this.event(demo, 'registered', { runs, engine: this.engine, provider: this.provider });
      return { demo, runs, associations };
    });
  }

  decide(token, requestId) {
    if (typeof token !== 'string' || typeof requestId !== 'string' || !/^[\w-]{1,100}$/.test(requestId)) return { status: 401 };
    return this.transaction(() => {
      const association = this.db.prepare('SELECT a.*,r.demo,r.job,r.state,r.boundary FROM associations a JOIN runs r ON r.id=a.run WHERE token=?').get(hash(token));
      if (!association || association.expires < Date.now() || association.state === 'expired') return { status: 401 };
      const previous = this.db.prepare('SELECT event FROM decisions WHERE id=?').get(requestId);
      if (previous) {
        const event = JSON.parse(previous.event);
        if (event.runId !== association.run || event.worker !== association.worker) return { status: 409 };
        // Replays never forward a request again.
        return { status: 409, event, duplicate: true };
      }
      const denied = association.state !== 'active';
      const admissions = this.db.prepare("SELECT COUNT(*) AS count FROM decisions WHERE json_extract(event,'$.type')='admitted' AND json_extract(event,'$.runId') IN (SELECT id FROM runs WHERE demo=?)").get(association.demo).count;
      if (!denied && admissions >= 60) return { status: 429 };
      const event = this.event(association.demo, denied ? 'denied' : 'admitted', {
        runId: association.run, job: association.job, worker: association.worker,
        requestId, correlationId: requestId,
        ...(denied ? { reason: association.state === 'stopped' ? 'Run stop policy' : 'Run completed', boundarySequence: JSON.parse(association.boundary ?? '{}').sequence } : {}),
      });
      this.db.prepare('INSERT INTO decisions VALUES (?,?)').run(requestId, JSON.stringify(event));
      return { status: denied ? 403 : 200, event, demo: association.demo };
    });
  }

  stop(runId) {
    return this.transaction(() => {
      const run = this.db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
      if (!run) return { status: 404 };
      if (!run.writable) return { status: 403 };
      if (run.boundary) return { status: 200, event: JSON.parse(run.boundary) };
      if (run.state !== 'active') return { status: 409 };
      const event = this.event(run.demo, 'stop-committed', { job: run.job, runId, operator: 'Local operator', policyVersion: 'tripwire-local/v1' });
      this.db.prepare("UPDATE runs SET state='stopped',boundary=? WHERE id=?").run(JSON.stringify(event), runId);
      return { status: 200, event };
    });
  }

  complete(runId) {
    const run = this.db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
    if (run?.state !== 'active') return;
    this.db.prepare("UPDATE runs SET state='completed' WHERE id=?").run(runId);
    this.event(run.demo, 'run-completed', { job: run.job, runId });
  }

  events(demo, cursor = 0) {
    return this.db.prepare('SELECT * FROM events WHERE demo=? AND sequence>? ORDER BY sequence').all(demo, cursor)
      .map((row) => ({ ...JSON.parse(row.event), sequence: row.sequence }));
  }

  receipt(runId) {
    const run = this.db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
    if (!run) return null;
    const events = this.events(run.demo);
    const denials = events.filter((e) => e.runId === runId && e.type === 'denied').map((denial) => {
      const observation = events.find((e) => e.type === 'observation' && e.decisionSequence === denial.sequence);
      return { ...denial, gatewayRequestId: denial.requestId, upstream: observation ?? { outcome: 'pending' } };
    });
    const boundary = run.boundary ? JSON.parse(run.boundary) : null;
    const continuation = events.filter((e) => boundary && e.sequence > boundary.sequence && e.job === 'b' && ['arrival', 'run-completed'].includes(e.type));
    const evidenceComplete = denials.length === 2 && new Set(denials.map((e) => e.worker)).size === 2 && denials.every((e) => e.upstream.outcome === 'verified' && e.upstream.arrivals === 0);
    const continued = continuation.some((e) => e.type === 'arrival');
    const completed = continuation.some((e) => e.type === 'run-completed');
    return {
      schemaVersion: 1, mode: 'local-enforcement', engine: run.engine, provider: run.provider,
      ...(run.engine.startsWith('bifrost-') ? { gatewayRevision: '3efed2f7995f4f8c12005cda0d773cc6f8a3b60b' } : {}),
      runId, operator: 'Local operator', policyVersion: 'tripwire-local/v1',
      workers: ['Python worker', 'Node worker'],
      boundary,
      evidenceStatus: evidenceComplete ? 'complete' : 'incomplete',
      trialStatus: evidenceComplete && continued && completed ? run.provider === 'smollm2-local' ? 'passed-local-model' : 'passed-local-fixture' : 'incomplete',
      counts: {
        postStopDenials: denials.length,
        measuredDeniedArrivals: evidenceComplete ? denials.reduce((sum, e) => sum + e.upstream.arrivals, 0) : null,
        jobBPostStopArrivals: continuation.filter((e) => e.type === 'arrival').length,
        jobBCompleted: completed,
      },
      denials,
      continuation,
    };
  }
}
