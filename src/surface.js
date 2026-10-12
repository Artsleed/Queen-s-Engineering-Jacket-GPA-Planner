/* ===================== Leather surface ===================== */
// Pure: where each section folds and wears, in that section's own cm (x across, y down
// from the top edge). The 3D model bends its surface along these folds, and the
// textures shade and wear along the same lines, so creases on the flat mat and on the
// 3D jacket line up. No DOM. Tested in tests/surface.test.js.

export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0)/(e1 - e0))); return t*t*(3 - 2*t); };
// Seeded random numbers in [0, 1), so folds and creases are the same on every load.
export function seeded(seed){ return () => ((seed = (seed*1664525 + 1013904223) >>> 0) / 4294967296); }

export function sectionDims(section, m){
  return (section === 'front' || section === 'back') ? { W:m.chest/2, H:m.length } : { W:m.sleeveCirc, H:m.sleeve };
}
const isSleeve = s => s === 'leftSleeve' || s === 'rightSleeve';
// Sleeve sides, in the sleeve's own x: the front of the arm is a quarter of the way round
// on the left sleeve and three quarters on the right (see CLAUDE.md, sleeve coordinates).
export function sleeveSides(section, W){
  const front = section === 'leftSleeve' ? 0.25*W : 0.75*W;
  return { front, back:W - front };
}

/* ----- Folds ----- */
// Each fold is one of:
//   { x0, y0, x1, y1, w, a }      a soft ridge (a > 0) or valley (a < 0) along a segment, w wide
//   { ring:true, y, w, a, wave, period, phase }   a fold all the way across, wavy
//   { pleats:true, y0, y1, period, a }            gathers, like a waistband or cuff
// Heights are in cm, out from the surface.
export function foldsFor(section, m){
  const { W, H } = sectionDims(section, m), rnd = seeded(['front', 'back', 'leftSleeve', 'rightSleeve'].indexOf(section)*7919 + 101);
  const jit = s => (rnd() - 0.5)*s, out = [];
  const seg = (x0, y0, x1, y1, w, a) => out.push({ x0, y0, x1, y1, w, a });
  if (!isSleeve(section)){
    const wb = m.waistband, top = H - wb;
    // The waistband hangs straight (it isn't cinched), so just a soft, shallow wave above it.
    out.push({ ring:true, y:top - 4, w:2, a:0.12, wave:1.2, period:W/2, phase:rnd()*6 });
    if (section === 'back'){
      // Soft drape from the shoulder blades.
      for (const sx of [0.3, 0.7]) seg(W*sx + jit(2), H*0.33, W*sx + jit(3) + (sx < 0.5 ? -2 : 2), H*0.8, 2.6, 0.22);
    } else {
      // Drape beside the open front edges, and folds running from the armpits.
      for (const side of [-1, 1]){
        const ex = W/2 + side*6;
        seg(ex + jit(1), H*0.34, ex + side*1.5 + jit(1), H*0.82, 2.2, 0.3);
        const sx = side < 0 ? 0 : W, dir = side < 0 ? 1 : -1;
        seg(sx + dir*2, H*0.3, sx + dir*10, H*0.43, 1.1, 0.3);
        seg(sx + dir*1.5, H*0.38, sx + dir*8, H*0.5, 0.9, 0.2);
      }
    }
  } else {
    const cf = m.cuff, { front } = sleeveSides(section, W), yE = H*0.46;
    // Inside of the elbow: the forearm bends forward, so the leather bunches on the front.
    [[-2.6, 0.42], [-0.4, -0.38], [1.9, 0.4], [4.1, -0.22]].forEach(([dy, a], i) => {
      const half = 4.8 - i*0.5, tilt = jit(1.4);
      seg(front - half, yE + dy - tilt, front + half, yE + dy + tilt, 0.85, a);
    });
    // The cuff isn't cinched, so the forearm only gets a couple of soft creases above it.
    const cy = H - cf;
    out.push({ ring:true, y:cy - 3, w:1.0, a:0.2, wave:1.0, period:W/3, phase:rnd()*6 });
    out.push({ ring:true, y:cy - 6.5, w:1.2, a:-0.14, wave:1.3, period:W/2, phase:rnd()*6 });
    // Folds running down from the underarm seam.
    seg(1.5, 7, 6.5, 17, 1.2, 0.25); seg(W - 1.5, 7, W - 6.5, 17, 1.2, 0.25);
  }
  return out;
}
function segDist(px, py, f){
  const dx = f.x1 - f.x0, dy = f.y1 - f.y0, L = dx*dx + dy*dy;
  const t = L ? Math.max(0, Math.min(1, ((px - f.x0)*dx + (py - f.y0)*dy)/L)) : 0;
  return { d:Math.hypot(px - f.x0 - t*dx, py - f.y0 - t*dy), t };
}
// Height of the folds at (x, y), in cm.
export function foldHeight(folds, x, y){
  let h = 0;
  for (const f of folds){
    if (f.ring){
      const yy = f.y + f.wave*Math.sin(2*Math.PI*x/f.period + f.phase);
      h += f.a*Math.exp(-(((y - yy)/f.w)**2));
    } else if (f.pleats){
      if (y < f.y0 - 0.5 || y > f.y1) continue;
      const k = smooth(f.y0 - 0.5, f.y0 + 0.8, y);
      h += f.a*k*Math.sin(2*Math.PI*x/f.period + 0.8*Math.sin(x*0.37));
    } else {
      const { d, t } = segDist(x, y, f);
      const taper = Math.sin(Math.PI*Math.min(1, Math.max(0, t*0.9 + 0.05))); // fades out at both ends
      h += f.a*taper*Math.exp(-((d/f.w)**2));
    }
  }
  return h;
}

/* ----- Wear ----- */
// How much a spot rubs over the years, 0..1: seams and edges, raised folds, elbows,
// the top of the shoulders. `noise` is a 0..1 value the caller supplies (blotchiness).
export function wearPotential(section, m, x, y, fold, noise){
  const { W, H } = sectionDims(section, m);
  const edge = d => 1 - smooth(0, 1.6, d);
  let e = Math.max(edge(x), edge(W - x), edge(y));
  if (!isSleeve(section)){
    e = Math.max(e, edge(Math.abs(y - (H - m.waistband))), edge(H - y));
    if (section === 'front') e = Math.max(e, edge(Math.abs(x - W/2) - m.zipper/2));
  } else {
    e = Math.max(e, edge(Math.abs(y - (H - m.cuff))), edge(H - y));
    const { back } = sleeveSides(section, W), dE = Math.hypot(x - back, (y - H*0.47)*0.8);
    e = Math.max(e, 0.9*Math.exp(-((dE/6.5)**2)));
  }
  const ridge = Math.max(0, Math.min(1, fold/0.45));
  return Math.max(0, Math.min(1, 0.75*e + 0.4*ridge + 0.5*(noise - 0.5) + 0.1));
}
