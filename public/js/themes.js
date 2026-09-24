// Shape and palette are independent axes: any shape works in any palette.
// Both are switchable at runtime (see config-client.js), so nothing here may
// be baked into the renderer.

export const SHAPES = {
  // Bright field, dark pupil. Most legible gaze direction at distance.
  amber: { rxFactor: 1.00, ryFactor: 1.00, hasIris: true,  pupil: 'round', halo: false },
  // No sclera — a glowing orb. Best atmosphere, softer extremes.
  ember: { rxFactor: 0.76, ryFactor: 1.00, hasIris: false, pupil: 'slit',  halo: true  }
};

export const PALETTES = {
  amber: {
    sclera: ['#FFC96A', '#F0A72C', '#B96C07'],
    iris:   ['#B8541A', '#8A3505', '#421400'],
    pupil: '#150300', glint: '#FFF3D6', glintOpacity: 0.5, halo: '#FF8C1A',
    pupilOverride: null
  },
  green: {
    sclera: ['#F2FBCF', '#C3E07A', '#6B9B34'],
    iris:   ['#7BA83A', '#48701E', '#1B3A0A'],
    pupil: '#080F04', glint: '#FBFFE8', glintOpacity: 0.5, halo: '#9FD84A',
    // A cat's eye has a vertical slit — that, not the color alone,
    // is what turns a green eye into a cat.
    pupilOverride: 'slit'
  }
};

export const SHAPE_NAMES = Object.keys(SHAPES);
export const PALETTE_NAMES = Object.keys(PALETTES);
