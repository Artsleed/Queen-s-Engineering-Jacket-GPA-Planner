/* ===================== Pictures ===================== */
import { SECTION_LABEL } from './config.js';
import { $, r1 } from './util.js';
import { current, sel, setSel, sectionSize } from './state.js';
import { drawPanel } from './draw.js';
import { V, render3DNow } from './jacket3d.js';

function saveFile(filename, data){
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function canvasToBlob(c){ return new Promise(r => c.toBlob(r, 'image/png')); }
$('#btnSavePic').onclick = async () => {
  const k = 20, { w, h } = sectionSize(current), pad = 40;
  const c = document.createElement('canvas'); c.width = Math.round(w*k + pad*2); c.height = Math.round(h*k + pad*2 + 30);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#2E5B48'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.save(); ctx.translate(pad, pad); const keep = sel; setSel(null);
  drawPanel(ctx, current, k, { sheen:true, labels:true, guides:true }); setSel(keep); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 18px Archivo, sans-serif'; ctx.textBaseline = 'top';
  ctx.fillText(`${SECTION_LABEL[current]}  (${r1(w)} × ${r1(h)} cm)`, pad, pad + h*k + 10);
  saveFile(`gpa-${current}.png`, await canvasToBlob(c));
};
$('#snapshot').onclick = async () => {
  if (!V.ok) return;
  render3DNow();
  saveFile('gpa-3d.png', await canvasToBlob(V.renderer.domElement));
};
