// Checks data/bars.xlsx for mistakes. Run `npm test` after editing the sheet.
// Imported the same way the app imports it, so this also tests the build step.
import { describe, it, expect } from 'vitest';
import bars from '../data/bars.xlsx';
import { sheetColour, sheetBarDef, COLOUR_COLS } from '../src/catalog.js';
import { BAR, FELT_COLOURS } from '../src/config.js';

const TYPES = ['official', 'experimental', 'academic', '']; // blank = not classified yet

describe('data/bars.xlsx', () => {
  it('has bars in it', () => expect(bars.length).toBeGreaterThan(0));

  it('only uses known types', () => {
    const bad = bars.filter(b => !TYPES.includes(b.type)).map(b => `${b.name}: "${b.type}"`);
    expect(bad, 'type must be official, experimental, academic, skip or blank').toEqual([]);
  });

  it('only uses colours the app knows', () => {
    const bad = [];
    for (const b of bars) for (const col of Object.values(COLOUR_COLS)) for (const k of [col, col.replace('colour', 'color')]){
      if (b[k] && !sheetColour(b[k])) bad.push(`${b.name}: ${k} "${b[k]}"`);
    }
    expect(bad, `use a hex code like #1E9E4A or one of: ${Object.keys(FELT_COLOURS).join(', ')}`).toEqual([]);
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

describe('bar colours from the sheet', () => {
  it('reads names and hex codes, and leaves blanks standard', () => {
    const d = sheetBarDef({ name:'malloc', pageid:'1', bar_colour:'Black', text_colour:'green', border_colour:'#0f0' });
    expect(d).toMatchObject({ bg:FELT_COLOURS.black, fg:FELT_COLOURS.green, border:'#00ff00' });
    expect(sheetBarDef({ name:'Plain', pageid:'2', bar_colour:'' })).toMatchObject({ bg:BAR.bg, fg:BAR.fg, border:BAR.border });
  });
  it('accepts the US spelling of the column names', () => {
    expect(sheetBarDef({ name:'x', pageid:'3', bar_color:'navy' }).bg).toBe(FELT_COLOURS.navy);
  });
  it('ignores colours it does not know', () => expect(sheetColour('blurple')).toBe(null));
});
