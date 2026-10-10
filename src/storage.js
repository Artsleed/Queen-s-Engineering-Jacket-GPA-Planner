/* ===================== Saving ===================== */
// Plans live in this browser's localStorage. There are no accounts yet, so
// Export / Import is how someone moves a plan to another device.
import { $ } from './util.js';
import { state } from './state.js';

const LS_KEY = 'gpa-planner-v1';
let saveTimer = null;
export function setSaveState(t){ $('#saveState').textContent = t; }
export function scheduleSave(){
  state.updatedAt = Date.now(); clearTimeout(saveTimer);
  setSaveState('Saving…'); saveTimer = setTimeout(saveNow, 700);
}
function saveNow(){
  let local = false;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); local = true; } catch (e){}
  setSaveState(local ? 'Saved in this browser' : 'Not saved');
}
export function loadLocal(){ try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e){ return null; } }
