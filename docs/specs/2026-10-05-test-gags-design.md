# Test gags — design

Trigger a specific performance on demand, for testing: at a desk with a URL parameter, and
on the Pi from the phone control page. Approved in conversation 2026-10-05.

## Why

Performances are picked by hashing the cycle index, so waiting for a particular gag means
computing when it next plays and standing by (that is how the crowd-gag fix was checked on
2026-09-29). A trigger makes it repeatable: pick a gag, watch it, watch it again.

## The constraint that shapes it

Both windows compute every frame independently from the wall clock (CLAUDE.md). A "play now"
command that each window handles on arrival would desync them. So a trigger is never "now":
it is **"gag X, starting at time T"**, and both windows get the same X and T.

## Behavior

### Director (`public/js/director.js`)

`showState(tMs, cfg)` accepts an optional `cfg.testGag = { name, at, expires }`.

- From `at`, the performance is `name` on a loop: the full performance, then a **4 s**
  pause, then again. Loop *k* starts at `at + k * period`, where
  `period = profileDuration(name) + 4000`.
- The loop ends at `end`, the first loop boundary at or after `expires`
  (`at + ceil((expires - at) / period) * period`), so the last loop is never cut off
  mid-performance. A test can run up to one period past `expires`.
- No snapping at the edges. A normal-show performance that would be running at `at` or
  at `end` is replaced by idle for its whole length, rather than switching on or off
  mid-pose (`bothOneWindow` would jump between windows).
- Outside that span, or when `testGag` is absent, the show runs exactly as today.
- Known limit: **Stop** mid-performance still snaps to the normal show. Each window holds
  only the current config, not what it was showing a moment ago, so there is nothing to
  ease from.
- Everything else (idle gaze, blinks, wander, energy) is unchanged and still clock-derived.
- Still a pure function of time and config. No `Math.random()`.
- Any of the **seven** performances can be named: the four gags in `GAG_NAMES` and the three
  reactions in `REACTION_NAMES` (`public/js/poses.js`). An unknown name is ignored.

### At a desk (`public/js/main.js`)

`?gag=<name>` on the show URL sets `testGag = { name, at: 0, expires: Infinity }`.

- `at: 0` aligns the loop to the clock, not to page load, so two desk windows opened with
  the same parameter stay in sync.
- No expiry at the desk: it loops until the parameter is removed.
- An unknown name is ignored and the normal show runs.

### On the Pi (phone control page, server, config client)

- **Control page** (`public/control.html`): a new "Test a gag" row with one button per
  performance and a **Stop** button.
- **Server** (`server/serve.py`): accepts `testGag` as a performance name or `"off"`.
  Posting a name stores `testGag` plus its own `testGagAt = now + SCHEDULE_LEAD_MS` (the
  existing 5 s lead, so both windows have polled it before it starts). Posting `"off"`
  clears it.
- **Expiry: 2 minutes** after `testGagAt` (`expires = testGagAt + 120000`), applied in the
  director and rounded up to the end of the current loop (see Director above). A test left running cannot loop all Halloween night.
- **Its own start time.** `testGagAt` is separate from `effectiveAt`, so changing the
  palette later cannot replay an old test, and neither can a reboot: by then its two
  minutes are long gone.
- **Config client** (`public/js/config-client.js`): passes `testGag`/`testGagAt` through
  after validating the name against the same performance list. Anything unrecognized is
  dropped, as for the existing keys.

## Safety

- **The show must never depend on the control channel.** If it is down, nothing changes:
  tests are simply unavailable. A malformed or unknown `testGag` is a no-op at every layer.
- **One list of names.** The server's allowed names are a Python copy of the JS lists. A
  pytest reads `public/js/poses.js` and fails if the two differ, so they cannot drift.
- **Off by default.** No `testGag` in `config.default.json`, so a fresh install never loops.
- **Freeze (2026-10-28).** This adds a code path that runs every night. Off by default and
  self-expiring; landing it in early October leaves weeks of nightly running before freeze.

## Testing

Unit tests (`node --test`, `pytest`):

- Director: with a `testGag`, the named performance is active at the expected loop starts,
  idle in the 4 s pauses, and the normal show resumes at the first loop boundary after
  `expires`. No large frame-to-frame jump in crowd or vergence at the test's start or end. Unknown names are
  ignored. Two calls with the same `tMs` and config agree (determinism).
- Server: accepts each real name and `"off"`; rejects unknown names and non-strings; sets
  `testGagAt` 5 s ahead; a later palette change leaves `testGagAt` alone.
- Server/JS name lists match (the drift test above).
- Config client: passes valid `testGag` through, drops invalid ones.
- All existing tests and `tools/check-no-random.sh` still pass.

On the Pi: trigger `bothOneWindow` from the phone page and confirm with simultaneous `grim`
grabs of both outputs that the two windows play it together. Confirm that it stops by itself
after 2 minutes, and that Stop ends it early.

## Tunables

The 2-minute expiry and the 4 s pause are named constants, easy to change.

## Out of scope

- No "play once immediately" mode. Every trigger is scheduled, for the sync reason above.
- No changes to which performances exist or how they are picked in the normal show.
