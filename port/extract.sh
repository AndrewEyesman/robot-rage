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
    for m in arena104.dcr robotwars.cct texter.cct login013_.dcr factory0604.dcr lobby060_.dcr loader002.dcr wrapper_robotragerearmed.dcr; do
      ./target/debug/rr-extract /repo/public/game/$m /repo/port/assets/${m%.*}
    done'

# Windows' core fonts (Verdana, Arial...), which the game's text members name and every
# 2004 Windows had; taken from the reference image's Wine prefix (winetricks corefonts).
# They're Microsoft's: never committed, like the rest of port/assets.
mkdir -p port/assets/fonts/system
docker run --rm -u "$(id -u):$(id -g)" -v "$ROOT/port/assets/fonts/system":/out robotrage-wine-ref bash -c \
  'cd /wine/drive_c/windows/Fonts && cp verdana*.ttf arial*.ttf ariblk.ttf impact.ttf times*.ttf cour*.ttf georgia*.ttf trebuc*.ttf comic*.ttf /out/'

# Their glyphs as Director 10.1 draws aliased system text (hinted, monochrome) and the
# metrics it lays text out with (see port/extract/system-fonts.py), with FreeType and
# fontTools from PyPI in a venv under .cache/.
VENV=.cache/fontvenv
[ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" -q install freetype-py==2.5.1 fonttools numpy pillow; }
"$VENV/bin/python" -I port/extract/system-fonts.py port/assets/fonts/system
