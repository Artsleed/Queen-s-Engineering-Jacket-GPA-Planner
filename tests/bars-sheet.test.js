// Checks data/bars.xlsx for mistakes. Run `npm test` after editing the sheet.
// Imported the same way the app imports it, so this also tests the build step.
import { describe, it, expect } from 'vitest';
import bars from '../data/bars.xlsx';
import { sheetColour, sheetBarDef, sheetBarDefs, sheetShape, shapeList, COLOUR_COLS } from '../src/catalog.js';
import { BAR, FELT_COLOURS, SHEET_SHAPES } from '../src/config.js';
import { SYMBOL_NAMES } from '../src/symbols.js';

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

  it('only uses shapes the app knows', () => {
    const bad = bars.flatMap(b => shapeList(b.shape).filter(x => !sheetShape(x)).map(x => `${b.name}: "${x}"`));
    expect(bad, `shape must be blank or one of: ${Object.keys(SHEET_SHAPES).join(', ')}`).toEqual([]);
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

describe('bar shapes from the sheet', () => {
  it('makes a hazard sign: a yellow triangle with a bolt and no lettering', () => {
    const d = sheetBarDef({ name:'High Voltage', pageid:'4', shape:'Hazard' });
    expect(d).toMatchObject({ shape:'hazard', symbol:'bolt', text:'', w:SHEET_SHAPES.hazard.w, bg:SHEET_SHAPES.hazard.bg });
    expect(d.band).toBeUndefined();
  });
  it('has a drawing for every design', () => {
    for (const [name, look] of Object.entries(SHEET_SHAPES)) if (look.symbol) expect(SYMBOL_NAMES, name).toContain(look.symbol);
  });
  it('reads the names loosely (any case, extra spaces)', () => {
    expect(sheetShape('  Falling   Rocks ')).toBe('falling rocks');
    expect(sheetShape('PSI')).toBe('psi');
  });
  it('makes one entry per design when a row lists several', () => {
    const defs = sheetBarDefs({ name:'Oxidizing/Biohazard (Chemical)', pageid:'3270', shape:'oxidizing / Biohazard' });
    expect(defs.map(d => [d.id, d.name, d.symbol])).toEqual([
      ['wiki-3270', 'Oxidizing (Chemical)', 'flame'],
      ['wiki-3270-biohazard', 'Biohazard (Chemical)', 'biohazard'],
    ]);
    expect(sheetBarDefs({ name:'Spark', pageid:'9', shape:'gear, psi' }).map(d => d.name)).toEqual(['Gear (Spark)', 'Psi (Spark)']);
  });
  it('lets the colour columns recolour a shape', () => {
    expect(sheetBarDef({ name:'x', pageid:'5', shape:'circle', bar_colour:'black' })).toMatchObject({ shape:'circle', bg:FELT_COLOURS.black, text:'X' });
  });
  it('keeps blank or unknown shapes as the standard bar', () => {
    for (const shape of ['', 'bar', 'blob']) expect(sheetBarDef({ name:'x', pageid:'6', shape })).toMatchObject({ shape:'arc', w:BAR.w, band:BAR.band });
  });
});
