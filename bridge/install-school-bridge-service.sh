#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_SCRIPT="$PROJECT_DIR/bridge/run-school-bridge.sh"
SERVICE_FILE="/etc/systemd/system/karasu-school-bridge.service"

if [ ! -f "$RUN_SCRIPT" ]; then
  echo "Missing $RUN_SCRIPT"
  echo "Create it from bridge/run-school-bridge.example.sh and fill DEVICE_INGEST_KEY/HIK_PASS."
  exit 1
fi

chmod +x "$RUN_SCRIPT"

sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Karasu Hikvision School Bridge
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$RUN_SCRIPT
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable karasu-school-bridge.service
sudo systemctl restart karasu-school-bridge.service

echo "Service installed and started."
echo "Status: sudo systemctl status karasu-school-bridge --no-pager"
echo "Logs:   journalctl -u karasu-school-bridge -f"
