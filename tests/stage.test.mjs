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
