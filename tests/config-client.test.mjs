// Tests for the config client: scheduled switching and failure tolerance.
//
// Run: node --test   (Node 22 — `nvm use` first)
//
// fetch is stubbed and the clock is mocked, so these run instantly and never
// touch the network.

import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startConfigClient } from '../public/js/config-client.js';

const BASE_CONFIG = { shape: 'amber', palette: 'amber', energyDrift: true, crowdStyle: 'shrink', effectiveAt: 0 };

let served; // what the fake server returns next: an object, an Error, or a status number
let client;

function fakeFetch() {
  if (served instanceof Error) return Promise.reject(served);
  if (typeof served === 'number') return Promise.resolve({ ok: false, status: served, json: async () => ({}) });
  const body = structuredClone(served);
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

// Let the awaited fetch/json promises inside poll() settle.
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function advance(ms) {
  mock.timers.tick(ms);
  await flush();
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  mock.method(globalThis, 'fetch', fakeFetch);
  served = { ...BASE_CONFIG };
});

afterEach(() => {
  client?.stop();
  client = null;
  mock.timers.reset();
  mock.restoreAll();
});

test('applies the config at boot when its effective time has passed', async () => {
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].shape, 'amber');
});

test('holds a change until its effective time, then applies it', async () => {
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);

  served = { ...BASE_CONFIG, shape: 'ember', effectiveAt: Date.now() + 5000 };
  await advance(2000); // next poll sees the change
  await advance(2999); // 1ms before it is due
  assert.equal(applied.length, 1, 'must not switch early');

  await advance(1);
  assert.equal(applied.length, 2);
  assert.equal(applied[1].shape, 'ember');
});

test('does not re-apply an unchanged config on every poll', async () => {
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  for (let i = 0; i < 5; i++) await advance(2000);
  assert.equal(applied.length, 1);
});

test('a network failure is a no-op, and polling carries on', async () => {
  served = new Error('network down');
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  assert.equal(applied.length, 0);

  served = { ...BASE_CONFIG };
  await advance(2000);
  await advance(0);
  assert.equal(applied.length, 1, 'must recover on the next poll');
});

test('an error status is a no-op', async () => {
  served = 500;
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);
  assert.equal(applied.length, 0);
});

test('drops values the page cannot render, keeps the valid ones', async () => {
  // An unknown palette reaching buildEyes() would blank the screen.
  served = { ...BASE_CONFIG, palette: 'banana', shape: 'ember' };
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].shape, 'ember');
  assert.ok(!('palette' in applied[0]), 'invalid palette must not be passed on');
});

test('a dropped value does not cause a re-apply loop', async () => {
  // A valid palette is applied first; then a bad one arrives. The bad key is
  // dropped, and must not read as "changed" against the palette already shown.
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);

  served = { ...BASE_CONFIG, palette: 'banana' };
  for (let i = 0; i < 5; i++) await advance(2000);
  assert.equal(applied.length, 1);
});

test('stop() halts polling and cancels a pending switch', async () => {
  const applied = [];
  client = startConfigClient((c) => applied.push(c));
  await flush();
  await advance(0);

  served = { ...BASE_CONFIG, shape: 'ember', effectiveAt: Date.now() + 5000 };
  await advance(2000);
  client.stop();
  const callsAfterStop = globalThis.fetch.mock.callCount();
  await advance(10_000);
  assert.equal(applied.length, 1, 'pending switch must be cancelled');
  assert.equal(globalThis.fetch.mock.callCount(), callsAfterStop, 'no polls after stop');
});
