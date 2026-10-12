// Checks the fold and wear fields shared by the 3D model and the textures.
import { describe, it, expect } from 'vitest';
import { foldsFor, foldHeight, wearPotential, sleeveSides } from '../src/surface.js';
import { DEFAULT_MEAS } from '../src/config.js';

describe('folds', () => {
  it('are the same every time (so creases never move)', () => expect(foldsFor('back', DEFAULT_MEAS)).toEqual(foldsFor('back', DEFAULT_MEAS)));
  it('bunch inside the elbow, stay gentle above the (uncinched) cuff, and leave the outer upper arm smooth', () => {
    const f = foldsFor('leftSleeve', DEFAULT_MEAS), H = DEFAULT_MEAS.sleeve, W = DEFAULT_MEAS.sleeveCirc;
    const ripple = (x, y0, y1) => { let lo = Infinity, hi = -Infinity; for (let y = y0; y <= y1; y += 0.2){ const h = foldHeight(f, x, y); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    expect(ripple(W/2, H - DEFAULT_MEAS.cuff - 9, H - DEFAULT_MEAS.cuff)).toBeLessThan(0.45);
    expect(ripple(sleeveSides('leftSleeve', W).front, H*0.4, H*0.52)).toBeGreaterThan(0.5);
    expect(ripple(W/2, 8, 16)).toBeLessThan(0.15);
  });
});

describe('wearPotential', () => {
  it('stays between 0 and 1', () => {
    for (let x = 0; x <= 55; x += 5) for (let y = 0; y <= 68; y += 5){
      const w = wearPotential('front', DEFAULT_MEAS, x, y, 0.3, 0.5);
      expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1);
    }
  });
  it('is higher at seams and edges than mid-panel', () => {
    expect(wearPotential('back', DEFAULT_MEAS, 0.2, 30, 0, 0.5)).toBeGreaterThan(wearPotential('back', DEFAULT_MEAS, 20, 30, 0, 0.5) + 0.3);
  });
  it('rubs the back of the elbow', () => {
    const W = DEFAULT_MEAS.sleeveCirc, { back } = sleeveSides('rightSleeve', W);
    expect(wearPotential('rightSleeve', DEFAULT_MEAS, back, DEFAULT_MEAS.sleeve*0.47, 0, 0.5)).toBeGreaterThan(wearPotential('rightSleeve', DEFAULT_MEAS, W/2, 12, 0, 0.5) + 0.3);
  });
});
