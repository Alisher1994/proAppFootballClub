#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/admina/proAppFootballClub}"
START_SCRIPT="$PROJECT_DIR/bridge/start-camera-kiosk-browser.sh"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/karasu-camera-kiosk.desktop"

if [ ! -f "$START_SCRIPT" ]; then
  echo "Missing $START_SCRIPT" >&2
  exit 1
fi

if ! command -v chromium >/dev/null 2>&1 \
  && ! command -v chromium-browser >/dev/null 2>&1 \
  && [ ! -x /snap/bin/chromium ] \
  && ! command -v google-chrome >/dev/null 2>&1 \
  && ! command -v firefox >/dev/null 2>&1; then
  echo "No supported browser found. Install Chromium or Firefox first." >&2
  exit 1
fi

chmod 700 "$START_SCRIPT"
mkdir -p "$AUTOSTART_DIR"
cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Karasu Camera Kiosk
Comment=Open the local camera monitor in fullscreen mode
Exec=$START_SCRIPT
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=8
EOF
chmod 600 "$DESKTOP_FILE"

echo "Camera kiosk browser autostart installed: $DESKTOP_FILE"
echo "Reboot the mini PC or log out and back in to start kiosk mode."
