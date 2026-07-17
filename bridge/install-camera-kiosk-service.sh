#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/admina/proAppFootballClub}"
SERVICE_NAME="${SERVICE_NAME:-karasu-camera-kiosk.service}"
RUN_FILE="$PROJECT_DIR/bridge/run-camera-kiosk.sh"

if [ ! -f "$RUN_FILE" ]; then
  echo "Create $RUN_FILE from bridge/run-camera-kiosk.example.sh and set DEVICE_INGEST_KEY first."
  exit 1
fi

python3 -m venv "$PROJECT_DIR/.venv-camera"
"$PROJECT_DIR/.venv-camera/bin/pip" install --upgrade pip
"$PROJECT_DIR/.venv-camera/bin/pip" install -r "$PROJECT_DIR/bridge/requirements-camera-kiosk.txt"
chmod 700 "$RUN_FILE"

sudo tee "/etc/systemd/system/$SERVICE_NAME" >/dev/null <<EOF
[Unit]
Description=Karasu read-only camera kiosk
After=network-online.target karasu-school-bridge.service
Wants=network-online.target

[Service]
Type=simple
User=admina
WorkingDirectory=$PROJECT_DIR
ExecStart=$RUN_FILE
Restart=always
RestartSec=4
Nice=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager
