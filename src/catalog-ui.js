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
function choose(id){
  chosenId = id;
  for (const b of $('#itemList').querySelectorAll('.item')) b.setAttribute('aria-selected', String(b.dataset.id === id));
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

// "Make your own": a new item from a kind, a shape, a name, text and colours. Its size comes
// from the shape (the real size of that kind of piece), not from the user.
const maker = { flagKeep:null };
const mk = id => $('#' + id);
export const makerOpen = () => !$('#maker').hidden;
const SHAPE_SIZE = {
  arc:{ w:BAR.w, h:BAR.h },        // a standard bar
  scroll:{ w:11.4, h:3.8 },        // like the mottos
  shield:{ w:6.6, h:9.5 },         // like the pass crest
  rect:{ w:8, h:5 }, round:{ w:7, h:6 }, circle:{ w:7, h:7 }, text:{ w:10, h:3 },
};
const sizeFor = (cat, shape) => cat === 'flag' && shape === 'rect' ? { w:FLAG.w, h:FLAG.h } : SHAPE_SIZE[shape] || SHAPE_SIZE.rect;
function openMaker(){
  const d = { cat:'bar', name:'', text:'', ...BAR };
  $('#makerTitle').textContent = 'Make your own';
  mk('mkCat').value = d.cat; mk('mkShape').value = d.shape; mk('mkName').value = ''; mk('mkText').value = '';
  mk('mkBg').value = rgbToHex(d.bg); mk('mkFg').value = rgbToHex(d.fg); mk('mkBorder').value = rgbToHex(d.border);
  mk('mkFlagDir').value = ''; mk('mkFlagN').value = '3';
  mk('mkF1').value = '#D52B1E'; mk('mkF2').value = '#FFFFFF'; mk('mkF3').value = '#D52B1E';
  $('#maker').hidden = false;
  if (sel) select(null); else renderInspector();
  syncMaker(); mk('mkName').focus();
}
export function closeMaker(restore = true){
  $('#maker').hidden = true;
  if (restore) renderInspector();
}
function readMaker(){
  const dir = mk('mkFlagDir').value, n = +mk('mkFlagN').value, cat = mk('mkCat').value, shape = mk('mkShape').value || 'rect';
  const flag = dir ? { type:dir, colors:[mk('mkF1').value, mk('mkF2').value, mk('mkF3').value].slice(0, n) } : null;
  return {
    ...sizeFor(cat, shape), ...(shape === 'arc' ? { band:BAR.band } : {}),
    id:'c-' + newId(), cat, name:mk('mkName').value.trim() || 'Untitled', text:mk('mkText').value.trim(),
    shape, bg:mk('mkBg').value, fg:mk('mkFg').value, border:mk('mkBorder').value, note:'', flag,
  };
}
export function syncMaker(){
  $('#flagOpts').hidden = mk('mkCat').value !== 'flag' && !mk('mkFlagDir').value;
  $('#mkF3wrap').hidden = mk('mkFlagN').value === '2';
  const d = readMaker(); drawPreview(d);
  $('#makerTitle').textContent = `Make your own · ${r1(d.w)} × ${r1(d.h)} cm`;
}
$('#maker').addEventListener('input', syncMaker);
$('#maker').addEventListener('change', syncMaker);
mk('mkCancel').onclick = () => closeMaker(true);
mk('mkSave').onclick = () => {
  const d = readMaker();
  pushHistory();
  state.items.push(d);
  rebuildCatalog(); closeMaker(false);
  $('#itemSearch').value = ''; buildSelect(d.id); // so the saved item is visible
  toast(`Saved ${d.name}.`);
  commit();
};
// Traditional pieces go to their own spot (switching section), other items to the current section.
const homeOf = d => d && d.trad ? traditionalSpots(state.meas, getDef)[d.id] : null;
export function refreshAddLabel(){
  const b = $('#btnAdd'); if (!b) return;
  const home = homeOf(chosenDef());
  b.textContent = `Add to ${SECTION_LABEL[home ? home.section : current].toLowerCase()}`;
}
export function addChosen(){
  const d = chosenDef(); if (!d) return;
  if (makerOpen()) closeMaker(false);
  pushHistory();
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
