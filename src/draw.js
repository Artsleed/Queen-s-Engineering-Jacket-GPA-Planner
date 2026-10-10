/* ===================== Drawing ===================== */
// drawPanel is the single renderer for a section: the 2D editor and the 3D
// textures both use it, so they can never disagree.
import { clamp, shade } from './util.js';
import { state, sel, sectionSize, noGoZones, getDef, dims, textOf } from './state.js';
import { conflicts } from './fit.js';

// Photos load asynchronously; whoever owns redrawing registers a callback here.
let onImageLoad = () => {};
export const setImageLoadHandler = fn => { onImageLoad = fn; };

const imgCache = new Map();
function getImg(src){
  if (!src) return null;
  let im = imgCache.get(src);
  if (!im){ im = new Image(); im.onload = () => { onImageLoad(); }; im.src = src; imgCache.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}
export function roundRectPath(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}
function shapePath(ctx, shape, x, y, w, h){
  ctx.beginPath();
  const m = Math.min(w, h);
  if (shape === 'circle') ctx.ellipse(x+w/2, y+h/2, Math.max(0.1,w/2), Math.max(0.1,h/2), 0, 0, Math.PI*2);
  else if (shape === 'round') roundRectPath(ctx, x, y, w, h, m*0.45);
  else if (shape === 'shield'){
    ctx.moveTo(x, y); ctx.lineTo(x+w, y); ctx.lineTo(x+w, y+h*0.52);
    ctx.quadraticCurveTo(x+w, y+h*0.86, x+w/2, y+h); ctx.quadraticCurveTo(x, y+h*0.86, x, y+h*0.52); ctx.closePath();
  } else roundRectPath(ctx, x, y, w, h, m*0.12);
}
const LEAF = [[0,-1],[.12,-.74],[.3,-.82],[.22,-.38],[.48,-.6],[.55,-.48],[.85,-.55],[.75,-.28],[.95,-.2],[.55,.1],[.62,.25],[.08,.2],[.06,.62],[-.06,.62],[-.08,.2],[-.62,.25],[-.55,.1],[-.95,-.2],[-.75,-.28],[-.85,-.55],[-.55,-.48],[-.48,-.6],[-.22,-.38],[-.3,-.82],[-.12,-.74]];
function drawFlag(ctx, f, x, y, w, h){
  const c = f.colors || [];
  if (f.type === 'h'){ const n = c.length; c.forEach((col,i) => { ctx.fillStyle = col; ctx.fillRect(x, y + h*i/n - 0.5, w, h/n + 1); }); }
  else if (f.type === 'v'){ const n = c.length; c.forEach((col,i) => { ctx.fillStyle = col; ctx.fillRect(x + w*i/n - 0.5, y, w/n + 1, h); }); }
  else if (f.type === 'disc'){ ctx.fillStyle = c[0]; ctx.fillRect(x, y, w, h); ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(x+w/2, y+h/2, h*0.3, 0, Math.PI*2); ctx.fill(); }
  else if (f.type === 'canada'){
    ctx.fillStyle = '#D52B1E'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + w*0.25, y, w*0.5, h);
    const s = Math.min(w*0.5, h) * 0.4, cx = x + w/2, cy = y + h/2 + s*0.05;
    ctx.fillStyle = '#D52B1E'; ctx.beginPath();
    LEAF.forEach(([px,py],i) => { const X = cx + px*s, Y = cy + py*s; i ? ctx.lineTo(X,Y) : ctx.moveTo(X,Y); });
    ctx.closePath(); ctx.fill();
  }
}
export function drawItem(ctx, d, text, x, y, w, h){
  const m = Math.min(w, h);
  ctx.save();
  if (d.shape !== 'text'){
    shapePath(ctx, d.shape, x, y, w, h);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(1, m*0.12); ctx.shadowOffsetY = Math.max(0.5, m*0.04);
    ctx.fillStyle = d.bg || '#fff'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save(); shapePath(ctx, d.shape, x, y, w, h); ctx.clip();
    if (d.flag && d.flag.type) drawFlag(ctx, d.flag, x, y, w, h);
    const im = getImg(d.img);
    if (im){ const s = Math.max(w/im.naturalWidth, h/im.naturalHeight), iw = im.naturalWidth*s, ih = im.naturalHeight*s; ctx.drawImage(im, x + (w-iw)/2, y + (h-ih)/2, iw, ih); }
    ctx.restore();
    if (!im){
      const lw = Math.max(1, m*0.09);
      shapePath(ctx, d.shape, x + lw/2, y + lw/2, w - lw, h - lw);
      ctx.lineWidth = lw; ctx.strokeStyle = d.border || d.fg; ctx.stroke();
      if (m > 14){
        const inset = lw*1.7;
        shapePath(ctx, d.shape, x + inset, y + inset, w - inset*2, h - inset*2);
        ctx.setLineDash([m*0.06, m*0.05]); ctx.lineWidth = Math.max(0.6, m*0.022);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.globalCompositeOperation = 'overlay'; ctx.stroke();
        ctx.setLineDash([]); ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  if (text){
    const maxW = w * ((d.shape === 'circle' || d.shape === 'shield') ? 0.72 : d.shape === 'text' ? 0.98 : 0.84);
    let fs = d.shape === 'text' ? h*0.9 : (d.shape === 'circle' || d.shape === 'shield') ? m*0.28 : h*0.5;
    ctx.font = `${fs}px Graduate, Archivo, Impact, sans-serif`;
    const tw = ctx.measureText(text).width;
    if (tw > maxW){ fs *= maxW / tw; ctx.font = `${fs}px Graduate, Archivo, Impact, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = y + h*(d.shape === 'shield' ? 0.45 : 0.5) + fs*0.05;
    if (d.shape === 'text' || d.img || (d.flag && d.flag.type)){
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, fs*0.14); ctx.strokeStyle = d.shape === 'text' ? d.border : 'rgba(0,0,0,.65)';
      ctx.strokeText(text, x + w/2, ty);
    }
    ctx.fillStyle = d.fg || '#000'; ctx.fillText(text, x + w/2, ty);
  }
  ctx.restore();
}

// Draws one jacket section with origin at the panel's top-left, k px per cm.
export function drawPanel(ctx, s, k, o = {}){
  const { w, h } = sectionSize(s), W = w*k, H = h*k, jc = state.jacket.color;
  ctx.save();
  if (o.shadow){ ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6; }
  ctx.fillStyle = jc; ctx.fillRect(0, 0, W, H);
  ctx.shadowColor = 'transparent';
  if (o.sheen){
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(.5, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (const z of noGoZones(s)){
    const x = z.x*k, y = z.y*k, zw = z.w*k, zh = z.h*k;
    if (z.kind === 'rib'){
      ctx.fillStyle = shade(jc, -0.3); ctx.fillRect(x, y, zw, zh);
      ctx.strokeStyle = shade(jc, -0.45); ctx.lineWidth = Math.max(1, k*0.14);
      const step = Math.max(3, k*0.6); ctx.beginPath();
      for (let xx = x + step/2; xx < x + zw; xx += step){ ctx.moveTo(xx, y); ctx.lineTo(xx, y + zh); }
      ctx.stroke();
    } else {
      ctx.fillStyle = shade(jc, -0.2); ctx.fillRect(x, y, zw, zh);
      const cx = x + zw/2, tw = Math.max(1.5, zw*0.22), th = Math.max(1, k*0.22), step = Math.max(2.5, k*0.45);
      ctx.fillStyle = '#B9BEC6'; let i = 0;
      for (let yy = y; yy < y + zh; yy += step, i++) ctx.fillRect(i % 2 ? cx : cx - tw, yy, tw, th);
      ctx.fillStyle = '#8E949C'; roundRectPath(ctx, cx - zw*0.16, y + k*1.2, zw*0.32, k*3.6, k*0.4); ctx.fill();
    }
    if (o.labels){
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 ${clamp(k*1.4, 9, 13)}px Archivo, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (z.kind === 'zip'){ ctx.translate(x + zw/2, y + zh*0.55); ctx.rotate(-Math.PI/2); ctx.fillText(z.label, 0, 0); }
      else ctx.fillText(z.label, x + zw/2, y + zh/2);
      ctx.restore();
    }
  }
  if (o.guides){
    ctx.save(); const fs = clamp(k*1.3, 9, 12);
    ctx.font = `600 ${fs}px Archivo, sans-serif`; ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.textBaseline = 'top';
    if (s === 'front' || s === 'back'){
      const L = s === 'front' ? "Wearer's right" : "Wearer's left", R = s === 'front' ? "Wearer's left" : "Wearer's right";
      ctx.textAlign = 'left'; ctx.fillText(L, 8, 8); ctx.textAlign = 'right'; ctx.fillText(R, W - 8, 8);
      if (s === 'back'){ ctx.textAlign = 'center'; ctx.fillText('Collar', W/2, 8); }
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H - state.meas.cuff*k); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.fillText('Shoulder', W/2, 8);
      ctx.save(); ctx.translate(W/2 + 6, H*0.45); ctx.rotate(Math.PI/2); ctx.fillText('Outer side', 0, 0); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillText('Underarm', 6, 8); ctx.textAlign = 'right'; ctx.fillText('Underarm', W - 6, 8);
    }
    ctx.restore();
  }
  const bad = o.conflicts ? conflicts(s) : null;
  for (const p of state.placed){
    if (p.section !== s) continue;
    const d = getDef(p.item); if (!d) continue;
    const dm = dims(p);
    ctx.save(); ctx.translate((p.x + dm.w/2)*k, (p.y + dm.h/2)*k); ctx.rotate(p.rot*Math.PI/180);
    drawItem(ctx, d, textOf(p), -d.w*k/2, -d.h*k/2, d.w*k, d.h*k);
    ctx.restore();
    if (bad && bad.has(p.uid)){
      ctx.save(); ctx.fillStyle = 'rgba(214,22,48,.28)'; ctx.fillRect(p.x*k, p.y*k, dm.w*k, dm.h*k);
      ctx.strokeStyle = '#FF3355'; ctx.lineWidth = 2; ctx.strokeRect(p.x*k, p.y*k, dm.w*k, dm.h*k); ctx.restore();
    }
    if (o.sel && p.uid === sel){
      ctx.save(); const pad = o.selPad ?? 4;
      ctx.lineWidth = o.selWidth ?? 2; ctx.strokeStyle = '#101820'; ctx.strokeRect(p.x*k - pad, p.y*k - pad, dm.w*k + pad*2, dm.h*k + pad*2);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#FFFFFF'; ctx.strokeRect(p.x*k - pad, p.y*k - pad, dm.w*k + pad*2, dm.h*k + pad*2);
      ctx.restore();
    }
  }
  ctx.restore();
}
