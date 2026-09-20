// A pose is WHERE things point. A motion profile is HOW it gets there.
// These are separate tables on purpose: a snap and a drift can target the same
// pose and read as completely different behaviours.
//
// Gaze is modelled as one shared target plus a vergence offset:
//     eyeL = target + vergence
//     eyeR = target - vergence
// Vertebrate eyes are yoked, so vergence is normally 0 and a gag is an explicit,
// temporary unlock. Never model the eyes as independent — they drift.

/**
 * target/vergence/lid/brow/pupil. `target: null` means "use the idle scan value".
 * `stage` names an optional stage-position behaviour.
 */
export const POSES = {
  idle:          { target: null, vergence:  0.0, lid: 0.00, brow: 1.00, pupil: 1.00 },
  crossEyed:     { target:  0.0, vergence:  1.0, lid: 0.00, brow: 0.85, pupil: 1.00 },
  wallEyed:      { target:  0.0, vergence: -1.0, lid: 0.00, brow: 0.70, pupil: 1.00 },
  // One eye holds forward while the other drifts wide. Expressible with the same
  // two numbers — the shared target simply moves off centre. No per-eye override.
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
