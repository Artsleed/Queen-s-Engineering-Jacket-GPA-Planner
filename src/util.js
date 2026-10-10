/* ===================== Helpers ===================== */
export const $ = s => document.querySelector(s);
export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const r1 = v => Math.round(v*10)/10;
export const newId = () => Math.random().toString(36).slice(2,10);

export function hexToRgb(h){
  h = String(h||'#000').replace('#','');
  if (h.length === 3) h = h.split('').map(c => c+c).join('');
  const n = parseInt(h,16) || 0;
  return [(n>>16)&255, (n>>8)&255, n&255];
}
export function shade(h, a){
  const [r,g,b] = hexToRgb(h), t = a < 0 ? 0 : 255, p = Math.abs(a);
  const m = c => Math.round(c + (t-c)*p);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
export function rgbToHex(c){
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const m = String(c).match(/\d+/g); if (!m) return '#000000';
  return '#' + m.slice(0,3).map(x => (+x).toString(16).padStart(2,'0')).join('');
}
