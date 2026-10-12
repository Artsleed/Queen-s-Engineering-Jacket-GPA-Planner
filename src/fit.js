/* ===================== Fit checking ===================== */
// Pure logic: no DOM. Tested in tests/fit.test.js.
//
// Most items collide by their bounding box. Curved bars use their real outline
// (see shapes.js) so a stack of bars can nest the way they do on a real sleeve.
import { SNAP_STEP } from './config.js';
import { state, sectionSize, noGoZones as allZones, dims, getDef } from './state.js';
// Only zones nothing can be sewn on (the cuff band, for one, is drawn as a zone but sewable).
const noGoZones = s => allZones(s).filter(z => !z.sewable);
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
// Why a placed item can't be sewn where it is: the no-go zone it covers, or 'edge' if it
// hangs off the panel. null if it's fine there (overlapping another patch doesn't count).
export function zoneProblem(p){
  const { w, h } = sectionSize(p.section), b = { x:p.x, y:p.y, ...dims(p), fp:footprint(p) };
  if (b.x < -1e-6 || b.y < -1e-6 || b.x + b.w > w + 1e-6 || b.y + b.h > h + 1e-6) return 'edge';
  return noGoZones(p.section).find(z => zoneClash(b, z)) || null;
}
// After a move: if the item ended up somewhere it can't be sewn (the cuff, a pocket, the
// sleeve cap...), put it in the nearest spot that's free. Returns what it was moved off
// (a zone, or 'edge'), or null if it didn't need moving or there's nowhere to put it.
export function settle(p){
  const why = zoneProblem(p);
  if (!why) return null;
  const dm = dims(p), spot = findSpot(p.section, dm.w, dm.h, p.uid, localOutline(getDef(p.item), p.rot), { x:p.x, y:p.y });
  if (!spot) return null;
  p.x = spot.x; p.y = spot.y;
  return why;
}
// A short note for the toast after settle() moved something.
export const settleNote = (p, why) => why === 'edge' ? `Moved ${getDef(p.item).name} back onto the panel.`
  : `Moved ${getDef(p.item).name} off the ${why.label.toLowerCase()}: nothing can be sewn there.`;

// Nearest free spot to the section's anchor for an iw × ih item. `local` is the
// item's outline (from localOutline); leave it out to treat it as a plain box.
// `near` ({ x, y }) searches out from there instead, evenly in every direction.
export function findSpot(section, iw, ih, skipUid, local = rectOutline(iw, ih), near = null){
  const { w, h } = sectionSize(section), gap = state.meas.gap, zones = noGoZones(section);
  const others = state.placed.filter(p => p.section === section && p.uid !== skipUid).map(p => ({ x:p.x, y:p.y, ...dims(p), fp:footprint(p) }));
  const anchor = near || (section === 'front' ? { x:w*0.75 - iw/2, y:10 } : section === 'back' ? { x:w/2 - iw/2, y:8 } : { x:w/2 - iw/2, y:4 });
  // On sleeves, items stack down the outer side, so moving sideways costs more than moving down.
  const kx = !near && (section === 'leftSleeve' || section === 'rightSleeve') ? 4 : 1;
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
