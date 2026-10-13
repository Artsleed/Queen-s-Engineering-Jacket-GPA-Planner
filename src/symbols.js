/* ===================== Patch symbols ===================== */
// The pictures on the discipline patches (from the wiki's photos, redrawn as vector
// paths; the photos themselves are never used). Each draws into a box of w x h px, in the
// patch's text colour `fg`, with `cut` erasing (for holes). `d.accent` is a second colour.
//
// Coordinates are fractions of the patch's box. The warning-sign triangles ('hazard'
// shape) have their point at the top, so their pictures sit low and in the middle.

const TAU = Math.PI*2;
function poly(g, pts, w, h){
  g.beginPath(); pts.forEach(([u, v], i) => i ? g.lineTo(u*w, v*h) : g.moveTo(u*w, v*h)); g.closePath();
}
function disc(g, cx, cy, r){ g.beginPath(); g.arc(cx, cy, r, 0, TAU); }
// Draws with `paint`, then erases with `cut`: holes show the patch, not a painted colour.
function erase(g, fn){ g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = g.strokeStyle = '#000'; fn(); g.restore(); }

// A gear: `n` teeth round a rim of radius r, with a hole in the middle.
function gear(g, cx, cy, r, n, rot = 0){
  g.beginPath();
  for (let i = 0; i < n*4; i++){
    const a = rot + i/(n*4)*TAU, out = (i % 4 === 1 || i % 4 === 2) ? r*1.28 : r;
    g.lineTo(cx + Math.cos(a)*out, cy + Math.sin(a)*out);
  }
  g.closePath(); g.fill();
  erase(g, () => { disc(g, cx, cy, r*0.42); g.fill(); });
}

const SYMBOLS = {
  // High voltage: a lightning bolt with an arrowhead.
  bolt(g, w, h){
    poly(g, [[0.46,0.33],[0.56,0.33],[0.49,0.53],[0.6,0.505],[0.545,0.71],[0.585,0.705],[0.505,0.855],[0.45,0.695],[0.495,0.705],[0.53,0.59],[0.395,0.625]], w, h);
    g.fill();
  },
  // Mechanical: two gears meshing, with a hand reaching in from the left.
  gears(g, w, h){
    gear(g, 0.47*w, 0.52*h, 0.07*w, 8, 0.2);
    gear(g, 0.6*w, 0.71*h, 0.085*w, 9);
    // The hand: a sleeve from the bottom left, fingers pointing at the gears.
    poly(g, [[0.2,0.86],[0.24,0.75],[0.33,0.65],[0.42,0.62],[0.47,0.64],[0.43,0.67],[0.47,0.7],[0.42,0.71],[0.45,0.75],[0.38,0.74],[0.33,0.79],[0.3,0.86]], w, h);
    g.fill();
    // Sparks where the fingers meet the teeth.
    g.lineWidth = 0.012*w; g.lineCap = 'round'; g.beginPath();
    for (const [a, b, c, e] of [[0.53,0.56,0.57,0.52],[0.54,0.6,0.59,0.59],[0.52,0.53,0.54,0.47]]){ g.moveTo(a*w, b*h); g.lineTo(c*w, e*h); }
    g.stroke();
  },
  // Oxidizing: a flame over a ring, on a line.
  flame(g, w, h){
    const cx = 0.5*w, cy = 0.7*h, r = 0.1*w;
    g.beginPath();
    g.moveTo(cx - r*1.05, cy);
    g.bezierCurveTo(0.36*w, 0.6*h, 0.38*w, 0.53*h, 0.41*w, 0.49*h);
    g.bezierCurveTo(0.41*w, 0.55*h, 0.43*w, 0.57*h, 0.45*w, 0.58*h);
    g.bezierCurveTo(0.43*w, 0.5*h, 0.47*w, 0.43*h, 0.51*w, 0.37*h);
    g.bezierCurveTo(0.51*w, 0.45*h, 0.54*w, 0.5*h, 0.56*w, 0.55*h);
    g.bezierCurveTo(0.57*w, 0.52*h, 0.58*w, 0.49*h, 0.6*w, 0.47*h);
    g.bezierCurveTo(0.63*w, 0.53*h, 0.64*w, 0.62*h, cx + r*1.05, cy);
    g.closePath(); g.fill();
    erase(g, () => { disc(g, cx, cy, r*1.02); g.fill(); });
    g.lineWidth = 0.022*w; disc(g, cx, cy, r*0.88); g.stroke();
    g.fillRect(0.37*w, 0.855*h, 0.26*w, 0.018*h);
  },
  // Biohazard: three crescents round a ring, cut apart at the middle.
  // Like the standard symbol: each crescent is a circle (radius 1, centred 1 out) with a
  // slightly smaller one (0.8, centred 1.3 out) taken out, so its tips open outward. A ring
  // runs through all three, showing only between them; the middle is a small hole with three
  // slits out from it.
  biohazard(g, w, h){
    const cx = 0.5*w, cy = 0.665*h, u = 0.1*w, dirs = [-90, 30, 150].map(a => a*Math.PI/180);
    const at = (a, r) => [cx + Math.cos(a)*r*u, cy + Math.sin(a)*r*u];
    for (const a of dirs){ disc(g, ...at(a, 1), u); g.fill(); }
    g.lineWidth = u*0.2; disc(g, cx, cy, u*1.05); g.stroke();
    erase(g, () => {
      for (const a of dirs){ disc(g, ...at(a, 1.3), u*0.8); g.fill(); }
      disc(g, cx, cy, u*0.28); g.fill();
      g.lineWidth = u*0.13; g.beginPath();
      for (const a of dirs){ g.moveTo(cx, cy); g.lineTo(...at(a, 0.55)); }
      g.stroke();
    });
  },
  // Geological / mining: a cliff with rocks tumbling down its right side.
  rocks(g, w, h){
    poly(g, [[0.2,0.87],[0.44,0.42],[0.48,0.47],[0.5,0.57],[0.54,0.66],[0.57,0.76],[0.6,0.87]], w, h); g.fill();
    let s = 7;
    const rnd = () => (s = (s*16807) % 2147483647)/2147483647;
    for (const [u, v, r] of [[0.52,0.5,0.028],[0.56,0.58,0.032],[0.6,0.65,0.03],[0.66,0.62,0.024],[0.64,0.74,0.04],[0.72,0.8,0.036],[0.7,0.7,0.022]]){
      g.beginPath();
      for (let i = 0; i < 7; i++){ const a = i/7*TAU, rr = r*w*(0.75 + rnd()*0.4); g.lineTo(u*w + Math.cos(a)*rr, v*h + Math.sin(a)*rr); }
      g.closePath(); g.fill();
    }
  },
  // Eng Phys: a big serif psi.
  psi(g, w, h){
    g.font = `${Math.round(h*0.56)}px Georgia, "Times New Roman", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Ψ', w/2, h*0.53);
  },
  // Apple Math: a black apple with a red leaf, a red infinity loop across it.
  infinitum(g, w, h, d){
    const red = d.accent || '#B3192C';
    g.beginPath();
    g.moveTo(0.5*w, 0.3*h);
    g.bezierCurveTo(0.6*w, 0.2*h, 0.74*w, 0.3*h, 0.7*w, 0.52*h);
    g.bezierCurveTo(0.67*w, 0.7*h, 0.6*w, 0.86*h, 0.53*w, 0.84*h);
    g.bezierCurveTo(0.51*w, 0.83*h, 0.49*w, 0.83*h, 0.47*w, 0.84*h);
    g.bezierCurveTo(0.4*w, 0.86*h, 0.33*w, 0.7*h, 0.3*w, 0.52*h);
    g.bezierCurveTo(0.26*w, 0.3*h, 0.4*w, 0.2*h, 0.5*w, 0.3*h);
    g.closePath(); g.fill();
    g.lineWidth = 0.02*w; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.5*w, 0.3*h); g.quadraticCurveTo(0.5*w, 0.2*h, 0.52*w, 0.15*h); g.stroke();
    g.fillStyle = red; g.beginPath(); g.ellipse(0.58*w, 0.17*h, 0.055*w, 0.03*w, -0.5, 0, TAU); g.fill();
    // The loop (a lemniscate), drawn as a ribbon.
    g.strokeStyle = red; g.lineWidth = 0.045*w; g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i <= 120; i++){
      const t = i/120*TAU, q = 1 + Math.sin(t)**2;
      g.lineTo(0.5*w + 0.38*w*Math.cos(t)/q, 0.56*h + 0.42*h*Math.sin(t)*Math.cos(t)/q);
    }
    g.closePath(); g.stroke();
  },
  // Civil: a suspension bridge (two towers, the cables and the deck), in line art.
  bridge(g, w, h){
    const L = 0.012*w, deck = 0.6*h, top = 0.3*h, t1 = 0.37*w, t2 = 0.66*w, x0 = 0.16*w, x1 = 0.86*w;
    g.lineWidth = L; g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillRect(x0, deck, x1 - x0, L*1.8);
    for (const tx of [t1, t2]){
      g.fillRect(tx - L*1.6, top, L*1.2, 0.72*h - top); g.fillRect(tx + L*0.4, top, L*1.2, 0.72*h - top);
      for (const yy of [top + 0.02*h, top + 0.12*h, top + 0.22*h]) g.fillRect(tx - L*1.6, yy, L*3.2, L*0.8);
    }
    // Main cables: down to each end, and sagging between the towers.
    const sag = (xa, ya, xb, yb, low) => { g.beginPath(); g.moveTo(xa, ya); g.quadraticCurveTo((xa + xb)/2, low, xb, yb); g.stroke(); };
    sag(x0, deck - 0.01*h, t1, top, deck - 0.02*h); sag(t1, top, t2, top, deck + 0.06*h); sag(t2, top, x1, deck - 0.01*h, deck - 0.02*h);
    // Hangers from the middle span's cable to the deck.
    g.lineWidth = L*0.5; g.beginPath();
    for (let i = 1; i < 10; i++){
      const f = i/10, x = t1 + (t2 - t1)*f, y = (1 - f)**2*top + 2*(1 - f)*f*(deck + 0.06*h) + f*f*top;
      g.moveTo(x, y); g.lineTo(x, deck);
    }
    g.stroke();
  },
};
export const SYMBOL_NAMES = Object.keys(SYMBOLS);

// Rendered once per symbol, size and colours, then copied: patches redraw every frame while dragging.
const cache = new Map();
export function drawSymbol(ctx, d, x, y, w, h){
  const fn = SYMBOLS[d.symbol]; if (!fn || w < 2 || h < 2) return;
  const W = Math.ceil(w), H = Math.ceil(h), key = [d.symbol, W, H, d.fg, d.accent].join();
  let c = cache.get(key);
  if (!c){
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = d.fg || '#000';
    fn(g, W, H, d);
    cache.set(key, c); if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  ctx.drawImage(c, x, y, w, h);
}
