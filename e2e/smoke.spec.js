import { test, expect } from '@playwright/test';

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
  const add = page.locator('#btnAdd');
  await add.click();
  const y1 = await page.locator('#iY').inputValue();
  await add.click();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('2');
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
  const k = Math.max(1, Math.min((box.width - 84) / 55, (box.height - 84) / 68)); // default front is 55 × 68 cm
  const ox = Math.round((box.width - 55 * k) / 2), oy = Math.round((box.height - 68 * k) / 2);
  const cx = box.x + ox + (+x2 + 5) * k, cy = box.y + oy + (+y2 + 1.25) * k;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 5 * k, cy + 10 * k, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#iY')).toHaveValue(String(+y2 + 10));

  // The plan survives a reload.
  await expect(page.locator('#saveState')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.locator('.tab[data-s="front"] .count')).toHaveText('2');
  expect(info.errors).toEqual([]);
});
