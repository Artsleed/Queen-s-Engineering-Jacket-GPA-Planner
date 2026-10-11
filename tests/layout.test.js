// Checks the traditional pieces: where a new jacket puts them, and that old plans get them.
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, normalize, newJacket, rebuildCatalog, state } from '../src/state.js';
import { conflicts } from '../src/fit.js';
import { SECTIONS, froshYear } from '../src/config.js';

const TRAD = ['trad-qas', 'trad-uni-motto', 'patch-pass', 'trad-year-motto', 'patch-year'];
const on = id => state.placed.find(p => p.item === id);

describe('a new jacket', () => {
  beforeEach(() => { setState(newJacket()); rebuildCatalog(); });

  it('starts with every traditional piece', () => expect(state.placed.map(p => p.item).sort()).toEqual([...TRAD].sort()));
  it('puts each piece in its traditional section', () => {
    expect(on('trad-qas').section).toBe('back');
    expect(on('trad-uni-motto').section).toBe('rightSleeve');
    expect(on('patch-pass').section).toBe('rightSleeve');
    expect(on('trad-year-motto').section).toBe('leftSleeve');
    expect(on('patch-year').section).toBe('leftSleeve');
  });
  it('stacks the motto above the crest and the year number', () => {
    expect(on('trad-uni-motto').y).toBeLessThan(on('patch-pass').y);
    expect(on('trad-year-motto').y).toBeLessThan(on('patch-year').y);
  });
  it('has nothing overlapping or off the edge', () => {
    for (const s of SECTIONS) expect([...conflicts(s).values()], s).toEqual([]);
  });
  it('stores the graduating year on the year number', () => expect(on('patch-year').text).toBe(froshYear()));
});

describe('froshYear', () => {
  it('is four years out from September on', () => expect(froshYear(new Date(2026, 8, 5))).toBe('30'));
  it('is three years out before September', () => expect(froshYear(new Date(2027, 3, 1))).toBe('30'));
});

describe('old (v1) plans', () => {
  it('get the traditional pieces added', () => {
    setState(normalize({ v:1, placed:[] })); rebuildCatalog();
    expect(state.placed.map(p => p.item).sort()).toEqual([...TRAD].sort());
  });
  it("don't get a second copy of a piece they already have", () => {
    setState(normalize({ v:1, placed:[{ uid:'a', item:'patch-pass', section:'front', x:2, y:3, rot:0 }] })); rebuildCatalog();
    expect(state.placed.filter(p => p.item === 'patch-pass')).toHaveLength(1);
    expect(on('patch-pass').section).toBe('front'); // where they put it
  });
  it('are left alone once they are v2', () => {
    setState(normalize({ v:2, placed:[] })); rebuildCatalog();
    expect(state.placed).toHaveLength(0);
  });
});
