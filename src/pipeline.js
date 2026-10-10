/* ===================== Update pipeline ===================== */
// Every change follows one pattern: pushHistory() → change state → commit().
import { SECTIONS } from './config.js';
import { $ } from './util.js';
import { state, sel, setSel, current, rebuildCatalog } from './state.js';
import { layoutEditor, drawEditor } from './editor2d.js';
import { V, builtKey, build3D, renderTexture } from './jacket3d.js';
import { updateTabs, renderInspector, renderSpace } from './panels.js';
import { buildSelect, chosenDef, drawPreview } from './catalog-ui.js';
import { scheduleSave } from './storage.js';

let liveQueued = false;
export function liveUpdate(){
  if (liveQueued) return; liveQueued = true;
  requestAnimationFrame(() => { liveQueued = false; drawEditor(); renderTexture(current); updateTabs(); });
}
export function commit(){
  redrawEverything(); scheduleSave(); updateUndo();
}
export function commitNoSave(){ redrawEverything(); updateUndo(); }
export function redrawEverything(){
  if (V.ok && builtKey !== JSON.stringify([state.meas, state.jacket])) build3D();
  layoutEditor(); drawEditor(); updateTabs(); renderInspector(); renderSpace();
  for (const s of SECTIONS) renderTexture(s);
  const d = chosenDef(); if (d && $('#maker').hidden) drawPreview(d);
}

/* ===================== Undo ===================== */
export const undoStack = [];
export function pushHistory(){
  undoStack.push(JSON.stringify({ meas:state.meas, jacket:state.jacket, items:state.items, placed:state.placed }));
  if (undoStack.length > 80) undoStack.shift();
  updateUndo();
}
export function updateUndo(){ $('#btnUndo').disabled = undoStack.length === 0; }
export function undo(){
  const s = undoStack.pop(); if (!s) return;
  Object.assign(state, JSON.parse(s));
  if (sel && !state.placed.some(p => p.uid === sel)) setSel(null);
  rebuildCatalog(); buildSelect(); commit();
}
$('#btnUndo').onclick = undo;
document.addEventListener('keydown', ev => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){ ev.preventDefault(); undo(); }
});

/* ===================== Toast ===================== */
let toastTimer;
export function toast(msg, withUndo){
  $('#toastMsg').textContent = msg; $('#toastBtn').hidden = !withUndo;
  $('#toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), withUndo ? 6000 : 3200);
}
$('#toastBtn').onclick = () => { undo(); $('#toast').classList.remove('show'); };
