/* 0.15.0: vyhodnocení po raidu a historie plánů, v obou jazycích.
   1) Ruční cesta: plán ze stavu schématu 13 → změna zásoby → „Vyhodnotit raid“ (nalezeno / potřeba, chybí,
      další raid, shrnutí Opse) → „Uložit do deníku“ přes stávající zápis raidu → detail „Plán“ v deníku →
      Statistika „Které mapy ti pomáhají s cíli“ s označením malého vzorku. Vyhodnocení inventář nemění.
   2) Snímek FINDINGS při aktivním plánu → vyhodnocení ve výsledku revize v overlayi → uložení plánu k raidu
      (veřejný umělý snímek tests/vision/findings.ts, žádné vlastní snímky hráče). */
import { expect, test, type Page } from '@playwright/test';
import { syntheticFindings, toPngBase64 } from '../vision/findings';

const FINDINGS = toPngBase64(syntheticFindings());
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function capture(page: Page, b64: string) {
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    return (window as unknown as { __opsTest: { capture: (w: number, h: number, d: ArrayLike<number>) => string } }).__opsTest.capture(bmp.width, bmp.height, px);
  }, b64);
}
async function setStock(page: Page, name: string, value: number, L: { have: string }) {
  await page.goto('/#inventory');
  await page.getByRole('searchbox').first().fill(name);
  const input = page.getByLabel(`${L.have} ${name}`, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}

const T = {
  cs: {
    have: 'Mám', sum: 'Z plánu nalezeno 4 / 7 ks', save: 'Uložit raid', plan: 'Plán', little: 'málo dat', statsTitle: 'Které mapy ti pomáhají s cíli',
    source: 'Podle změny zásoby', saved: 'V deníku u raidu', detail: 'Zobrazit detail raidu', none: 'Z plánu nalezeno 0 / 7 ks', ovSave: 'Uložit do deníku', ovSaved: 'Plán je v deníku',
    fromRaid: 'Podle lootu raidu',
  },
  en: {
    have: 'I have', sum: 'Found from the plan 4 / 7 units', save: 'Save raid', plan: 'Plan', little: 'little data', statsTitle: 'Which maps help with your goals',
    source: 'Based on the stock change', saved: 'In the journal with the raid', detail: 'Show details of the raid', none: 'Found from the plan 0 / 7 units', ovSave: 'Save to journal', ovSaved: 'The plan is in the journal',
    fromRaid: 'Based on the loot of the raid',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`vyhodnocení raidu bez snímku → deník → statistika map (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('ev')) return;
      sessionStorage.setItem('ev', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({
      schema: 13, profile: { level: 12, rounds: 3 }, stations: { gear: 1 }, inventory: { 'Power Cable': 1, 'Electrical Components': 5 },
      raids: [{ id: 'OLD', ts: Date.now() - 86400000, map: 'dam', type: 'money', ok: true, coins: 300 }], settings: { lang },
    }));
    await page.goto('/#raid');
    /* výchozí cíl: Gear Bench 2 (Power Cable 3, Electrical Components 5, Hornet Driver 5) */
    await expect(page.getByTestId('raid-goals').getByRole('checkbox', { name: /Gear Bench 2/ })).toBeChecked();
    await page.getByTestId('raid-maps').locator('li', { hasText: 'Dam' }).getByRole('radio').check();
    await page.getByTestId('raid-start').click();
    await expect.poll(async () => (await stateOf(page)).raidPlan?.snap).toEqual(expect.arrayContaining([{ mat: 'Power Cable', have: 1, missing: 2 }]));
    expect((await stateOf(page)).schema).toBe(19);
    await expect(page.getByTestId('raid-eval-panel')).toBeVisible();
    await expect(page.getByTestId('raid-eval-sum')).toHaveCount(0);

    /* po raidu: zásoba se změnila (hráč ji zapsal sám) */
    await setStock(page, 'Power Cable', 3, L);
    await setStock(page, 'Hornet Driver', 2, L);
    await expect.poll(async () => (await stateOf(page)).inventory['Hornet Driver']).toBe(2);
    const inv = (await stateOf(page)).inventory;

    await page.goto('/#raid');
    await page.getByTestId('raid-eval').click();
    await expect(page.getByTestId('raid-eval-source')).toContainText(L.source);
    await expect(page.getByTestId('raid-eval-sum')).toContainText(L.sum);
    await expect(page.getByTestId('raid-eval-sum')).toHaveAttribute('data-kind', 'partial');
    const list = page.getByTestId('raid-eval-list');
    await expect(list.locator('tr[data-mat="Power Cable"] td').nth(1)).toHaveText('2 / 2');
    await expect(list.locator('tr[data-mat="Hornet Driver"] td').nth(1)).toHaveText('2 / 5');
    await expect(list.locator('tr[data-mat="Hornet Driver"] td').nth(2)).toHaveText('3×');
    await expect(page.getByTestId('raid-ops').getByTestId('ops-line')).toContainText('4');
    await expect(page.getByTestId('raid-next')).toBeVisible();
    await expect(page.getByTestId('raid-next-start')).toBeVisible();
    expect((await stateOf(page)).inventory).toEqual(inv);

    /* Uložit do deníku: bez záznamu od spuštění plánu se otevře stávající zápis raidu s plánem */
    await page.getByTestId('raid-eval-save').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('raid-form-plan').getByRole('checkbox')).toBeChecked();
    await expect(dialog.getByTestId('raid-form-plan')).toContainText('4 / 7');
    await dialog.locator('#raid-coins').fill('800');
    await dialog.getByRole('button', { name: L.save }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('raid-eval-saved')).toContainText(L.saved);
    await expect.poll(async () => (await stateOf(page)).raids.length).toBe(2);
    const st = await stateOf(page);
    const r = st.raids.find((x: { id: string }) => x.id !== 'OLD');
    expect(r.plan).toMatchObject({ goals: ['Gear Bench 2'], map: 'dam' });
    expect(r.plan.items).toEqual(expect.arrayContaining([{ mat: 'Power Cable', need: 2, found: 2 }, { mat: 'Hornet Driver', need: 5, found: 2 }]));
    expect(st.raids.find((x: { id: string }) => x.id === 'OLD').plan).toBeUndefined();
    expect(st.inventory).toEqual(inv);

    /* deník: detail „Plán“ u záznamu s plánem */
    await page.goto('/#journal');
    await page.getByRole('button', { name: new RegExp(L.detail) }).first().click();
    const plan = page.getByTestId('journal-plan');
    await expect(plan).toContainText(L.plan);
    await expect(plan).toContainText('Gear Bench 2');
    await expect(page.getByTestId('journal-plan-found')).toContainText('Hornet Driver 2/5');

    /* statistika: mapa s daty, velikost vzorku a označení malého vzorku */
    await page.goto('/#stats');
    const sec = page.getByTestId('stats-plan-maps');
    await expect(page.getByRole('heading', { name: L.statsTitle })).toBeVisible();
    await expect(sec.locator('tbody tr')).toHaveCount(1);
    const row = sec.locator('tr[data-map="dam"]');
    await expect(row.locator('td').nth(1)).toHaveText('1');
    await expect(row.locator('td').nth(2)).toHaveText('4');
    await expect(row).toContainText(L.little);
    expect(errors).toEqual([]);
  });

  test(`snímek FINDINGS při aktivním plánu → vyhodnocení v overlayi → deník (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    const now = Date.now();
    await page.addInitScript(s => {
      if (sessionStorage.getItem('evo')) return;
      sessionStorage.setItem('evo', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({
      schema: 13, profile: { level: 20, rounds: 7 }, stations: { gear: 1 }, inventory: { 'Power Cable': 1, 'Electrical Components': 5 }, buddy: { enabled: true },
      raids: [{ id: 'R1', ts: now - 10 * 60_000, map: 'buried', type: 'money', ok: true, coins: 1200, gear: [{ name: 'Light Ammo', qty: 100 }] }],
      settings: { autoSnapshot: true, lang },
    }));
    await page.goto('/#raid');
    await expect(page.getByTestId('raid-goals').getByRole('checkbox', { name: /Gear Bench 2/ })).toBeChecked();
    await page.getByTestId('raid-start').click();
    await expect.poll(async () => (await stateOf(page)).raidPlan?.snap?.length).toBeGreaterThan(0);
    await page.waitForTimeout(700);

    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    expect(await capture(page, FINDINGS)).toBe('loot');
    const loot = ov.getByTestId('ov-loot');
    await expect(loot.getByTestId('ov-loot-raid')).toHaveValue('R1');
    await loot.getByTestId('ov-loot-write').click();
    await expect(ov.getByTestId('ov-loot-done')).toBeVisible();
    const ev = ov.getByTestId('ov-raid-eval');
    await expect(ev).toBeVisible();
    await expect(ev).toHaveAttribute('data-kind', 'none');
    await expect(ev.getByRole('heading')).toHaveText(L.none);
    await expect(ev.locator('[data-mat="Hornet Driver"] strong')).toHaveText('0/5');
    await expect(ov.getByTestId('ops-line')).not.toHaveText('');
    await ev.getByTestId('ov-raid-save').click();
    await expect(ev.getByTestId('ov-raid-saved')).toContainText(L.ovSaved);
    await expect.poll(async () => (await stateOf(page)).raids.find((r: { id: string }) => r.id === 'R1').plan?.items?.length).toBe(2);
    const r1 = (await stateOf(page)).raids.find((r: { id: string }) => r.id === 'R1');
    expect(r1.plan.items.every((i: { found: number }) => i.found === 0)).toBe(true);
    /* modul Příprava ukáže vyhodnocení podle lootu raidu sám, bez kliknutí */
    await expect(page.getByTestId('raid-eval-source')).toContainText(L.fromRaid);
    await expect(page.getByTestId('raid-eval-saved')).toBeVisible();
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });
}
