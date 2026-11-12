/* 0.8.1: snímek FINDINGS po raidu přes hub hlavního okna → revize lootu v overlayi → potvrzený zápis do raidu.
   Veřejný umělý snímek (tests/vision/findings.ts, z ukázkového snímku STASH), žádné vlastní snímky hráče.
   Ověřuje: odečtení výbavy raidu, ruční kontrolu bez výbavy, zápis se snímkem stavu, mince beze změny,
   opakovaný snímek se znovu nezapíše, jiná obrazovka se odmítne. V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';
import { syntheticFindings, toPngBase64 } from '../vision/findings';

const FINDINGS = toPngBase64(syntheticFindings());
const OTHER = toPngBase64(syntheticFindings({ button: false }));
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en') {
  const now = Date.now();
  await page.addInitScript(s => {
    if (sessionStorage.getItem('loot-seeded')) return;
    sessionStorage.setItem('loot-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify({
    schema: 6,
    profile: { level: 20, coins: 58313, rounds: 7 },
    buddy: { enabled: true },
    raids: [{ id: 'R1', ts: now - 10 * 60_000, map: 'buried', type: 'money', ok: true, coins: 1200, gear: [{ name: 'Light Ammo', qty: 100 }] }],
    settings: { autoSnapshot: true, lang },
  }));
  await page.goto('/');
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

const T = {
  cs: { title: 'Loot po raidu', newRaid: 'Nový záznam raidu', noGear: /Výbava raidu není zadaná/, done: /Loot zapsán do raidu: 4 položky\./, other: 'Tahle obrazovka se nečte', scan: 'Ze snímku', sum: '4 položky lootu · 253 ks' },
  en: { title: 'Post-raid loot', newRaid: 'New raid entry', noGear: /No gear is entered for the raid/, done: /Loot recorded to the raid: 4 items\./, other: 'This screen is not read', scan: 'From capture', sum: '4 loot items · 253 pcs' },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Loot po raidu ze snímku FINDINGS (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();

    /* jiná obrazovka s batohem: odmítnuto, nic se nezapíše (nejdřív počkat na uložení normalizovaného stavu) */
    await expect.poll(async () => !!(await stateOf(page))?.meta, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(700);
    const saved = JSON.stringify(await stateOf(page));
    expect(await capture(page, OTHER)).toBe('empty');
    await ov.getByRole('tab', { name: new RegExp('^' + L.scan) }).click();
    await expect(ov.getByRole('heading', { name: L.other })).toBeVisible();
    await page.waitForTimeout(600);
    expect(JSON.stringify(await stateOf(page))).toBe(saved);

    /* FINDINGS: revize lootu, raid R1 vybraný, výbava se odečte */
    expect(await capture(page, FINDINGS)).toBe('loot');
    const loot = ov.getByTestId('ov-loot');
    await expect(loot.getByRole('heading', { name: L.title })).toBeVisible();
    await expect(loot.getByTestId('ov-loot-raid')).toHaveValue('R1');
    await expect(loot.getByTestId('ov-loot-gear')).toContainText('Light Ammo ×100');
    await expect(loot.locator('tbody tr')).toHaveCount(4);
    await expect(loot.getByTestId('ov-loot-selected')).toHaveText(L.sum);

    /* nový raid bez výbavy: zápis až po ruční kontrole */
    await loot.getByTestId('ov-loot-raid').selectOption({ label: L.newRaid });
    await expect(loot.getByTestId('ov-loot-nogear')).toContainText(L.noGear);
    const write = loot.getByTestId('ov-loot-write');
    await expect(write).toBeDisabled();
    await loot.getByTestId('ov-loot-gearcheck').check();
    await expect(write).toBeEnabled();
    await loot.getByTestId('ov-loot-raid').selectOption('R1');
    await expect(write).toBeEnabled();

    await write.click();
    await expect(ov.getByTestId('ov-loot-done')).toContainText(L.done);
    await page.waitForTimeout(700);
    const st = await stateOf(page);
    const r1 = st.raids.find((r: { id: string }) => r.id === 'R1');
    const lootMap = Object.fromEntries(r1.loot.map((x: { name: string; qty: number }) => [x.name, x.qty]));
    expect(lootMap).toEqual({ 'Launcher Ammo': 12, 'Light Ammo': 56, 'Medium Ammo': 179, 'Shotgun Ammo': 6 });
    expect(r1.coins).toBe(1200);
    expect(st.profile.coins).toBe(58313);
    expect(st.profile.rounds).toBe(7);
    expect(st.raids).toHaveLength(1);
    expect(st.inventory['Light Ammo']).toBe(56);
    expect(r1.lootScan.sig).toMatch(/^L[0-9a-f]{16}$/);
    expect(await page.evaluate(() => Object.keys(localStorage).some(k => /-import-/.test(k)))).toBe(true);

    /* stejný snímek znovu: rozpoznán jako zapsaný, zápis zablokovaný */
    expect(await capture(page, FINDINGS)).toBe('loot');
    await expect(ov.getByTestId('ov-loot-dup')).toBeVisible();
    await expect(ov.getByTestId('ov-loot-write')).toBeDisabled();
    await page.waitForTimeout(600);
    expect((await stateOf(page)).raids[0].loot).toEqual(r1.loot);

    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });
}
