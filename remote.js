export function createRemote(scenario, receive, demoId) {
  let stream;
  let disposed = false;
  let runs = [];
  let pending = false;

  async function start() {
    try {
      if (demoId) {
        stream = new EventSource('/api/events?demo=' + encodeURIComponent(demoId));
        connectStream();
        return;
      }
      const response = await fetch('/api/demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }), signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (disposed) return;
      runs = result.runs;
      stream = new EventSource('/api/events?demo=' + encodeURIComponent(result.demo));
      connectStream();
    } catch (error) {
      if (!disposed) receive({ type: 'boot-failed', message: error.message });
    }
  }

  function connectStream() {
      stream.onmessage = ({ data }) => {
        const event = JSON.parse(data);
        if (event.type === 'registered') runs = event.runs;
        if (event.type === 'stop-committed') pending = false;
        receive(event);
      };
      stream.onerror = () => receive({ type: pending ? 'stop-unknown' : 'disconnected' });
      stream.onopen = () => receive({ type: 'reconnected' });
  }

  async function stop(job) {
    if (pending || disposed) return;
    const run = runs.find((run) => run.id === job);
    if (!run?.canStop) return;
    pending = true;
    receive({ type: 'stop-pending' });
    try {
      const response = await fetch('/api/runs/' + encodeURIComponent(run.runId) + '/stop', {
        method: 'POST', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Stop rejected');
      // The ordered stream reconciles the acknowledgement with earlier admissions.
    } catch {
      receive({ type: 'stop-unknown' });
    }
  }
  return {
    start, stop,
    dispose() { disposed = true; stream?.close(); },
  };
}
