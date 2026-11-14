/* 0.24.0: původ hodnot v obou jazycích. Tečky u počtů materiálů v receptech dílny a v nákupním seznamu, „Potvrdit“
   u nepotvrzené hodnoty a „Potvrdit vše v oblasti“ v Nastavení → Původ dat. Stav ze schématu 17 dostane při
   načtení původ „ze starší verze“ (nepotvrzený), takže je co potvrzovat. */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function seed(page: Page, lang: 'cs' | 'en') {
  const state = { schema: 17, inventory: { 'Metal Parts': 5, 'Rubber Parts': 4 }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang } };
  await page.addInitScript(s => {
    if (sessionStorage.getItem('provc')) return;
    sessionStorage.setItem('provc', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify(state));
}

const T = {
  cs: {
    have: (n: string) => `Mám ${n}`, open: /^Ze starší verze čas neznámý · nepotvrzeno$/, done: /^Ze starší verze čas neznámý · potvrzeno$/,
    confirm: /^Potvrdit hodnotu \(Ze starší verze/, panel: 'Původ dat', area: 'Potvrdit vše v oblasti Zásoba', areaText: 'Potvrdit vše v oblasti',
  },
  en: {
    have: (n: string) => `I have ${n}`, open: /^From an older version time unknown · not confirmed$/, done: /^From an older version time unknown · confirmed$/,
    confirm: /^Confirm value \(From an older version/, panel: 'Data origin', area: 'Confirm all in area Stock', areaText: 'Confirm all in area',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test.describe(`původ hodnot: potvrzení (${lang})`, () => {
    test('tečky u materiálů v receptech dílny a v nákupním seznamu; „Potvrdit“ potvrdí jednu hodnotu', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, lang);
      await page.goto('/#workshop');
      const gunsmith = page.locator('article[data-station="gunsmith"]');
      const mat = (scope: ReturnType<Page['locator']>, name: string) => scope.locator('li, tr', { has: page.getByRole('textbox', { name: L.have(name), exact: true }) });
      const wMetal = mat(gunsmith, 'Metal Parts');
      await expect(wMetal.getByTestId('prov-dot')).toHaveAttribute('title', L.open);
      await expect(wMetal.getByTestId('prov-dot')).toHaveAttribute('data-src', 'migration');
      await expect(wMetal.getByTestId('prov-confirm')).toHaveAttribute('aria-label', L.confirm);
      await expect(mat(gunsmith, 'Rubber Parts').getByTestId('prov-dot')).toHaveAttribute('title', L.open);

      /* nákupní seznam: stejná tečka; potvrzení tady */
      await page.goto('/#inventory/shopping');
      const sMetal = page.locator('tr', { has: page.getByRole('textbox', { name: L.have('Metal Parts'), exact: true }) }).first();
      await expect(sMetal.getByTestId('prov-dot')).toHaveAttribute('title', L.open);
      await sMetal.getByTestId('prov-confirm').click();
      await expect(sMetal.getByTestId('prov-dot')).toHaveAttribute('title', L.done);
      await expect(sMetal.getByTestId('prov-confirm')).toHaveCount(0);
      await expect.poll(async () => (await stateOf(page))?.provenance?.recs?.inv?.['Metal Parts']?.ver).toBe(true);

      /* dílna: Metal Parts potvrzené, Rubber Parts dál čeká; hodnota se nezměnila */
      await page.goto('/#workshop');
      await expect(wMetal.getByTestId('prov-dot')).toHaveAttribute('title', L.done);
      await expect(wMetal.getByTestId('prov-confirm')).toHaveCount(0);
      await expect(mat(gunsmith, 'Rubber Parts').getByTestId('prov-confirm')).toHaveCount(1);
      const st = await stateOf(page);
      expect(st.inventory).toMatchObject({ 'Metal Parts': 5, 'Rubber Parts': 4 });
      expect(st.provenance.recs.inv['Metal Parts']).toEqual({ src: 'migration', at: 0, ver: true });
      expect(st.provenance.recs.inv['Rubber Parts'].ver).toBe(false);
      expect(errors).toEqual([]);
    });

    test('Nastavení → Původ dat: „Potvrdit vše v oblasti“', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, lang);
      await page.goto('/#settings');
      const panel = page.getByRole('region', { name: L.panel });
      const row = panel.locator('tr[data-domain="inv"]');
      await expect(row.locator('td').nth(3)).toHaveText('2');
      const btn = row.getByRole('button', { name: L.area, exact: true });
      await expect(btn).toHaveText(L.areaText);
      await btn.click();
      await expect(row.locator('td').nth(3)).toHaveText('—');
      await expect(row.getByTestId('prov-confirm-area')).toHaveCount(0);
      await expect.poll(async () => Object.values((await stateOf(page))?.provenance?.recs?.inv ?? {}).map(r => (r as { ver: boolean }).ver)).toEqual([true, true]);
      /* jiná oblast bez nepotvrzených hodnot tlačítko nemá */
      await expect(panel.locator('tr[data-domain="skills"]').getByTestId('prov-confirm-area')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
