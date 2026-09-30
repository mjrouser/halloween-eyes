#!/usr/bin/env bash
# start-if-show-hours.sh — at boot, start the show only if now is inside show hours.
#
# Run by cron's @reboot line (deploy/crontab.example), so a power blip at 19:00
# on Oct 31 brings the eyes back instead of leaving them dark until tomorrow.
# A 3am reboot still leaves the windows dark: outside the window this does nothing.
#
# The show window is NOT defined here. It is read from the start and stop lines
# of deploy/crontab.example (the file install-autostart.sh installs), so the
# boot check and the nightly schedule cannot drift apart.
#
# Usage:
#   deploy/start-if-show-hours.sh
# Testing (no systemctl, just print the decision):
#   DRY_RUN=1 SHOW_NOW="2026-10-31 19:00" deploy/start-if-show-hours.sh
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"
CRONTAB="$DEPLOY/crontab.example"
SERVICE="halloween-eyes.service"

# Pull "minute hour month" out of the cron line that runs a given verb.
# Matches e.g. "45 17 * 10 * systemctl --user start halloween-eyes.service".
cron_fields() {
  awk -v verb="$1" -v svc="$SERVICE" '
    $6 == "systemctl" && $7 == "--user" && $8 == verb && $9 == svc { print $1, $2, $4; exit }
  ' "$CRONTAB"
}

read -r start_min start_hour start_month <<<"$(cron_fields start)" || true
read -r stop_min stop_hour stop_month <<<"$(cron_fields stop)" || true

# Refuse to guess if the crontab changed shape; a loud failure beats a wrong start.
for v in "$start_min" "$start_hour" "$start_month" "$stop_min" "$stop_hour" "$stop_month"; do
  if ! [[ "$v" =~ ^[0-9]+$ ]]; then
    echo "start-if-show-hours: cannot read the show window from $CRONTAB" >&2
    exit 1
  fi
done
if [[ "$start_month" != "$stop_month" ]]; then
  echo "start-if-show-hours: start and stop lines name different months" >&2
  exit 1
fi

# "Now" as "YYYY-MM-DD HH:MM". SHOW_NOW overrides it for testing.
now="${SHOW_NOW:-$(date '+%Y-%m-%d %H:%M')}"
if ! [[ "$now" =~ ^[0-9]{4}-([0-9]{2})-[0-9]{2}\ ([0-9]{2}):([0-9]{2})$ ]]; then
  echo "start-if-show-hours: bad time '$now' (want YYYY-MM-DD HH:MM)" >&2
  exit 1
fi
# 10# forces base 10, so "08" and "09" are not read as octal.
now_month=$((10#${BASH_REMATCH[1]}))
now_minutes=$((10#${BASH_REMATCH[2]} * 60 + 10#${BASH_REMATCH[3]}))
start_minutes=$((10#$start_hour * 60 + 10#$start_min))
stop_minutes=$((10#$stop_hour * 60 + 10#$stop_min))

# Same rule cron applies: in the show month, start <= now < stop.
if (( now_month == 10#$start_month && now_minutes >= start_minutes && now_minutes < stop_minutes )); then
  decision=start
else
  decision=skip
fi
printf 'start-if-show-hours: now=%s window=month %s %02d:%02d-%02d:%02d -> %s\n' \
  "$now" "$start_month" "$start_hour" "$start_min" "$stop_hour" "$stop_min" "$decision"

[[ "$decision" == start ]] || exit 0
[[ -z "${DRY_RUN:-}" ]] || exit 0

# At @reboot the user service manager may not be up yet. Wait for it (linger
# starts it early; 2 minutes is generous). The service itself then retries
# until the desktop is up, so starting before the desktop is fine.
for _ in $(seq 60); do
  systemctl --user show-environment >/dev/null 2>&1 && break
  sleep 2
done
systemctl --user start "$SERVICE"
