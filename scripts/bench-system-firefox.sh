#!/usr/bin/env bash
# Task 13.1: run ?bench=1 in the SYSTEM Firefox (real GPU/display — the
# faithful §15.7 reference-machine measurement; the Playwright-patched build
# has no GPU access in this environment). Drives with xdotool: one keypress
# gesture-starts the bench; the app publishes the result JSON in the window
# title (BENCHDONE ...), scraped via xdotool getwindowname.
set -euo pipefail
URL="${1:-http://localhost:4173/?bench=1}"
PROFILE=$(mktemp -d)
export DISPLAY="${DISPLAY:-:0}"
firefox --new-instance --profile "$PROFILE" --width 1500 --height 1150 "$URL" >/dev/null 2>&1 &
FFPID=$!
trap 'kill $FFPID 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 6
WID=$(xdotool search --sync --name "Teapot|BENCH" | head -1)
xdotool windowactivate "$WID"; sleep 1
xdotool key --window "$WID" space   # gesture-start
for i in $(seq 1 100); do
  TITLE=$(xdotool getwindowname "$WID" 2>/dev/null || true)
  case "$TITLE" in BENCHDONE*) echo "${TITLE#BENCHDONE }"; exit 0;; esac
  sleep 1
done
echo "no result within 100 s" >&2
exit 1
