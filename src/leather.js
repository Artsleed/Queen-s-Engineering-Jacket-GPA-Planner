/* ===================== Leather textures ===================== */
// Canvas layers for the jacket's leather, shared by the flat editor and the 3D view. Matched
// to Nathaniel's close-ups of his GPA:
//   - grain: a seamless pebble-grain tile (cells about 1.5 mm), drawn at a fixed size in cm
//   - leatherLayer: colour. Cloudy mottling even when new; with wear the dye rubs through
//     (seams, edges, raised folds, elbows), the worn patches crack into a fine network with
//     the dye left in the cracks, and the surface picks up scuffs and specks
//   - surfaceLayer: R = gloss (clearcoat), G = roughness. Worn patches are matte
//   - heightLayer: grain and fine creases, for the 3D bump map
// All cached: they change with the jacket's size, colour or wear, never when a patch moves.
import { foldsFor, foldHeight, wearPotential, sectionDims, seeded, smooth } from './surface.js';
import { hexToRgb } from './util.js';
import { JACKET_COLOURS, LITE } from './config.js';

// Each wear or colour change makes a new layer for every section, and the big ones are
// several MB each. Phones cap a page's canvas memory and kill the tab past it, so they keep
// barely more than one per section (4); computers keep more, so scrubbing the wear slider is smooth.
const KEEP = LITE ? 5 : null;
// A dropped canvas is shrunk to nothing: Safari frees canvas memory only when it gets round to
// it, and counts the old ones against the page's limit until then.
const release = v => { if (v && typeof v.getContext === 'function'){ v.width = v.height = 0; } };
const remember = (map, key, make, max = 8) => {
  if (map.has(key)){ const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v);
  while (map.size > (KEEP || max)){ const old = map.keys().next().value; release(map.get(old)); map.delete(old); }
  return v;
};

/* ----- Cellular noise (tileable) ----- */
// For each pixel of a size × size tile: distance to the nearest and second-nearest of one
// jittered point per cell (cells × cells grid), wrapping at the edges.
function worley(size, cells, seed){
  const rnd = seeded(seed), pts = new Float32Array(cells*cells*2), cs = size/cells;
  for (let i = 0; i < cells*cells; i++){ pts[i*2] = rnd(); pts[i*2 + 1] = rnd(); }
  const f1 = new Float32Array(size*size), f2 = new Float32Array(size*size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    const cx = Math.floor(x/cs), cy = Math.floor(y/cs);
    let d1 = 1e9, d2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++){
      const gx = cx + ox, gy = cy + oy, wx = (gx + cells) % cells, wy = (gy + cells) % cells;
      const px = (gx + pts[(wy*cells + wx)*2])*cs, py = (gy + pts[(wy*cells + wx)*2 + 1])*cs;
      const d = Math.hypot(px - x - 0.5, py - y - 0.5);
      if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    f1[y*size + x] = d1; f2[y*size + x] = d2;
  }
  return { f1, f2, cs };
}

/* ----- Grain ----- */
export const GRAIN_PX_PER_CM = 24, GRAIN_SIZE = 256; // the tile covers about 10.7 cm
let grainTile = null;
// Pebble grain: each cell a soft dome, with a groove where cells meet.
export function grainCanvas(){
  if (!grainTile){
    const S = GRAIN_SIZE, { f1, f2, cs } = worley(S, 70, 7);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    for (let i = 0; i < S*S; i++){
      const edge = Math.min(1, (f2[i] - f1[i])/(cs*0.45)), dome = 1 - Math.min(1, f1[i]/(cs*0.9));
      const v = Math.round(70 + 120*Math.sqrt(edge) + 40*dome);
      img.data.set([v, v, v, 255], i*4);
    }
    g.putImageData(img, 0, 0); grainTile = c;
  }
  return grainTile;
}
// Fills a rect with the grain tile at real size (k px per cm).
export function fillGrain(ctx, W, H, k, alpha, mode = 'overlay'){
  const pat = ctx.createPattern(grainCanvas(), 'repeat');
  if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(k/GRAIN_PX_PER_CM));
  ctx.save(); ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
}

// Crackle: a network of fine lines (cells about 4 mm), 0..1 per pixel at LAYER_PX.
const CRACK_SIZE = 256;
let crackTile = null;
function crackle(){
  if (crackTile) return crackTile;
  const { f1, f2 } = worley(CRACK_SIZE, 52, 23), out = new Float32Array(CRACK_SIZE*CRACK_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = 1 - smooth(0.25, 1.3, f2[i] - f1[i]);
  return (crackTile = out);
}

/* ----- Smooth noise for mottling, wear and scuffs ----- */
function hash(i, j, s){ const h = Math.sin(i*127.1 + j*311.7 + s*74.7)*43758.5453; return h - Math.floor(h); }
function noise(x, y, s){
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u*u*(3 - 2*u), sv = v*v*(3 - 2*v);
  const a = hash(i, j, s) + (hash(i + 1, j, s) - hash(i, j, s))*su, b = hash(i, j + 1, s) + (hash(i + 1, j + 1, s) - hash(i, j + 1, s))*su;
  return a + (b - a)*sv;
}

/* ----- Fields ----- */
const FIELD_PX = 6;  // px per cm for the smooth fields (folds, wear, mottling)
const LAYER_PX = LITE ? 8 : 12; // px per cm for the colour layer (fine enough for the crackle; phones save memory)
// Per-section fields that depend only on the measurements.
const fieldCache = new Map();
function fields(section, m){
  return remember(fieldCache, section + JSON.stringify(m), () => {
    const { W, H } = sectionDims(section, m), w = Math.max(1, Math.round(W*FIELD_PX)), h = Math.max(1, Math.round(H*FIELD_PX));
    const folds = foldsFor(section, m), seed = section.length*13.1, n = w*h;
    const fold = new Float32Array(n), wear = new Float32Array(n), mottle = new Float32Array(n), scuff = new Float32Array(n);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++){
      const x = (px + 0.5)/FIELD_PX, y = (py + 0.5)/FIELD_PX, k = py*w + px, f = foldHeight(folds, x, y);
      fold[k] = f;
      // Cloudy, blotchy dye: big soft clouds with smaller ones inside.
      mottle[k] = noise(x/14, y/14, seed)*0.45 + noise(x/5.5, y/5.5, seed + 1)*0.35 + noise(x/2.2, y/2.2, seed + 6)*0.2;
      wear[k] = wearPotential(section, m, x, y, f, noise(x/2.4, y/2.4, seed + 2)*0.55 + noise(x/7, y/7, seed + 5)*0.45);
      scuff[k] = noise(x/1.4, y/1.4, seed + 3)*0.7 + noise(x/0.6, y/0.6, seed + 4)*0.3;
    }
    return { W, H, w, h, fold, wear, mottle, scuff };
  }, 8);
}
// Bilinear sample of a field at section cm (x, y).
function sample(F, A, x, y){
  const fx = Math.max(0, Math.min(F.w - 1.001, x*FIELD_PX - 0.5)), fy = Math.max(0, Math.min(F.h - 1.001, y*FIELD_PX - 0.5));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j*F.w + i;
  return (A[k]*(1 - u) + A[k + 1]*u)*(1 - v) + (A[k + F.w]*(1 - u) + A[k + F.w + 1]*u)*v;
}
// How far the dye has rubbed through at each field pixel, for a wear level (0..1).
const rubbed = (F, k, wear) => smooth(0.3, 1.05, F.wear[k])*Math.pow(wear, 0.8)*0.62 + 0.1*wear;

// What the dye wears through to: undyed leather darkens to a patina, purple to tan.
export function wornColour(hex){
  const c = JACKET_COLOURS.find(j => j.color.toLowerCase() === String(hex).toLowerCase());
  if (c) return c.worn;
  const [r, g, b] = hexToRgb(hex), t = 0.6, to = [107, 88, 64];
  return '#' + [r, g, b].map((v, i) => Math.round(v + (to[i] - v)*t).toString(16).padStart(2, '0')).join('');
}

/* ----- Creases and specks ----- */
// Fine creases, as short curved strokes in cm: [x0, y0, cx, cy, x1, y1, width, depth].
// Most cluster along the folds; more of the list is used the more worn the jacket is.
const creaseCache = new Map();
export function creaseList(section, m){
  return remember(creaseCache, section + JSON.stringify(m), () => {
    const { W, H } = sectionDims(section, m), folds = foldsFor(section, m).filter(f => !f.pleats), rnd = seeded(section.length*991 + 7), out = [];
    for (let i = 0; i < 280; i++){
      let x, y, ang;
      const f = folds[Math.floor(rnd()*folds.length)];
      if (f && rnd() < 0.65){
        if (f.ring){ x = rnd()*W; y = f.y + (rnd() - 0.5)*f.w*3; ang = (rnd() - 0.5)*0.6; }
        else { const t = rnd(); x = f.x0 + (f.x1 - f.x0)*t + (rnd() - 0.5)*f.w*3; y = f.y0 + (f.y1 - f.y0)*t + (rnd() - 0.5)*f.w*3; ang = Math.atan2(f.y1 - f.y0, f.x1 - f.x0) + (rnd() - 0.5)*0.8; }
      } else { x = rnd()*W; y = rnd()*H; ang = (rnd() - 0.5)*1.2 + (rnd() < 0.3 ? Math.PI/2 : 0); }
      const L = 0.8 + rnd()*3.2, dx = Math.cos(ang)*L/2, dy = Math.sin(ang)*L/2, bow = (rnd() - 0.5)*L*0.4;
      out.push([x - dx, y - dy, x - dy*bow/L*2, y + dx*bow/L*2, x + dx, y + dy, 0.05 + rnd()*0.09, 0.5 + rnd()*0.5]);
    }
    return out;
  });
}
const creaseCount = wear => Math.round(30 + 250*Math.max(0, Math.min(1, wear)));
function strokeCreases(ctx, list, n, k, style){
  for (const [x0, y0, cx, cy, x1, y1, wd, depth] of list.slice(0, n)){
    ctx.beginPath(); ctx.moveTo(x0*k, y0*k); ctx.quadraticCurveTo(cx*k, cy*k, x1*k, y1*k);
    style(ctx, wd*k, depth); ctx.stroke();
  }
}
// Little pale specks (paint, dried spills) that build up on a well-worn jacket.
function drawSpecks(g, section, W, H, k, wear){
  // A few splashes per panel, each a tight cluster of specks; only on well-worn jackets.
  const rnd = seeded(section.length*577 + 3), spots = Array.from({ length:5 }, () => [rnd()*W, rnd()*H]), n = Math.round(160*Math.max(0, wear - 0.45));
  for (let i = 0; i < n; i++){
    const [cx, cy] = spots[i % spots.length], spread = 4;
    const x = cx + (rnd() - 0.5)*spread, y = cy + (rnd() - 0.5)*spread, r = (0.03 + rnd()*0.12)*k;
    g.fillStyle = `rgba(225,218,210,${0.2 + rnd()*0.3})`;
    g.beginPath(); g.ellipse(x*k, y*k, r, r*(0.6 + rnd()*0.4), rnd()*3, 0, Math.PI*2); g.fill();
  }
}

/* ----- Colour layer ----- */
// The leather for one section, at LAYER_PX: cached per size, colour and wear.
const layerCache = new Map();
export function leatherLayer(section, m, jacket){
  const wear = Math.round((jacket.wear ?? 0)*20)/20;
  return remember(layerCache, [section, JSON.stringify(m), jacket.color, wear].join('|'), () => {
    const F = fields(section, m), w = Math.max(1, Math.round(F.W*LAYER_PX)), h = Math.max(1, Math.round(F.H*LAYER_PX));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), D = img.data, CR = crackle();
    const base = hexToRgb(jacket.color), worn = hexToRgb(wornColour(jacket.color));
    const T = new Float32Array(F.w*F.h); for (let k = 0; k < T.length; k++) T[k] = rubbed(F, k, wear);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++){
      const x = (px + 0.5)/LAYER_PX, y = (py + 0.5)/LAYER_PX, o = (py*w + px)*4;
      const mo = sample(F, F.mottle, x, y) - 0.5, t = sample(F, T, x, y), f = sample(F, F.fold, x, y), sc0 = sample(F, F.scuff, x, y);
      // Cloudy dye: light clouds lean toward the worn colour, dark ones are just deeper dye.
      const cloud = Math.max(0, mo)*0.55;
      let r = base[0] + (worn[0] - base[0])*cloud, gg = base[1] + (worn[1] - base[1])*cloud, b = base[2] + (worn[2] - base[2])*cloud;
      // Dye rubbed through where the leather wears most...
      r += (worn[0] - r)*t; gg += (worn[1] - gg)*t; b += (worn[2] - b)*t;
      // ...and where it's worn through, the finish cracks, with the dye left in the cracks.
      const crack = CR[(py % CRACK_SIZE)*CRACK_SIZE + (px % CRACK_SIZE)]*smooth(0.2, 0.55, t)*0.75;
      r += (base[0]*0.82 - r)*crack; gg += (base[1]*0.82 - gg)*crack; b += (base[2]*0.82 - b)*crack;
      // Scuffs: small lighter, flatter patches.
      const sc = smooth(0.8 - 0.12*wear, 0.94, sc0)*wear*0.3;
      r += (255 - r)*sc*0.35; gg += (255 - gg)*sc*0.35; b += (255 - b)*sc*0.3;
      // Darker clouds, and fold shading (valleys darker, ridges catching a little light).
      const fs = f < 0 ? -0.17*Math.min(1, -f/0.5) : 0.05*Math.min(1, f/0.5);
      const mul = 1 + Math.min(0, mo)*0.5 + mo*0.08 + fs;
      D[o] = Math.max(0, Math.min(255, r*mul)); D[o + 1] = Math.max(0, Math.min(255, gg*mul)); D[o + 2] = Math.max(0, Math.min(255, b*mul)); D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Worn leather shows its fine creases as faint dark lines.
    if (wear > 0.05) strokeCreases(g, creaseList(section, m), creaseCount(wear), LAYER_PX, (ctx, lw, depth) => {
      ctx.lineWidth = Math.max(0.6, lw*1.2); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(30,20,10,${(0.05 + 0.12*wear)*depth})`;
    });
    if (wear > 0.45) drawSpecks(g, section, F.W, F.H, LAYER_PX, wear);
    return c;
  }, 24);
}

/* ----- Surface layer (3D gloss and roughness) ----- */
// R = clearcoat (gloss), G = roughness. Satin where the finish is intact, matte where worn.
const surfCache = new Map();
export function surfaceLayer(section, m, wear, roughness){
  wear = Math.round((wear ?? 0)*20)/20;
  return remember(surfCache, [section, JSON.stringify(m), wear, roughness].join('|'), () => {
    const F = fields(section, m), c = document.createElement('canvas'); c.width = F.w; c.height = F.h;
    const g = c.getContext('2d'), img = g.createImageData(F.w, F.h), D = img.data;
    for (let k = 0; k < F.w*F.h; k++){
      const t = Math.min(1, rubbed(F, k, wear)*1.6), mo = F.mottle[k] - 0.5;
      D[k*4] = Math.round(255*(1 - 0.75*t)); D[k*4 + 1] = Math.round(255*Math.min(1, roughness + 0.35*t + 0.1*mo)); D[k*4 + 2] = 0; D[k*4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }, 8);
}

/* ----- Height layer (3D bump) ----- */
// Pebble grain, fine creases (each a valley with a lit ridge beside it), and the band seams.
const heightCache = new Map();
export function heightLayer(section, m, wear, k, bands){
  wear = Math.round((wear ?? 0)*20)/20;
  return remember(heightCache, [section, JSON.stringify(m), wear, k].join('|'), () => {
    const { W, H } = sectionDims(section, m), c = document.createElement('canvas');
    c.width = Math.round(W*k); c.height = Math.round(H*k);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, c.width, c.height);
    fillGrain(g, c.width, c.height, k, 0.55 - 0.15*wear, 'source-over');
    g.fillStyle = 'rgba(128,128,128,.3)'; g.fillRect(0, 0, c.width, c.height); // calm the grain a little
    const list = creaseList(section, m), n = creaseCount(wear);
    g.save(); g.translate(k*0.04, -k*0.04);
    strokeCreases(g, list, n, k, (ctx, w, depth) => { ctx.lineWidth = Math.max(1, w*1.6); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(255,255,255,${0.1*depth})`; });
    g.restore();
    strokeCreases(g, list, n, k, (ctx, w, depth) => { ctx.lineWidth = Math.max(1, w); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(0,0,0,${0.2*depth})`; });
    // The band's top seam: a slight groove.
    for (const z of bands){ g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(z.x*k, z.y*k - k*0.1, z.w*k, k*0.2); }
    return c;
  }, 8);
}
