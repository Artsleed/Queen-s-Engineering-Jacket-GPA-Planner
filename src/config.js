/* =====================================================================
   DATA — edit these to match the real jacket and the real bars.
   Sizes are in centimetres. Bar sizes and colours below are placeholders.
   ===================================================================== */
export const DEFAULT_MEAS = { chest:110, length:68, sleeve:64, sleeveCirc:38, waistband:6, cuff:6, zipper:3, gap:0.3 };
export const DEFAULT_JACKET = { color:'#D4A017', lining:'#1B2A45' };

export const PRESETS = [
  // Bars
  { id:'bar-wizard', cat:'bar', name:'Wizard', text:'WIZARD', w:10, h:2.5, shape:'rect', bg:'#002452', fg:'#EAAA00', border:'#EAAA00', note:'Build a staff out of beers as tall as you are.' },
  { id:'bar-frec', cat:'bar', name:'Frec', text:'FREC', w:10, h:2.5, shape:'rect', bg:'#9D1939', fg:'#FFFFFF', border:'#EAAA00', note:'Orientation leader.' },
  { id:'bar-discipline', cat:'bar', name:'Discipline', text:'COMPUTER', w:10, h:2.5, shape:'rect', bg:'#FFFFFF', fg:'#002452', border:'#002452', note:'Your program of study. Edit the text per placement.' },
  { id:'bar-frosh', cat:'bar', name:'Frosh group', text:'FROSH GROUP', w:10, h:2.5, shape:'rect', bg:'#002452', fg:'#FFFFFF', border:'#9D1939', note:'Usually on the back, below the EngSoc crest.' },
  { id:'bar-blank', cat:'bar', name:'Blank bar', text:'BAR', w:10, h:2.5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#132039', note:'Rename it on the jacket to stand in for any bar.' },
  // Patches
  { id:'patch-pass', cat:'patch', name:'Pass crest', text:'PASS', w:8, h:8, shape:'circle', bg:'#002452', fg:'#EAAA00', border:'#9D1939', note:'Goes on the right shoulder after first year.' },
  { id:'patch-engsoc', cat:'patch', name:'EngSoc crest', text:'ENGSOC', w:9, h:10, shape:'shield', bg:'#9D1939', fg:'#EAAA00', border:'#EAAA00', note:'Usually on the back, above the frosh group bar.' },
  { id:'patch-year', cat:'patch', name:'Year number', text:'29', w:9, h:7, shape:'text', bg:'#EAAA00', fg:'#002452', border:'#EAAA00', note:'Your graduating year, traditionally on the left sleeve.' },
  { id:'patch-dept', cat:'patch', name:'Department crest', text:'ECE', w:7, h:7, shape:'circle', bg:'#FFFFFF', fg:'#002452', border:'#002452', note:'' },
  { id:'patch-club', cat:'patch', name:'Club patch', text:'CLUB', w:7, h:6, shape:'round', bg:'#132039', fg:'#FFFFFF', border:'#EAAA00', note:'Stand-in for a team or club patch.' },
  // Flags
  { id:'flag-ca', cat:'flag', name:'Canada', text:'', w:8, h:4, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'canada'} },
  { id:'flag-fr', cat:'flag', name:'France', text:'', w:7.5, h:5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'v', colors:['#0055A4','#FFFFFF','#EF4135']} },
  { id:'flag-it', cat:'flag', name:'Italy', text:'', w:7.5, h:5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'v', colors:['#009246','#FFFFFF','#CE2B37']} },
  { id:'flag-ie', cat:'flag', name:'Ireland', text:'', w:8, h:4, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'v', colors:['#169B62','#FFFFFF','#FF883E']} },
  { id:'flag-de', cat:'flag', name:'Germany', text:'', w:7.5, h:4.5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'h', colors:['#000000','#DD0000','#FFCE00']} },
  { id:'flag-nl', cat:'flag', name:'Netherlands', text:'', w:7.5, h:5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'h', colors:['#AE1C28','#FFFFFF','#21468B']} },
  { id:'flag-ua', cat:'flag', name:'Ukraine', text:'', w:7.5, h:5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'h', colors:['#0057B7','#FFD700']} },
  { id:'flag-ng', cat:'flag', name:'Nigeria', text:'', w:8, h:4, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'v', colors:['#008751','#FFFFFF','#008751']} },
  { id:'flag-jp', cat:'flag', name:'Japan', text:'', w:7.5, h:5, shape:'rect', bg:'#FFFFFF', fg:'#132039', border:'#C8CCD2', flag:{type:'disc', colors:['#FFFFFF','#BC002D']} },
];
export const CATS = [['bar','Bars'],['patch','Patches'],['flag','Flags']];
export const SECTIONS = ['front','back','leftSleeve','rightSleeve'];
export const SECTION_LABEL = { front:'Front', back:'Back', leftSleeve:'Left sleeve', rightSleeve:'Right sleeve' };
export const SNAP_STEP = 0.5;
export const TEX_PX = 12; // texture pixels per cm for the 3D model
