// Builds one eye's SVG once, then mutates only the handful of attributes that
// change per frame. Rebuilding the tree each frame would be both slower and
// would restart any CSS transitions.

import { foreshorten } from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function radialGradient(id, cx, cy, stops) {
  const g = el('radialGradient', { id, cx, cy });
  for (const [offset, color] of stops) {
    g.appendChild(el('stop', { offset, 'stop-color': color }));
  }
  return g;
}

/**
 * Build the SVG for one eye. Returns the <svg> element with a `_refs` property
 * holding the nodes that change per frame.
 */
export function createEyeSvg(geom, palette, idPrefix) {
  const p = `${idPrefix}-${geom.side}`;
  const svg = el('svg', {
    viewBox: `0 0 ${geom.W} ${geom.H}`,
    role: 'img',
    'aria-label': geom.side === 'L' ? 'Left eye' : 'Right eye'
  });

  const defs = el('defs');
  defs.appendChild(radialGradient(`sc-${p}`, '42%', '34%', [
    ['0%', palette.sclera[0]], ['58%', palette.sclera[1]], ['100%', palette.sclera[2]]
  ]));
  if (geom.hasIris) {
    defs.appendChild(radialGradient(`ir-${p}`, '45%', '38%', [
      ['0%', palette.iris[0]], ['70%', palette.iris[1]], ['100%', palette.iris[2]]
    ]));
  }
  if (geom.halo) {
    const halo = el('radialGradient', { id: `ha-${p}`, cx: '50%', cy: '50%' });
    halo.appendChild(el('stop', { offset: '0%', 'stop-color': palette.halo, 'stop-opacity': 0.34 }));
    halo.appendChild(el('stop', { offset: '100%', 'stop-color': palette.halo, 'stop-opacity': 0 }));
    defs.appendChild(halo);
  }

  const clip = el('clipPath', { id: `cp-${p}` });
  clip.appendChild(el('ellipse', { cx: geom.cx, cy: geom.cy, rx: geom.rx, ry: geom.ry }));
  defs.appendChild(clip);

  const contact = el('linearGradient', {
    id: `ct-${p}`, gradientUnits: 'userSpaceOnUse',
    x1: geom.contact.x1, y1: geom.contact.y1, x2: geom.contact.x2, y2: geom.contact.y2
  });
  contact.appendChild(el('stop', { offset: '0%', 'stop-color': '#050409', 'stop-opacity': 0.7 }));
  contact.appendChild(el('stop', { offset: '100%', 'stop-color': '#050409', 'stop-opacity': 0 }));
  defs.appendChild(contact);

  const ambient = el('linearGradient', {
    id: `am-${p}`, gradientUnits: 'userSpaceOnUse',
    x1: 0, y1: geom.ambient.y1, x2: 0, y2: geom.ambient.y2
  });
  ambient.appendChild(el('stop', { offset: '0%', 'stop-color': '#050409', 'stop-opacity': geom.ambient.opacity }));
  ambient.appendChild(el('stop', { offset: '100%', 'stop-color': '#050409', 'stop-opacity': 0 }));
  defs.appendChild(ambient);

  svg.appendChild(defs);

  // No background rect. The container paints the black. An eye carrying its own
  // opaque canvas would drag a rectangle over its neighbour when the two overlap.
  if (geom.halo) {
    svg.appendChild(el('ellipse', {
      cx: geom.cx, cy: geom.cy, rx: geom.rx * 1.55, ry: geom.ry * 1.55, fill: `url(#ha-${p})`
    }));
  }
  svg.appendChild(el('ellipse', {
    cx: geom.cx, cy: geom.cy, rx: geom.rx, ry: geom.ry, fill: `url(#sc-${p})`
  }));

  const clipped = el('g', { 'clip-path': `url(#cp-${p})` });

  const mover = el('g');
  if (geom.hasIris) {
    mover.appendChild(el('circle', { cx: geom.cx, cy: geom.cy, r: geom.irisR, fill: `url(#ir-${p})` }));
  }
  const pupilRound = el('circle', { cx: geom.cx, cy: geom.cy, r: geom.pupil.round, fill: palette.pupil });
  const pupilSlit = el('ellipse', {
    cx: geom.cx, cy: geom.cy, rx: geom.pupil.slitRx, ry: geom.pupil.slitRy, fill: palette.pupil
  });
  mover.appendChild(pupilRound);
  mover.appendChild(pupilSlit);
  clipped.appendChild(mover);

  // The glint sits OUTSIDE the mover: it is a reflection of a fixed light, so it
  // holds still while the eyeball turns underneath it. Parenting it to the mover
  // makes the eye read as a decal sliding across a surface.
  clipped.appendChild(el('circle', {
    cx: geom.glint.x, cy: geom.glint.y, r: geom.glint.r,
    fill: palette.glint, opacity: palette.glintOpacity
  }));

  clipped.appendChild(el('polygon', {
    points: `0,-4 ${geom.W},-4 ${geom.W},${geom.brow.yRight} 0,${geom.brow.yLeft}`,
    fill: '#050409'
  }));
  const browNode = clipped.lastChild;

  clipped.appendChild(el('rect', { width: geom.W, height: geom.H, fill: `url(#am-${p})` }));
  clipped.appendChild(el('rect', { width: geom.W, height: geom.H, fill: `url(#ct-${p})` }));

  const lidTop = el('rect', { x: 0, y: geom.top, width: geom.W, height: 0, fill: '#050409' });
  const lidBot = el('rect', { x: 0, y: geom.cy, width: geom.W, height: 0, fill: '#050409' });
  clipped.appendChild(lidTop);
  clipped.appendChild(lidBot);

  svg.appendChild(clipped);

  svg._refs = { geom, mover, pupilRound, pupilSlit, browNode, lidTop, lidBot };
  return svg;
}

/**
 * Apply one frame of state to an already-built eye.
 * @param {object} refs      svg._refs
 * @param {object} s         { gaze, lid, brow, pupil, pupilShape }
 */
export function updateEye(refs, s) {
  const g = refs.geom;

  const tx = s.gaze * g.gazeMaxPx;
  const sx = foreshorten(s.gaze, g.gazeMax);
  refs.mover.setAttribute(
    'transform',
    `translate(${(g.cx + tx).toFixed(2)} ${g.cy}) scale(${sx.toFixed(4)} 1) translate(${-g.cx} ${-g.cy})`
  );

  const slit = s.pupilShape === 'slit';
  refs.pupilRound.setAttribute('display', slit ? 'none' : 'inline');
  refs.pupilSlit.setAttribute('display', slit ? 'inline' : 'none');
  refs.pupilRound.setAttribute('r', (g.pupil.round * s.pupil).toFixed(2));
  refs.pupilSlit.setAttribute('rx', (g.pupil.slitRx * s.pupil).toFixed(2));
  refs.pupilSlit.setAttribute('ry', (g.pupil.slitRy * s.pupil).toFixed(2));

  // Brow depth scales about the eye's top edge.
  const yL = g.top + (g.brow.yLeft - g.top) * s.brow;
  const yR = g.top + (g.brow.yRight - g.top) * s.brow;
  refs.browNode.setAttribute('points', `0,-4 ${g.W},-4 ${g.W},${yR.toFixed(2)} 0,${yL.toFixed(2)}`);

  const lidH = s.lid * g.ry;
  refs.lidTop.setAttribute('height', lidH.toFixed(2));
  refs.lidBot.setAttribute('y', (g.cy + g.ry - lidH * 0.62).toFixed(2));
  refs.lidBot.setAttribute('height', (lidH * 0.62).toFixed(2));
}
