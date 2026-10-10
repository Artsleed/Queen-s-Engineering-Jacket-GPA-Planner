import { describe, it, expect, beforeEach } from 'vitest';
import { setState, normalize, rebuildCatalog, sectionSize, noGoZones } from '../src/state.js';
import { boxesClash, conflicts, findSpot } from '../src/fit.js';

// Loads a plan the same way the app does when it opens a saved one.
function load(plan){
  setState(normalize({ v:1, ...plan }));
  rebuildCatalog();
}
// The Blank bar preset is a standard 12.1 × 2.9 cm bar.
const bar = (uid, x, y, section = 'front') => ({ uid, item:'bar-blank', section, x, y, rot:0 });

describe('boxesClash', () => {
  const a = { x:0, y:0, w:10, h:2 };
  it('flags overlapping boxes', () => expect(boxesClash(a, { x:5, y:1, w:10, h:2 }, 0)).toBe(true));
  it('allows boxes that only touch when no gap is required', () => expect(boxesClash(a, { x:10, y:0, w:10, h:2 }, 0)).toBe(false));
  it('flags boxes closer than the gap', () => expect(boxesClash(a, { x:10.2, y:0, w:10, h:2 }, 0.3)).toBe(true));
  it('allows boxes exactly the gap apart', () => expect(boxesClash(a, { x:10.3, y:0, w:10, h:2 }, 0.3)).toBe(false));
});

describe('conflicts', () => {
  beforeEach(() => load({ placed:[] }));

  it('is empty for a single bar in open space', () => {
    load({ placed:[bar('a', 2, 5)] });
    expect(conflicts('front').size).toBe(0);
  });
  it('flags both bars when they overlap', () => {
    load({ placed:[bar('a', 2, 5), bar('b', 4, 6)] });
    const bad = conflicts('front');
    expect(bad.get('a')).toBe('Overlaps Blank bar');
    expect(bad.get('b')).toBe('Overlaps Blank bar');
  });
  it('flags bars closer than the minimum gap', () => {
    load({ placed:[bar('a', 2, 5), bar('b', 2, 8)] }); // 0.1 cm apart, gap is 0.3
    expect(conflicts('front').get('b')).toMatch(/^Closer than 0.3 cm/);
  });
  it('flags a bar hanging off the edge', () => {
    const { w } = sectionSize('front');
    load({ placed:[bar('a', w - 5, 5)] });
    expect(conflicts('front').get('a')).toBe('Hangs off the edge of the panel');
  });
  it('flags a bar covering the zipper', () => {
    const zip = noGoZones('front').find(z => z.kind === 'zip');
    load({ placed:[bar('a', zip.x - 5, 5)] });
    expect(conflicts('front').get('a')).toBe('Covers the zipper');
  });
  it('only checks the section asked for', () => {
    load({ placed:[bar('a', 2, 5, 'back'), bar('b', 4, 6, 'back')] });
    expect(conflicts('front').size).toBe(0);
    expect(conflicts('back').size).toBe(2);
  });
});

describe('findSpot', () => {
  it('finds a spot that does not conflict with anything', () => {
    load({ placed:[bar('a', 2, 5, 'back')] });
    const spot = findSpot('back', 12.1, 2.9);
    load({ placed:[bar('a', 2, 5, 'back'), bar('b', spot.x, spot.y, 'back')] });
    expect(conflicts('back').size).toBe(0);
  });
  it('returns null when nothing fits', () => {
    load({ placed:[] });
    expect(findSpot('leftSleeve', 100, 2.5)).toBeNull();
  });
});
