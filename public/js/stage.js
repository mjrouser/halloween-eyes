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
    }
  };
}
