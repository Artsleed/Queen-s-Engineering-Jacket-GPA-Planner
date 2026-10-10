/* ===================== UI: catalog & maker ===================== */
import { BAR, SECTION_LABEL } from './config.js';
import { GROUPS, GROUP_LABEL, groupOf } from './catalog.js';
import { $, clamp, r1, newId, rgbToHex } from './util.js';
import { state, catMap, current, sel, setSel, getDef, isCustom, isEditedPreset, rebuildCatalog, sectionSize } from './state.js';
import { findSpot } from './fit.js';
import { drawItem } from './draw.js';
import { pushHistory, commit, toast } from './pipeline.js';

// The picker: a search box and a category filter narrow down a grouped list.
// There are ~800 items, too many to scroll through in a plain dropdown.
const pickable = () => [...catMap.values()].filter(d => !d.missing);
const matches = (d, q) => !q || d.name.toLowerCase().includes(q);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity:'base', numeric:true });

export function buildSelect(keep){
  const s = $('#itemSelect'), cs = $('#itemCat'); keep = keep || s.value;
  const q = $('#itemSearch').value.trim().toLowerCase(), all = pickable();
  const groups = new Map(GROUPS.map(([g]) => [g, []]));
  for (const d of all) groups.get(groupOf(d)).push(d);

  // Category options, with counts. Empty groups are left out.
  const cat = cs.value || 'all'; cs.innerHTML = '';
  cs.append(new Option(`Everything (${all.length})`, 'all'));
  for (const [g, label] of GROUPS) if (groups.get(g).length) cs.append(new Option(`${label} (${groups.get(g).length})`, g));
  cs.value = [...cs.options].some(o => o.value === cat) ? cat : 'all';

  s.innerHTML = ''; let shown = 0;
  for (const [g, label] of GROUPS){
    if (cs.value !== 'all' && cs.value !== g) continue;
    const list = groups.get(g).filter(d => matches(d, q)).sort(byName);
    if (!list.length) continue;
    const og = document.createElement('optgroup'); og.label = label;
    for (const d of list) og.append(new Option(d.name + (isEditedPreset(d.id) ? ' (edited)' : ''), d.id));
    s.append(og); shown += list.length;
  }
  $('#itemCount').textContent = shown ? `${shown} ${shown === 1 ? 'match' : 'matches'}` : 'Nothing matches. Try another word, or make your own.';
  const ids = [...s.options].map(o => o.value);
  s.value = ids.includes(keep) ? keep : (ids[0] ?? '');
  showChosen();
}
export function chosenDef(){ return getDef($('#itemSelect').value); }
function showChosen(){
  const d = getDef($('#itemSelect').value);
  if (!d){
    if (!$('#maker').hidden && maker.editing) closeMaker(false);
    if ($('#maker').hidden){ for (const id of ['pvName', 'pvSize', 'pvCat', 'pvNote']) $('#' + id).textContent = ''; drawPreview(null); }
    $('#btnAdd').disabled = true; $('#btnEditItem').hidden = true; $('#btnDeleteItem').hidden = true;
    return;
  }
  $('#pvName').textContent = d.name;
  $('#pvSize').textContent = `${r1(d.w)} × ${r1(d.h)} cm`;
  $('#pvCat').textContent = GROUP_LABEL[groupOf(d)];
  $('#pvNote').textContent = d.note || '';
  $('#btnDeleteItem').textContent = isCustom(d.id) ? 'Delete item' : 'Reset to default';
  $('#btnDeleteItem').hidden = !isCustom(d.id) && !isEditedPreset(d.id);
  $('#btnEditItem').hidden = false; $('#btnAdd').disabled = false;
  if (!$('#maker').hidden && maker.editing !== d.id) closeMaker(false);
  drawPreview(d);
}
export function drawPreview(d){
  const c = $('#itemPreview'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(r.width*dpr)); c.height = Math.max(1, Math.round(r.height*dpr));
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2E5B48'; ctx.fillRect(0, 0, r.width, r.height);
  ctx.fillStyle = state.jacket.color; ctx.fillRect(14, 14, r.width - 28, r.height - 28);
  if (!d) return;
  const k = Math.min((r.width - 56)/d.w, (r.height - 56)/d.h, 26);
  drawItem(ctx, d, d.text, (r.width - d.w*k)/2, (r.height - d.h*k)/2, d.w*k, d.h*k);
}
$('#itemSelect').addEventListener('change', showChosen);
$('#itemCat').addEventListener('change', () => buildSelect());
$('#itemSearch').addEventListener('input', () => buildSelect());
// Enter adds the highlighted item; Down arrow moves from the search box into the list.
$('#itemSearch').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault(); $('#itemSelect').focus(); }
  else if (e.key === 'Enter'){ e.preventDefault(); $('#btnAdd').click(); }
});
$('#itemSelect').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); $('#btnAdd').click(); } });
$('#itemSelect').addEventListener('dblclick', e => { if (e.target.tagName === 'OPTION') $('#btnAdd').click(); });
$('#btnMake').onclick = () => openMaker(null);

const maker = { editing:null, photo:null };
const mk = id => $('#' + id);
function openMaker(def){
  maker.editing = def ? def.id : null;
  const d = def || { cat:'bar', name:'', text:'', ...BAR, note:'' };
  $('#makerTitle').textContent = def ? `Edit ${def.name}` : 'Make your own';
  mk('mkCat').value = d.cat; mk('mkShape').value = d.shape || 'rect'; mk('mkName').value = d.name; mk('mkText').value = d.text || '';
  mk('mkW').value = d.w; mk('mkH').value = d.h; mk('mkBg').value = rgbToHex(d.bg || '#ffffff'); mk('mkFg').value = rgbToHex(d.fg || '#000000'); mk('mkBorder').value = rgbToHex(d.border || d.fg || '#000000');
  mk('mkNote').value = d.note || '';
  const f = d.flag || {}, fc = f.colors || ['#D52B1E', '#FFFFFF', '#D52B1E'];
  mk('mkFlagDir').value = (f.type === 'h' || f.type === 'v') ? f.type : '';
  mk('mkFlagN').value = String(fc.length === 2 ? 2 : 3);
  mk('mkF1').value = rgbToHex(fc[0] || '#D52B1E'); mk('mkF2').value = rgbToHex(fc[1] || '#FFFFFF'); mk('mkF3').value = rgbToHex(fc[2] || '#D52B1E');
  maker.flagKeep = (f.type === 'canada' || f.type === 'disc') ? f : null;
  maker.photo = d.img || null; mk('mkPhoto').value = '';
  $('#maker').hidden = false; $('#btnEditItem').hidden = true;
  if (!def){ $('#pvName').textContent = 'New item'; $('#pvSize').textContent = ''; $('#pvCat').textContent = ''; $('#pvNote').textContent = ''; $('#btnDeleteItem').hidden = true; $('#btnAdd').disabled = true; }
  syncMaker(); mk('mkName').focus();
}
function closeMaker(restore = true){
  $('#maker').hidden = true; maker.editing = null; $('#btnEditItem').hidden = false;
  if (restore) showChosen();
}
function readMaker(){
  const dir = mk('mkFlagDir').value, n = +mk('mkFlagN').value;
  let flag = null;
  if (dir) flag = { type:dir, colors:[mk('mkF1').value, mk('mkF2').value, mk('mkF3').value].slice(0, n) };
  else if (maker.flagKeep) flag = maker.flagKeep;
  return {
    id: maker.editing || ('c-' + newId()),
    cat: mk('mkCat').value, name: mk('mkName').value.trim() || 'Untitled', text: mk('mkText').value.trim(),
    w: clamp(+mk('mkW').value || 1, 0.5, 60), h: clamp(+mk('mkH').value || 1, 0.5, 60),
    shape: mk('mkShape').value, bg: mk('mkBg').value, fg: mk('mkFg').value, border: mk('mkBorder').value,
    note: mk('mkNote').value.trim(), flag, img: maker.photo || null,
  };
}
export function syncMaker(){
  $('#flagOpts').hidden = mk('mkCat').value !== 'flag' && !mk('mkFlagDir').value;
  $('#mkF3wrap').hidden = mk('mkFlagN').value === '2';
  $('#mkPhotoRow').hidden = !maker.photo;
  const d = readMaker(); drawPreview(d);
  $('#pvSize').textContent = `${r1(d.w)} × ${r1(d.h)} cm`;
}
$('#maker').addEventListener('input', syncMaker);
$('#maker').addEventListener('change', syncMaker);
mk('mkPhoto').addEventListener('change', async () => {
  const f = mk('mkPhoto').files[0]; if (!f) return;
  try { maker.photo = await shrinkImage(f, 240); syncMaker(); }
  catch (e){ toast("That photo couldn't be read. Try a JPG or PNG."); }
});
mk('mkPhotoClear').onclick = () => { maker.photo = null; mk('mkPhoto').value = ''; syncMaker(); };
mk('mkCancel').onclick = () => closeMaker(true);
mk('mkSave').onclick = () => {
  const d = readMaker(), wasEditing = !!maker.editing;
  pushHistory();
  const i = state.items.findIndex(x => x.id === d.id);
  if (i >= 0) state.items[i] = d; else state.items.push(d);
  rebuildCatalog(); closeMaker(false);
  $('#itemSearch').value = ''; $('#itemCat').value = 'all'; buildSelect(d.id); // so the saved item is visible
  toast(wasEditing ? 'Item saved.' : `Saved ${d.name}.`);
  commit();
};
function shrinkImage(file, max){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, max/Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width*s)); c.height = Math.max(1, Math.round(im.height*s));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = rej; im.src = url;
  });
}
$('#btnEditItem').onclick = () => { const d = chosenDef(); if (d) openMaker(d); };
$('#btnDeleteItem').onclick = () => {
  const d = chosenDef(); if (!d) return;
  pushHistory();
  state.items = state.items.filter(x => x.id !== d.id);
  if (isCustom(d.id)){ state.placed = state.placed.filter(p => p.item !== d.id); if (sel && !state.placed.some(p => p.uid === sel)) setSel(null); }
  rebuildCatalog(); buildSelect(isCustom(d.id) ? null : d.id);
  toast(isCustom(d.id) ? `Deleted ${d.name}.` : `${d.name} is back to default.`, true);
  commit();
};
$('#btnAdd').onclick = () => {
  const d = chosenDef(); if (!d) return;
  pushHistory();
  let spot = findSpot(current, d.w, d.h), rot = 0;
  if (!spot && d.w !== d.h){ spot = findSpot(current, d.h, d.w); if (spot) rot = 90; }
  const p = { uid:newId(), item:d.id, section:current, x:0, y:0, rot, text:null };
  if (spot){ p.x = spot.x; p.y = spot.y; }
  else { const { w } = sectionSize(current); p.x = r1(Math.max(0, (w - d.w)/2)); p.y = 2; toast(`No free space left on the ${SECTION_LABEL[current].toLowerCase()}. It's placed, but overlapping.`); }
  state.placed.push(p); setSel(p.uid);
  commit();
};
