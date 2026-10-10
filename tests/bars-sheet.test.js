// Checks data/bars.xlsx for mistakes. Run `npm test` after editing the sheet.
// Imported the same way the app imports it, so this also tests the build step.
import { describe, it, expect } from 'vitest';
import bars from '../data/bars.xlsx';

const TYPES = ['official', 'experimental', 'academic', '']; // blank = not classified yet

describe('data/bars.xlsx', () => {
  it('has bars in it', () => expect(bars.length).toBeGreaterThan(0));

  it('only uses known types', () => {
    const bad = bars.filter(b => !TYPES.includes(b.type)).map(b => `${b.name}: "${b.type}"`);
    expect(bad, 'type must be official, experimental, academic, skip or blank').toEqual([]);
  });

  it('has no two included bars with the same name', () => {
    const seen = new Map(), dup = [];
    for (const b of bars){
      const k = b.name.toLowerCase();
      if (seen.has(k)) dup.push(b.name); else seen.set(k, b);
    }
    expect(dup, 'set include to no on one of each pair').toEqual([]);
  });
});
