/* ===================== Shape geometry ===================== */
// Pure maths shared by the renderer (draw.js) and fit checking (fit.js). No DOM.
// Tested in tests/shapes.test.js.

// Curve geometry for a band of thickness t bent into an arch (ends down), with ends cut
// toward the arch's centre. It fills a w × h box: the outer edge's ends touch the box
// sides, and the inner edge's ends touch the box bottom. Returns the circle centre
// (cx, cy) and outer radius R, measured from the box's top-left, and the half-angle th.
// Real bars curve the other way (ends up, like a smile): see smile() below.
export function arcGeom(w, h, t){
  t = Math.min(t, h);
  // Lowest point (the bottom edge's end) for an outer radius R. It falls as R grows.
  const lowest = R => { const th = Math.asin(Math.min(1, w/(2*R))); return R - (R - t)*Math.cos(th); };
  if (h - t < 1e-3) return { R:Infinity, th:0, t, cx:w/2, cy:Infinity }; // flat
  let lo = w/2, hi = 1e5;
  if (lowest(lo) < h) hi = lo; // can't drop that far: use the tightest arch
  for (let i = 0; i < 60 && hi - lo > 1e-6; i++){ const mid = (lo + hi)/2; if (lowest(mid) > h) lo = mid; else hi = mid; }
  const R = (lo + hi)/2;
  return { R, th:Math.asin(Math.min(1, w/(2*R))), t, cx:w/2, cy:R };
}

// The bar's outline as a polygon (in the item's own cm, from its top-left): the outer
// curve left to right, then the inner curve back. Fit checks measure real distances
// between outlines, so stacked bars can nest the way they do on a sleeve.
export function arcOutline(w, h, t, n = 16){
  const g = arcGeom(w, h, t);
  if (!isFinite(g.R)) return rectOutline(w, t);
  const ri = g.R - g.t, pts = [];
  for (let i = 0; i <= n; i++){ const a = -g.th + 2*g.th*i/n; pts.push([g.cx + g.R*Math.sin(a), g.cy - g.R*Math.cos(a)]); }
  for (let i = n; i >= 0; i--){ const a = -g.th + 2*g.th*i/n; pts.push([g.cx + ri*Math.sin(a), g.cy - ri*Math.cos(a)]); }
  return pts;
}
export const rectOutline = (w, h, x = 0, y = 0) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// Share of the bounding box a shape actually covers (for the space meters).
export function coverage(d){
  if (d.shape === 'circle') return Math.PI/4;
  if (d.shape === 'shield') return 0.86;
  if (d.shape === 'scroll') return 0.8;
  if (d.shape === 'arc'){
    const g = arcGeom(d.w, d.h, bandOf(d));
    return isFinite(g.R) ? g.th*(g.R**2 - (g.R - g.t)**2)/(d.w*d.h) : bandOf(d)/d.h;
  }
  return 1;
}
export const bandOf = d => d.band ?? d.h*0.7;

// Bars curve ends up: the arch flipped top to bottom within its box.
export const smile = (pts, h) => pts.map(([x, y]) => [x, h - y]);

// An item's outline in its own cm, after rotation (0 or 90, clockwise like the canvas).
export function localOutline(d, rot = 0){
  const pts = d.shape === 'arc' ? smile(arcOutline(d.w, d.h, bandOf(d)), d.h) : rectOutline(d.w, d.h);
  return rot === 90 ? pts.map(([x, y]) => [d.h - y, x]) : pts;
}

/* ----- Polygon distance (for the fit checks) ----- */
function ptSeg([px, py], [ax, ay], [bx, by]){
  const dx = bx - ax, dy = by - ay, L = dx*dx + dy*dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax)*dx + (py - ay)*dy)/L)) : 0;
  return Math.hypot(px - ax - t*dx, py - ay - t*dy);
}
const cross = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]);
// 2 when segments pq and ab properly cross, 1 when they only touch or lie along each other, 0 otherwise.
function crossing(p, q, a, b){
  const e = 1e-9, d1 = cross(a, b, p), d2 = cross(a, b, q), d3 = cross(p, q, a), d4 = cross(p, q, b);
  if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return 2;
  const near = Math.abs(d1) <= e || Math.abs(d2) <= e || Math.abs(d3) <= e || Math.abs(d4) <= e;
  if (!near) return 0;
  const ov = (u0, u1, v0, v1) => Math.max(Math.min(u0, u1), Math.min(v0, v1)) <= Math.min(Math.max(u0, u1), Math.max(v0, v1)) + e;
  return ov(p[0], q[0], a[0], b[0]) && ov(p[1], q[1], a[1], b[1]) ? 1 : 0;
}
function inside(pt, poly){ // strictly inside (points on the edge don't count)
  const [x, y] = pt;
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi)*(y - yi)/(yj - yi) + xi) c = !c;
  }
  if (!c) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (ptSeg(pt, poly[i], poly[j]) < 1e-7) return false;
  return true;
}
// A point just inside each edge. Shapes that sit exactly on top of each other share
// all their edges, so only points like these show that their insides overlap.
function innerPoints(P){
  let area = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) area += (P[j][0] - P[i][0])*(P[j][1] + P[i][1]);
  const sgn = area > 0 ? 1 : -1, out = [];
  for (let i = 0; i < P.length; i++){
    const [px, py] = P[i], [qx, qy] = P[(i + 1) % P.length], L = Math.hypot(qx - px, qy - py);
    if (L < 1e-6) continue;
    out.push([(px + qx)/2 - sgn*(qy - py)/L*1e-3, (py + qy)/2 + sgn*(qx - px)/L*1e-3]);
  }
  return out;
}
// Do two outlines overlap, or come closer than `gap`? Touching is fine when gap is 0.
export function outlinesClash(A, B, gap){
  let touch = false;
  const dist = gap > 1e-9;
  for (let i = 0; i < A.length; i++){
    const p = A[i], q = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++){
      const a = B[j], b = B[(j + 1) % B.length], c = crossing(p, q, a, b);
      if (c === 2) return true;
      if (c === 1) touch = true;
      if (dist && Math.min(ptSeg(p, a, b), ptSeg(q, a, b), ptSeg(a, p, q), ptSeg(b, p, q)) < gap - 1e-6) return true;
    }
  }
  // No edges cross: either apart, one inside the other, or touching along edges.
  if (inside(A[0], B) || inside(B[0], A)) return true;
  return touch && (innerPoints(A).some(p => inside(p, B)) || innerPoints(B).some(p => inside(p, A)));
}
