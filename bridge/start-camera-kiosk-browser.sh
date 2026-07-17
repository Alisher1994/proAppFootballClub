#!/usr/bin/env bash
set -euo pipefail

KIOSK_URL="${CAMERA_KIOSK_URL:-http://127.0.0.1:8090}"

# Keep the locally attached monitor awake while the kiosk session is active.
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.session idle-delay 0 >/dev/null 2>&1 || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' >/dev/null 2>&1 || true
fi
if command -v xset >/dev/null 2>&1; then
  xset s off >/dev/null 2>&1 || true
  xset -dpms >/dev/null 2>&1 || true
  xset s noblank >/dev/null 2>&1 || true
fi

# Wait for the local camera service instead of opening a browser error page at boot.
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 "$KIOSK_URL/api/status" >/dev/null; then
    break
  fi
  sleep 2
done

if command -v chromium >/dev/null 2>&1; then
  BROWSER="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  BROWSER="$(command -v chromium-browser)"
elif [ -x /snap/bin/chromium ]; then
  BROWSER="/snap/bin/chromium"
elif command -v google-chrome >/dev/null 2>&1; then
  BROWSER="$(command -v google-chrome)"
elif command -v firefox >/dev/null 2>&1; then
  exec "$(command -v firefox)" --kiosk "$KIOSK_URL"
else
  echo "No supported browser found. Install Chromium or Firefox." >&2
  exit 1
fi

exec "$BROWSER" \
  --kiosk \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-gpu \
  --disable-features=Translate \
  --user-data-dir="$HOME/.config/karasu-camera-kiosk-browser" \
  "$KIOSK_URL"
