// Both eyes live on one virtual stage. Each monitor shows a slice of it.
//
// The wall between the slices is a TIMING parameter, not a measurement. The real
// wall is 2.58x a screen width, which would leave an eye invisible for ~3.9s while
// crossing — a dead beat, not a joke. Nobody in the street can perceive whether the
// transit was to scale, so the gap is tuned by eye instead.

/**
 * Hard floor. Below one eye width, an eye in transit is visible in BOTH windows
 * at once — leading edge in one, trailing edge in the other. Those halves are
 * drawn by two independent processes, so any frame difference shows as a tear
 * down the middle of something that is meant to be one object.
 */
export const MIN_GAP_EYE_WIDTHS = 1.0;
export const DEFAULT_GAP_EYE_WIDTHS = 1.2;

/**
 * Crowding (the bothOneWindow gag): both eyes squeeze into the LEFT window.
 * Two full-size eyes cannot share a window (each is ~73% of its width), so they
 * compress together to ~0.5 (DESIGN.md §4.1) and sit side by side, nearly touching.
 * Positions are derived from the stage geometry here, where the gap is known.
 * The director only says how crowded (0..1); it cannot know the gap in pixels.
 */
export const CROWD_SCALE = 0.5;
/** Space between the crowded eyes, as a fraction of one crowded eye's width. */
export const CROWD_SPACING = 0.1;

export function makeStage({ viewportW, eyeW, gapEyeWidths = DEFAULT_GAP_EYE_WIDTHS }) {
  if (!(gapEyeWidths >= MIN_GAP_EYE_WIDTHS)) {
    throw new RangeError(
      `apparent gap must be at least ${MIN_GAP_EYE_WIDTHS} eye widths, got ${gapEyeWidths}. ` +
      `A narrower gap lets one eye appear in both windows at once, where the two ` +
      `independently rendered halves can fail to line up.`
    );
  }

  const gapPx = eyeW * gapEyeWidths;
  const totalW = viewportW * 2 + gapPx;
  const viewports = {
    left:  { x0: 0, x1: viewportW },
    right: { x0: viewportW + gapPx, x1: totalW }
  };

  return {
    totalW, gapPx, eyeW, viewportW, viewports,
    /** Stage x -> local x within one viewport. Values outside [0, viewportW] are off-screen. */
    toViewportX(stageX, which) {
      const vp = viewports[which];
      if (!vp) throw new Error(`unknown viewport: ${which}`);
      return stageX - vp.x0;
    },
    /**
     * Where each eye's center sits on the stage, and the one scale both share,
     * at a crowding amount from 0 (each eye home) to 1 (both in the left window).
     * One shared scale is the point: the eyes must compress together.
     */
    crowdPlacement(crowd) {
      const u = Math.max(0, Math.min(1, crowd));
      const scale = 1 - u * (1 - CROWD_SCALE);
      const homeL = viewports.left.x0 + viewportW / 2;
      const homeR = viewports.right.x0 + viewportW / 2;
      // Crowded centers: symmetric about the left window's center.
      const halfPitch = eyeW * CROWD_SCALE * (1 + CROWD_SPACING) / 2;
      const endL = homeL - halfPitch;
      const endR = homeL + halfPitch;
      return {
        scale,
        L: { centerX: homeL + (endL - homeL) * u, scale },
        R: { centerX: homeR + (endR - homeR) * u, scale }
      };
    }
  };
}
