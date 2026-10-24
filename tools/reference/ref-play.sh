#!/usr/bin/env bash
# Play the reference build yourself: Adobe's projector in a window on your desktop
# (XWayland/X11) instead of the virtual display, against a local test server.
#   tools/reference/ref-play.sh [port]      (default 8091; close the window to stop)
# Sound goes to your desktop through its PulseAudio socket (PipeWire's works too).
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=${1:-8091}
SRC=${REF_PROJECTOR:-$HOME/rr-spike/app/stage/spr}
WORK=${REF_WORK:-/tmp/rrwork/ref-play}
C=rr-ref-play
rm -rf "$WORK/spr"; mkdir -p "$WORK"; cp -r "$SRC" "$WORK/spr"
rm -rf "$WORK/spr/game"; mkdir "$WORK/spr/game"; cp -L public/game/* "$WORK/spr/game/"
curl -fsS "http://127.0.0.1:$PORT/game/main.ini" > "$WORK/spr/game/main.ini"
docker build -q -t robotrage-wine-ref docker/wine-reference >/dev/null
PULSE=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/pulse/native
audio=()
if [ -S "$PULSE" ]; then
  audio=(-v "$PULSE":/tmp/pulse.sock -e PULSE_SERVER=unix:/tmp/pulse.sock)
  [ -f "$HOME/.config/pulse/cookie" ] && audio+=(-v "$HOME/.config/pulse/cookie":/tmp/pulse.cookie:ro -e PULSE_COOKIE=/tmp/pulse.cookie)
else
  echo "no PulseAudio socket at $PULSE: playing without sound" >&2
fi
docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" --network host -v "$WORK":/ref "${audio[@]}" \
  -v /tmp/.X11-unix:/tmp/.X11-unix -v "$XAUTHORITY":/tmp/xauth:ro \
  -e DISPLAY="${DISPLAY:-:0}" -e XAUTHORITY=/tmp/xauth robotrage-wine-ref bash -c \
  'cd /ref/spr; wine SPR.exe "game\\wrapper_robotragerearmed.dcr" > /ref/wine.log 2>&1' >/dev/null
echo "reference window starting (container $C, log $WORK/wine.log)"
