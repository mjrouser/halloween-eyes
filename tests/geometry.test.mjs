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

test('glints mirror about the eye centre', () => {
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
