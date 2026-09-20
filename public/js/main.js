// Boot, viewport detection, and the render loop.

import { eyeGeometry, BASE } from './geometry.js';
import { PALETTES, SHAPES } from './themes.js';
import { createEyeSvg, updateEye } from './render.js';
import { makeStage, DEFAULT_GAP_EYE_WIDTHS } from './stage.js';
import { showState, DEFAULT_SHOW_CONFIG } from './director.js';

/**
 * Which half of the stage this window renders.
 *
 * Derived from the window's own position rather than passed in at launch, so a
 * window is correct for wherever it actually landed. Two Chromium windows starting
 * together is a race; if the compositor resolves it by launch order the assignment
 * can differ between boots, and the failure is subtle — a swapped pair scowls
 * outward instead of inward rather than showing anything obviously broken.
 */
export function detectViewport() {
  const override = new URLSearchParams(location.search).get('viewport');
  if (override === 'left' || override === 'right') return override;
  // On an extended desktop the second output starts at x = width of the first.
  return window.screenX >= window.screen.width / 2 ? 'right' : 'left';
}

const state = {
  shape: 'amber',
  palette: 'amber',
  energyDrift: true,
  crowdStyle: 'shrink'
};

let viewport, stage, eyes, stageEl;

function buildEyes() {
  stageEl.replaceChildren();
  const palette = PALETTES[state.palette];
  const pupilShape = palette.pupilOverride ?? SHAPES[state.shape].pupil;

  eyes = ['L', 'R'].map((side) => {
    const geom = eyeGeometry(state.shape, side);
    const svg = createEyeSvg(geom, palette, 'eye');
    const holder = document.createElement('div');
    holder.className = 'eye';
    holder.appendChild(svg);
    stageEl.appendChild(holder);
    return { side, geom, svg, holder, pupilShape };
  });
}

function layout() {
  const vw = window.innerWidth;
  const eyeW = vw * (BASE.rx * 2 / BASE.W);
  stage = makeStage({ viewportW: vw, eyeW, gapEyeWidths: DEFAULT_GAP_EYE_WIDTHS });
  for (const e of eyes) e.holder.style.width = `${vw}px`;
}

function frame() {
  const s = showState(Date.now(), { ...DEFAULT_SHOW_CONFIG, energyDrift: state.energyDrift });
  const vw = stage.viewportW;

  for (const e of eyes) {
    const eyeState = e.side === 'L' ? s.eyeL : s.eyeR;
    updateEye(e.svg._refs, { ...eyeState, pupilShape: e.pupilShape });

    const home = e.side === 'L' ? stage.viewports.left.x0 : stage.viewports.right.x0;
    const stageX = home + eyeState.stageOffset * vw;
    const localX = stage.toViewportX(stageX, viewport);

    // Crowding compresses the eyes so two fit in one window. `squash` distorts
    // horizontally (squash-and-stretch, reads as crowded); `shrink` scales
    // uniformly (reads as receding).
    const crowd = Math.abs(eyeState.stageOffset);
    const k = 1 - Math.min(1, crowd) * 0.52;
    const scale = state.crowdStyle === 'squash' ? `scaleX(${k})` : `scale(${k})`;

    e.holder.style.transform = `translateX(${localX}px) ${scale}`;
  }
  requestAnimationFrame(frame);
}

function applyConfig(next) {
  const rebuild = next.shape !== state.shape || next.palette !== state.palette;
  Object.assign(state, next);
  if (rebuild) buildEyes();
}

function showSetupOverlay() {
  const el = document.getElementById('setup-overlay');
  el.textContent = viewport.toUpperCase();
  el.hidden = false;
}

/**
 * Attach the control channel, if it is there.
 *
 * Deliberately a dynamic import inside a try/catch rather than a static import
 * at the top of this file. The show must never depend on the control channel:
 * a static import makes a missing, broken or syntactically invalid
 * config-client.js a hard boot failure, which is the one outcome that is not
 * allowed — an evening of dark windows because a feature nobody needs failed to
 * parse. Losing the channel costs a phone-switchable palette. Losing the show
 * costs the whole night.
 */
async function startConfigChannel(onConfig) {
  try {
    const mod = await import('./config-client.js');
    mod.startConfigClient(onConfig);
  } catch (err) {
    console.warn('Control channel unavailable; the show continues without it.', err);
  }
}

function boot() {
  stageEl = document.getElementById('stage');
  viewport = detectViewport();
  buildEyes();
  layout();
  window.addEventListener('resize', layout);
  if (new URLSearchParams(location.search).has('setup')) showSetupOverlay();
  startConfigChannel(applyConfig);
  requestAnimationFrame(frame);
}

boot();
