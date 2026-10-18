/* ===================== Traditional layout ===================== */
// Where the traditional pieces go. Pure logic: no DOM. Tested in tests/layout.test.js.
//
// Positions are cm from the section's top-left corner (see CLAUDE.md). Sleeves
// are centred on the outer-side line; y = 0 is the shoulder seam.
import { froshYear } from './config.js';
import { topAt } from './zones.js';

const GAP = 1.5;   // cm between stacked sleeve pieces
// The discipline bar sits right up under the pass crest (Nathaniel). The bar's middle dips
// 1.2 cm below its box, just under the crest's point, so the box only needs the usual gap.
const TUCK = 0.3;
const TOP = 3;    // cm from the shoulder seam to the first sleeve piece (at the outer side)
const CAP = 1;     // cm clear of the sleeve cap's curve, where it dips toward the underarm
const BACK_TOP = 7; // cm from the neckline to the top of QUEEN'S (the collar covers the first 5)
const CREST_IN = 12;  // cm from the front's centre line to the middle of the year crest (over the heart)
const CREST_TOP = 18; // cm from the top of the front to the top of the year crest, below the collar point

// item id -> { section, x, y } for a jacket with these measurements.
// `size(id)` gives an item's { w, h } so this file doesn't depend on the catalogue.
export function traditionalSpots(meas, size){
  const sleeveW = meas.sleeveCirc, backW = meas.chest/2, frontW = meas.chest/2;
  const centred = (W, id) => Math.max(0, (W - size(id).w)/2);
  // The first piece on each sleeve sits below the shoulder seam, clear of the cap's curve.
  const first = (section, id) => {
    const x = centred(sleeveW, id), w = size(id).w;
    let top = 0;
    for (let i = 0; i <= 8; i++) top = Math.max(top, topAt(section, meas, x + w*i/8));
    return Math.max(TOP, top + CAP);
  };
  const below = (section, id) => first(section, id) + size(id).h + GAP;
  return {
    'trad-qas':        { section:'back',        x:centred(backW, 'trad-qas'),         y:BACK_TOP },
    'trad-uni-motto':  { section:'rightSleeve', x:centred(sleeveW, 'trad-uni-motto'),  y:first('rightSleeve', 'trad-uni-motto') },
    'patch-pass':      { section:'rightSleeve', x:centred(sleeveW, 'patch-pass'),      y:below('rightSleeve', 'trad-uni-motto') },
    'bar-discipline':  { section:'rightSleeve', x:centred(sleeveW, 'bar-discipline'),  y:below('rightSleeve', 'trad-uni-motto') + size('patch-pass').h + TUCK },
    'trad-year-motto': { section:'leftSleeve',  x:centred(sleeveW, 'trad-year-motto'), y:first('leftSleeve', 'trad-year-motto') },
    'patch-year':      { section:'leftSleeve',  x:centred(sleeveW, 'patch-year'),      y:below('leftSleeve', 'trad-year-motto') },
    // The front's right half is the wearer's left (the heart side).
    'trad-year-crest': { section:'front',       x:frontW/2 + CREST_IN - size('trad-year-crest').w/2, y:CREST_TOP },
  };
}

// The placements a brand-new jacket starts with. `skip` lists item ids already on the jacket.
export function traditionalPlacements(meas, size, newId, skip = new Set()){
  const r1 = v => Math.round(v*10)/10;
  return Object.entries(traditionalSpots(meas, size)).filter(([id]) => !skip.has(id)).map(([item, s]) => ({
    uid:newId(), item, section:s.section, x:r1(s.x), y:r1(s.y), rot:0,
    // The year number is stored, so it doesn't change when the calendar does.
    text: item === 'patch-year' ? froshYear() : null,
  }));
}

// The "Where things go" guide: a labelled box for each spot with a tradition, for the
// overlay drawn by drawPanel (opts.hints). Each is { section, x, y, w, h, label }.
// The sleeve pieces' boxes are their spots above. The lower back, from Nathaniel's photo:
// the flags in a row in the middle of the waistband, the discipline patch centred just above
// it, the frosh group bar on the left and the FREC group bar on the right with the bars that
// go with each stacked above it. A group bar goes on the waistband if the flags leave room
// there, else just above it (with 3 flags there's no room).
const GROUP_IN = 14;     // cm from the back's centre line to the middle of each group bar
const FLAG_GAP = 1.4;    // cm between flags in the row
const PATCH_UP = 4;      // cm from the top of the waistband to the bottom of the discipline patch
const PATCH = { w:7.6, h:6.6 }; // the warning-sign discipline patches
const BAR = { w:12.1, h:4.1 };
const RELATED = 2;       // how many related bars the box above each group bar shows room for
// The traditional pieces that get a box. The grad year, year crest and back letters don't
// (Nathaniel): they're obvious on their own.
const GUIDE_LABEL = {
  'trad-uni-motto':'University motto', 'patch-pass':'Pass crest', 'bar-discipline':'Discipline bar', 'trad-year-motto':'Year motto',
};
// `flags`: how many flags the row on the waistband has (3, the usual, when there are none yet).
export function guideSpots(meas, size, flags = 0){
  const out = Object.entries(traditionalSpots(meas, size)).filter(([id]) => GUIDE_LABEL[id]).map(([id, s]) => ({ ...s, ...size(id), label:GUIDE_LABEL[id] }));
  const W = meas.chest/2, mid = W/2, bandTop = meas.length - meas.waistband;
  const n = flags || 3, fw = n*5.1 + (n - 1)*FLAG_GAP, fh = 3.8;
  // On the waistband if the group bar clears the flag row by a flag gap, else on top of it.
  const onBand = mid - GROUP_IN + BAR.w/2 + FLAG_GAP <= mid - fw/2;
  const groupY = onBand ? bandTop + (meas.waistband - BAR.h)/2 : bandTop - 0.3 - BAR.h;
  const relH = BAR.h + (RELATED - 1)*3.6; // stacked bars nest about 3.6 cm apart
  const relY = (onBand ? bandTop - 0.3 : groupY - 0.2) - relH;
  for (const [x, who] of [[mid - GROUP_IN, 'Frosh'], [mid + GROUP_IN, 'FREC']]){
    out.push({ section:'back', x:x - BAR.w/2, y:groupY, ...BAR, label:`${who} group bar` },
             { section:'back', x:x - BAR.w/2, y:relY, w:BAR.w, h:relH, label:'Related bars' });
  }
  out.push(
    { section:'back', x:mid - fw/2, y:bandTop + (meas.waistband - fh)/2, w:fw, h:fh, label:'Flags' },
    { section:'back', x:mid - PATCH.w/2, y:bandTop - PATCH_UP - PATCH.h, ...PATCH, label:'Discipline patch' },
  );
  return out;
}
