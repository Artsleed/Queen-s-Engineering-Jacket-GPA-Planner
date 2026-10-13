import { test, expect } from '@playwright/test';
import { DEFAULT_MEAS } from '../src/config.js';

// Collects uncaught errors and console errors so any test can assert there were none.
test.beforeEach(async ({ page }, info) => {
  info.errors = [];
  page.on('pageerror', e => info.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') info.errors.push(m.text()); });
  await page.goto('/');
});

test('loads with a working 3D view and no errors', async ({ page }, info) => {
  await expect(page.locator('#tabs .tab')).toHaveCount(4);
  await expect(page.locator('#viewerFail')).toBeHidden();
  // The 3D canvas has drawn something (not fully transparent).
  const drawn = await page.locator('#three').evaluate(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const px = new Uint8Array(4);
    gl.readPixels(c.width >> 1, c.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[3] > 0;
  });
  expect(drawn).toBe(true);
  expect(info.errors).toEqual([]);
});

test('adding, overlapping, undoing and reloading a plan', async ({ page }, info) => {
  const add = page.locator('#btnAdd'), first = page.locator('#itemList .item').first();
  await page.locator('.grp-h').first().click(); // open the first folder
  await first.click();
  await add.click();
  const y1 = await page.locator('#iY').inputValue();
  // The panel now shows the placed bar; picking it in the list again brings back Add.
  await first.click();
  await add.click();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('3'); // two bars plus the year crest
  // Auto-placement keeps the two bars apart.
  await expect(page.locator('#inspector .status')).toHaveText('Fits with room to sew');

  // Move the selected (second) bar onto the first by typing the first one's height.
  const [x2, y2] = [await page.locator('#iX').inputValue(), await page.locator('#iY').inputValue()];
  await page.locator('#iY').fill(y1);
  await page.locator('#iY').press('Enter');
  await expect(page.locator('#inspector .status')).toHaveText(/^(Overlaps|Closer than)/);
  await expect(page.locator('.tab[data-s="front"]')).toHaveClass(/has-issue/);

  await page.locator('#btnUndo').click();
  await expect(page.locator('#inspector .status')).toHaveText('Fits with room to sew');
  await expect(page.locator('#iY')).toHaveValue(y2);

  // Dragging on the mat moves the selected bar.
  const box = await page.locator('#mat').boundingBox();
  const FW = DEFAULT_MEAS.chest / 2, FH = DEFAULT_MEAS.length; // the default front panel, in cm
  const k = Math.max(1, Math.min((box.width - 48) / FW, (box.height - 48) / FH));
  const ox = Math.round((box.width - FW * k) / 2), oy = Math.round((box.height - FH * k) / 2);
  const cx = box.x + ox + (+x2 + 5) * k, cy = box.y + oy + (+y2 + 1.25) * k;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 5 * k, cy + 10 * k, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#iY')).toHaveValue(String(+y2 + 10));

  // The plan survives a reload.
  await expect(page.locator('#saveState')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('3');
  expect(info.errors).toEqual([]);
});

test('searching and filtering the bar list', async ({ page }, info) => {
  await expect(page.locator('.site-foot')).toContainText("Not affiliated with or endorsed by Queen's University");
  // Folders only, all closed, at first; the sheet's bars are all in them.
  const heads = page.locator('.grp-h');
  await expect(page.locator('.grp-items')).toHaveCount(0);
  const total = await heads.evaluateAll(hs => hs.reduce((a, h) => a + +h.dataset.n, 0));
  expect(total).toBeGreaterThan(500);
  // One folder open at a time: opening Flags closes the first.
  await heads.first().click();
  await expect(page.locator('.grp-items')).toHaveCount(1);
  await page.locator('.grp-h[data-g="flag"]').click();
  await expect(page.locator('.grp-items')).toHaveCount(1);
  await expect(page.locator('.grp-h[data-g="flag"]')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.grp-h[data-g="flag"]').click();
  await expect(page.locator('.grp-items')).toHaveCount(0);

  await page.locator('#itemSearch').fill('iron throne');
  await expect(page.locator('#itemList .item')).toHaveText(['Iron Throne']);
  await page.locator('#itemList .item').click();
  await expect(page.locator('#pvName')).toHaveText('Iron Throne');
  await page.locator('#itemSearch').press('Enter'); // Enter adds the first match
  await expect(page.locator('#inspector strong')).toHaveText('Iron Throne');

  await page.locator('#itemSearch').fill('zzzz no such bar');
  await expect(page.locator('#itemList .item')).toHaveCount(0);
  await expect(page.locator('#itemCount')).toHaveText(/^Nothing matches/);
  expect(info.errors).toEqual([]);
});

test('your own items can be edited, added and deleted from the list', async ({ page }, info) => {
  await page.locator('#btnMake').click();
  await page.locator('#mkName').fill('Iron rnig');
  await page.locator('#mkSave').click();
  // Clicking it in the list opens it in the form, ready to fix.
  await page.locator('#itemList .item', { hasText:'Iron rnig' }).click();
  await expect(page.locator('#makerTitle')).toHaveText('Edit your item');
  await expect(page.locator('#mkName')).toHaveValue('Iron rnig');
  await page.locator('#mkName').fill('Iron ring');
  await page.locator('#mkAdd').click(); // keeps the change and adds it
  await expect(page.locator('#inspector strong')).toHaveText('Iron ring');
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('2');
  await expect(page.locator('#itemList .item', { hasText:'Iron rnig' })).toHaveCount(0);
  // Deleting it takes it off the jacket too; Undo brings both back.
  await page.locator('#itemList .item', { hasText:'Iron ring' }).click();
  await page.locator('#mkDelete').click();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('1');
  await expect(page.locator('#itemList .item', { hasText:'Iron ring' })).toHaveCount(0);
  await page.locator('#btnUndo').click();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('2');
  expect(info.errors).toEqual([]);
});

test('a new jacket has its traditional pieces, and the leather colour switches', async ({ page }, info) => {
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('1');
  await expect(page.locator('.tab[data-s="back"] .count')).toHaveText('1');
  await expect(page.locator('.tab[data-s="leftSleeve"] .count')).toHaveText('2');
  await expect(page.locator('.tab[data-s="rightSleeve"] .count')).toHaveText('3');
  await expect(page.locator('.site-foot')).toContainText('A Nathaniel Felsky-Deelstra production');

  const [yellow, purple] = [page.getByRole('button', { name:'Yellow (undyed)' }), page.getByRole('button', { name:'Purple (dyed)' })];
  await expect(yellow).toHaveAttribute('aria-pressed', 'true');
  await purple.click();
  await expect(purple).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnUndo').click();
  await expect(yellow).toHaveAttribute('aria-pressed', 'true');

  // Traditional pieces are always on the jacket, so the picker doesn't offer them.
  await page.locator('#itemSearch').fill('pass crest');
  await expect(page.locator('#btnAdd')).toHaveCount(0);

  // They're fixed: selecting one shows no move or remove controls, and Delete does nothing.
  await page.locator('.tab[data-s="rightSleeve"]').click();
  await page.evaluate(async () => { const { select } = await import('/src/panels.js'); const { state } = await import('/src/state.js'); select(state.placed.find(p => p.item === 'patch-pass').uid); });
  await expect(page.locator('#inspector strong')).toHaveText('Pass crest');
  await expect(page.locator('#iX')).toHaveCount(0);
  await expect(page.locator('#iDel')).toHaveCount(0);
  await page.locator('#mat').press('Delete');
  await expect(page.locator('.tab[data-s="rightSleeve"] .count')).toHaveText('3');

  // Reset asks first.
  await page.locator('#btnReset').click();
  await expect(page.locator('#resetDlg')).toBeVisible();
  await page.locator('#resetNo').click();
  await expect(page.locator('#resetDlg')).toBeHidden();
  expect(info.errors).toEqual([]);
});

test('the wear slider, the big 3D view, and clicking the jacket in 3D', async ({ page }, info) => {
  // Wear: dragging previews, letting go saves, and it survives a reload.
  await page.locator('#wear').fill('1');
  await page.locator('#wear').dispatchEvent('change');
  await expect(page.locator('#saveState')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.locator('#wear')).toHaveValue('1');

  // Expand and close the 3D view.
  await page.locator('#expand').click();
  await expect(page.locator('.viewer')).toHaveClass(/expanded/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.viewer')).not.toHaveClass(/expanded/);

  // Turn to the back and click the middle of the jacket: that's the QUEEN'S APPLIED SCIENCE block.
  await page.locator('.tab[data-s="back"]').click();
  await page.waitForTimeout(1500); // the turn animates
  await page.locator('.tab[data-s="front"]').click(); // leave the back, so the click has to switch to it
  await page.evaluate(() => { const v = window.__V; v.yaw = Math.PI; v.targetYaw = null; v.dirty = true; });
  await page.waitForTimeout(300);
  const box = await page.locator('#three').boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height*0.42);
  await expect(page.locator('.tab[data-s="back"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#inspector strong')).toHaveText("QUEEN'S APPLIED SCIENCE");
  expect(info.errors).toEqual([]);
});

test('a damaged saved plan is kept as a backup, and the planner still starts', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('gpa-planner-v1', '{"v":4, broken'));
  await page.reload();
  await expect(page.locator('#toastMsg')).toContainText("couldn't be read");
  await expect(page.locator('#bootFail')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('gpa-planner-v1-backup'))).toBe('{"v":4, broken');
  expect(info.errors.filter(e => !/Saved plan unreadable/.test(e))).toEqual([]);
});

test('if the app fails to download, an error screen says so', async ({ page, context }) => {
  await context.route('**/src/main.js', r => r.abort());
  await page.reload();
  await expect(page.locator('#bootFail')).toBeVisible();
  await expect(page.locator('#bfTitle')).toHaveText('Part of the planner didn’t download');
});

test.describe('on a phone', () => {
  test.use({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:3 });
  test('stacks flat view, bar list, item panel, 3D view, with the lighter 3D textures', async ({ page }, info) => {
    await expect(page.locator('#three')).toBeVisible();
    const tops = await page.evaluate(() => ['.editor', '.catalog', '.insp-pane', '.viewer'].map(s => document.querySelector(s).getBoundingClientRect().top));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(await page.evaluate(async () => (await import('/src/config.js')).LITE)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(info.errors).toEqual([]);
  });
});
