/* 0.22.1: „Buddy propouští kliky do hry (doporučeno)“ v Nastavení → Buddy a zkratka. V prohlížeči se okno buddyho
   nevytváří (propouštění myši a odmítnutí kliku při hře v popředí řeší Rust, viz cargo test a ruční smoke test);
   tady se ověřuje volba v obou jazycích: výchozí zapnuto, vysvětlení, vypnutí a zapnutí se uloží a přežije
   načtení stránky. */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const T = {
  cs: { label: 'Buddy propouští kliky do hry (doporučeno)', hint: /Během hry ovládáš Opse zkratkou/ },
  en: { label: 'Buddy lets clicks through to the game (recommended)', hint: /During play you control Ops with the hotkey/ },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Buddy propouští kliky do hry: výchozí zapnuto, vypnutí se uloží (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('pass-seeded')) return;
      sessionStorage.setItem('pass-seeded', '1');
      localStorage.clear();
      localStorage.setItem('arcops:state', s);
    }, JSON.stringify({
      schema: 18,
      buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS', autoOpen: true },
      opsPrefs: { tutorial: { status: 'done', step: 'end' } },
      whatsNew: { seen: '0.22.1' },
      settings: { autoSnapshot: true, lang },
    }));
    await page.goto('/#settings');
    const sw = page.getByTestId('ops-passclicks');
    await expect(sw).toBeChecked();
    await expect(page.getByText(L.label, { exact: true })).toBeVisible();
    await expect(page.getByText(L.hint)).toBeVisible();
    await expect.poll(async () => (await stateOf(page))?.opsPrefs?.passClicks).toBe(true);
    await sw.click();
    await expect(sw).not.toBeChecked();
    await expect.poll(async () => (await stateOf(page)).opsPrefs.passClicks).toBe(false);
    await page.reload();
    await expect(page.getByTestId('ops-passclicks')).not.toBeChecked();
    await page.getByTestId('ops-passclicks').click();
    await expect.poll(async () => (await stateOf(page)).opsPrefs.passClicks).toBe(true);
    expect(errors).toEqual([]);
  });
}
