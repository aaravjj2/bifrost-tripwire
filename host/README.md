# Bifrost HTTP host

This launcher imports the pinned publisher HTTP server. Bifrost handles the
OpenAI route, governance virtual keys, provider dispatch, and the admin API.
Tripwire joins through the public HTTP plugin interface. The Linux build also
produces a native shared-object plugin from the same enforcement source.

On Linux with Go 1.27.4, a C compiler, Node 24 and Python 3, clone Bifrost at
`3efed2f7995f4f8c12005cda0d773cc6f8a3b60b` with core, framework, plugins and
transports checked out. Run `bash host/build.sh /absolute/path/to/bifrost`.
Then run `bash server/setup-model.sh`, `npm ci`, `npm run build`, and start with
`TRIPWIRE_PLUGIN_PATH="$PWD/.local/tripwire.so" npm start`.

The default Linux engine uses the standard HTTP host when its executable exists.
Without a plugin path it registers the adapter statically through Bifrost's
public registration interfaces. With a plugin path, Bifrost's standard loader
loads the `.so` during bootstrap. Receipts distinguish these engines.

The minimal embedded HTML points to Tripwire. It does not bundle the upstream
management UI. The upstream HTTP server, authentication and governance API are
the implementation under test. The configuration requires a virtual key for
inference and a fresh setup credential for admin operations. All listeners bind
to loopback. Credentials arrive through stdin and stay in ignored local data.

Windows builds can use `build.ps1`. `-PureGo` substitutes
`github.com/glebarez/sqlite v1.11.0` for the CGo GORM driver. The standard Windows
host compiled on the source machine, but Windows application control blocked
execution. The default Windows demo therefore keeps the previously verified
embedded engine. Linux CI is the standard-host validation environment.

No source changes to Bifrost are required. The small launcher and native adapter
remain separate from the upstream checkout.
