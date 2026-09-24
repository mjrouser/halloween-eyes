# Halloween Eye Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two animated eyes, one per second-floor window, driven by a single Raspberry Pi 5, running nightly through October.

**Architecture:** Two fullscreen Chromium windows on one Pi, each rendering its own slice of one shared virtual stage. Neither window talks to the other: both compute the entire show as a pure function of wall-clock time, `showState(t)`, so they agree by construction. A small Python stdlib server serves the page and a config file that both windows poll; style changes are scheduled at a future timestamp so both switch on the same frame.

**Tech Stack:** Vanilla ES modules (no framework, no build step), Python 3 stdlib `http.server`, `node --test` for JS tests, `pytest` for Python tests. **Zero third-party dependencies.**

**Spec:** `docs/DESIGN.md` (migrated into this repo 2026-09-20; formerly `homelab-status/docs/superpowers/specs/2026-09-17-halloween-eye-windows-design.md`)

**Target repo:** `~/repos/halloween-eyes` — the spec and this plan now live here too, as `docs/DESIGN.md` and `docs/PLAN.md`. They are the single source of truth; the `homelab-status` originals have been deleted.

---

## Global Constraints

- **No `Math.random()` anywhere in show logic.** Both windows compute each frame independently; a single random call desynchronizes them. Enforced by a lint step in CI and in Task 1.
- **Both eyes share one timeline.** Vertebrate eyes are yoked. Implement as one shared gaze target plus a vergence offset — never two independent eyes. (Spec §4.4)
- **Geometry is derived from a single `side` parameter**, never hand-written per eye. Brow polygon, contact-shadow gradient direction and glint position all mirror off that one value. (Spec §4.7)
- **Foreshortening is derived, not chosen:** `sqrt(1 - (x/R)^2)`. At the project's travel ratio of 0.41 that is 0.912. Do not hand-pick this value. (Spec §5)
- **Apparent gap floor: ≥ 1.0 eye widths**, default 1.2. Below 1.0 an eye in transit appears in both windows at once and the two independently-rendered halves can tear. Enforce in config validation. (Spec §4.1)
- **The show never depends on the control channel.** A failed config poll is a no-op, never an error state. (Spec §4.8)
- **Node 22** (`.nvmrc`). The system default is v16, which is EOL and where `node:test` is only experimental.
- **Python 3.13**, stdlib only, `venv`, PEP 8, `pathlib` over `os.path`, `logging` over `print`.
- Panel geometry: 1920×1080, 16:9, 102.5 PPI, active area 18.74″ × 10.54″.

## File Structure

```
halloween-eyes/
├── .nvmrc                      # 22
├── .gitignore
├── README.md
├── public/
│   ├── index.html              # the show page
│   ├── control.html            # phone control page
│   ├── css/show.css
│   └── js/
│       ├── rng.js              # deterministic hash-based randomness
│       ├── themes.js           # shape + palette data tables
│       ├── geometry.js         # eye geometry derived from shape + side
│       ├── render.js           # geometry -> SVG DOM
│       ├── stage.js            # stage <-> viewport mapping, gap validation
│       ├── poses.js            # pose table + motion profiles
│       ├── motion.js           # easing and profile application
│       ├── director.js         # showState(t) — the whole show, pure
│       ├── config-client.js    # polls config.json, schedules switches
│       └── main.js             # boot, viewport self-detection, rAF loop
├── server/
│   ├── serve.py                # static files + config GET/POST
│   └── config.default.json     # seed for config.json
├── tests/
│   ├── rng.test.mjs
│   ├── geometry.test.mjs
│   ├── stage.test.mjs
│   ├── motion.test.mjs
│   ├── director.test.mjs
│   └── test_serve.py
├── tools/
│   └── check-no-random.sh      # lint: fails on Math.random in show logic
├── deploy/
│   ├── launch-windows.sh       # positions the two Chromium windows
│   ├── halloween-eyes.service
│   └── crontab.example
└── docs/
    └── RUNBOOK.md
```

**Tasks 1–8 are pure JS and need no hardware.** Tasks 9–13 need the Pi. Start now.

> **Corrections applied during Task 1 (2026-09-20):**
> 1. `node --test tests/` does not work on Node 22 — a positional directory argument is
>    treated as a file to execute and fails to resolve. Use bare `node --test`, which scans
>    recursively from the repo root. Per-file invocations elsewhere in this plan are fine.
> 2. Task 1's `tools/check-no-random.sh` grepped raw file text, so it fired on the comment in
>    `rng.js` that explains the rule — the task could not pass as written. The script now
>    strips line and block comments before matching. Verified against six cases: real calls
>    are caught (including after a comment on the same line), comment prose is not.

---

### Task 1: Repo scaffold and deterministic RNG

**Files:**
- Create: `~/repos/halloween-eyes/.nvmrc`, `.gitignore`, `README.md`
- Create: `public/js/rng.js`
- Create: `tools/check-no-random.sh`
- Test: `tests/rng.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `hash32(n) -> number`, `rand01(n, salt=0) -> number`, `randInt(n, count, salt=0) -> number`, `pick(items, n, salt=0) -> any`

- [ ] **Step 1: Create the repo and scaffolding**

```bash
mkdir -p ~/repos/halloween-eyes/{public/js,public/css,server,tests,tools,deploy,docs}
cd ~/repos/halloween-eyes
git init -b main
echo "22" > .nvmrc
printf '__pycache__/\n*.pyc\n.venv/\nserver/config.json\n' > .gitignore
```

`server/config.json` is gitignored because it is runtime state; `config.default.json` is the tracked seed.

- [ ] **Step 2: Write the README**

```markdown
# Halloween Eyes

Two animated eyes, one per front window, on a Raspberry Pi 5.

## Run locally

    nvm use
    python3 server/serve.py --root public --port 8080
    open "http://localhost:8080/?viewport=left"

## Test

    node --test
    .venv/bin/pytest tests/

## Design

See `docs/DESIGN.md` for the design spec and `docs/PLAN.md` for the implementation plan.
```

- [ ] **Step 3: Write the failing test**

Create `tests/rng.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, rand01, randInt, pick } from '../public/js/rng.js';

test('hash32 is stable for the same input', () => {
  assert.equal(hash32(12345), hash32(12345));
});

test('hash32 spreads adjacent inputs apart', () => {
  const a = hash32(1000), b = hash32(1001);
  assert.ok(Math.abs(a - b) > 1000000, `adjacent hashes too close: ${a} vs ${b}`);
});

test('rand01 stays in [0,1)', () => {
  for (let i = 0; i < 500; i++) {
    const v = rand01(i);
    assert.ok(v >= 0 && v < 1, `out of range at ${i}: ${v}`);
  }
});

test('rand01 is stable and salt-sensitive', () => {
  assert.equal(rand01(42), rand01(42));
  assert.notEqual(rand01(42), rand01(42, 1));
});

test('randInt stays in range', () => {
  for (let i = 0; i < 500; i++) {
    const v = randInt(i, 7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7, `bad randInt at ${i}: ${v}`);
  }
});

test('pick returns a member of the list, stably', () => {
  const items = ['a', 'b', 'c'];
  assert.ok(items.includes(pick(items, 9)));
  assert.equal(pick(items, 9), pick(items, 9));
});
```

- [ ] **Step 4: Run the test and confirm it fails**

```bash
cd ~/repos/halloween-eyes && nvm use && node --test tests/rng.test.mjs
```

Expected: FAIL — `Cannot find module '../public/js/rng.js'`

- [ ] **Step 5: Implement `public/js/rng.js`**

```js
// Deterministic randomness for the show.
//
// Both browser windows compute every frame independently from the wall clock.
// Math.random() would make them disagree, so all variation in the show comes
// from hashing an integer slot index instead. Same slot, same result, forever.

const UINT32 = 4294967296;
const GOLDEN = 0x9e3779b1;

/** Mix an integer into a well-distributed unsigned 32-bit value. */
export function hash32(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A stable float in [0,1) for slot `n`. `salt` gives independent streams. */
export function rand01(n, salt = 0) {
  return hash32(Math.imul(n, GOLDEN) + salt) / UINT32;
}

/** A stable integer in [0, count) for slot `n`. */
export function randInt(n, count, salt = 0) {
  return Math.floor(rand01(n, salt) * count);
}

/** A stable element of `items` for slot `n`. */
export function pick(items, n, salt = 0) {
  return items[randInt(n, items.length, salt)];
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
node --test tests/rng.test.mjs
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Write the lint script**

Create `tools/check-no-random.sh`:

```bash
#!/usr/bin/env bash
# Fails if Math.random() appears in show logic.
# Both windows compute the show independently; one random call desynchronizes them.
set -euo pipefail

HITS=$(grep -rn 'Math\.random' public/js/ || true)

if [ -n "$HITS" ]; then
  echo "ERROR: Math.random() found in show logic." >&2
  echo "$HITS" >&2
  echo "Use rng.js (hash of a time slot) instead — see spec section 4.3." >&2
  exit 1
fi

echo "OK: no Math.random() in show logic."
```

```bash
chmod +x tools/check-no-random.sh && ./tools/check-no-random.sh
```

Expected: `OK: no Math.random() in show logic.`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: repo scaffold, deterministic RNG, no-random lint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Theme data and eye geometry

**Files:**
- Create: `public/js/themes.js`, `public/js/geometry.js`
- Test: `tests/geometry.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `SHAPES`, `PALETTES` (objects); `BASE` (constants); `eyeGeometry(shapeName, side, base=BASE) -> object`; `foreshorten(gaze, gazeMax) -> number`

The mirror-symmetry test is the point of this task. Hand-mirroring the two eyes caused a real
bug during design (one eye scowled harder than the other). Deriving both from `side` and
asserting they are exact mirrors removes that class of error permanently.

- [ ] **Step 1: Write `public/js/themes.js`**

```js
// Shape and palette are independent axes: any shape works in any palette.
// Both are switchable at runtime (see config-client.js), so nothing here may
// be baked into the renderer.

export const SHAPES = {
  // Bright field, dark pupil. Most legible gaze direction at distance.
  amber: { rxFactor: 1.00, ryFactor: 1.00, hasIris: true,  pupil: 'round', halo: false },
  // No sclera — a glowing orb. Best atmosphere, softer extremes.
  ember: { rxFactor: 0.76, ryFactor: 1.00, hasIris: false, pupil: 'slit',  halo: true  }
};

export const PALETTES = {
  amber: {
    sclera: ['#FFC96A', '#F0A72C', '#B96C07'],
    iris:   ['#B8541A', '#8A3505', '#421400'],
    pupil: '#150300', glint: '#FFF3D6', glintOpacity: 0.5, halo: '#FF8C1A',
    pupilOverride: null
  },
  green: {
    sclera: ['#F2FBCF', '#C3E07A', '#6B9B34'],
    iris:   ['#7BA83A', '#48701E', '#1B3A0A'],
    pupil: '#080F04', glint: '#FBFFE8', glintOpacity: 0.5, halo: '#9FD84A',
    // A cat's eye has a vertical slit — that, not the color alone,
    // is what turns a green eye into a cat.
    pupilOverride: 'slit'
  }
};

export const SHAPE_NAMES = Object.keys(SHAPES);
export const PALETTE_NAMES = Object.keys(PALETTES);
```

- [ ] **Step 2: Write the failing test**

Create `tests/geometry.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, eyeGeometry, foreshorten } from '../public/js/geometry.js';

const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ~= ${b}`);

test('foreshortening is derived from the sphere, not chosen', () => {
  near(foreshorten(0), 1);
  near(foreshorten(1), Math.sqrt(1 - 0.41 * 0.41));
  near(foreshorten(1), foreshorten(-1));
  assert.ok(foreshorten(1) > 0.9 && foreshorten(1) < 0.92,
    'full travel should compress by ~0.912, not a hand-picked value');
});

test('foreshortening clamps beyond full travel', () => {
  near(foreshorten(3), foreshorten(1));
});

test('left and right brows are exact mirrors', () => {
  const L = eyeGeometry('amber', 'L');
  const R = eyeGeometry('amber', 'R');
  near(L.brow.yLeft, R.brow.yRight);
  near(L.brow.yRight, R.brow.yLeft);
});

test('the brow sits lower on the inner edge of each eye', () => {
  const L = eyeGeometry('amber', 'L');
  const R = eyeGeometry('amber', 'R');
  // Left eye's inner edge is its right side; right eye's is its left.
  assert.ok(L.brow.yRight > L.brow.yLeft, 'left eye should scowl inward (rightward)');
  assert.ok(R.brow.yLeft > R.brow.yRight, 'right eye should scowl inward (leftward)');
});

test('glints mirror about the eye center', () => {
  const L = eyeGeometry('amber', 'L');
  const R = eyeGeometry('amber', 'R');
  near(L.glint.x - BASE.cx, BASE.cx - R.glint.x);
  near(L.glint.y, R.glint.y);
});

test('the contact shadow runs perpendicular to the brow line', () => {
  const g = eyeGeometry('amber', 'L');
  const browDx = BASE.W;
  const browDy = g.brow.yRight - g.brow.yLeft;
  const gradDx = g.contact.x2 - g.contact.x1;
  const gradDy = g.contact.y2 - g.contact.y1;
  near(browDx * gradDx + browDy * gradDy, 0, 1e-6);
});

test('the ember shape is narrower than the amber shape', () => {
  assert.ok(eyeGeometry('ember', 'L').rx < eyeGeometry('amber', 'L').rx);
});

test('an unknown shape is rejected rather than silently defaulted', () => {
  assert.throws(() => eyeGeometry('nope', 'L'), /unknown shape/i);
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
node --test tests/geometry.test.mjs
```

Expected: FAIL — `Cannot find module '../public/js/geometry.js'`

- [ ] **Step 4: Implement `public/js/geometry.js`**

```js
// All eye geometry, derived from one `side` value.
//
// Nothing here may be hand-written per eye. During design, hand-mirroring the
// two eyes produced an asymmetry bug where one scowled harder than the other.
// Deriving both sides from `side` makes that unrepresentable.

import { SHAPES } from './themes.js';

/** Proportions of the eye within a 16:9 panel. Fractions are of rx or of eye height. */
export const BASE = {
  W: 320, H: 180,          // viewBox, 16:9
  cx: 160, cy: 90,
  rx: 117, ry: 89,         // eye fills the panel height; ~73% of its width
  irisR: 0.43,             // of rx
  pupilR: 0.21,            // of rx
  browOuter: 0.00,         // of eye height, below the eye's top edge
  browInner: 0.27,
  contact: 0.15,           // contact shadow length, of eye height
  ambient: 0.18,           // socket ambient peak opacity
  glintDX: -0.14, glintDY: -0.145, glintR: 0.097,
  gazeMax: 0.41            // peak iris travel, as a fraction of rx
};

/**
 * Horizontal compression of the iris as the eyeball rotates.
 *
 * For travel x across a sphere of radius R the iris compresses by
 * cos(asin(x/R)) = sqrt(1 - (x/R)^2). At gazeMax = 0.41 that is 0.912 —
 * far subtler than it feels like it should be. Picking this by eye produced
 * ~0.72 during design, which read as a disc spinning rather than an eye turning.
 *
 * @param {number} gaze  -1..1, fraction of maximum travel
 */
export function foreshorten(gaze, gazeMax = BASE.gazeMax) {
  const ratio = Math.max(-1, Math.min(1, gaze)) * gazeMax;
  return Math.sqrt(1 - ratio * ratio);
}

/**
 * Every number needed to draw one eye.
 * @param {'amber'|'ember'} shapeName
 * @param {'L'|'R'} side
 */
export function eyeGeometry(shapeName, side, base = BASE) {
  const shape = SHAPES[shapeName];
  if (!shape) throw new Error(`unknown shape: ${shapeName}`);
  if (side !== 'L' && side !== 'R') throw new Error(`unknown side: ${side}`);

  const rx = base.rx * shape.rxFactor;
  const ry = base.ry * shape.ryFactor;
  const top = base.cy - ry;
  const eyeHeight = ry * 2;

  // The brow sits lower on the INNER edge, so the pair scowls toward each other.
  // Inner is the right side for the left eye, and vice versa.
  const yOuter = top + base.browOuter * eyeHeight;
  const yInner = top + base.browInner * eyeHeight;
  const yLeft = side === 'L' ? yOuter : yInner;
  const yRight = side === 'L' ? yInner : yOuter;

  // Contact shadow runs perpendicular to the brow line, in user space, so it
  // keeps one width along the whole edge. A bounding-box gradient leans.
  const dx = base.W;
  const dy = yRight - yLeft;
  const len = Math.hypot(dx, dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const midX = base.W / 2;
  const midY = (yLeft + yRight) / 2;
  const contactLen = base.contact * eyeHeight;

  // The glint is a reflection of one fixed light over the house, so it leans
  // the same way in world space on both eyes — which means mirrored per sprite.
  const glintX = base.cx + (side === 'L' ? base.glintDX : -base.glintDX) * rx;
  const glintY = base.cy + base.glintDY * ry;

  const pupilR = base.pupilR * rx;

  return {
    side, shapeName, rx, ry, top, eyeHeight,
    cx: base.cx, cy: base.cy, W: base.W, H: base.H,
    hasIris: shape.hasIris,
    halo: shape.halo,
    defaultPupil: shape.pupil,
    irisR: base.irisR * rx,
    pupil: { round: pupilR, slitRx: pupilR * 0.52, slitRy: pupilR * 1.72 },
    brow: { yLeft, yRight },
    contact: {
      x1: midX, y1: midY,
      x2: midX + perpX * contactLen,
      y2: midY + perpY * contactLen
    },
    ambient: { y1: top, y2: base.cy + 2, opacity: base.ambient },
    glint: { x: glintX, y: glintY, r: base.glintR * rx },
    gazeMaxPx: base.gazeMax * rx,
    gazeMax: base.gazeMax
  };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
node --test tests/geometry.test.mjs
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: theme tables and side-derived eye geometry

Mirror symmetry, perpendicular contact shadow and the foreshortening
formula are all asserted by tests rather than tuned by eye.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: SVG renderer

**Files:**
- Create: `public/js/render.js`
- Test: manual, via Task 7's page (no DOM in `node --test` without a dependency)

**Interfaces:**
- Consumes: `eyeGeometry`, `SHAPES`, `PALETTES`, `foreshorten`
- Produces: `createEyeSvg(geom, palette, idPrefix) -> SVGElement`, `updateEye(svgRefs, eyeState) -> void`, where `svgRefs` is the object returned on the element as `._refs`

- [ ] **Step 1: Implement `public/js/render.js`**

```js
// Builds one eye's SVG once, then mutates only the handful of attributes that
// change per frame. Rebuilding the tree each frame would be both slower and
// would restart any CSS transitions.

import { foreshorten } from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function radialGradient(id, cx, cy, stops) {
  const g = el('radialGradient', { id, cx, cy });
  for (const [offset, color] of stops) {
    g.appendChild(el('stop', { offset, 'stop-color': color }));
  }
  return g;
}

/**
 * Build the SVG for one eye. Returns the <svg> element with a `_refs` property
 * holding the nodes that change per frame.
 */
export function createEyeSvg(geom, palette, idPrefix) {
  const p = `${idPrefix}-${geom.side}`;
  const svg = el('svg', {
    viewBox: `0 0 ${geom.W} ${geom.H}`,
    role: 'img',
    'aria-label': geom.side === 'L' ? 'Left eye' : 'Right eye'
  });

  const defs = el('defs');
  defs.appendChild(radialGradient(`sc-${p}`, '42%', '34%', [
    ['0%', palette.sclera[0]], ['58%', palette.sclera[1]], ['100%', palette.sclera[2]]
  ]));
  if (geom.hasIris) {
    defs.appendChild(radialGradient(`ir-${p}`, '45%', '38%', [
      ['0%', palette.iris[0]], ['70%', palette.iris[1]], ['100%', palette.iris[2]]
    ]));
  }
  if (geom.halo) {
    const halo = el('radialGradient', { id: `ha-${p}`, cx: '50%', cy: '50%' });
    halo.appendChild(el('stop', { offset: '0%', 'stop-color': palette.halo, 'stop-opacity': 0.34 }));
    halo.appendChild(el('stop', { offset: '100%', 'stop-color': palette.halo, 'stop-opacity': 0 }));
    defs.appendChild(halo);
  }

  const clip = el('clipPath', { id: `cp-${p}` });
  clip.appendChild(el('ellipse', { cx: geom.cx, cy: geom.cy, rx: geom.rx, ry: geom.ry }));
  defs.appendChild(clip);

  const contact = el('linearGradient', {
    id: `ct-${p}`, gradientUnits: 'userSpaceOnUse',
    x1: geom.contact.x1, y1: geom.contact.y1, x2: geom.contact.x2, y2: geom.contact.y2
  });
  contact.appendChild(el('stop', { offset: '0%', 'stop-color': '#050409', 'stop-opacity': 0.7 }));
  contact.appendChild(el('stop', { offset: '100%', 'stop-color': '#050409', 'stop-opacity': 0 }));
  defs.appendChild(contact);

  const ambient = el('linearGradient', {
    id: `am-${p}`, gradientUnits: 'userSpaceOnUse',
    x1: 0, y1: geom.ambient.y1, x2: 0, y2: geom.ambient.y2
  });
  ambient.appendChild(el('stop', { offset: '0%', 'stop-color': '#050409', 'stop-opacity': geom.ambient.opacity }));
  ambient.appendChild(el('stop', { offset: '100%', 'stop-color': '#050409', 'stop-opacity': 0 }));
  defs.appendChild(ambient);

  svg.appendChild(defs);

  // No background rect. The container paints the black. An eye carrying its own
  // opaque canvas would drag a rectangle over its neighbor when the two overlap.
  if (geom.halo) {
    svg.appendChild(el('ellipse', {
      cx: geom.cx, cy: geom.cy, rx: geom.rx * 1.55, ry: geom.ry * 1.55, fill: `url(#ha-${p})`
    }));
  }
  svg.appendChild(el('ellipse', {
    cx: geom.cx, cy: geom.cy, rx: geom.rx, ry: geom.ry, fill: `url(#sc-${p})`
  }));

  const clipped = el('g', { 'clip-path': `url(#cp-${p})` });

  const mover = el('g');
  if (geom.hasIris) {
    mover.appendChild(el('circle', { cx: geom.cx, cy: geom.cy, r: geom.irisR, fill: `url(#ir-${p})` }));
  }
  const pupilRound = el('circle', { cx: geom.cx, cy: geom.cy, r: geom.pupil.round, fill: palette.pupil });
  const pupilSlit = el('ellipse', {
    cx: geom.cx, cy: geom.cy, rx: geom.pupil.slitRx, ry: geom.pupil.slitRy, fill: palette.pupil
  });
  mover.appendChild(pupilRound);
  mover.appendChild(pupilSlit);
  clipped.appendChild(mover);

  // The glint sits OUTSIDE the mover: it is a reflection of a fixed light, so it
  // holds still while the eyeball turns underneath it. Parenting it to the mover
  // makes the eye read as a decal sliding across a surface.
  clipped.appendChild(el('circle', {
    cx: geom.glint.x, cy: geom.glint.y, r: geom.glint.r,
    fill: palette.glint, opacity: palette.glintOpacity
  }));

  clipped.appendChild(el('polygon', {
    points: `0,-4 ${geom.W},-4 ${geom.W},${geom.brow.yRight} 0,${geom.brow.yLeft}`,
    fill: '#050409'
  }));
  const browNode = clipped.lastChild;

  clipped.appendChild(el('rect', { width: geom.W, height: geom.H, fill: `url(#am-${p})` }));
  clipped.appendChild(el('rect', { width: geom.W, height: geom.H, fill: `url(#ct-${p})` }));

  const lidTop = el('rect', { x: 0, y: geom.top, width: geom.W, height: 0, fill: '#050409' });
  const lidBot = el('rect', { x: 0, y: geom.cy, width: geom.W, height: 0, fill: '#050409' });
  clipped.appendChild(lidTop);
  clipped.appendChild(lidBot);

  svg.appendChild(clipped);

  svg._refs = { geom, mover, pupilRound, pupilSlit, browNode, lidTop, lidBot };
  return svg;
}

/**
 * Apply one frame of state to an already-built eye.
 * @param {object} refs      svg._refs
 * @param {object} s         { gaze, lid, brow, pupil, pupilShape }
 */
export function updateEye(refs, s) {
  const g = refs.geom;

  const tx = s.gaze * g.gazeMaxPx;
  const sx = foreshorten(s.gaze, g.gazeMax);
  refs.mover.setAttribute(
    'transform',
    `translate(${(g.cx + tx).toFixed(2)} ${g.cy}) scale(${sx.toFixed(4)} 1) translate(${-g.cx} ${-g.cy})`
  );

  const slit = s.pupilShape === 'slit';
  refs.pupilRound.setAttribute('display', slit ? 'none' : 'inline');
  refs.pupilSlit.setAttribute('display', slit ? 'inline' : 'none');
  refs.pupilRound.setAttribute('r', (g.pupil.round * s.pupil).toFixed(2));
  refs.pupilSlit.setAttribute('rx', (g.pupil.slitRx * s.pupil).toFixed(2));
  refs.pupilSlit.setAttribute('ry', (g.pupil.slitRy * s.pupil).toFixed(2));

  // Brow depth scales about the eye's top edge.
  const yL = g.top + (g.brow.yLeft - g.top) * s.brow;
  const yR = g.top + (g.brow.yRight - g.top) * s.brow;
  refs.browNode.setAttribute('points', `0,-4 ${g.W},-4 ${g.W},${yR.toFixed(2)} 0,${yL.toFixed(2)}`);

  const lidH = s.lid * g.ry;
  refs.lidTop.setAttribute('height', lidH.toFixed(2));
  refs.lidBot.setAttribute('y', (g.cy + g.ry - lidH * 0.62).toFixed(2));
  refs.lidBot.setAttribute('height', (lidH * 0.62).toFixed(2));
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: SVG eye renderer

Glint sits outside the moving group and eyes carry no background rect,
so overlapping eyes occlude by ellipse rather than by rectangle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Stage and viewport mapping

**Files:**
- Create: `public/js/stage.js`
- Test: `tests/stage.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `MIN_GAP_EYE_WIDTHS`, `DEFAULT_GAP_EYE_WIDTHS`, `makeStage({viewportW, eyeW, gapEyeWidths}) -> {totalW, gapPx, eyeW, viewports, toViewportX(stageX, which)}`

- [ ] **Step 1: Write the failing test**

Create `tests/stage.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStage, MIN_GAP_EYE_WIDTHS, DEFAULT_GAP_EYE_WIDTHS } from '../public/js/stage.js';

const cfg = { viewportW: 1920, eyeW: 1400 };

test('the stage spans both viewports plus the gap', () => {
  const s = makeStage({ ...cfg, gapEyeWidths: 1.2 });
  assert.equal(s.gapPx, 1400 * 1.2);
  assert.equal(s.totalW, 1920 * 2 + 1400 * 1.2);
});

test('a gap narrower than one eye is rejected', () => {
  assert.throws(
    () => makeStage({ ...cfg, gapEyeWidths: 0.8 }),
    /at least 1/i,
    'a sub-eye-width gap lets one eye appear in both windows at once'
  );
});

test('exactly one eye width is allowed', () => {
  assert.doesNotThrow(() => makeStage({ ...cfg, gapEyeWidths: MIN_GAP_EYE_WIDTHS }));
});

test('the default clears the floor', () => {
  assert.ok(DEFAULT_GAP_EYE_WIDTHS >= MIN_GAP_EYE_WIDTHS);
});

test('stage x maps into each viewport local space', () => {
  const s = makeStage({ ...cfg, gapEyeWidths: 1.0 });
  assert.equal(s.toViewportX(0, 'left'), 0);
  assert.equal(s.toViewportX(1920, 'left'), 1920);
  assert.equal(s.toViewportX(s.viewports.right.x0, 'right'), 0);
});

test('an eye parked in the wall is off-screen in both viewports', () => {
  const s = makeStage({ ...cfg, gapEyeWidths: 1.2 });
  const mid = s.viewports.left.x1 + s.gapPx / 2;
  assert.ok(s.toViewportX(mid, 'left') > 1920, 'should be past the left viewport');
  assert.ok(s.toViewportX(mid, 'right') < 0, 'should be before the right viewport');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
node --test tests/stage.test.mjs
```

Expected: FAIL — `Cannot find module '../public/js/stage.js'`

- [ ] **Step 3: Implement `public/js/stage.js`**

```js
// Both eyes live on one virtual stage. Each monitor shows a slice of it.
//
// The wall between the slices is a TIMING parameter, not a measurement. The real
// wall is 2.58x a screen width, which would leave an eye invisible for ~3.9s while
// crossing — a dead beat, not a joke. Nobody in the street can perceive whether the
// transit was to scale, so the gap is tuned by eye instead.

/**
 * Hard floor. Below one eye width, an eye in transit is visible in BOTH windows
 * at once — leading edge in one, trailing edge in the other. Those halves are
 * drawn by two independent processes, so any frame difference shows as a tear
 * down the middle of something that is meant to be one object.
 */
export const MIN_GAP_EYE_WIDTHS = 1.0;
export const DEFAULT_GAP_EYE_WIDTHS = 1.2;

export function makeStage({ viewportW, eyeW, gapEyeWidths = DEFAULT_GAP_EYE_WIDTHS }) {
  if (!(gapEyeWidths >= MIN_GAP_EYE_WIDTHS)) {
    throw new RangeError(
      `apparent gap must be at least ${MIN_GAP_EYE_WIDTHS} eye widths, got ${gapEyeWidths}. ` +
      `A narrower gap lets one eye appear in both windows at once, where the two ` +
      `independently rendered halves can fail to line up.`
    );
  }

  const gapPx = eyeW * gapEyeWidths;
  const totalW = viewportW * 2 + gapPx;
  const viewports = {
    left:  { x0: 0, x1: viewportW },
    right: { x0: viewportW + gapPx, x1: totalW }
  };

  return {
    totalW, gapPx, eyeW, viewportW, viewports,
    /** Stage x -> local x within one viewport. Values outside [0, viewportW] are off-screen. */
    toViewportX(stageX, which) {
      const vp = viewports[which];
      if (!vp) throw new Error(`unknown viewport: ${which}`);
      return stageX - vp.x0;
    }
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test tests/stage.test.mjs
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stage/viewport mapping with apparent-gap floor

The floor is enforced in code because the symptom of violating it is
subtle, intermittent and invisible on a desk.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Pose table and motion profiles

**Files:**
- Create: `public/js/poses.js`, `public/js/motion.js`
- Test: `tests/motion.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `POSES`, `PROFILES`, `GAG_NAMES`, `REACTION_NAMES` from `poses.js`; `easeInOut(u)`, `easeOut(u)`, `applyProfile(profile, elapsedMs) -> {amount, phase}` from `motion.js`

- [ ] **Step 1: Write `public/js/poses.js`**

```js
// A pose is WHERE things point. A motion profile is HOW it gets there.
// These are separate tables on purpose: a snap and a drift can target the same
// pose and read as completely different behaviors.
//
// Gaze is modelled as one shared target plus a vergence offset:
//     eyeL = target + vergence
//     eyeR = target - vergence
// Vertebrate eyes are yoked, so vergence is normally 0 and a gag is an explicit,
// temporary unlock. Never model the eyes as independent — they drift.

/**
 * target/vergence/lid/brow/pupil. `target: null` means "use the idle scan value".
 * `stage` names an optional stage-position behavior.
 */
export const POSES = {
  idle:          { target: null, vergence:  0.0, lid: 0.00, brow: 1.00, pupil: 1.00 },
  crossEyed:     { target:  0.0, vergence:  1.0, lid: 0.00, brow: 0.85, pupil: 1.00 },
  wallEyed:      { target:  0.0, vergence: -1.0, lid: 0.00, brow: 0.70, pupil: 1.00 },
  // One eye holds forward while the other drifts wide. Expressible with the same
  // two numbers — the shared target simply moves off center. No per-eye override.
  wanderingEye:  { target:  0.5, vergence: -0.5, lid: 0.00, brow: 0.90, pupil: 1.00 },
  bothOneWindow: { target: -0.3, vergence:  0.0, lid: 0.00, brow: 1.00, pupil: 1.00, stage: 'crowdLeft' },
  lockOn:        { target:  0.0, vergence:  0.0, lid: 0.00, brow: 1.70, pupil: 1.20 },
  suspicious:    { target: -0.35, vergence: 0.0, lid: 0.34, brow: 1.45, pupil: 1.00 },
  mockSurprise:  { target:  0.0, vergence:  0.0, lid: 0.00, brow: 0.12, pupil: 0.62 }
};

/**
 * Durations in ms, plus overshoot as a fraction.
 *
 * The rule: THE EFFORTFUL DIRECTION IS FAST, THE PASSIVE DIRECTION IS SLOW.
 * Convergence is muscular so cross-eyed snaps in and relaxes out. A wandering eye
 * drifts out passively and is yanked back by an active corrective saccade — the
 * opposite profile, which taste alone would not have suggested.
 */
export const PROFILES = {
  crossEyed:     { out:  140, hold: 1600, back:  900, overshoot: 0.00 },
  wallEyed:      { out:  160, hold: 1400, back:  800, overshoot: 0.00 },
  wanderingEye:  { out: 2500, hold: 1500, back:  120, overshoot: 0.03 },
  bothOneWindow: { out: 1600, hold: 2800, back: 1600, overshoot: 0.00 },
  lockOn:        { out:  120, hold: 1400, back:  700, overshoot: 0.00 },
  suspicious:    { out:  600, hold: 1800, back:  700, overshoot: 0.00 },
  mockSurprise:  { out:  130, hold:  900, back:  600, overshoot: 0.02 }
};

export const GAG_NAMES = ['crossEyed', 'wallEyed', 'wanderingEye', 'bothOneWindow'];
export const REACTION_NAMES = ['lockOn', 'suspicious', 'mockSurprise'];

/** Total wall-clock length of one pose performance. */
export function profileDuration(name) {
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown pose profile: ${name}`);
  return p.out + p.hold + p.back;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/motion.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProfile, easeInOut, easeOut } from '../public/js/motion.js';
import { PROFILES, POSES, GAG_NAMES, REACTION_NAMES, profileDuration } from '../public/js/poses.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ~= ${b}`);

test('easing functions are anchored at both ends', () => {
  near(easeInOut(0), 0); near(easeInOut(1), 1);
  near(easeOut(0), 0);   near(easeOut(1), 1);
});

test('a profile starts at rest and returns to rest', () => {
  const p = PROFILES.crossEyed;
  near(applyProfile(p, 0).amount, 0);
  near(applyProfile(p, profileDuration('crossEyed')).amount, 0);
});

test('a profile is fully applied through the hold', () => {
  const p = PROFILES.crossEyed;
  near(applyProfile(p, p.out).amount, 1);
  near(applyProfile(p, p.out + p.hold / 2).amount, 1);
  near(applyProfile(p, p.out + p.hold).amount, 1);
});

test('phases are reported for debugging', () => {
  const p = PROFILES.crossEyed;
  assert.equal(applyProfile(p, p.out / 2).phase, 'out');
  assert.equal(applyProfile(p, p.out + 10).phase, 'hold');
  assert.equal(applyProfile(p, p.out + p.hold + 10).phase, 'back');
  assert.equal(applyProfile(p, profileDuration('crossEyed') + 1).phase, 'done');
});

test('overshoot pushes past rest on the way back, then settles', () => {
  const p = PROFILES.wanderingEye;
  const t = p.out + p.hold + p.back * 0.75;
  assert.ok(applyProfile(p, t).amount < 0, 'should cross below zero before settling');
  near(applyProfile(p, profileDuration('wanderingEye')).amount, 0);
});

test('the wandering eye drifts out slowly and snaps back', () => {
  const p = PROFILES.wanderingEye;
  assert.ok(p.out > p.back * 10, 'drift out must be far slower than the snap back');
  assert.ok(p.hold >= 1000, 'the dwell is where the joke lives');
});

test('cross-eyed uses the opposite profile to the wandering eye', () => {
  assert.ok(PROFILES.crossEyed.out < PROFILES.crossEyed.back,
    'convergence is effortful, so it snaps in and relaxes out');
});

test('every named pose has a profile and vice versa', () => {
  for (const name of [...GAG_NAMES, ...REACTION_NAMES]) {
    assert.ok(POSES[name], `missing pose: ${name}`);
    assert.ok(PROFILES[name], `missing profile: ${name}`);
  }
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
node --test tests/motion.test.mjs
```

Expected: FAIL — `Cannot find module '../public/js/motion.js'`

- [ ] **Step 4: Implement `public/js/motion.js`**

```js
// How a pose is performed over time: out, hold, back.

/** Symmetric ease, for passive movement. */
export function easeInOut(u) {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** Fast start, settling finish — for active, effortful movement. */
export function easeOut(u) {
  return 1 - Math.pow(1 - u, 3);
}

/**
 * How much of a pose is applied at `elapsedMs` into its performance.
 *
 * @returns {{amount: number, phase: 'out'|'hold'|'back'|'done'}}
 *   `amount` is 0 at rest and 1 at the full pose. It can go slightly negative
 *   during the return when the profile has overshoot — that is the yank that
 *   makes a snap read as a snap rather than a slide.
 */
export function applyProfile(profile, elapsedMs) {
  const { out, hold, back, overshoot = 0 } = profile;

  if (elapsedMs <= 0) return { amount: 0, phase: 'out' };

  if (elapsedMs < out) {
    return { amount: easeInOut(elapsedMs / out), phase: 'out' };
  }

  const afterOut = elapsedMs - out;
  if (afterOut <= hold) {
    return { amount: 1, phase: 'hold' };
  }

  const afterHold = afterOut - hold;
  if (afterHold < back) {
    const u = afterHold / back;
    const eased = easeOut(u);
    // Undershoot past rest, then settle back to exactly 0 at the end.
    const dip = -overshoot * Math.sin(Math.PI * u);
    return { amount: (1 - eased) + dip, phase: 'back' };
  }

  return { amount: 0, phase: 'done' };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
node --test tests/motion.test.mjs
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pose table and motion profiles

Profiles follow the rule that the effortful direction is fast, which
gives cross-eyed and the wandering eye opposite timings.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The director — `showState(t)`

**Files:**
- Create: `public/js/director.js`
- Test: `tests/director.test.mjs`

**Interfaces:**
- Consumes: `rand01`, `pick` from `rng.js`; `POSES`, `PROFILES`, `GAG_NAMES`, `REACTION_NAMES`, `profileDuration` from `poses.js`; `applyProfile` from `motion.js`
- Produces: `DEFAULT_SHOW_CONFIG`, `showState(tMs, cfg) -> {t, poseName, phase, energy, eyeL, eyeR}` where each eye is `{gaze, stageOffset, lid, brow, pupil}`

- [ ] **Step 1: Write the failing test**

Create `tests/director.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showState, DEFAULT_SHOW_CONFIG } from '../public/js/director.js';

const T = 1790000000000;
const cfg = DEFAULT_SHOW_CONFIG;

test('the same timestamp always yields the same frame', () => {
  assert.deepEqual(showState(T, cfg), showState(T, cfg));
  assert.deepEqual(showState(T + 12345, cfg), showState(T + 12345, cfg));
});

test('different timestamps yield different frames', () => {
  assert.notDeepEqual(showState(T, cfg), showState(T + 30000, cfg));
});

test('eyes are yoked during idle', () => {
  // Sample widely; whenever no gag is running, both eyes must match exactly.
  let checked = 0;
  for (let i = 0; i < 4000; i++) {
    const s = showState(T + i * 137, cfg);
    if (s.poseName === 'idle') {
      assert.equal(s.eyeL.gaze, s.eyeR.gaze, `idle eyes diverged at offset ${i * 137}`);
      checked++;
    }
  }
  assert.ok(checked > 100, `expected plenty of idle samples, got ${checked}`);
});

test('gaze stays within range at all times', () => {
  for (let i = 0; i < 6000; i++) {
    const s = showState(T + i * 211, cfg);
    for (const eye of [s.eyeL, s.eyeR]) {
      assert.ok(eye.gaze >= -1.001 && eye.gaze <= 1.001, `gaze out of range: ${eye.gaze}`);
      assert.ok(eye.lid >= 0 && eye.lid <= 1, `lid out of range: ${eye.lid}`);
      assert.ok(eye.pupil > 0, `pupil must be positive: ${eye.pupil}`);
    }
  }
});

test('gags fire, and at roughly the configured rate', () => {
  const seen = new Set();
  let gagMs = 0;
  const stepMs = 50;
  const spanMs = 60 * 60 * 1000;
  for (let t = 0; t < spanMs; t += stepMs) {
    const s = showState(T + t, cfg);
    if (s.poseName !== 'idle') { seen.add(s.poseName); gagMs += stepMs; }
  }
  assert.ok(seen.size >= 4, `expected several distinct poses, saw ${[...seen].join(', ')}`);
  const fraction = gagMs / spanMs;
  assert.ok(fraction > 0.02 && fraction < 0.30, `gags occupy ${(fraction * 100).toFixed(1)}% of the show`);
});

test('cross-eyed converges and wall-eyed diverges', () => {
  const cross = findPose('crossEyed');
  assert.ok(cross.eyeL.gaze > 0 && cross.eyeR.gaze < 0, 'cross-eyed should aim inward');
  const wall = findPose('wallEyed');
  assert.ok(wall.eyeL.gaze < 0 && wall.eyeR.gaze > 0, 'wall-eyed should aim outward');
});

test('the wandering eye moves one eye much further than the other', () => {
  const s = findPose('wanderingEye');
  const dL = Math.abs(s.eyeL.gaze), dR = Math.abs(s.eyeR.gaze);
  assert.ok(Math.abs(dL - dR) > 0.3, `expected asymmetry, got ${dL} vs ${dR}`);
});

test('energy drift can be switched off', () => {
  const on = showState(T, { ...cfg, energyDrift: true });
  const off = showState(T, { ...cfg, energyDrift: false });
  assert.equal(off.energy, 1);
  assert.ok(typeof on.energy === 'number');
});

test('both eyes share the slow positional wander', () => {
  // The wander guards against image retention. If the two eyes wandered
  // independently they would slowly separate, which is exactly the drift
  // the yoking rule exists to prevent.
  for (let i = 0; i < 2000; i++) {
    const s = showState(T + i * 9973, cfg);
    if (s.poseName === 'idle') {
      assert.equal(s.eyeL.stageOffset, s.eyeR.stageOffset,
        `eyes separated at offset ${i * 9973}`);
    }
  }
});

test('the wander stays small enough to keep eyes in their windows', () => {
  for (let i = 0; i < 2000; i++) {
    const s = showState(T + i * 9973, cfg);
    if (s.poseName === 'idle') {
      assert.ok(Math.abs(s.eyeL.stageOffset) <= cfg.wanderMax + 1e-9,
        `wander too large: ${s.eyeL.stageOffset}`);
    }
  }
});

test('an unknown shape or palette never reaches the director', () => {
  // The director does not read style; style is applied by the renderer.
  // This test documents that separation deliberately.
  assert.equal(showState(T, cfg).eyeL.pupilShape, undefined);
});

/** Scan forward until the named pose is at full extension. */
function findPose(name) {
  for (let t = 0; t < 60 * 60 * 1000; t += 40) {
    const s = showState(T + t, cfg);
    if (s.poseName === name && s.phase === 'hold') return s;
  }
  throw new Error(`pose never fired within an hour: ${name}`);
}
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
node --test tests/director.test.mjs
```

Expected: FAIL — `Cannot find module '../public/js/director.js'`

- [ ] **Step 3: Implement `public/js/director.js`**

```js
// The entire show, as a pure function of wall-clock time.
//
// Both browser windows call this with the same Date.now() and get identical
// output, which is why they need no messaging, no handshake and no leader.
// A window that crashes and restarts rejoins already in phase.
//
// Nothing here may call Math.random(). All variation comes from hashing a slot
// index — see rng.js and the lint in tools/check-no-random.sh.

import { rand01, pick } from './rng.js';
import { POSES, PROFILES, GAG_NAMES, REACTION_NAMES, profileDuration } from './poses.js';
import { applyProfile } from './motion.js';

export const DEFAULT_SHOW_CONFIG = {
  cycleMs: 75000,       // one performance per cycle -> roughly 60-90s apart
  saccadeMs: 2200,      // how long an idle gaze target is held
  blinkEveryMs: 5200,   // nominal blink spacing; jittered per slot
  blinkMs: 180,
  reactionChance: 0.4,  // of performances that are reactions rather than gags
  energyDrift: true,
  eveningStartHour: 17.75,  // 17:45
  eveningEndHour: 23.5,     // 23:30
  crowdOffset: 0.42,    // stage offset applied during bothOneWindow
  // Slow positional wander, so the bright sclera does not occupy exactly the
  // same pixels for ~180 hours across the month. Both eyes share it, so they
  // never drift apart. Also stops the eyes looking bolted down.
  wanderMs: 660000,
  wanderMax: 0.03
};

/** 1.0 early in the evening, easing down to ~0.55 by the end. */
function energyAt(tMs, cfg) {
  if (!cfg.energyDrift) return 1;
  const d = new Date(tMs);
  const hour = d.getHours() + d.getMinutes() / 60;
  const span = cfg.eveningEndHour - cfg.eveningStartHour;
  const u = Math.max(0, Math.min(1, (hour - cfg.eveningStartHour) / span));
  return 1 - 0.45 * u;
}

/** Idle gaze: long holds, snappy jumps between them. Both eyes share this value. */
function idleGaze(tMs, cfg, energy) {
  const slot = Math.floor(tMs / cfg.saccadeMs);
  const from = (rand01(slot, 1) * 2 - 1) * 0.9;
  const to = (rand01(slot + 1, 1) * 2 - 1) * 0.9;
  const within = (tMs % cfg.saccadeMs) / cfg.saccadeMs;
  // A saccade is ballistic: ~8% of the slot moving, the rest holding.
  const moveFor = 0.08;
  if (within >= moveFor) return to * (0.6 + 0.4 * energy);
  const u = within / moveFor;
  return (from + (to - from) * u) * (0.6 + 0.4 * energy);
}

/** Lid closure from the blink schedule. */
function blinkLid(tMs, cfg) {
  const slot = Math.floor(tMs / cfg.blinkEveryMs);
  const jitter = rand01(slot, 2) * (cfg.blinkEveryMs - cfg.blinkMs);
  const start = slot * cfg.blinkEveryMs + jitter;
  const into = tMs - start;
  if (into < 0 || into > cfg.blinkMs) return 0;
  // Closing is muscular and fast; opening is a relaxation and slower.
  const closeMs = cfg.blinkMs * 0.4;
  return into < closeMs
    ? into / closeMs
    : 1 - (into - closeMs) / (cfg.blinkMs - closeMs);
}

/**
 * A very slow drift of both eyes' stage position, shared so they never separate.
 * Guards against image retention across ~180 hours of running (spec section 7.3).
 */
function slowWander(tMs, cfg) {
  const slot = Math.floor(tMs / cfg.wanderMs);
  const from = (rand01(slot, 6) * 2 - 1) * cfg.wanderMax;
  const to = (rand01(slot + 1, 6) * 2 - 1) * cfg.wanderMax;
  const u = (tMs % cfg.wanderMs) / cfg.wanderMs;
  return from + (to - from) * u;
}

/** Which performance runs in this cycle, and when it starts within it. */
function performanceFor(cycle, cfg) {
  const isReaction = rand01(cycle, 3) < cfg.reactionChance;
  const names = isReaction ? REACTION_NAMES : GAG_NAMES;
  const name = pick(names, cycle, 4);
  const duration = profileDuration(name);
  const latest = Math.max(0, cfg.cycleMs - duration);
  const startAt = rand01(cycle, 5) * latest;
  return { name, duration, startAt };
}

/**
 * One frame of the show.
 * @param {number} tMs  wall-clock milliseconds (Date.now())
 */
export function showState(tMs, cfg = DEFAULT_SHOW_CONFIG) {
  const energy = energyAt(tMs, cfg);
  const cycle = Math.floor(tMs / cfg.cycleMs);
  const intoCycle = tMs - cycle * cfg.cycleMs;
  const perf = performanceFor(cycle, cfg);

  const active = intoCycle >= perf.startAt && intoCycle < perf.startAt + perf.duration;
  const elapsed = intoCycle - perf.startAt;
  const { amount, phase } = active
    ? applyProfile(PROFILES[perf.name], elapsed)
    : { amount: 0, phase: 'done' };

  const poseName = active ? perf.name : 'idle';
  const pose = POSES[poseName] ?? POSES.idle;
  const rest = POSES.idle;

  const scan = idleGaze(tMs, cfg, energy);
  const target = pose.target === null ? scan : scan + (pose.target - scan) * amount;
  const vergence = pose.vergence * amount;

  const lidBase = blinkLid(tMs, cfg);
  const lidPose = rest.lid + (pose.lid - rest.lid) * amount;
  // Lower energy rests the lids slightly — droopier late in the evening.
  const lid = Math.min(1, Math.max(lidBase, lidPose) + (1 - energy) * 0.12);

  const brow = rest.brow + (pose.brow - rest.brow) * amount;
  const pupil = rest.pupil + (pose.pupil - rest.pupil) * amount;

  const crowd = pose.stage === 'crowdLeft' ? cfg.crowdOffset * amount : 0;
  const wander = slowWander(tMs, cfg);

  const clamp = (v) => Math.max(-1, Math.min(1, v));

  return {
    t: tMs,
    poseName,
    phase,
    energy,
    eyeL: {
      gaze: clamp(target + vergence),
      stageOffset: -crowd + wander,
      lid,
      brow,
      pupil
    },
    eyeR: {
      gaze: clamp(target - vergence),
      stageOffset: -crowd * 3.2 + wander,
      lid,
      brow,
      pupil
    }
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node --test tests/director.test.mjs
```

Expected: PASS, 11 tests. If the yoking test fails, the bug is in `idleGaze` — both eyes must read the *same* scan value.

- [ ] **Step 5: Run the full suite and the lint**

```bash
node --test && ./tools/check-no-random.sh
```

Expected: all tests pass, lint OK.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: deterministic director

showState(t) is a pure function of wall-clock time, so both windows
compute identical frames with no messaging between them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Show page, viewport self-detection and render loop

**Files:**
- Create: `public/index.html`, `public/css/show.css`, `public/js/main.js`

**Interfaces:**
- Consumes: everything from Tasks 2–6
- Produces: `detectViewport() -> 'left'|'right'`, `boot() -> void`

Viewport is **detected, not asserted**. If the two Chromium windows land on swapped
monitors, each still renders correctly for where it actually is, so launch order stops
mattering. `?viewport=` remains as a manual override for desk testing.

- [ ] **Step 1: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Halloween Eyes</title>
<link rel="stylesheet" href="css/show.css">
</head>
<body>
  <div id="stage" aria-hidden="true"></div>
  <div id="setup-overlay" hidden></div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/css/show.css`**

```css
/* The window itself is the frame; everything here is black except the eye. */
html, body {
  margin: 0;
  height: 100%;
  background: #050409;
  overflow: hidden;
  cursor: none;
}

#stage {
  position: absolute;
  inset: 0;
}

#stage .eye {
  position: absolute;
  top: 0;
  height: 100%;
}

#stage .eye svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Painted over both screens during install so assignment is verifiable at a glance,
   instead of squinting at brow angles from the pavement. */
#setup-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 700 22vh/1 system-ui, sans-serif;
  letter-spacing: 0.1em;
  color: #23f0a0;
  background: rgba(0, 0, 0, 0.75);
}
```

- [ ] **Step 3: Write `public/js/main.js`**

```js
// Boot, viewport detection, and the render loop.

import { eyeGeometry, BASE } from './geometry.js';
import { PALETTES, SHAPES } from './themes.js';
import { createEyeSvg, updateEye } from './render.js';
import { makeStage, DEFAULT_GAP_EYE_WIDTHS } from './stage.js';
import { showState, DEFAULT_SHOW_CONFIG } from './director.js';
import { startConfigClient } from './config-client.js';

/**
 * Which half of the stage this window renders.
 *
 * Derived from the window's own position rather than passed in at launch, so a
 * window is correct for wherever it actually landed. Two Chromium windows starting
 * together is a race; if the compositor resolves it by launch order the assignment
 * can differ between boots, and the failure is subtle — a swapped pair scowls
 * outward instead of inward rather than showing anything obviously broken.
 */
export function detectViewport() {
  const override = new URLSearchParams(location.search).get('viewport');
  if (override === 'left' || override === 'right') return override;
  // On an extended desktop the second output starts at x = width of the first.
  return window.screenX >= window.screen.width / 2 ? 'right' : 'left';
}

const state = {
  shape: 'amber',
  palette: 'amber',
  energyDrift: true,
  crowdStyle: 'shrink'
};

let viewport, stage, eyes, stageEl;

function buildEyes() {
  stageEl.replaceChildren();
  const palette = PALETTES[state.palette];
  const pupilShape = palette.pupilOverride ?? SHAPES[state.shape].pupil;

  eyes = ['L', 'R'].map((side) => {
    const geom = eyeGeometry(state.shape, side);
    const svg = createEyeSvg(geom, palette, 'eye');
    const holder = document.createElement('div');
    holder.className = 'eye';
    holder.appendChild(svg);
    stageEl.appendChild(holder);
    return { side, geom, svg, holder, pupilShape };
  });
}

function layout() {
  const vw = window.innerWidth;
  const eyeW = vw * (BASE.rx * 2 / BASE.W);
  stage = makeStage({ viewportW: vw, eyeW, gapEyeWidths: DEFAULT_GAP_EYE_WIDTHS });
  for (const e of eyes) e.holder.style.width = `${vw}px`;
}

function frame() {
  const s = showState(Date.now(), { ...DEFAULT_SHOW_CONFIG, energyDrift: state.energyDrift });
  const vw = stage.viewportW;

  for (const e of eyes) {
    const eyeState = e.side === 'L' ? s.eyeL : s.eyeR;
    updateEye(e.svg._refs, { ...eyeState, pupilShape: e.pupilShape });

    const home = e.side === 'L' ? stage.viewports.left.x0 : stage.viewports.right.x0;
    const stageX = home + eyeState.stageOffset * vw;
    const localX = stage.toViewportX(stageX, viewport);

    // Crowding compresses the eyes so two fit in one window. `squash` distorts
    // horizontally (squash-and-stretch, reads as crowded); `shrink` scales
    // uniformly (reads as receding).
    const crowd = Math.abs(eyeState.stageOffset);
    const k = 1 - Math.min(1, crowd) * 0.52;
    const scale = state.crowdStyle === 'squash' ? `scaleX(${k})` : `scale(${k})`;

    e.holder.style.transform = `translateX(${localX}px) ${scale}`;
  }
  requestAnimationFrame(frame);
}

function applyConfig(next) {
  const rebuild = next.shape !== state.shape || next.palette !== state.palette;
  Object.assign(state, next);
  if (rebuild) buildEyes();
}

function showSetupOverlay() {
  const el = document.getElementById('setup-overlay');
  el.textContent = viewport.toUpperCase();
  el.hidden = false;
}

function boot() {
  stageEl = document.getElementById('stage');
  viewport = detectViewport();
  buildEyes();
  layout();
  window.addEventListener('resize', layout);
  if (new URLSearchParams(location.search).has('setup')) showSetupOverlay();
  startConfigClient(applyConfig);
  requestAnimationFrame(frame);
}

boot();
```

- [ ] **Step 4: Verify in a browser**

```bash
cd ~/repos/halloween-eyes && python3 -m http.server 8080 --directory public
```

Open `http://localhost:8080/?viewport=left` and `?viewport=right` in two windows.
Expected: two amber eyes scanning in yoked step, blinking, with a gag roughly every
minute. Console must be free of errors. `?setup` paints `LEFT` / `RIGHT`.

`config-client.js` does not exist yet, so expect one import error until Task 11 —
comment out its import and `startConfigClient` call for this check, and restore them
in Task 11.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show page with self-detecting viewports

Each window derives which half of the stage it renders from its own
position, so a swapped launch order corrects itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Week-1 spike — dual-output placement on the Pi

**Files:**
- Create: `docs/SPIKE-NOTES.md`

This is investigation, not implementation. Its output is an answer that decides Task 12.
**It is the only remaining item that could force an architectural change**, so run it first.

- [ ] **Step 1: Determine the session type**

```bash
ssh <pi> 'echo $XDG_SESSION_TYPE; ls /usr/bin/labwc /usr/bin/wayfire 2>/dev/null'
```

- [ ] **Step 2: Try to place two windows, one per output**

Rung 1 — compositor window rules (Wayland). Rung 2 — switch to X11 and use explicit
positions:

```bash
sudo raspi-config nonint do_wayland W1   # W1 = X11
sudo reboot
# after reboot:
xrandr --output HDMI-1 --auto --pos 0x0 --output HDMI-2 --auto --right-of HDMI-1
chromium-browser --kiosk --window-position=0,0    "http://localhost:8080/?setup" &
chromium-browser --kiosk --window-position=1920,0 "http://localhost:8080/?setup" &
```

- [ ] **Step 3: Answer the three questions and write them down**

Record in `docs/SPIKE-NOTES.md`:

1. Can each window be placed on a chosen output? Which rung of the ladder worked?
2. **Does it survive a reboot? Power-cycle at least five times.** A race that resolves
   correctly four times has told you nothing.
3. **Does `window.screenX` report the window's position?** Check the console on the
   right-hand window:

```js
console.log(window.screenX, window.screen.width);
```

If `screenX` is non-zero on the second monitor, self-detecting viewports (Task 7) work
and launch order is irrelevant. If it always reports 0 — likely under Wayland, which
hides window position from clients — self-detection is unavailable and Task 12 must rely
on deterministic placement plus the reboot test alone.

- [ ] **Step 4: Measure framerate**

With both windows running, confirm the animation is smooth and check CPU:

```bash
top -b -n 3 | head -20
```

Expected: well under 100% of one core. If not, revisit the spec's approach 3 (native
renderer) before going further.

- [ ] **Step 5: Commit the notes**

```bash
git add docs/SPIKE-NOTES.md
git commit -m "docs: week-1 spike results for dual-output placement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Static file server

**Files:**
- Create: `server/serve.py`, `server/config.default.json`
- Test: `tests/test_serve.py`

**Interfaces:**
- Consumes: nothing
- Produces: `make_server(root: Path, config_path: Path, port: int, bind: str) -> ThreadingHTTPServer`, `load_config(path) -> dict`, `VALID` (dict of allowed enum values)

- [ ] **Step 1: Set up the Python environment**

```bash
cd ~/repos/halloween-eyes
python3 -m venv .venv
.venv/bin/pip install --upgrade pip pytest
```

- [ ] **Step 2: Write `server/config.default.json`**

```json
{
  "shape": "amber",
  "palette": "amber",
  "energyDrift": true,
  "crowdStyle": "shrink",
  "effectiveAt": 0
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/test_serve.py`:

```python
"""Tests for the local show server.

Run: .venv/bin/pytest tests/test_serve.py -v
"""
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from server.serve import VALID, load_config, make_server


@pytest.fixture()
def running(tmp_path):
    root = tmp_path / "public"
    root.mkdir()
    (root / "index.html").write_text("<h1>eyes</h1>", encoding="utf-8")
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "shape": "amber",
                "palette": "amber",
                "energyDrift": True,
                "crowdStyle": "shrink",
                "effectiveAt": 0,
            }
        ),
        encoding="utf-8",
    )
    server = make_server(root=root, config_path=config_path, port=0, bind="127.0.0.1")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield base, config_path
    server.shutdown()
    server.server_close()


def get(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.status, response.read()


def post(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


def test_serves_static_files(running):
    base, _ = running
    status, body = get(f"{base}/index.html")
    assert status == 200
    assert b"eyes" in body


def test_serves_config(running):
    base, _ = running
    status, body = get(f"{base}/config.json")
    assert status == 200
    assert json.loads(body)["shape"] == "amber"


def test_accepts_a_valid_change(running):
    base, config_path = running
    status, body = post(f"{base}/config", {"shape": "ember", "palette": "green"})
    assert status == 200
    written = json.loads(config_path.read_text(encoding="utf-8"))
    assert written["shape"] == "ember"
    assert written["palette"] == "green"
    assert written["effectiveAt"] > 0, "a change must be scheduled, not immediate"
    assert body["effectiveAt"] == written["effectiveAt"]


def test_schedules_far_enough_ahead(running):
    """Lead time must exceed the client poll interval or a window can apply late."""
    base, _ = running
    import time

    status, body = post(f"{base}/config", {"shape": "ember"})
    assert status == 200
    lead_ms = body["effectiveAt"] - time.time() * 1000
    assert lead_ms > 2000, f"lead time {lead_ms}ms does not clear the 2s poll interval"


def test_rejects_unknown_values(running):
    base, config_path = running
    before = config_path.read_text(encoding="utf-8")
    status, body = post(f"{base}/config", {"shape": "banana"})
    assert status == 400
    assert "shape" in body["error"]
    assert config_path.read_text(encoding="utf-8") == before, "invalid input must not write"


def test_rejects_unknown_keys(running):
    base, _ = running
    status, _ = post(f"{base}/config", {"nonsense": True})
    assert status == 400


def test_load_config_falls_back_to_defaults(tmp_path):
    missing = tmp_path / "nope.json"
    config = load_config(missing)
    assert config["shape"] in VALID["shape"]


def test_load_config_survives_corrupt_json(tmp_path):
    broken = tmp_path / "config.json"
    broken.write_text("{ not json", encoding="utf-8")
    config = load_config(broken)
    assert config["shape"] in VALID["shape"]
```

- [ ] **Step 4: Run the test and confirm it fails**

```bash
cd ~/repos/halloween-eyes && .venv/bin/pytest tests/test_serve.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 5: Implement `server/serve.py`**

```python
#!/usr/bin/env python3
"""Local server for the Halloween eyes show.

Serves the static page to both browser windows and holds the runtime config
they poll. Standard library only — no third-party dependencies to install or
audit on a Raspberry Pi.

Run:
    python3 server/serve.py --root public --port 8080

Security: bind to the LAN only and never port-forward this. The write endpoint
is unauthenticated, which is acceptable because the blast radius is four enum
values on a Halloween decoration — but only while it stays off the internet.
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

logger = logging.getLogger("halloween-eyes")

#: Allowed values. Anything else is rejected rather than coerced.
VALID = {
    "shape": {"amber", "ember"},
    "palette": {"amber", "green"},
    "energyDrift": {True, False},
    "crowdStyle": {"shrink", "squash"},
}

DEFAULTS = {
    "shape": "amber",
    "palette": "amber",
    "energyDrift": True,
    "crowdStyle": "shrink",
    "effectiveAt": 0,
}

#: A change is scheduled this far ahead so both windows, polling every 2s,
#: are guaranteed to see it before it fires. Lead time MUST exceed the poll
#: interval or a window can apply late — which is the tear this design avoids.
SCHEDULE_LEAD_MS = 5000

MAX_BODY_BYTES = 4096


def load_config(path: Path) -> dict:
    """Read the config, falling back to defaults on anything unreadable."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        logger.warning("config unreadable (%s); using defaults", err)
        return dict(DEFAULTS)

    config = dict(DEFAULTS)
    for key, allowed in VALID.items():
        if key in data and data[key] in allowed:
            config[key] = data[key]
    if isinstance(data.get("effectiveAt"), (int, float)):
        config["effectiveAt"] = data["effectiveAt"]
    return config


def _validate(payload: dict) -> tuple[dict | None, str | None]:
    if not isinstance(payload, dict):
        return None, "body must be a JSON object"
    unknown = set(payload) - set(VALID)
    if unknown:
        return None, f"unknown keys: {', '.join(sorted(unknown))}"
    for key, value in payload.items():
        if value not in VALID[key]:
            return None, f"invalid value for {key}: {value!r}"
    return payload, None


def make_server(root: Path, config_path: Path, port: int, bind: str) -> ThreadingHTTPServer:
    root = Path(root).resolve()
    config_path = Path(config_path)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, fmt, *args):
            logger.debug("%s", fmt % args)

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802 - stdlib naming
            if self.path.split("?")[0] == "/config.json":
                self._send_json(HTTPStatus.OK, load_config(config_path))
                return
            super().do_GET()

        def do_POST(self):  # noqa: N802 - stdlib naming
            if self.path.split("?")[0] != "/config":
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "no such endpoint"})
                return

            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad body length"})
                return

            try:
                payload = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "body is not valid JSON"})
                return

            clean, error = _validate(payload)
            if error:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": error})
                return

            config = load_config(config_path)
            config.update(clean)
            config["effectiveAt"] = int(time.time() * 1000) + SCHEDULE_LEAD_MS

            tmp = config_path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(config, indent=2), encoding="utf-8")
            tmp.replace(config_path)
            logger.info("config updated: %s", clean)
            self._send_json(HTTPStatus.OK, config)

    return ThreadingHTTPServer((bind, port), Handler)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("public"))
    parser.add_argument("--config", type=Path, default=Path("server/config.json"))
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--bind", default="0.0.0.0", help="LAN only; never port-forward")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not args.config.exists():
        default = Path(__file__).parent / "config.default.json"
        args.config.write_text(default.read_text(encoding="utf-8"), encoding="utf-8")
        logger.info("seeded %s from config.default.json", args.config)

    server = make_server(args.root, args.config, args.port, args.bind)
    logger.info("serving %s on %s:%d", args.root, args.bind, args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
touch server/__init__.py tests/__init__.py
.venv/bin/pytest tests/test_serve.py -v
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: stdlib show server with validated config writes

Changes are scheduled 5s ahead so both windows switch on the same frame.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Config client and scheduled switching

**Files:**
- Create: `public/js/config-client.js`
- Modify: `public/js/main.js` (restore the import commented out in Task 7)

**Interfaces:**
- Consumes: nothing
- Produces: `startConfigClient(onApply, opts) -> {stop()}` where `onApply` receives `{shape, palette, energyDrift, crowdStyle}`

- [ ] **Step 1: Implement `public/js/config-client.js`**

```js
// Polls the server for style changes and applies them at a scheduled instant.
//
// The config does not say "switch to ember". It says "ember, effective at T".
// Both windows read the same T from the same clock and switch on the same frame,
// so a live toggle exists without the two windows ever talking to each other.
//
// THE SHOW MUST NEVER DEPEND ON THIS. A failed poll is a no-op, never an error.
// Losing the network disables the toggle and nothing else.

const POLL_MS = 2000;
const KEYS = ['shape', 'palette', 'energyDrift', 'crowdStyle'];

export function startConfigClient(onApply, { url = 'config.json', pollMs = POLL_MS } = {}) {
  let current = null;
  let pendingTimer = null;
  let stopped = false;

  function schedule(next, effectiveAt) {
    clearTimeout(pendingTimer);
    const delay = Math.max(0, effectiveAt - Date.now());
    pendingTimer = setTimeout(() => {
      current = next;
      onApply(next);
    }, delay);
  }

  async function poll() {
    if (stopped) return;
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const next = {};
        for (const key of KEYS) if (key in data) next[key] = data[key];

        const changed = !current || KEYS.some((k) => next[k] !== current[k]);
        if (changed) {
          const effectiveAt = Number(data.effectiveAt) || 0;
          // A window that booted after the change was scheduled applies it at once:
          // the config is the truth, not the transition.
          schedule(next, effectiveAt);
        }
      }
    } catch {
      // Network down, server dead, malformed JSON — keep the current style and
      // try again on the next tick. Never throw, never blank the screen.
    }
    if (!stopped) setTimeout(poll, pollMs);
  }

  poll();

  return {
    stop() {
      stopped = true;
      clearTimeout(pendingTimer);
    }
  };
}
```

- [ ] **Step 2: Restore the import in `public/js/main.js`**

Uncomment the `startConfigClient` import and the `startConfigClient(applyConfig)` call
that were commented out in Task 7 Step 4.

- [ ] **Step 3: Verify the round trip by hand**

```bash
cd ~/repos/halloween-eyes && .venv/bin/python server/serve.py --root public --port 8080 &
```

Open two browser windows on the page, then:

```bash
curl -X POST -H 'Content-Type: application/json' \
     -d '{"shape":"ember","palette":"green"}' http://localhost:8080/config
```

Expected: both windows switch to a green ember eye **at the same moment**, roughly five
seconds after the command. If one lags visibly behind the other, the lead time is not
clearing the poll interval — check `SCHEDULE_LEAD_MS` against `POLL_MS`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: config client with scheduled style switching

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Phone control page

**Files:**
- Create: `public/control.html`

**Interfaces:**
- Consumes: the `POST /config` endpoint from Task 9
- Produces: nothing importable

- [ ] **Step 1: Write `public/control.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Eyes Control</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0px));
    background: #0B0A0F; color: #E9E4DA;
    font: 16px/1.5 system-ui, -apple-system, sans-serif;
  }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  p.sub { margin: 0 0 28px; color: #7C7490; font-size: .9rem; }
  fieldset { border: 0; padding: 0; margin: 0 0 26px; }
  legend {
    font-size: .72rem; letter-spacing: .14em; text-transform: uppercase;
    color: #7C7490; margin-bottom: 10px;
  }
  .row { display: flex; gap: 10px; }
  button {
    flex: 1; padding: 18px 12px; font: inherit; font-weight: 600;
    background: #1B1726; color: #E9E4DA;
    border: 1px solid #2E2839; border-radius: 6px; cursor: pointer;
  }
  button[aria-pressed="true"] { background: #F0A72C; color: #161018; border-color: #F0A72C; }
  #status { min-height: 1.5em; font-size: .88rem; color: #7C7490; }
</style>
</head>
<body>
  <h1>Halloween Eyes</h1>
  <p class="sub">Changes apply to both windows together, about five seconds after you tap.</p>

  <fieldset><legend>Shape</legend><div class="row">
    <button data-key="shape" data-value="amber">Amber</button>
    <button data-key="shape" data-value="ember">Ember</button>
  </div></fieldset>

  <fieldset><legend>Color</legend><div class="row">
    <button data-key="palette" data-value="amber">Amber</button>
    <button data-key="palette" data-value="green">Cat green</button>
  </div></fieldset>

  <fieldset><legend>Crowding</legend><div class="row">
    <button data-key="crowdStyle" data-value="shrink">Shrink</button>
    <button data-key="crowdStyle" data-value="squash">Squash</button>
  </div></fieldset>

  <fieldset><legend>Energy drift</legend><div class="row">
    <button data-key="energyDrift" data-value="true">On</button>
    <button data-key="energyDrift" data-value="false">Off</button>
  </div></fieldset>

  <div id="status"></div>

<script type="module">
const statusEl = document.getElementById('status');
const buttons = [...document.querySelectorAll('button[data-key]')];

function parse(value) {
  return value === 'true' ? true : value === 'false' ? false : value;
}

function paint(config) {
  for (const b of buttons) {
    b.setAttribute('aria-pressed', String(config[b.dataset.key] === parse(b.dataset.value)));
  }
}

async function refresh() {
  try {
    const response = await fetch(`config.json?t=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) paint(await response.json());
  } catch {
    statusEl.textContent = 'Cannot reach the Pi. The eyes keep running regardless.';
  }
}

for (const b of buttons) {
  b.addEventListener('click', async () => {
    const payload = { [b.dataset.key]: parse(b.dataset.value) };
    statusEl.textContent = 'Sending…';
    try {
      const response = await fetch('config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) { statusEl.textContent = `Rejected: ${data.error}`; return; }
      paint(data);
      const seconds = Math.max(0, Math.round((data.effectiveAt - Date.now()) / 1000));
      statusEl.textContent = `Changing in ${seconds}s.`;
    } catch {
      statusEl.textContent = 'Could not reach the Pi.';
    }
  });
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
```

- [ ] **Step 2: Verify from a phone**

Find the Pi's LAN address and open `http://<pi-ip>:8080/control.html` on a phone on the
same network. Tap each button; both windows should change together.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: phone control page for style, crowding and energy drift

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Deployment — launch, autostart and schedule

**Files:**
- Create: `deploy/launch-windows.sh`, `deploy/halloween-eyes.service`, `deploy/crontab.example`

Use the rung of the ladder that Task 8 proved. The script below assumes X11 with explicit
positions; if the spike found compositor rules worked, swap the Chromium invocation and
keep everything else.

- [ ] **Step 1: Write `deploy/launch-windows.sh`**

```bash
#!/usr/bin/env bash
# Starts the server and one Chromium window per monitor.
#
# Window placement is explicit rather than left to launch order: two windows
# starting together is a race, and a race that resolves correctly four times
# has told you nothing. The page also self-detects its viewport, so a window
# that lands on the wrong monitor still renders the correct half.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/halloween-eyes}"
PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/"

cd "$APP_DIR"

# Screen blanking is the classic failure — it will blank at the worst moment.
xset s off || true
xset -dpms || true
xset s noblank || true

xrandr --output HDMI-1 --auto --pos 0x0 \
       --output HDMI-2 --auto --right-of HDMI-1

python3 server/serve.py --root public --config server/config.json --port "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

# Wait for the server rather than sleeping a guessed number of seconds.
for _ in $(seq 1 50); do
  if curl -fsS "${URL}config.json" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

CHROME_FLAGS=(
  --kiosk
  --noerrdialogs
  --disable-session-crashed-bubble
  --disable-infobars
  --check-for-update-interval=31536000
  --autoplay-policy=no-user-gesture-required
)

chromium-browser "${CHROME_FLAGS[@]}" --user-data-dir=/tmp/eyes-left \
  --class=eyes-left  --window-position=0,0    "${URL}" &
chromium-browser "${CHROME_FLAGS[@]}" --user-data-dir=/tmp/eyes-right \
  --class=eyes-right --window-position=1920,0 "${URL}" &

wait
```

```bash
chmod +x deploy/launch-windows.sh
```

Separate `--user-data-dir` values are required — two Chromium instances sharing a profile
will collapse into one process and one window. Distinct `--class` values make the windows
targetable by compositor rules if the Wayland path is needed.

- [ ] **Step 2: Write `deploy/halloween-eyes.service`**

```ini
[Unit]
Description=Halloween eye windows
After=graphical.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
Environment=APP_DIR=/home/pi/halloween-eyes
ExecStart=/home/pi/halloween-eyes/deploy/launch-windows.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
```

Because the show is a function of wall-clock time, a restarted window rejoins already in
phase — supervision alone is sufficient, with no state to restore.

- [ ] **Step 3: Write `deploy/crontab.example`**

```cron
# Halloween eyes: on at 17:45, off at 23:30, nightly through October.
#
# Time-gated, never start-on-boot: a reboot at 3am must leave the windows dark.
# The service is NOT enabled at boot — cron alone decides when it runs.
45 17 * 10 * systemctl --user start halloween-eyes.service
30 23 * 10 * systemctl --user stop  halloween-eyes.service
```

- [ ] **Step 4: Install and verify on the Pi**

```bash
mkdir -p ~/.config/systemd/user
cp deploy/halloween-eyes.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start halloween-eyes.service
crontab -l > /tmp/ct; cat deploy/crontab.example >> /tmp/ct; crontab /tmp/ct
```

Confirm the service is **not** enabled:

```bash
systemctl --user is-enabled halloween-eyes.service
```

Expected: `disabled`. Cron starts it; boot must not.

- [ ] **Step 5: Run the reboot test — five times**

```bash
sudo reboot
# after each boot:
systemctl --user start halloween-eyes.service
# then open http://localhost:8080/?setup on each screen and confirm LEFT / RIGHT
```

Record pass/fail for each of the five reboots in `docs/SPIKE-NOTES.md`. This is the single
most likely thing to be quietly broken on the night, because the symptom is subtle — a
swapped pair scowls outward instead of inward rather than showing anything obviously wrong.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: deployment scripts, systemd unit and nightly schedule

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Runbook and freeze

**Files:**
- Create: `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: everything
- Produces: nothing importable

- [ ] **Step 1: Write `docs/RUNBOOK.md`**

```markdown
# Runbook — Halloween Eyes

Print this and tape it near the Pi. Written for someone holding a bowl of sweets
and not thinking clearly.

## Nothing on either screen

    systemctl --user restart halloween-eyes.service

Wait 20 seconds. If still dark, check both monitors are powered on.

## One screen dark, one working

Usually a loose micro-HDMI. Reseat both at the Pi end, then restart as above.

## The eyes look wrong — scowling outward instead of inward

The two windows landed on swapped monitors. Restart the service. If it persists,
swap the two micro-HDMI cables at the Pi.

## Changing the look

Open `http://<pi-ip>:8080/control.html` on a phone on the house WiFi.
Changes take about five seconds and affect both windows together.

No WiFi? The eyes keep running. Only the control page stops working.

## Starting or stopping out of hours

    systemctl --user start halloween-eyes.service
    systemctl --user stop  halloween-eyes.service

## Total failure — use the spare

The Pi 3B on the shelf is imaged and ready. Swap the SD card, plug in both
monitors and power. Expect one monitor only; the 3B has a single HDMI.

## Logs

    journalctl --user -u halloween-eyes.service -n 100 --no-pager
```

- [ ] **Step 2: Run everything once more**

```bash
cd ~/repos/halloween-eyes
node --test && ./tools/check-no-random.sh && .venv/bin/pytest tests/ -q
```

Expected: all green.

- [ ] **Step 3: Commit and tag the freeze**

```bash
git add -A
git commit -m "docs: runbook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git tag -a freeze-2026-10-28 -m "Code freeze before Halloween 2026"
```

**After this tag, no changes.** Run the installation nightly and watch it. Everything
before the freeze is optional; the freeze is not.

---

## Spec coverage

| Spec section | Covered by |
|---|---|
| §4.1 stage/viewport, gap floor | Task 4, Task 7 |
| §4.2 per-viewport calibration | Matched pair makes this a look-and-see; no code |
| §4.3 determinism, no `Math.random()` | Task 1 (lint), Task 6 (tests) |
| §4.4 poses vs profiles, yoking, vergence | Task 5, Task 6 |
| §4.5 pose table | Task 5 |
| §4.6 energy drift | Task 6, toggleable via Task 10 |
| §7.3 image-retention wander | Task 6 (`slowWander`), asserted shared across both eyes |
| §4.7 theme config, `side`-derived geometry | Task 2 |
| §4.8 runtime switching | Tasks 9, 10, 11 |
| §5 visual spec, brow, shadows, foreshortening | Tasks 2, 3 |
| §6 show design, gag rate | Task 6 |
| §7.1 display setup, viewport assignment | Tasks 7, 8, 12 |
| §7.2 autostart and supervision | Task 12 |
| §7.3 schedule, time-gating | Task 12 |
| §7.4 failure plan, freeze, runbook | Task 13 |
| §8 dev workflow | Task 1 README |
| §9 testing | Tasks 1–6, 12 (reboot test) |
| §12 mounting, physical install | Not code — see spec |

**Deliberately not in this plan:** the sightline mock-up, stand building and physical
install (§10, §12) are physical tasks with no code, tracked in the spec's build order.
