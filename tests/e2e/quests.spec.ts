/* Milník 3b: Quests (veřejná data ARC Tracker). Seznam úkolů, zaškrtnutí s doplněním předchozích úkolů, detail,
   filtr, předměty k donesení v nákupním seznamu a Planneru, projekty a Zdroje dat. V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';

const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const SNAP = '12_snap_and_salvage';
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const fresh = async (page: Page) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload(); };

test.describe('Quests (čeština)', () => {
  test.beforeEach(async ({ page }) => fresh(page));

  test('seznam, zaškrtnutí s předchozími úkoly, detail, filtr, nákupní seznam a Planner', async ({ page }) => {
    const errors = watchErrors(page);
    await page.getByRole('link', { name: 'Quests' }).click();
    await expect(page.getByRole('tab', { name: 'Úkoly' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('quests-progress')).toHaveText('Splněno 0 z 138');
    await expect(page.getByTestId('quests-count')).toHaveText('138 z 138');

    await page.getByLabel('Hledat úkol').fill('Snap and Salvage');
    const row = page.locator(`tr[data-quest="${SNAP}"]`);
    await expect(row).toHaveAttribute('data-status', 'locked');
    await expect(row).toContainText('Zamčený');
    await expect(row).toContainText('Magnetron');

    /* detail: cíle, předměty k donesení s tím, kolik je v zásobě, odměny, předchozí úkoly */
    await row.getByRole('button', { name: 'Zobrazit detail úkolu Snap and Salvage' }).click();
    const detail = page.getByTestId('quest-detail');
    await expect(detail).toContainText('Cíle');
    await expect(detail).toContainText('Donést ze zásoby');
    await expect(detail).toContainText('mám 0 / 1');
    await expect(detail).toContainText('Cold Storage');

    await row.getByRole('checkbox', { name: 'Splněno: Snap and Salvage' }).check();
    await expect(page.getByText('Splněno; označeno i 7 předchozích úkolů.')).toBeVisible();
    await expect(page.getByTestId('quests-progress')).toHaveText('Splněno 8 z 138');
    await expect(row).toHaveAttribute('data-status', 'done');
    /* odškrtnutí platí jen pro úkol: je zase dostupný a jeho předměty jdou do nákupního seznamu */
    await row.getByRole('checkbox', { name: 'Splněno: Snap and Salvage' }).uncheck();
    await expect(row).toHaveAttribute('data-status', 'active');
    await expect(row).toContainText('Dostupný');
    await expect.poll(async () => Object.keys((await stateOf(page)).quests.done).length).toBe(7);

    await page.getByLabel('Hledat úkol').fill('');
    await page.getByLabel('Zobrazit', { exact: true }).selectOption('done');
    await expect(page.getByTestId('quests-count')).toHaveText('7 z 138');

    await page.goto('/#inventory/shopping');
    const mag = page.locator('tr').filter({ hasText: 'Magnetron' });
    await expect(mag).toContainText('Úkol Snap and Salvage');
    await page.goto('/#inventory/planner');
    const toggle = page.getByLabel('Zahrnout dostupné úkoly (předměty k donesení)');
    await expect(toggle).toBeChecked();
    await expect(page.locator('main')).toContainText('Úkol: Snap and Salvage');
    await toggle.uncheck();
    await expect(page.locator('main')).not.toContainText('Úkol: Snap and Salvage');
    await expect.poll(async () => (await stateOf(page)).planner.includeQuests).toBe(false);
    expect((await stateOf(page)).schema).toBe(15);
    expect(errors).toEqual([]);
  });

  test('projekty a Zdroje dat', async ({ page }) => {
    await page.goto('/#quests/projects');
    await expect(page.getByRole('tab', { name: 'Projekty' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-project]')).toHaveCount(5);
    await expect(page.locator('[data-project="trophy_display_project"]')).toContainText('Fáze 1: Roaming Threats');
    await page.goto('/#settings');
    await expect(page.getByTestId('data-sources-arc')).toHaveText('Úkoly, workshop a projekty: ARC Tracker (arctracker.io), neoficiální, nejsou od Embarku.');
    await expect(page.getByRole('button', { name: /^ARC Tracker/ })).toHaveAttribute('title', 'https://arctracker.io');
    await expect(page.locator('a[href*="arctracker"]')).toHaveCount(0);
    await page.goto('/#workshop');
    await expect(page.getByTestId('ws-verified')).toContainText('Požadavky stanic odpovídají veřejným datům ARC Tracker');
  });
});

test.describe('Quests (English)', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => fresh(page));

  test('list, tick, filter; no Czech text', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#quests');
    await expect(page.getByRole('tab', { name: 'Quests' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('quests-progress')).toHaveText('0 of 138 completed');
    await page.getByLabel('Search quests').fill('Snap and Salvage');
    const row = page.locator(`tr[data-quest="${SNAP}"]`);
    await expect(row).toContainText('Locked');
    await row.getByRole('checkbox', { name: 'Completed: Snap and Salvage' }).check();
    await expect(page.getByText('Completed; 7 earlier quests marked too.')).toBeVisible();
    await expect(page.getByTestId('quests-progress')).toHaveText('8 of 138 completed');
    await row.getByRole('button', { name: 'Show details of quest Snap and Salvage' }).click();
    await expect(page.getByTestId('quest-detail')).toContainText('Objectives');
    const cz = await page.evaluate(re => [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && new RegExp(re).test(e.textContent || '')).map(e => e.textContent), CZ.source);
    expect(cz).toEqual([]);
    await page.goto('/#quests/projects');
    await expect(page.locator('[data-project]')).toHaveCount(5);
    await page.goto('/#settings');
    await expect(page.getByTestId('data-sources-arc')).toHaveText('Quests, workshop and projects: ARC Tracker (arctracker.io), unofficial, not from Embark.');
    expect(errors).toEqual([]);
  });
});
