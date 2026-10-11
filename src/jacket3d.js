/* ===================== 3D preview ===================== */
// The jacket's shape comes from model.js (pure geometry from the measurements). This file
// turns it into three.js meshes, paints each section's textures, lights the scene and
// handles the camera and clicks.
//
// Each section has three canvas maps, all painted from the same drawing code as the
// flat editor, so 2D and 3D can never disagree:
//   colour   drawPanel(): leather, seams, zones, patches
//   bump     grain and creases (leather.js), patches and flaps raised
//   surface  R = clearcoat (glossy leather), G = roughness (felt and chenille are matte)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SECTIONS, TEX_PX } from './config.js';
import { $, clamp } from './util.js';
import { state, sectionSize, noGoZones, getDef, dims, textOf } from './state.js';
import { drawPanel, drawItem } from './draw.js';
import { heightLayer, leatherLayer, grainCanvas } from './leather.js';
import { buildJacket } from './model.js';
import pkg from '../package.json';
import { hitTest } from './editor2d.js';
import { setSection, select } from './panels.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CM = 0.01; // scene units are metres; the model is in cm

export const V = { ok:false, yaw:-0.45, pitch:0.08, zoom:1, baseDist:2, targetYaw:null, dirty:true, tex:{}, pick:[] };
// Dev builds expose the viewer state so screenshot scripts can set the camera angle.
if (import.meta.env?.DEV) window.__V = V;

// Look of the leather. Wear makes it a little rougher and less glossy.
const LOOK = { bump:1.1, clearcoat:0.4, clearcoatRoughness:0.32, roughness:0.45, wornRoughness:0.2, liningRoughness:0.75, thickness:0.45 };

export function init3D(){
  const canvas = $('#three');
  // A dev server started before a three.js upgrade can keep serving its cached old copy,
  // which renders this scene washed out and glittery. Say so instead of showing that.
  const wanted = String(pkg.dependencies.three).split('.')[1];
  if (THREE.REVISION !== wanted){
    const msg = $('#viewerFail');
    msg.textContent = `The 3D view loaded an old copy of three.js (r${THREE.REVISION}, needs r${wanted}). Stop the dev server, run npm run dev again, then refresh with Ctrl+Shift+R.`;
    msg.style.display = 'flex'; return;
  }
  try {
    V.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, preserveDrawingBuffer:true });
  } catch (e){ $('#viewerFail').style.display = 'flex'; return; }
  V.ok = true;
  const R = V.renderer;
  R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // Neutral tone mapping keeps the patch colours true while taming the highlights.
  R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap;
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  // A soft studio for reflections, plus a key light (with shadows), a fill and a rim light.
  const pmrem = new THREE.PMREMGenerator(R);
  V.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
  V.scene.environmentIntensity = 0.38;
  V.scene.add(new THREE.HemisphereLight(0xffffff, 0x3d4350, 0.15));
  const key = new THREE.DirectionalLight(0xfff0dd, 1.7); key.position.set(1.3, 1.9, 2.3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left:-0.7, right:0.7, top:0.7, bottom:-0.7, near:0.5, far:6 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012;
  V.scene.add(key);
  const fill = new THREE.DirectionalLight(0xdde6ff, 0.45); fill.position.set(-2.2, 0.5, 1.4); V.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-0.8, 1.5, -2.4); V.scene.add(rim);
  V.root = new THREE.Group(); V.scene.add(V.root);
  const canvasTex = colour => {
    const c = document.createElement('canvas'), t = new THREE.CanvasTexture(c);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = R.capabilities.getMaxAnisotropy();
    return { canvas:c, ctx:c.getContext('2d'), t };
  };
  for (const s of SECTIONS) V.tex[s] = { ...canvasTex(true), bump:canvasTex(false), surf:canvasTex(false), mask:document.createElement('canvas'), tint:document.createElement('canvas') };
  // Leather for the parts that aren't a section (collar, lapels, edges): the back's own leather.
  V.swatch = new THREE.CanvasTexture(document.createElement('canvas'));
  V.swatch.colorSpace = THREE.SRGBColorSpace; V.swatch.wrapS = V.swatch.wrapT = THREE.MirroredRepeatWrapping;
  V.grain = new THREE.CanvasTexture(grainCanvas()); V.grain.wrapS = V.grain.wrapT = THREE.RepeatWrapping;
  build3D();
  new ResizeObserver(resize3D).observe(canvas);
  resize3D();
  bind3DControls(canvas);
  requestAnimationFrame(loop3D);
}
function disposeTree(o){
  // Textures are kept: they belong to V.tex and are reused by the next build.
  o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
}
export let builtKey = '';
export const buildKeyFor = () => JSON.stringify([state.meas, state.jacket.color, state.jacket.lining]);

/* ----- Geometry from the model ----- */
// A panel grid as a mesh. `offset` moves it in along the normals (for the lining).
function gridGeometry(g, offset = 0){
  const { NU, NV, pos, normal, ao } = g, cols = NU + 1, n = cols*(NV + 1);
  const P = new Float32Array(n*3), N = new Float32Array(n*3), UV = new Float32Array(n*2), C = new Float32Array(n*3);
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++){
    const k = j*cols + i, p = pos[j][i], q = normal[j][i];
    P.set([p[0] - q[0]*offset, p[1] - q[1]*offset, p[2] - q[2]*offset], k*3); N.set(q, k*3);
    UV.set([g.u0 + (g.u1 - g.u0)*i/NU, 1 - j/NV], k*2);
    const a = ao[j][i]; C.set([a, a, a], k*3);
  }
  // Wind the triangles so their front faces point outward (the same way as the normals).
  const mid = [Math.floor(NV/2), Math.floor(NU/2)], p0 = pos[mid[0]][mid[1]], p1 = pos[mid[0]][mid[1] + 1], p2 = pos[mid[0] + 1][mid[1]];
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const cr = [e1[1]*e2[2] - e1[2]*e2[1], e1[2]*e2[0] - e1[0]*e2[2], e1[0]*e2[1] - e1[1]*e2[0]], q = normal[mid[0]][mid[1]];
  const flip = cr[0]*q[0] + cr[1]*q[1] + cr[2]*q[2] < 0, idx = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++){
    const a = j*cols + i, b = a + 1, c = a + cols, d = c + 1;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(idx);
  return geo;
}
// Rows of points (all the same length) as a surface; uv in cm/scale so leather tiles evenly.
function rowsGeometry(rows, scale = 30){
  const R = rows.length, N = rows[0].length, P = [], UV = [], idx = [];
  const along = rows.map(r => { const c = [0]; for (let k = 1; k < N; k++) c.push(c[k - 1] + Math.hypot(...r[k].map((v, a) => v - r[k - 1][a]))); return c; });
  for (let r = 0; r < R; r++) for (let k = 0; k < N; k++){
    P.push(...rows[r][k]);
    const down = r ? Math.hypot(...rows[r][k].map((v, a) => v - rows[r - 1][k][a])) : 0;
    UV.push(along[r][k]/scale, (r === 0 ? 0 : UV[((r - 1)*N + k)*2 + 1]*scale + down)/scale);
  }
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < N - 1; k++){ const a = r*N + k, b = a + 1, c = a + N, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// A rounded edge along a free edge of a panel (hem, cuff, front edge), joining the outside to
// the lining so the leather has thickness. `line` is [[j, i], ...] down the edge;
// `inward` gives the neighbouring point toward the panel's interior.
function edgeRows(g, line, inward, t){
  const out = [], mid = [], inn = [];
  for (const [j, i] of line){
    const p = g.pos[j][i], n = g.normal[j][i], q = g.pos[inward[0](j)][inward[1](i)];
    let e = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; const L = Math.hypot(...e) || 1; e = e.map(v => v/L);
    out.push(p); mid.push([p[0] - n[0]*t/2 + e[0]*t*0.45, p[1] - n[1]*t/2 + e[1]*t*0.45, p[2] - n[2]*t/2 + e[2]*t*0.45]); inn.push([p[0] - n[0]*t, p[1] - n[1]*t, p[2] - n[2]*t]);
  }
  return [out, mid, inn];
}

export function build3D(){
  if (!V.ok) return;
  builtKey = buildKeyFor();
  while (V.root.children.length){ const c = V.root.children.pop(); disposeTree(c); }
  V.pick = [];
  const J = buildJacket(state.meas), t = LOOK.thickness;
  for (const s of SECTIONS) renderTexture(s);
  refreshSwatch();
  const lining = new THREE.Color(state.jacket.lining);
  const panelMat = s => new THREE.MeshPhysicalMaterial({
    map:V.tex[s].t, bumpMap:V.tex[s].bump.t, bumpScale:LOOK.bump, roughnessMap:V.tex[s].surf.t, roughness:1,
    clearcoat:LOOK.clearcoat, clearcoatMap:V.tex[s].surf.t, clearcoatRoughness:LOOK.clearcoatRoughness, vertexColors:true,
  });
  const plainMat = new THREE.MeshPhysicalMaterial({ map:V.swatch, bumpMap:V.grain, bumpScale:LOOK.bump*0.6, roughness:LOOK.roughness, clearcoat:LOOK.clearcoat, clearcoatRoughness:LOOK.clearcoatRoughness, side:THREE.DoubleSide });
  const liningMat = new THREE.MeshStandardMaterial({ color:lining, roughness:LOOK.liningRoughness, side:THREE.BackSide });
  const model = new THREE.Group(); model.scale.setScalar(CM); V.root.add(model);
  const add = (geo, mat, section) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    if (section){ m.userData.section = section; V.pick.push(m); }
    model.add(m); return m;
  };
  const mats = Object.fromEntries(SECTIONS.map(s => [s, panelMat(s)]));
  for (const g of J.panels){
    add(gridGeometry(g), mats[g.section], g.section);
    add(gridGeometry(g, t), liningMat);
    const last = g.NV, cols = g.NU;
    // Free edges get thickness: hems and cuffs (the bottom row), and the two front edges.
    const bottom = Array.from({ length:cols + 1 }, (_, i) => [last, i]);
    add(rowsGeometry(edgeRows(g, bottom, [j => j - 1, i => i], t)), plainMat);
    if (g.section === 'front'){
      const ei = g.u1 === 0.5 ? cols : 0, rows = Array.from({ length:last + 1 }, (_, j) => [j, ei]);
      add(rowsGeometry(edgeRows(g, rows, [j => j, i => i === 0 ? 1 : i - 1], t)), plainMat);
    }
  }
  add(rowsGeometry(J.collar), plainMat);
  for (const l of J.lapels) add(rowsGeometry(l), plainMat);
  // Centre the jacket and frame it.
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  model.position.sub(c);
  V.baseDist = Math.max(size.y*0.62, size.x*0.5)/Math.tan(THREE.MathUtils.degToRad(V.camera.fov/2));
  V.dirty = true;
}

/* ----- Textures ----- */
const grey = v => { const c = Math.round(clamp(v, 0, 1)*255); return `rgb(${c},${c},${c})`; };
function fit(L, cw, ch){ if (L.canvas.width !== cw || L.canvas.height !== ch){ L.canvas.width = cw; L.canvas.height = ch; L.t.dispose(); } }
const polyFill = (ctx, pts, k) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x*k, y*k) : ctx.moveTo(x*k, y*k)); ctx.closePath(); ctx.fill(); };
export function renderTexture(s){
  if (!V.ok) return;
  const T = V.tex[s], { w, h } = sectionSize(s), k = TEX_PX, cw = Math.round(w*k), ch = Math.round(h*k), wear = state.jacket.wear ?? 0;
  fit(T, cw, ch); fit(T.bump, cw, ch); fit(T.surf, cw, ch);
  for (const c of [T.mask, T.tint]) if (c.width !== cw || c.height !== ch){ c.width = cw; c.height = ch; }
  T.ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPanel(T.ctx, s, k, { sel:true, selPad:3, selWidth:3 });

  // Every patch's footprint, in white.
  const mk = T.mask.getContext('2d'); mk.clearRect(0, 0, cw, ch);
  for (const p of state.placed){
    if (p.section !== s) continue;
    const d = getDef(p.item); if (!d) continue;
    const dm = dims(p);
    mk.save(); mk.translate((p.x + dm.w/2)*k, (p.y + dm.h/2)*k); mk.rotate(p.rot*Math.PI/180);
    drawItem(mk, d, textOf(p), -d.w*k/2, -d.h*k/2, d.w*k, d.h*k, { mask:true });
    mk.restore();
  }
  const zones = noGoZones(s);
  // Bump: grain and creases, flaps and welts raised, patches raised more.
  const b = T.bump.ctx;
  b.drawImage(heightLayer(s, state.meas, wear, k, zones.filter(z => z.kind === 'band')), 0, 0);
  b.fillStyle = 'rgba(255,255,255,.22)';
  for (const z of zones) if (z.outline && (z.kind === 'lapel' || z.kind === 'collar' || z.kind === 'pocket')) polyFill(b, z.outline, k);
  b.save(); b.globalAlpha = 0.45; b.drawImage(T.mask, 0, 0); b.restore();
  // Surface: glossy leather (rougher where worn), matte felt.
  const sf = T.surf.ctx, rough = LOOK.roughness + LOOK.wornRoughness*wear;
  sf.fillStyle = `rgb(255,${Math.round(rough*255)},0)`; sf.fillRect(0, 0, cw, ch);
  for (const z of zones) if (z.kind === 'band'){ sf.fillStyle = `rgb(200,${Math.round((rough + 0.1)*255)},0)`; sf.fillRect(z.x*k, z.y*k, z.w*k, z.h*k); }
  const tg = T.tint.getContext('2d'); tg.clearRect(0, 0, cw, ch);
  tg.globalCompositeOperation = 'source-over'; tg.drawImage(T.mask, 0, 0);
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgb(0,235,0)'; tg.fillRect(0, 0, cw, ch);
  sf.drawImage(T.tint, 0, 0);
  T.t.needsUpdate = T.bump.t.needsUpdate = T.surf.t.needsUpdate = true; V.dirty = true;
}
// The collar, lapels and edges use the back's leather, so they wear the same way.
export function refreshSwatch(){
  if (!V.ok) return;
  const img = leatherLayer('back', state.meas, state.jacket); // cached, so the same canvas until something changes
  if (V.swatch.image === img) return;
  V.swatch.image = img; V.swatch.needsUpdate = true; V.dirty = true;
}

/* ----- Camera and interaction ----- */
function resize3D(){
  if (!V.ok) return;
  const c = V.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  V.renderer.setSize(w, h, false); V.camera.aspect = w/h; V.camera.updateProjectionMatrix(); V.dirty = true;
}
export function focusSection(s){
  const yaw = { front:0, back:Math.PI, leftSleeve:-Math.PI/2, rightSleeve:Math.PI/2 }[s];
  if (reduceMotion){ V.yaw = yaw; V.targetYaw = null; V.dirty = true; }
  else V.targetYaw = yaw;
}
function place(){
  V.root.rotation.set(V.pitch, V.yaw, 0, 'XYZ');
  const d = V.baseDist*V.zoom/Math.min(1, V.camera.aspect*1.15);
  V.camera.position.set(0, d*0.04, d); V.camera.lookAt(0, 0, 0);
}
function loop3D(){
  requestAnimationFrame(loop3D);
  if (V.targetYaw != null){
    let d = V.targetYaw - V.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.002){ V.yaw = V.targetYaw; V.targetYaw = null; } else V.yaw += d*0.14;
    V.dirty = true;
  }
  if (!V.dirty) return;
  place(); V.renderer.render(V.scene, V.camera);
  V.dirty = false;
}
function bind3DControls(c){
  let down = null;
  c.addEventListener('pointerdown', ev => { down = { x:ev.clientX, y:ev.clientY, yaw:V.yaw, pitch:V.pitch, moved:false }; c.setPointerCapture(ev.pointerId); });
  c.addEventListener('pointermove', ev => {
    if (!down) return;
    const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
    if (!down.moved) return;
    V.targetYaw = null; V.yaw = down.yaw + dx*0.012; V.pitch = clamp(down.pitch + dy*0.006, -0.5, 0.6); V.dirty = true;
  });
  c.addEventListener('pointerup', ev => { if (down && !down.moved) pick3D(ev); down = null; });
  c.addEventListener('pointercancel', () => { down = null; });
  c.addEventListener('wheel', ev => { ev.preventDefault(); setZoom(V.zoom*(1 + ev.deltaY*0.001)); }, { passive:false });
}
const setZoom = z => { V.zoom = clamp(z, 0.35, 1.6); V.dirty = true; };
function pick3D(ev){
  const r = V.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left)/r.width)*2 - 1, -((ev.clientY - r.top)/r.height)*2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, V.camera);
  const hit = ray.intersectObjects(V.root.children, true).find(h => h.object.userData.section || h.object.material?.side !== THREE.BackSide);
  if (!hit || !hit.object.userData.section || !hit.uv) return;
  const s = hit.object.userData.section, { w, h } = sectionSize(s);
  const p = hitTest(s, hit.uv.x*w, (1 - hit.uv.y)*h);
  setSection(s, false);
  select(p ? p.uid : null);
}
// Renders one frame on demand so the canvas can be saved as a picture.
export function render3DNow(){ place(); V.renderer.render(V.scene, V.camera); }
$('#zoomIn').onclick = () => setZoom(V.zoom*0.85);
$('#zoomOut').onclick = () => setZoom(V.zoom/0.85);
