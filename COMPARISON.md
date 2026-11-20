# Stock-key comparison

The participant reports that workers use one fixed gateway secret and that
distributing gateway keys per run requires deployment changes. Tripwire targets
that constraint. Both worker runtimes still need trusted run associations.

The same pinned Bifrost HTTP host and real SmolLM2 route ran three trials per
configuration. Each trial used separate Python and Node processes, original
synthetic documents and a separate forwarding recorder. Before stop, each worker
completed one request for each job. The harness drained those admissions,
committed stop/revocation, then resumed both workers.

| Configuration | Workload gateway keys | Stop actions | A denials | Denied arrivals | Later B arrivals | B completed |
| --- | --- | --- | --- | --- | --- | --- |
| Stock shared key, all three trials | 1 | 1 | 2 each | 0 each | 0 each | No |
| Stock per-run keys, all three trials | 2 | 1 | 2 each | 0 each | 18 each | Yes |
| Tripwire shared key, all three trials | 1 | 1 | 2 each | 0 each | 18 each | Yes |

Stock per-run virtual keys already provide selective stop. Tripwire adds a run
control interface and a combined receipt while keeping the gateway credential
fixed. This is a choice of integration and authority boundaries, and does not
establish a universal advantage over stock key management.

Stock requires gateway administration to create and disable virtual keys. Per-run
mode also requires selecting and distributing A's or B's key in both runtimes.
The stock host has one unused bootstrap virtual key in addition to the workload
keys counted above. Shared-key revocation affects both jobs as expected.

Tripwire keeps one workload gateway credential but adds four expiring association
secrets, one for each worker/run pair. The trusted registrar distributes those
secrets and the local operator controls stop. Tripwire therefore does not reduce
the total secret count or remove worker changes. Its loopback authority requires
production identity integration before deployment beyond this demonstration.

Measured stock key-provisioning API times were 42, 4 and 4 ms for shared mode,
and 7, 47 and 8 ms for per-run mode on the CI runner. These measure local API
calls only. They exclude engineering time, rollout, key delivery and operator
training. Tripwire setup time was not separately benchmarked, so no setup-speed
comparison is claimed. Every configuration used one stop operation.

[Stock results and events](evidence/stock-comparison.json),
[native Tripwire results](evidence/native-summary.json), and
[passing workflow](https://github.com/aaravjj2/bifrost-tripwire/actions/runs/44769932675).

Reproduce with `node server/verify.js 3` against an idle native Tripwire service,
then stop the service and run `node server/compare.js` for the dedicated stock
host. Scripts use the same bounded generation settings and request IDs.
