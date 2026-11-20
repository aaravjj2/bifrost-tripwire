# Tripwire build status

The current flow comprises a browser, a control service, an embedded Bifrost
executable, Python and Node worker processes, and a separate recorder process.
Bifrost dispatches to bounded local SmolLM2 inference when the model is installed,
or to an explicitly labeled fixture. HTTP admissions, stop
boundaries, denials, arrivals, and completion records are stored in SQLite.
Three repeatable embedded-Bifrost fixture trials and three real local-model trials passed.

| Requirement | Implementation | Release evidence still needed |
| --- | --- | --- |
| TR-01 | Registered run IDs and expiring worker-specific association tokens. Both processes use the same gateway credential. | Repeat with Bifrost's authenticated virtual key. |
| TR-02 | Same Tripwire hook compiled into a Windows executable dispatching through the pinned Bifrost core to real local-model inference. Both workers terminate A on denial and continue B. | Shared-object plugin loading in the standard HTTP host and hosted-provider traffic. |
| TR-03 | Repeat stop returns the original committed boundary. Request IDs cannot forward twice. A prior admission can finish after stop. | Concurrent native gateway trials. |
| TR-04 | Separate recorder process covers the local-model route, with correlated arrivals and measurement windows. Recorder failures leave incomplete evidence. | Recorder placement on a hosted-provider route. |
| TR-05 | HttpOnly operator session, origin checks, server-side stop permission, hashed expiring associations, durable stopped states, active associations invalidated after restart. | Bifrost integration and deployment authorization review. |
| TR-06 | Two-worker matrix, stable event updates, evidence dialog, keyboard and reduced-motion paths. | Physical phone coverage. |
| TR-07 | JSON receipts, repeatable trial runner, pinned Windows build and model setup scripts. Three fixture and three real local-model trials passed. | Stock comparison, public repository, and standard-host demo. |
| TR-08 | Deferred optional admission threshold. | Manual native flow must pass first. |

## Native integration

### Embedded executable

`plugin/gateway.go` is compiled only with the `tripwire_gateway` build tag.
It embeds Bifrost core and invokes the same exported Tripwire HTTP hook after
authenticating the shared demo credential. It uses the OpenAI-compatible provider
route to the independent recorder, which forwards to SmolLM2 or returns the labeled
fixture response. The HTTP shell has its own credential
check. Bifrost governance virtual-key administration remains a release task.

On Windows with Go 1.27.4 and Git, run `./tripwire/plugin/build.ps1` from the
workspace root. The script fetches the pinned core revision, tests the hook,
and writes `tripwire/.local/bifrost-gateway.exe`. It accepts `-GoPath` and
`-BifrostSourcePath` for an existing toolchain or pinned checkout. Temporary
module replacements stay in `.local/build`.

The service automatically selects that executable when present. Its engine is
identified in the UI and persisted with each run. Without the executable, the
service identifies its Node reference gateway.

Run `node tripwire/server/verify.js 3` with the service idle to repeat the three
drained-boundary trials with the selected provider. Receipts and summary are stored in
`tripwire/.local/trials`.

### Shared-object packaging

The adapter in `plugin/main.go` targets the post-authentication HTTP hook at Bifrost
revision `3efed2f7995f4f8c12005cda0d773cc6f8a3b60b`. Its protected path is
`/v1/chat/completions`. It checks the control service before dispatch and fails
closed on missing association or control-service failure. Association credentials
are removed before upstream dispatch.

Both processes need the same `TRIPWIRE_PLUGIN_KEY` environment variable. The
plugin config needs a `control_url` loopback address. Native compilation needs
Linux or macOS, matching the Bifrost binary's Go toolchain and architecture.
The source machine has Windows, with no installed WSL distribution or Docker.

The native adapter is a separate integration stage from the working local gateway.
Its source was checked against the pinned hook definitions. The Windows Go 1.27.4
toolchain was downloaded from the official Go release and its SHA-256 was verified.
The first module fetch timed out. A retry used the checked-out pinned core source
and resolved the other dependencies with Go's checksum verification. Three adapter
tests then passed against the pinned schemas on Windows, including rejection of
a mismatched decision and removal of the worker association before dispatch.
Native shared-object compilation and loading inside Bifrost remain unverified.
It requires a dynamic Bifrost host with its own virtual-key auth configured,
plus fallback, caching, and automatic retries disabled on the measured route.
The control service does not assert a verified upstream zero for native decisions
until a real provider recorder covers that route.

On a matching Linux/macOS build host, resolve and verify dependencies with
`go mod tidy`, run `go test ./...`, then build with
`go build -buildmode=plugin -o tripwire.so .` inside `plugin/`.
Merge `plugin/config.example.json` into the pinned gateway's configuration,
using the absolute plugin path. Build the dynamic gateway at that same revision
and toolchain following the publisher's dynamic build guide.
The adapter's native tests cover missing associations and service failure.
[Bifrost dynamic build guide](https://github.com/maximhq/bifrost/blob/3efed2f7995f4f8c12005cda0d773cc6f8a3b60b/docs/plugins/building-dynamic-binary.mdx)

The worker launcher targets the control service, which forwards through the
embedded executable when available. A dynamic-plugin trial still needs Bifrost's
HTTP host configured with governance virtual keys and a recorder covering a real
provider route. The native control endpoint leaves observations Unavailable for
external hosts whose recorder route has not been connected.

## Stock comparison before release

Use the same bounded workload and stop point in each configuration.

| Configuration | Measurement |
| --- | --- |
| Stock shared virtual key | Show what stopping A requires and what happens to B. |
| Stock per-run virtual keys | Issue separate run keys, disable A's key, and record the integration and operator effort. |
| Tripwire shared virtual key | Register trusted run associations and stop A with one committed operation. |

For each record configuration changes, keys issued, privileges, operator actions,
setup time, A's post-stop admissions, independently observed arrivals, and B's
completion. Complete three trials per configuration. The deployment constraint
and advantage over stock per-run keys remain unverified. Submission eligibility,
cutoff, sponsor requirements, pitch deck, public repository, and publication are
pending event/submission work.
