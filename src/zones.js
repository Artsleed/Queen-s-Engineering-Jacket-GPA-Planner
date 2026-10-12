/* ===================== No-go zones ===================== */
// Pure: the parts of each section nothing can be sewn on, in section cm (x across, y down).
// Each zone has a bounding box (x, y, w, h), a label and a kind, and most have an exact
// `outline` polygon that fit checks use. No DOM. Tested in tests/zones.test.js.
//
// Several zones come from the 3D model (model.js), so the flat editor and the 3D jacket
// agree: the cut-aways (the neckline, and the sleeve cap by the underarm, where the flat
// rectangle is bigger than the real pattern piece) and the collar and lapels.
import { FRONT, CUFF_VENT } from './config.js';
import { cutaways, bodyDims, neckSides, collarSize } from './model.js';

const bbox = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w:Math.max(...xs) - x, h:Math.max(...ys) - y };
};
const zone = (outline, rest) => ({ ...bbox(outline), outline, ...rest });

// Split a top-edge profile into the separate stretches that are actually cut away.
function cutawayZones(profile, label, reason){
  const out = [];
  let run = null;
  profile.forEach(([x, t], i) => {
    if (t > 0.8){ if (!run) run = [[i ? profile[i - 1][0] : x, 0]]; run.push([x, t]); } // under 8 mm doesn't matter
    else if (run){ run.push([x, 0]); out.push(run); run = null; }
  });
  if (run){ run.push([profile[profile.length - 1][0], 0]); out.push(run); }
  // Ignore slivers: a notch only a few cm wide and under 2 cm deep (at a panel's top corner,
  // where the sleeve joins) doesn't change where anything can go.
  const small = r => (r[r.length - 1][0] - r[0][0]) < 5 && Math.max(...r.map(p => p[1])) < 2;
  return out.filter(r => r.length > 2 && !small(r)).map(r => zone(r, { label, kind:'cutaway', reason }));
}

// The lapel and collar point on one side of the front, as one polygon.
function lapelZone(m, side){
  const d = bodyDims(m), W = d.W, ns = neckSides(d), { lapelW, lapelDrop, tipX, tipY, fall } = collarSize(d);
  const xe = W/2, xn = side < 0 ? ns.front*W : (1 - ns.front)*W, xs = xn + side*fall*W/ns.topFront;
  const tip = [xe + side*tipX, tipY];
  // Where the collar's end (from the neck to its tip) crosses the lapel's outer edge.
  const lapelX = y => xe + side*lapelW*(1 - y/lapelDrop);
  let s = 0.5;
  for (let i = 0; i < 40; i++){ const x = xe + side*tipX*s, y = tipY*s; if (side*(x - lapelX(y)) > 0) s -= 0.5**(i + 2); else s += 0.5**(i + 2); }
  const cross = [xe + side*tipX*s, tipY*s];
  const curve = [];
  for (let k = 1; k < 8; k++){ const q = k/8; curve.push([tip[0] + (xs - tip[0])*q, tipY*Math.pow(1 - q, 1.8)]); }
  return zone([[xs, 0], [xe, 0], [xe, lapelDrop], cross, tip, ...curve], { label:'Lapel', kind:'lapel', side });
}
// The collar lying on the top of the back.
function backCollarZone(m){
  const d = bodyDims(m), W = d.W, ns = neckSides(d), xa = (1 - ns.back)*W, xb = ns.back*W, { fall } = collarSize(d), sp = fall*W/ns.topBack;
  const pts = [];
  for (let k = 0; k <= 24; k++){
    const r = k/24, nx = xa + (xb - xa)*r, edge = 1 - smoothstep(0, 0.2, Math.min(r, 1 - r));
    pts.push([nx + (r < 0.5 ? 1 : -1)*edge*sp, fall*(1 - edge)]);
  }
  return zone(pts, { label:'Collar', kind:'collar' });
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

// A slanted welt pocket: the top leans toward the front edge.
function pocketZone(m, side){
  const W = m.chest/2, H = m.length, ang = FRONT.pocketSlant*Math.PI/180, L0 = FRONT.pocketLen;
  const cx = W/2 + side*FRONT.pocketFromEdge, bottom = H - m.waistband - FRONT.pocketAboveBand, cy = bottom - Math.cos(ang)*L0/2;
  const dx = -side*Math.sin(ang)*L0/2, dy = Math.cos(ang)*L0/2;
  const a = [cx + dx, cy - dy], b = [cx - dx, cy + dy], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1])/L*1.05, ny = (b[0] - a[0])/L*1.05;
  const outline = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
  return zone(outline, { label:'Pocket', kind:'pocket', lean:-side, top:a, bottom:b });
}

const cache = new Map();
export function jacketZones(section, m){
  const key = section + JSON.stringify(m);
  if (cache.has(key)) return cache.get(key);
  const W = section === 'front' || section === 'back' ? m.chest/2 : m.sleeveCirc, H = section === 'front' || section === 'back' ? m.length : m.sleeve;
  const z = [], cut = cutaways(m)[section];
  if (section === 'front'){
    // GPAs lose their zippers and are worn open, so the middle strip is the two front edges.
    // (The setting is still called `zipper` so saved plans keep working.)
    z.push(lapelZone(m, -1), lapelZone(m, 1), pocketZone(m, -1), pocketZone(m, 1));
    z.push(...cutawayZones(cut, 'Neckline', 'Off the jacket: that part is cut away for the neckline'));
  }
  if (section === 'back'){
    z.push(backCollarZone(m));
    z.push(...cutawayZones(cut, 'Neckline', 'Off the jacket: that part is cut away for the neckline'));
  }
  if (section === 'leftSleeve' || section === 'rightSleeve')
    z.push(...cutawayZones(cut, 'Sleeve cap', 'Off the jacket: the sleeve curves away there to fit the armhole'));
  // Snaps sit near the front edges on the waistband, and near the underarm seam on the cuffs.
  if ((section === 'front' || section === 'back') && m.waistband > 0)
    z.push({ x:0, y:H - m.waistband, w:W, h:m.waistband, label:'Waistband', kind:'band',
      snaps: section === 'front' ? [-1, 1].flatMap(sd => [0.3, 0.72].map(f => [W/2 + sd*FRONT.snapFromEdge, f])) : [] });
  // The front edges carry the (open) zipper all the way to the hem. Drawn after the waistband.
  if (section === 'front' && m.zipper > 0) z.push({ x:W/2 - m.zipper/2, y:0, w:m.zipper, h:H, label:'Zipper', kind:'opening' });
  if ((section === 'leftSleeve' || section === 'rightSleeve') && m.cuff > 0){
    // The cuff is a band you can sew on (`sewable`); only the snapped vent by the underarm is off limits.
    z.push({ x:0, y:H - m.cuff, w:W, h:m.cuff, label:'Cuff', kind:'band', sewable:true, snaps:[[2.5, 0.5], [W - 2.5, 0.5]] });
    for (const x of [0, W - CUFF_VENT]) z.push({ x, y:H - m.cuff, w:CUFF_VENT, h:m.cuff, label:'Cuff snaps', kind:'vent' });
  }
  cache.set(key, z);
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  return z;
}
// How far down from the top edge the real piece starts, at section x (for placing pieces).
export function topAt(section, m, x){
  const prof = cutaways(m)[section];
  for (let i = 1; i < prof.length; i++) if (x <= prof[i][0]){
    const [x0, t0] = prof[i - 1], [x1, t1] = prof[i];
    return t0 + (t1 - t0)*(x - x0)/((x1 - x0) || 1);
  }
  return prof[prof.length - 1][1];
}
