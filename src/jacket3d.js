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
import { SECTIONS, TEX_PX as FULL_TEX_PX, LITE } from './config.js';
import { $, clamp } from './util.js';
import { state, view, sectionSize, noGoZones, getDef, dims, textOf } from './state.js';
import { drawPanel, drawItem } from './draw.js';
import { heightLayer, leatherLayer, surfaceLayer, grainCanvas } from './leather.js';

// The bump map is finer than the colour map, so the pebble grain shows up close.
// Texture detail, px per cm. The lite view (phones) uses about a quarter of the memory.
const TEX_PX = LITE ? 6 : FULL_TEX_PX, BUMP_PX = LITE ? 8 : 20;
import { buildJacket, applyFolds, VENT, THICK } from './model.js';
import pkg from '../package.json';
import { hitTest } from './editor2d.js';
import { setSection, select } from './panels.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CM = 0.01; // scene units are metres; the model is in cm

export const V = { ok:false, yaw:-0.45, pitch:0.08, zoom:1, baseDist:2, targetYaw:null, dirty:true, tex:{}, pick:[] };
// Dev builds expose the viewer state so screenshot scripts can set the camera angle.
if (import.meta.env?.DEV) window.__V = V;

// Look of the leather. Wear makes it a little rougher and less glossy.
const LOOK = { bump:1.1, clearcoat:0.3, clearcoatRoughness:0.42, roughness:0.5, wornRoughness:0.2, liningRoughness:0.75, thickness:THICK };

export function init3D(force = false){
  const canvas = $('#three');
  // A dev server started before a three.js upgrade can keep serving its cached old copy,
  // which renders this scene washed out and glittery. Say so instead of showing that.
  const wanted = String(pkg.dependencies.three).split('.')[1];
  if (THREE.REVISION !== wanted){
    return viewerNote(`The 3D view loaded an old copy of three.js (r${THREE.REVISION}, needs r${wanted}). Stop the dev server, run npm run dev again, then refresh with Ctrl+Shift+R.`);
  }
  // A 3D view that crashed the page last time starts paused (see guard3D), so one crash
  // doesn't become a crash loop (and Chrome doesn't switch 3D off for the site).
  if (!force && crashedLastTime()){
    return viewerNote('The 3D view closed unexpectedly last time, so it’s paused. The flat editor works as normal.', 'Start the 3D view', () => { viewerNote(null); init3D(true); });
  }
  // Ask for the full set-up, then the safest one (no antialiasing, low power) if that's refused.
  let err = null;
  const make = opts => { try { return new THREE.WebGLRenderer({ canvas, alpha:true, ...opts }); } catch (e){ err = e; return null; } };
  V.renderer = make({ antialias:!LITE, preserveDrawingBuffer:!LITE, powerPreference:LITE ? 'low-power' : 'default' })
    || make({ antialias:false, powerPreference:'low-power' });
  if (!V.renderer){
    console.error('3D view failed to start', err);
    return viewerNote(`The 3D preview couldn’t start in this browser (${String(err && err.message || 'WebGL unavailable').slice(0, 90)}). The flat editor still works. If it worked here before, close the browser completely and open it again: after a crash, Chrome switches 3D off for a site until it restarts.`);
  }
  V.ok = true;
  const R = V.renderer;
  guard3D();
  // If the device takes the graphics memory back, say so instead of leaving a blank box.
  // Phones rarely give it back, so offer a restart (a reload, as the 3D view's state is gone).
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); V.lost = true;
    viewerNote('The 3D view stopped because this device ran low on memory. The flat editor still works, and your plan is saved.', 'Restart the 3D view', () => { clearGuard(); location.reload(); });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    V.lost = false; viewerNote(null);
    for (const s of SECTIONS) if (V.tex[s]) renderTexture(s);
    V.swatch.image = null; refreshSwatch(); V.grain.needsUpdate = true; V.dirty = true;
  });
  R.setPixelRatio(Math.min(LITE ? 1.5 : 2, window.devicePixelRatio || 1));
  // Neutral tone mapping keeps the patch colours true while taming the highlights.
  R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1;
  // Phones skip the real-time shadow (its map and extra pass); the baked shading stays.
  R.shadowMap.enabled = !LITE; R.shadowMap.type = THREE.PCFShadowMap;
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  // A soft studio for reflections, plus a key light (with shadows), a fill and a rim light.
  const pmrem = new THREE.PMREMGenerator(R);
  V.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
  V.scene.environmentIntensity = 0.38;
  V.scene.add(new THREE.HemisphereLight(0xffffff, 0x3d4350, 0.15));
  const key = new THREE.DirectionalLight(0xfff0dd, 1.7); key.position.set(1.3, 1.9, 2.3);
  key.castShadow = !LITE; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4;
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
    t.anisotropy = Math.min(LITE ? 4 : 16, R.capabilities.getMaxAnisotropy());
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
// A message over the 3D view (null hides it), with an optional button.
function viewerNote(text, label, onClick){
  const el = $('#viewerFail');
  if (text == null){ el.style.display = 'none'; return; }
  el.replaceChildren(Object.assign(document.createElement('p'), { textContent:text }));
  if (label){ const b = Object.assign(document.createElement('button'), { className:'btn', type:'button', textContent:label }); b.onclick = onClick; el.append(b); }
  el.style.display = 'flex';
}
// Crash guard: a flag in localStorage is set while the 3D view is running and on screen, and
// cleared when the page is hidden or closed. If it's still set when the page loads, the page
// died with the 3D view running (a phone out of memory), so the 3D view starts paused.
const GUARD = 'gpa-planner-3d-running';
const crashedLastTime = () => { try { return localStorage.getItem(GUARD) === '1'; } catch (e){ return false; } };
const setGuard = () => { try { localStorage.setItem(GUARD, '1'); } catch (e){} };
const clearGuard = () => { try { localStorage.removeItem(GUARD); } catch (e){} };
function guard3D(){
  setGuard();
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearGuard(); else if (V.ok && !V.lost) setGuard(); });
  window.addEventListener('pagehide', clearGuard);
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
  // Where each column's real top edge is (rows above it pile up at a cut-away). An offset
  // shell (the lining) eases back to the leather over the top few rows, so the top edge is
  // closed and nothing pokes out at the neckline or the armhole.
  // Measured in cm from the exact top edge (g.tops), so the taper is smooth from column to column.
  const H = sectionSize(g.section).h;
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++){
    // Using the deepest top among the neighbouring columns keeps the lining flush with the
    // leather wherever the grid steps along the neckline, so the steps stay hidden.
    // The torso's rows reach its top edge in every column (the neckline is squeezed, not
    // cut), so it just eases in over the first rows. The sleeves still cut the cap away.
    const sleeve = g.section === 'leftSleeve' || g.section === 'rightSleeve';
    const top = Math.max(g.tops[Math.max(0, i - 1)], g.tops[i], g.tops[Math.min(NU, i + 1)]);
    const ease = sleeve ? (H*j/NV - top - 2)/4 : j/5;
    const k = j*cols + i, p = pos[j][i], q = normal[j][i], off = offset*Math.min(1, Math.max(0, ease));
    P.set([p[0] - q[0]*off, p[1] - q[1]*off, p[2] - q[2]*off], k*3); N.set(q, k*3);
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

// A surface given thickness: the surface itself, a copy `t` underneath, and rounded strips
// joining them along the last row and both end columns. `cy` is a height below the surface,
// used to tell which side is the outside.
function thickRows(rows, t, cy){
  const R = rows.length, N = rows[0].length, P = (r, k) => rows[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(N - 1, k))];
  const raw = rows.map((row, r) => row.map((p, k) => {
    const a = P(r, k + 1), b = P(r, k - 1), c = P(r + 1, k), d = P(r - 1, k);
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    const n = [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]], L = Math.hypot(...n) || 1;
    return n.map(x => x/L);
  }));
  // Pick the outside once for the whole surface, by the last row (it lies on the jacket, facing
  // out), not point by point: a collar's stand faces the neck, so a per-point test flips it
  // part way round the fold and the underside pokes through the top in shards.
  let vote = 0;
  raw[R - 1].forEach((n, k) => { const p = rows[R - 1][k]; vote += Math.sign(n[0]*p[0] + n[1]*(p[1] - cy) + n[2]*p[2]); });
  const s = vote < 0 ? -t : t;
  const under = rows.map((row, r) => row.map((p, k) => { const n = raw[r][k]; return [p[0] - n[0]*s, p[1] - n[1]*s, p[2] - n[2]*s]; }));
  const strip = (outer, inner, normals) => [outer, outer.map((p, i) => { const n = normals[i], q = inner[i]; return [(p[0] + q[0])/2 + n[0]*0, (p[1] + q[1])/2, (p[2] + q[2])/2]; }), inner];
  const roll = (outer, inner) => {
    // Push the middle row outward (away from the surface's interior) so the edge is rounded.
    const mid = outer.map((p, i) => {
      const q = inner[i], c = outer[Math.min(outer.length - 1, i)], back = rows[R > 1 ? R - 2 : 0][i] || c;
      return [(p[0] + q[0])/2 + (p[0] - back[0])*0.15, (p[1] + q[1])/2 + (p[1] - back[1])*0.15, (p[2] + q[2])/2 + (p[2] - back[2])*0.15];
    });
    return [outer, mid, inner];
  };
  const last = R - 1, col = (A, k) => A.map(row => row[k]);
  return [rowsGeometry(rows), rowsGeometry(under), rowsGeometry(roll(rows[last], under[last])),
    rowsGeometry(strip(col(rows, 0), col(under, 0), col(rows, 0).map(() => [0, 0, 0]))),
    rowsGeometry(strip(col(rows, N - 1), col(under, N - 1), col(rows, 0).map(() => [0, 0, 0])))];
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
  const zipMat = new THREE.MeshStandardMaterial({ color:0xb8bdc4, metalness:0.85, roughness:0.35, side:THREE.DoubleSide });
  const model = new THREE.Group(); model.scale.setScalar(CM); V.root.add(model);
  const add = (geo, mat, section) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    if (section){ m.userData.section = section; V.pick.push(m); }
    model.add(m); return m;
  };
  const mats = Object.fromEntries(SECTIONS.map(s => [s, panelMat(s)]));
  V.panels = [];
  for (const g of J.panels){
    V.panels.push({ g, mesh:add(gridGeometry(g), mats[g.section], g.section) });
    add(gridGeometry(g, t), liningMat);
    const last = g.NV, cols = g.NU;
    // Free edges get thickness: hems and cuffs (the bottom row), and the two front edges.
    const bottom = Array.from({ length:cols + 1 }, (_, i) => [last, i]);
    add(rowsGeometry(edgeRows(g, bottom, [j => j - 1, i => i], t)), plainMat);
    if (g.section === 'leftSleeve' || g.section === 'rightSleeve'){
      // The open cuff vent: both edges get thickness, from where the slit starts to the cuff edge.
      const j0 = Math.max(0, Math.floor(g.NV*(1 - VENT.len/state.meas.sleeve)) - 1), rows = Array.from({ length:last - j0 + 1 }, (_, k) => k + j0);
      add(rowsGeometry(edgeRows(g, rows.map(j => [j, 0]), [j => j, () => 1], t)), plainMat);
      add(rowsGeometry(edgeRows(g, rows.map(j => [j, cols]), [j => j, () => cols - 1], t)), plainMat);
    }
    if (g.section === 'front'){
      const ei = g.u1 === 0.5 ? cols : 0, rows = Array.from({ length:last + 1 }, (_, j) => [j, ei]);
      add(rowsGeometry(edgeRows(g, rows, [j => j, i => i === 0 ? 1 : i - 1], t)), zipMat);
    }
  }
  // The collar has thickness too: its underside, and a rounded edge all round its outside.
  for (const geo of thickRows(J.collar, t*0.6, J.dims.yNs - 25)) add(geo, plainMat);
  for (const s of SECTIONS) flattenUnderPatches(s);
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
  const bw = Math.round(w*BUMP_PX), bh = Math.round(h*BUMP_PX);
  fit(T, cw, ch); fit(T.bump, bw, bh); fit(T.surf, cw, ch);
  for (const c of [T.mask, T.tint]) if (c.width !== cw || c.height !== ch){ c.width = cw; c.height = ch; }
  T.ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPanel(T.ctx, s, k, { sel:true, selPad:3, selWidth:3, hints:view.hints });

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
  b.drawImage(heightLayer(s, state.meas, wear, BUMP_PX, zones.filter(z => z.kind === 'band')), 0, 0);
  b.fillStyle = 'rgba(255,255,255,.22)';
  for (const z of zones) if (z.outline && (z.kind === 'lapel' || z.kind === 'collar' || z.kind === 'pocket')) polyFill(b, z.outline, BUMP_PX);
  const tgb = T.tint.getContext('2d'); tgb.clearRect(0, 0, cw, ch);
  tgb.globalCompositeOperation = 'source-over'; tgb.drawImage(T.mask, 0, 0);
  tgb.globalCompositeOperation = 'source-in'; tgb.fillStyle = 'rgb(176,176,176)'; tgb.fillRect(0, 0, cw, ch);
  b.drawImage(T.tint, 0, 0, bw, bh);
  // Surface: satin leather, matte where the finish has worn off (leather.js), matte felt.
  const sf = T.surf.ctx, rough = LOOK.roughness + LOOK.wornRoughness*wear;
  sf.imageSmoothingEnabled = true; sf.drawImage(surfaceLayer(s, state.meas, wear, LOOK.roughness), 0, 0, cw, ch);
  for (const z of zones) if (z.kind === 'band'){ sf.fillStyle = `rgb(200,${Math.round((rough + 0.1)*255)},0)`; sf.fillRect(z.x*k, z.y*k, z.w*k, z.h*k); }
  const tg = T.tint.getContext('2d'); tg.clearRect(0, 0, cw, ch);
  tg.globalCompositeOperation = 'source-over'; tg.drawImage(T.mask, 0, 0);
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgb(0,235,0)'; tg.fillRect(0, 0, cw, ch);
  sf.drawImage(T.tint, 0, 0);
  T.t.needsUpdate = T.bump.t.needsUpdate = T.surf.t.needsUpdate = true; V.dirty = true;
  flattenUnderPatches(s);
}
// Felt patches are stiff: the leather under them doesn't fold. Flatten the folds under each
// patch whenever a section's patches change. It follows the patches' real shapes (the mask
// renderTexture just drew, blurred for a soft edge), not their boxes, which showed as
// rectangles round each patch; QUEEN'S APPLIED SCIENCE is letters, not a 38 x 30 cm slab.
const COVER_PX = 2; // px per cm for the coverage map
function flattenUnderPatches(s){
  if (!V.panels) return;
  const { w:W, h:H } = sectionSize(s), T = V.tex[s];
  const items = state.placed.filter(p => p.section === s).map(p => [p.item, p.x, p.y, p.rot, p.text]), key = JSON.stringify(items);
  if (V.panels.every(P => P.g.section !== s || P.key === key)) return;
  const cw = Math.max(1, Math.round(W*COVER_PX)), ch = Math.max(1, Math.round(H*COVER_PX));
  const c = T.cover || (T.cover = document.createElement('canvas'));
  if (c.width !== cw || c.height !== ch){ c.width = cw; c.height = ch; }
  const cx = c.getContext('2d', { willReadFrequently:true });
  cx.clearRect(0, 0, cw, ch); cx.filter = `blur(${COVER_PX*0.6}px)`;
  if (T.mask.width) cx.drawImage(T.mask, 0, 0, cw, ch);
  cx.filter = 'none';
  const px = cx.getImageData(0, 0, cw, ch).data;
  const cover = (x, y) => { const X = Math.min(cw - 1, Math.max(0, Math.round(x*COVER_PX))), Y = Math.min(ch - 1, Math.max(0, Math.round(y*COVER_PX))); return px[(Y*cw + X)*4 + 3]/255; };
  for (const P of V.panels){
    const g = P.g;
    if (g.section !== s || P.key === key) continue;
    P.key = key;
    applyFolds(g, (j, i) => 1 - 0.92*Math.min(1, cover((g.u0 + (g.u1 - g.u0)*i/g.NU)*W, H*j/g.NV)*1.5));
    const pos = P.mesh.geometry.attributes.position, nor = P.mesh.geometry.attributes.normal, cols = g.NU + 1;
    for (let j = 0; j <= g.NV; j++) for (let i = 0; i <= g.NU; i++){ const k = j*cols + i; pos.setXYZ(k, ...g.pos[j][i]); nor.setXYZ(k, ...g.normal[j][i]); }
    pos.needsUpdate = nor.needsUpdate = true; P.mesh.geometry.computeBoundingSphere();
  }
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
  // `look` (metres, screen-aligned) shifts the view; only screenshot scripts set it for now.
  const [lx, ly] = V.look || [0, 0];
  V.camera.position.set(lx, ly + d*0.04, d); V.camera.lookAt(lx, ly, 0);
}
function loop3D(){
  requestAnimationFrame(loop3D);
  if (V.targetYaw != null){
    let d = V.targetYaw - V.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.002){ V.yaw = V.targetYaw; V.targetYaw = null; } else V.yaw += d*0.14;
    V.dirty = true;
  }
  if (!V.dirty || V.lost) return;
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
