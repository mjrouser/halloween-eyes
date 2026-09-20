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
