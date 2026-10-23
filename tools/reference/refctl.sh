#!/usr/bin/env bash
# Drive the reference player (Adobe's projector under Wine in the rr-ref container).
# Coordinates are stage coordinates (800x600 game space); the stage origin is found
# from the projector window.
#   refctl.sh shot <file.png>        whole stage
#   refctl.sh click <x> <y>          left click
#   refctl.sh move <x> <y>
#   refctl.sh down | up              mouse button
#   refctl.sh type <text>
#   refctl.sh key <keysym> [ms]      tap, or hold for ms
#   refctl.sh keydown|keyup <keysym>
set -euo pipefail
C=${REF_CONTAINER:-rr-ref}
x() { docker exec "$C" env DISPLAY=:5 "$@"; }
origin() {
  local w; w=$(x xdotool search --onlyvisible --name "Projector|Robot|Shockwave" | tail -1)
  x xdotool getwindowgeometry --shell "$w" | awk -F= '/^X=/{X=$2} /^Y=/{Y=$2} END{print X, Y}'
}
cmd=$1; shift
case $cmd in
  shot)
    read -r ox oy < <(origin)
    x import -window root -crop "800x600+${ox}+${oy}" +repage /ref/_shot.png
    docker cp "$C:/ref/_shot.png" "$1" >/dev/null ;;
  click) read -r ox oy < <(origin); x xdotool mousemove $((ox + $1)) $((oy + $2)) sleep 0.1 mousedown 1 sleep 0.12 mouseup 1 ;;
  move) read -r ox oy < <(origin); x xdotool mousemove $((ox + $1)) $((oy + $2)) ;;
  down) x xdotool mousedown 1 ;;
  up) x xdotool mouseup 1 ;;
  type) x xdotool type --delay 40 "$1" ;;
  key) if [ -n "${2:-}" ]; then x xdotool keydown "$1" sleep "$(awk "BEGIN{print $2/1000}")" keyup "$1"; else x xdotool key "$1"; fi ;;
  keydown) x xdotool keydown "$1" ;;
  keyup) x xdotool keyup "$1" ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
