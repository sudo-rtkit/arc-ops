/* Milník 5: Nastavení „Buddy a zkratka“ (výchozí vypnuto, zkratka, velikost), Šatník Opse a overlay jako samostatná
   stránka s kopií stavu z hlavního okna (BroadcastChannel místo událostí Tauri). Zápis ze snímku a odškrtnutí úkolu
   z overlaye projdou hlavním oknem. Snímek dodá test (dekódovaný testovací PNG), aplikace v prohlížeči nic nesnímá.
   V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('../fixtures/vision/', import.meta.url));
const TOOLTIP = readFileSync(FIX + 'sample-stash-all-tooltip-1080p.png').toString('base64');
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
/* Stav schématu 5 (před milníkem 5): načte se migrací 5 → 6 s vypnutým buddym. */
const seed = (lang: 'cs' | 'en', enabled = false) => ({
  schema: 5,
  profile: { level: 23, coins: 51060, rounds: 40 },
  inventory: { 'Metal Parts': 12, 'Rubber Parts': 3 },
  ...(enabled ? { buddy: { enabled: true } } : {}),
  settings: { autoSnapshot: true, lang },
});
async function start(page: Page, lang: 'cs' | 'en', enabled = false) {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('m5-seeded')) return;
    sessionStorage.setItem('m5-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify(seed(lang, enabled)));
  await page.goto('/');
}
/* Testovací snímek do hubu hlavního okna (stejná cesta jako snímek ze zkratky, jen bez Rustu). */
async function capture(page: Page, b64: string | null) {
  return page.evaluate(async (data) => {
    let w = 640, h = 360, px: Uint8ClampedArray;
    if (data) {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      w = bmp.width; h = bmp.height;
      const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      px = ctx.getImageData(0, 0, w, h).data;
    } else px = new Uint8ClampedArray(w * h * 4).fill(30);
    return (window as unknown as { __opsTest: { capture: (w: number, h: number, d: ArrayLike<number>) => string } }).__opsTest.capture(w, h, px);
  }, b64);
}
/* Ops je na plátně opravdu nakreslený (neprůhledné pixely). */
const opaquePixels = (page: Page, sel: string) => page.locator(sel).first().evaluate((c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++;
  return n;
});

const T = {
  cs: {
    switch: 'Zapnout buddyho Opse, overlay a snímek na zkratku', off: 'Vypnuto: neběží žádné okno, zkratka ani hlídání hry.', setKey: 'Nastavit zkratku',
    scale2: '2× (128 px)', wardrobe: 'Šatník Opse', form: 'Podoba: Průzkumník · level 23', antenna: 'Anténa', none: 'Bez dílu', auto: 'Vše automaticky',
    doneAria: 'Označit jako hotový', title: 'Polní konzole', overview: 'Přehled', quests: 'Úkoly', shop: 'Nákupy', scan: 'Ze snímku', done: 'Hotovo', nothing: 'Na snímku není inventář',
    write: /Potvrdit a zapsat \d+ řádk/, written: /Zapsáno: \d+ materiál/, coins: '51 060',
  },
  en: {
    switch: 'Turn on the Ops buddy, overlay and hotkey capture', off: 'Off: no window, hotkey or game detection is running.', setKey: 'Set hotkey',
    scale2: '2× (128 px)', wardrobe: 'Ops wardrobe', form: 'Form: Explorer · level 23', antenna: 'Antenna', none: 'No part', auto: 'All automatic',
    doneAria: 'Mark as done', title: 'Field console', overview: 'Overview', quests: 'Quests', shop: 'Shopping', scan: 'From capture', done: 'Done', nothing: 'No inventory on the capture',
    write: /Confirm and write \d+ rows?/, written: /Written: \d+ material/, coins: '51,060',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test.describe(`Milník 5 (${lang})`, () => {
    test('Nastavení: výchozí vypnuto, zapnutí, zkratka, velikost, vypnutí', async ({ page }) => {
      const errors = watchErrors(page);
      await start(page, lang);
      await page.goto('/#settings');
      const sw = page.getByTestId('ops-switch');
      await expect(sw).not.toBeChecked();
      await expect(page.getByTestId('ops-off')).toHaveText(L.off);
      await page.getByLabel(L.switch).check();
      await expect(page.getByTestId('ops-options')).toBeVisible();
      await page.getByRole('button', { name: L.setKey }).click();
      await page.keyboard.press('Control+Shift+KeyS');
      await expect(page.getByTestId('ops-hotkey')).toHaveText('Ctrl+Shift+S');
      await page.getByRole('button', { name: L.scale2 }).click();
      await page.waitForTimeout(700);
      let st = await stateOf(page);
      expect(st.schema).toBe(7);
      expect(st.buddy).toMatchObject({ enabled: true, hotkey: 'Ctrl+Shift+KeyS', scale: 2, opacity: 90, autoOpen: false });
      await sw.uncheck();
      await expect(page.getByTestId('ops-off')).toBeVisible();
      await page.waitForTimeout(700);
      st = await stateOf(page);
      expect(st.buddy.enabled).toBe(false);
      expect(errors).toEqual([]);
    });

    test('Šatník: podoba podle levelu, ruční díl a návrat na automatiku', async ({ page }) => {
      const errors = watchErrors(page);
      await start(page, lang);
      await page.goto('/#settings');
      await expect(page.getByText(L.wardrobe, { exact: true })).toBeVisible();
      await expect(page.getByTestId('ops-form')).toHaveText(L.form);
      await expect.poll(() => opaquePixels(page, '.ops-preview canvas')).toBeGreaterThan(800);
      await page.getByLabel(L.antenna, { exact: true }).selectOption({ label: L.none });
      await page.waitForTimeout(700);
      expect((await stateOf(page)).buddy.outfit).toEqual({ antenna: null });
      await page.getByRole('button', { name: L.auto }).click();
      await page.waitForTimeout(700);
      const st = await stateOf(page);
      expect(st.buddy.outfit).toEqual({});
      expect(st.buddy.unlocked.length).toBe(24); /* level 15 přidá i štítek */
      expect(errors).toEqual([]);
    });

    test('Overlay: kopie stavu, záložky, úkol přes hlavní okno, prázdný snímek a zápis ze snímku', async ({ page, context }) => {
      const errors = watchErrors(page);
      await start(page, lang, true);
      await page.goto('/#settings');
      await expect(page.getByTestId('ops-switch')).toBeChecked();
      const ov = await context.newPage();
      const ovErrors = watchErrors(ov);
      await ov.goto('/overlay.html');
      await expect(ov.getByRole('heading', { name: L.title })).toBeVisible();
      await expect(ov.getByTestId('ov-coins')).toHaveText(L.coins);
      await expect.poll(() => opaquePixels(ov, '.ov-header canvas')).toBeGreaterThan(500);

      /* záložky šipkami a nákupy */
      await ov.getByRole('tab', { name: L.overview }).focus();
      await ov.keyboard.press('ArrowRight');
      await expect(ov.getByRole('tab', { name: new RegExp('^' + L.quests) })).toHaveAttribute('aria-selected', 'true');
      const before = Object.keys((await stateOf(page)).quests?.done ?? {}).length;
      const first = ov.locator('.ov-quest').first();
      const id = await first.getAttribute('data-quest');
      await first.getByRole('button', { name: new RegExp('^' + L.doneAria) }).click();
      await expect.poll(async () => Object.keys((await stateOf(page)).quests?.done ?? {}).length, { timeout: 5000 }).toBeGreaterThan(before);
      expect((await stateOf(page)).quests.done[id!]).toBeTruthy();
      await ov.getByRole('tab', { name: L.shop }).click();
      await expect(ov.locator('.ov-table tbody tr').first()).toBeVisible();

      /* prázdný snímek: nic se nezapíše */
      const saved = JSON.stringify(await stateOf(page));
      expect(await capture(page, null)).toBe('empty');
      await ov.getByRole('tab', { name: new RegExp('^' + L.scan) }).click();
      await expect(ov.getByRole('heading', { name: L.nothing })).toBeVisible();
      await page.waitForTimeout(700);
      expect(JSON.stringify(await stateOf(page))).toBe(saved);

      /* snímek se STASH: výsledek v overlayi, zápis přes hlavní okno se snímkem stavu */
      expect(await capture(page, TOOLTIP)).toBe('read');
      await expect(ov.getByRole('tab', { name: new RegExp('^' + L.scan) })).toHaveAttribute('aria-selected', 'true');
      await expect(ov.locator('.ov-review tbody tr')).toHaveCount(13);
      const write = ov.getByRole('button', { name: L.write });
      await expect(write).toBeEnabled();
      await write.click();
      await expect(ov.getByTestId('ov-done')).toContainText(L.written);
      await page.waitForTimeout(700);
      const st = await stateOf(page);
      expect(st.inventory['Magnetic Accelerator']).toBe(8);
      expect(st.profile.coins).toBe(51060);
      expect(await page.evaluate(() => Object.keys(localStorage).some(k => /-import-/.test(k)))).toBe(true);
      expect(errors).toEqual([]);
      expect(ovErrors).toEqual([]);
    });
  });
}
