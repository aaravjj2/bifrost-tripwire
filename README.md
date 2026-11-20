# Bifrost Tripwire

For the complete local enforcement flow, launch the service from the workspace
root with Node 24 and Python 3 available.

```powershell
node ./tripwire/server/start.js
```

Open [local enforcement](http://127.0.0.1:4177/). The default execution mode
starts separate Python and Node workers and an independent recorder process.
Stop A while B is running. Both workers should show A denied, then B completes
after about 20 seconds. The UI identifies whether requests use SmolLM2 or a fixture.

The service binds to loopback. The browser receives an HttpOnly operator session.
Worker associations expire after three minutes. State is stored in
`.local/tripwire.sqlite`, which is excluded from version control. Restarting the
service invalidates previously active runs and their associations.
The recorder failure and read-only scenarios apply to local enforcement.
The timeout/reconnect scenario is available in Simulation mode.
Review [build status](BUILD.md) for native Bifrost and provider release checks.

The current workspace includes a built embedded Bifrost gateway. For a fresh
Windows checkout with Go 1.27.4 and Git available, build it with
`./tripwire/plugin/build.ps1` before starting the service. The UI identifies
the selected engine. The source uses Bifrost core revision
`3efed2f7995f4f8c12005cda0d773cc6f8a3b60b`.

Run `node tripwire/server/verify.js 3` while the service is idle for three
repeatable trials using the selected provider. Each trial waits for both A workers, drains prior
calls before stop, and checks both denials, the recorder, and B's later traffic.

The current workspace also includes the CPU model runtime. For a fresh Windows
checkout, run `./tripwire/server/setup-model.ps1` to download and verify the pinned
llama.cpp runner and 93.5 MB SmolLM2 model. The service starts the model on
loopback port 4188 when those files are present. Each response is limited to
eight generated tokens. Set `TRIPWIRE_PROVIDER=fixture` to select the deterministic
fixture instead. Model files and binaries stay in the ignored `.local/` directory.

The sample documents are in `server/documents.json`. A repeats the indexing
step on the first paragraph. B advances through all ten paragraphs. Prompts and
model outputs are excluded from receipts.

Each local trial has a ceiling of 60 requests across both jobs and both workers.
Worker errors and recorder outages are surfaced in the console. Open Run history
to download persisted receipts after a refresh. A new local demo becomes available
after the current jobs have stopped or completed.

Run the policy checks from the workspace root.

```powershell
node --test ./tripwire/server/policy.test.js
```

For production mode, run `npm run build` and `npm start` inside `tripwire/`
after installing its pinned dependencies. This serves the compiled UI and the
same control API, with no development middleware.

From the workspace root, start the standalone preview with the installed Vite binary.

```powershell
node ./node_modules/vite/bin/vite.js tripwire --host 127.0.0.1 --port 4175
```

Open [the local preview](http://127.0.0.1:4175/). Start the Standard demo, stop Job A, then select either worker's denial to inspect and download its run receipt. Job B progresses independently and finishes after about 18 seconds. Use the scenario menu before starting a new demo to exercise reconnect, recorder failure, boot failure, or read-only access.

The standalone preview uses `simulator.js` and labels its events and receipts as
simulated. The service on port 4177 supplies authenticated commands, an ordered
event stream, persisted receipts, and an independent recorder. It identifies its
actual gateway engine and provider in the UI and receipt.

The [resource guide](RESOURCES.md) records participant credits, the coupon result,
free local-model setup, design references, and the optional Tavily research command.
Keep `TAVILY_API_KEY` in `.local/tavily.env`. From `tripwire/`, run
`npm run resources` or `node --env-file=.local/tavily.env server/resources.js`
to refresh the source catalog with up to three basic searches.
The command uses a daily cache and never runs as part of a demo.

The [design and asset notes](DESIGN.md) record the references used in the redesign, the hero art prompt, and the local asset sources. The production build includes the Geist and Lucide license notices.
