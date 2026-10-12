/* ===================== Drawing ===================== */
// drawPanel is the single renderer for a section: the 2D editor and the 3D
// textures both use it, so they can never disagree.
import { clamp, shade } from './util.js';
import { state, sel, sectionSize, noGoZones, getDef, dims, textOf } from './state.js';
import { conflicts } from './fit.js';
import { leatherLayer, fillGrain, grainCanvas } from './leather.js';
import { seeded } from './surface.js';
import { arcGeom, bandOf } from './shapes.js';

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
  } else if (shape === 'scroll'){ const S = scrollGeom(x, y, w, h); bandPath(ctx, S); tailPath(ctx, S, -1); tailPath(ctx, S, 1); }
  else if (shape === 'qas') ctx.rect(x, y, w, h);
  else roundRectPath(ctx, x, y, w, h, m*0.12);
}

/* ----- Scroll (mottos): an arched ribbon with forked tails folded behind each end ----- */
function scrollGeom(x, y, w, h){
  const t = h*0.6, sag = h*0.22; // band thickness; how far the band's ends sit below its middle
  return { x, y, w, h, t, sag, x0:x + w*0.1, x1:x + w*0.9 };
}
function bandPath(ctx, S){
  const mid = (S.x0 + S.x1)/2, c = S.y - S.sag; // quadratic control point, so the middle lands at S.y
  ctx.moveTo(S.x0, S.y + S.sag); ctx.quadraticCurveTo(mid, c, S.x1, S.y + S.sag);
  ctx.lineTo(S.x1, S.y + S.sag + S.t); ctx.quadraticCurveTo(mid, c + S.t, S.x0, S.y + S.sag + S.t); ctx.closePath();
}
function tailPath(ctx, S, side){
  const top = S.y + S.h - S.t, bot = S.y + S.h, notch = S.w*0.06, len = S.w*0.17;
  const outer = side < 0 ? S.x : S.x + S.w, inner = outer - side*len;
  ctx.moveTo(inner, top); ctx.lineTo(outer, top); ctx.lineTo(outer - side*notch, (top + bot)/2); ctx.lineTo(outer, bot); ctx.lineTo(inner, bot); ctx.closePath();
}
function drawScroll(ctx, d, text, x, y, w, h, o){
  const S = scrollGeom(x, y, w, h), lw = Math.max(1, S.t*0.1), edge = d.border || d.fg;
  ctx.save();
  if (!o.mask){ ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(1, h*0.12); ctx.shadowOffsetY = Math.max(0.5, h*0.04); }
  for (const side of [-1, 1]){ // the tails sit behind the band, so they're darker
    ctx.beginPath(); tailPath(ctx, S, side); ctx.fillStyle = o.mask ? '#fff' : shade(d.bg, -0.22); ctx.fill();
    if (!o.mask){ ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineWidth = lw; ctx.strokeStyle = shade(edge, -0.15); ctx.stroke(); ctx.restore(); }
  }
  ctx.beginPath(); bandPath(ctx, S); ctx.fillStyle = o.mask ? '#fff' : d.bg; ctx.fill();
  ctx.shadowColor = 'transparent';
  if (o.mask){ ctx.restore(); return; }
  const im = getImg(d.img);
  if (im){
    ctx.save(); ctx.beginPath(); bandPath(ctx, S); ctx.clip();
    const k = Math.max(w/im.naturalWidth, h/im.naturalHeight);
    ctx.drawImage(im, x + (w - im.naturalWidth*k)/2, y + (h - im.naturalHeight*k)/2, im.naturalWidth*k, im.naturalHeight*k); ctx.restore();
  }
  ctx.beginPath(); bandPath(ctx, S); ctx.lineWidth = lw; ctx.strokeStyle = edge; ctx.stroke();
  if (text){
    ctx.fillStyle = d.fg || '#000';
    const arch = archOf((S.x1 - S.x0)*0.84, S.sag*0.84);
    arcText(ctx, text, { cx:x + w/2, cy:y + S.t/2, ...arch, height:S.t*0.42, font:'Graduate, Archivo, Impact, sans-serif', mode:'shrink',
      stroke: im ? { color:'rgba(0,0,0,.65)', width:S.t*0.08 } : null });
  }
  ctx.restore();
}

/* ----- Text along an arch with the ends down. Used by bars, scrolls and QUEEN'S. ----- */
// cx, cy: middle of the letters at the arch's midpoint. R: radius of the letters' centre
// line (Infinity for straight; negative curves the ends up). len: room along that line. height: cap height.
// mode: 'shrink' keeps letter shapes and shrinks to fit; 'track' also spreads the letters
// out to fill `len` (like separately sewn felt letters); 'stretch' squeezes or widens them.
// only: 'fill' or 'stroke' draws just that, with the context's current style.
function arcText(ctx, text, a){
  let fs = a.height/0.72; // cap height is roughly 0.72 of the font size
  const setFont = () => { ctx.font = `${a.weight || ''} ${fs}px ${a.font}`.trim(); };
  setFont(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const chars = [...text];
  let adv = chars.map(c => ctx.measureText(c).width), total = adv.reduce((p, q) => p + q, 0) || 1;
  // squeeze narrows each letter (keeping its height) before any tracking is worked out.
  let sx = a.squeeze || 1, track = 0;
  if (a.squeeze){ adv = adv.map(v => v*a.squeeze); total *= a.squeeze; sx = 1; }
  if (a.mode === 'stretch') sx = a.len/total;
  else if (total > a.len){ const f = a.len/total; fs *= f; setFont(); adv = adv.map(v => v*f); total *= f; }
  else if (a.mode === 'track' && chars.length > 1) track = (a.len - total)/(chars.length - 1);
  const curved = isFinite(a.R), used = total*sx + track*(chars.length - 1), place = [];
  let s = -used/2;
  chars.forEach((c, i) => {
    const mid = s + adv[i]*sx/2, phi = curved ? mid/a.R : 0; s += adv[i]*sx + track;
    place.push([c, a.cx + (curved ? a.R*Math.sin(phi) : mid), a.cy + (curved ? a.R*(1 - Math.cos(phi)) : 0) + fs*0.05, phi]);
  });
  const sq = a.squeeze || 1, each = fn => { for (const [c, px, py, phi] of place){ ctx.save(); ctx.translate(px, py); ctx.rotate(phi); ctx.scale(sx*sq, 1); fn(c); ctx.restore(); } };
  if (a.only === 'fill') return each(c => ctx.fillText(c, 0, 0));
  if (a.only === 'stroke') return each(c => ctx.strokeText(c, 0, 0));
  if (a.stroke){
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = a.stroke.width; ctx.strokeStyle = a.stroke.color;
    if (a.shadow){ ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = a.stroke.width*1.2; ctx.shadowOffsetY = a.stroke.width*0.5; }
    each(c => ctx.strokeText(c, 0, 0)); ctx.restore();
  }
  each(c => ctx.fillText(c, 0, 0));
}
// Radius and arc length for an arch given its chord and how far its ends drop.
function archOf(chord, sag){
  if (sag < 1e-3) return { R:Infinity, len:chord };
  const R = (chord*chord/4 + sag*sag)/(2*sag);
  return { R, len:2*R*Math.asin(Math.min(1, chord/(2*R))) };
}

/* ----- Curved bars: a felt band curved ends up, red border, gold lettering ----- */
// The circle's centre sits above the box; the outer edge is the bar's bottom edge.
function arcPath(ctx, g, x, y, h, inOuter = 0, inInner = 0){
  const cx = x + g.cx, cy = y + h - g.cy, ro = g.R - inOuter, ri = g.R - g.t + inInner, a0 = Math.PI/2 - g.th, a1 = Math.PI/2 + g.th;
  ctx.arc(cx, cy, ro, a0, a1); ctx.arc(cx, cy, ri, a1, a0, true); ctx.closePath();
}
function drawArcBar(ctx, d, text, x, y, w, h, o){
  const g = arcGeom(w, h, bandOf(d)*(h/d.h)); // band is in cm; w, h are already scaled
  if (!isFinite(g.R)){ // flat: draw as an ordinary bar
    return drawItem(ctx, { ...d, shape:'rect', h:bandOf(d) }, text, x, y, w, g.t, o);
  }
  const lw = Math.max(1, g.t*0.11), band = () => { ctx.beginPath(); arcPath(ctx, g, x, y, h); };
  ctx.save();
  if (!o.mask){ ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(1, g.t*0.15); ctx.shadowOffsetY = Math.max(0.5, g.t*0.05); }
  band(); ctx.fillStyle = o.mask ? '#fff' : (d.bg || '#fff'); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (o.mask){ ctx.restore(); return; }
  band(); ctx.save(); ctx.clip();
  const im = getImg(d.img);
  if (im){ const k = Math.max(w/im.naturalWidth, h/im.naturalHeight); ctx.drawImage(im, x + (w - im.naturalWidth*k)/2, y + (h - im.naturalHeight*k)/2, im.naturalWidth*k, im.naturalHeight*k); }
  else {
    band(); ctx.lineWidth = lw*2; ctx.strokeStyle = d.border || d.fg; ctx.stroke(); // inner half of a double-width stroke = border inside the edge
    if (g.t > 14){ // stitching just inside the border
      ctx.beginPath(); arcPath(ctx, g, x, y, h, lw*1.6, lw*1.6);
      ctx.setLineDash([g.t*0.07, g.t*0.06]); ctx.lineWidth = Math.max(0.6, g.t*0.025); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.restore();
  if (text){
    const Rm = g.R - g.t/2;
    ctx.fillStyle = d.fg || '#000';
    // A negative radius bends the text the other way, so it follows the smile.
    arcText(ctx, text, { cx:x + g.cx, cy:y + h - g.t/2, R:-Rm, len:Rm*2*g.th*0.86, height:g.t*0.36, font:'Archivo, Arial, sans-serif', weight:600, mode:'shrink',
      stroke: im ? { color:'rgba(0,0,0,.65)', width:g.t*0.07 } : null });
  }
  ctx.restore();
}

/* ----- Chenille: fuzzy looped letters sewn onto a felt backing ----- */
// Like the real ones: a felt backing cut a little bigger than each letter (so it shows
// as an edge, and fills the holes in letters like O and D), sometimes a stitched line,
// then the chenille on top. Each piece is rendered once per size into a cached canvas.
let loopTile = null;
function loopsCanvas(){
  if (loopTile) return loopTile;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rnd = seeded(41);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1100; i++){
    const x = rnd()*S, y = rnd()*S, r = 1.1 + rnd()*1.9, a0 = rnd()*Math.PI*2;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]){ // wrap so the tile is seamless
      g.beginPath(); g.arc(x + ox, y + oy, r, a0, a0 + Math.PI*1.4);
      g.lineWidth = 1.1; g.strokeStyle = `rgba(255,255,255,${0.25 + rnd()*0.25})`; g.stroke();
      g.beginPath(); g.arc(x + ox + 0.7, y + oy + 0.8, r, a0 + Math.PI, a0 + Math.PI*2.2);
      g.lineWidth = 1; g.strokeStyle = `rgba(0,0,0,${0.2 + rnd()*0.25})`; g.stroke();
    }
  }
  return (loopTile = c);
}
// Fill everything a letter shape encloses (its holes too), by flooding in from the border.
function fillHoles(c){
  const g = c.getContext('2d'), W = c.width, H = c.height, img = g.getImageData(0, 0, W, H), D = img.data;
  const out = new Uint8Array(W*H), stack = [];
  const push = i => { if (!out[i] && D[i*4 + 3] < 128){ out[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++){ push(x); push((H - 1)*W + x); }
  for (let y = 0; y < H; y++){ push(y*W); push(y*W + W - 1); }
  while (stack.length){
    const i = stack.pop(), x = i % W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < W*(H - 1)) push(i + W);
  }
  for (let i = 0; i < W*H; i++) if (!out[i]){ D[i*4] = D[i*4 + 1] = D[i*4 + 2] = 255; D[i*4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}
// Bits of a letter that sit inside one of its holes, like the block in the middle of
// Graduate's 0. On a real patch the felt fills the hole, so these get left out.
// Returns a mask of them, grown by `grow` px so their outlines go too.
function innerBits(glyphMask, grow){
  const W = glyphMask.width, H = glyphMask.height, D = glyphMask.getContext('2d').getImageData(0, 0, W, H).data;
  const ink = i => D[i*4 + 3] >= 128, outside = new Uint8Array(W*H), comp = new Int32Array(W*H).fill(-1), stack = [];
  const nb = i => { const x = i % W, out = []; if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1); if (i >= W) out.push(i - W); if (i < W*(H - 1)) out.push(i + W); return out; };
  // Empty space reachable from the border is outside; empty space that isn't is a hole.
  const seed = i => { if (!outside[i] && !ink(i)){ outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++){ seed(x); seed((H - 1)*W + x); }
  for (let y = 0; y < H; y++){ seed(y*W); seed(y*W + W - 1); }
  while (stack.length) for (const j of nb(stack.pop())) seed(j);
  // A piece of letter that never touches the outside is inside a hole.
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'), img = og.createImageData(W, H);
  let found = false;
  for (let i = 0; i < W*H; i++){
    if (!ink(i) || comp[i] >= 0) continue;
    const pix = [i]; comp[i] = i; let touches = false;
    for (let k = 0; k < pix.length; k++) for (const j of nb(pix[k])){
      if (ink(j)){ if (comp[j] < 0){ comp[j] = i; pix.push(j); } }
      else if (outside[j]) touches = true;
    }
    if (!touches){ found = true; for (const p of pix) img.data[p*4 + 3] = 255; }
  }
  if (!found) return null;
  og.putImageData(img, 0, 0);
  const grown = document.createElement('canvas'); grown.width = W; grown.height = H;
  const gg = grown.getContext('2d');
  for (let a = 0; a < 16; a++) gg.drawImage(out, Math.cos(a/16*Math.PI*2)*grow, Math.sin(a/16*Math.PI*2)*grow);
  gg.drawImage(out, 0, 0);
  return grown;
}
function tinted(c, colour){
  const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = colour; g.fillRect(0, 0, t.width, t.height);
  return t;
}
const chenCache = new Map();
// glyphs(g, how): draws the letters in the piece's own px (0..w, 0..h), filled (how = 'fill')
// or stroked with g's current line width (how = 'stroke'). look: colours and widths in px.
function drawChenille(ctx, key, x, y, w, h, glyphs, look, o){
  // Cached per size; and redrawn once the Graduate font arrives (until then it's a fallback font).
  const font = typeof document !== 'undefined' && document.fonts?.check?.('12px Graduate') ? 'g' : 'f';
  const pad = Math.ceil(look.backingW + look.lineW + 6), W = Math.ceil(w) + pad*2, H = Math.ceil(h) + pad*2, ck = `${key}|${W}x${H}|${font}`;
  let c = chenCache.get(ck);
  if (!c){
    c = buildChenille(W, H, pad, glyphs, look);
    chenCache.set(ck, c); if (chenCache.size > 24) chenCache.delete(chenCache.keys().next().value);
  }
  ctx.drawImage(o.mask ? c.mask : c.art, x - pad, y - pad);
}
function buildChenille(W, H, pad, glyphs, look){
  // `read`: layers whose pixels get read back (hole finding). Keeping those on the CPU makes
  // getImageData cheap; on a GPU-backed canvas each read can take a second in software WebGL.
  const layer = (read = false) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', read ? { willReadFrequently:true } : undefined); g.translate(pad, pad); g.lineJoin = 'round'; return [c, g]; };
  // The backing: each letter with its holes filled in (before growing, so neighbouring
  // letters don't merge), then grown by the backing width.
  const [lc, lg] = layer(true); lg.fillStyle = '#fff'; glyphs(lg, 'fill'); fillHoles(lc);
  const [bc, bg] = layer(); bg.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 24; i++){ const a = i/24*Math.PI*2; for (const r of [look.backingW, look.backingW*0.55]) bg.drawImage(lc, Math.cos(a)*r, Math.sin(a)*r); }
  bg.drawImage(lc, 0, 0);
  const [ac, ag] = layer(); ag.setTransform(1, 0, 0, 1, 0, 0);
  ag.save(); ag.shadowColor = 'rgba(0,0,0,.45)'; ag.shadowBlur = Math.max(2, look.backingW*1.3); ag.shadowOffsetY = Math.max(1, look.backingW*0.45);
  ag.drawImage(tinted(bc, look.backing), 0, 0); ag.restore();
  // Felt texture on the backing.
  ag.save(); ag.globalCompositeOperation = 'source-atop'; ag.globalAlpha = 0.18; ag.fillStyle = ag.createPattern(grainCanvasCached(), 'repeat'); ag.fillRect(0, 0, W, H); ag.restore();
  const [gm, gg] = layer(true); gg.fillStyle = '#fff'; glyphs(gg, 'fill');
  const inner = innerBits(gm, look.lineW*1.5 + 1.5);
  // A stitched line round the chenille (the year digits have one).
  if (look.line){
    const [nc, ng] = layer(); ng.strokeStyle = look.line; ng.lineWidth = look.lineW*2; glyphs(ng, 'stroke');
    if (inner){ ng.setTransform(1, 0, 0, 1, 0, 0); ng.globalCompositeOperation = 'destination-out'; ng.drawImage(inner, 0, 0); }
    ag.drawImage(nc, 0, 0);
  }
  ag.translate(pad, pad); ag.lineJoin = 'round';
  // The chenille: colour, then loops, then darker edges and a soft highlight so it looks plush.
  const [cc, cg] = layer();
  cg.fillStyle = look.fill; glyphs(cg, 'fill');
  cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalCompositeOperation = 'source-atop';
  const pat = cg.createPattern(loopsCanvas(), 'repeat');
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(look.loop));
  cg.globalAlpha = 0.85; cg.fillStyle = pat; cg.globalCompositeOperation = 'overlay'; cg.fillRect(0, 0, W, H);
  cg.globalCompositeOperation = 'source-atop'; cg.globalAlpha = 1;
  cg.translate(pad, pad); cg.strokeStyle = 'rgba(0,0,0,.32)'; cg.lineWidth = Math.max(1.5, look.edgeShade); glyphs(cg, 'stroke');
  cg.setTransform(1, 0, 0, 1, 0, 0);
  const hl = cg.createLinearGradient(0, 0, 0, H); hl.addColorStop(0, 'rgba(255,255,255,.14)'); hl.addColorStop(1, 'rgba(0,0,0,.12)');
  cg.fillStyle = hl; cg.fillRect(0, 0, W, H);
  // The overlay blend above also tinted the empty space round the letters: cut back to them.
  cg.globalCompositeOperation = 'destination-in'; cg.drawImage(gm, 0, 0);
  if (inner){ cg.globalCompositeOperation = 'destination-out'; cg.drawImage(inner, 0, 0); }
  ag.setTransform(1, 0, 0, 1, 0, 0); ag.drawImage(cc, 0, 0);
  return { art:ac, mask:bc };
}
let grainForFelt = null;
const grainCanvasCached = () => grainForFelt || (grainForFelt = grainCanvas());

/* ----- QUEEN'S / APPLIED / SCIENCE: chenille collegiate letters, QUEEN'S arched ----- */
const QAS_LINES = [ // text, top, width, cap height (fractions of the block), how far the ends drop
  ["QUEEN'S", 0.00, 0.97, 0.27, 0.10],
  ['APPLIED', 0.47, 0.84, 0.22, 0],
  ['SCIENCE', 0.76, 0.86, 0.22, 0],
];
function drawQAS(ctx, d, x, y, w, h, o){
  const L0 = h*0.22, backing = d.backing || d.border;
  const glyphs = (g, how) => {
    for (const [t, top, fw, lh, sag] of QAS_LINES){
      const L = h*lh, arch = archOf(w*fw - L*0.6, h*sag);
      arcText(g, t, { cx:w/2, cy:h*top + L/2 + L*0.05, R:arch.R, len:arch.len, height:L, font:'Graduate, Rockwell, serif', mode:'track', squeeze:0.9, only:how });
    }
  };
  const look = { fill:d.fg, backing, backingW:L0*0.07, line:null, lineW:0, edgeShade:L0*0.05, loop:Math.max(0.15, L0/180) };
  drawChenille(ctx, ['qas', d.fg, backing].join(), x, y, w, h, glyphs, look, o);
}
// Chenille text in one line (the year number): collegiate digits on a wide felt backing.
function drawChenilleText(ctx, d, text, x, y, w, h, o){
  if (!text) return;
  const probe = document.createElement('canvas').getContext('2d');
  let fs = h*1.12; probe.font = `${fs}px Graduate, Rockwell, serif`;
  const tw = probe.measureText(text).width, maxW = w*0.86;
  if (tw > maxW) fs *= maxW/tw;
  const glyphs = (g, how) => {
    g.font = `${fs}px Graduate, Rockwell, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    how === 'fill' ? g.fillText(text, w/2, h/2 + fs*0.04) : g.strokeText(text, w/2, h/2 + fs*0.04);
  };
  const look = { fill:d.fg, backing:d.backing || '#C8283A', backingW:fs*0.075, line:d.border, lineW:fs*0.018, edgeShade:fs*0.035, loop:Math.max(0.15, fs/220) };
  drawChenille(ctx, ['chen', text, d.fg, d.border, d.backing, Math.round(fs)].join(), x, y, w, h, glyphs, look, o);
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
// o.mask draws the item's footprint in plain white (for the 3D bump and roughness maps).
export function drawItem(ctx, d, text, x, y, w, h, o = {}){
  if (d.shape === 'scroll') return drawScroll(ctx, d, text, x, y, w, h, o);
  if (d.shape === 'qas') return drawQAS(ctx, d, x, y, w, h, o);
  if (d.shape === 'arc') return drawArcBar(ctx, d, text, x, y, w, h, o);
  if (d.shape === 'chenille') return drawChenilleText(ctx, d, text, x, y, w, h, o);
  if (o.mask) d = { ...d, bg:'#fff', fg:'#fff', border:'#fff', flag:null, img:null };
  const m = Math.min(w, h);
  ctx.save();
  if (d.shape !== 'text'){
    shapePath(ctx, d.shape, x, y, w, h);
    if (!o.mask) ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.max(1, m*0.12); ctx.shadowOffsetY = Math.max(0.5, m*0.04);
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
      if (m > 14 && !o.mask){
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
    const face = n => d.font === 'block' ? `900 ${n}px Archivo, "Arial Black", sans-serif` : `${n}px Graduate, Archivo, Impact, sans-serif`;
    let fs = d.shape === 'text' ? h*(d.font === 'block' ? 1.15 : 0.9) : (d.shape === 'circle' || d.shape === 'shield') ? m*0.28 : h*0.5;
    ctx.font = face(fs);
    const tw = ctx.measureText(text).width;
    if (tw > maxW){ fs *= maxW / tw; ctx.font = face(fs); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = y + h*(d.shape === 'shield' ? 0.45 : 0.5) + fs*0.05;
    if (d.shape === 'text' || d.img || (d.flag && d.flag.type)){
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, fs*(d.edge ?? (d.font === 'block' ? 0.1 : 0.14))); ctx.strokeStyle = d.shape === 'text' ? d.border : 'rgba(0,0,0,.65)';
      if (d.shape === 'text' && !o.mask){ ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = fs*0.06; ctx.shadowOffsetY = fs*0.03; }
      ctx.strokeText(text, x + w/2, ty); ctx.restore();
    }
    ctx.fillStyle = d.fg || '#000'; ctx.fillText(text, x + w/2, ty);
  }
  ctx.restore();
}

// A metal press stud.
function drawSnap(ctx, x, y, r){
  ctx.save();
  const g = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.1, x, y, r);
  g.addColorStop(0, '#F4F5F7'); g.addColorStop(.55, '#A9AEB6'); g.addColorStop(1, '#5D626A');
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = r*0.6; ctx.shadowOffsetY = r*0.2;
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = r*0.12; ctx.beginPath(); ctx.arc(x, y, r*0.55, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

/* ----- Panels ----- */
const polyPath = (ctx, pts, k) => { pts.forEach(([x, y], i) => i ? ctx.lineTo(x*k, y*k) : ctx.moveTo(x*k, y*k)); ctx.closePath(); };
const stitchStyle = (ctx, jc, k) => { ctx.strokeStyle = shade(jc, -0.42); ctx.globalAlpha = 0.75; ctx.lineWidth = Math.max(0.6, k*0.07); ctx.setLineDash([k*0.35, k*0.25]); ctx.lineCap = 'butt'; };
// Stitching just inside a polygon's edges. `skip(i)` leaves out edge i (e.g. a fold line).
function stitchPolygon(ctx, pts, k, jc, inset = 0.5, skip = () => false){
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += (pts[j][0] - pts[i][0])*(pts[j][1] + pts[i][1]);
  const sgn = area > 0 ? 1 : -1;
  ctx.save(); stitchStyle(ctx, jc, k); ctx.beginPath();
  for (let i = 0; i < pts.length; i++){
    if (skip(i)) continue;
    const [px, py] = pts[i], [qx, qy] = pts[(i + 1) % pts.length], L = Math.hypot(qx - px, qy - py);
    if (L < inset*2.5) continue;
    const nx = -sgn*(qy - py)/L*inset, ny = sgn*(qx - px)/L*inset, tx = (qx - px)/L*inset, ty = (qy - py)/L*inset;
    ctx.moveTo((px + nx + tx)*k, (py + ny + ty)*k); ctx.lineTo((qx + nx - tx)*k, (qy + ny - ty)*k);
  }
  ctx.stroke(); ctx.restore();
}
// The top-edge profile from the cut-aways (section cm), as [x, cm down] points.
function cutawayProfile(s){
  const { w } = sectionSize(s), cuts = noGoZones(s).filter(z => z.kind === 'cutaway');
  if (!cuts.length) return [[0, 0], [w, 0]];
  const all = [[0, 0], [w, 0]];
  for (const z of cuts) for (const p of z.outline) all.push(p);
  all.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  for (const p of all){
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-6) out.push(p); else if (p[1] > last[1]) out[out.length - 1] = p;
  }
  return out;
}
// The panel's real seams: side seams (or the underarm seam) and the top edge, which follows
// the cut-away curve. A pressed groove right at the edge, topstitching half a cm in.
function drawSeams(ctx, s, k, W, H, jc){
  const cut = cutawayProfile(s), m = state.meas, bottom = H - ((s === 'front' || s === 'back') ? m.waistband : m.cuff)*k;
  const top = x => {
    for (let i = 1; i < cut.length; i++) if (x <= cut[i][0]){ const [x0, t0] = cut[i - 1], [x1, t1] = cut[i]; return t0 + (t1 - t0)*(x - x0)/((x1 - x0) || 1); }
    return 0;
  };
  const topLine = off => { ctx.beginPath(); for (let i = 0; i <= 64; i++){ const x = W/k*i/64; i ? ctx.lineTo(x*k, (top(x) + off)*k) : ctx.moveTo(x*k, (top(x) + off)*k); } };
  const sides = off => { ctx.beginPath(); ctx.moveTo(off*k, top(off)*k); ctx.lineTo(off*k, bottom); ctx.moveTo(W - off*k, top(W/k - off)*k); ctx.lineTo(W - off*k, bottom); };
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = Math.max(0.8, k*0.14);
  topLine(0.12); ctx.stroke(); sides(0.12); ctx.stroke();
  stitchStyle(ctx, jc, k); topLine(0.55); ctx.stroke(); sides(0.55); ctx.stroke();
  ctx.restore();
}

// Draws one jacket section with origin at the panel's top-left, k px per cm.
// In the editor (o.guides), the panel takes the real pattern piece's shape: the cut-aways
// (neckline, sleeve cap) show the mat through.
export function drawPanel(ctx, s, k, o = {}){
  const { w, h } = sectionSize(s), W = w*k, H = h*k, jc = state.jacket.color, zones = noGoZones(s);
  const cuts = o.guides ? zones.filter(z => z.kind === 'cutaway') : [];
  const shape = () => { ctx.beginPath(); ctx.rect(0, 0, W, H); for (const z of cuts) polyPath(ctx, z.outline, k); };
  ctx.save();
  if (o.shadow){
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    shape(); ctx.fillStyle = jc; ctx.fill('evenodd'); ctx.restore();
  }
  ctx.save();
  if (cuts.length){ shape(); ctx.clip('evenodd'); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(leatherLayer(s, state.meas, state.jacket), 0, 0, W, H);
  fillGrain(ctx, W, H, k, 0.14);
  drawSeams(ctx, s, k, W, H, jc);
  for (const z of zones) drawZone(ctx, s, z, k, jc);
  ctx.restore();
  if (o.labels) for (const z of zones) zoneLabel(ctx, s, z, k);
  if (o.guides) drawGuides(ctx, s, k, W, H);
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
// A leather flap lying on the panel (lapel or collar): the same leather, a shade lighter,
// with a soft shadow and topstitching. `fold(i)` marks edges that are fold lines, not cut edges.
function drawFlap(ctx, s, pts, k, jc, fold){
  const { w, h } = sectionSize(s);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = k*0.9; ctx.shadowOffsetY = k*0.3;
  ctx.beginPath(); polyPath(ctx, pts, k); ctx.fillStyle = jc; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); polyPath(ctx, pts, k); ctx.clip();
  ctx.drawImage(leatherLayer(s, state.meas, state.jacket), 0, 0, w*k, h*k);
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, 0, w*k, h*k);
  fillGrain(ctx, w*k, h*k, k, 0.14);
  ctx.restore();
  stitchPolygon(ctx, pts, k, jc, 0.5, fold);
}
function drawZone(ctx, s, z, k, jc){
  const x = z.x*k, y = z.y*k, zw = z.w*k, zh = z.h*k;
  if (z.kind === 'band'){
    // A flat leather band (not gathered), a seam along its top, and a stitch line along each edge.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(x, y, zw, zh);
    const sh = ctx.createLinearGradient(0, y, 0, y + k*1.2); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.fillRect(x, y, zw, k*1.2);
    stitchStyle(ctx, jc, k);
    ctx.beginPath(); ctx.moveTo(x, y + k*0.5); ctx.lineTo(x + zw, y + k*0.5); ctx.moveTo(x, y + zh - k*0.5); ctx.lineTo(x + zw, y + zh - k*0.5); ctx.stroke();
    ctx.restore();
    for (const [sx, f] of z.snaps || []) drawSnap(ctx, sx*k, y + zh*f, k*0.6);
  } else if (z.kind === 'opening'){
    // The open zipper: on each front edge, metal teeth at the very edge, then the tape,
    // then a line of topstitching on the leather. (The jacket's worn open, so the halves part.)
    const cx = x + zw/2;
    ctx.save();
    const g = ctx.createLinearGradient(cx - k*0.4, 0, cx + k*0.4, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - k*0.4, y, k*0.8, zh);
    for (const sd of [-1, 1]){
      const edge = cx + sd*k*0.05;
      ctx.fillStyle = '#6E5B44'; ctx.fillRect(Math.min(edge, edge + sd*k*1.3), y, k*1.3, zh);           // tape
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.min(edge + sd*k*1.25, edge + sd*k*1.45), y, k*0.2, zh);
      const tw = k*0.55, step = k*0.32;
      for (let yy = y + (sd > 0 ? step/2 : 0); yy < y + zh; yy += step){                               // teeth
        const tx = sd < 0 ? edge - tw : edge;
        const tg = ctx.createLinearGradient(0, yy, 0, yy + step*0.55);
        tg.addColorStop(0, '#E9ECEF'); tg.addColorStop(.6, '#9DA3AB'); tg.addColorStop(1, '#5E636B');
        ctx.fillStyle = tg; ctx.fillRect(tx, yy, tw, step*0.55);
      }
    }
    stitchStyle(ctx, jc, k);
    ctx.beginPath(); for (const ex of [cx - k*1.75, cx + k*1.75]){ ctx.moveTo(ex, y); ctx.lineTo(ex, y + zh); } ctx.stroke();
    ctx.restore();
  } else if (z.kind === 'lapel'){
    // Edge 1 runs down the front edge (the fold), so it gets no stitching.
    drawFlap(ctx, s, z.outline, k, jc, i => i === 1);
  } else if (z.kind === 'collar'){
    drawFlap(ctx, s, z.outline, k, jc, () => false);
  } else if (z.kind === 'pocket'){
    // A slanted welt: a raised leather strip with stitching, the slit along its edge.
    const [tx, ty] = z.top, [bx, by] = z.bottom, L = Math.hypot(bx - tx, by - ty)*k, wd = k*1.6;
    ctx.save(); ctx.translate((tx + bx)/2*k, (ty + by)/2*k); ctx.rotate(Math.atan2(tx - bx, by - ty));
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = k*0.5; ctx.shadowOffsetX = k*0.12;
    ctx.fillStyle = shade(jc, -0.03); roundRectPath(ctx, -wd/2, -L/2, wd, L, k*0.3); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-wd/2 - k*0.12, -L/2 + k*0.4, k*0.18, L - k*0.8);
    stitchStyle(ctx, jc, k);
    ctx.beginPath(); roundRectPath(ctx, -wd/2 + k*0.25, -L/2 + k*0.25, wd - k*0.5, L - k*0.5, k*0.2); ctx.stroke();
    ctx.restore();
  }
}
function zoneLabel(ctx, s, z, k){
  const x = z.x*k, y = z.y*k, zw = z.w*k, zh = z.h*k;
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = `600 ${clamp(k*1.3, 9, 13)}px Archivo, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (z.kind === 'opening'){ ctx.translate(x + zw/2, y + zh*0.45); ctx.rotate(-Math.PI/2); ctx.fillText(z.label, 0, 0); }
  else if (z.kind === 'vent') return ctx.restore();
  else if (z.kind === 'pocket'){ ctx.translate((z.top[0] + z.bottom[0])/2*k + k*1.7, (z.top[1] + z.bottom[1])/2*k); ctx.rotate(-Math.PI/2); ctx.fillText(z.label, 0, 0); }
  else if (z.kind === 'lapel'){ const e = z.outline[1]; ctx.fillText(z.label, (e[0] + z.side*2.6)*k, (z.y + z.h*0.42)*k); }
  else if (z.kind === 'cutaway'){ ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(z.label, x + zw/2, y + Math.min(zh*0.4, k*1.6)); }
  else ctx.fillText(z.label, x + zw*(s === 'front' && z.kind === 'band' ? 0.25 : 0.5), y + zh/2); // front: clear of the snaps
  ctx.restore();
}
function drawGuides(ctx, s, k, W, H){
  ctx.save(); const fs = clamp(k*1.3, 9, 12), cuff = state.meas.cuff*k;
  ctx.font = `600 ${fs}px Archivo, sans-serif`; ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.textBaseline = 'top';
  if (s === 'front' || s === 'back'){
    const L = s === 'front' ? 'Wearer’s right' : 'Wearer’s left', R = s === 'front' ? 'Wearer’s left' : 'Wearer’s right';
    ctx.textAlign = 'left'; ctx.fillText(L, 8, 8 + k*2); ctx.textAlign = 'right'; ctx.fillText(R, W - 8, 8 + k*2);
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H - cuff); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(W/2 + 6, H*0.45); ctx.rotate(Math.PI/2); ctx.fillText('Outer side', 0, 0); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillText('Shoulder', W/2, 4);
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillText('Underarm', 6, H - cuff - 6);
    ctx.textAlign = 'right'; ctx.fillText('Underarm', W - 6, H - cuff - 6);
  }
  ctx.restore();
}
