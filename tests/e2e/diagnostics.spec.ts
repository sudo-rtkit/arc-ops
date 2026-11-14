/* 0.28.0: Nastavení → Diagnostika v obou jazycích. V prohlížeči (E2E) deník neexistuje: panel jen vysvětlí, že vše
   zůstává na tomto počítači, a že deník je jen v aplikaci pro Windows (žádné tlačítko exportu ani mazání). Sekce jde
   najít hledáním. Nezachycená chyba v okně nic neshodí a v prohlížeči se nikam neposílá; upozornění na nečekané
   ukončení se v prohlížeči neukáže. */
import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function seed(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('dg')) return;
    sessionStorage.setItem('dg', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify({ schema: 19, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang } }));
}

const T = {
  cs: { title: 'Diagnostika', intro: 'Všechno zůstává na tomto počítači a nic se nikam neposílá', privacy: '%USERPROFILE%', na: 'Deník chyb je jen v aplikaci pro Windows.', search: 'Hledat (Ctrl+K)', dialog: 'Hledat všude' },
  en: { title: 'Diagnostics', intro: 'Everything stays on this PC and nothing is sent anywhere', privacy: '%USERPROFILE%', na: 'The error log is only in the Windows app.', search: 'Search (Ctrl+K)', dialog: 'Search everywhere' },
};

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Nastavení → Diagnostika: vysvětlení a jen v aplikaci pro Windows (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang);
    await page.goto('/#settings/diag');
    const panel = page.getByTestId('diag-panel');
    await expect(page.getByRole('heading', { name: L.title, exact: true })).toBeVisible();
    await expect(panel.getByTestId('diag-intro')).toContainText(L.intro);
    await expect(panel.getByTestId('diag-privacy')).toContainText(L.privacy);
    await expect(panel.getByTestId('diag-na')).toHaveText(L.na);
    await expect(panel.getByTestId('diag-export')).toHaveCount(0);
    await expect(panel.getByTestId('diag-entries')).toHaveCount(0);
    /* v prohlížeči žádné upozornění na nečekané ukončení */
    await expect(page.getByTestId('unclean-exit')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`Diagnostika jde najít hledáním (${lang})`, async ({ page }) => {
    await seed(page, lang);
    await page.goto('/#dashboard');
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: L.dialog });
    await expect(dialog).toBeVisible();
    await page.getByTestId('search-input').fill(L.title);
    await dialog.getByRole('option').filter({ hasText: L.title }).first().click();
    await expect(page).toHaveURL(/#settings\/diag$/);
    await expect(page.getByTestId('diag-panel')).toBeVisible();
  });
}

test('nezachycená chyba a odmítnutý slib okno neshodí (žádný náhradní obsah okna)', async ({ page }) => {
  await seed(page, 'cs');
  await page.goto('/#settings/diag');
  await expect(page.getByTestId('diag-panel')).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('test: uncaught'); }, 0);
    void Promise.reject(new Error('test: rejected'));
  });
  await page.waitForTimeout(200);
  await expect(page.getByTestId('diag-panel')).toBeVisible();
  await expect(page.getByTestId('crash-fallback')).toHaveCount(0);
});
