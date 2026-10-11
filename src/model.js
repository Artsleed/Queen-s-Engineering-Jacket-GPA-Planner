/* ===================== Jacket model ===================== */
// Pure maths, no three.js and no DOM: builds the jacket's 3D surfaces from the
// measurements. Tested in tests/model.test.js.
//
// Units are cm. y is up (the hem is at y = 0), x is to the viewer's right when facing
// the front, z points out of the front.
//
// Each panel is a grid of points. Column i maps to texture u = i/NU across the section,
// row j to v = j/NV down from the section's top edge. Rows are placed by true distance
// along the surface, measured up from the hem (or the cuff), so a centimetre on the flat
// panel is a centimetre on the 3D jacket. Where the real piece is shorter than the flat
// rectangle (the neckline, and the sleeve cap by the underarm), the top rows pile up at
// the edge: that part of the rectangle isn't on the jacket (see `cutaways`).
import { foldsFor, foldHeight, smooth, sectionDims, seeded } from './surface.js';

/* ----- Small vector helpers: points are [x, y, z] ----- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];
const sgnpow = (v, p) => Math.sign(v)*Math.pow(Math.abs(v), p);
function hermite(p0, t0, p1, t1, h){
  const h2 = h*h, h3 = h2*h;
  return add(add(mul(p0, 2*h3 - 3*h2 + 1), mul(t0, h3 - 2*h2 + h)), add(mul(p1, -2*h3 + 3*h2), mul(t1, h3 - h2)));
}
// Cumulative lengths along a polyline.
function lengths(pts){ const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + len(sub(pts[i], pts[i - 1]))); return c; }
// Point at distance `d` along a polyline (clamped to its ends).
function along(pts, cum, d){
  if (d <= 0) return pts[0].slice();
  const total = cum[cum.length - 1];
  if (d >= total) return pts[pts.length - 1].slice();
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1){ const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
  return lerp(pts[lo], pts[hi], (d - cum[lo])/((cum[hi] - cum[lo]) || 1));
}
// n + 1 evenly spaced points along a polyline.
function resample(pts, n){ const cum = lengths(pts), T = cum[cum.length - 1]; return Array.from({ length:n + 1 }, (_, j) => along(pts, cum, T*j/n)); }

/* ----- Body ----- */
// The jacket's key points and sizes, all scaled from the chest and body length.
// The torso is a superellipse (boxier than an ellipse), fuller in front than behind.
export function bodyDims(m){
  const C = m.chest, L = m.length, n = 2.4, kF = 0.66, kB = 0.58;
  const a = C/(halfPerimeter(1, kF, n) + halfPerimeter(1, kB, n));
  const yNs = L + 1;                   // where the neckline meets the shoulder seam
  const yS = yNs - 0.05*C;             // shoulder point, where the sleeve starts
  return {
    C, L, W:C/2, n, a, bF:a*kF, bB:a*kB,
    yNs, yS, yA:yS - 0.2*C,            // armpit
    yNf:yNs - 0.085*C, yNb:yNs - 2,    // front and back of the neckline
    SH:0.215*C, NW:0.07*C,             // half the shoulder width, half the neck width
    zS:0.5, zNf:0.08*C, zNb:-0.05*C,   // depth of the shoulder seam and of the neckline
    armhole:0.04*C,                    // how far the armhole bows forward and back
    wb:m.waistband, cuff:m.cuff, open:m.zipper,
    sleeveW:m.sleeveCirc, sleeveL:m.sleeve,
  };
}
function halfRow(a, b, n, side, N = 160){
  const pts = [];
  for (let i = 0; i <= N; i++){
    const th = -Math.PI/2 + Math.PI*i/N;
    pts.push([side*a*sgnpow(Math.sin(th), 2/n), 0, side*b*Math.pow(Math.abs(Math.cos(th)), 2/n)]);
  }
  return pts; // front (side 1): x from -a to +a; back (side -1): +a to -a
}
function halfPerimeter(a, b, n){ const c = lengths(halfRow(a, b, n, 1)); return c[c.length - 1]; }

// Width and depth of the torso at height y, as multiples of the chest: gathered into the
// waistband, bloused just above it, fuller over the chest and the shoulder blades.
function rowScale(d, y){
  const inBand = 1 - smooth(d.wb - 0.6, d.wb + 1.2, y);
  const blouse = Math.exp(-(((y - d.wb - 3.5)/4.5)**2));
  const s = 1 - 0.1*inBand + 0.035*blouse*(1 - inBand);
  const chest = Math.exp(-(((y - (d.yA - 4))/9)**2)), blades = Math.exp(-(((y - (d.yA - 3))/10)**2));
  return { sa:s, sF:s*(1 + 0.05*chest), sB:s*(1 + 0.06*blades) };
}
// The panel's top edge: shoulder seam, neckline, neckline, shoulder seam.
function topEdge(d, panel){
  const pts = [], f = panel === 'front';
  const sp = side => [side*d.SH, d.yS, d.zS], ns = side => [side*d.NW, d.yNs, d.zS];
  const seam = (side, rev) => { for (let i = 0; i <= 20; i++){ const t = rev ? 1 - i/20 : i/20; const p = lerp(sp(side), ns(side), t); p[1] += 0.6*Math.sin(Math.PI*t); pts.push(p); } };
  const neck = (side, rev) => {
    for (let i = 1; i <= 30; i++){
      const t = (rev ? 30 - i : i)/30, phi = t*Math.PI/2;
      pts.push(f ? [side*d.NW*Math.cos(phi), d.yNs - (d.yNs - d.yNf)*Math.pow(Math.sin(phi), 1.5), d.zS + (d.zNf - d.zS)*Math.sin(phi)]
                 : [side*d.NW*Math.cos(phi), d.yNs - (d.yNs - d.yNb)*Math.sin(phi)**2, d.zS + (d.zNb - d.zS)*Math.sin(phi)]);
    }
  };
  // Front runs wearer's right (x < 0) to left; the back runs from x > 0 to x < 0.
  const s0 = f ? -1 : 1;
  seam(s0, false); neck(s0, false); neck(-s0, true); pts.push(ns(-s0)); seam(-s0, true);
  return resample(pts, 400);
}

/* ----- Torso ----- */
function torsoTables(d){
  const K = 90, low = [];
  for (let k = 0; k <= K; k++){
    const y = d.yA*k/K, s = rowScale(d, y);
    low.push({ y, front:resample(halfRow(d.a*s.sa, d.bF*s.sF, d.n, 1), 200), back:resample(halfRow(d.a*s.sa, d.bB*s.sB, d.n, -1), 200) });
  }
  return { low, top:{ front:topEdge(d, 'front'), back:topEdge(d, 'back') } };
}
const tableAt = (tab, u) => { const f = Math.min(1, Math.max(0, u))*(tab.length - 1), i = Math.min(tab.length - 2, Math.floor(f)); return lerp(tab[i], tab[i + 1], f - i); };

// GPAs lose their zippers and are worn open: the front edges hang apart, wider at the chest.
function openFront(d, p, u, half){
  const du = Math.abs(u - 0.5)*d.W, amount = (1.2 + 3*smooth(d.yA - 15, d.yNf, p[1]))*(1 - smooth(0, 14, du));
  return [p[0] + half*amount, p[1], p[2]];
}
// One column of a torso panel, from the hem up to the top edge.
function torsoMeridian(d, T, panel, u, half){
  const pts = [];
  for (const r of T.low){ const q = tableAt(r[panel], u); pts.push([q[0], r.y, q[2]]); }
  const P0 = pts[pts.length - 1], P1 = tableAt(T.top[panel], u);
  // Up the side of the chest, then curving in over the shoulder to arrive level at the seam,
  // so the front and back meet smoothly across the top of the shoulder.
  const T0 = [0, (P1[1] - P0[1])*1.1, 0], T1 = [(P1[0] - P0[0])*1.4, 0, (P1[2] - P0[2])*1.4];
  const du = Math.min(u, 1 - u)*d.W, bow = (panel === 'front' ? 1 : -1)*d.armhole*(1 - smooth(0, 10, du));
  for (let k = 1; k <= 60; k++){
    const h = k/60, p = hermite(P0, T0, P1, T1, h);
    p[2] += bow*Math.pow(Math.sin(Math.PI*h), 0.9); // the armhole bows out so the sleeve has room
    pts.push(p);
  }
  return panel === 'front' ? pts.map(p => openFront(d, p, u, half)) : pts;
}

// Where texture rows go on a torso panel. Up to the armpit, a row is a level ring: every
// column is sampled at the same height, found by distance up a reference column (the
// middle of the back, or the middle of each front half). Above the armpit, each column
// shares out the remaining rows over its own length, so all columns reach the top edge
// together; a column too short to reach it (the neckline) stops early, leaving a cut-away.
// Returns the grid column (top row first) and how far down the real piece starts.
function torsoRefs(d, T){
  const out = {};
  for (const [panel, u] of [['front', 0.25], ['back', 0.5]]){
    const low = T.low.map(r => { const q = tableAt(r[panel], u); return [q[0], r.y, q[2]]; }), cum = lengths(low);
    out[panel] = { cum, dA:cum[cum.length - 1] };
  }
  return out;
}
function torsoColumn(d, T, R, panel, u, half, NV){
  const merid = torsoMeridian(d, T, panel, u, half), K = T.low.length - 1, H = d.L;
  const low = merid.slice(0, K + 1), up = merid.slice(K), ref = R[panel];
  const upCum = lengths(up), Lu = upCum[upCum.length - 1], Lt = Math.max(1, H - ref.dA);
  // Height index on the reference column for a distance up from the hem.
  const lowAt = dd => {
    let lo = 0, hi = K;
    while (hi - lo > 1){ const mid = (lo + hi) >> 1; if (ref.cum[mid] < dd) lo = mid; else hi = mid; }
    const f = lo + (dd - ref.cum[lo])/((ref.cum[hi] - ref.cum[lo]) || 1), i = Math.min(K - 1, Math.floor(f));
    return lerp(low[i], low[i + 1], Math.min(1, f - i));
  };
  const col = [];
  for (let j = 0; j <= NV; j++){
    const dd = H*(1 - j/NV);
    if (dd <= ref.dA) col.push(lowAt(dd));
    else { const du = dd - ref.dA; col.push(along(up, upCum, Lu >= Lt ? du*Lu/Lt : Math.min(du, Lu))); }
  }
  return { col, top:Math.max(0, Lt - Lu) };
}

/* ----- Sleeves ----- */
function sleeveAxis(d, side){
  const deg = Math.PI/180, H = d.sleeveL;
  const J = [side*(d.SH - 2), d.yS - 6, 0.5];                      // shoulder joint
  const up = norm([side*Math.sin(14*deg), -Math.cos(14*deg), Math.sin(5*deg)]);
  const fore = norm([side*Math.sin(9*deg), -Math.cos(14*deg)*Math.cos(22*deg), Math.sin(27*deg)]); // bent forward at the elbow
  const sE = 0.44*H, step = 0.5, A = [J], D = [up];
  let p = J;
  for (let s = step; s <= H + 4; s += step){
    const dir = norm(lerp(up, fore, smooth(sE - 6, sE + 6, s)));
    p = add(p, mul(dir, step)); A.push(p); D.push(dir);
  }
  const at = s => { const f = Math.min(A.length - 1, Math.max(0, s/step)), i = Math.min(A.length - 2, Math.floor(f)); return { p:lerp(A[i], A[i + 1], f - i), t:norm(lerp(D[i], D[i + 1], f - i)) }; };
  return { J, at };
}
// Sleeve girth down its length, as a share of the upper-arm circumference.
function girth(d, yv){
  const H = d.sleeveL, c = d.cuff, keys = [[0, 1], [0.2*H, 1], [0.44*H, 0.88], [0.72*H, 0.8], [H - c - 4, 0.85], [H - c, 0.66], [H, 0.63]];
  for (let i = 1; i < keys.length; i++) if (yv <= keys[i][0]){
    const [y0, g0] = keys[i - 1], [y1, g1] = keys[i];
    return g0 + (g1 - g0)*smooth(y0, y1, yv);
  }
  return keys[keys.length - 1][1];
}
// A point on the sleeve tube: u around (0 underarm, 0.5 outer side), yv cm down the sleeve.
// `s` shortens the arm so the outer side's length, cap included, matches the sleeve length.
function tubePoint(d, ax, side, u, yv, s = 1){
  const { p:A, t:T } = ax.at(Math.max(0, (yv - 3)*s));
  const out = norm(sub([side, 0, 0], mul(T, side*T[0]))), F = cross(T, out);
  const r = d.sleeveW*girth(d, yv)/(2*Math.PI), psi = 2*Math.PI*u;
  return add(A, add(mul(out, -Math.cos(psi)*r*1.04), mul(F, Math.sin(psi)*r*0.96)));
}

/* ----- Building the panels ----- */
// A panel grid: pos[j][i] = [x, y, z]; tops[i] = cm from the section's top edge where the
// real piece starts in column i.
function makeGrid(section, cols, tops, u0, u1){
  const NU = cols.length - 1, NV = cols[0].length - 1;
  const pos = Array.from({ length:NV + 1 }, (_, j) => cols.map(c => c[j]));
  return { section, NU, NV, u0, u1, pos, tops };
}
function torsoPanel(d, T, panel, u0, u1, half, NU, NV){
  const cols = [], tops = [], R = torsoRefs(d, T);
  for (let i = 0; i <= NU; i++){
    const u = u0 + (u1 - u0)*i/NU, r = torsoColumn(d, T, R, panel, u, half, NV);
    cols.push(r.col); tops.push(r.top);
  }
  return makeGrid(panel, cols, tops, u0, u1);
}
// The armhole: the torso's edges above the armpit, as one loop. Sleeve u = 0 is the
// armpit, 0.5 the shoulder point; the left sleeve goes round via the front, the right via the back.
function armhole(d, T, side){
  const edge = (panel, u) => { const m = torsoMeridian(d, T, panel, u, 0); return m.slice(T.low.length - 1); };
  const fe = edge('front', side > 0 ? 1 : 0), be = edge('back', side > 0 ? 0 : 1);
  const loop = side > 0 ? [...fe, ...be.slice(0, -1).reverse()] : [...be, ...fe.slice(0, -1).reverse()];
  return resample(loop, 256);
}
function sleevePanel(d, T, section, NU, NV){
  const side = section === 'leftSleeve' ? 1 : -1, ax = sleeveAxis(d, side), ring = armhole(d, T, side), H = d.sleeveL;
  // One column: from the armhole down the cap, then down the tube to the cuff (top first).
  // Where each column meets the armhole. A real sleeve cap is fairly flat on top and curves
  // away mostly near the underarm, so the columns near the outer side take less of the
  // armhole's length than those near the underarm.
  const ringAt = u => { const a = Math.pow(Math.abs(u - 0.5)*2, 1.6)*0.5; return ring[Math.round((u < 0.5 ? 0.5 - a : 0.5 + a)*256) % 257]; };
  const meridian = (u, s) => {
    const P0 = ringAt(u);
    // Join the tube a little below the armhole, so the cap rounds over the shoulder.
    let yc = 8;
    while (yc < H*0.6 && tubePoint(d, ax, side, u, yc, s)[1] > P0[1] - 5) yc += 0.5;
    const P1 = tubePoint(d, ax, side, u, yc, s), D = len(sub(P1, P0));
    const T0 = mul(norm(sub(P0, ax.J)), D*0.75), T1 = mul(ax.at((yc - 3)*s).t, D);
    const merid = [];
    for (let k = 0; k <= 30; k++) merid.push(hermite(P0, T0, P1, T1, k/30));
    for (let yv = yc + 0.5; yv <= H + 1e-6; yv += 0.5) merid.push(tubePoint(d, ax, side, u, yv, s));
    return { merid, yc };
  };
  // The cap adds length on the outer side: shorten the arm to make up for it.
  const outer = meridian(0.5, 1), cum = lengths(outer.merid), extra = cum[cum.length - 1] - H;
  const s = Math.max(0.8, 1 - extra/(H - outer.yc));
  // Rows are rings square to the arm (like a bar sewn straight across it), placed by
  // distance up the outer side from the cuff. Above where a column joins its cap, it
  // carries on up the cap by its own length; columns that run out are cut away.
  const yvs = [], dOut = [0];
  for (let yv = H; yv >= 0; yv -= 0.25) yvs.push(yv);
  for (let k = 1; k < yvs.length; k++) dOut.push(dOut[k - 1] + len(sub(tubePoint(d, ax, side, 0.5, yvs[k], s), tubePoint(d, ax, side, 0.5, yvs[k - 1], s))));
  const yvAt = dd => { let k = 1; while (k < dOut.length - 1 && dOut[k] < dd) k++; const t = (dd - dOut[k - 1])/((dOut[k] - dOut[k - 1]) || 1); return yvs[k - 1] + (yvs[k] - yvs[k - 1])*Math.min(1, t); };
  const dAt = yv => { let k = 1; while (k < yvs.length - 1 && yvs[k] > yv) k++; const t = (yvs[k - 1] - yv)/((yvs[k - 1] - yvs[k]) || 1); return dOut[k - 1] + (dOut[k] - dOut[k - 1])*Math.min(1, t); };
  const cols = [], tops = [];
  for (let i = 0; i <= NU; i++){
    const u = i/NU, { merid, yc } = meridian(u, s), cap = merid.slice(0, 31).reverse(), capCum = lengths(cap), Lc = capCum[capCum.length - 1];
    const dJoin = dAt(yc), col = [];
    for (let j = 0; j <= NV; j++){
      const dd = H*(1 - j/NV), yv = yvAt(dd);
      col.push(yv >= yc ? tubePoint(d, ax, side, u, yv, s) : along(cap, capCum, Math.min(Lc, dd - dJoin)));
    }
    cols.push(col); tops.push(Math.max(0, H - dJoin - Lc));
  }
  g_s.set(section, s);
  return makeGrid(section, cols, tops, 0, 1);
}
// How much each sleeve's arm was shortened (sleevePanel), for the folds' inside points.
const g_s = new Map();

/* ----- Normals, folds and shading ----- */
// Outward normals by finite differences, flipped to point away from `inside(j, i)`.
function gridNormals(g, inside){
  const { NU, NV, pos } = g, P = (j, i) => pos[Math.max(0, Math.min(NV, j))][Math.max(0, Math.min(NU, i))];
  return pos.map((row, j) => row.map((p, i) => {
    // Rows piled up at a cut-away edge: use the first real row below instead.
    let jj = j;
    while (jj < NV && len(sub(P(jj + 1, i), p)) < 1e-6) jj++;
    let du = sub(P(jj, i + 1), P(jj, i - 1)), dv = sub(P(jj + 1, i), P(Math.max(0, jj - 1), i));
    if (len(dv) < 1e-6) dv = sub(P(jj + 1, i), P(jj, i));
    let n = norm(cross(du, dv));
    if (dot(n, sub(p, inside(j, i))) < 0) n = mul(n, -1);
    return n;
  }));
}
function foldPanel(g, m, insideFn){
  // The inside points only orient the normals; work them out once, as applyFolds reruns.
  const ins = g.pos.map((row, j) => row.map((p, i) => insideFn(j, i)));
  insideFn = (j, i) => ins[j][i];
  const { W, H } = sectionDims(g.section, m), folds = foldsFor(g.section, m), n0 = gridNormals(g, insideFn);
  g.fold = g.pos.map((row, j) => row.map((p, i) => {
    const x = (g.u0 + (g.u1 - g.u0)*i/g.NU)*W, y = H*j/g.NV, top = g.tops[i];
    // Folds fade out at seams (so the panels still meet) but run right to free edges.
    const seams = smooth(top, top + 3, y)*smooth(0, 2.5, Math.min(x, W - x));
    return foldHeight(folds, x, y)*seams;
  }));
  g.base = g.pos; g.n0 = n0; g.inside = insideFn;
  applyFolds(g);
}
// Push the panel out along its folds. `damp(j, i)` (0..1) scales them down, e.g. under a
// stiff felt patch, which keeps the leather beneath it flat.
export function applyFolds(g, damp = null){
  g.pos = g.base.map((row, j) => row.map((p, i) => add(p, mul(g.n0[j][i], g.fold[j][i]*(damp ? damp(j, i) : 1)))));
  g.normal = gridNormals(g, g.inside);
}
// Ambient occlusion, per point, 0.5..1: the body side under the arm, the inside of the
// sleeve against the body, fold valleys, and just under the waistband's blousing.
function shade(g, d){
  const sleeve = g.section !== 'front' && g.section !== 'back', W = sleeve ? d.sleeveW : d.W, H = sleeve ? d.sleeveL : d.L;
  g.ao = g.pos.map((row, j) => row.map((p, i) => {
    const x = (g.u0 + (g.u1 - g.u0)*i/g.NU)*W, y = H*j/g.NV, side = Math.min(x, W - x), f = g.fold[j][i];
    let o = 1 - 0.38*Math.max(0, -f)/0.5;
    if (!sleeve){
      const underArm = (1 - smooth(0, 9, side))*smooth(d.wb, d.wb + 12, p[1])*(1 - smooth(d.yA - 4, d.yA + 6, p[1]));
      o -= 0.3*underArm;
      o -= 0.12*Math.exp(-(((p[1] - d.wb - 0.3)/1.2)**2));
    } else {
      o -= 0.28*(1 - smooth(0, W*0.18, side))*(1 - smooth(0, H*0.75, y));
    }
    return Math.max(0.45, Math.min(1, o));
  }));
}

/* ----- Collar and lapels ----- */
// A point on a panel at section cm (x, y), with its normal (bilinear on the grid).
export function panelAt(g, W, H, x, y){
  const u = (x/W - g.u0)/(g.u1 - g.u0)*g.NU, v = y/H*g.NV;
  const i = Math.max(0, Math.min(g.NU - 1, Math.floor(u))), j = Math.max(0, Math.min(g.NV - 1, Math.floor(v)));
  const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j));
  const bil = A => lerp(lerp(A[j][i], A[j][i + 1], fu), lerp(A[j + 1][i], A[j + 1][i + 1], fu), fv);
  return { p:bil(g.pos), n:norm(bil(g.normal)) };
}
// The lapels: the top of each front edge folded back over the panel, a triangle from the
// neckline down to the break point. Returned as small grids of points lying on the front.
function lapels(d, F, m){
  const W = d.W, H = d.L, { lapelW, lapelDrop } = LAPEL, out = [];
  for (const [g, side] of [[F.left, -1], [F.right, 1]]){
    const rows = [];
    for (let a = 0; a <= 12; a++){
      const row = [];
      for (let b = 0; b <= 6; b++){
        const ta = a/12, tb = b/6;
        const x = W/2 + side*tb*(1 - ta)*lapelW, y = ta*lapelDrop + (1 - ta)*0.3;
        const { p, n } = panelAt(g, W, H, x, y);
        // The fold along the front edge rolls slightly out; the flap lies just above the panel.
        const lift = 0.45 + 0.35*(1 - tb)*(1 - ta);
        row.push(add(add(p, mul(n, lift)), [side*0.25*(1 - tb), 0, 0]));
      }
      rows.push(row);
    }
    out.push(rows);
  }
  return out;
}
// The collar: a short stand round the neck, folded down over the shoulders, with its points
// lying on the chest. Rows run from the neck edge to the outer edge.
function collar(d, F, B){
  const W = d.W, H = d.L, ns = neckSides(d), { tipX, tipY, spread } = LAPEL;
  const neck = [], outer = [];
  const push = (n, o) => { neck.push(n); outer.push(o); };
  // Front left: opening edge to the neck side, outer edge from the tip to the shoulder seam.
  const frontSide = (g, side) => {
    const xe = W/2, xn = side < 0 ? ns.front*W : (1 - ns.front)*W, xs = xn + side*spread.front*W/ns.topFront;
    const pts = [];
    for (let k = 0; k <= 16; k++){
      const q = k/16, nx = xe + (xn - xe)*q;
      const ox = (xe + side*tipX) + (xs - (xe + side*tipX))*q, oy = tipY*Math.pow(1 - q, 1.3);
      pts.push([panelAt(g, W, H, nx, 0.01).p, panelAt(g, W, H, ox, oy)]);
    }
    return pts;
  };
  const back = () => {
    const xa = (1 - ns.back)*W, xb = ns.back*W, pts = [];
    for (let k = 1; k < 40; k++){
      const r = k/40, nx = xa + (xb - xa)*r, edge = 1 - smooth(0, 0.2, Math.min(r, 1 - r));
      const dir = r < 0.5 ? 1 : -1, ox = nx + dir*edge*spread.back*W/ns.topBack, oy = 5.5*(1 - edge);
      pts.push([panelAt(B, W, H, nx, 0.01).p, panelAt(B, W, H, ox, oy)]);
    }
    return pts;
  };
  for (const [n, o] of frontSide(F.left, -1)) push(n, o);
  for (const [n, o] of back()) push(n, o);
  for (const [n, o] of frontSide(F.right, 1).reverse()) push(n, o);
  // Rows: neck edge, top of the stand, the fold, partway down the fall, the outer edge.
  const N = neck.length, rows = [[], [], [], [], []];
  for (let k = 0; k < N; k++){
    const end = Math.min(k, N - 1 - k)/6, stand = 1.7*Math.min(1, end) + 0.4;
    const nk = neck[k], o = outer[k], out = norm([nk[0], 0, nk[2] - 0.5]);
    const up = [0, 1, 0];
    rows[0].push(add(nk, mul(out, 0.3)));
    rows[1].push(add(add(nk, mul(up, stand)), mul(out, 0.6)));
    rows[2].push(add(add(nk, mul(up, stand + 0.25)), mul(out, 1.6)));
    rows[3].push(add(lerp(rows[2][k], add(o.p, mul(o.n, 0.7)), 0.5), mul(o.n, 0.5)));
    rows[4].push(add(o.p, mul(o.n, 0.7)));
  }
  return rows;
}
// Where the neckline meets the shoulder seam, as a share of each panel's top edge, plus the
// top edges' lengths (to turn cm along the edge into section cm).
export function neckSides(d){
  const share = panel => { const pts = topEdgeRaw(d, panel), c = lengths(pts); return { at:c[21]/c[c.length - 1], total:c[c.length - 1] }; };
  const f = share('front'), b = share('back');
  return { front:f.at, back:b.at, topFront:f.total, topBack:b.total };
}
// The top edge before resampling (its point 21 is the neck side), for neckSides.
function topEdgeRaw(d, panel){
  const pts = [], fr = panel === 'front', s0 = fr ? -1 : 1;
  const sp = side => [side*d.SH, d.yS, d.zS], ns = side => [side*d.NW, d.yNs, d.zS];
  for (let i = 0; i <= 20; i++){ const p = lerp(sp(s0), ns(s0), i/20); p[1] += 0.6*Math.sin(Math.PI*i/20); pts.push(p); }
  pts.push(ns(s0));
  for (let i = 1; i <= 30; i++){
    const phi = i/30*Math.PI/2;
    pts.push(fr ? [s0*d.NW*Math.cos(phi), d.yNs - (d.yNs - d.yNf)*Math.pow(Math.sin(phi), 1.5), d.zS + (d.zNf - d.zS)*Math.sin(phi)]
                : [s0*d.NW*Math.cos(phi), d.yNs - (d.yNs - d.yNb)*Math.sin(phi)**2, d.zS + (d.zNb - d.zS)*Math.sin(phi)]);
  }
  const half = pts.slice(), mirror = half.slice(0, -1).reverse().map(p => [-p[0], p[1], p[2]]);
  return [...half, ...mirror];
}
// Collar and lapel sizes, in section cm. state.js turns these into no-go zones.
export const LAPEL = { lapelW:9, lapelDrop:24, tipX:8, tipY:9, spread:{ front:6, back:6 } };

/* ----- The whole jacket ----- */
// Everything the 3D view needs, from the measurements. Each panel has pos, normal, ao
// (grids), and u0/u1 (its share of the section texture).
export function buildJacket(m){
  const d = bodyDims(m), T = torsoTables(d);
  const torsoInside = g => (j, i) => [0, g.pos[j][i][1], 0];
  const F = { left:torsoPanel(d, T, 'front', 0, 0.5, -1, 40, 100), right:torsoPanel(d, T, 'front', 0.5, 1, 1, 40, 100) };
  const B = torsoPanel(d, T, 'back', 0, 1, 0, 80, 100);
  const sleeves = ['leftSleeve', 'rightSleeve'].map(s => sleevePanel(d, T, s, 64, 110));
  for (const g of [F.left, F.right, B]) foldPanel(g, m, torsoInside(g));
  for (const g of sleeves){
    const side = g.section === 'leftSleeve' ? 1 : -1, ax = sleeveAxis(d, side);
    const s = g_s.get(g.section) || 1;
    foldPanel(g, m, (j, i) => { const p = g.base ? g.base[j][i] : g.pos[j][i]; let best = ax.J, bd = Infinity; for (let t = 0; t <= d.sleeveL; t += 2){ const q = ax.at(t*s).p, dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (dd < bd){ bd = dd; best = q; } } return best; });
  }
  for (const g of [F.left, F.right, B, ...sleeves]) shade(g, d);
  return { dims:d, panels:[F.left, F.right, B, ...sleeves], collar:collar(d, F, B), lapels:lapels(d, F, m) };
}

/* ----- Cut-aways (for the no-go zones) ----- */
// Parts of each flat section that aren't on the real jacket: the neckline at the top of
// the front and back, and the sleeve cap's curve near the underarm. Returns, per section,
// the top edge as [x, y] points (section cm, y down); everything above it is cut away.
const cutCache = new Map();
export function cutaways(m){
  const key = JSON.stringify(m);
  if (!cutCache.has(key)){ cutCache.set(key, computeCutaways(m)); if (cutCache.size > 8) cutCache.delete(cutCache.keys().next().value); }
  return cutCache.get(key);
}
function computeCutaways(m){
  const d = bodyDims(m), T = torsoTables(d), out = {};
  const edge = (W, merid) => { const xs = [], N = 32; for (let i = 0; i <= N; i++){ const u = i/N; xs.push([u*W, merid(u)]); } return xs; };
  const R = torsoRefs(d, T), torsoTop = panel => u => torsoColumn(d, T, R, panel, u, u <= 0.5 ? -1 : 1, 2).top;
  out.front = edge(d.W, torsoTop('front'));
  out.back = edge(d.W, torsoTop('back'));
  for (const s of ['leftSleeve', 'rightSleeve']){ const g = sleevePanel(d, T, s, 32, 2); out[s] = g.tops.map((t, i) => [i/32*d.sleeveW, t]); }
  return out;
}
