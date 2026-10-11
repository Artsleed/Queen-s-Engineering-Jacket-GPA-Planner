/* ===================== State ===================== */
// No DOM in this file, so tests can load it in Node.
//
// Other modules read `state`, `catMap`, `current` and `sel` directly and always
// see the latest value (ES module bindings are live). To replace one, call its
// setter; you can't assign to an imported variable.
import { DEFAULT_MEAS, DEFAULT_JACKET, SECTIONS } from './config.js';
import { jacketZones } from './zones.js';
import { BUILTINS, BUILTIN_MAP, RENAMED_IDS, missingDef } from './catalog.js';
import { traditionalPlacements } from './layout.js';

const uid = () => Math.random().toString(36).slice(2,10);

export let state = freshState();
export let catMap = new Map();
export let current = 'front';
export let sel = null;

export const setState = s => { state = s; };
export const setCurrent = s => { current = s; };
export const setSel = uid => { sel = uid; };

const PRESET_IDS = new Set(BUILTINS.map(p => p.id));

export function freshState(){
  return { v:3, updatedAt:0, meas:{...DEFAULT_MEAS}, jacket:{...DEFAULT_JACKET}, items:[], placed:[] };
}
export function normalize(raw){
  const s = freshState();
  if (!raw || typeof raw !== 'object') return s;
  s.updatedAt = +raw.updatedAt || 0;
  if (raw.meas) for (const k of Object.keys(DEFAULT_MEAS)) if (isFinite(+raw.meas[k])) s.meas[k] = +raw.meas[k];
  if (raw.jacket){
    if (/^#[0-9a-f]{6}$/i.test(raw.jacket.color)) s.jacket.color = raw.jacket.color;
    if (/^#[0-9a-f]{6}$/i.test(raw.jacket.lining)) s.jacket.lining = raw.jacket.lining;
    // v2 -> v3: added `wear` (0 new .. 1 worn). Older plans get the default.
    if (isFinite(+raw.jacket.wear) && raw.jacket.wear !== null && raw.jacket.wear !== '') s.jacket.wear = Math.max(0, Math.min(1, +raw.jacket.wear));
  }
  // Presets that moved into the sheet keep their placements and edits under the new id.
  const id = x => RENAMED_IDS[x] || String(x);
  if (Array.isArray(raw.items)) s.items = raw.items.filter(d => d && d.id && isFinite(+d.w) && isFinite(+d.h)).map(d => ({...d, id:id(d.id), w:+d.w, h:+d.h}));
  if (Array.isArray(raw.placed)) s.placed = raw.placed.filter(p => p && p.uid && SECTIONS.includes(p.section)).map(p => ({ uid:String(p.uid), item:id(p.item), section:p.section, x:+p.x||0, y:+p.y||0, rot: (+p.rot===90)?90:0, text: typeof p.text === 'string' ? p.text : null }));
  // v1 -> v2: jackets now come with the traditional pieces. Add any that aren't on yet.
  if ((+raw.v || 1) < 2) s.placed.push(...traditionalPlacements(s.meas, itemSize(s), uid, new Set(s.placed.map(p => p.item))));
  return s;
}
// A brand-new jacket: default size, traditional pieces in their spots.
export function newJacket(){
  const s = freshState();
  s.placed = traditionalPlacements(s.meas, itemSize(s), uid);
  return s;
}
// Item size lookup for a plan that may not be the live state yet (edits first, then built-ins).
const itemSize = plan => id => plan.items.find(i => i.id === id) || BUILTIN_MAP.get(id);

export function rebuildCatalog(){
  catMap = new Map(BUILTINS.map(p => [p.id, {...p}]));
  for (const it of state.items) catMap.set(it.id, {...it});
  for (const p of state.placed) if (!catMap.has(p.item)) catMap.set(p.item, missingDef(p.item));
}
export const getDef = id => catMap.get(id);
export const isCustom = id => !PRESET_IDS.has(id);
export const isEditedPreset = id => PRESET_IDS.has(id) && state.items.some(i => i.id === id);

export function sectionSize(s){
  const m = state.meas;
  return (s === 'front' || s === 'back') ? { w:m.chest/2, h:m.length } : { w:m.sleeveCirc, h:m.sleeve };
}
// Areas nothing can be sewn on (see zones.js).
export const noGoZones = s => jacketZones(s, state.meas);
export function dims(p){
  const d = getDef(p.item); if (!d) return { w:0, h:0 };
  return p.rot === 90 ? { w:d.h, h:d.w } : { w:d.w, h:d.h };
}
export const textOf = p => (p.text != null && p.text !== '') ? p.text : (getDef(p.item)?.text || '');
