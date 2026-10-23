#!/usr/bin/env bash
# Build the patched dirplayer (Shockwave emulator) and install its browser
# polyfill into public/dirplayer/. Upstream: https://github.com/igorlira/dirplayer-rs
# Everything compiles inside Docker; caches live in .cache/.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD

UPSTREAM=https://github.com/igorlira/dirplayer-rs.git
COMMIT=68376fbb4494a6bbad4c70081ecdcb99814a74c9
RELEASE=v0.8.1   # prebuilt Xtras + Ruffle shipped next to the polyfill
SRC=vendor/dirplayer-rs
IMAGE=robotrage-dirplayer-builder

if [ ! -d "$SRC/.git" ]; then
  git clone "$UPSTREAM" "$SRC"
  git -C "$SRC" checkout -q "$COMMIT"
  git -C "$SRC" apply "$ROOT/patches/dirplayer.patch"
fi

docker build -q -t "$IMAGE" docker/dirplayer-builder >/dev/null
mkdir -p .cache/cargo .cache/npm
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp/home \
  -e CARGO_HOME=/cache/cargo -e npm_config_cache=/cache/npm \
  -v "$ROOT/$SRC":/src -v "$ROOT/.cache":/cache "$IMAGE" bash -c '
    set -e
    export PATH=/usr/local/cargo/bin:$PATH RUSTUP_HOME=/usr/local/rustup
    [ -d node_modules ] || npm ci --no-audit --no-fund
    npm run build-vm
    npm run build-polyfill'

mkdir -p public/dirplayer .cache/download
ZIP=.cache/download/dirplayer-polyfill-$RELEASE.zip
[ -f "$ZIP" ] || curl -fL -o "$ZIP" \
  "https://github.com/igorlira/dirplayer-rs/releases/download/$RELEASE/dirplayer-polyfill-${RELEASE#v}.zip"
unzip -o -q "$ZIP" -d public/dirplayer
cp "$SRC/dist-polyfill/dirplayer-polyfill.js" public/dirplayer/
echo "installed public/dirplayer/dirplayer-polyfill.js"
