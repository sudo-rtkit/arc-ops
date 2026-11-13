/* 0.20.0: automatické snímání obrazovek mimo raid (žlutá zóna, výchozí vypnuto). V prohlížeči se nic nesnímá:
   snímky z Rustu se simulují přes window.__opsTest (stejná cesta jako capture-ready s obrazovkou z pásu s nadpisy).
   Umělé obrazovky jsou z veřejného vzoru (tests/vision/findings.ts), žádné vlastní snímky hráče.
   Ověřuje v obou jazycích: zapnutí s vysvětlením (a zrušení), pozastavení, hlavní vypínač napojení na hru
   s obnovením, loadout → výsledek → zápis do Deníku, frontu „Ke kontrole“ a Zpět. */
import { expect, test, type Page } from '@playwright/test';
import { syntheticFindings, toPngBase64 } from '../vision/findings';

const LOADOUT = toPngBase64(syntheticFindings({ skip: [0, 1, 2, 3, 4, 5, 6] }));
const FINDINGS = toPngBase64(syntheticFindings());
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('auto-seeded')) return;
    sessionStorage.setItem('auto-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify({
    schema: 16,
    profile: { level: 20, coins: 58313, rounds: 7 },
    buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS', autoOpen: true },
    opsPrefs: { tutorial: { status: 'done', step: 'end' } },
    whatsNew: { seen: '0.20.0' },
    raids: [{ id: 'R1', ts: Date.now() - 86_400_000, map: 'buried', type: 'money', ok: true, coins: 1200 }],
    settings: { autoSnapshot: true, lang },
  }));
  await page.goto('/#settings');
  await expect.poll(async () => (await stateOf(page))?.schema, { timeout: 5000 }).toBe(18);
}
async function auto(page: Page, b64: string, screen: string) {
  return page.evaluate(async ([data, scr]) => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    return (window as unknown as { __opsTest: { autoCapture: (w: number, h: number, d: ArrayLike<number>, s: string) => Promise<string> } }).__opsTest.autoCapture(bmp.width, bmp.height, px, scr);
  }, [b64, screen] as const);
}

const T = {
  cs: {
    what: /Co se snímá: jen známé obrazovky menu mimo raid/, memory: /jen v paměti a po přečtení se hned zahodí/, embark: 'Čeká na ověření u Embarku',
    on: 'Snímání běží', paused: 'Snímání je pozastavené', pause: 'Pozastavit', resume: 'Pokračovat',
    written: 'Ops zapsal raid do Deníku: přežil, 4 položky lootu.', knocked: 'Ops zapsal raid do Deníku: knocked out, výbava ztracena.',
    review: 'Ke kontrole', count1: '1 údaj', count2: '3 údaje', saved: 'Vyřízeny 3 údaje.', mapLabel: 'Mapa', restore: /Obnoví se: buddy nad hrou, zkratka Ctrl\+Shift\+S, automatické snímání\./,
    chipOn: 'Snímání',
  },
  en: {
    what: /What is captured: only known menu screens outside a raid/, memory: /in memory only and are discarded right after reading/, embark: 'Pending Embark review',
    on: 'Capture is running', paused: 'Capture is paused', pause: 'Pause', resume: 'Resume',
    written: 'Ops recorded the raid in the Journal: survived, 4 loot items.', knocked: 'Ops recorded the raid in the Journal: knocked out, loadout lost.',
    review: 'To review', count1: '1 field', count2: '3 fields', saved: '3 fields resolved.', mapLabel: 'Map', restore: /Restores: buddy over the game, hotkey Ctrl\+Shift\+S, automatic capture\./,
    chipOn: 'Capture',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Automatické snímání: zapnutí s vysvětlením, pozastavení a hlavní vypínač (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    const sw = page.getByTestId('auto-switch');
    await expect(sw).not.toBeChecked();
    await expect(page.getByText(L.embark).first()).toBeVisible();
    /* bez zapnutí se automatický snímek nečte */
    expect(await auto(page, LOADOUT, 'loadout')).toBe('off');
    /* zapnutí ukáže vysvětlení; zrušit = zůstane vypnuto */
    await sw.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByTestId('auto-explain')).toContainText(L.what);
    await expect(dlg.getByTestId('auto-explain')).toContainText(L.memory);
    await expect(dlg.getByTestId('auto-explain')).toContainText(L.embark);
    await dlg.getByRole('button', { name: lang === 'cs' ? 'Zrušit' : 'Cancel' }).click();
    await expect(sw).not.toBeChecked();
    expect((await stateOf(page)).autoCapture.enabled).toBe(false);
    await sw.click();
    await page.getByTestId('auto-confirm').click();
    await expect(sw).toBeChecked();
    await expect(page.getByTestId('auto-state')).toHaveText(L.on);
    await expect.poll(async () => (await stateOf(page)).autoCapture).toMatchObject({ enabled: true, paused: false, screens: { loadout: true, result: true, stash: false } });
    expect((await stateOf(page)).autoCapture.ackAt).toBeGreaterThan(0);
    /* výběr obrazovek a pozastavení */
    await page.getByTestId('auto-screen-stash').check();
    await page.getByTestId('auto-pause').click();
    await expect(page.getByTestId('auto-state')).toHaveText(L.paused);
    await expect(page.getByTestId('auto-pause')).toHaveText(L.resume);
    expect(await auto(page, LOADOUT, 'loadout')).toBe('off');
    await page.getByTestId('auto-pause').click();
    await expect(page.getByTestId('auto-state')).toHaveText(L.on);
    await expect.poll(async () => (await stateOf(page)).autoCapture).toMatchObject({ paused: false, screens: { stash: true } });

    /* hlavní vypínač: buddy nad hrou, zkratka i snímání najednou; obnovení vrátí předchozí stav */
    await page.getByTestId('link-off').click();
    await expect(page.getByTestId('link-is-off')).toBeVisible();
    await expect(page.getByTestId('link-restore-list')).toHaveText(L.restore);
    await expect(sw).not.toBeChecked();
    await expect(sw).toBeDisabled();
    await expect(page.getByTestId('ops-autoopen')).toBeDisabled();
    await expect.poll(async () => { const s = await stateOf(page); return [s.buddy.autoOpen, s.buddy.hotkey, s.autoCapture.enabled, s.gameLink.off]; }).toEqual([false, '', false, true]);
    expect(await auto(page, LOADOUT, 'loadout')).toBe('off');
    await page.getByTestId('link-restore').click();
    await expect(page.getByTestId('link-off')).toBeVisible();
    await expect(sw).toBeChecked();
    await expect.poll(async () => { const s = await stateOf(page); return [s.buddy.autoOpen, s.buddy.hotkey, s.autoCapture.enabled, s.gameLink.off]; }).toEqual([true, 'Ctrl+Shift+KeyS', true, false]);
    expect(errors).toEqual([]);
  });

  test(`Automatické snímání: loadout → výsledek → Deník, fronta „Ke kontrole“ a Zpět (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.getByTestId('auto-switch').click();
    await page.getByTestId('auto-confirm').click();
    await expect(page.getByTestId('auto-state')).toHaveText(L.on);
    const before = await stateOf(page);

    /* loadout (jen quick use) → v raidu → FINDINGS */
    expect(await auto(page, LOADOUT, 'loadout')).toBe('loadout');
    await expect.poll(async () => (await stateOf(page)).raidLife.phase).toBe('loadout');
    expect(await auto(page, FINDINGS, 'findings')).toBe('result');
    await expect.poll(async () => (await stateOf(page)).raids.length).toBe(before.raids.length + 1);
    const s1 = await stateOf(page);
    const raid = s1.raids.at(-1);
    expect(raid).toMatchObject({ ok: true, coins: 0, gear: [{ name: 'Shotgun Ammo', qty: 3 }, { name: 'Launcher Ammo', qty: 6 }] });
    expect(raid.loot).toEqual([{ name: 'Launcher Ammo', qty: 6 }, { name: 'Light Ammo', qty: 156 }, { name: 'Medium Ammo', qty: 179 }, { name: 'Shotgun Ammo', qty: 3 }]);
    expect(s1.profile.rounds).toBe(before.profile.rounds + 1);
    expect(s1.profile.coins).toBe(before.profile.coins);
    expect(s1.inventory).toEqual(before.inventory);
    expect(s1.raidLife.phase).toBe('idle');
    /* stejný výsledek podruhé: nic */
    expect(await auto(page, FINDINGS, 'findings')).toBe('dup');

    /* upozornění v okně aplikace (žádné vyskakovací okno) a fronta v Deníku */
    const note = page.getByTestId('auto-write');
    await expect(note).toHaveCount(1);
    await expect(note).toContainText(L.written);
    await page.goto('/#journal');
    const review = page.getByTestId('review');
    await expect(page.getByRole('heading', { name: L.review })).toBeVisible();
    await expect(page.getByTestId('review-count')).toHaveText(L.count1);
    await expect(review.getByTestId('review-map')).toBeVisible();

    /* KNOCKED OUT bez loadoutu: zápis, výbava neznámá → loadout ke kontrole */
    expect(await auto(page, FINDINGS, 'knockedOut')).toBe('result');
    await expect(page.getByTestId('auto-write')).toHaveCount(2);
    await expect(page.getByTestId('auto-write').first()).toContainText(L.knocked);
    await expect(page.getByTestId('review-count')).toHaveText(L.count2);

    /* vyřízení najednou: mapa prvního raidu = Dam, ostatní zahodit/potvrdit */
    const maps = review.getByTestId('review-map');
    await maps.first().getByLabel(L.mapLabel).selectOption({ label: 'Dam Battlegrounds' });
    await page.getByTestId('review-save').click();
    await expect(page.getByTestId('review-done')).toHaveText(L.saved);
    await expect(page.getByTestId('review')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).review).toEqual([]);
    const s2 = await stateOf(page);
    expect(s2.raids.find((r: { id: string }) => r.id === raid.id)).toMatchObject({ map: 'dam', auto: { unsure: [] } });

    /* Zpět u KNOCKED OUT: záznam zmizí, kolo se vrátí */
    const ko = s2.raids.at(-1);
    expect(ko.ok).toBe(false);
    await page.getByTestId('auto-write').first().getByTestId('auto-undo').click();
    await expect(page.getByTestId('auto-write')).toHaveCount(1);
    await expect.poll(async () => (await stateOf(page)).raids.some((r: { id: string }) => r.id === ko.id)).toBe(false);
    expect((await stateOf(page)).profile.rounds).toBe(before.profile.rounds + 1);
    /* potvrzení zbývajícího upozornění */
    await page.getByTestId('auto-ok').click();
    await expect(page.getByTestId('auto-writes')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).autoLog.every((w: { seen: boolean }) => w.seen)).toBe(true);
    expect(errors).toEqual([]);
  });
}
