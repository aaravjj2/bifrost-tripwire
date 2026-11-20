import { createSimulator, jobs, workers } from './simulator.js';
import { createIntro } from './intro.js';
import { createRemote } from './remote.js';

const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((element) => [element.id, element]),
);
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const rows = new Map();
const cells = new Map();
const activity = [];
const observations = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let simulator;
let boundary;
let selected;
let receiptUrl;
let lastSequence = 0;
let localEnforcement = false;
let embeddedBifrost = false;
let localModel = false;
let gatewayEngine = 'simulation';
let enteringConsole = false;
const intro = createIntro({
  canvas: elements['intro-canvas'],
  controls: elements['intro-controls'],
  toggle: elements['intro-toggle'],
  skip: elements['intro-skip'],
  caption: elements['scene-caption'],
});

function icon(name) {
  const image = new Image(17, 17);
  image.className = 'icon';
  image.src = new URL(`./assets/${name}.svg`, import.meta.url).href;
  image.alt = '';
  return image;
}

function setConnection(state, label) {
  elements.connection.dataset.state = state;
  elements.connection.textContent = label;
}

function formatTime(time) {
  return timeFormat.format(new Date(time));
}

function tell(message) {
  elements.announcement.textContent = message;
}

function setStart(label, busy = false) {
  elements.start.lastElementChild.textContent = label;
  elements.start.setAttribute('aria-disabled', String(busy));
  elements.execution.disabled = busy;
  elements.scenario.disabled = busy;
}

function setEmpty(title, detail, isError = false) {
  elements.empty.hidden = false;
  elements['empty-title'].textContent = title;
  elements['empty-detail'].textContent = detail;
  elements.empty.dataset.state = isError ? 'error' : 'idle';
}

function matrixRow(className, html) {
  const row = document.createElement('div');
  row.className = `matrix-row ${className}`;
  row.setAttribute('role', 'row');
  row.innerHTML = html;
  elements.matrix.append(row);
  return row;
}

function setupRuns(runs) {
  rows.clear();
  cells.clear();
  observations.clear();
  activity.length = 0;
  boundary = undefined;
  elements.matrix.replaceChildren();
  elements['activity-list'].replaceChildren();
  elements['activity-count'].textContent = '';
  elements['component-error'].hidden = true;
  elements.empty.hidden = true;
  elements.key.hidden = false;
  elements.key.firstElementChild.textContent = localEnforcement ? 'Shared gateway credential' : 'Shared virtual key';
  elements.matrix.hidden = false;
  elements.permission.hidden = runs.some((run) => run.canStop);
  matrixRow('matrix-head', `
    <div class="matrix-column" role="columnheader">Run / outcome</div>
    ${workers.map(({ name }) => `<div class="matrix-column" role="columnheader">${name}</div>`).join('')}
  `);

  for (const run of runs) {
    const row = matrixRow('', `
      <div class="run" role="rowheader">
        <h4></h4><code></code><p class="run-description"></p>
        <p class="state" tabindex="-1"></p>
        <div class="boundary" hidden><strong>Stop boundary</strong><code></code></div>
        <button class="button stop" type="button" hidden></button>
      </div>
      ${workers.map(({ id, name }) => `
        <div class="worker-cell" role="cell" data-worker="${id}">
          <span class="worker-mobile" aria-hidden="true">${name}</span>
          <p class="event-status"></p><p class="event-detail" hidden></p>
          <dl class="counts" aria-label="Request counts">
            <div><dt>Admitted</dt><dd></dd></div>
            <div><dt>Denied</dt><dd></dd></div>
            <div><dt>Completed</dt><dd></dd></div>
          </dl>
          <p class="event-detail outstanding" hidden></p>
          <button class="evidence-trigger" type="button" aria-haspopup="dialog" aria-controls="evidence" aria-expanded="false" hidden>View denial evidence</button>
        </div>
      `).join('')}
    `);
    row.querySelector('h4').textContent = run.name;
    row.querySelector('code').textContent = run.runId;
    row.querySelector('.run-description').textContent = run.description;
    const stop = row.querySelector('.stop');
    stop.addEventListener('click', () => simulator.stop(run.id));
    rows.set(run.id, { run, row, stop, status: 'active' });
    renderRun(run.id);

    for (const worker of workers) {
      const element = row.querySelector(`[data-worker="${worker.id}"]`);
      const trigger = element.querySelector('.evidence-trigger');
      const cell = { element, trigger, requests: new Map(), latest: null, denial: null };
      cells.set(`${run.id}/${worker.id}`, cell);
      trigger.setAttribute('aria-label', `View denial evidence for ${worker.name}`);
      trigger.addEventListener('click', () => openEvidence(cell.denial, trigger));
      renderWorker(cell);
    }
  }
  setConnection('connected', localEnforcement && embeddedBifrost ? 'Bifrost connected' : 'Gateway connected');
  setStart(localEnforcement ? 'Demo running' : 'Start new demo', localEnforcement);
  tell(localEnforcement ? 'Python and Node worker processes started.' : 'Two simulated runs started.');
}

function renderRun(job) {
  const { run, row, stop, status } = rows.get(job);
  const label = row.querySelector('.state');
  const labels = {
    active: job === 'a' ? 'Running with retries' : 'Running',
    pending: 'Stopping',
    unknown: 'Stop outcome unknown',
    stopped: 'Future calls blocked',
    completed: 'Completed',
  };
  label.className = `state ${status}`;
  label.textContent = labels[status];
  const showStop = run.canStop && job === 'a' && ['active', 'pending', 'unknown'].includes(status);
  if (!showStop && document.activeElement === stop) label.focus();
  stop.hidden = !showStop;
  if (showStop) {
    stop.replaceChildren(icon(status === 'active' ? 'octagon-x' : 'loader-circle'), status === 'active' ? 'Stop Job A' : status === 'pending' ? 'Stopping' : 'Awaiting reconnection');
    stop.setAttribute('aria-disabled', String(status !== 'active'));
  }
  if (status === 'stopped') {
    const rule = row.querySelector('.boundary');
    rule.querySelector('code').textContent = `${formatTime(boundary.time)} / #${boundary.sequence}`;
    rule.hidden = false;
  }
}

function renderWorker(cell) {
  const { element, latest, requests, denial, trigger } = cell;
  const requestList = [...requests.values()];
  const denied = requestList.filter((request) => request.type === 'denied').length;
  const completed = requestList.filter((request) => request.completed).length;
  const counts = element.querySelectorAll('.counts dd');
  [requestList.length - denied, denied, completed].forEach((count, index) => {
    counts[index].textContent = count;
  });

  const status = element.querySelector('.event-status');
  const detail = element.querySelector('.event-detail');
  status.className = 'event-status';
  if (!latest) {
    status.textContent = 'Awaiting requests';
  } else if (denial) {
    status.classList.add('denied');
    status.replaceChildren(icon('octagon-x'), localEnforcement && !embeddedBifrost ? 'Denied by gateway' : 'Denied by Bifrost');
  } else if (latest.type === 'request-completed') {
    status.classList.add('completed');
    status.replaceChildren(icon('circle-check'), 'Call completed');
  } else {
    status.replaceChildren(icon('loader-circle'), 'Call admitted');
  }
  const postStopArrival = boundary && requestList.some((request) => request.arrival?.sequence > boundary.sequence && request.sequence > boundary.sequence);
  detail.hidden = !latest;
  detail.classList.toggle('post-stop', Boolean(postStopArrival && !denial));
  detail.textContent = denial?.requestId ?? (postStopArrival ? 'Upstream call after stop' : latest?.requestId ?? '');
  trigger.hidden = !denial;
  const outstanding = element.querySelector('.outstanding');
  const pending = denial || latest?.job === 'a'
    ? requestList.filter((request) => boundary && request.type === 'admitted' && !request.completed && request.sequence < boundary.sequence).length
    : 0;
  outstanding.hidden = !pending;
  outstanding.textContent = `${pending} outstanding before stop`;
}

function flash(cell, isDenial) {
  cell.element.getAnimations().forEach((animation) => animation.cancel());
  if (reducedMotion.matches) return;
  cell.element.animate([
    { backgroundColor: isDenial ? '#fceef0' : '#e9f5ef' },
    { backgroundColor: 'transparent' },
  ], { duration: 160, easing: 'ease-out' });
}

function record(event, message) {
  activity.unshift({ event, message });
  if (activity.length > 7) activity.pop();
  elements['activity-empty'].hidden = true;
  elements['activity-count'].textContent = `Latest ${activity.length}`;
  elements['activity-list'].replaceChildren(...activity.map(({ event, message }) => {
    const item = document.createElement('li');
    const time = document.createElement('time');
    const summary = document.createElement('span');
    const meta = document.createElement('code');
    item.dataset.type = event.type;
    time.dateTime = event.time;
    time.className = 'timestamp';
    time.textContent = formatTime(event.time);
    summary.textContent = message;
    meta.className = 'muted';
    meta.textContent = `#${event.sequence}`;
    item.append(time, summary, meta);
    return item;
  }));
}

function receive(event, { replayed = false } = {}) {
  if (event.sequence) {
    if (event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    elements['last-event'].textContent = `Last event ${formatTime(event.time)}`;
  }

  switch (event.type) {
    case 'boot-failed':
      if (rows.size) {
        elements['component-error'].hidden = false;
        elements['component-error'].textContent = event.message || 'The new demo failed to start.';
        setConnection('connected', 'Gateway connected');
        setStart('Start new demo');
        return;
      }
      setConnection('unavailable', 'Gateway unavailable');
      setEmpty('Gateway failed to start', event.message || 'Choose another scenario and retry the demo.', true);
      setStart('Retry demo');
      tell('The simulated Bifrost gateway failed to start.');
      return;
    case 'registered':
      setupRuns(event.runs);
      record(event, localEnforcement ? 'Job A and Job B registered with the shared gateway credential.' : 'Job A and Job B registered with the shared virtual key.');
      return;
    case 'stop-pending':
    case 'stop-unknown':
      if (['stopped', 'completed'].includes(rows.get('a')?.status)) return;
      rows.get('a').status = event.type === 'stop-pending' ? 'pending' : 'unknown';
      renderRun('a');
      if (event.type === 'stop-unknown') setConnection('reconnecting', 'Reconnecting');
      tell(event.type === 'stop-pending' ? 'Stopping Job A.' : 'Stop outcome unknown. Reconnecting to the gateway.');
      return;
    case 'reconnected':
      setConnection('connected', 'Gateway connected');
      tell('Gateway reconnected. Missed events restored.');
      return;
    case 'disconnected':
      setConnection('reconnecting', 'Reconnecting');
      return;
    case 'component-error':
      elements['component-error'].hidden = false;
      elements['component-error'].textContent = event.component + '. ' + event.message;
      if (localEnforcement) setStart('Retry demo');
      return;
    case 'stop-committed':
      boundary = event;
      rows.get(event.job).status = 'stopped';
      renderRun(event.job);
      for (const cell of cells.values()) renderWorker(cell);
      record(event, 'Stop committed for Job A. Future calls are blocked.');
      if (!replayed) tell('Job A stopped. Future calls are blocked.');
      return;
    case 'run-completed':
      rows.get(event.job).status = 'completed';
      renderRun(event.job);
      record(event, `${rows.get(event.job).run.name} completed.`);
      if (!replayed) tell(`${rows.get(event.job).run.name} completed.`);
      if (selected) renderEvidence();
      return;
    case 'demo-finished':
      if (localEnforcement) setStart(event.failed ? 'Retry demo' : 'Start new demo');
      return;
    case 'observation':
      observations.set(event.decisionSequence, event);
      if (selected) renderEvidence();
      return;
    default:
      updateRequest(event, replayed);
  }
}

function updateRequest(event, replayed) {
  const cell = cells.get(`${event.job}/${event.worker}`);
  const worker = workers.find(({ id }) => id === event.worker);
  const job = rows.get(event.job).run.name;
  const request = cell.requests.get(event.requestId);

  switch (event.type) {
    case 'admitted':
      cell.requests.set(event.requestId, { ...event });
      cell.latest = event;
      record(event, `${job} · ${worker.name} · Call admitted`);
      break;
    case 'denied':
      cell.requests.set(event.requestId, event);
      cell.latest = event;
      cell.denial = event;
      record(event, `${job} · ${worker.name} · ${localEnforcement && !embeddedBifrost ? 'Denied by gateway' : 'Denied by Bifrost'}`);
      if (!replayed) tell(`${worker.name}. Job A denied by ${localEnforcement ? 'the gateway' : 'Bifrost'}.`);
      if (selected) renderEvidence();
      break;
    case 'arrival':
      request.arrival = event;
      if (boundary && request.sequence > boundary.sequence) {
        record(event, `${job} · ${worker.name} · Upstream call after stop`);
      }
      break;
    case 'request-completed':
      request.completed = true;
      if (cell.latest?.requestId === event.requestId) cell.latest = event;
      break;
    default:
      return;
  }
  renderWorker(cell);
  if (!replayed && ['denied', 'request-completed'].includes(event.type)) flash(cell, event.type === 'denied');
}

function evidenceSection(heading, entries, message) {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  const list = document.createElement('dl');
  section.className = 'drawer-section';
  title.textContent = heading;
  section.append(title, list);

  for (const [label, value] of entries) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }
  if (message) {
    const note = document.createElement('p');
    note.className = 'receipt-incomplete';
    note.textContent = message;
    section.append(note);
  }
  return section;
}

function makeReceipt(run) {
  const denials = workers.flatMap(({ id, name }) => {
    const event = cells.get(`${run.id}/${id}`).denial;
    if (!event) return [];
    const observation = observations.get(event.sequence);
    return [{
      worker: name,
      gatewayRequestId: event.requestId,
      correlationId: event.correlationId,
      sequence: event.sequence,
      time: event.time,
      reason: event.reason,
      upstream: observation?.outcome === 'verified'
        ? { status: 'verified', arrivals: observation.arrivals, windowStart: observation.windowStart, windowEnd: observation.windowEnd }
        : { status: observation?.outcome ?? 'pending' },
    }];
  });
  return {
    schemaVersion: 1,
    mode: localEnforcement ? 'local-enforcement' : 'simulation',
    provider: localEnforcement && localModel ? 'smollm2-local' : 'local-fixture',
    engine: localEnforcement ? gatewayEngine : 'simulation',
    runId: run.runId,
    workers: workers.map(({ name }) => name),
    operator: boundary.operator,
    policyVersion: boundary.policyVersion,
    boundary: { time: boundary.time, sequence: boundary.sequence },
    evidenceStatus: denials.length === workers.length && denials.every(({ upstream }) => upstream.status === 'verified') ? 'complete' : 'incomplete',
    denials,
  };
}

function renderEvidence() {
  const { event } = selected;
  const { run } = rows.get(event.job);
  const worker = workers.find(({ id }) => id === event.worker);
  const observation = observations.get(event.sequence);
  const observationStatus = { verified: localEnforcement ? 'Verified (local recorder)' : 'Verified (simulation)', unavailable: 'Unavailable', pending: 'Pending' }[observation?.outcome ?? 'pending'];
  const decision = evidenceSection('Gateway decision', [
    ['Decision', localEnforcement && !embeddedBifrost ? 'Denied by local gateway' : 'Denied by Bifrost'],
    ['Engine', localEnforcement ? gatewayEngine : 'Simulation'],
    ['Model', localEnforcement && localModel ? 'SmolLM2, local CPU' : localEnforcement ? 'Local fixture' : 'Simulated'],
    ['Worker', worker.name],
    ['Run ID', run.runId],
    ['Gateway request ID', event.requestId],
    ['Correlation ID', event.correlationId],
    ['Reason', event.reason],
    ['Stop boundary', `#${boundary.sequence} · ${boundary.time}`],
    ['Denial sequence', `#${event.sequence}`],
  ]);
  const upstreamFields = [['Recorder status', observationStatus]];
  if (observation?.outcome === 'verified') {
    upstreamFields.push(['Matching arrivals', observation.arrivals], ['Window opened', observation.windowStart], ['Window closed', observation.windowEnd]);
  }
  const receipt = makeReceipt(run);
  const upstream = evidenceSection('Upstream observation', upstreamFields, receipt.evidenceStatus === 'incomplete' ? 'Run receipt evidence is incomplete.' : '');
  elements['evidence-context'].textContent = `${run.name} / ${worker.name} / ${localEnforcement ? 'Local enforcement' : 'Simulation'}`;
  const sections = [decision, upstream];
  if (localEnforcement) {
    const jobB = rows.get('b');
    const laterArrivals = workers.flatMap(({ id }) => [...cells.get('b/' + id).requests.values()])
      .filter((request) => request.arrival && request.sequence > boundary.sequence);
    sections.push(evidenceSection('Run outcome', [
      ['Job A', 'Future calls blocked'],
      ['Job B', jobB.status === 'completed' ? 'Completed' : 'Running'],
      ['B after stop', laterArrivals.length ? laterArrivals.length + ' upstream calls observed' : 'Awaiting observations'],
      ['Receipt evidence', receipt.evidenceStatus === 'complete' ? 'Both denials verified' : 'Incomplete'],
    ]));
  }
  elements['evidence-content'].replaceChildren(...sections);
  if (localEnforcement) {
    elements.download.href = '/api/runs/' + encodeURIComponent(run.runId) + '/receipt';
    elements.download.download = run.runId + '-receipt.json';
    return;
  }
  URL.revokeObjectURL(receiptUrl);
  receiptUrl = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2) + '\n'], { type: 'application/json' }));
  elements.download.href = receiptUrl;
  elements.download.download = `${run.runId}-receipt.json`;
}

function openEvidence(event, trigger) {
  selected = { event, trigger };
  trigger.setAttribute('aria-expanded', 'true');
  renderEvidence();
  elements.evidence.showModal();
}

function start() {
  if (enteringConsole || elements.start.getAttribute('aria-disabled') === 'true') return;
  if (!document.body.dataset.session && document.startViewTransition && !reducedMotion.matches) {
    enteringConsole = true;
    const transition = document.startViewTransition(startDemo);
    transition.finished.catch(() => {}).finally(() => { enteringConsole = false; });
    return;
  }
  startDemo();
}

function startDemo({ demoId } = {}) {
  if (elements.start.getAttribute('aria-disabled') === 'true') return;
  localEnforcement = elements.execution.value === 'local';
  if (!document.body.dataset.session) {
    intro.dispose();
    document.body.dataset.session = 'running';
    elements['hero-title'].textContent = 'Run control';
    document.querySelector('.hero-description').textContent = localEnforcement
      ? 'Compare gateway decisions across two jobs using one shared credential.'
      : 'Compare gateway decisions across two jobs using one virtual key.';
  }
  simulator?.dispose();
  lastSequence = 0;
  elements['component-error'].hidden = true;
  if (!rows.size) {
    elements.matrix.hidden = true;
    elements.key.hidden = true;
    elements.permission.hidden = true;
    elements['activity-empty'].hidden = false;
    elements['last-event'].textContent = 'Awaiting events';
    setEmpty('Starting demo', localEnforcement ? 'Starting Python and Node workers.' : 'Registering two runs with the simulated gateway.');
  }
  setConnection('reconnecting', 'Starting gateway');
  setStart('Starting demo', true);
  simulator = (localEnforcement ? createRemote : createSimulator)(elements.scenario.value, receive, demoId);
  simulator.start();
}

elements.start.addEventListener('click', start);
if (import.meta.env.MODE !== 'frontend') fetch('/api/session').then(async (response) => {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
  const session = await response.json();
  if (session.mode !== 'local-enforcement') return;
  gatewayEngine = session.engine;
  embeddedBifrost = ['bifrost-embedded', 'bifrost-http', 'bifrost-http-dynamic'].includes(session.engine);
  localModel = session.provider === 'smollm2-local';
  if (!document.body.dataset.session) setConnection('ready', embeddedBifrost ? 'Bifrost ready' : 'Gateway ready');
  elements.history.hidden = false;
  elements.history.addEventListener('toggle', async () => {
    if (!elements.history.open) return;
    try {
      const response = await fetch('/api/history');
      if (!response.ok) throw new Error();
      const history = await response.json();
      elements['history-list'].replaceChildren(...history.map((run) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = run.name + ' · ' + run.state + ' · ' + (run.engine.startsWith('bifrost-http') ? 'Bifrost HTTP' : run.engine === 'bifrost-embedded' ? 'Bifrost core' : 'Local gateway');
        const id = document.createElement('code');
        id.textContent = run.runId;
        item.append(label, id);
        if (run.hasReceipt) {
          const download = document.createElement('a');
          download.href = '/api/runs/' + encodeURIComponent(run.runId) + '/receipt';
          download.download = run.runId + '-receipt.json';
          download.textContent = 'Download receipt';
          item.append(download);
        }
        return item;
      }));
      if (!history.length) elements['history-list'].textContent = 'No runs recorded yet.';
    } catch {
      elements['history-list'].textContent = 'Run history unavailable. Reopen to retry.';
    }
  });
  const engineLabel = session.engine.startsWith('bifrost-http') ? 'Bifrost HTTP' : embeddedBifrost ? 'Bifrost core' : 'Local gateway';
  const providerLabel = localModel ? 'SmolLM2' : 'model fixture';
  const option = new Option(engineLabel + ' + ' + providerLabel, 'local');
  elements.execution.append(option);
  if (!document.body.dataset.session) elements.execution.value = 'local';
  const describeMode = () => {
    const local = elements.execution.value === 'local';
    const reconnect = elements.scenario.querySelector('option[value="reconnect"]');
    reconnect.disabled = local;
    if (local && elements.scenario.value === 'reconnect') elements.scenario.value = 'standard';
    document.querySelector('.workspace-heading p').textContent = local
      ? engineLabel + ' dispatch with Python and Node workers. ' + providerLabel + ' runs locally.'
      : 'Gateway events and evidence are simulated locally.';
    document.querySelector('.mode').textContent = local ? session.engine.startsWith('bifrost-http') ? 'Bifrost HTTP demo' : embeddedBifrost ? 'Bifrost core demo' : 'Local enforcement demo' : 'Gateway simulator';
  };
  elements.execution.addEventListener('change', describeMode);
  describeMode();
  if (session.activeDemo && !document.body.dataset.session) startDemo({ demoId: session.activeDemo });
}).catch(() => {});
reducedMotion.addEventListener('change', ({ matches }) => {
  if (!matches) return;
  for (const { element } of cells.values()) {
    element.getAnimations().forEach((animation) => animation.cancel());
  }
});
elements['close-evidence'].append(icon('x'));
elements.download.prepend(icon('download'));
elements['close-evidence'].addEventListener('click', () => elements.evidence.close());
elements.evidence.addEventListener('close', () => {
  selected?.trigger.setAttribute('aria-expanded', 'false');
  selected?.trigger.focus();
  selected = undefined;
  URL.revokeObjectURL(receiptUrl);
  receiptUrl = undefined;
});
