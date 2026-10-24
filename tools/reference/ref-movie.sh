#!/usr/bin/env bash
# Run one game movie directly in the reference player with ref-repl installed, for
# asking Adobe's player questions with refeval.sh. The REPL does not survive a movie
# switch, so this starts the movie itself (e.g. arena104.dcr) rather than the wrapper.
#   tools/reference/ref-movie.sh arena104.dcr [port]
# Run ref-start.sh once first (it copies the projector and the game files).
set -euo pipefail
cd "$(dirname "$0")/../.."
MOVIE=${1:?movie file, e.g. arena104.dcr}
PORT=${2:-8091}
WORK=${REF_WORK:-/tmp/rrwork/ref}
C=${REF_CONTAINER:-rr-ref}
# Containers share the host's network, so each needs its own X display: rr-ref uses :5,
# others one derived from their name (or REF_DISPLAY).
D=${REF_DISPLAY:-$([ "$C" = rr-ref ] && echo :5 || echo ":$((10 + $(printf %s "$C" | cksum | cut -d' ' -f1) % 80))")}
[ -d "$WORK/spr/game" ] || { echo "run tools/reference/ref-start.sh first" >&2; exit 1; }
curl -fsS "http://127.0.0.1:$PORT/game/main.ini" > "$WORK/spr/game/main.ini"
sed -i 's/^debugplaybackenabled = true/debugplaybackenabled = false/' "$WORK/spr/game/main.ini"
# The projector's script text needs CR line endings.
tr '\n' '\r' < tools/reference/ref-repl.ls > "$WORK/spr/ref-repl.txt"
rm -f "$WORK"/spr/ref-out* "$WORK/spr/ref-cmd.txt" "$WORK/spr/.refseq"
docker rm -f "$C" >/dev/null 2>&1 || true
# --do quirks: no dot-assignment (use `set the X of m to Y`), symbols with capitals
# arrive as VOID (build them with symbol(string(#x))), no literal "-" or "." in strings.
docker run -d --name "$C" --network host -e D="$D" -v "$WORK":/ref -e MOVIE="$MOVIE" robotrage-wine-ref bash -c '
  Xvfb $D -screen 0 1024x768x24 & sleep 1; export DISPLAY=$D; cd /ref/spr
  wine SPR.exe "game\\$MOVIE" \
    --do "x = new(xtra(string(#fileio)))" \
    --do "openFile(x, the applicationPath & string(#ref) & numToChar(45) & string(#repl) & numToChar(46) & string(#txt), 1)" \
    --do "s = readFile(x)" \
    --do "m = _movie.newMember(#script)" \
    --do "set the scriptType of m to #parent" \
    --do "set the scriptText of m to s" \
    --do "i = new(script(m))" \
    --do "t = new(timeout(), string(#refrepl), 200, symbol(string(#refpoll)), i)" \
    > /ref/wine.log 2>&1
  sleep infinity' >/dev/null
for i in $(seq 1 30); do
  sleep 2
  out=$(tools/reference/refeval.sh 'the movieName' 2>/dev/null) && { echo "reference running $out after $((i * 2))s"; exit 0; }
done
echo "reference REPL did not answer" >&2; exit 1
