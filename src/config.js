/* =====================================================================
   DATA — edit these to match the real jacket and the real bars.
   Sizes are in centimetres. Bar sizes and colours below are placeholders.
   ===================================================================== */
// Nathaniel's own GPA, measured flat (converted from inches): 25" armpit to armpit, 26" collar seam
// to hem, 25" sleeve, 3" waistband, 2.5" cuff. The sleeve width is still the old guess (see CLAUDE.md).
export const DEFAULT_MEAS = { chest:127, length:66, sleeve:63.5, sleeveCirc:38, waistband:7.5, cuff:6.5, zipper:3, gap:0.3 };
// Leather colours, matched to photos: undyed GPAs are a khaki yellow, dyed ones a dark purple.
// `worn` is what the leather turns where it rubs: undyed darkens to a patina, purple dye
// wears through to tan (both from Nathaniel's photos).
export const JACKET_COLOURS = [
  { id:'undyed', label:'Yellow (undyed)', color:'#BCA66A', worn:'#8A7746' },
  // Dyeing a jacket also dyes its chenille (the back letters and the year number): the blue
  // goes a deeper blue and the felt backing goes dark purple. Embroidered patches like the mottos and bars don't take the dye (Nathaniel's photos).
  { id:'dyed', label:'Purple (dyed)', color:'#553750', worn:'#7A6247', chenille:{ fg:'#1F3D73', bg:'#1F3D73', backing:'#3A2840', border:'#3A2840' } },
];
// The chenille colours for a jacket colour, if dyeing changes them.
export const dyedChenille = color => JACKET_COLOURS.find(c => c.color.toLowerCase() === String(color).toLowerCase())?.chenille || null;
// wear: 0 new, 1 heavily worn (the slider on the 3D view).
// The lining is grey with a lavender tinge (Nathaniel's own GPA).
export const DEFAULT_JACKET = { color:JACKET_COLOURS[0].color, lining:'#7D7987', wear:0.3 };

// Front details, from Nathaniel's photo of an open GPA (cm, or fractions of the front panel).
// Measured off Nathaniel's photo of a front panel (scaled from a 6 cm waistband).
export const FRONT = {
  pocketLen:14,           // welt pocket length, along its slant
  pocketFromEdge:16.5,    // from the front edge to the pocket's middle
  pocketAboveBand:4.5,    // from the top of the waistband up to the pocket's lower end
  pocketSlant:9,          // degrees off vertical; the top leans toward the front edge
  snapFromEdge:1.8,       // the pair of waistband snaps, in from each front edge
};
// Bars can be sewn on the cuff (Nathaniel's photo), except over the snapped vent by the underarm seam.
export const CUFF_VENT = 4;  // cm each side of the underarm seam

// Chenille lettering on felt backing (from Nathaniel's photos). The back letters are royal
// blue on a dark red-brown backing that shows as a thin edge and fills the letters' holes.
// The year digits look the same as the back letters (Nathaniel).
// Both mottos (Nathaniel's photos): blue band, yellow text and inner line, red felt border.
const MOTTO = { bg:'#2C62B5', fg:'#F2C230', border:'#C8282E' };
// Each year's motto, by the last two digits of the graduating year. Only the ones we know.
export const YEAR_MOTTOS = { '29':'PURPUREUS CORDE, FERREUS VOLUNTATE' };
const BACK_LETTERS = { bg:'#2D3BB5', fg:'#2D3BB5', border:'#6F2427', backing:'#6F2427' };
// Last two digits of the graduating year for this year's first-years (classes start in September).
export function froshYear(now = new Date()){ return String((now.getFullYear() + (now.getMonth() >= 8 ? 4 : 3)) % 100).padStart(2, '0'); }

// A standard bar: a 2.9 cm band (`band`) curved with the ends up, so its bounding box is
// about 12.1 × 4.1 cm. Royal blue felt, red border, gold lettering (from Nathaniel's photos).
export const BAR = { w:12.1, h:4.1, band:2.9, shape:'arc', bg:'#3556A8', fg:'#F2C230', border:'#C0283A' };
// Colour names the bars sheet's colour columns understand (felt and thread shades, not
// screen-bright CSS colours). The sheet can also give a hex code like #1E9E4A.
export const FELT_COLOURS = {
  black:'#1C1C1E', white:'#F4F1EA', grey:'#8A8C8E', gray:'#8A8C8E', silver:'#B9BCC0',
  'royal blue':'#3556A8', blue:'#3556A8', navy:'#1D2D5C', 'light blue':'#7FB2E0', teal:'#1F8A8A',
  green:'#2BA84A', 'dark green':'#1E5E36', lime:'#8CC63F',
  red:'#C0283A', maroon:'#6E1A2C', pink:'#E58FB0', purple:'#5B3A8C', orange:'#E8772E',
  gold:'#F2C230', yellow:'#F5D93A', brown:'#6B4A2E', tan:'#C9A877',
};

// Built-in items that aren't in data/bars.xlsx. The wiki bars come from the sheet (see catalog.js).
// Notes must never say how a bar is earned.
export const PRESETS = [
  // Generic bars
  { id:'bar-frec', cat:'bar', name:'FREC group', text:'FREC GROUP', ...BAR, note:'Traditionally at the bottom right of the back.' },
  { id:'bar-frosh', cat:'bar', name:'Frosh group', text:'FROSH GROUP', ...BAR, note:'Traditionally at the bottom left of the back.' },
  { id:'bar-blank', cat:'bar', name:'Blank bar', text:'BAR', ...BAR, note:'Rename it on the jacket to stand in for any bar.' },
  // Traditional pieces. New jackets start with these in their spots (see layout.js).
  { id:'trad-qas', cat:'patch', name:"QUEEN'S APPLIED SCIENCE", text:'', w:38.6, h:30.5, shape:'qas', ...BACK_LETTERS, trad:true, note:'Upper back. The letters are sewn on as one block.' },
  { id:'trad-uni-motto', cat:'patch', name:'University motto', text:'QUIS-DOLOR-CUI-DOLIUM', w:11.4, h:3.8, shape:'scroll', ...MOTTO, trad:true, note:'Top of the right sleeve.' },
  { id:'bar-discipline', cat:'bar', name:'Discipline', text:'DISCIPLINE', ...BAR, trad:true, note:'Your program. Right sleeve, below the pass crest. Type your discipline on it.' },
  { id:'patch-pass', cat:'patch', name:'Pass crest', text:'PASS', w:6.6, h:9.5, shape:'shield', bg:'#002452', fg:'#EAAA00', border:'#9D1939', trad:true, note:'Right sleeve, below the university motto, after first year.' },
  { id:'trad-year-motto', cat:'patch', name:'Year motto', text:YEAR_MOTTOS[froshYear()] || 'YEAR MOTTO', w:11.4, h:3.8, shape:'scroll', ...MOTTO, trad:true, note:"Top of the left sleeve. Type your year's motto in 'Text on this one'." },
  // Size and look are guesses until Nathaniel measures his; a generic stand-in, not the real crest.
  { id:'trad-year-crest', cat:'patch', name:'Year crest', text:'YEAR\nCREST', w:13, h:15.6, shape:'shield', bg:'#002452', fg:'#EAAA00', border:'#9D1939', trad:true, note:"Front, over the heart (wearer's left)." },
  { id:'patch-year', cat:'patch', name:'Year number', text:froshYear(), w:12, h:9, shape:'chenille', ...BACK_LETTERS, trad:true, note:'Left sleeve, below the year motto: the last two digits of your graduating year.' },
  // Patches
  { id:'patch-dept', cat:'patch', name:'Department crest', text:'ECE', w:7, h:7, shape:'circle', bg:'#FFFFFF', fg:'#002452', border:'#002452', note:'' },
  { id:'patch-club', cat:'patch', name:'Club patch', text:'CLUB', w:7, h:6, shape:'round', bg:'#132039', fg:'#FFFFFF', border:'#EAAA00', note:'Stand-in for a team or club patch.' },
];
// Flag patches: 3.8 cm tall (Nathaniel), 4:3 like the artwork. Every country's flag is in flags.js.
export const FLAG = { w:5.1, h:3.8, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2' };
export const SECTIONS = ['front','back','leftSleeve','rightSleeve'];
export const SECTION_LABEL = { front:'Front', back:'Back', leftSleeve:'Left sleeve', rightSleeve:'Right sleeve' };
export const SNAP_STEP = 0.5;
export const TEX_PX = 12; // texture pixels per cm for the 3D model
