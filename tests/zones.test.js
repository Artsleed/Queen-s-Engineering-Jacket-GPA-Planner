// Checks the no-go zones that come from the 3D model: cut-aways, lapels, the collar and
// the pockets, and that fit checking uses their exact outlines.
import { describe, it, expect } from 'vitest';
import { jacketZones } from '../src/zones.js';
import { DEFAULT_MEAS } from '../src/config.js';
import { setState, normalize, rebuildCatalog } from '../src/state.js';
import { conflicts } from '../src/fit.js';

const BOX = { id:'c-box', cat:'bar', name:'Box', text:'', w:4, h:3, shape:'rect' };
const load = placed => { setState(normalize({ v:3, items:[BOX], placed })); rebuildCatalog(); };
const box = (section, x, y) => ({ uid:'a', item:'c-box', section, x, y, rot:0 });
const kinds = s => jacketZones(s, DEFAULT_MEAS).map(z => z.kind).sort();

describe('jacketZones', () => {
  it('puts lapels, pockets, the opening, the neckline and the waistband on the front', () => {
    expect(kinds('front')).toEqual(['band', 'cutaway', 'lapel', 'lapel', 'opening', 'pocket', 'pocket', 'vent', 'vent']);
  });
  it('puts the collar and waistband on the back', () => expect(kinds('back')).toEqual(['band', 'collar']));
  it('cuts both sides of each sleeve cap away, and has a sewable cuff with a snapped vent', () => {
    expect(kinds('leftSleeve')).toEqual(['band', 'cutaway', 'cutaway', 'vent', 'vent']);
    expect(kinds('rightSleeve')).toEqual(['band', 'cutaway', 'cutaway', 'vent', 'vent']);
    expect(jacketZones('leftSleeve', DEFAULT_MEAS).find(z => z.kind === 'band').sewable).toBe(true);
  });
  it('gives every outline zone a bounding box that holds it', () => {
    for (const s of ['front', 'back', 'leftSleeve', 'rightSleeve']) for (const z of jacketZones(s, DEFAULT_MEAS)) if (z.outline)
      for (const [x, y] of z.outline) expect(x >= z.x - 1e-6 && x <= z.x + z.w + 1e-6 && y >= z.y - 1e-6 && y <= z.y + z.h + 1e-6, `${s} ${z.kind}`).toBe(true);
  });
});

describe('fit checks against the zones', () => {
  it("flags a patch on the sleeve cap as off the jacket", () => {
    load([box('leftSleeve', 0.5, 1)]);
    expect(conflicts('leftSleeve').get('a')).toMatch(/^Off the jacket/);
  });
  it('allows a patch just below the cap', () => {
    load([box('leftSleeve', 17, 6)]);
    expect(conflicts('leftSleeve').size).toBe(0);
  });
  it('allows a flag on the back waistband (they do get sewn there)', () => {
    load([box('back', 10, DEFAULT_MEAS.length - DEFAULT_MEAS.waistband + 1)]);
    expect(conflicts('back').size).toBe(0);
  });
  it('flags a patch over the waistband snaps by the zipper', () => {
    load([box('front', DEFAULT_MEAS.chest/4 + 1.6, DEFAULT_MEAS.length - DEFAULT_MEAS.waistband + 1)]);
    expect(conflicts('front').get('a')).toBe('Covers the waistband snaps');
  });
  it('flags a patch on a lapel', () => {
    load([box('front', DEFAULT_MEAS.chest/4 - 7, 10)]); // clear of the front opening strip
    expect(conflicts('front').get('a')).toBe('Covers the lapel');
  });
  it('uses the slanted pocket outline, not its box', () => {
    const pk = jacketZones('front', DEFAULT_MEAS).find(z => z.kind === 'pocket');
    // The pocket's box is wider than the welt; a patch in the box's empty corner is fine.
    const [tx, ty] = pk.top, corner = tx < pk.bottom[0] ? [pk.x + pk.w - 0.6, pk.y + 0.2] : [pk.x + 0.2, pk.y + 0.2];
    load([{ ...box('front', corner[0] - 0.3, corner[1] - 2.8), uid:'a' }].map(p => ({ ...p, item:'c-tiny' })));
    setState(normalize({ v:3, items:[{ ...BOX, id:'c-tiny', w:0.4, h:2.6 }], placed:[{ uid:'a', item:'c-tiny', section:'front', x:corner[0] - 0.2, y:corner[1] - 2.9, rot:0 }] })); rebuildCatalog();
    expect(conflicts('front').has('a'), `pocket top ${tx},${ty}`).toBe(false);
  });
});

describe('the wear setting (v3)', () => {
  it('gives older plans the default wear', () => expect(normalize({ v:2, jacket:{ color:'#553750' } }).jacket.wear).toBe(0.3));
  it('keeps a saved wear, clamped to 0..1', () => {
    expect(normalize({ v:3, jacket:{ wear:0.8 } }).jacket.wear).toBe(0.8);
    expect(normalize({ v:3, jacket:{ wear:4 } }).jacket.wear).toBe(1);
  });
});
