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
Yes. Neither planned rung was needed: Chromium running under **XWayland** honours
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
**Not yet tested.** Needs autostart, so it moves into Task 12 and must be done there
before Task 12 is called complete.

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

## Still open

- Which physical port is `HDMI-A-1` vs `HDMI-A-2`. Label the cables before install so
  the LEFT window ends up in the left window.
- Reboot/power-cycle test (question 2) — Task 12.
