$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $project '.local/llama'
$models = Join-Path $project '.local/models'
New-Item -ItemType Directory -Path $runner, $models -Force | Out-Null
$archive = Join-Path $runner 'llama-b12359-bin-win-cpu-x64.zip'
$model = Join-Path $models 'SmolLM2-135M-Instruct-Q3_K_M.gguf'

if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest 'https://github.com/ggml-org/llama.cpp/releases/download/b12359/llama-b12359-bin-win-cpu-x64.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne '837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69') {
    throw 'llama.cpp archive checksum mismatch'
}
if (!(Test-Path -LiteralPath (Join-Path $runner 'llama-server.exe'))) {
    Expand-Archive -LiteralPath $archive -DestinationPath $runner
}
if (!(Test-Path -LiteralPath $model)) {
    Invoke-WebRequest 'https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF/resolve/32db44d69cedb731dc0fc96f60e01a86c6f5919d/SmolLM2-135M-Instruct-Q3_K_M.gguf' -OutFile $model
}
if ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLower() -ne '61c69fc5ce91982e26c625d43be5c3c7f0f774da22f4fa4e45c37a80a22ddad4') {
    throw 'SmolLM2 model checksum mismatch'
}
Write-Output 'Verified the pinned CPU runner and local model.'
