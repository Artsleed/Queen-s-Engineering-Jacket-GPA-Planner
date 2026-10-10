/* ===================== 3D preview ===================== */
// Pinned to three r128 so the jacket looks the same as the original single-file
// app. Newer versions changed colour management and light intensities.
import * as THREE from 'three';
import { SECTIONS, TEX_PX } from './config.js';
import { $, clamp, shade } from './util.js';
import { state, sectionSize } from './state.js';
import { drawPanel } from './draw.js';
import { hitTest } from './editor2d.js';
import { setSection, select } from './panels.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const V = { ok:false, yaw:-0.35, pitch:0.12, dist:17, targetYaw:null, dirty:true, tex:{}, pick:[] };
export function init3D(){
  const canvas = $('#three');
  try {
    V.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, preserveDrawingBuffer:true });
  } catch (e){ $('#viewerFail').style.display = 'flex'; return; }
  V.ok = true;
  V.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V.renderer.outputEncoding = THREE.sRGBEncoding;
  V.scene = new THREE.Scene();
  V.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  V.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4658, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(5, 7, 9); V.scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-6, 3, -8); V.scene.add(rim);
  V.root = new THREE.Group(); V.scene.add(V.root);
  for (const s of SECTIONS){
    const c = document.createElement('canvas');
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.anisotropy = V.renderer.capabilities.getMaxAnisotropy();
    V.tex[s] = { canvas:c, ctx:c.getContext('2d'), t };
  }
  build3D();
  new ResizeObserver(resize3D).observe(canvas);
  resize3D();
  bind3DControls(canvas);
  requestAnimationFrame(loop3D);
}
function disposeTree(o){
  o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && !n.material.map) n.material.dispose(); });
}
export let builtKey = '';
export function build3D(){
  if (!V.ok) return;
  builtKey = JSON.stringify([state.meas, state.jacket]);
  while (V.root.children.length){ const c = V.root.children.pop(); disposeTree(c); }
  V.pick = [];
  const m = state.meas, jc = new THREE.Color(state.jacket.color), lining = new THREE.Color(state.jacket.lining);
  const R = m.chest/(2*Math.PI)/10, Rt = R*0.95, H = m.length/10;
  const jacketMat = new THREE.MeshStandardMaterial({ color:jc, roughness:0.6 });
  const liningMat = new THREE.MeshStandardMaterial({ color:lining, roughness:0.9, side:THREE.BackSide });
  const ribMat = new THREE.MeshStandardMaterial({ color:new THREE.Color(shade(state.jacket.color, -0.3)), roughness:0.85 });
  for (const s of SECTIONS) renderTexture(s);

  const torso = new THREE.Group(); torso.scale.z = 0.62; V.root.add(torso);
  const addPanel = (s, start) => {
    const g = new THREE.CylinderGeometry(Rt, R, H, 64, 1, true, start, Math.PI);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map:V.tex[s].t, roughness:0.6 }));
    mesh.userData.section = s; torso.add(mesh); V.pick.push(mesh);
  };
  addPanel('front', -Math.PI/2); addPanel('back', Math.PI/2);
  torso.add(new THREE.Mesh(new THREE.CylinderGeometry(Rt*0.99, R*0.99, H, 48, 1, true), liningMat));
  const yoke = new THREE.Mesh(new THREE.SphereGeometry(Rt, 64, 16, 0, Math.PI*2, 0, Math.PI/2), jacketMat);
  yoke.scale.y = 0.28; yoke.position.y = H/2; torso.add(yoke);
  const neckY = H/2 + 0.28*Rt*Math.sqrt(1 - 0.38*0.38);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(Rt*0.38, 0.14, 12, 48), ribMat);
  collar.rotation.x = Math.PI/2; collar.position.y = neckY; torso.add(collar);
  const neck = new THREE.Mesh(new THREE.CircleGeometry(Rt*0.37, 40), new THREE.MeshStandardMaterial({ color:lining, roughness:0.9 }));
  neck.rotation.x = -Math.PI/2; neck.position.y = neckY + 0.01; torso.add(neck);

  const rT = m.sleeveCirc/(2*Math.PI)/10, rB = rT*0.8, L = m.sleeve/10;
  for (const [s, side, start] of [['leftSleeve', 1, -Math.PI/2], ['rightSleeve', -1, -Math.PI*1.5]]){
    const pivot = new THREE.Group();
    pivot.position.set(side*(Rt - rT*0.5), H/2 - rT*0.85, 0); pivot.rotation.z = side*0.28;
    const g = new THREE.CylinderGeometry(rT, rB, L, 48, 1, true, start, Math.PI*2);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map:V.tex[s].t, roughness:0.6 }));
    mesh.position.y = -L/2; mesh.userData.section = s; pivot.add(mesh); V.pick.push(mesh);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(rT*0.98, rB*0.98, L, 32, 1, true), liningMat);
    inner.position.y = -L/2; pivot.add(inner);
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(rT, 32, 16), jacketMat));
    V.root.add(pivot);
  }
  V.root.position.y = -0.25;
  V.dirty = true;
}
export function renderTexture(s){
  if (!V.ok) return;
  const T = V.tex[s], { w, h } = sectionSize(s);
  const cw = Math.round(w*TEX_PX), ch = Math.round(h*TEX_PX);
  if (T.canvas.width !== cw || T.canvas.height !== ch){
    T.canvas.width = cw; T.canvas.height = ch;
    T.t.dispose();
  }
  T.ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPanel(T.ctx, s, TEX_PX, { sel:true, selPad:3, selWidth:3 });
  T.t.needsUpdate = true; V.dirty = true;
}
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
function loop3D(){
  requestAnimationFrame(loop3D);
  if (V.targetYaw != null){
    let d = V.targetYaw - V.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.002){ V.yaw = V.targetYaw; V.targetYaw = null; } else V.yaw += d*0.14;
    V.dirty = true;
  }
  if (!V.dirty) return;
  V.root.rotation.set(V.pitch, V.yaw, 0, 'XYZ');
  V.camera.position.set(0, 0.6, V.dist); V.camera.lookAt(0, 0, 0);
  V.renderer.render(V.scene, V.camera);
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
    V.targetYaw = null; V.yaw = down.yaw + dx*0.012; V.pitch = clamp(down.pitch + dy*0.006, -0.6, 0.6); V.dirty = true;
  });
  c.addEventListener('pointerup', ev => { if (down && !down.moved) pick3D(ev); down = null; });
  c.addEventListener('pointercancel', () => { down = null; });
  c.addEventListener('wheel', ev => { ev.preventDefault(); V.dist = clamp(V.dist*(1 + ev.deltaY*0.001), 8, 30); V.dirty = true; }, { passive:false });
}
function pick3D(ev){
  const r = V.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left)/r.width)*2 - 1, -((ev.clientY - r.top)/r.height)*2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, V.camera);
  const hit = ray.intersectObjects(V.pick, false)[0];
  if (!hit || !hit.uv) return;
  const s = hit.object.userData.section, { w, h } = sectionSize(s);
  const p = hitTest(s, hit.uv.x*w, (1 - hit.uv.y)*h);
  setSection(s, false);
  select(p ? p.uid : null);
}
// Renders one frame on demand so the canvas can be saved as a picture.
export function render3DNow(){
  V.root.rotation.set(V.pitch, V.yaw, 0, 'XYZ'); V.renderer.render(V.scene, V.camera);
}
$('#zoomIn').onclick = () => { V.dist = clamp(V.dist*0.85, 8, 30); V.dirty = true; };
$('#zoomOut').onclick = () => { V.dist = clamp(V.dist/0.85, 8, 30); V.dirty = true; };
