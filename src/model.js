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
import { foldsFor, foldHeight, smooth, sectionDims, seeded, cuffVentX } from './surface.js';
import { CUFF_VENT, SIDE_PANEL } from './config.js';

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
    // Proportions from Nathaniel's jacket (127 cm chest): 56 cm shoulder seam to shoulder seam,
    // 25 cm across the back neckline, 23 cm from the shoulder point down to the armpit.
    yNs, yS, yA:yS - 0.18*C,           // armpit
    yNf:yNs - 0.085*C, yNb:yNs - 2,    // front and back of the neckline
    SH:0.22*C, NW:0.1*C,               // half the shoulder width, half the neck width
    zS:0.5, zNf:0.08*C, zNb:-0.05*C,   // depth of the shoulder seam and of the neckline
    armhole:0.058*C,                   // how far the armhole bows forward and back
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

// Width and depth of the torso at height y, as multiples of the chest: fuller over the
// chest and the shoulder blades. The waistband isn't gathered in: it hangs straight down,
// the same width as the body (Nathaniel).
function rowScale(d, y){
  const s = 1;
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
  // The armhole bows out front and back so the sleeve has room. The torso near it fills out
  // to at least the armhole's depth (a soft max, not an added bump), so the leather runs
  // smoothly out to the armhole seam instead of dipping in beside it.
  const du = Math.min(u, 1 - u)*d.W, sg = panel === 'front' ? 1 : -1, reach = d.armhole*(1 - smooth(14, 28, du));
  for (let k = 1; k <= 60; k++){
    // Measured from the line running from the armpit (z = 0) up to the shoulder seam (z = zS),
    // so both panels still meet exactly at the armpit and along the seam.
    // The armhole is an oval seen from the side: full depth halfway up, rounding in toward the
    // armpit and the shoulder seam by height (not by distance along the column, which runs
    // level at the top and would leave the depth standing until right under the seam).
    const h = k/60, p = hermite(P0, T0, P1, T1, h), t = Math.min(1, Math.max(0, (p[1] - P0[1])/(P1[1] - P0[1])));
    const E = reach*Math.sqrt(4*t*(1 - t)), soft = 0.3*E + 1e-3;
    const z = sg*p[2], F = sg*d.zS*h + E;
    p[2] = sg*(z + F + Math.sqrt((z - F)**2 + soft*soft))/2;
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
    else {
      // A column too short to reach the top (the neckline) squeezes its last few cm of flat
      // panel into the last few cm of real leather, so the edge is a smooth curve rather than
      // rows piled up in steps. That strip is under the collar, where nothing can go.
      // A column longer than the reference (toward the neck) keeps the reference's rows and takes
      // its extra length in its own top few cm, under the collar. Stretching it all the way down
      // made the rows on the upper back sag in the middle, flattening the QUEEN'S arch.
      // The stretch eases in (no sudden change of scale at the band's foot), or a straight line
      // drawn across the band, like the collar's front edge, bends there on the jacket. The
      // front's band is wider, as its collar edge crosses it on a long slant.
      const du = dd - ref.dA, band = Math.min(panel === 'front' ? 7 : 4, Lu*0.5), start = Lu - band, s0 = Lt - band;
      const ease = t => (Lu - Lt)*t*t;
      col.push(along(up, upCum, Lu >= Lt ? (du <= s0 ? du : du + ease((du - s0)/band)) : du <= start ? du : start + (du - start)*band/(Lt - start)));
    }
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
  // The cuff isn't gathered in: it carries straight on from the forearm (Nathaniel).
  const H = d.sleeveL, keys = [[0, 1], [0.2*H, 1], [0.44*H, 0.9], [0.72*H, 0.84], [H, 0.82]];
  for (let i = 1; i < keys.length; i++) if (yv <= keys[i][0]){
    const [y0, g0] = keys[i - 1], [y1, g1] = keys[i];
    return g0 + (g1 - g0)*smooth(y0, y1, yv);
  }
  return keys[keys.length - 1][1];
}
// A point on the sleeve tube: u around (0 underarm, 0.5 outer side), yv cm down the sleeve.
// `s` shortens the arm so the outer side's length, cap included, matches the sleeve length.
// The cuffs are worn unsnapped: the vent on the back of the arm (CUFF_VENT) opens into a V,
// widest at the cuff's edge, and the cuff flares slightly. The sleeve is two grids split at
// the vent, u < uv and u > uv; `half` (-1, +1) says which side of the vent a point is on.
const ventU = (d, side) => cuffVentX(side > 0 ? 'leftSleeve' : 'rightSleeve', d.sleeveW)/d.sleeveW;
function ventOpen(d, yv){ return smooth(d.sleeveL - CUFF_VENT.len, d.sleeveL, yv); }
function tubePoint(d, ax, side, u, yv, s = 1, half = 0){
  const { p:A, t:T } = ax.at(Math.max(0, (yv - 3)*s));
  const out = norm(sub([side, 0, 0], mul(T, side*T[0]))), F = cross(T, out), open = ventOpen(d, yv);
  const r0 = d.sleeveW*girth(d, yv)/(2*Math.PI), r = r0*(1 + 0.07*open);
  // Each side of the vent swings round the arm by half the gap, easing off away from it, to
  // nothing before the underarm seam (so the two grids still meet there).
  const uv = ventU(d, side), far = Math.min(uv, 1 - uv)*0.92;
  const swing = half ? open*CUFF_VENT.gap/2/r*(1 - smooth(0, far, Math.abs(u - uv))) : 0, psi = 2*Math.PI*u + half*swing;
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
  const meridian = (u, s, half = 0) => {
    const P0 = ringAt(u);
    // Join the tube a little below the armhole, so the cap rounds over the shoulder.
    let yc = 8;
    while (yc < H*0.6 && tubePoint(d, ax, side, u, yc, s, half)[1] > P0[1] - 5) yc += 0.5;
    const P1 = tubePoint(d, ax, side, u, yc, s, half), D = len(sub(P1, P0));
    // How the cap leaves the armhole: over the top, carrying on down the shoulder's slope;
    // round toward the underarm, heading down the arm. (Aiming it away from the shoulder
    // joint, which sits below the shoulder point, made the cap rise into a lip.)
    const slope = norm([side*(d.SH - d.NW), (d.yS - d.yNs) - 0.35*(d.SH - d.NW), 0]), arm = ax.at(0).t;
    const T0 = mul(norm(lerp(slope, arm, smooth(0.15, 0.85, Math.abs(u - 0.5)*2))), D*0.9), T1 = mul(ax.at((yc - 3)*s).t, D);
    const merid = [];
    for (let k = 0; k <= 30; k++) merid.push(hermite(P0, T0, P1, T1, k/30));
    for (let yv = yc + 0.5; yv <= H + 1e-6; yv += 0.5) merid.push(tubePoint(d, ax, side, u, yv, s, half));
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
  // Two grids, split at the cuff vent (they meet edge to edge above it, and at the underarm).
  const grid = (u0, u1, n, half) => {
    const cols = [], tops = [];
    for (let i = 0; i <= n; i++){
      const u = u0 + (u1 - u0)*i/n, { merid, yc } = meridian(u, s, half), cap = merid.slice(0, 31).reverse(), capCum = lengths(cap), Lc = capCum[capCum.length - 1];
      const dJoin = dAt(yc), col = [];
      for (let j = 0; j <= NV; j++){
        const dd = H*(1 - j/NV), yv = yvAt(dd);
        col.push(yv >= yc ? tubePoint(d, ax, side, u, yv, s, half) : along(cap, capCum, Math.min(Lc, dd - dJoin)));
      }
      cols.push(col); tops.push(Math.max(0, H - dJoin - Lc));
    }
    return makeGrid(section, cols, tops, u0, u1);
  };
  g_s.set(section, s);
  const uv = ventU(d, side), nA = Math.max(2, Math.round(NU*uv));
  const A = grid(0, uv, nA, -1), B = grid(uv, 1, Math.max(2, NU - nA), 1);
  A.vent = A.NU; B.vent = 0; // the column along the vent's edge
  A.right = B; B.left = A; B.right = A; A.left = B; // joined above the vent, and at the underarm seam
  return [A, B];
}
// How much each sleeve's arm was shortened (sleevePanel), for the folds' inside points.
const g_s = new Map();

/* ----- Normals, folds and shading ----- */
// Outward normals by finite differences, flipped to point away from `inside(j, i)`.
// A sleeve is two grids side by side (split at the cuff vent); past its edge columns a grid
// reads its neighbour's (g.left, g.right), wherever the two meet, so both work out the same
// normal along the join and stay together when the folds push them out. `base`: use the
// unfolded surfaces (both grids' own and the neighbour's).
function gridNormals(g, inside, base = false){
  const { NU, NV } = g, pos = (base && g.base) || g.pos, clampP = (j, i) => pos[j][Math.max(0, Math.min(NU, i))];
  const P = (j, i) => {
    j = Math.max(0, Math.min(NV, j));
    const o = i > NU ? g.right : i < 0 ? g.left : null;
    if (o){
      const op = (base && o.base) || o.pos, edge = i > NU ? pos[j][NU] : pos[j][0], k = i > NU ? i - NU : o.NU + i, mine = i > NU ? op[j][0] : op[j][o.NU];
      if (len(sub(edge, mine)) < 0.5) return op[j][k];
    }
    return clampP(j, i);
  };
  const raw = pos.map((row, j) => row.map((p, i) => {
    // Rows piled up at a cut-away edge: use the first real row below instead.
    let jj = j;
    while (jj < NV && len(sub(P(jj + 1, i), p)) < 1e-6) jj++;
    let du = sub(P(jj, i + 1), P(jj, i - 1)), dv = sub(P(jj + 1, i), P(Math.max(0, jj - 1), i));
    if (len(dv) < 1e-6) dv = sub(P(jj + 1, i), P(jj, i));
    return norm(cross(du, dv));
  }));
  // The grid's winding is the same everywhere, so pick in or out once for the whole panel
  // (by majority vote against the inside points), not point by point: on top of the
  // shoulders the surface faces straight up and a per-point test flips at random.
  let vote = 0;
  raw.forEach((row, j) => row.forEach((n, i) => { vote += Math.sign(dot(n, sub(pos[j][i], inside(j, i)))); }));
  return vote < 0 ? raw.map(row => row.map(n => mul(n, -1))) : raw;
}
// How far (cm) the padded panels bulge out between their seams.
const PAD = 0.45;
// Where the side panel starts: the armpit, in cm down from the top edge of the front and back
// (the rows are level rings up to there, so it's the same height across both).
const sideTopCache = new Map();
export function sidePanelTop(m){
  const key = JSON.stringify(m);
  if (!sideTopCache.has(key)){
    const d = bodyDims(m), R = torsoRefs(d, torsoTables(d));
    sideTopCache.set(key, d.L - R.back.dA);
    if (sideTopCache.size > 8) sideTopCache.delete(sideTopCache.keys().next().value);
  }
  return sideTopCache.get(key);
}
// Distance from the nearest seam across a torso panel, at section (x, y). Above the armpit
// that's the panel's side edge (the armhole); below it, the side panel's seams, `half` cm in
// from each edge, as the side panel runs on across the edge without one.
function torsoSeamDist(W, x, y, sideTop){
  const e = Math.min(x, W - x), h = SIDE_PANEL.half, below = smooth(sideTop - 1, sideTop + 2, y);
  return e + (Math.abs(e - h) - e)*below;
}
function foldPanel(g, m, insideFn){
  const sleeve = g.section === 'leftSleeve' || g.section === 'rightSleeve';
  // The inside points only orient the normals; work them out once, as applyFolds reruns.
  const ins = g.pos.map((row, j) => row.map((p, i) => insideFn(j, i)));
  insideFn = (j, i) => ins[j][i];
  const { W, H } = sectionDims(g.section, m), n0 = gridNormals(g, insideFn, true), sideTop = sleeve ? 0 : sidePanelTop(m);
  // The elastic waistband's gathers run right across the side seam line (where the front and
  // back grids meet, so it fades nothing there); the other folds fade out at seams.
  const all = foldsFor(g.section, m), gathers = all.filter(f => f.pleats && f.from != null), folds = all.filter(f => !gathers.includes(f));
  // Two parts, kept apart so a patch can flatten the folds without undoing the padding
  // (which pressed every patch into a rectangular dent): g.fold and g.pad.
  g.pad = g.pos.map(row => row.map(() => 0));
  g.fold = g.pos.map((row, j) => row.map((p, i) => {
    const x = (g.u0 + (g.u1 - g.u0)*i/g.NU)*W, y = H*j/g.NV, top = g.tops[i];
    // Folds fade out at seams (so the panels still meet) but run right to free edges.
    const edge = Math.min(x, W - x), side = sleeve ? edge : torsoSeamDist(W, x, y, sideTop);
    const seams = smooth(top, top + 3, y)*smooth(0, 2.5, Math.min(edge, side));
    // The jacket is lined and padded, so each panel puffs out a little between its seams:
    // the seams (sides, top, and where the waistband or cuff joins) are pulled in.
    // The seams stay exactly where they are, so neighbouring panels still meet, and the
    // leather bulges out between them. The waistband or cuff join (inside one panel) dips in.
    const band = sleeve ? m.cuff : m.waistband, bandSeam = Math.abs(y - (H - band));
    const bulge = smooth(0, 4, side)*smooth(0, 4, y - top), dip = 0.6*(1 - smooth(0, 1.2, bandSeam));
    g.pad[j][i] = PAD*(bulge - dip);
    return foldHeight(folds, x, y)*seams + foldHeight(gathers, x, y)*smooth(top, top + 3, y);
  }));
  g.base = g.pos; g.n0 = n0; g.inside = insideFn;
  applyFolds(g);
}
// Push the panel out along its folds and padding. `damp(j, i)` (0..1) scales the folds down,
// e.g. under a stiff felt patch, which keeps the leather beneath it smooth; the padding stays.
export function applyFolds(g, damp = null){
  g.pos = g.base.map((row, j) => row.map((p, i) => add(p, mul(g.n0[j][i], g.fold[j][i]*(damp ? damp(j, i) : 1) + g.pad[j][i]))));
  g.normal = gridNormals(g, g.inside);
}
// After folding grids that are joined (a sleeve's two halves), redo their normals so each
// sees the other's folded surface along the join.
export function joinNormals(gs){ for (const g of gs) if (g.left || g.right) g.normal = gridNormals(g, g.inside); }
// Ambient occlusion, per point, 0.5..1: the body side under the arm, the inside of the
// sleeve against the body, fold valleys, and just under the waistband's blousing.
function shade(g, d){
  const sleeve = g.section !== 'front' && g.section !== 'back', W = sleeve ? d.sleeveW : d.W, H = sleeve ? d.sleeveL : d.L;
  g.ao = g.pos.map((row, j) => row.map((p, i) => {
    const x = (g.u0 + (g.u1 - g.u0)*i/g.NU)*W, y = H*j/g.NV, side = Math.min(x, W - x), f = g.fold[j][i] + g.pad[j][i];
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
// Where the real piece starts on a panel, cm down from the top edge, at section x (the neckline).
function topOf(g, W, x){
  const f = Math.max(0, Math.min(g.NU, (x/W - g.u0)/(g.u1 - g.u0)*g.NU)), i = Math.min(g.NU - 1, Math.floor(f));
  return g.tops[i] + (g.tops[i + 1] - g.tops[i])*(f - i);
}
// The collar: a flat shirt collar. A low stand round the neck, folded over, then the fall
// lying on the jacket out to its edge, with its points on the chest.
//
// Everything is laid out in each panel's own flat coordinates (section cm) and lifted onto
// the 3D surface with panelAt, so positions and normals are exact and smooth. Each sample
// round the neck has a neck point (on the neckline) and an outer point (the collar's edge);
// the cross-section between them follows the surface, lifted by the collar's thickness.
function collar(d, F, B){
  const W = d.W, H = d.L, ns = neckSides(d), O = collarOutline(d);
  // Samples round the neck: [panel, neck x, outer x, outer y, stand (0..1)]. The outer edge
  // is collarOutline's, so the collar is the same width all round, as the 2D zones show it.
  const S = [];
  const front = (g, side, rev) => {
    const xe = W/2, xn = side < 0 ? ns.front*W : (1 - ns.front)*W, out = [];
    for (let k = 0; k <= 24; k++){
      const q = k/24;
      // The stand is lower toward the front, where the collar meets the zipper.
      out.push([g, xe + (xn - xe)*q, ...O.front[side][k], 0.35 + 0.65*Math.pow(q, 1.5)]);
    }
    S.push(...(rev ? out.reverse() : out));
  };
  const back = () => {
    const xa = (1 - ns.back)*W, xb = ns.back*W;
    for (let k = 1; k < 40; k++) S.push([B, xa + (xb - xa)*k/40, ...O.back[k], 1]);
  };
  front(F.left, -1, false); back(); front(F.right, 1, true);
  const rows = [[], [], [], [], [], [], []];
  // Near the neckline the grid mixes piled-up rows (above the cut-away) with real ones, so
  // sampling there zigzags. The surface normal comes from 3 cm below, where the grid is clean.
  // The front panels there face forward and the back faces backward, so the normal jumps at
  // the shoulder seams; blend it round the neck, or the collar kinks at each seam.
  const ns0 = S.map(([g, nx]) => panelAt(g, W, H, nx, topOf(g, W, nx) + 3).n);
  for (let pass = 0; pass < 24; pass++){
    const prev = ns0.map(q => q.slice());
    for (let k = 1; k < ns0.length - 1; k++) ns0[k] = norm(add(add(prev[k - 1], prev[k + 1]), mul(prev[k], 2)));
  }
  S.forEach(([g, nx, ox, oy, standK], si) => {
    // The neck point is the exact top edge (y = 0 is the piled top point of each column).
    const ny = topOf(g, W, nx), stand = LAPEL.stand*standK + 0.15;
    const neck = panelAt(g, W, H, nx, 0.01).p, n = ns0[si];
    const at = (t, lift) => { const q = panelAt(g, W, H, nx + (ox - nx)*t, ny + (Math.max(oy, ny) - ny)*t); return add(q.p, mul(q.n, lift)); };
    const toward = sub(at(0.3, 0), neck), dir = norm(sub(toward, mul(n, dot(toward, n))));
    // The facing inside the neck: down over the lining's top edge, which is cut in steps
    // along the grid and would otherwise show.
    rows[6].push(add(add(neck, mul(n, -THICK*0.85 - 0.05)), [0, -2, 0]));
    rows[0].push(add(neck, mul(n, -0.5)));                                // just inside the neckline
    // The collar stands up off the neck and the fall rolls over it, so the fall is held off
    // the jacket and only its edge comes down near the leather (not moulded onto it).
    rows[1].push(add(neck, add(mul(n, stand*0.6 + 0.1), mul(dir, -0.2))));  // up the stand
    rows[2].push(add(neck, add(mul(n, stand + 0.3), mul(dir, 0.5))));       // the fold
    rows[3].push(at(0.35, 0.35 + stand*0.75));                             // the fall, rolling down
    rows[4].push(at(0.7, 0.35 + stand*0.4));
    rows[5].push(at(1, 0.35 + stand*0.15));                                // the outer edge, just off the jacket
  });
  // Smooth along the neck (the front and back samples meet at the shoulder seams).
  const N = S.length;
  for (const row of rows) for (let pass = 0; pass < 5; pass++){
    const prev = row.map(q => q.slice());
    for (let k = 2; k < N - 2; k++) row[k] = mul(add(add(prev[k - 1], prev[k + 1]), mul(prev[k], 2)), 0.25);
  }
  return [rows[6], ...rows.slice(0, 6)];
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
// From Nathaniel's photo: a flat shirt collar about 6.5 cm deep all round, with big points
// lying on the chest, and the front edges folded back a little just under it.
// From Nathaniel's jacket: the collar lies 5 cm deep at the back, with 7.5 cm points. The
// front edges fold back a little just under the points.
// Leather plus lining and padding, cm. The 3D view gives every panel and edge this depth.
export const THICK = 1.0;
export const LAPEL = { point:7.6, fall:5.1, stand:2.2, lapelW:4 };
// The collar point and the fold-back, in front-section cm: the tip is `point` cm from where the
// collar meets the neckline at the front edge, angled down and out.
export function collarSize(d){
  const depth = d.yNs - d.yNf, tipX = LAPEL.point*0.65, tipY = depth + LAPEL.point*0.76;
  return { ...LAPEL, tipX, tipY, lapelDrop:tipY + 3 };
}
// The collar's outer edge, in section cm, shared with the no-go zones so 2D and 3D agree.
// It crosses each shoulder seam square on, `fall` cm out from the neck along the seam, as a
// real collar does. (Meeting the seam edge-on from both sides folded it back on itself there.)
// Front: q = 0 at the collar point on the chest, 1 at the shoulder seam. It runs `fall` cm out
// from the neckline, widening into the point at the front and rounding over onto the seam
// at the shoulder, like the back's corners.
export function frontCollarEdge(d, side, q){
  const W = d.W, ns = neckSides(d), { tipX, tipY, fall } = collarSize(d), top = frontNeckline(d);
  const xe = W/2, xn = side < 0 ? ns.front*W : (1 - ns.front)*W;
  const N = q => { const x = xe + (xn - xe)*Math.min(1, Math.max(0, q)); return [x, top(x)]; };
  const n0 = N(0), tip = [xe + side*tipX, tipY], tipLen = Math.hypot(tip[0] - n0[0], tip[1] - n0[1]);
  // Square to the neckline, away from the neck (down the panel). Measured over a wide span so
  // it turns smoothly where the neckline bends from sloping to level.
  const a = N(q - 0.12), b = N(q + 0.12), t = [b[0] - a[0], b[1] - a[1]];
  let perp = [-t[1], t[0]]; if (perp[1] < 0) perp = [-perp[0], -perp[1]];
  const k = smooth(0, 0.35, q), tipDir = [(tip[0] - n0[0])/tipLen, (tip[1] - n0[1])/tipLen], pl = Math.hypot(...perp) || 1;
  let dir = [tipDir[0] + (perp[0]/pl - tipDir[0])*k, tipDir[1] + (perp[1]/pl - tipDir[1])*k];
  const dl = Math.hypot(...dir); dir = [dir[0]/dl, dir[1]/dl];
  const w = tipLen + (fall - tipLen)*smooth(0, 0.45, q);
  // The rounded corner onto the shoulder seam (where the neckline runs level).
  const th = smooth(0.7, 1, q)*Math.PI/2, sx = 1 + (W/ns.topFront - 1)*Math.sin(th);
  const f = [dir[0]*Math.cos(th) + side*Math.sin(th), dir[1]*Math.cos(th)], p = N(q);
  return [p[0] + f[0]*w*sx, Math.max(0, p[1] + f[1]*w)];
}
// The front neckline: cm down from the top edge at section x (cached; see computeCutaways).
const neckCache = new Map();
function frontNeckline(d){
  const key = JSON.stringify(d);
  if (!neckCache.has(key)){
    const T = torsoTables(d), R = torsoRefs(d, T), M = 64, ys = [];
    for (let i = 0; i <= M; i++){ const u = i/M; ys.push(torsoColumn(d, T, R, 'front', u, u <= 0.5 ? -1 : 1, 2).top); }
    neckCache.set(key, x => { const f = Math.min(M, Math.max(0, x/d.W*M)), i = Math.min(M - 1, Math.floor(f)); return ys[i] + (ys[i + 1] - ys[i])*(f - i); });
    if (neckCache.size > 8) neckCache.delete(neckCache.keys().next().value);
  }
  return neckCache.get(key);
}
// Back: r = 0 and 1 at the shoulder seams. It leaves each seam heading straight down, rounds a
// corner, and runs across `fall` cm below the top edge.
export function backCollarEdge(d, r){
  const W = d.W, ns = neckSides(d), { fall } = collarSize(d), sp = fall*W/ns.topBack;
  const s = Math.min(r, 1 - r), x0 = r < 0.5 ? (1 - ns.back)*W + sp : ns.back*W - sp, dir = Math.sign(W/2 - x0);
  const rc = 0.2, th = Math.min(1, s/rc)*Math.PI/2, corner = x0 + dir*sp*(1 - Math.cos(th));
  return [s < rc ? corner : corner + (W/2 - corner)*(s - rc)/(0.5 - rc), fall*Math.sin(th)];
}

// The collar's outer edge, in section cm, as used by both the 3D collar and the no-go zones.
// frontCollarEdge and backCollarEdge give its shape, but the flat panel is squeezed near the
// neckline (see torsoColumn), so a fixed width in section cm comes out narrower on the
// jacket down the sides of the front. Each point is pushed in or out along its line from the
// neck until it's the right distance from the neck on the jacket itself: `fall` all round,
// widening smoothly into the points at the front.
// Returns { front: { [-1]: [25 points], [1]: [...] } (q = k/24), back: [41 points] (r = k/40) }.
const outlineCache = new Map();
export function collarOutline(d){
  const key = JSON.stringify(d);
  if (!outlineCache.has(key)){ outlineCache.set(key, computeCollarOutline(d)); if (outlineCache.size > 8) outlineCache.delete(outlineCache.keys().next().value); }
  return outlineCache.get(key);
}
function computeCollarOutline(d){
  const T = torsoTables(d), W = d.W, H = d.L, ns = neckSides(d), { fall, point } = collarSize(d);
  const at = (g, x, y) => {
    const u = (x/W - g.u0)/(g.u1 - g.u0)*g.NU, v = Math.max(0, Math.min(H, y))/H*g.NV;
    const i = Math.max(0, Math.min(g.NU - 1, Math.floor(u))), j = Math.max(0, Math.min(g.NV - 1, Math.floor(v)));
    const fu = Math.max(0, Math.min(1, u - i)), fv = Math.max(0, Math.min(1, v - j)), P = g.pos;
    return lerp(lerp(P[j][i], P[j][i + 1], fu), lerp(P[j + 1][i], P[j + 1][i + 1], fu), fv);
  };
  // Distance on the jacket from the real neck edge (the column's top point) to `e`: down
  // the column to the drawn neckline, then straight across the flat panel.
  const reach = (g, nx, ny, e) => {
    let L = 0, prev = at(g, nx, 0);
    for (let k = 1; k <= 30; k++){
      const t = k/30, p = t <= 0.2 ? at(g, nx, ny*t/0.2) : at(g, nx + (e[0] - nx)*(t - 0.2)/0.8, ny + (e[1] - ny)*(t - 0.2)/0.8);
      L += len(sub(p, prev)); prev = p;
    }
    return L;
  };
  // How much to scale each raw point's distance from the neck, smoothed along the edge.
  const fit = (g, nx, raw, target) => {
    const ny = topOf(g, W, nx);
    let s = 1;
    for (let it = 0; it < 5; it++) s *= target/reach(g, nx, ny, [nx + (raw[0] - nx)*s, ny + (raw[1] - ny)*s]);
    return { ny, s };
  };
  const smoothed = (pts, fits, nxs) => {
    let s = fits.map(f => f.s);
    for (let pass = 0; pass < 4; pass++) s = s.map((v, k) => k === 0 || k === s.length - 1 ? v : (s[k - 1] + 2*v + s[k + 1])/4);
    let out = pts.map((p, k) => [nxs[k] + (p[0] - nxs[k])*s[k], Math.max(0, fits[k].ny + (p[1] - fits[k].ny)*s[k])]);
    // Where the neckline bends sharply, an offset this wide folds back on itself a little:
    // round the edge off (the ends, the point and the shoulder seam, stay put).
    for (let pass = 0; pass < 8; pass++) out = out.map((p, k) => k === 0 || k === out.length - 1 ? p : [(out[k - 1][0] + 2*p[0] + out[k + 1][0])/4, Math.max(0, (out[k - 1][1] + 2*p[1] + out[k + 1][1])/4)]);
    return out;
  };
  const out = { front:{}, back:null };
  for (const side of [-1, 1]){
    const g = torsoPanel(d, T, 'front', side < 0 ? 0 : 0.5, side < 0 ? 0.5 : 1, side, 40, 100);
    const xe = W/2, xn = side < 0 ? ns.front*W : (1 - ns.front)*W, nxs = [], raws = [], fits = [];
    for (let k = 0; k <= 24; k++){
      const q = k/24, nx = xe + (xn - xe)*q, raw = frontCollarEdge(d, side, q);
      nxs.push(nx); raws.push(raw); fits.push(fit(g, nx, raw, fall + (point - fall)*(1 - smooth(0, 0.4, q))));
    }
    // A real collar's front edge runs straight from the shoulder seam to the point (Nathaniel);
    // the fitted width bends it where the neckline bends, so put each point on that line,
    // easing back to the fitted edge just by the seam so it still meets the back's corner.
    const pts = smoothed(raws, fits, nxs), a = pts[0], b = pts[pts.length - 1];
    const ab = [b[0] - a[0], b[1] - a[1]], ab2 = ab[0]*ab[0] + ab[1]*ab[1];
    out.front[side] = pts.map((p, k) => {
      const t = Math.max(0, Math.min(1, ((p[0] - a[0])*ab[0] + (p[1] - a[1])*ab[1])/ab2));
      const l = [a[0] + ab[0]*t, a[1] + ab[1]*t], w = 1 - smooth(0.8, 1, k/24);
      return [p[0] + (l[0] - p[0])*w, Math.max(0, p[1] + (l[1] - p[1])*w)];
    });
  }
  const B = torsoPanel(d, T, 'back', 0, 1, 0, 80, 100), xa = (1 - ns.back)*W, xb = ns.back*W, nxs = [], raws = [], fits = [];
  for (let k = 0; k <= 40; k++){
    const r = k/40, nx = xa + (xb - xa)*r, raw = backCollarEdge(d, r);
    nxs.push(nx); raws.push(raw); fits.push(fit(B, nx, raw, fall));
  }
  out.back = smoothed(raws, fits, nxs);
  return out;
}

/* ----- The whole jacket ----- */
// Everything the 3D view needs, from the measurements. Each panel has pos, normal, ao
// (grids), and u0/u1 (its share of the section texture).
export function buildJacket(m){
  const d = bodyDims(m), T = torsoTables(d);
  const torsoInside = g => (j, i) => [0, g.pos[j][i][1], 0];
  const F = { left:torsoPanel(d, T, 'front', 0, 0.5, -1, 40, 100), right:torsoPanel(d, T, 'front', 0.5, 1, 1, 40, 100) };
  const B = torsoPanel(d, T, 'back', 0, 1, 0, 80, 100);
  // Below the armpit the front and back are one piece across the side seam line (the side
  // panel), so let their normals read across it (see gridNormals): the padding then runs on
  // across without a crease. The front's left edge meets the back's right, and vice versa.
  F.left.left = B; B.right = F.left; F.right.right = B; B.left = F.right;
  const sleeves = ['leftSleeve', 'rightSleeve'].flatMap(s => sleevePanel(d, T, s, 64, 110));
  for (const g of [F.left, F.right, B]) foldPanel(g, m, torsoInside(g));
  for (const g of sleeves){
    const side = g.section === 'leftSleeve' ? 1 : -1, ax = sleeveAxis(d, side);
    const s = g_s.get(g.section) || 1;
    foldPanel(g, m, (j, i) => { const p = g.base ? g.base[j][i] : g.pos[j][i]; let best = ax.J, bd = Infinity; for (let t = 0; t <= d.sleeveL; t += 2){ const q = ax.at(t*s).p, dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (dd < bd){ bd = dd; best = q; } } return best; });
  }
  joinNormals([F.left, F.right, B, ...sleeves]);
  for (const g of [F.left, F.right, B, ...sleeves]) shade(g, d);
  return { dims:d, panels:[F.left, F.right, B, ...sleeves], collar:collar(d, F, B) };
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
  for (const s of ['leftSleeve', 'rightSleeve']){
    const [A, B] = sleevePanel(d, T, s, 32, 2), at = g => g.tops.map((t, i) => [(g.u0 + (g.u1 - g.u0)*i/g.NU)*d.sleeveW, t]);
    out[s] = [...at(A), ...at(B).slice(1)];
  }
  return out;
}
