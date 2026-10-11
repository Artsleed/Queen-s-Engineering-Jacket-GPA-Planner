// Checks the curved-bar geometry that drawing and fit checking share.
import { describe, it, expect } from 'vitest';
import { arcGeom, arcOutline, localOutline, outlinesClash, coverage } from '../src/shapes.js';

const box = pts => ({ x0:Math.min(...pts.map(p => p[0])), x1:Math.max(...pts.map(p => p[0])), y0:Math.min(...pts.map(p => p[1])), y1:Math.max(...pts.map(p => p[1])) });

describe('arcGeom', () => {
  it('fills the bounding box exactly', () => {
    const b = box(arcOutline(12.1, 4.1, 2.9, 200));
    expect(b.x0).toBeCloseTo(0, 3); expect(b.x1).toBeCloseTo(12.1, 3);
    expect(b.y0).toBeCloseTo(0, 3); expect(b.y1).toBeCloseTo(4.1, 2);
  });
  it('is flat when the box is no taller than the band', () => expect(arcGeom(12, 2.9, 2.9).R).toBe(Infinity));
  it('covers less than its bounding box', () => {
    const c = coverage({ shape:'arc', w:12.1, h:4.1, band:2.9 });
    expect(c).toBeGreaterThan(0.6); expect(c).toBeLessThan(0.75);
  });
});

describe('localOutline', () => {
  it('swaps width and height when rotated', () => {
    const b = box(localOutline({ shape:'arc', w:12.1, h:4.1, band:2.9 }, 90));
    expect(b.x1 - b.x0).toBeCloseTo(4.1, 2); expect(b.y1 - b.y0).toBeCloseTo(12.1, 3);
  });
});

describe('outlinesClash', () => {
  const sq = (x, y, s = 1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  it('flags overlap', () => expect(outlinesClash(sq(0, 0), sq(0.5, 0.5), 0)).toBe(true));
  it('allows touching with no gap', () => expect(outlinesClash(sq(0, 0), sq(1, 0), 0)).toBe(false));
  it('flags shapes closer than the gap', () => expect(outlinesClash(sq(0, 0), sq(1.2, 0), 0.3)).toBe(true));
  it('allows shapes exactly the gap apart', () => expect(outlinesClash(sq(0, 0), sq(1.3, 0), 0.3)).toBe(false));
  it('flags one shape inside another', () => expect(outlinesClash(sq(0, 0, 5), sq(2, 2), 0)).toBe(true));
  it('flags two shapes exactly on top of each other', () => {
    const bar = arcOutline(12.1, 4.1, 2.9);
    expect(outlinesClash(bar, bar, 0)).toBe(true);
    expect(outlinesClash(sq(0, 0), sq(0, 0), 0)).toBe(true);
  });
  it('allows shapes that share an edge when there is no gap', () => expect(outlinesClash(sq(0, 0), sq(0, 1), 0)).toBe(false));
});
