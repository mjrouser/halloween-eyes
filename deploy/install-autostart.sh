#!/usr/bin/env bash
# install-autostart.sh — installs the show's systemd user service and nightly cron.
#
# Run ON THE PI as eyesadmin (no sudo), after copying the repo to ~/halloween-eyes:
#   bash ~/halloween-eyes/deploy/install-autostart.sh
# Safe to re-run.
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"

# Keep the user service manager alive with no one logged in, so the show
# survives the gap while the desktop restarts (see deploy/lightdm/).
loginctl enable-linger "$USER"

mkdir -p ~/.config/systemd/user
cp "$DEPLOY/halloween-eyes.service" ~/.config/systemd/user/
systemctl --user daemon-reload

# eyesadmin's crontab holds only the show schedule, so replace it whole.
crontab "$DEPLOY/crontab.example"

echo "Installed. Start the show now with: systemctl --user start halloween-eyes"
echo "Enabled at boot (expect 'static': no boot hook): $(systemctl --user is-enabled halloween-eyes.service || true)"
