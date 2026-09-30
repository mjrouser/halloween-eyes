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

test('a non-numeric gap is rejected, not coerced', () => {
  // The gap is editable at runtime from the phone control page, so a junk value
  // is a real path into this function, not a hypothetical.
  for (const bad of [NaN, null, 'wide', {}]) {
    assert.throws(() => makeStage({ ...cfg, gapEyeWidths: bad }), /at least 1/i,
      `expected ${String(bad)} to be rejected`);
  }
});

test('an omitted gap falls back to the default rather than throwing', () => {
  const s = makeStage({ ...cfg, gapEyeWidths: undefined });
  assert.equal(s.gapPx, cfg.eyeW * DEFAULT_GAP_EYE_WIDTHS);
});

// --- Crowding: both eyes squeeze into the left window (the bothOneWindow gag). ---
// Layout is derived from the stage geometry, never hand-tuned: a guessed right-eye
// offset once left that eye half off the screen with a big gap beside it.

/** On-screen span of one eye, in the given viewport's local pixels. */
function span(s, placement, which) {
  const c = s.toViewportX(placement.centerX, which);
  const half = s.eyeW * placement.scale / 2;
  return { a: c - half, b: c + half };
}

test('at rest, each eye sits centered in its own window at full size', () => {
  const s = makeStage(cfg);
  const p = s.crowdPlacement(0);
  assert.equal(p.scale, 1);
  assert.equal(s.toViewportX(p.L.centerX, 'left'), 1920 / 2);
  assert.equal(s.toViewportX(p.R.centerX, 'right'), 1920 / 2);
});

test('fully crowded, both eyes fit side by side inside the left window', () => {
  const s = makeStage(cfg);
  const p = s.crowdPlacement(1);
  const L = span(s, p.L, 'left'), R = span(s, p.R, 'left');
  for (const [name, e] of [['left', L], ['right', R]]) {
    assert.ok(e.a >= 0 && e.b <= 1920, `${name} eye clipped: ${e.a.toFixed(0)}..${e.b.toFixed(0)}`);
  }
  assert.ok(L.b <= R.a, 'the eyes overlap');
  // Crowded, not merely sharing: the space between them is small next to an eye.
  assert.ok(R.a - L.b < 0.25 * (L.b - L.a), `gap between eyes too wide: ${(R.a - L.b).toFixed(0)}px`);
  // Symmetric about the window center, so the pair reads as one deliberate move.
  assert.ok(Math.abs((L.a + R.b) / 2 - 1920 / 2) < 1e-6, 'pair is off-center');
});

test('both eyes compress together, never one faster than the other', () => {
  const s = makeStage(cfg);
  let prev = 1;
  for (let i = 0; i <= 100; i++) {
    const { scale } = s.crowdPlacement(i / 100);
    assert.ok(scale <= prev + 1e-12, 'scale must shrink monotonically with crowding');
    prev = scale;
  }
  assert.ok(prev <= 0.55 && prev >= 0.45, `crowded scale should be ~0.5 (DESIGN 4.1), got ${prev}`);
});

test('in transit, an eye is never in both windows at once', () => {
  const s = makeStage(cfg);
  for (let i = 0; i <= 1000; i++) {
    const p = s.crowdPlacement(i / 1000);
    for (const side of ['L', 'R']) {
      const inLeft = span(s, p[side], 'left'), inRight = span(s, p[side], 'right');
      const onLeft = inLeft.b > 0 && inLeft.a < 1920;
      const onRight = inRight.b > 0 && inRight.a < 1920;
      assert.ok(!(onLeft && onRight), `eye ${side} straddles both windows at crowd ${i / 1000}`);
    }
  }
});
