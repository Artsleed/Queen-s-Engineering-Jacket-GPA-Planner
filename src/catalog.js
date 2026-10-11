/* ===================== Built-in catalogue ===================== */
// The presets in config.js plus every bar in data/bars.xlsx. No DOM.
//
// Sheet bars get the id `wiki-<pageid>`, so renaming a bar in the sheet keeps
// it on everyone's jacket. Only the name and category reach the app, never how
// a bar is earned.
import { PRESETS, BAR } from './config.js';
import sheetBars from '../data/bars.xlsx';

export function sheetBarDef(row){
  const id = row.pageid ? `wiki-${row.pageid}` : `sheet-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return { id, cat:'bar', name:row.name, text:row.name.toUpperCase(), ...BAR, note:'', type:row.type || '' };
}

// Old preset ids that now come from the sheet. normalize() rewrites saved plans to use the new id.
export const RENAMED_IDS = { 'bar-wizard':'wiki-2095', 'patch-engsoc':'wiki-2064' };

export const BUILTINS = [...PRESETS, ...sheetBars.map(sheetBarDef)];
export const BUILTIN_MAP = new Map(BUILTINS.map(d => [d.id, d]));

// Picker groups, in the order they're listed. `type` is the sheet's type column.
export const GROUPS = [
  ['traditional', 'Traditional pieces'],
  ['official', 'Shenanigans: official'],
  ['experimental', 'Shenanigans: experimental'],
  ['academic', 'Academic & extracurricular'],
  ['unsorted', 'Bars not sorted yet'],
  ['basic', 'Generic bars'],
  ['patch', 'Patches'],
  ['flag', 'Flags'],
  ['yours', 'Made by you'],
];
export const GROUP_LABEL = Object.fromEntries(GROUPS);

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
