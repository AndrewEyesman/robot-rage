#!/usr/bin/env bash
# Evaluate Lingo in the reference player through ref-repl (see ref-start.sh).
#   refeval.sh '<lingo expression>'     prints string(expression)
#   refeval.sh -s '<statement>' ...      runs statements (one per argument), prints 1
set -euo pipefail
W=${REF_WORK:-/tmp/rrwork/ref}/spr
seq=$(( $(cat "$W/.refseq" 2>/dev/null || echo 0) + 1 )); echo "$seq" > "$W/.refseq"
if [ "$1" = -s ]; then
  shift; body=$(printf '%s\r' "$@")
  printf '%s\rglobal gRefOut\r%sgRefOut = 1' "$seq" "$body" > "$W/ref-cmd.txt"
else
  printf '%s\rglobal gRefOut\rgRefOut = %s' "$seq" "$1" > "$W/ref-cmd.txt"
fi
for i in $(seq 1 50); do
  if [ -f "$W/ref-out-$seq.txt" ]; then cat "$W/ref-out-$seq.txt"; echo; rm -f "$W/ref-out-$seq.txt"; exit 0; fi
  sleep 0.1
done
echo "refeval: no answer (is the reference running a movie that stays put?)" >&2; exit 1
