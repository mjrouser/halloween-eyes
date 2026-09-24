# Halloween Eye Windows — project instructions

Two animated eyes, one per second-floor front window, driven by a single Raspberry Pi 5,
running nightly through October 2026. Halloween is **Saturday 2026-10-31**. The effect must
read as **playful and mischievous, not frightening** — small children are the audience, and
success is judged from the sidewalk at night, not from the room.

Full design: [docs/DESIGN.md](docs/DESIGN.md). Implementation plan: [docs/PLAN.md](docs/PLAN.md).
These are the source of truth. The constraints below are repeated here so they survive when
those documents are not in context.

---

## Non-negotiable constraints

**No `Math.random()` anywhere in show logic.**
Both browser windows compute every frame independently from the wall clock. A single random
call desynchronizes them. All variation comes from hashing a time-slot index — same slot, same
result, forever. Enforced by `tools/check-no-random.sh`.

**Both eyes share ONE timeline.**
Vertebrate eyes are yoked. Model gaze as one shared target plus a vergence offset. Never two
independent eyes.

**Eye geometry derives from a single `side` parameter.**
Brow polygon, contact-shadow gradient direction and glint position all mirror off that one
value. Never hand-mirror the two eyes — doing so caused a real asymmetry bug during design.

**Foreshortening is derived, never chosen by eye.**
`sqrt(1 - (x/R)^2)`, which is ~0.912 at full travel. Picking it by eye produced ~0.72, and the
eye read as a spinning disc rather than a turning eyeball.

**Apparent stage gap must be >= 1.0 eye widths** (default 1.2).
Narrower and an eye in transit appears in both windows at once, where the two independently
rendered halves can tear. Enforce in config validation.

**The show must never depend on the control channel.**
A failed config poll is a no-op, never an error state. The eyes keep running.

**Zero third-party dependencies. Deliberately.**
Node 22 via `nvm use` — the system default is v16 and is EOL. Python 3 stdlib only.
Tests are `node --test` and `pytest`.

**Code freeze: Wednesday 2026-10-28.** No changes after that date.

---

## Working notes

- Tasks 1–7 of the plan are pure JavaScript and need no hardware. Nothing there is blocked
  on the monitors arriving.
- Task 8 is a spike on the Pi and is the only remaining item that could force an
  architectural change: it asks whether `window.screenX` reports a window's position. If it
  does not, self-detecting viewports are off the table and Task 12 changes.
- This repo is public. There is nothing sensitive in it; the design docs are normal project
  documentation and belong in version control.
