import { describe, it, expect, beforeEach } from 'vitest';
import { setState, normalize, rebuildCatalog, sectionSize, noGoZones, state, getDef, isFixed } from '../src/state.js';
import { localOutline } from '../src/shapes.js';
import { boxesClash, conflicts, findSpot, settle } from '../src/fit.js';
import { DEFAULT_MEAS } from '../src/config.js';
const DEFAULT_MEAS_SLEEVE = DEFAULT_MEAS.sleeve;

// Loads a plan the same way the app does when it opens a saved one.
// Every plan includes a plain 12 × 3 cm box item, so these tests don't depend on bar shapes.
// The traditional pieces (which every loaded plan gets) are taken off, for a bare jacket.
const BOX = { id:'c-box', cat:'bar', name:'Box', text:'', w:12, h:3, shape:'rect' };
function load(plan){
  const s = normalize({ v:4, items:[BOX], ...plan });
  s.placed = s.placed.filter(p => !isFixed(p));
  setState(s);
  rebuildCatalog();
}
const bar = (uid, x, y, section = 'front') => ({ uid, item:'c-box', section, x, y, rot:0 });

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
    load({ placed:[bar('a', 2, 25)] });
    expect(conflicts('front').size).toBe(0);
  });
  it('flags both bars when they overlap', () => {
    load({ placed:[bar('a', 2, 25), bar('b', 4, 26)] });
    const bad = conflicts('front');
    expect(bad.get('a')).toBe('Overlaps Box');
    expect(bad.get('b')).toBe('Overlaps Box');
  });
  it('flags bars closer than the minimum gap', () => {
    load({ placed:[bar('a', 2, 25), bar('b', 2, 28.1)] }); // 0.1 cm apart, gap is 0.3
    expect(conflicts('front').get('b')).toMatch(/^Closer than 0.3 cm/);
  });
  it('flags a bar hanging off the edge', () => {
    const { w } = sectionSize('front');
    load({ placed:[bar('a', w - 5, 5)] });
    expect(conflicts('front').get('a')).toBe('Hangs off the edge of the panel');
  });
  it('flags a bar covering the zipper', () => {
    const zip = noGoZones('front').find(z => z.kind === 'opening');
    load({ placed:[bar('a', zip.x - 5, 40)] }); // below the lapels
    expect(conflicts('front').get('a')).toBe('Covers the zipper');
  });
  it('flags a bar over a pocket', () => {
    const pk = noGoZones('front').find(z => z.kind === 'pocket');
    load({ placed:[bar('a', pk.x - 3, pk.y + 4)] });
    expect(conflicts('front').get('a')).toBe('Covers the pocket');
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
    const spot = findSpot('back', 12, 3);
    load({ placed:[bar('a', 2, 5, 'back'), bar('b', spot.x, spot.y, 'back')] });
    expect(conflicts('back').size).toBe(0);
  });
  it('returns null when nothing fits', () => {
    load({ placed:[] });
    expect(findSpot('leftSleeve', 100, 2.5)).toBeNull();
  });
});

describe('curved bars', () => {
  // The standard bar: a 2.9 cm band, curved to a 12.1 × 4.1 cm bounding box.
  const curved = (uid, x, y, rot = 0) => ({ uid, item:'bar-blank', section:'back', x, y, rot });
  const between = gapY => { load({ placed:[curved('a', 5, 40), curved('b', 5, 40 + gapY)] }); return conflicts('back').get('b'); };

  it('nest closer than their bounding boxes allow', () => {
    expect(between(4.4)).toBeUndefined(); // boxes would need 4.1 + 0.3 = 4.4 cm
    expect(between(3.9)).toBeUndefined(); // the real outlines still clear the gap
  });
  it('overlap when placed on the same spot', () => expect(between(0)).toMatch(/^Overlaps/));
  it('still overlap when stacked too tightly', () => {
    expect(between(3.0)).toMatch(/^Overlaps/); // the inner curve is tighter, so the ends collide
  });
  it('can sit side by side with their curves touching only at the gap', () => {
    load({ placed:[curved('a', 2, 40), curved('b', 14.4, 40)] });
    expect(conflicts('back').size).toBe(0);
  });
  it('load upright even if they were saved turned 90° (rotating was removed)', () => {
    load({ placed:[curved('a', 5, 20, 90)] });
    expect(state.placed[0].rot).toBe(0);
  });
});

describe('findSpot on sleeves', () => {
  it('stacks down the outer side instead of moving sideways', () => {
    load({ placed:[{ uid:'a', item:'c-box', section:'leftSleeve', x:13, y:2, rot:0 }] }); // no room above it
    const spot = findSpot('leftSleeve', 12, 3);
    expect(spot.x).toBe(13);           // same column, centred on the sleeve
    expect(spot.y).toBe(5.5);          // right below it: 2 + 3 cm, plus the 0.3 cm gap, on the 0.5 cm grid
  });
});

describe('findSpot speed', () => {
  it('fills a sleeve with curved bars quickly', () => {
    load({ placed:[] });
    const d = getDef('bar-blank'), t = performance.now();
    for (let i = 0; i < 12; i++){
      const s = findSpot('leftSleeve', d.w, d.h, null, localOutline(d));
      if (s) state.placed.push({ uid:'u' + i, item:d.id, section:'leftSleeve', x:s.x, y:s.y, rot:0, text:null });
    }
    expect(conflicts('leftSleeve').size).toBe(0);
    expect(performance.now() - t).toBeLessThan(2000); // 12 Adds in total
  });
});

describe('settle', () => {
  it('lets a bar sit on the cuff band (they do get sewn there)', () => {
    load({ placed:[] });
    const p = { uid:'a', item:'bar-blank', section:'leftSleeve', x:13, y:DEFAULT_MEAS_SLEEVE - 5, rot:0, text:null };
    state.placed.push(p);
    expect(settle(p)).toBeNull();
    expect(conflicts('leftSleeve').size).toBe(0);
  });
  it('moves a bar off the snapped cuff vent by the underarm', () => {
    load({ placed:[] });
    const p = { uid:'a', item:'bar-blank', section:'leftSleeve', x:0, y:DEFAULT_MEAS_SLEEVE - 5, rot:0, text:null };
    state.placed.push(p);
    expect(settle(p).label).toBe('Cuff snaps');
    expect(conflicts('leftSleeve').size).toBe(0);
  });
  it('leaves a patch alone when it only overlaps another patch', () => {
    load({ placed:[bar('a', 2, 25), bar('b', 4, 26)] });
    expect(settle(state.placed[1])).toBeNull();
    expect(state.placed[1].x).toBe(4);
  });
});
