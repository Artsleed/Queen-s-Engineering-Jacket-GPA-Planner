// Checks the 3D jacket model: it's built from the measurements, and a centimetre on the
// flat panel is (close to) a centimetre on the 3D surface, so patches show at true size.
import { describe, it, expect } from 'vitest';
import { buildJacket, cutaways } from '../src/model.js';
import { DEFAULT_MEAS } from '../src/config.js';

const J = buildJacket(DEFAULT_MEAS);
const panel = s => J.panels.filter(g => g.section === s);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rowLength = (g, j, i0 = 0, i1 = g.NU) => { let L = 0; for (let i = i0 + 1; i <= i1; i++) L += dist(g.pos[j][i], g.pos[j][i - 1]); return L; };
const colLength = (g, i, j0, j1) => { let L = 0; for (let j = j0 + 1; j <= j1; j++) L += dist(g.pos[j][i], g.pos[j - 1][i]); return L; };

describe('buildJacket', () => {
  it('builds every panel with finite points', () => {
    expect(J.panels.map(g => g.section).sort()).toEqual(['back', 'front', 'front', 'leftSleeve', 'rightSleeve']);
    for (const g of J.panels) expect(g.pos.flat().some(p => p.some(v => !Number.isFinite(v))), g.section).toBe(false);
    expect(J.collar.flat().every(p => p.every(Number.isFinite))).toBe(true);
    expect(J.lapels).toHaveLength(2);
  });
  it('keeps the back true to size across', () => {
    const B = panel('back')[0], j = Math.round(B.NV*0.45); // chest height, away from the folds
    expect(rowLength(B, j)/(DEFAULT_MEAS.chest/2)).toBeGreaterThan(0.95);
    expect(rowLength(B, j)/(DEFAULT_MEAS.chest/2)).toBeLessThan(1.06);
  });
  it('keeps the back true to size down the middle', () => {
    const B = panel('back')[0], i = B.NU/2, j0 = Math.round(B.NV*0.2), j1 = Math.round(B.NV*0.6);
    const flat = DEFAULT_MEAS.length*(j1 - j0)/B.NV;
    expect(colLength(B, i, j0, j1)/flat).toBeGreaterThan(0.95);
    expect(colLength(B, i, j0, j1)/flat).toBeLessThan(1.06);
  });
  it('keeps the outer side of the sleeve true to size', () => {
    for (const g of [...panel('leftSleeve'), ...panel('rightSleeve')]){
      const i = g.NU/2, j0 = Math.round(g.NV*0.25), j1 = Math.round(g.NV*0.75), flat = DEFAULT_MEAS.sleeve*(j1 - j0)/g.NV;
      expect(colLength(g, i, j0, j1)/flat, g.section).toBeGreaterThan(0.95);
      expect(colLength(g, i, j0, j1)/flat, g.section).toBeLessThan(1.06);
    }
  });
  it('hangs the front open', () => {
    const [L, R] = panel('front'), j = Math.round(L.NV*0.3);
    expect(R.pos[j][0][0] - L.pos[j][L.NU][0]).toBeGreaterThan(3); // cm apart at the chest
  });
  it('grows with the chest measurement', () => {
    const big = buildJacket({ ...DEFAULT_MEAS, chest:130 }), width = jk => Math.max(...jk.panels[2].pos.flat().map(p => p[0])) - Math.min(...jk.panels[2].pos.flat().map(p => p[0]));
    expect(width(big)).toBeGreaterThan(width(J)*1.12);
  });
});

describe('cutaways', () => {
  const cut = cutaways(DEFAULT_MEAS), at = (prof, x) => prof.reduce((best, p) => Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best)[1];
  it('cuts the neckline out of the top of the front', () => {
    expect(at(cut.front, DEFAULT_MEAS.chest/4)).toBeGreaterThan(3);
    expect(at(cut.front, 0)).toBeLessThan(1);
  });
  it('curves the sleeve cap away toward the underarm, not on the outer side', () => {
    for (const s of ['leftSleeve', 'rightSleeve']){
      expect(at(cut[s], DEFAULT_MEAS.sleeveCirc/2), s).toBeLessThan(0.5);
      expect(at(cut[s], 0), s).toBeGreaterThan(8);
      expect(at(cut[s], DEFAULT_MEAS.sleeveCirc), s).toBeGreaterThan(8);
    }
  });
});
