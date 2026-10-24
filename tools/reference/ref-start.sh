#!/usr/bin/env bash
# Start the reference player: Adobe's Director 10.1 projector (Flashpoint's SPR.exe)
# under Wine in Docker, running the same game files we serve, with the main.ini of a
# local test server (never the shared 8090 or robotrage.pro).
#   tools/reference/ref-start.sh [port]      (default 8091; waits for the login screen)
# Needs: the robotrage-wine-ref image (docker/wine-reference) and the projector in
# $REF_PROJECTOR (default ~/rr-spike/app/stage/spr; Adobe files, never committed).
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=${1:-8091}
SRC=${REF_PROJECTOR:-$HOME/rr-spike/app/stage/spr}
WORK=${REF_WORK:-/tmp/rrwork/ref}
C=${REF_CONTAINER:-rr-ref}
# Containers share the host's network, so each needs its own X display: rr-ref uses :5,
# others one derived from their name (or REF_DISPLAY).
D=${REF_DISPLAY:-$([ "$C" = rr-ref ] && echo :5 || echo ":$((10 + $(printf %s "$C" | cksum | cut -d' ' -f1) % 80))")}
rm -rf "$WORK/spr"; mkdir -p "$WORK"; cp -r "$SRC" "$WORK/spr"
rm -rf "$WORK/spr/game"; mkdir "$WORK/spr/game"; cp -L public/game/* "$WORK/spr/game/"
curl -fsS "http://127.0.0.1:$PORT/game/main.ini" > "$WORK/spr/game/main.ini"
docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" --network host -e D="$D" -v "$WORK":/ref robotrage-wine-ref bash -c \
  'Xvfb $D -screen 0 1024x768x24 & sleep 1; export DISPLAY=$D; cd /ref/spr; wine SPR.exe "game\\wrapper_robotragerearmed.dcr" > /ref/wine.log 2>&1; sleep infinity' >/dev/null
for i in $(seq 1 60); do
  sleep 2
  tools/reference/refctl.sh shot "$WORK/_wait.png" 2>/dev/null || continue
  python3 -I -c "
from PIL import Image; import sys
im = Image.open('$WORK/_wait.png').convert('RGB')
# the yellow LOG IN tab of the login box
n = sum(1 for x in range(230, 560, 4) for y in range(140, 330, 4) if (lambda p: p[0] > 150 and p[1] > 150 and p[2] < 90)(im.getpixel((x, y))))
sys.exit(0 if n > 40 else 1)" 2>/dev/null && { echo "reference at the login screen after $((i * 2))s"; exit 0; }
done
echo "reference did not reach the login screen" >&2; exit 1
