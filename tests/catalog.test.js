// Checks how the sheet and the presets become the app's catalogue.
import { describe, it, expect } from 'vitest';
import bars from '../data/bars.xlsx';
import { BUILTINS, GROUPS, groupOf, sheetBarDef } from '../src/catalog.js';
import { setState, normalize, rebuildCatalog, getDef, state } from '../src/state.js';

describe('catalogue', () => {
  it('offers every included sheet bar', () => {
    expect(BUILTINS.filter(d => d.id.startsWith('wiki-')).length).toBe(bars.length);
  });
  it('gives every item a unique id', () => {
    expect(new Set(BUILTINS.map(d => d.id)).size).toBe(BUILTINS.length);
  });
  it('lists every item under a known group', () => {
    const known = new Set(GROUPS.map(([g]) => g));
    expect(BUILTINS.filter(d => !known.has(groupOf(d))).map(d => d.name)).toEqual([]);
  });
  it('files sheet bars by their type, and blank types as not sorted yet', () => {
    expect(groupOf(sheetBarDef({ name:'X', type:'official', pageid:'no-such-page' }))).toBe('yours'); // unknown ids count as custom
    const official = BUILTINS.find(d => d.type === 'official'), blank = BUILTINS.find(d => d.type === '');
    if (official) expect(groupOf(official)).toBe('official');
    if (blank) expect(groupOf(blank)).toBe('unsorted');
  });
  it('keeps an edited sheet bar in its category', () => {
    const b = BUILTINS.find(d => d.type === 'official');
    if (b) expect(groupOf({ id:b.id, cat:'bar', name:'Renamed' })).toBe('official');
  });
  it('never shows how a sheet bar is earned', () => {
    expect(BUILTINS.filter(d => d.id.startsWith('wiki-') && d.note).map(d => d.name)).toEqual([]);
  });
});

describe('loading old plans', () => {
  it('moves the old Wizard preset onto the sheet bar', () => {
    setState(normalize({ v:1, placed:[{ uid:'a', item:'bar-wizard', section:'front', x:2, y:3, rot:0 }] }));
    rebuildCatalog();
    expect(getDef(state.placed[0].item).name).toBe('Wizard');
  });
  it('moves the old EngSoc crest preset onto the sheet row', () => {
    setState(normalize({ v:1, placed:[{ uid:'a', item:'patch-engsoc', section:'back', x:2, y:3, rot:0 }] }));
    rebuildCatalog();
    expect(getDef(state.placed[0].item).name).toBe('EngSoc Crest');
  });
  it('has no preset with the same name as a sheet bar', () => {
    const names = new Set(bars.map(b => b.name.toLowerCase()));
    expect(BUILTINS.filter(d => !d.id.startsWith('wiki-') && names.has(d.name.toLowerCase())).map(d => d.name)).toEqual([]);
  });
});

describe('rebuildCatalog', () => {
  it('keeps a placement whose bar has left the list', () => {
    setState(normalize({ v:1, placed:[{ uid:'a', item:'wiki-does-not-exist', section:'front', x:2, y:3, rot:0 }] }));
    rebuildCatalog();
    expect(state.placed).toHaveLength(1);
    expect(getDef('wiki-does-not-exist').missing).toBe(true);
  });
});
