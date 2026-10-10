/* ===================== State ===================== */
// No DOM in this file, so tests can load it in Node.
//
// Other modules read `state`, `catMap`, `current` and `sel` directly and always
// see the latest value (ES module bindings are live). To replace one, call its
// setter; you can't assign to an imported variable.
import { DEFAULT_MEAS, DEFAULT_JACKET, PRESETS, SECTIONS } from './config.js';

export let state = freshState();
export let catMap = new Map();
export let current = 'front';
export let sel = null;

export const setState = s => { state = s; };
export const setCurrent = s => { current = s; };
export const setSel = uid => { sel = uid; };

const PRESET_IDS = new Set(PRESETS.map(p => p.id));

export function freshState(){
  return { v:1, updatedAt:0, meas:{...DEFAULT_MEAS}, jacket:{...DEFAULT_JACKET}, items:[], placed:[] };
}
export function normalize(raw){
  const s = freshState();
  if (!raw || typeof raw !== 'object') return s;
  s.updatedAt = +raw.updatedAt || 0;
  if (raw.meas) for (const k of Object.keys(DEFAULT_MEAS)) if (isFinite(+raw.meas[k])) s.meas[k] = +raw.meas[k];
  if (raw.jacket){ if (/^#[0-9a-f]{6}$/i.test(raw.jacket.color)) s.jacket.color = raw.jacket.color; if (/^#[0-9a-f]{6}$/i.test(raw.jacket.lining)) s.jacket.lining = raw.jacket.lining; }
  if (Array.isArray(raw.items)) s.items = raw.items.filter(d => d && d.id && isFinite(+d.w) && isFinite(+d.h)).map(d => ({...d, w:+d.w, h:+d.h}));
  if (Array.isArray(raw.placed)) s.placed = raw.placed.filter(p => p && p.uid && SECTIONS.includes(p.section)).map(p => ({ uid:String(p.uid), item:String(p.item), section:p.section, x:+p.x||0, y:+p.y||0, rot: (+p.rot===90)?90:0, text: typeof p.text === 'string' ? p.text : null }));
  return s;
}
export function rebuildCatalog(){
  catMap = new Map(PRESETS.map(p => [p.id, {...p}]));
  for (const it of state.items) catMap.set(it.id, {...it});
  state.placed = state.placed.filter(p => catMap.has(p.item));
}
export const getDef = id => catMap.get(id);
export const isCustom = id => !PRESET_IDS.has(id);
export const isEditedPreset = id => PRESET_IDS.has(id) && state.items.some(i => i.id === id);

export function sectionSize(s){
  const m = state.meas;
  return (s === 'front' || s === 'back') ? { w:m.chest/2, h:m.length } : { w:m.sleeveCirc, h:m.sleeve };
}
export function noGoZones(s){
  const m = state.meas, { w, h } = sectionSize(s), z = [];
  if (s === 'front' && m.zipper > 0) z.push({ x:w/2 - m.zipper/2, y:0, w:m.zipper, h:h - m.waistband, label:'Zipper', kind:'zip' });
  if ((s === 'front' || s === 'back') && m.waistband > 0) z.push({ x:0, y:h - m.waistband, w, h:m.waistband, label:'Waistband', kind:'rib' });
  if ((s === 'leftSleeve' || s === 'rightSleeve') && m.cuff > 0) z.push({ x:0, y:h - m.cuff, w, h:m.cuff, label:'Cuff', kind:'rib' });
  return z;
}
export function dims(p){
  const d = getDef(p.item); if (!d) return { w:0, h:0 };
  return p.rot === 90 ? { w:d.h, h:d.w } : { w:d.w, h:d.h };
}
export const textOf = p => (p.text != null && p.text !== '') ? p.text : (getDef(p.item)?.text || '');
