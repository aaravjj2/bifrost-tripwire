param(
    [string]$GoPath = 'go',
    [string]$BifrostSourcePath
)
$ErrorActionPreference = 'Stop'
$revision = '3efed2f7995f4f8c12005cda0d773cc6f8a3b60b'
$project = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $project '.local/build'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

function Assert-Success([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed" }
}

$version = & $GoPath version
Assert-Success 'Go version check'
if ($version -notmatch 'go1\.27\.4 ') { throw 'Use Go 1.27.4 to match the pinned Bifrost revision' }
if (!$BifrostSourcePath) {
    $BifrostSourcePath = Join-Path $project '.local/bifrost-source'
    if (!(Test-Path -LiteralPath $BifrostSourcePath)) {
        git clone --filter=blob:none --no-checkout https://github.com/maximhq/bifrost.git $BifrostSourcePath
        Assert-Success 'Bifrost clone'
        git -C $BifrostSourcePath sparse-checkout set core
        Assert-Success 'Bifrost sparse checkout'
        git -C $BifrostSourcePath checkout $revision
        Assert-Success 'Pinned Bifrost checkout'
    }
}
$actualRevision = git -C $BifrostSourcePath rev-parse HEAD
Assert-Success 'Bifrost revision check'
if ($actualRevision -ne $revision) { throw "Expected Bifrost revision $revision" }

$moduleFile = Join-Path $buildDirectory 'plugin.mod'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'go.mod') -Destination $moduleFile
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'go.sum') -Destination (Join-Path $buildDirectory 'plugin.sum')
$core = Join-Path $BifrostSourcePath 'core'
$executable = Join-Path $project '.local/bifrost-gateway.exe'
Push-Location $PSScriptRoot
try {
    & $GoPath mod edit "-modfile=$moduleFile" "-replace=github.com/maximhq/bifrost/core=$core"
    Assert-Success 'Local pinned module setup'
    & $GoPath test "-modfile=$moduleFile" ./...
    Assert-Success 'Plugin tests'
    & $GoPath build -mod=mod "-modfile=$moduleFile" -tags tripwire_gateway -o $executable .
    Assert-Success 'Embedded gateway build'
} finally {
    Pop-Location
}
Write-Output "Built embedded Bifrost gateway at $executable"
