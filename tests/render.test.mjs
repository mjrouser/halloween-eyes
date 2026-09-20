// Structural tests for the renderer, against a local DOM stub (no dependencies).
//
// These pin the two invariants the design calls out as real bug risks: the glint
// must not ride the moving group, and an eye must not carry an opaque background.
// Both are invisible in code review and obvious only at night, on a ladder.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-svg-dom.mjs';

let restore, createEyeSvg, updateEye, eyeGeometry, PALETTES, foreshorten;

before(async () => {
  restore = installFakeDom();
  ({ createEyeSvg, updateEye } = await import('../public/js/render.js'));
  ({ eyeGeometry, foreshorten } = await import('../public/js/geometry.js'));
  ({ PALETTES } = await import('../public/js/themes.js'));
});
after(() => restore());

const build = (shape = 'amber', side = 'L', pal = 'amber') => {
  const geom = eyeGeometry(shape, side);
  return { geom, svg: createEyeSvg(geom, PALETTES[pal], 'test') };
};

test('the glint does not ride the moving group', () => {
  const { svg } = build();
  const glint = svg._refs.geom && svg.descendants().find(
    (n) => n.nodeName === 'circle' && n.getAttribute('opacity') !== null);
  assert.ok(glint, 'expected a glint circle');
  assert.equal(svg._refs.mover.contains(glint), false,
    'glint inside the mover makes the eye read as a decal sliding across a surface');
});

test('an eye carries no opaque background rect', () => {
  const { svg, geom } = build();
  const opaqueFullBleed = svg.descendants().filter((n) =>
    n.nodeName === 'rect' &&
    n.getAttribute('width') === String(geom.W) &&
    !(n.getAttribute('fill') ?? '').startsWith('url('));
  // The only full-width solid rects are the two lids, which start at zero height.
  for (const r of opaqueFullBleed) {
    assert.equal(r.getAttribute('height'), '0',
      'a full-bleed opaque rect would drag a rectangle over the neighbouring eye');
  }
});

test('ids are namespaced per side so two eyes on one page do not collide', () => {
  const L = build('amber', 'L').svg;
  const R = build('amber', 'R').svg;
  const ids = (s) => s.descendants().map((n) => n.getAttribute('id')).filter(Boolean);
  const overlap = ids(L).filter((id) => ids(R).includes(id));
  assert.deepEqual(overlap, [], `colliding gradient/clip ids: ${overlap}`);
});

test('the ember shape gets a halo and no iris; amber the reverse', () => {
  const ember = build('ember').svg.descendants();
  const amber = build('amber').svg.descendants();
  const hasHalo = (ns) => ns.some((n) => (n.getAttribute('fill') ?? '').includes('ha-'));
  const hasIris = (ns) => ns.some((n) => (n.getAttribute('fill') ?? '').includes('ir-'));
  assert.ok(hasHalo(ember) && !hasIris(ember), 'ember is a glowing orb, no sclera/iris');
  assert.ok(hasIris(amber) && !hasHalo(amber), 'amber has an iris and no halo');
});

test('updateEye applies derived foreshortening, not a hand-picked squash', () => {
  const { svg, geom } = build();
  updateEye(svg._refs, { gaze: 1, lid: 0, brow: 1, pupil: 1, pupilShape: 'round' });
  const t = svg._refs.mover.getAttribute('transform');
  const scaleX = Number(/scale\(([-\d.]+)/.exec(t)[1]);
  assert.ok(Math.abs(scaleX - foreshorten(1, geom.gazeMax)) < 1e-4,
    `scale ${scaleX} should equal sqrt(1 - 0.41^2) ~= 0.9121`);
});

test('gaze translates the mover, and gaze 0 is centred', () => {
  const { svg, geom } = build();
  const txOf = () => Number(/translate\(([-\d.]+)/.exec(svg._refs.mover.getAttribute('transform'))[1]);
  updateEye(svg._refs, { gaze: 0, lid: 0, brow: 1, pupil: 1, pupilShape: 'round' });
  assert.ok(Math.abs(txOf() - geom.cx) < 1e-6, 'gaze 0 should sit at centre');
  updateEye(svg._refs, { gaze: 1, lid: 0, brow: 1, pupil: 1, pupilShape: 'round' });
  assert.ok(Math.abs(txOf() - (geom.cx + geom.gazeMaxPx)) < 1e-2, 'gaze 1 is full travel');
});

test('only one pupil shape is visible at a time', () => {
  const { svg } = build();
  for (const shape of ['round', 'slit']) {
    updateEye(svg._refs, { gaze: 0, lid: 0, brow: 1, pupil: 1, pupilShape: shape });
    const shown = [svg._refs.pupilRound, svg._refs.pupilSlit]
      .filter((n) => n.getAttribute('display') === 'inline');
    assert.equal(shown.length, 1, `expected exactly one visible pupil for ${shape}`);
  }
});

test('brow depth scales about the top edge, so brow=0 is a flat lid line', () => {
  const { svg, geom } = build();
  updateEye(svg._refs, { gaze: 0, lid: 0, brow: 0, pupil: 1, pupilShape: 'round' });
  const ys = svg._refs.browNode.getAttribute('points')
    .split(' ').slice(2).map((p) => Number(p.split(',')[1]));
  for (const y of ys) assert.ok(Math.abs(y - geom.top) < 1e-6, 'brow=0 collapses to the top edge');
});

test('a closed lid covers the full eye height', () => {
  const { svg, geom } = build();
  updateEye(svg._refs, { gaze: 0, lid: 1, brow: 1, pupil: 1, pupilShape: 'round' });
  assert.ok(Math.abs(Number(svg._refs.lidTop.getAttribute('height')) - geom.ry) < 1e-2);
  updateEye(svg._refs, { gaze: 0, lid: 0, brow: 1, pupil: 1, pupilShape: 'round' });
  assert.equal(Number(svg._refs.lidTop.getAttribute('height')), 0, 'lid 0 is fully open');
});
