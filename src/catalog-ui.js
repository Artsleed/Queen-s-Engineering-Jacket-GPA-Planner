/* ===================== UI: catalog & maker ===================== */
import { BAR, FLAG, SECTION_LABEL } from './config.js';
import { GROUPS, groupOf } from './catalog.js';
import { $, r1, newId, rgbToHex } from './util.js';
import { state, catMap, current, sel, setSel, getDef, isEditedPreset, rebuildCatalog, sectionSize } from './state.js';
import { findSpot, conflicts } from './fit.js';
import { localOutline } from './shapes.js';
import { traditionalSpots } from './layout.js';
import { setSection, select, renderInspector } from './panels.js';
import { drawItem } from './draw.js';
import { pushHistory, commit, toast } from './pipeline.js';

// The picker: a search box and a category filter narrow down a grouped list.
// There are ~800 items, too many to scroll through in a plain dropdown.
const pickable = () => [...catMap.values()].filter(d => !d.missing && PICKER.has(groupOf(d)));
const PICKER = new Set(GROUPS.map(([g]) => g));
const matches = (d, q) => !q || d.name.toLowerCase().includes(q);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base', numeric:true });

// The list is folders, one per group. One folder is open at a time (opening another closes
// it); while searching, every folder with a match is open, so all the results show.
let chosenId = null, openGroup = null;
export function buildSelect(keep){
  if (keep){ chosenId = keep; const d = getDef(keep); if (d) openGroup = groupOf(d); }
  const q = $('#itemSearch').value.trim().toLowerCase(), all = pickable();
  const groups = new Map(GROUPS.map(([g]) => [g, []]));
  for (const d of all) groups.get(groupOf(d)).push(d);
  const L = $('#itemList'); L.innerHTML = ''; let shown = 0;
  for (const [g, label] of GROUPS){
    const list = groups.get(g).filter(d => matches(d, q)).sort(byName);
    if (!list.length) continue;
    const open = q ? true : openGroup === g;
    const box = document.createElement('div'); box.className = 'grp';
    const h = document.createElement('button'); h.type = 'button'; h.className = 'grp-h'; h.dataset.g = g; h.dataset.n = list.length;
    h.setAttribute('aria-expanded', String(open));
    h.innerHTML = '<span class="grp-name"></span><span class="grp-n"></span>';
    h.querySelector('.grp-name').textContent = label; h.querySelector('.grp-n').textContent = list.length;
    h.onclick = () => { if (q) return; openGroup = openGroup === g ? null : g; buildSelect(); L.querySelector(`.grp-h[data-g="${g}"]`)?.focus(); };
    box.append(h);
    if (open){
      const items = document.createElement('div'); items.className = 'grp-items'; items.setAttribute('role', 'listbox'); items.setAttribute('aria-label', label);
      for (const d of list){
        const b = document.createElement('button'); b.type = 'button'; b.className = 'item'; b.dataset.id = d.id;
        b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(d.id === chosenId));
        b.textContent = d.name + (isEditedPreset(d.id) ? ' (edited)' : '');
        b.onclick = () => choose(d.id);
        b.ondblclick = () => { choose(d.id); addChosen(); };
        items.append(b);
      }
      box.append(items);
    }
    L.append(box); shown += list.length;
  }
  // Always one line (the total, or the matches while searching), so nothing below it jumps.
  $('#itemCount').textContent = q ? (shown ? `${shown} ${shown === 1 ? 'match' : 'matches'}` : 'Nothing matches. Try another word, or make your own.') : `${all.length} to choose from`;
  renderInspector(); // the right-hand panel shows the chosen item, unless a patch is selected
}
export function chosenDef(){ return chosenId ? getDef(chosenId) : null; }
// Choosing from the list shows that item in the right-hand panel (dropping any selected patch).
// The user's own items open in the maker instead, so a mistake can be fixed or deleted.
function choose(id){
  chosenId = id;
  for (const b of $('#itemList').querySelectorAll('.item')) b.setAttribute('aria-selected', String(b.dataset.id === id));
  const d = getDef(id);
  if (d && groupOf(d) === 'yours') return openMaker(d);
  if (makerOpen()) closeMaker(false);
  if (sel) select(null); else renderInspector();
}
export function drawPreview(d, text = d && d.text){
  const c = $('#itemPreview'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(r.width*dpr)); c.height = Math.max(1, Math.round(r.height*dpr));
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2E5B48'; ctx.fillRect(0, 0, r.width, r.height);
  // Margins shrink with the preview (it's short on small laptop screens).
  const m = Math.min(14, r.height*0.1), pad = Math.min(28, r.height*0.15);
  ctx.fillStyle = state.jacket.color; ctx.fillRect(m, m, r.width - 2*m, r.height - 2*m);
  if (!d) return;
  const k = Math.max(0.1, Math.min((r.width - 2*(m + pad))/d.w, (r.height - 2*(m + pad))/d.h, 26));
  drawItem(ctx, d, text, (r.width - d.w*k)/2, (r.height - d.h*k)/2, d.w*k, d.h*k);
}
$('#itemSearch').addEventListener('input', () => buildSelect());
// Up and down move through the folders and items; Enter adds the focused item.
const focusables = () => [...$('#itemList').querySelectorAll('.grp-h, .item')];
$('#itemSearch').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault(); (focusables().find(b => b.classList.contains('item')) || focusables()[0])?.focus(); }
  else if (e.key === 'Enter'){ e.preventDefault(); const first = $('#itemList .item'); if (first){ choose(first.dataset.id); addChosen(); } }
});
$('#itemList').addEventListener('keydown', e => {
  const f = focusables(), i = f.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    if (e.key === 'ArrowUp' && i <= 0) $('#itemSearch').focus(); else f[Math.max(0, Math.min(f.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  } else if (e.key === 'Enter' && document.activeElement?.classList.contains('item')){ e.preventDefault(); choose(document.activeElement.dataset.id); addChosen(); }
});
$('#btnMake').onclick = () => openMaker(null);

// "Make your own": a new item from a kind, a name and colours. The kind sets the shape and
// size (Nathaniel): a standard curved bar, a round crest, or a flag-sized rectangle.
// The same form edits one of the user's own items (`maker.editing` is its id).
const maker = { editing:null };
const mk = id => $('#' + id);
export const makerOpen = () => !$('#maker').hidden;
const KIND_SHAPE = {
  bar:{ shape:'arc', w:BAR.w, h:BAR.h, band:BAR.band },
  patch:{ shape:'circle', w:7, h:7 },
  flag:{ shape:'rect', w:FLAG.w, h:FLAG.h },
};
function openMaker(edit = null){
  const d = edit || { cat:'bar', name:'', text:'', ...BAR };
  maker.editing = edit ? edit.id : null;
  $('#makerTitle').textContent = edit ? 'Edit your item' : 'Make your own';
  mk('mkSave').textContent = edit ? 'Save changes' : 'Save item';
  mk('mkAdd').hidden = mk('mkDelete').hidden = !edit; $('#maker').classList.toggle('editing', !!edit);
  mk('mkCat').value = KIND_SHAPE[d.cat] ? d.cat : 'bar'; mk('mkName').value = edit ? d.name : '';
  mk('mkBg').value = rgbToHex(d.bg); mk('mkFg').value = rgbToHex(d.fg); mk('mkBorder').value = rgbToHex(d.border);
  const stripes = d.flag && (d.flag.type === 'h' || d.flag.type === 'v') ? d.flag : null, sc = stripes ? stripes.colors : [];
  mk('mkFlagDir').value = stripes ? stripes.type : ''; mk('mkFlagN').value = sc.length === 2 ? '2' : '3';
  mk('mkF1').value = rgbToHex(sc[0] || '#D52B1E'); mk('mkF2').value = rgbToHex(sc[1] || '#FFFFFF'); mk('mkF3').value = rgbToHex(sc[2] || '#D52B1E');
  $('#maker').hidden = false;
  refreshAddLabel();
  if (sel) select(null); else renderInspector();
  syncMaker(); if (!edit) mk('mkName').focus();
}
export function closeMaker(restore = true){
  $('#maker').hidden = true; maker.editing = null;
  if (restore) renderInspector();
}
function readMaker(){
  const dir = mk('mkFlagDir').value, n = +mk('mkFlagN').value, cat = mk('mkCat').value;
  const flag = dir ? { type:dir, colors:[mk('mkF1').value, mk('mkF2').value, mk('mkF3').value].slice(0, n) } : null;
  // The name is also the lettering, in capitals like the sheet bars. Flags carry none.
  const name = mk('mkName').value.trim();
  return {
    ...(KIND_SHAPE[cat] || KIND_SHAPE.bar),
    id:maker.editing || 'c-' + newId(), cat, name:name || 'Untitled', text:cat === 'flag' ? '' : name.toUpperCase(),
    bg:mk('mkBg').value, fg:mk('mkFg').value, border:mk('mkBorder').value, note:'', flag,
  };
}
export function syncMaker(){
  $('#flagOpts').hidden = mk('mkCat').value !== 'flag' && !mk('mkFlagDir').value;
  $('#mkF3wrap').hidden = mk('mkFlagN').value === '2';
  drawPreview(readMaker());
}
$('#maker').addEventListener('input', syncMaker);
$('#maker').addEventListener('change', syncMaker);
mk('mkCancel').onclick = () => closeMaker(true);
// Writes the form into state.items: a new item, or the edited one in place (its id is kept,
// so every copy already on the jacket changes with it).
function storeMaker(){
  const d = readMaker(), i = state.items.findIndex(x => x.id === d.id);
  if (i >= 0) state.items[i] = d; else state.items.push(d);
  rebuildCatalog();
  return d;
}
mk('mkSave').onclick = () => {
  const editing = !!maker.editing;
  pushHistory();
  const d = storeMaker(); closeMaker(false);
  $('#itemSearch').value = ''; buildSelect(d.id); // so the saved item is visible
  toast(editing ? `Saved your changes to ${d.name}.` : `Saved ${d.name}.`);
  commit();
};
// Add while editing: keep the changes, then add it (one undo step for both).
mk('mkAdd').onclick = () => {
  pushHistory();
  const d = storeMaker(); closeMaker(false);
  $('#itemSearch').value = ''; buildSelect(d.id);
  addChosen({ history:false });
};
mk('mkDelete').onclick = () => {
  const id = maker.editing, d = getDef(id); if (!id) return;
  pushHistory();
  const before = state.placed.length;
  state.items = state.items.filter(x => x.id !== id);
  state.placed = state.placed.filter(p => p.item !== id);
  const gone = before - state.placed.length;
  if (sel && !state.placed.some(p => p.uid === sel)) setSel(null);
  chosenId = null; rebuildCatalog(); closeMaker(false); buildSelect();
  toast(`Deleted ${d ? d.name : 'it'}${gone ? ` and took ${gone === 1 ? 'it' : `all ${gone}`} off the jacket` : ''}. Undo brings it back.`);
  commit();
};
// Traditional pieces go to their own spot (switching section), other items to the current section.
const homeOf = d => d && d.trad ? traditionalSpots(state.meas, getDef)[d.id] : null;
export function refreshAddLabel(){
  const home = homeOf(chosenDef()), label = `Add to ${SECTION_LABEL[home ? home.section : current].toLowerCase()}`;
  for (const b of [$('#btnAdd'), mk('mkAdd')]) if (b) b.textContent = label;
}
export function addChosen({ history = true } = {}){
  const d = chosenDef(); if (!d) return;
  if (makerOpen()) closeMaker(false);
  if (history) pushHistory();
  const home = homeOf(d);
  if (home && home.section !== current) setSection(home.section, true);
  if (home){
    const p = { uid:newId(), item:d.id, section:current, x:r1(home.x), y:r1(home.y), rot:0, text: d.id === 'patch-year' ? d.text : null };
    state.placed.push(p);
    if (conflicts(current).has(p.uid)){ // its spot is taken: fall back to the nearest free space
      const spot = findSpot(current, d.w, d.h, p.uid, localOutline(d, 0));
      if (spot){ p.x = spot.x; p.y = spot.y; toast(`Its usual spot is taken, so ${d.name} went in the nearest free space.`); }
    }
    setSel(p.uid); commit(); return;
  }
  const spot = findSpot(current, d.w, d.h, null, localOutline(d, 0));
  const p = { uid:newId(), item:d.id, section:current, x:0, y:0, rot:0, text:null };
  if (spot){ p.x = spot.x; p.y = spot.y; }
  else { const { w } = sectionSize(current); p.x = r1(Math.max(0, (w - d.w)/2)); p.y = 2; toast(`No free space left on the ${SECTION_LABEL[current].toLowerCase()}. It's placed, but overlapping.`); }
  state.placed.push(p); setSel(p.uid);
  commit();
}
