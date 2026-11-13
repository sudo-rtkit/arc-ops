/* 0.21.0: původ hodnot v obou jazycích. Tečka s popiskem u počtu v Zásobě po ruční úpravě a po importu ze snímku
   (výběr souboru), tečka u pole profilu (mince ze snímku), řádek „Původ“ v kartě předmětu a přehled v Nastavení. */
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TOOLTIP = fileURLToPath(new URL('../fixtures/vision/sample-stash-all-tooltip-1080p.png', import.meta.url));
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function seed(page: Page, lang: 'cs' | 'en') {
  const state = { schema: 18, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang } };
  await page.addInitScript(s => {
    if (sessionStorage.getItem('prov')) return;
    sessionStorage.setItem('prov', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify(state));
}

const T = {
  cs: {
    search: 'Hledat materiál', have: (n: string) => `Mám ${n}`, write: 'Zapsat', coins: 'Mince', level: 'Level',
    manual: /^Ručně \d{1,2}\.\s?\d{1,2}\.\s?\d{4} \d{2}:\d{2}$/, aria: /^Původ: Ručně /,
    shot: /^Ze snímku \(soubor\) .+ · jistota \d+\s?% · potvrzeno · dříve: Ručně /,
    shotPlain: /^Ze snímku \(soubor\) .+ · potvrzeno$/, origin: 'Původ', def: 'Výchozí hodnota', panel: 'Původ dat', stock: 'Zásoba',
  },
  en: {
    search: 'Search materials', have: (n: string) => `I have ${n}`, write: 'Write', coins: 'Coins', level: 'Level',
    manual: /^Manually \S.+ \d{2}:\d{2}$/, aria: /^Origin: Manually /,
    shot: /^From a screenshot \(file\) .+ · confidence \d+\s?% · confirmed · before: Manually /,
    shotPlain: /^From a screenshot \(file\) .+ · confirmed$/, origin: 'Origin', def: 'Default value', panel: 'Data origin', stock: 'Stock',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test.describe(`původ hodnot (${lang})`, () => {
    test('ruční úprava: tečka s popiskem v Zásobě, v profilu a v kartě předmětu; přehled v Nastavení', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, lang);
      await page.goto('/#inventory');
      await page.getByLabel(L.search).fill('Magnetic Accelerator');
      const input = page.getByRole('textbox', { name: L.have('Magnetic Accelerator'), exact: true });
      const row = page.locator('tr', { has: input });
      /* výchozí hodnota tečku nemá */
      await expect(row.getByTestId('prov-dot')).toHaveCount(0);
      await input.fill('4');
      await input.press('Enter');
      const dot = row.getByTestId('prov-dot');
      await expect(dot).toHaveAttribute('title', L.manual);
      await expect(dot).toHaveAttribute('aria-label', L.aria);
      await expect(dot).toHaveAttribute('data-src', 'manual');

      /* karta předmětu: řádek „Původ“ */
      await row.locator('[data-item-link="Magnetic Accelerator"]').click();
      const card = page.getByTestId('item-card');
      await expect(card.locator('[data-fact="origin"] dt')).toHaveText(L.origin);
      await expect(page.getByTestId('item-card-origin')).toHaveText(L.manual);
      await page.keyboard.press('Escape');

      /* profil: pole bez zadání ukazuje výchozí hodnotu, ruční úprava „ručně“ */
      await page.goto('/#profile');
      const coins = page.locator('.field', { has: page.getByLabel(L.coins, { exact: true }) });
      await expect(coins.getByTestId('prov-dot')).toHaveAttribute('title', L.def);
      const level = page.getByLabel(L.level, { exact: true });
      await level.fill('12');
      await level.press('Enter');
      await expect(page.locator('.field', { has: level }).getByTestId('prov-dot')).toHaveAttribute('title', L.manual);

      /* Nastavení: přehled oblastí a poslední zápisy */
      await page.goto('/#settings');
      const panel = page.getByRole('region', { name: L.panel });
      await expect(panel.locator('tr[data-domain="inv"] td').nth(1)).toHaveText('1');
      await expect(panel.locator('tr[data-domain="profile"] td').nth(1)).toHaveText('1');
      await expect(panel.getByTestId('prov-log')).toBeVisible();

      await expect.poll(async () => (await stateOf(page))?.provenance?.recs?.inv?.['Magnetic Accelerator']?.src).toBe('manual');
      const st = await stateOf(page);
      expect(st.schema).toBe(18);
      expect(st.provenance.recs.inv['Magnetic Accelerator']).toMatchObject({ src: 'manual', ver: true });
      expect(errors).toEqual([]);
    });

    test('import ze snímku (soubor): tečka ukáže zdroj, jistotu, potvrzení a předchozí ruční hodnotu', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, lang);
      /* nejdřív ruční hodnota, ať je vidět i předchozí zdroj */
      await page.goto('/#inventory');
      await page.getByLabel(L.search).fill('Magnetic Accelerator');
      const input = page.getByRole('textbox', { name: L.have('Magnetic Accelerator'), exact: true });
      await input.fill('1');
      await input.press('Enter');
      await expect(page.locator('tr', { has: input }).getByTestId('prov-dot')).toHaveAttribute('data-src', 'manual');

      await page.goto('/#inventory/import');
      await page.getByTestId('scan-file').setInputFiles(TOOLTIP);
      await expect(page.locator('.scan-table tbody tr')).toHaveCount(13);
      await page.getByRole('button', { name: L.write, exact: true }).click();
      await expect(page.getByTestId('scan-done')).toBeVisible();

      await page.goto('/#inventory');
      await page.getByLabel(L.search).fill('Magnetic Accelerator');
      const after = page.getByRole('textbox', { name: L.have('Magnetic Accelerator'), exact: true });
      await expect(after).toHaveValue('8');
      const dot = page.locator('tr', { has: after }).getByTestId('prov-dot');
      await expect(dot).toHaveAttribute('data-src', 'screenshot-file');
      await expect(dot).toHaveAttribute('title', L.shot);

      /* mince ze snímku v profilu */
      await page.goto('/#profile');
      const coins = page.locator('.field', { has: page.getByLabel(L.coins, { exact: true }) });
      await expect(coins.getByTestId('prov-dot')).toHaveAttribute('title', L.shotPlain);

      await expect.poll(async () => (await stateOf(page))?.provenance?.recs?.inv?.['Magnetic Accelerator']?.src).toBe('screenshot-file');
      const st = await stateOf(page);
      expect(st.provenance.recs.inv['Magnetic Accelerator']).toMatchObject({ ver: true, prev: { src: 'manual' } });
      expect(st.provenance.recs.inv['Magnetic Accelerator'].conf).toBeGreaterThan(0.5);
      expect(errors).toEqual([]);
    });
  });
}
