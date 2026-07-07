#!/usr/bin/env bash
# Faithful §15.7 Firefox measurement: the SYSTEM Firefox on the user's real
# NATIVE WAYLAND session (GPU WebRender + accelerated canvas — how the game
# is actually played). One wtype keypress gesture-starts the bench; the app
# POSTs the result JSON to a local listener (?report=...).
set -euo pipefail
PORT=4177
node -e '
  const http = require("http");
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { console.log(body); res.end(); srv.close(); process.exit(0); });
  });
  srv.listen('"$PORT"');
  setTimeout(() => { console.error("no report"); process.exit(1); }, 110000);
' &
LISTENER=$!
PROFILE=$(mktemp -d)
export WAYLAND_DISPLAY=wayland-1 MOZ_ENABLE_WAYLAND=1
unset DISPLAY
firefox --new-instance --profile "$PROFILE" --width 1500 --height 1150 \
  "http://localhost:4173/?bench=1&report=http://localhost:$PORT/" >/dev/null 2>&1 &
FFPID=$!
trap 'kill $FFPID $LISTENER 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 7
wtype -k space   # gesture-start (focused new window)
wait $LISTENER
