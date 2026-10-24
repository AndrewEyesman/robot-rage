#!/usr/bin/env bash
# Extract the port's assets from the game files in public/game/ into port/assets/
# (never committed). Builds port/extract (dirplayer's parsers) inside the dirplayer
# builder image; caches live in .cache/.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
IMAGE=robotrage-dirplayer-builder
docker build -q -t "$IMAGE" docker/dirplayer-builder >/dev/null
mkdir -p .cache/cargo port/assets
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp/home -e CARGO_HOME=/cache/cargo \
  -v "$ROOT":/repo -v "$ROOT/.cache":/cache -w /repo/port/extract "$IMAGE" bash -c '
    set -e
    export PATH=/usr/local/cargo/bin:$PATH RUSTUP_HOME=/usr/local/rustup
    cargo build --quiet
    for m in arena104.dcr robotwars.cct texter.cct; do
      ./target/debug/rr-extract /repo/public/game/$m /repo/port/assets/${m%.*}
    done'
