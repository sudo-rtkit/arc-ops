/* 0.33.0: kontrola nové verze v obou jazycích, se zkušební náhradou nativní vrstvy (window.__updateTest, jen
   v prohlížeči): žádná síť. Výchozí stav vypnuto; ruční kontrola funguje i vypnutá a ukáže výsledek, ale pruh jen se
   zapnutou kontrolou; pruh otevře stránku vydání a skryje verzi (i po načtení znovu); poznámky jen jako prostý text;
   automatická kontrola chvíli po startu jen se zapnutím; chyby a „máš nejnovější verzi“. */
import { expect, test, type Page } from '@playwright/test';

const NEXT = '0.99.0';
const URL = `https://github.com/sudo-rtkit/arc-ops/releases/tag/v${NEXT}`;
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const stateOf = async (page: Page) => JSON.parse(await page.evaluate(() => localStorage.getItem('arcops:state') || '{}'));
const checks = (page: Page) => page.evaluate(() => (window as unknown as { __updateChecks: number }).__updateChecks);
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/* mode: newer = nová verze 0.99.0, same = verze aplikace, rate = limit GitHubu */
async function seed(page: Page, lang: 'cs' | 'en', mode: 'newer' | 'same' | 'rate', extra: Record<string, unknown> = {}) {
  await page.addInitScript(([s, m, next, url]) => {
    const w = window as unknown as Record<string, unknown>;
    w.__updateChecks = 0;
    w.__opened = [];
    /* odkaz se v prohlížeči otevírá přes window.open (náhrada open_external); jen zaznamenat */
    window.open = ((u: string) => { (w.__opened as string[]).push(String(u)); return null; }) as typeof window.open;
    w.__updateTest = {
      check: async () => {
        w.__updateChecks = (w.__updateChecks as number) + 1;
        if (m === 'rate') throw 'update:rate';
        const latest = m === 'same' ? '0.34.0' : next;
        return {
          latest, current: '0.34.0', newer: m === 'newer', url: m === 'same' ? `https://github.com/sudo-rtkit/arc-ops/releases/tag/v${latest}` : url,
          name: 'Ops ' + latest, publishedAt: '2026-12-01T10:00:00Z', cached: false,
          notes: '## Novinky\n- **Ops** <b>umí</b> víc: [odkaz](https://evil.example) https://evil.example/x',
        };
      },
    };
    if (sessionStorage.getItem('upd-e2e')) return;
    sessionStorage.setItem('upd-e2e', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, [JSON.stringify({ schema: 19, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang }, ...extra }), mode, NEXT, URL] as const);
}

const T = {
  cs: {
    toggle: 'Kontrolovat nové verze', check: 'Zkontrolovat teď', never: 'Zatím nezkontrolováno.', last: 'Naposledy zkontrolováno:',
    newer: `Je k dispozici verze ${NEXT}.`, latest: 'Máš nejnovější verzi.', rate: 'GitHub teď omezuje počet dotazů. Zkus to později.',
    open: 'Otevřít stránku vydání', skip: 'Skrýt tuto verzi', title: 'Aktualizace', intro: 'nejnovější vydání tohoto projektu',
  },
  en: {
    toggle: 'Check for new versions', check: 'Check now', never: 'Not checked yet.', last: 'Last checked:',
    newer: `Version ${NEXT} is available.`, latest: 'You have the latest version.', rate: 'GitHub is limiting requests right now. Try again later.',
    open: 'Open release page', skip: 'Hide this version', title: 'Updates', intro: 'latest release of this project',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`kontrola nové verze: vypnuto, ruční kontrola, pruh, stránka vydání a skrytí verze (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, 'newer');
    await page.goto('/#settings/update');
    const set = page.getByTestId('update-settings');
    await expect(set).toBeVisible();
    await expect(page.getByRole('region', { name: L.title, exact: true })).toBeVisible();
    await expect(set).toContainText(L.intro);
    /* výchozí stav vypnuto, nic se nevolá */
    const toggle = page.getByTestId('update-toggle');
    await expect(toggle).not.toBeChecked();
    await expect(page.getByLabel(L.toggle)).not.toBeChecked();
    await expect(page.getByTestId('update-last')).toHaveText(L.never);
    expect(await checks(page)).toBe(0);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);

    /* ruční kontrola i s vypnutou kontrolou: výsledek v Nastavení, pruh ne */
    await page.getByTestId('update-check').click();
    const result = page.getByTestId('update-result');
    await expect(result).toHaveAttribute('data-state', 'newer');
    await expect(result).toContainText(L.newer);
    await expect(page.getByTestId('update-last')).toContainText(L.last);
    expect(await checks(page)).toBe(1);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    /* poznámky jen jako prostý text: žádné odkazy, značky ani adresy */
    const notes = page.getByTestId('update-notes');
    await notes.locator('summary').click();
    await expect(notes).toContainText('Ops umí víc: odkaz');
    await expect(notes.locator('a, b, img')).toHaveCount(0);
    await expect(notes).not.toContainText('https://');
    await expect(notes).not.toContainText('**');
    await expect.poll(async () => (await stateOf(page)).update).toMatchObject({ enabled: false, lastResult: { ok: true, release: { latest: NEXT, url: URL } } });
    expect((await stateOf(page)).schema).toBe(19);

    /* zapnout: pruh v hlavním okně */
    await toggle.check();
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(L.newer);
    await expect(banner).toHaveAttribute('data-version', NEXT);
    /* stránka vydání jen přes bezpečné otevření odkazu, s ověřenou adresou */
    await banner.getByRole('button', { name: L.open }).click();
    expect(await opened(page)).toEqual([URL]);
    await page.getByTestId('update-open').click();
    expect(await opened(page)).toEqual([URL, URL]);
    /* pruh je vidět i v jiném modulu */
    await page.evaluate(() => { window.location.hash = 'dashboard'; });
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(banner).toBeVisible();
    /* skrýt tuto verzi: pruh zmizí a po načtení znovu se neukáže */
    await banner.getByRole('button', { name: L.skip }).click();
    await expect(banner).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).update.skippedVersion).toBe(NEXT);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    /* v Nastavení zůstane výsledek s poznámkou o skryté verzi */
    await page.evaluate(() => { window.location.hash = 'settings/update'; });
    await expect(page.getByTestId('update-skipped')).toBeVisible();
    await expect(page.getByTestId('update-skip')).toHaveCount(0);
    expect((await stateOf(page)).update).toMatchObject({ enabled: true, skippedVersion: NEXT });
    expect(errors).toEqual([]);
  });

  test(`kontrola nové verze: nejnovější verze a chyba GitHubu (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, 'same');
    await page.goto('/#settings/update');
    await page.getByTestId('update-check').click();
    await expect(page.getByTestId('update-result')).toHaveAttribute('data-state', 'latest');
    await expect(page.getByTestId('update-result')).toHaveText(L.latest);
    await page.getByTestId('update-toggle').check();
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`kontrola nové verze: limit GitHubu se ukáže jako text (${lang})`, async ({ page }) => {
    await seed(page, lang, 'rate');
    await page.goto('/#settings/update');
    await page.getByTestId('update-check').click();
    await expect(page.getByTestId('update-result')).toHaveAttribute('data-error', 'rate');
    await expect(page.getByTestId('update-result')).toHaveText(L.rate);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
  });
}

test('automatická kontrola: zapnutá proběhne chvíli po startu a ukáže pruh', async ({ page }) => {
  await page.clock.install();
  await seed(page, 'cs', 'newer', { update: { enabled: true } });
  await page.goto('/#dashboard');
  await expect(page.locator('h1')).toHaveText('Dashboard');
  expect(await checks(page)).toBe(0);
  await page.clock.runFor(31_000);
  await expect(page.getByTestId('update-banner')).toBeVisible();
  expect(await checks(page)).toBe(1);
  await expect.poll(async () => (await stateOf(page)).update.lastResult?.release?.latest).toBe(NEXT);
});

test('automatická kontrola: vypnutá nic nevolá ani po dlouhé době', async ({ page }) => {
  await page.clock.install();
  await seed(page, 'cs', 'newer');
  await page.goto('/#dashboard');
  await expect(page.locator('h1')).toHaveText('Dashboard');
  await page.clock.runFor(2 * 3600_000);
  expect(await checks(page)).toBe(0);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('importovaný stav s cizí adresou: pruh otevře jen ověřenou stránku vydání', async ({ page }) => {
  await seed(page, 'cs', 'newer', { update: { enabled: true, lastCheck: 1, lastResult: { ok: true, release: { latest: NEXT, url: 'https://evil.example/setup.exe', notes: '<img src=x onerror=alert(1)>' } } } });
  await page.goto('/#dashboard');
  const banner = page.getByTestId('update-banner');
  await expect(banner).toBeVisible();
  await banner.getByTestId('update-banner-open').click();
  expect(await opened(page)).toEqual([URL]);
});
