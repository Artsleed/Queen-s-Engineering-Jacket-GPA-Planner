/* ===================== Fit checking ===================== */
// Pure logic: no DOM. Tested in tests/fit.test.js.
import { SNAP_STEP } from './config.js';
import { state, sectionSize, noGoZones, dims, getDef } from './state.js';

export function boxesClash(a, b, gap){
  const e = 1e-6;
  return !(a.x + a.w + gap <= b.x + e || b.x + b.w + gap <= a.x + e || a.y + a.h + gap <= b.y + e || b.y + b.h + gap <= a.y + e);
}
export function conflicts(section){
  const { w, h } = sectionSize(section), gap = state.meas.gap, zones = noGoZones(section);
  const list = state.placed.filter(p => p.section === section), bad = new Map();
  const add = (p, why) => { if (!bad.has(p.uid)) bad.set(p.uid, why); };
  const boxes = list.map(p => ({ p, ...dims(p), x:p.x, y:p.y }));
  for (const b of boxes){
    if (b.x < -1e-6 || b.y < -1e-6 || b.x + b.w > w + 1e-6 || b.y + b.h > h + 1e-6) add(b.p, 'Hangs off the edge of the panel');
    for (const z of zones) if (boxesClash(b, z, 0)) add(b.p, `Covers the ${z.label.toLowerCase()}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++){
    const a = boxes[i], b = boxes[j];
    if (boxesClash(a, b, gap)){
      const hard = boxesClash(a, b, 0);
      add(a.p, hard ? `Overlaps ${getDef(b.p.item).name}` : `Closer than ${state.meas.gap} cm to ${getDef(b.p.item).name}`);
      add(b.p, hard ? `Overlaps ${getDef(a.p.item).name}` : `Closer than ${state.meas.gap} cm to ${getDef(a.p.item).name}`);
    }
  }
  return bad;
}
export function findSpot(section, iw, ih, skipUid){
  const { w, h } = sectionSize(section), gap = state.meas.gap, zones = noGoZones(section);
  const others = state.placed.filter(p => p.section === section && p.uid !== skipUid).map(p => ({ x:p.x, y:p.y, ...dims(p) }));
  const anchor = section === 'front' ? { x:w*0.75 - iw/2, y:10 } : section === 'back' ? { x:w/2 - iw/2, y:8 } : { x:w/2 - iw/2, y:4 };
  let best = null, bestD = Infinity;
  for (let y = 0; y + ih <= h + 1e-6; y += SNAP_STEP){
    for (let x = 0; x + iw <= w + 1e-6; x += SNAP_STEP){
      const b = { x, y, w:iw, h:ih };
      if (zones.some(z => boxesClash(b, z, 0))) continue;
      if (others.some(o => boxesClash(b, o, gap))) continue;
      const d = (x-anchor.x)**2 + (y-anchor.y)**2;
      if (d < bestD){ bestD = d; best = { x, y }; }
    }
  }
  return best;
}
