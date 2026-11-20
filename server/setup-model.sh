#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/.local/llama" "$root/.local/models"
runner="$root/.local/llama-linux.tar.gz"
model="$root/.local/models/SmolLM2-135M-Instruct-Q3_K_M.gguf"
curl --fail --location --retry 2 'https://github.com/ggml-org/llama.cpp/releases/download/b12359/llama-b12359-bin-ubuntu-x64.tar.gz' -o "$runner"
echo "0bc1f091e8916102b6d8f2cf944233a620e90a0f856c72d0ce41150c65c2e72e  $runner" | sha256sum --check
tar -xzf "$runner" -C "$root/.local/llama" --strip-components=1
curl --fail --location --retry 2 'https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF/resolve/32db44d69cedb731dc0fc96f60e01a86c6f5919d/SmolLM2-135M-Instruct-Q3_K_M.gguf' -o "$model"
echo "61c69fc5ce91982e26c625d43be5c3c7f0f774da22f4fa4e45c37a80a22ddad4  $model" | sha256sum --check
