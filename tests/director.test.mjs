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
  // Sampled at 20:00 LOCAL on Halloween, midway through the evening, because
  // outside the 17:45-23:30 window the drift is inactive and energy is 1
  // whether or not it is enabled — which would make this test unable to fail.
  const evening = new Date(2026, 9, 31, 20, 0, 0).getTime();
  const on = showState(evening, { ...cfg, energyDrift: true });
  const off = showState(evening, { ...cfg, energyDrift: false });
  assert.equal(off.energy, 1);
  assert.ok(on.energy < 1, 'drift should be visibly under way by 20:00');
  assert.ok(on.energy > 0.5, 'the eyes should not be exhausted by 20:00');
});

test('energy eases down across the evening, never up', () => {
  // The direction is the whole point: the install should wind down as the night
  // goes on, not wake up. An inverted drift still lands inside a plausible range
  // at any single sample, so it has to be checked as a trend.
  const at = (h, m) => showState(new Date(2026, 9, 31, h, m, 0).getTime(), cfg).energy;
  const samples = [at(17, 45), at(19, 0), at(20, 30), at(22, 0), at(23, 30)];
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] <= samples[i - 1] + 1e-9,
      `energy rose from ${samples[i - 1]} to ${samples[i]} — the drift is inverted`);
  }
  assert.ok(samples[0] > 0.99, 'the evening should open at full energy');
  assert.ok(samples.at(-1) < 0.6, 'and close noticeably lower');
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
  // The absolute cap matters more than the relative one. Checking only against
  // cfg.wanderMax makes this test self-referential: raising the config value
  // raises the assertion with it, so the test can never fail. ABSOLUTE_CAP is
  // the real requirement — the wander exists to shift the bright sclera off
  // fixed pixels, not to reposition the eye, so a few percent is plenty.
  const ABSOLUTE_CAP = 0.05;
  assert.ok(cfg.wanderMax <= ABSOLUTE_CAP,
    `configured wanderMax ${cfg.wanderMax} would move the eye visibly in its window`);
  for (let i = 0; i < 2000; i++) {
    const s = showState(T + i * 9973, cfg);
    if (s.poseName === 'idle') {
      assert.ok(Math.abs(s.eyeL.stageOffset) <= ABSOLUTE_CAP + 1e-9,
        `wander too large: ${s.eyeL.stageOffset}`);
      assert.ok(Math.abs(s.eyeL.stageOffset) <= cfg.wanderMax + 1e-9,
        `wander exceeded its own configured bound: ${s.eyeL.stageOffset}`);
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

// ---------------------------------------------------------------------------
// The architecture's central claim, tested the way it actually has to hold.
//
// The two windows are separate OS processes that never talk to each other. They
// stay in step only because showState is a pure function of the wall clock. The
// determinism tests above run in one process and so cannot see a divergence
// that only appears across process boundaries.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';

const DIRECTOR_URL = new URL('../public/js/director.js', import.meta.url).href;

/** Render a run of frames in a fresh Node process, as one window would. */
function renderInSeparateProcess(tz) {
  const script = `
    const { showState, DEFAULT_SHOW_CONFIG } = await import(${JSON.stringify(DIRECTOR_URL)});
    const T = 1790000000000;
    const out = [];
    for (let i = 0; i < 1500; i++) out.push(showState(T + i * 517, DEFAULT_SHOW_CONFIG));
    process.stdout.write(JSON.stringify(out));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: tz },
    maxBuffer: 64 * 1024 * 1024
  }).toString();
}

test('two independent processes render identical frames with no messaging', () => {
  const windowA = renderInSeparateProcess('America/New_York');
  const windowB = renderInSeparateProcess('America/New_York');
  assert.equal(windowA, windowB,
    'the two windows would visibly disagree on the wall of the house');
});

test('a restarted window rejoins already in phase', () => {
  // A crash-and-restart is just a third process asking for the same timestamps.
  const before = renderInSeparateProcess('America/New_York');
  const afterRestart = renderInSeparateProcess('America/New_York');
  assert.equal(before, afterRestart);
});

test('energy drift reads the LOCAL hour, so both windows must share a timezone', () => {
  // Documenting a real coupling rather than asserting it away. Both windows run
  // on the same Pi under one TZ, so this holds in practice — but it means the
  // show's agreement depends on the system clock AND the system timezone, not
  // on the timestamp alone. If these ever run on separate machines, TZ must match.
  const t = Date.parse('2026-11-01T00:00:00Z'); // 20:00 US Eastern on Halloween night
  const eastern = execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { showState, DEFAULT_SHOW_CONFIG } = await import(${JSON.stringify(DIRECTOR_URL)});
    process.stdout.write(String(showState(${t}, DEFAULT_SHOW_CONFIG).energy));
  `], { env: { ...process.env, TZ: 'America/New_York' } }).toString();
  const utc = execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { showState, DEFAULT_SHOW_CONFIG } = await import(${JSON.stringify(DIRECTOR_URL)});
    process.stdout.write(String(showState(${t}, DEFAULT_SHOW_CONFIG).energy));
  `], { env: { ...process.env, TZ: 'UTC' } }).toString();

  assert.notEqual(eastern, utc, 'energyAt is expected to be local-hour dependent');
  assert.ok(Number(eastern) > 0.5 && Number(eastern) < 1,
    'at 20:00 on Halloween the show should be partway through its energy drift');
});

test('the run never crosses a DST transition', () => {
  // US Eastern falls back at 02:00 on 2026-11-01. The show runs 17:45-23:30
  // nightly through October, so the last night ends two and a half hours before
  // the shift. If the schedule is ever extended into November, energyAt will
  // jump an hour and the repeated 01:00-02:00 local hour becomes reachable.
  const offsetAt = (iso) => -new Date(iso).getTimezoneOffset() / 60;
  process.env.TZ = 'America/New_York';
  const lastShowEnd = Date.parse('2026-11-01T03:30:00Z'); // 23:30 EDT on Oct 31
  const dstChange = Date.parse('2026-11-01T06:00:00Z');   // 02:00 EDT
  assert.ok(lastShowEnd < dstChange,
    'the final night must finish before the clocks change');
  assert.equal(offsetAt('2026-10-01T12:00:00Z'), offsetAt('2026-10-31T12:00:00Z'),
    'the offset must be stable across the whole October run');
});

test('crowding is one shared amount, peaking during bothOneWindow', () => {
  // The director says only HOW crowded (0..1). Where the eyes go is stage
  // geometry (stage.js crowdPlacement), which knows the gap; the director does not.
  let peak = 0;
  for (let i = 0; i < 20000; i++) {
    const s = showState(T + i * 997, cfg);
    assert.ok(s.crowd >= 0 && s.crowd <= 1, `crowd out of range: ${s.crowd}`);
    if (s.poseName !== 'bothOneWindow') assert.equal(s.crowd, 0, `${s.poseName} crowded the eyes`);
    // Crowding must not leak into the per-eye offset, which is wander only.
    assert.equal(s.eyeL.stageOffset, s.eyeR.stageOffset, 'per-eye offsets diverged');
    peak = Math.max(peak, s.crowd);
  }
  assert.ok(peak > 0.99, `bothOneWindow never fully crowded: peak ${peak}`);
});
