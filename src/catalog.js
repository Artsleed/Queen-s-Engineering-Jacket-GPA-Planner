/* ===================== Built-in catalogue ===================== */
// The presets in config.js plus every bar in data/bars.xlsx. No DOM.
//
// Sheet bars get the id `wiki-<pageid>`, so renaming a bar in the sheet keeps
// it on everyone's jacket. Only the name and category reach the app, never how
// a bar is earned.
import { PRESETS, BAR, FELT_COLOURS, SHEET_SHAPES } from './config.js';
import sheetBars from '../data/bars.xlsx';
import { FLAG_DEFS } from './flags.js';

// A colour cell from the sheet: a name from FELT_COLOURS or a hex code. Blank or unknown
// gives null (the bar keeps the standard colour; tests/bars-sheet.test.js flags unknowns).
export function sheetColour(v){
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('');
  return FELT_COLOURS[s] || null;
}
// The sheet's colour columns (either spelling of colour works). Blank means the standard bar.
export const COLOUR_COLS = { bg:'bar_colour', fg:'text_colour', border:'border_colour' };
const colourCell = (row, col) => row[col] ?? row[col.replace('colour', 'color')];

// The sheet's `shape` cell, as a key of SHEET_SHAPES (blank or unknown: the standard bar;
// tests/bars-sheet.test.js flags unknowns).
export const sheetShape = v => { const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' '); return s in SHEET_SHAPES ? s : null; };
// A cell can list several designs ("oxidizing / biohazard"): one bar, sewn in more than one version.
export const shapeList = v => String(v ?? '').split(/[\/,;]|\bor\b/i).map(x => x.trim()).filter(Boolean);
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());

// One list entry per design in the row's `shape` cell (usually just one). With several, the
// first keeps the row's id, so jackets already wearing it don't change, and each is named
// after its design plus the row's bracketed part: "Biohazard (Chemical)".
export function sheetBarDefs(row){
  const base = row.pageid ? `wiki-${row.pageid}` : `sheet-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const shapes = shapeList(row.shape), many = shapes.length > 1, paren = (row.name.match(/\([^()]*\)\s*$/) || [''])[0];
  const colours = {};
  for (const [k, col] of Object.entries(COLOUR_COLS)){ const c = sheetColour(colourCell(row, col)); if (c) colours[k] = c; }
  return (shapes.length ? shapes : ['']).map((cell, i) => {
    const key = sheetShape(cell) || 'bar', { noText, ...look } = SHEET_SHAPES[key];
    const name = many ? `${titleCase(key)}${paren ? ' ' + paren : ` (${row.name})`}` : row.name;
    const def = { id:i ? `${base}-${key.replace(/ /g, '-')}` : base, cat:'bar', name, text:noText ? '' : name.toUpperCase(), ...BAR, ...look, ...colours, note:'', type:row.type || '' };
    if (def.shape !== 'arc') delete def.band; // only curved bars have a band
    return def;
  });
}
export const sheetBarDef = row => sheetBarDefs(row)[0];

// Old preset ids that now come from the sheet. normalize() rewrites saved plans to use the new id.
export const RENAMED_IDS = { 'bar-wizard':'wiki-2095', 'patch-engsoc':'wiki-2064' };

export const BUILTINS = [...PRESETS, ...sheetBars.flatMap(sheetBarDefs), ...FLAG_DEFS];
export const BUILTIN_MAP = new Map(BUILTINS.map(d => [d.id, d]));

// Picker groups, in the order they're listed. `type` is the sheet's type column.
export const GROUPS = [
  ['official', 'Shenanigans: official'],
  ['experimental', 'Shenanigans: experimental'],
  ['academic', 'Academic & extracurricular'],
  ['flag', 'Flags'],
  ['unsorted', 'Bars not sorted yet'],
  ['yours', 'Made by you'],
];
// Groups that exist but aren't in the picker. Traditional pieces are already on
// every jacket (Nathaniel); the generic bars and patches are left out with them.
export const HIDDEN_GROUPS = [
  ['traditional', 'Traditional pieces'],
  ['basic', 'Generic bars'],
  ['patch', 'Patches'],
];
export const GROUP_LABEL = Object.fromEntries([...GROUPS, ...HIDDEN_GROUPS]);

// Which group an item is listed under. Looks up the built-in by id, so an
// edited copy of a sheet bar stays in its sheet category.
export function groupOf(d){
  const b = BUILTIN_MAP.get(d.id);
  if (!b) return 'yours';
  if (b.trad) return 'traditional';
  if ('type' in b) return GROUP_LABEL[b.type] ? b.type : 'unsorted';
  return b.cat === 'bar' ? 'basic' : b.cat;
}

// Stand-in for a placed item whose definition is gone (for example, a bar later
// left out of the sheet), so the placement isn't silently deleted from the plan.
export const missingDef = id => ({ id, cat:'bar', name:'Bar no longer in the list', text:'?', ...BAR, note:'', missing:true });
