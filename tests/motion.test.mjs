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
  // The other direction, which the name promises: no profile may be orphaned.
  // `idle` is the one pose with no profile — it is a resting state, not a
  // performance, so it is excluded rather than given a degenerate profile.
  for (const name of Object.keys(PROFILES)) {
    assert.ok(POSES[name], `profile with no pose: ${name}`);
  }
  for (const name of Object.keys(POSES)) {
    if (name === 'idle') continue;
    assert.ok(PROFILES[name], `pose with no profile: ${name}`);
  }
});

test('gaze stays yoked at rest — vergence is an explicit, temporary unlock', () => {
  assert.equal(POSES.idle.vergence, 0, 'the resting state must not un-yoke the eyes');
  const unlocked = Object.entries(POSES).filter(([, p]) => p.vergence !== 0).map(([n]) => n);
  for (const name of unlocked) {
    assert.ok(PROFILES[name], `${name} un-yokes the eyes but has no profile to return them`);
    assert.ok(profileDuration(name) < 10000, `${name} holds a vergence offset too long`);
  }
});
