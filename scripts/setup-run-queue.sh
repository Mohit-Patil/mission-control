#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_PATH="/etc/systemd/system/mission-control-run-queue.service"
TIMER_PATH="/etc/systemd/system/mission-control-run-queue.timer"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo $0)" >&2
  exit 1
fi

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Mission Control Run Queue Worker
After=network.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT_DIR
ExecStart=/usr/bin/node $ROOT_DIR/scripts/run-queue.mjs
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

cat > "$TIMER_PATH" <<EOF
[Unit]
Description=Run Mission Control queue worker every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now mission-control-run-queue.timer
systemctl status mission-control-run-queue.timer --no-pager
