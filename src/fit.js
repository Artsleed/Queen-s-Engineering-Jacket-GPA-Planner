/* ===================== Fit checking ===================== */
// Pure logic: no DOM. Tested in tests/fit.test.js.
//
// Most items collide by their bounding box. Curved bars use their real outline
// (see shapes.js) so a stack of bars can nest the way they do on a real sleeve.
import { SNAP_STEP } from './config.js';
import { state, sectionSize, noGoZones, dims, getDef } from './state.js';
import { localOutline, rectOutline, outlinesClash } from './shapes.js';

export function boxesClash(a, b, gap){
  const e = 1e-6;
  return !(a.x + a.w + gap <= b.x + e || b.x + b.w + gap <= a.x + e || a.y + a.h + gap <= b.y + e || b.y + b.h + gap <= a.y + e);
}
// A placed item's outline, in section cm.
export function footprint(p){ return shift(localOutline(getDef(p.item), p.rot), p.x, p.y); }
const shift = (pts, x, y) => pts.map(([px, py]) => [px + x, py + y]);
const zoneOutline = z => rectOutline(z.w, z.h, z.x, z.y);
// Plain boxes need nothing more than the box test.
const isBox = fp => fp.length === 4;
// Bounding boxes first: it's cheap, and most pairs are nowhere near each other.
const itemsClash = (a, b, gap) => boxesClash(a, b, gap) && (isBox(a.fp) && isBox(b.fp) || outlinesClash(a.fp, b.fp, gap));
// Zones with an exact outline (lapels, pockets, cut-aways) are tested against it, not their box.
const zoneClash = (b, z) => boxesClash(b, z, 0) && ((isBox(b.fp) && !z.outline) || outlinesClash(b.fp, z.outline || zoneOutline(z), 0));

export function conflicts(section){
  const { w, h } = sectionSize(section), gap = state.meas.gap, zones = noGoZones(section);
  const list = state.placed.filter(p => p.section === section), bad = new Map();
  const add = (p, why) => { if (!bad.has(p.uid)) bad.set(p.uid, why); };
  const boxes = list.map(p => ({ p, ...dims(p), x:p.x, y:p.y, fp:footprint(p) }));
  for (const b of boxes){
    if (b.x < -1e-6 || b.y < -1e-6 || b.x + b.w > w + 1e-6 || b.y + b.h > h + 1e-6) add(b.p, 'Hangs off the edge of the panel');
    for (const z of zones) if (zoneClash(b, z)) add(b.p, z.reason || `Covers the ${z.label.toLowerCase()}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++){
    const a = boxes[i], b = boxes[j];
    if (itemsClash(a, b, gap)){
      const hard = itemsClash(a, b, 0);
      add(a.p, hard ? `Overlaps ${getDef(b.p.item).name}` : `Closer than ${state.meas.gap} cm to ${getDef(b.p.item).name}`);
      add(b.p, hard ? `Overlaps ${getDef(a.p.item).name}` : `Closer than ${state.meas.gap} cm to ${getDef(a.p.item).name}`);
    }
  }
  return bad;
}
// Nearest free spot to the section's anchor for an iw × ih item. `local` is the
// item's outline (from localOutline); leave it out to treat it as a plain box.
export function findSpot(section, iw, ih, skipUid, local = rectOutline(iw, ih)){
  const { w, h } = sectionSize(section), gap = state.meas.gap, zones = noGoZones(section);
  const others = state.placed.filter(p => p.section === section && p.uid !== skipUid).map(p => ({ x:p.x, y:p.y, ...dims(p), fp:footprint(p) }));
  const anchor = section === 'front' ? { x:w*0.75 - iw/2, y:10 } : section === 'back' ? { x:w/2 - iw/2, y:8 } : { x:w/2 - iw/2, y:4 };
  // On sleeves, items stack down the outer side, so moving sideways costs more than moving down.
  const kx = section === 'leftSleeve' || section === 'rightSleeve' ? 4 : 1;
  // Try grid spots nearest-first and stop at the first free one.
  const spots = [];
  for (let y = 0; y + ih <= h + 1e-6; y += SNAP_STEP)
    for (let x = 0; x + iw <= w + 1e-6; x += SNAP_STEP) spots.push([(kx*(x-anchor.x))**2 + (y-anchor.y)**2, x, y]);
  spots.sort((a, b) => a[0] - b[0]);
  for (const [, x, y] of spots){
    const b = { x, y, w:iw, h:ih, fp:shift(local, x, y) };
    if (zones.some(z => zoneClash(b, z))) continue;
    if (others.some(o => itemsClash(b, o, gap))) continue;
    return { x, y };
  }
  return null;
}
