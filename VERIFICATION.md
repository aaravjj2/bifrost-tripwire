# Verification record

The complete [Linux workflow](https://github.com/aaravjj2/bifrost-tripwire/actions/runs/44769932675)
passed on November 20, 2026 at source commit
`3b574fb73c69c80f10093331cd74e0bcaeaa99c5`. It installs locked dependencies,
runs eight Node tests, builds the production UI, tests the Go adapter, builds
the standard HTTP host and native plugin from one pinned module graph, and
runs nine real-model trials across three configurations.

| Configuration | Trials | A denials per trial | Matching denied arrivals | Later B arrivals per trial | B completes |
| --- | --- | --- | --- | --- | --- |
| Native Tripwire, shared key | 3 | 2 | 0 | 18 | Yes |
| Stock Bifrost, shared key revoked | 3 | 2 | 0 | 0 | No |
| Stock Bifrost, A's per-run key revoked | 3 | 2 | 0 | 18 | Yes |

[Native summary](evidence/native-summary.json), individual receipts/event logs,
and [stock results](evidence/stock-comparison.json) include measured windows and
request IDs. The recorder is a separate process forwarding to actual CPU
SmolLM2 inference. These results cover the configured non-streaming model route
with caching, fallback and retries disabled. A zero concerns matching denied
request IDs within the measured window, not every possible provider route.

The Windows embedded-Bifrost demo also passed three real-model trials. The
[90-second movie](media/tripwire-demo.mp4) shows an actual browser trial with a
mid-trial reload, the same recovered run IDs, both workers' denials and a receipt.
Its later manual stop leaves 14 B arrivals after stop, versus 18 in drained trials.
The [filmed receipt](evidence/windows-live-receipt.json) preserves that distinction.

Additional checks completed on Windows with Chrome and Node 24:

- Anonymous API access and cross-origin mutations rejected. Repeating an
  authorized stop returns the original boundary. Public static navigation works.
- Policy tests cover isolation, permissions, expiry, restart invalidation,
  idempotence, duplicate request IDs and the admission ceiling. The remote test
  checks refresh recovery. Three origin tests cover allowed and rejected requests.
- Recorder failure leaves evidence incomplete and the screen shows Unavailable.
- Intro opening, pause/resume, replay, skip, reduced motion, renderer fallback,
  resize and immediate stop during the artwork transition checked in the browser.
- Keyboard paths and viewport emulation at 320 × 568, 390 × 667 and 768 × 1024
  checked. Physical-phone frame pacing remains unmeasured.

The final Linux adapter benchmark measured 72,336 ns/op, 9,846 B/op and 116
allocations/op on the recorded runner. This loopback-stub microbenchmark excludes
SQLite, production network latency and model execution. It supports no production
throughput or latency advantage claim. [Raw benchmark](evidence/hook-benchmark-linux.txt).

See [failed attempts](FAILED-TRIALS.md) for the integration failures that preceded
the passing run. Production identity, multi-replica behavior, cancellation,
streaming and hosted-provider routes require separate validation.
