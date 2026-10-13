/* ===================== Update pipeline ===================== */
// Every change follows one pattern: pushHistory() → change state → commit().
import { SECTIONS } from './config.js';
import { $ } from './util.js';
import { state, sel, setSel, current, rebuildCatalog } from './state.js';
import { layoutEditor, drawEditor } from './editor2d.js';
import { V, builtKey, buildKeyFor, build3D, renderTexture, refreshSwatch } from './jacket3d.js';
import { updateTabs, renderInspector } from './panels.js';
import { buildSelect } from './catalog-ui.js';
import { scheduleSave } from './storage.js';

let liveQueued = false;
export function liveUpdate(){
  if (liveQueued) return; liveQueued = true;
  requestAnimationFrame(() => { liveQueued = false; drawEditor(); renderTexture(current); updateTabs(); });
}
// Like liveUpdate, but for changes that touch every section (the wear slider).
let allQueued = false;
export function liveUpdateAll(){
  if (allQueued) return; allQueued = true;
  requestAnimationFrame(() => { allQueued = false; drawEditor(); for (const s of SECTIONS) renderTexture(s); refreshSwatch(); });
}
export function commit(){
  redrawEverything(); scheduleSave(); updateUndo();
}
export function commitNoSave(){ redrawEverything(); updateUndo(); }
export function redrawEverything(){
  // The 3D shape only changes with the measurements and colours; wear is just texture.
  if (V.ok && builtKey !== buildKeyFor()) build3D(); else refreshSwatch();
  layoutEditor(); drawEditor(); updateTabs(); renderInspector();
  for (const s of SECTIONS) renderTexture(s);
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
  // Long enough to read: longer messages (the error notes) stay up longer.
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), Math.max(withUndo ? 6000 : 3200, msg.length*65));
}
$('#toastBtn').onclick = () => { undo(); $('#toast').classList.remove('show'); };
