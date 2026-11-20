# Build status

The submission build passes the native Linux verification workflow at
[run 44769932675](https://github.com/aaravjj2/bifrost-tripwire/actions/runs/44769932675),
source commit `3b574fb73c69c80f10093331cd74e0bcaeaa99c5`.

| Requirement | Implemented and checked |
| --- | --- |
| TR-01 | Registered A/B run IDs, expiring worker associations, one shared Bifrost virtual key. |
| TR-02 | Native shared-object plugin loaded by the pinned standard Bifrost HTTP host. Python and Node A calls stop while B continues, using real local SmolLM2 inference. |
| TR-03 | SQLite commits the authoritative boundary. Repeated stops return that boundary. Duplicate request IDs cannot forward twice. Prior admissions may finish. |
| TR-04 | A separate forwarding recorder correlates request IDs to arrivals. Missing coverage produces incomplete evidence. |
| TR-05 | Loopback operator session, origin checks, server-side permission, hashed association storage, expiry and restart invalidation. |
| TR-06 | Two-worker console, evidence dialogs, refresh recovery, history, keyboard interaction and reduced motion. |
| TR-07 | JSON receipts, pinned setup, three native trials and three trials for each stock-key configuration, recorded demo and pitch. |
| TR-08 | Optional automatic threshold deferred. Manual operator stop is the submitted scope. |

See [README](README.md) for setup and [host integration](host/README.md) for
the matching compiler/module graph needed by Go shared objects. The host uses
Bifrost revision `3efed2f7995f4f8c12005cda0d773cc6f8a3b60b` without editing
upstream source. Windows uses the separately labeled embedded engine because
local application control blocks the newly built full HTTP host.

Production identity integration, multiple replicas, streaming, hosted-provider
coverage and physical-phone testing remain outside the demonstrated release.
The [comparison](COMPARISON.md) states where stock per-run keys already achieve
the same selective-stop outcome.
