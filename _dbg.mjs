import { chromium } from '@playwright/test';
const SP = process.argv[2];
const b = await chromium.launch({ headless:true, args:['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--force_high_performance_gpu'] });
const p = await b.newPage({ viewport:{ width:1000, height:800 } });
await p.goto('http://localhost:5199/'); await p.waitForTimeout(2500);
await p.getByRole('button', { name:'Purple (dyed)' }).click(); await p.waitForTimeout(600);
await p.locator('#expand').click(); await p.waitForTimeout(600);
await p.evaluate(() => Object.assign(window.__V, { yaw:-0.25, pitch:0.2, zoom:0.32, look:[-0.04, 0.24], targetYaw:null, dirty:true }));
await p.waitForTimeout(700);
const kinds = await p.evaluate(() => { const out = []; window.__V.root.traverse(n => { if (n.isMesh) out.push((n.material.side === 1 ? 'back' : n.material.metalness > 0.5 ? 'metal' : n.userData.section ? 'panel:' + n.userData.section : 'plain') + ' v' + n.geometry.attributes.position.count); }); return out; });
console.log(kinds.join(' | '));
for (const [name, test] of [['nolining', 'm.side === 1'], ['nometal', 'm.metalness > 0.5'], ['noplain', '!n.userData.section && m.side !== 1 && !(m.metalness > 0.5)']]){
  await p.evaluate(t => { const f = new Function('n', 'm', 'return ' + t); window.__V.root.traverse(n => { if (n.isMesh) n.visible = !f(n, n.material); }); window.__V.dirty = true; }, test);
  await p.waitForTimeout(500); await p.screenshot({ path: `${SP}/dbg-${name}.png` });
  await p.evaluate(() => { window.__V.root.traverse(n => { n.visible = true; }); window.__V.dirty = true; });
}
await b.close();
