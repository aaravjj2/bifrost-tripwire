param(
 [string]$GoPath='go',
 [Parameter(Mandatory=$true)][string]$BifrostSourcePath,
 [string]$CCompiler,
 [switch]$PureGo
)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$revision='3efed2f7995f4f8c12005cda0d773cc6f8a3b60b'
if ((git -C $BifrostSourcePath rev-parse HEAD) -ne $revision) { throw 'Use the pinned Bifrost checkout' }
if ((& $GoPath version) -notmatch 'go1\.27\.4 ') { throw 'Use Go 1.27.4' }
git -C $BifrostSourcePath sparse-checkout add framework core plugins transports
if ($LASTEXITCODE -ne 0) { throw 'Bifrost source checkout failed' }
$build=Join-Path $project '.local/host-build'
New-Item -ItemType Directory -Path $build -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'main.go') -Destination (Join-Path $build 'main.go')
Copy-Item -LiteralPath (Join-Path $project 'plugin/main.go') -Destination (Join-Path $build 'enforcement.go')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ui') -Destination $build -Recurse -Force
Copy-Item -LiteralPath (Join-Path $BifrostSourcePath 'transports/go.mod') -Destination (Join-Path $build 'go.mod')
Copy-Item -LiteralPath (Join-Path $BifrostSourcePath 'transports/go.sum') -Destination (Join-Path $build 'go.sum')
$oldCGO=$env:CGO_ENABLED
$oldCC=$env:CC
$oldWorkspace=$env:GOWORK
Push-Location $build
try {
 $env:CGO_ENABLED='1'
 $env:GOWORK='off'
 if ($CCompiler) { $env:CC=$CCompiler }
 & $GoPath mod edit '-module=tripwire/host' '-require=github.com/maximhq/bifrost/transports/v2@v2.0.0'
 if ($LASTEXITCODE -ne 0) {throw 'Host module setup failed'}
 if ($PureGo) {
  $env:CGO_ENABLED='0'
  & $GoPath mod edit '-replace=gorm.io/driver/sqlite=github.com/glebarez/sqlite@v1.11.0'
  if ($LASTEXITCODE -ne 0) {throw 'Pure-Go SQLite driver setup failed'}
 }
 $modules=@('core','framework','transports')
 $modules+=Get-ChildItem (Join-Path $BifrostSourcePath 'plugins') -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'go.mod')} | ForEach-Object {'plugins/'+$_.Name}
 foreach ($module in $modules) {
  $folder=Join-Path $BifrostSourcePath $module
  $moduleName=(Get-Content (Join-Path $folder 'go.mod') -First 1).Substring(7)
  & $GoPath mod edit "-replace=$moduleName=$folder"
  if ($LASTEXITCODE -ne 0) {throw 'Module replacement failed'}
 }
 & $GoPath build -p 2 -mod=mod -o (Join-Path $project '.local/bifrost-http-tripwire.exe') .
 if ($LASTEXITCODE -ne 0) { throw 'Standard transport host build failed' }
} finally {
 Pop-Location
 $env:CGO_ENABLED=$oldCGO
 $env:CC=$oldCC
 $env:GOWORK=$oldWorkspace
}
