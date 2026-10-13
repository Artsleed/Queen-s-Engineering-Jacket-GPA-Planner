// Checks the traditional pieces: where a new jacket puts them, and that old plans get them.
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, normalize, newJacket, rebuildCatalog, state, isFixed } from '../src/state.js';
import { conflicts } from '../src/fit.js';
import { SECTIONS, froshYear } from '../src/config.js';

const TRAD = ['trad-qas', 'trad-uni-motto', 'patch-pass', 'trad-year-motto', 'patch-year', 'trad-year-crest'];
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
    expect(on('trad-year-crest').section).toBe('front');
  });
  it("puts the year crest on the wearer's left (the front's right half)", () => {
    expect(on('trad-year-crest').x).toBeGreaterThan(state.meas.chest/4);
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

describe('loading a saved plan', () => {
  it('gives old plans every traditional piece (v1 had none, v3 had no year crest)', () => {
    for (const v of [1, 3]){
      setState(normalize({ v, placed:[] })); rebuildCatalog();
      expect(state.placed.map(p => p.item).sort()).toEqual([...TRAD].sort());
    }
  });
  it('puts a moved traditional piece back in its spot', () => {
    setState(normalize({ v:4, placed:[{ uid:'a', item:'patch-pass', section:'front', x:2, y:3, rot:90 }] })); rebuildCatalog();
    const fresh = newJacket().placed.find(p => p.item === 'patch-pass');
    expect(on('patch-pass')).toMatchObject({ uid:'a', section:fresh.section, x:fresh.x, y:fresh.y, rot:0 });
  });
  it('drops extra copies of a traditional piece', () => {
    setState(normalize({ v:4, placed:[{ uid:'a', item:'patch-pass', section:'rightSleeve', x:2, y:3, rot:0 }, { uid:'b', item:'patch-pass', section:'back', x:9, y:9, rot:0 }] })); rebuildCatalog();
    expect(state.placed.filter(p => p.item === 'patch-pass').map(p => p.uid)).toEqual(['a']);
  });
  it('keeps the text typed on the year number', () => {
    setState(normalize({ v:4, placed:[{ uid:'a', item:'patch-year', section:'leftSleeve', x:0, y:0, rot:0, text:'29' }] })); rebuildCatalog();
    expect(on('patch-year').text).toBe('29');
  });
});

describe('fixed pieces', () => {
  it('are the traditional ones', () => {
    setState(newJacket()); rebuildCatalog();
    expect(state.placed.every(p => isFixed(p))).toBe(true);
    expect(isFixed({ item:'wiki-2095' })).toBe(false);
  });
});
