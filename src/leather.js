/* ===================== Leather textures ===================== */
// Canvas layers for the jacket's leather, shared by the flat editor and the 3D view:
//   - grain: a seamless noise tile, drawn at a fixed size in cm
//   - leatherLayer: base colour, mottling, fold shading and wear (dye rubbed through at
//     edges, raised folds and elbows, and scuffs), from surface.js
//   - heightLayer: grain and fine creases, for the 3D bump map
// All cached: they change with the jacket's size, colour or wear, never when a patch moves.
import { foldsFor, foldHeight, wearPotential, sectionDims, seeded, smooth } from './surface.js';
import { hexToRgb } from './util.js';
import { JACKET_COLOURS } from './config.js';

/* ----- Grain ----- */
export const GRAIN_PX_PER_CM = 12, GRAIN_SIZE = 256;
// Tileable value noise in 0..1, summed over a few cell sizes.
export function grainNoise(size = GRAIN_SIZE, cells = [4, 8, 32], weights = [0.35, 0.35, 0.3], seed = 7){
  const rnd = seeded(seed), out = new Float32Array(size*size);
  cells.forEach((c, ci) => {
    const n = size/c, lat = Array.from({ length:n*n }, rnd);
    const at = (i, j) => lat[((j % n + n) % n)*n + ((i % n + n) % n)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
      const fx = x/c, fy = y/c, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const su = u*u*(3 - 2*u), sv = v*v*(3 - 2*v);
      const a = at(i, j) + (at(i+1, j) - at(i, j))*su, b = at(i, j+1) + (at(i+1, j+1) - at(i, j+1))*su;
      out[y*size + x] += (a + (b - a)*sv)*weights[ci];
    }
  });
  return out;
}
let grainTile = null;
export function grainCanvas(){
  if (!grainTile){
    const c = document.createElement('canvas'); c.width = c.height = GRAIN_SIZE;
    const g = c.getContext('2d'), img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE), n = grainNoise();
    for (let i = 0; i < n.length; i++){ const v = Math.round(128 + (n[i] - 0.5)*150); img.data.set([v, v, v, 255], i*4); }
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

/* ----- Smooth noise for mottling, wear and scuffs ----- */
function hash(i, j, s){ const h = Math.sin(i*127.1 + j*311.7 + s*74.7)*43758.5453; return h - Math.floor(h); }
function noise(x, y, s){
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, su = u*u*(3 - 2*u), sv = v*v*(3 - 2*v);
  const a = hash(i, j, s) + (hash(i + 1, j, s) - hash(i, j, s))*su, b = hash(i, j + 1, s) + (hash(i + 1, j + 1, s) - hash(i, j + 1, s))*su;
  return a + (b - a)*sv;
}

/* ----- Colour layer ----- */
const COLOUR_PX = 6; // px per cm; the fields are smooth, and the grain is drawn on top at full size
const remember = (map, key, make, max = 16) => {
  if (map.has(key)){ const v = map.get(key); map.delete(key); map.set(key, v); return v; }
  const v = make(); map.set(key, v); if (map.size > max) map.delete(map.keys().next().value); return v;
};
// Per-section fields that depend only on the measurements: folds, wear potential, noise.
const fieldCache = new Map();
function fields(section, m){
  return remember(fieldCache, section + JSON.stringify(m), () => {
    const { W, H } = sectionDims(section, m), w = Math.max(1, Math.round(W*COLOUR_PX)), h = Math.max(1, Math.round(H*COLOUR_PX));
    const folds = foldsFor(section, m), seed = section.length*13.1, n = w*h;
    const fold = new Float32Array(n), wear = new Float32Array(n), mottle = new Float32Array(n), scuff = new Float32Array(n);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++){
      const x = (px + 0.5)/COLOUR_PX, y = (py + 0.5)/COLOUR_PX, k = py*w + px, f = foldHeight(folds, x, y);
      fold[k] = f;
      mottle[k] = noise(x/9, y/9, seed)*0.6 + noise(x/3.2, y/3.2, seed + 1)*0.4;
      wear[k] = wearPotential(section, m, x, y, f, noise(x/2.4, y/2.4, seed + 2)*0.55 + noise(x/7, y/7, seed + 5)*0.45);
      scuff[k] = noise(x/1.4, y/1.4, seed + 3)*0.7 + noise(x/0.6, y/0.6, seed + 4)*0.3;
    }
    return { W, H, w, h, fold, wear, mottle, scuff };
  }, 8);
}
// What the dye wears through to: undyed leather darkens to a patina, purple to tan.
export function wornColour(hex){
  const c = JACKET_COLOURS.find(j => j.color.toLowerCase() === String(hex).toLowerCase());
  if (c) return c.worn;
  const [r, g, b] = hexToRgb(hex), t = 0.6, to = [107, 88, 64];
  return '#' + [r, g, b].map((v, i) => Math.round(v + (to[i] - v)*t).toString(16).padStart(2, '0')).join('');
}
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
// The leather for one section, at COLOUR_PX: cached per size, colour and wear.
const layerCache = new Map();
export function leatherLayer(section, m, jacket){
  const wear = Math.round((jacket.wear ?? 0)*20)/20;
  return remember(layerCache, [section, JSON.stringify(m), jacket.color, wear].join('|'), () => {
    const F = fields(section, m), c = document.createElement('canvas'); c.width = F.w; c.height = F.h;
    const g = c.getContext('2d'), img = g.createImageData(F.w, F.h), D = img.data;
    const base = hexToRgb(jacket.color), worn = hexToRgb(wornColour(jacket.color));
    const reach = Math.pow(wear, 0.8);
    for (let k = 0; k < F.w*F.h; k++){
      let r = base[0], gg = base[1], b = base[2];
      // Dye rubbed through where the leather wears most, plus an overall patina.
      const t = smooth(0.3, 1.05, F.wear[k])*reach*0.62 + 0.1*wear;
      r += (worn[0] - r)*t; gg += (worn[1] - gg)*t; b += (worn[2] - b)*t;
      // Scuffs: small lighter, flatter patches.
      const sc = smooth(0.8 - 0.12*wear, 0.94, F.scuff[k])*wear*0.3;
      r += (255 - r)*sc*0.35; gg += (255 - gg)*sc*0.35; b += (255 - b)*sc*0.3;
      // Mottling and fold shading (valleys darker, ridges catching a little light).
      const f = F.fold[k], fs = f < 0 ? -0.17*Math.min(1, -f/0.5) : 0.05*Math.min(1, f/0.5);
      const mul = 1 + (F.mottle[k] - 0.5)*(0.08 + 0.1*wear) + fs;
      D[k*4] = Math.max(0, Math.min(255, r*mul)); D[k*4 + 1] = Math.max(0, Math.min(255, gg*mul)); D[k*4 + 2] = Math.max(0, Math.min(255, b*mul)); D[k*4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Worn leather shows its fine creases as faint dark lines.
    if (wear > 0.05) strokeCreases(g, creaseList(section, m), creaseCount(wear), COLOUR_PX, (ctx, w, depth) => {
      ctx.lineWidth = Math.max(0.6, w*1.2); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(30,20,10,${(0.05 + 0.12*wear)*depth})`;
    });
    return c;
  }, 24);
}

/* ----- Height layer (3D bump) ----- */
// Grain, fine creases (each a valley with a lit ridge beside it) and the gathers in the bands.
const heightCache = new Map();
export function heightLayer(section, m, wear, k, bands){
  wear = Math.round((wear ?? 0)*20)/20;
  return remember(heightCache, [section, JSON.stringify(m), wear, k].join('|'), () => {
    const { W, H } = sectionDims(section, m), c = document.createElement('canvas');
    c.width = Math.round(W*k); c.height = Math.round(H*k);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, c.width, c.height);
    fillGrain(g, c.width, c.height, k, 0.5 - 0.15*wear, 'source-over');
    g.fillStyle = 'rgba(128,128,128,.35)'; g.fillRect(0, 0, c.width, c.height); // calm the grain a little
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
