#!/usr/bin/env bash
# launch-windows.sh — starts the show server and one Chromium window per monitor.
#
# Run by the halloween-eyes systemd user service (deploy/halloween-eyes.service),
# not by hand. Install steps: deploy/install-autostart.sh.
#
# Differences from docs/PLAN.md Task 12, all from docs/SPIKE-NOTES.md:
# - The session is labwc (Wayland). Chromium runs under XWayland, which honors
#   --window-position, so there is no xrandr step. xset does not apply either;
#   blanking is already off (no swayidle running).
# - Each window gets an explicit ?viewport= so placement never depends on
#   launch order.
# - --password-store=basic stops a keyring dialog from covering the show.
#
# If either window or the server dies, the script exits and systemd restarts
# the whole set. The show is a function of wall-clock time, so a restarted
# window rejoins in phase with nothing to restore.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/halloween-eyes}"
PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/"

# Chromium under XWayland needs both of these; without DISPLAY it exits with
# "Missing X server or \$DISPLAY".
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

cd "$APP_DIR"

# If the desktop is not up yet (boot, or mid-relogin), fail fast and let
# systemd retry, rather than launching windows into nothing.
if [ ! -S "${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}" ]; then
  echo "desktop not ready (no ${WAYLAND_DISPLAY}); retrying later" >&2
  exit 1
fi

python3 server/serve.py --root public --config server/config.json --port "$PORT" &

# Wait for the server rather than sleeping a guessed number of seconds.
for _ in $(seq 1 50); do
  if curl -fsS "${URL}config.json" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

CHROME_FLAGS=(
  # Force XWayland. With WAYLAND_DISPLAY set, Chromium otherwise picks native
  # Wayland on its own, where --window-position is ignored.
  --ozone-platform=x11
  --kiosk
  --password-store=basic
  --noerrdialogs
  --disable-session-crashed-bubble
  --disable-infobars
  --check-for-update-interval=31536000
)

chromium "${CHROME_FLAGS[@]}" --user-data-dir=/tmp/eyes-left \
  --window-position=0,0    "${URL}?viewport=left" &
chromium "${CHROME_FLAGS[@]}" --user-data-dir=/tmp/eyes-right \
  --window-position=1920,0 "${URL}?viewport=right" &

# Exit as soon as any one of the three dies; systemd restarts all of them.
wait -n
echo "a show process exited; restarting the set" >&2
exit 1
