/* ===================== Saving ===================== */
// Plans live in this browser's localStorage only (there are no accounts).
import { $ } from './util.js';
import { state } from './state.js';
import { toast } from './pipeline.js';

export const LS_KEY = 'gpa-planner-v1';
// A saved plan that couldn't be read is moved here rather than lost (index.html's start-up
// error screen uses the same key when someone starts over).
export const BACKUP_KEY = 'gpa-planner-v1-backup';
let saveTimer = null, warned = false;
export function setSaveState(t){ $('#saveState').textContent = t; }
export function scheduleSave(){
  state.updatedAt = Date.now(); clearTimeout(saveTimer);
  setSaveState('Saving…'); saveTimer = setTimeout(saveNow, 700);
}
function saveNow(){
  let local = false;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); local = true; } catch (e){}
  setSaveState(local ? 'Saved in this browser' : 'Not saved');
  // Say why once, not on every change.
  if (!local && !warned){ warned = true; toast("This browser won't let the planner save (storage is full or turned off, as in some private windows). Changes will be lost when you close the tab."); }
}
// The saved plan: { raw } as stored, or null if there isn't one. Parsing is the caller's job,
// so a damaged plan can be kept as a backup instead of being overwritten by the next save.
export function readSaved(){ try { const raw = localStorage.getItem(LS_KEY); return raw ? { raw } : null; } catch (e){ return null; } }
export function backUpSaved(raw){ try { localStorage.setItem(BACKUP_KEY, raw); } catch (e){} }
