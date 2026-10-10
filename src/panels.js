/* ===================== Tabs, inspector, space ===================== */
import { SECTIONS, SECTION_LABEL, DEFAULT_MEAS, DEFAULT_JACKET } from './config.js';
import { $, clamp, r1, newId } from './util.js';
import { state, current, sel, setCurrent, setSel, getDef, sectionSize, noGoZones, dims } from './state.js';
import { conflicts, findSpot } from './fit.js';
import { layoutEditor, drawEditor } from './editor2d.js';
import { focusSection, renderTexture } from './jacket3d.js';
import { pushHistory, commit, liveUpdate, toast } from './pipeline.js';
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
export function updateTabs(){
  for (const b of document.querySelectorAll('.tab')){
    const s = b.dataset.s, n = state.placed.filter(p => p.section === s).length;
    b.setAttribute('aria-selected', String(s === current));
    b.querySelector('.count').textContent = n ? n : '';
    b.classList.toggle('has-issue', conflicts(s).size > 0);
  }
  $('#btnAdd').textContent = `Add to ${SECTION_LABEL[current].toLowerCase()}`;
}
export function setSection(s, focus){
  if (current !== s){ setCurrent(s); const p = state.placed.find(q => q.uid === sel); if (p && p.section !== s) setSel(null); }
  if (focus) focusSection(s);
  layoutEditor(); drawEditor(); updateTabs(); renderInspector();
  for (const x of SECTIONS) renderTexture(x);
}
export function select(uid){
  setSel(uid); drawEditor(); renderInspector();
  for (const s of SECTIONS) renderTexture(s);
}
export function renderInspector(){
  const el = $('#inspector'), p = state.placed.find(q => q.uid === sel);
  if (!p){ el.innerHTML = '<h2>Selected</h2><p class="insp-empty">Tap a patch on the jacket to move, rotate, or relabel it.</p>'; return; }
  const d = getDef(p.item), dm = dims(p), why = conflicts(p.section).get(p.uid);
  el.innerHTML = `
    <div class="insp-title"><strong></strong><span class="small muted"></span></div>
    <p class="status ${why ? 'bad' : 'good'}"></p>
    <div class="insp-body">
      <label class="field"><span>Text on this one</span><input type="text" id="iText" maxlength="24"></label>
      <div class="grid2">
        <label class="field"><span>From left (cm)</span><input type="number" id="iX" step="0.1"></label>
        <label class="field"><span>From top (cm)</span><input type="number" id="iY" step="0.1"></label>
      </div>
      <label class="field"><span>Section</span><select id="iSec"></select></label>
      <div class="row">
        <button class="btn" id="iRot">Rotate 90°</button>
        <button class="btn" id="iDup">Duplicate</button>
        <button class="btn danger" id="iDel">Remove</button>
      </div>
    </div>`;
  el.querySelector('strong').textContent = d.name;
  el.querySelector('.insp-title .muted').textContent = `${r1(dm.w)} × ${r1(dm.h)} cm`;
  el.querySelector('.status').textContent = why || 'Fits with room to sew';
  const it = $('#iText'); it.value = p.text ?? ''; it.placeholder = d.text || 'No text';
  it.addEventListener('focus', () => pushHistory(), { once:true });
  it.addEventListener('input', () => { p.text = it.value === '' ? null : it.value; liveUpdate(); scheduleSave(); });
  $('#iX').value = r1(p.x); $('#iY').value = r1(p.y);
  const setPos = () => {
    pushHistory(); const { w, h } = sectionSize(p.section);
    p.x = r1(clamp(+$('#iX').value || 0, 0, Math.max(0, w - dm.w))); p.y = r1(clamp(+$('#iY').value || 0, 0, Math.max(0, h - dm.h)));
    commit();
  };
  $('#iX').addEventListener('change', setPos); $('#iY').addEventListener('change', setPos);
  const ss = $('#iSec'); for (const s of SECTIONS) ss.append(new Option(SECTION_LABEL[s], s)); ss.value = p.section;
  ss.addEventListener('change', () => {
    pushHistory(); const to = ss.value, spot = findSpot(to, dm.w, dm.h, p.uid);
    p.section = to; if (spot){ p.x = spot.x; p.y = spot.y; } else { p.x = 0; p.y = 0; toast(`No free space on the ${SECTION_LABEL[to].toLowerCase()}. It's placed, but overlapping.`); }
    setSection(to, true); commit();
  });
  $('#iRot').onclick = rotateSel; $('#iDel').onclick = removeSel;
  $('#iDup').onclick = () => {
    pushHistory(); const spot = findSpot(p.section, dm.w, dm.h);
    const q = { ...p, uid:newId(), x:spot ? spot.x : p.x + 1, y:spot ? spot.y : p.y + 1 };
    state.placed.push(q); setSel(q.uid);
    if (!spot) toast('No free space for the copy. It overlaps for now.');
    commit();
  };
}
export function rotateSel(){
  const p = state.placed.find(q => q.uid === sel); if (!p) return;
  pushHistory();
  const before = dims(p), cx = p.x + before.w/2, cy = p.y + before.h/2;
  p.rot = p.rot === 90 ? 0 : 90;
  const after = dims(p), { w, h } = sectionSize(p.section);
  p.x = r1(clamp(cx - after.w/2, 0, Math.max(0, w - after.w))); p.y = r1(clamp(cy - after.h/2, 0, Math.max(0, h - after.h)));
  commit();
}
export function removeSel(){
  const p = state.placed.find(q => q.uid === sel); if (!p) return;
  pushHistory();
  state.placed = state.placed.filter(q => q.uid !== sel); setSel(null);
  toast(`Removed ${getDef(p.item).name}.`, true);
  commit();
}
function shapeArea(p){ const d = getDef(p.item); const f = d.shape === 'circle' ? Math.PI/4 : d.shape === 'shield' ? 0.86 : 1; return d.w*d.h*f; }
export function renderSpace(){
  const el = $('#space'); el.innerHTML = '';
  for (const s of SECTIONS){
    const { w, h } = sectionSize(s), zones = noGoZones(s);
    const usable = w*h - zones.reduce((a, z) => a + z.w*z.h, 0);
    const list = state.placed.filter(p => p.section === s);
    const used = list.reduce((a, p) => a + shapeArea(p), 0), pct = usable > 0 ? Math.round(100*used/usable) : 0;
    const issues = conflicts(s).size;
    const b = document.createElement('button'); b.className = 'space-row';
    b.innerHTML = `<span class="nm"></span><span class="pc"></span><span class="meter"><i></i></span>${issues ? '<span class="issue"></span>' : ''}`;
    b.querySelector('.nm').textContent = SECTION_LABEL[s];
    b.querySelector('.pc').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'}, ${pct}% used`;
    b.querySelector('.meter i').style.width = Math.min(100, pct) + '%';
    if (issues) b.querySelector('.issue').textContent = `${issues} ${issues === 1 ? 'needs' : 'need'} moving`;
    b.onclick = () => setSection(s, true);
    el.append(b);
  }
}

/* ===================== Jacket size dialog ===================== */
const MFIELDS = { mChest:'chest', mLength:'length', mSleeve:'sleeve', mSleeveCirc:'sleeveCirc', mWaist:'waistband', mCuff:'cuff', mZip:'zipper', mGap:'gap' };
function fillMeasure(meas, jacket){
  for (const [id, k] of Object.entries(MFIELDS)) $('#' + id).value = meas[k];
  $('#mColor').value = jacket.color; $('#mLining').value = jacket.lining;
}
$('#btnMeasure').onclick = () => { fillMeasure(state.meas, state.jacket); $('#measureDlg').showModal(); };
$('#mCancel').onclick = () => $('#measureDlg').close();
$('#mDefaults').onclick = () => fillMeasure(DEFAULT_MEAS, DEFAULT_JACKET);
$('#mSave').onclick = () => {
  pushHistory();
  for (const [id, k] of Object.entries(MFIELDS)){
    const el = $('#' + id), v = +el.value;
    if (isFinite(v) && el.value !== '') state.meas[k] = clamp(v, +el.min, +el.max);
  }
  state.jacket.color = $('#mColor').value; state.jacket.lining = $('#mLining').value;
  $('#measureDlg').close(); commit();
  const issues = SECTIONS.reduce((a, s) => a + conflicts(s).size, 0);
  toast(issues ? `Size updated. ${issues} ${issues === 1 ? 'item no longer fits' : 'items no longer fit'}.` : 'Size updated.');
};
