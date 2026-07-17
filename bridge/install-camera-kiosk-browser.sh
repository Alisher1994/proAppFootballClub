#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/admina/proAppFootballClub}"
START_SCRIPT="$PROJECT_DIR/bridge/start-camera-kiosk-browser.sh"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/karasu-camera-kiosk.desktop"
OPENBOX_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/openbox"
OPENBOX_AUTOSTART="$OPENBOX_DIR/autostart"

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

if command -v openbox-session >/dev/null 2>&1; then
  mkdir -p "$OPENBOX_DIR"
  cat >"$OPENBOX_AUTOSTART" <<EOF
#!/usr/bin/env sh
$START_SCRIPT &
EOF
  chmod 700 "$OPENBOX_AUTOSTART"
fi

if command -v lightdm >/dev/null 2>&1; then
  sudo install -d -m 755 /etc/lightdm/lightdm.conf.d
  printf '%s\n' \
    '[Seat:*]' \
    'autologin-user=admina' \
    'autologin-user-timeout=0' \
    'user-session=openbox' \
    | sudo tee /etc/lightdm/lightdm.conf.d/50-karasu-kiosk.conf >/dev/null
  sudo systemctl set-default graphical.target
  sudo systemctl enable lightdm.service
fi

echo "Camera kiosk browser autostart installed: $DESKTOP_FILE"
if command -v lightdm >/dev/null 2>&1; then
  echo "LightDM autologin enabled for admina with the Openbox kiosk session."
fi
echo "Reboot the mini PC or log out and back in to start kiosk mode."
