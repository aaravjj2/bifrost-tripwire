# Local verification

Checks completed on Windows with Chrome and Node 24.

| Check | Result |
| --- | --- |
| Two worker processes | Python and Node independently submitted HTTP requests with the same shared credential through the embedded Bifrost executable. |
| Selective stop | Both subsequent A attempts were denied. B continued and completed. |
| Final local trial | Two post-stop denials, zero measured matching arrivals for those denials, 18 later B arrivals, and B completed. |
| Receipt | Server-generated JSON included boundary, request IDs, correlation, reasons, worker identities, measured windows, counts, and local trial status. |
| Recorder outage | Receipt remained incomplete and UI showed Unavailable without inferring zero. |
| Operator controls | Anonymous API access and cross-origin stop were rejected. Repeating an authorized stop returned the same boundary. |
| Policy tests | Four tests passed for isolation, expiry, permissions, idempotence, completion, trial receipt conditions, and the admission ceiling. |
| Native adapter tests | Three Go tests passed against the pinned Bifrost source. The Windows executable embedding Bifrost compiled and passed end-to-end trials. Shared-object loading remains unverified. |
| Repeated Bifrost trials | Three drained-boundary fixture trials each recorded two post-stop denials, zero measured matching arrivals, 18 post-stop B arrivals, and B completion. |
| Real model trials | Three embedded-Bifrost trials with actual CPU SmolLM2 inference each passed with two denials, zero measured denied arrivals, 18 later B arrivals, and B completion. Summary saved in `../test-results/tripwire-local-model-trials.json`. |
| Motion | Opening, pause/resume, replay, skip, resize, reduced motion, renderer failure, and interruption by Start demo passed. |
| Immediate stop during handoff | Production UI accepted Stop Job A immediately after registration while the gate artwork transitioned. Both A workers were denied, measured denied arrivals were zero, and B completed with 18 later arrivals. The saved receipt has `passed-local-model`. |
| Mobile | Touch and viewport emulation at 320 × 568, 390 × 667, and 768 × 1024 passed. Physical phones remain unverified. |
| Build | Production Vite build passed. The dynamically loaded Three.js chunk is approximately 188 KB gzip. |

The desktop motion capture reported Intel Iris Xe through ANGLE / Direct3D11.
A separate foreground 5.1-second callback sample recorded 605 intervals, with
p50 of 8.3 ms and p95 of 8.5 ms. These measurements describe callback cadence.
GPU execution time and physical-phone frame pacing remain unmeasured.

The default provider is real local SmolLM2 inference when its pinned runtime and
weights are available. Deterministic fixture mode remains selectable. Shared-object
loading in the standard Bifrost HTTP host, hosted-provider route coverage, three
stock-comparison trials per configuration, and submission materials remain release
work listed in [BUILD.md](BUILD.md).
