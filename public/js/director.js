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

  // How crowded, 0..1. Where the eyes go is stage geometry (stage.js), not ours.
  const crowd = pose.stage === 'crowdLeft' ? amount : 0;
  const wander = slowWander(tMs, cfg);

  const clamp = (v) => Math.max(-1, Math.min(1, v));

  return {
    t: tMs,
    poseName,
    phase,
    energy,
    crowd,
    eyeL: {
      gaze: clamp(target + vergence),
      stageOffset: wander,
      lid,
      brow,
      pupil
    },
    eyeR: {
      gaze: clamp(target - vergence),
      stageOffset: wander,
      lid,
      brow,
      pupil
    }
  };
}
