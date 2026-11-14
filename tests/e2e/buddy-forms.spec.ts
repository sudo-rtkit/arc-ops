import { expect, test } from '@playwright/test';

for (const lang of ['cs', 'en']) test(`five selectable forms persist and render (${lang})`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(lang => {
    if (sessionStorage.getItem('body-seeded')) return;
    sessionStorage.setItem('body-seeded', '1');
    localStorage.setItem('arcops:state', JSON.stringify({ settings: { lang }, profile: { level: 1 } }));
  }, lang);
  await page.goto('/#settings/wardrobe');
  const picker = page.getByTestId('ops-body-picker');
  await expect(picker.locator('input[type=radio]')).toHaveCount(6);
  for (const form of ['rookie', 'explorer', 'scavenger', 'veteran', 'legend']) {
    await picker.locator(`input[value="${form}"]`).check();
    const canvas = page.locator('.ops-preview canvas');
    await expect(canvas).toHaveAttribute('data-form', form);
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let pixels = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) pixels++;
      return pixels;
    })).toBeGreaterThan(400);
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state')!).buddy?.form)).toBe('legend');
  await page.reload();
  await expect(picker.locator('input[value="legend"]')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state')!).profile.level)).toBe(1);
  await picker.locator('input[value="auto"]').check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state')!).buddy?.form ?? 'auto')).toBe('auto');
  await expect(page.locator('.ops-preview canvas')).toHaveAttribute('data-form', 'auto');
  expect(errors).toEqual([]);
});
