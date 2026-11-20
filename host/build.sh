#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="${1:?Pass the pinned Bifrost source directory}"
test "$(git -C "$source_dir" rev-parse HEAD)" = 3efed2f7995f4f8c12005cda0d773cc6f8a3b60b
go version | grep -q 'go1.27.4 '
build="$root/.local/host-build"
mkdir -p "$build/adapter"
cp "$root/host/main.go" "$build/main.go"
cp "$root/plugin/main.go" "$build/enforcement.go"
cp "$root/plugin/main.go" "$build/adapter/main.go"
cp "$root/plugin/main_test.go" "$build/adapter/main_test.go"
cp -r "$root/host/ui" "$build/"
cp "$source_dir/transports/go.mod" "$build/go.mod"
cp "$source_dir/transports/go.sum" "$build/go.sum"
export GOWORK=off CGO_ENABLED=1
cd "$build"
go mod edit '-module=tripwire/host' '-require=github.com/maximhq/bifrost/transports/v2@v2.0.0'
for folder in "$source_dir/core" "$source_dir/framework" "$source_dir/transports" "$source_dir"/plugins/*; do
  if test -f "$folder/go.mod"; then
    module="$(sed -n 's/^module //p' "$folder/go.mod")"
    go mod edit "-replace=$module=$folder"
  fi
done
go build -p 2 -mod=mod -o "$root/.local/bifrost-http-tripwire" .
go test -p 2 -mod=mod ./adapter
go build -p 2 -mod=mod -buildmode=plugin -o "$root/.local/tripwire.so" ./adapter
