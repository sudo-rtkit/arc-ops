/* 0.20.1: tiché emoce Opse k automatickému snímku (scan → scan-ok / scan-unsure) v kompaktním okně a v okně buddyho.
   V prohlížeči se nic nesnímá: automatický snímek se simuluje přes window.__opsTest (stejná cesta jako capture-ready
   s obrazovkou z Rustu), buddy dostane zprávu přes BroadcastChannel. Umělé obrazovky z veřejného vzoru.
   Ověřuje v obou jazycích: loadout = scan a scan-ok, výsledek s údajem ke kontrole = scan a scan-unsure, bez bubliny
   a nové hlášky; po pozastavení snímání žádná emoce. Krátké jednorázové stavy zachytí MutationObserver na data-anim. */
import { expect, test, type Page } from '@playwright/test';
import { syntheticFindings, toPngBase64 } from '../vision/findings';

const LOADOUT = toPngBase64(syntheticFindings({ skip: [0, 1, 2, 3, 4, 5, 6] }));
const FINDINGS = toPngBase64(syntheticFindings());
const T = {
  cs: { chipOn: 'Snímání', chipPaused: 'Pozastaveno', preview: 'Náhled Opse v aktuálním outfitu', buddy: 'Ops: otevřít nebo zavřít overlay', auto: 'Automatické snímání běží' },
  en: { chipOn: 'Capture', chipPaused: 'Paused', preview: 'Preview of Ops in the current outfit', buddy: 'Ops: open or close the overlay', auto: 'Automatic capture is running' },
} as const;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
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
/* Zaznamená každou hodnotu data-anim plátna (i krátké jednorázové stavy). */
async function record(page: Page, sel: string) {
  await page.locator(sel).first().waitFor();
  await page.evaluate(s => {
    const w = window as unknown as { __anims: string[] };
    w.__anims = [];
    const c = document.querySelector(s)!;
    new MutationObserver(() => { const a = c.getAttribute('data-anim') || ''; if (w.__anims.at(-1) !== a) w.__anims.push(a); })
      .observe(c, { attributes: true, attributeFilter: ['data-anim'] });
  }, sel);
}
const anims = (page: Page) => page.evaluate(() => (window as unknown as { __anims: string[] }).__anims.filter(a => a.startsWith('scan')));
const reset = (page: Page) => page.evaluate(() => { (window as unknown as { __anims: string[] }).__anims = []; });
/* Výsledná emoce nahradí ještě běžící scan; když je čtení rychlejší než jeden snímek obrazovky (v prohlížeči je
   synchronní), scan se ani nevykreslí. Proto: buď scan → výsledek, nebo rovnou výsledek. */
const settled = async (page: Page, end: string) => {
  await expect.poll(() => anims(page)).toContain(end);
  expect([['scan', end], [end]]).toContainEqual(await anims(page));
};
const idle = (page: Page, sel: string) => expect(page.locator(sel)).toHaveAttribute('data-anim', 'idle', { timeout: 30_000 });

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Automatický snímek: tiché emoce v kompaktu a v okně buddyho (${lang})`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 420, height: 760 });
    await page.addInitScript(s => {
      if (sessionStorage.getItem('emote-seeded')) return;
      sessionStorage.setItem('emote-seeded', '1');
      localStorage.clear();
      localStorage.setItem('arcops:state', s);
    }, JSON.stringify({
      schema: 17,
      profile: { level: 20, coins: 58313, rounds: 7 },
      buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS', autoOpen: true },
      autoCapture: { enabled: true, paused: false, ackAt: Date.now() - 60_000, screens: { loadout: true, result: true } },
      opsPrefs: { tutorial: { status: 'done', step: 'end' }, advisor: false },
      whatsNew: { seen: '0.20.1' },
      mainWindow: { mode: 'compact' },
      raids: [{ id: 'R1', ts: Date.now() - 86_400_000, map: 'buried', type: 'money', ok: true, coins: 1200 }],
      settings: { autoSnapshot: false, lang },
    }));
    await page.goto('/');
    const row = page.getByTestId('compact-opsrow');
    const cw = '[data-testid="compact-opsrow"] canvas';
    await expect(row.getByRole('img', { name: L.preview })).toBeVisible();
    const chip = page.getByTestId('compact-auto');
    await expect(chip).toHaveText(L.chipOn);

    const bd = await context.newPage();
    const bdErrors = watchErrors(bd);
    await bd.goto('/buddy.html');
    await expect(bd.getByRole('button', { name: L.buddy })).toBeVisible({ timeout: 15_000 });
    await expect(bd.getByTestId('buddy-auto')).toHaveAttribute('aria-label', L.auto);
    await record(page, cw);
    await record(bd, 'canvas');
    /* příchod, pozdrav a řeč dohrají; emoce jen nad klidem */
    await idle(page, cw);
    await idle(bd, 'canvas');
    await expect(bd.getByTestId('buddy-bubble')).toHaveCount(0, { timeout: 15_000 });
    await idle(bd, 'canvas');
    await reset(page); await reset(bd);
    const line = await row.getByTestId('ops-line').textContent();

    /* loadout: zapsaný automaticky → scan, pak scan-ok */
    expect(await auto(page, LOADOUT, 'loadout')).toBe('loadout');
    await settled(page, 'scan-ok');
    await settled(bd, 'scan-ok');
    await idle(page, cw);
    await idle(bd, 'canvas');
    /* tiché: žádná bublina ani nová hláška */
    await expect(bd.getByTestId('buddy-bubble')).toHaveCount(0);
    expect(await row.getByTestId('ops-line').textContent()).toBe(line);

    /* výsledek raidu: mapa jde do fronty „Ke kontrole“ → scan, pak scan-unsure */
    await reset(page); await reset(bd);
    expect(await auto(page, FINDINGS, 'findings')).toBe('result');
    await settled(bd, 'scan-unsure');
    await settled(page, 'scan-unsure');
    await idle(page, cw);
    await idle(bd, 'canvas');
    await expect(bd.getByTestId('buddy-bubble')).toHaveCount(0);

    /* stejný výsledek podruhé: snímek začal (scan), ale nic se nezapsalo → žádná výsledná emoce, scan sám skončí */
    await reset(page); await reset(bd);
    expect(await auto(page, FINDINGS, 'findings')).toBe('dup');
    await expect.poll(() => anims(page)).toEqual(['scan']);
    await expect.poll(() => anims(bd)).toEqual(['scan']);
    await idle(page, cw);
    await idle(bd, 'canvas');
    expect(await anims(page)).toEqual(['scan']);

    /* pozastaveno: nic se nečte a Ops nemrkne */
    await chip.click();
    await expect(chip).toHaveText(L.chipPaused);
    await idle(page, cw);
    await reset(page); await reset(bd);
    expect(await auto(page, LOADOUT, 'loadout')).toBe('off');
    await page.waitForTimeout(600);
    expect(await anims(page)).toEqual([]);
    expect(await anims(bd)).toEqual([]);
    expect([...errors, ...bdErrors]).toEqual([]);
  });
}
