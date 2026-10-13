/* ===================== 2D editor ===================== */
import { SNAP_STEP } from './config.js';
import { $, clamp, r1 } from './util.js';
import { state, current, sel, sectionSize, dims, isFixed, FIXED_NOTE } from './state.js';
import { drawPanel } from './draw.js';
import { pushHistory, commit, liveUpdate, undoStack, updateUndo, toast } from './pipeline.js';
import { settle, settleNote } from './fit.js';
import { select, removeSel } from './panels.js';

export const ed = { canvas: $('#mat'), wrap: $('#matWrap'), dpr:1, scale:1, ox:0, oy:0, cw:0, ch:0 };
ed.ctx = ed.canvas.getContext('2d');
export function layoutEditor(){
  const r = ed.wrap.getBoundingClientRect();
  ed.dpr = Math.min(2, window.devicePixelRatio || 1);
  ed.cw = Math.max(1, r.width); ed.ch = Math.max(1, r.height);
  // Only when the size changes: resizing reallocates the canvas (on phones that's memory
  // Safari is slow to give back), and drawEditor repaints all of it anyway.
  const pw = Math.round(ed.cw*ed.dpr), ph = Math.round(ed.ch*ed.dpr);
  if (ed.canvas.width !== pw || ed.canvas.height !== ph){ ed.canvas.width = pw; ed.canvas.height = ph; }
  const { w, h } = sectionSize(current), pad = ed.cw < 500 ? 14 : 24;
  ed.scale = Math.max(1, Math.min((ed.cw - pad*2)/w, (ed.ch - pad*2)/h));
  ed.ox = Math.round((ed.cw - w*ed.scale)/2); ed.oy = Math.round((ed.ch - h*ed.scale)/2);
}
export function drawEditor(){
  const ctx = ed.ctx, k = ed.scale;
  ctx.setTransform(ed.dpr, 0, 0, ed.dpr, 0, 0);
  ctx.fillStyle = '#2E5B48'; ctx.fillRect(0, 0, ed.cw, ed.ch);
  // cutting-mat grid, aligned to the panel's top-left corner
  const i0x = -Math.ceil(ed.ox/k), i1x = Math.ceil((ed.cw - ed.ox)/k), i0y = -Math.ceil(ed.oy/k), i1y = Math.ceil((ed.ch - ed.oy)/k);
  ctx.lineWidth = 1;
  for (const strong of [false, true]){
    if (!strong && k < 5) continue;
    ctx.strokeStyle = strong ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)';
    ctx.beginPath();
    for (let i = i0x; i <= i1x; i++){ if ((i % 5 === 0) !== strong) continue; const X = Math.round(ed.ox + i*k) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, ed.ch); }
    for (let i = i0y; i <= i1y; i++){ if ((i % 5 === 0) !== strong) continue; const Y = Math.round(ed.oy + i*k) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(ed.cw, Y); }
    ctx.stroke();
  }
  ctx.save(); ctx.translate(ed.ox, ed.oy);
  drawPanel(ctx, current, k, { shadow:true, sheen:true, guides:true, conflicts:true, sel:true });
  ctx.restore();
  $('#matEmpty').hidden = state.placed.length > 0;
}
function toCm(ev){
  const r = ed.canvas.getBoundingClientRect();
  return { x:(ev.clientX - r.left - ed.ox)/ed.scale, y:(ev.clientY - r.top - ed.oy)/ed.scale };
}
export function hitTest(section, x, y){
  for (let i = state.placed.length - 1; i >= 0; i--){
    const p = state.placed[i]; if (p.section !== section) continue;
    const d = dims(p);
    if (x >= p.x && x <= p.x + d.w && y >= p.y && y <= p.y + d.h) return p;
  }
  return null;
}
let drag = null;
ed.canvas.addEventListener('pointerdown', ev => {
  ed.canvas.focus({ preventScroll:true });
  const pt = toCm(ev), p = hitTest(current, pt.x, pt.y);
  if (!p){ select(null); return; }
  select(p.uid);
  if (isFixed(p)) return; // traditional pieces stay put
  pushHistory();
  state.placed.splice(state.placed.indexOf(p), 1); state.placed.push(p);
  drag = { uid:p.uid, sx:p.x, sy:p.y, px:pt.x, py:pt.y, moved:false };
  ed.canvas.setPointerCapture(ev.pointerId); ed.canvas.style.cursor = 'grabbing';
});
ed.canvas.addEventListener('pointermove', ev => {
  const pt = toCm(ev);
  if (!drag){ const h = hitTest(current, pt.x, pt.y); ed.canvas.style.cursor = h ? (isFixed(h) ? 'pointer' : 'grab') : 'default'; return; }
  const p = state.placed.find(q => q.uid === drag.uid); if (!p) return;
  const d = dims(p), { w, h } = sectionSize(current);
  let nx = drag.sx + (pt.x - drag.px), ny = drag.sy + (pt.y - drag.py);
  if ($('#snap').checked){ nx = Math.round(nx/SNAP_STEP)*SNAP_STEP; ny = Math.round(ny/SNAP_STEP)*SNAP_STEP; }
  nx = clamp(nx, 0, Math.max(0, w - d.w)); ny = clamp(ny, 0, Math.max(0, h - d.h));
  if (nx !== p.x || ny !== p.y){ p.x = Math.round(nx*100)/100; p.y = Math.round(ny*100)/100; drag.moved = true; liveUpdate(); }
});
function endDrag(){
  if (!drag) return;
  if (!drag.moved){ undoStack.pop(); updateUndo(); }
  else { const p = state.placed.find(q => q.uid === drag.uid), why = p && settle(p); commit(); if (why) toast(settleNote(p, why)); }
  drag = null; ed.canvas.style.cursor = 'grab';
}
ed.canvas.addEventListener('pointerup', endDrag);
ed.canvas.addEventListener('pointercancel', endDrag);
ed.canvas.addEventListener('keydown', ev => {
  const p = state.placed.find(q => q.uid === sel); if (!p) return;
  if (ev.key === 'Escape'){ select(null); return; }
  if (isFixed(p)){
    if (/^Arrow|^Delete$|^Backspace$/.test(ev.key)){ ev.preventDefault(); toast(FIXED_NOTE); }
    return;
  }
  const step = ev.shiftKey ? 2 : ($('#snap').checked ? SNAP_STEP : 0.1);
  const mv = { ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step] }[ev.key];
  if (mv){
    ev.preventDefault(); pushHistory();
    const d = dims(p), { w, h } = sectionSize(p.section);
    p.x = r1(clamp(p.x + mv[0], 0, Math.max(0, w - d.w))); p.y = r1(clamp(p.y + mv[1], 0, Math.max(0, h - d.h)));
    const why = settle(p); commit(); if (why) toast(settleNote(p, why));
  } else if (ev.key === 'Delete' || ev.key === 'Backspace'){ ev.preventDefault(); removeSel(); }
});
