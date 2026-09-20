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
