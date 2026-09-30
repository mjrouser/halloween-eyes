# Week-1 spike — dual-output placement on the Pi

Task 8 of [PLAN.md](PLAN.md). Run 2026-09-23 on the bench, before any install.

## Setup

- Raspberry Pi 5, fresh Raspberry Pi OS 64-bit with desktop (Debian 13 "trixie"),
  flashed with Imager. Hostname `eyes`, user `eyesadmin`, reached as `eyes.local`.
- Desktop session: **labwc** (Wayland), with XWayland available on `DISPLAY=:0`.
- Two MSI MP225 monitors, 1920x1080 @ 60 Hz, one per micro-HDMI port.
- `wlr-randr` layout as booted: `HDMI-A-2` at 0,0 (left), `HDMI-A-1` at 1920,0 (right).
- Page served by `python3 -m http.server 8080 --bind 127.0.0.1` as a stand-in until
  Task 9's `server/serve.py` exists.

## Answers

**1. Can each window be placed on a chosen output? Which rung worked?**
Yes. Neither planned rung was needed: Chromium running under **XWayland** honors
`--window-position`. Switching the whole session to X11 (rung 2) is unnecessary.
Working launch, one line per window:

```bash
export DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/$(id -u)
chromium --user-data-dir=/tmp/eyes-a --password-store=basic --kiosk \
  --window-position=0,0    "http://localhost:8080/?setup" &
chromium --user-data-dir=/tmp/eyes-b --password-store=basic --kiosk \
  --window-position=1920,0 "http://localhost:8080/?setup" &
```

Every flag there is load-bearing:
- `DISPLAY=:0` — without it Chromium picks its X11 backend, finds no display, and exits
  ("Missing X server or $DISPLAY").
- Separate `--user-data-dir` per window — otherwise the second launch hands off to the
  first process and its position flag is ignored.
- `--password-store=basic` — otherwise a "Choose password for new keyring" dialog
  appears over the show. On an unattended boot that would mean a blocked window.

**2. Does it survive a reboot (five power cycles)?**
**Yes — 5 of 5 passed (2026-09-28, Task 12 step 5).** Each reboot checked: autologin
reached the desktop with no greeter; both outputs enabled at `0,0` / `1920,0`; the show
service stayed `inactive` at boot (by design — cron starts it); after
`systemctl --user start halloween-eyes`, both windows came up and a `grim` screenshot of
each output showed the correct eye (brows slope inward, gaze yoked), with no dialogs.

| Reboot | Boot time | Result |
|---|---|---|
| 1 | 21:44:22 | pass |
| 2 | 21:47:10 | pass |
| 3 | 21:49:15 | pass |
| 4 | 21:50:42 | pass |
| 5 | 21:52:05 | pass |

**Reboot during show hours (2026-09-29).** A reboot at 3am must stay dark, but a power blip
at 19:00 on Oct 31 used to leave the eyes dark until 17:45 the next day. Now an `@reboot`
cron line runs `deploy/start-if-show-hours.sh`, which starts the service only inside the
window. The window is read from the crontab's own start/stop lines, so the two cannot drift.
Both cases tested with real reboots:

| Boot time | Faked now | Boot decision | Service after boot |
|---|---|---|---|
| 19:58:16 | none (Sep 29) | `skip` | `inactive` |
| 20:01:40 | `SHOW_NOW="2026-10-31 19:00"` | `start` | `active` (one retry while the desktop came up) |

The in-window case used a temporary crontab with `SHOW_NOW` on the `@reboot` line, since
restored. Simultaneous `grim` pairs showed brows scowling inward and gaze yoked. Grab both
outputs at once (`grim ... & grim ... & wait`): sequential grabs can straddle a saccade and
make the eyes look unyoked when they are not. Boot decisions log to the journal:
`journalctl -t halloween-eyes -b`.

**3. Does `window.screenX` report the window's position?**
Yes. With `?setup`, the two windows labelled themselves LEFT and RIGHT correctly
from `screenX` alone. Self-detecting viewports (Task 7) work under XWayland, so launch
order does not matter.

## Framerate and CPU

Animation smooth, both eyes visibly in sync. The two Chromium renderer processes had
used ~1.3 s and ~1.7 s of CPU after roughly two minutes, about 1–2% of one core. No
case for the native renderer (spec approach 3).

## Gotchas found on the way

- **Micro-HDMI plugs must be pushed fully home.** They feel seated a few millimetres
  early. Symptom: monitors flash "no signal" and sleep; `/sys/class/drm/card1-HDMI-A-*/status`
  reads `disconnected`; `wlr-randr` shows only `NOOP-1 "Headless output"`. Belongs in the
  runbook's "Nothing on either screen" section (Task 13).
- `$XDG_SESSION_TYPE` is empty over SSH. Detect the compositor with
  `ps -e | grep -E "labwc|wayfire|Xorg"` instead.
- Desktop tools over SSH need `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/$(id -u)`.
- **Powering the monitors off and on** broke the show two different ways, both now fixed:
  labwc exited and the Pi sat at the login screen (fixed by `deploy/lightdm/`), and
  both outputs stayed disabled — "HDMI no signal" — because kanshi's config was empty
  (fixed by `deploy/kanshi/config`). Verified: monitors off and on, eyes return.
- Chromium picks native Wayland by itself when `WAYLAND_DISPLAY` is set, and native
  Wayland ignores `--window-position`. `launch-windows.sh` forces `--ozone-platform=x11`.
- `grim -o HDMI-A-1 file.png` screenshots one monitor over SSH — a remote way to check
  which eye is on which screen.

## Still open

- Which physical port is `HDMI-A-1` vs `HDMI-A-2`. Label the cables before install so
  the LEFT window ends up in the left window.
- Reboot/power-cycle test (question 2) — Task 12.
