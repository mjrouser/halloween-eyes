// All eye geometry, derived from one `side` value.
//
// Nothing here may be hand-written per eye. During design, hand-mirroring the
// two eyes produced an asymmetry bug where one scowled harder than the other.
// Deriving both sides from `side` makes that unrepresentable.

import { SHAPES } from './themes.js';

/** Proportions of the eye within a 16:9 panel. Fractions are of rx or of eye height. */
export const BASE = {
  W: 320, H: 180,          // viewBox, 16:9
  cx: 160, cy: 90,
  rx: 117, ry: 89,         // eye fills the panel height; ~73% of its width
  irisR: 0.43,             // of rx
  pupilR: 0.21,            // of rx
  browOuter: 0.00,         // of eye height, below the eye's top edge
  browInner: 0.27,
  contact: 0.15,           // contact shadow length, of eye height
  ambient: 0.18,           // socket ambient peak opacity
  glintDX: -0.14, glintDY: -0.145, glintR: 0.097,
  gazeMax: 0.41            // peak iris travel, as a fraction of rx
};

/**
 * Horizontal compression of the iris as the eyeball rotates.
 *
 * For travel x across a sphere of radius R the iris compresses by
 * cos(asin(x/R)) = sqrt(1 - (x/R)^2). At gazeMax = 0.41 that is 0.912 —
 * far subtler than it feels like it should be. Picking this by eye produced
 * ~0.72 during design, which read as a disc spinning rather than an eye turning.
 *
 * @param {number} gaze  -1..1, fraction of maximum travel
 */
export function foreshorten(gaze, gazeMax = BASE.gazeMax) {
  const ratio = Math.max(-1, Math.min(1, gaze)) * gazeMax;
  return Math.sqrt(1 - ratio * ratio);
}

/**
 * Every number needed to draw one eye.
 * @param {'amber'|'ember'} shapeName
 * @param {'L'|'R'} side
 */
export function eyeGeometry(shapeName, side, base = BASE) {
  const shape = SHAPES[shapeName];
  if (!shape) throw new Error(`unknown shape: ${shapeName}`);
  if (side !== 'L' && side !== 'R') throw new Error(`unknown side: ${side}`);

  const rx = base.rx * shape.rxFactor;
  const ry = base.ry * shape.ryFactor;
  const top = base.cy - ry;
  const eyeHeight = ry * 2;

  // The brow sits lower on the INNER edge, so the pair scowls toward each other.
  // Inner is the right side for the left eye, and vice versa.
  const yOuter = top + base.browOuter * eyeHeight;
  const yInner = top + base.browInner * eyeHeight;
  const yLeft = side === 'L' ? yOuter : yInner;
  const yRight = side === 'L' ? yInner : yOuter;

  // Contact shadow runs perpendicular to the brow line, in user space, so it
  // keeps one width along the whole edge. A bounding-box gradient leans.
  const dx = base.W;
  const dy = yRight - yLeft;
  const len = Math.hypot(dx, dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const midX = base.W / 2;
  const midY = (yLeft + yRight) / 2;
  const contactLen = base.contact * eyeHeight;

  // The glint is a reflection of one fixed light over the house, so it leans
  // the same way in world space on both eyes — which means mirrored per sprite.
  const glintX = base.cx + (side === 'L' ? base.glintDX : -base.glintDX) * rx;
  const glintY = base.cy + base.glintDY * ry;

  const pupilR = base.pupilR * rx;

  return {
    side, shapeName, rx, ry, top, eyeHeight,
    cx: base.cx, cy: base.cy, W: base.W, H: base.H,
    hasIris: shape.hasIris,
    halo: shape.halo,
    defaultPupil: shape.pupil,
    irisR: base.irisR * rx,
    pupil: { round: pupilR, slitRx: pupilR * 0.52, slitRy: pupilR * 1.72 },
    brow: { yLeft, yRight },
    contact: {
      x1: midX, y1: midY,
      x2: midX + perpX * contactLen,
      y2: midY + perpY * contactLen
    },
    ambient: { y1: top, y2: base.cy + 2, opacity: base.ambient },
    glint: { x: glintX, y: glintY, r: base.glintR * rx },
    gazeMaxPx: base.gazeMax * rx,
    gazeMax: base.gazeMax
  };
}
