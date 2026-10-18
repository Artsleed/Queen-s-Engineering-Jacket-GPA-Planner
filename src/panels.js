/* ===================== Tabs, inspector ===================== */
import { SECTIONS, SECTION_LABEL, JACKET_COLOURS, LITE } from './config.js';
import { $, clamp, r1, newId } from './util.js';
import { state, view, current, sel, setCurrent, setSel, getDef, sectionSize, dims, textOf, isFixed, TEXT_EDITABLE, FIXED_NOTE, setState, newJacket, rebuildCatalog } from './state.js';
import { GROUP_LABEL, groupOf } from './catalog.js';
import { conflicts, findSpot, settle, settleNote } from './fit.js';
import { localOutline } from './shapes.js';
import { layoutEditor, drawEditor } from './editor2d.js';
import { refreshAddLabel, chosenDef, drawPreview, addChosen, makerOpen, closeMaker } from './catalog-ui.js';
import { focusSection, renderTexture } from './jacket3d.js';
import { pushHistory, commit, liveUpdate, liveUpdateAll, redrawEverything, toast } from './pipeline.js';
import { scheduleSave } from './storage.js';

export function buildTabs(){
  const t = $('#tabs'); t.innerHTML = '';
  for (const s of SECTIONS){
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role','tab'); b.dataset.s = s;
    b.innerHTML = `<span></span><span class="count"></span><span class="flag" aria-hidden="true"></span>`;
    b.firstChild.textContent = SECTION_LABEL[s];
    b.onclick = () => setSection(s, true);
    t.append(b);
  }
}
// Yellow / purple switch on the 3D view. A custom colour from the size dialog lights neither.
export function buildLeatherPick(){
  const el = $('#leatherPick'); el.innerHTML = '';
  for (const c of JACKET_COLOURS){
    const b = document.createElement('button'); b.type = 'button'; b.dataset.color = c.color; b.title = c.label;
    // Just the swatch (like a light/dark switch); the name is in the label and tooltip.
    b.innerHTML = '<i aria-hidden="true"></i>'; b.style.setProperty('--sw', c.color);
    b.setAttribute('aria-label', c.label);
    b.onclick = () => { if (state.jacket.color === c.color) return; pushHistory(); state.jacket.color = c.color; commit(); };
    el.append(b);
  }
}
// New-to-worn slider. Dragging previews live; letting go saves (one undo step per drag).
const wear = $('#wear');
let wearDragging = false;
// On phones the leather is redrawn only on letting go: each step rebuilds every section's
// leather, and that many new canvases at once is what runs a phone out of memory.
wear.addEventListener('input', () => {
  if (!wearDragging){ pushHistory(); wearDragging = true; }
  state.jacket.wear = +wear.value; if (!LITE) liveUpdateAll();
});
wear.addEventListener('change', () => { wearDragging = false; state.jacket.wear = +wear.value; commit(); });
// "Where things go": gold boxes on the flat view and the 3D jacket over each spot with a
// tradition. Only changes the drawing, so no undo step and nothing saved.
const hintsBtn = $('#btnHints');
hintsBtn.onclick = () => {
  view.hints = !view.hints; hintsBtn.setAttribute('aria-pressed', String(view.hints));
  redrawEverything();
  if (view.hints) toast('Gold boxes show where things usually go. Switch sections to see the rest. Other bars can go almost anywhere.');
};
// Expand the 3D view to fill the window (Esc or the button again to close).
const viewer = document.querySelector('.viewer'), expand = $('#expand');
const setExpanded = on => { viewer.classList.toggle('expanded', on); expand.setAttribute('aria-pressed', String(on)); expand.setAttribute('aria-label', on ? 'Close the big 3D view' : 'Expand the 3D view'); };
expand.onclick = () => setExpanded(!viewer.classList.contains('expanded'));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && viewer.classList.contains('expanded')) setExpanded(false); });

export function updateTabs(){
  if (document.activeElement !== wear) wear.value = String(state.jacket.wear ?? 0);
  for (const b of document.querySelectorAll('#leatherPick button')) b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === state.jacket.color.toLowerCase()));
  for (const b of document.querySelectorAll('.tab')){
    const s = b.dataset.s, n = state.placed.filter(p => p.section === s).length;
    b.setAttribute('aria-selected', String(s === current));
    b.querySelector('.count').textContent = n ? n : '';
    b.classList.toggle('has-issue', conflicts(s).size > 0);
  }
  refreshAddLabel();
}
export function setSection(s, focus){
  if (current !== s){ setCurrent(s); const p = state.placed.find(q => q.uid === sel); if (p && p.section !== s) setSel(null); }
  if (focus) focusSection(s);
  layoutEditor(); drawEditor(); updateTabs(); renderInspector();
  for (const x of SECTIONS) renderTexture(x);
}
export function select(uid){
  if (uid && makerOpen()) closeMaker(false);
  setSel(uid); drawEditor(); renderInspector();
  for (const s of SECTIONS) renderTexture(s);
}
// The right-hand panel shows one thing at a time, sharing the preview at the top:
//   the "make your own" form (it draws its own preview), else
//   the selected patch on the jacket, with its controls, else
//   the item highlighted in the list, with Add, else a hint.
export function renderInspector(){
  const el = $('#inspector'), pv = $('#previewWrap'), p = state.placed.find(q => q.uid === sel);
  // A placed patch is also on the mat, so its preview can be smaller.
  pv.classList.toggle('small-pv', !!p && !makerOpen());
  if (makerOpen()){ el.innerHTML = ''; pv.hidden = false; refreshAddLabel(); return; }
  if (!p){
    const d = chosenDef();
    if (!d){ pv.hidden = true; el.innerHTML = '<p class="insp-empty">Pick something from the list, or tap a patch on the jacket to move or relabel it.</p>'; return; }
    el.innerHTML = `
      <div class="insp-title"><strong id="pvName"></strong><span class="small muted" id="pvSize"></span></div>
      <p class="small muted pv-cat" id="pvCat"></p>
      <p class="small pv-note" id="pvNote"></p>
      <button class="btn primary wide" id="btnAdd"></button>`;
    $('#pvName').textContent = d.name;
    $('#pvSize').textContent = `${r1(d.w)} × ${r1(d.h)} cm`;
    $('#pvCat').textContent = GROUP_LABEL[groupOf(d)] || '';
    $('#pvNote').textContent = d.note || ''; $('#pvNote').hidden = !d.note;
    $('#btnAdd').onclick = addChosen; refreshAddLabel();
    pv.hidden = false; drawPreview(d);
    return;
  }
  const d = getDef(p.item), dm = dims(p), why = conflicts(p.section).get(p.uid);
  pv.hidden = false; drawPreview(d, textOf(p));
  const wireText = () => {
    const it = $('#iText'); it.value = p.text ?? ''; it.placeholder = d.text || d.hint || 'No text';
    it.addEventListener('focus', () => pushHistory(), { once:true });
    it.addEventListener('input', () => { p.text = it.value === '' ? null : it.value; drawPreview(d, textOf(p)); liveUpdate(); scheduleSave(); });
  };
  // Traditional pieces are fixed: only the year number's and year motto's text can change.
  if (isFixed(p)){
    el.innerHTML = `
      <div class="insp-title"><strong></strong><span class="small muted"></span></div>
      <p class="status ${why ? 'bad' : 'good'}"></p>
      <p class="small muted insp-fixed"></p>
      ${TEXT_EDITABLE.has(p.item) ? '<label class="field"><span>Text on this one</span><input type="text" id="iText" maxlength="48"></label>' : ''}`;
    el.querySelector('strong').textContent = d.name;
    el.querySelector('.insp-title .muted').textContent = `${r1(dm.w)} × ${r1(dm.h)} cm`;
    el.querySelector('.status').textContent = why || 'Fits with room to sew';
    el.querySelector('.insp-fixed').textContent = `${FIXED_NOTE} ${d.note || ''}`.trim();
    if (TEXT_EDITABLE.has(p.item)) wireText();
    return;
  }
  el.innerHTML = `
    <div class="insp-title"><strong></strong><span class="small muted"></span></div>
    <p class="status ${why ? 'bad' : 'good'}"></p>
    <div class="insp-body">
      <label class="field"><span>Text on this one</span><input type="text" id="iText" maxlength="48"></label>
      <div class="grid3">
        <label class="field"><span>From left (cm)</span><input type="number" id="iX" step="0.1"></label>
        <label class="field"><span>From top (cm)</span><input type="number" id="iY" step="0.1"></label>
        <label class="field"><span>Section</span><select id="iSec"></select></label>
      </div>
      <div class="row">
        <button class="btn" id="iDup">Duplicate</button>
        <button class="btn danger" id="iDel">Remove</button>
      </div>
    </div>`;
  el.querySelector('strong').textContent = d.name;
  el.querySelector('.insp-title .muted').textContent = `${r1(dm.w)} × ${r1(dm.h)} cm`;
  el.querySelector('.status').textContent = why || 'Fits with room to sew';
  wireText();
  $('#iX').value = r1(p.x); $('#iY').value = r1(p.y);
  const setPos = () => {
    pushHistory(); const { w, h } = sectionSize(p.section);
    p.x = r1(clamp(+$('#iX').value || 0, 0, Math.max(0, w - dm.w))); p.y = r1(clamp(+$('#iY').value || 0, 0, Math.max(0, h - dm.h)));
    const why = settle(p); commit(); if (why) toast(settleNote(p, why));
  };
  $('#iX').addEventListener('change', setPos); $('#iY').addEventListener('change', setPos);
  const ss = $('#iSec'); for (const s of SECTIONS) ss.append(new Option(SECTION_LABEL[s], s)); ss.value = p.section;
  ss.addEventListener('change', () => {
    pushHistory(); const to = ss.value, spot = findSpot(to, dm.w, dm.h, p.uid, localOutline(d, p.rot));
    p.section = to; if (spot){ p.x = spot.x; p.y = spot.y; } else { p.x = 0; p.y = 0; toast(`No free space on the ${SECTION_LABEL[to].toLowerCase()}. It's placed, but overlapping.`); }
    setSection(to, true); commit();
  });
  $('#iDel').onclick = removeSel;
  $('#iDup').onclick = () => {
    pushHistory(); const spot = findSpot(p.section, dm.w, dm.h, null, localOutline(d, p.rot));
    const q = { ...p, uid:newId(), x:spot ? spot.x : p.x + 1, y:spot ? spot.y : p.y + 1 };
    state.placed.push(q); setSel(q.uid);
    if (!spot) toast('No free space for the copy. It overlaps for now.');
    commit();
  };
}
export function removeSel(){
  const p = state.placed.find(q => q.uid === sel); if (!p || isFixed(p)) return;
  pushHistory();
  state.placed = state.placed.filter(q => q.uid !== sel); setSel(null);
  toast(`Removed ${getDef(p.item).name}.`, true);
  commit();
}
/* ===================== Reset ===================== */
// Back to a new jacket (only the traditional pieces on it), after asking. Items the user made
// stay in the list, and Undo brings the old plan back.
$('#btnReset').onclick = () => $('#resetDlg').showModal();
$('#resetNo').onclick = () => $('#resetDlg').close();
$('#resetYes').onclick = () => {
  $('#resetDlg').close();
  pushHistory();
  const fresh = newJacket(); fresh.items = state.items;
  setState(fresh); setSel(null); rebuildCatalog(); setSection('front', true);
  commit(); toast('Started over.', true);
};
