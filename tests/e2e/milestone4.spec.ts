/* Milník 4: rada nech / recykluj / prodej v Zásobě a Vybavení, Úklid stashe, Item Database (recyklace, blueprinty,
   obchodníci, vlastní tier list), porovnání 2–4 zbraní, rozpis událostí v Maps a hotové fáze projektů. V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';

const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const AEC = 'Advanced Electrical Components';
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
/* Stav schématu 4 (před milníkem 4): načte se migrací 4 → 5. */
const seed = (lang: 'cs' | 'en') => ({
  schema: 4,
  inventory: { 'Metal Parts': 100, [AEC]: 2 },
  items: {
    Spectrometer: { key: 'Spectrometer', name: 'Spectrometer', category: 'other', count: 4 },
    'Anvil Blueprint': { key: 'Anvil Blueprint', name: 'Anvil Blueprint', category: 'other', count: 1 },
  },
  settings: { autoSnapshot: true, lang },
});
/* Stav se zapíše před startem aplikace a jen jednou za test (jinak by ho přepsalo uložení při zavření stránky). */
async function start(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('m4-seeded')) return;
    sessionStorage.setItem('m4-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify(seed(lang)));
  await page.goto('/');
}
const row = (page: Page, testItem: string) => page.locator(`tr[data-item="${testItem}"]`);

test.describe('Milník 4 (čeština)', () => {
  test.beforeEach(async ({ page }) => start(page, 'cs'));

  test('rada v Zásobě a Vybavení, vždy nechat, Úklid stashe', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory');
    const mp = page.locator('.mat-table tr').filter({ has: page.getByText('Metal Parts', { exact: true }) }).first();
    await expect(mp.locator('.advice')).toHaveAttribute('data-advice', 'keep');
    await expect(mp.locator('.advice')).toContainText('Nech');
    await expect(mp.locator('.advice')).toContainText('Gunsmith 1: 20 ze 20');
    await expect(mp.locator('.advice')).toHaveAttribute('title', /Refiner 1: 60 ze 60/);
    await expect(mp.locator('.advice')).toContainText('Přebytek 20');

    await page.getByRole('tab', { name: 'Vybavení' }).click();
    await expect(row(page, 'Spectrometer').locator('.advice')).toHaveAttribute('data-advice', 'recycle');
    await expect(row(page, 'Anvil Blueprint').locator('.advice')).toHaveAttribute('data-advice', 'keep');
    await expect(row(page, 'Anvil Blueprint').locator('.advice')).toContainText('Nenaučený blueprint');

    await page.getByRole('tab', { name: 'Úklid stashe' }).click();
    await expect(page.getByTestId('cleanup-summary')).toContainText('Uvolní se');
    await expect(row(page, 'Metal Parts')).toBeVisible();
    await expect(row(page, 'Spectrometer')).toHaveAttribute('data-advice', 'recycle');
    await expect(row(page, 'Spectrometer')).toContainText(`1× ${AEC} (chybí)`);
    await row(page, 'Spectrometer').getByRole('button', { name: 'Vždy nechat: Spectrometer' }).click();
    await expect(row(page, 'Spectrometer')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).advice?.keep).toEqual({ Spectrometer: true });

    await page.getByRole('tab', { name: 'Vybavení' }).click();
    const sp = row(page, 'Spectrometer').locator('.advice');
    await expect(sp).toContainText('Vždy nechat (tvoje volba)');
    await sp.getByRole('button', { name: 'Zrušit „vždy nechat“: Spectrometer' }).click();
    await expect(sp).toHaveAttribute('data-advice', 'recycle');
    expect((await stateOf(page)).schema).toBe(19);
    expect(errors).toEqual([]);
  });

  test('Item Database: recyklace, blueprinty, obchodníci', async ({ page }) => {
    const errors = watchErrors(page);
    await page.getByRole('link', { name: 'Item Database' }).click();
    await expect(page.getByRole('tab', { name: 'Recyklace' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Materiál', { exact: true }).selectOption('Sensors');
    const src = page.getByTestId('recycle-sources');
    await expect(src.locator('tr[data-owned="yes"]')).toContainText('Spectrometer');
    await page.getByLabel('Jen vlastněné').check();
    await expect(page.getByTestId('recycle-sources-count')).toHaveText('1 předmět');
    await page.getByLabel('Jen vlastněné').uncheck();
    await page.getByLabel('Hledat předmět').fill('Spectrometer');
    await expect(page.getByTestId('recycle-items')).toContainText(AEC);

    await page.getByRole('tab', { name: 'Blueprinty' }).click();
    await expect(page.getByTestId('bp-progress')).toHaveText(/^Naučeno 0 z \d+$/);
    await page.getByLabel('Hledat blueprint').fill('Anvil');
    await expect(page.locator('tr[data-blueprint="Anvil Blueprint"]')).toContainText('ve vybavení 1');
    await page.getByLabel('Naučeno: Anvil Blueprint').check();
    await expect(page.getByTestId('bp-progress')).toHaveText(/^Naučeno 1 z \d+$/);
    await page.getByLabel('Jen chybějící').check();
    await expect(page.locator('tr[data-blueprint="Anvil Blueprint"]')).toHaveCount(0);
    await expect.poll(async () => Object.keys((await stateOf(page)).blueprints ?? {})).toEqual(['Anvil Blueprint']);

    await page.getByRole('tab', { name: 'Obchodníci' }).click();
    await expect(page.getByTestId('traders-date')).toContainText('ze dne 2026-11-10');
    await page.getByLabel('Obchodník').selectOption('Celeste');
    await expect(page.getByTestId('traders-count')).toHaveText(/nabíd/);
    await expect(page.locator('main table')).toContainText('/ 24 h');

    /* naučený blueprint už ve Vybavení nemá radu „nech“ */
    await page.goto('/#inventory/equipment');
    await expect(row(page, 'Anvil Blueprint').locator('.advice')).not.toHaveAttribute('data-advice', 'keep');
    expect(errors).toEqual([]);
  });

  test('vlastní tier list: přetažení myší a klávesnice; porovnání 2–4 zbraní; rozpis událostí; fáze projektu', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#items/tiers');
    const board = page.getByTestId('tier-board');
    await page.locator('[data-tl-id="anvil"]').dragTo(board.locator('[data-tier="S"]'));
    await expect(board.locator('[data-tier="S"] [data-tl-id="anvil"]')).toBeVisible();
    await page.locator('[data-tl-id="anvil"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(board.locator('[data-tier="A"] [data-tl-id="anvil"]')).toBeFocused();
    await expect(page.getByTestId('tier-live')).toHaveText('Anvil: tier A');
    await page.locator('[data-tl-id="ferro"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(board.locator('[data-tier="D"] [data-tl-id="ferro"]')).toBeVisible();
    await expect.poll(async () => (await stateOf(page)).tierList?.weapons).toMatchObject({ A: ['anvil'], D: ['ferro'] });
    await page.locator('[data-tl-id="ferro"]').focus();
    await page.keyboard.press('Delete');
    await expect(board.locator('[data-tier="D"] [data-tl-id="ferro"]')).toHaveCount(0);
    /* předměty: hledání v katalogu */
    await page.getByRole('button', { name: 'Předměty' }).click();
    await page.getByLabel('Hledat k zařazení').fill('Spectro');
    await page.locator('[data-tl-id="Spectrometer"]').dragTo(board.locator('[data-tier="B"]'));
    await expect.poll(async () => (await stateOf(page)).tierList?.items.B).toEqual(['Spectrometer']);

    await page.goto('/#weapons');
    for (const w of ['Anvil', 'Ferro', 'Osprey', 'Kettle']) await page.getByLabel(`Porovnat ${w}`).check();
    await expect(page.getByLabel('Porovnat Renegade')).toBeDisabled();
    const cmp = page.getByTestId('weapon-compare');
    await expect(cmp.locator('thead th')).toHaveCount(5);
    await expect(cmp.locator('tr[data-stat="dmg"] td.best')).toHaveCount(1);
    await expect(cmp.locator('tr[data-stat="dmg"] td.best')).toContainText('45');
    await expect(cmp).toContainText('Vlastní tier list');

    await page.goto('/#maps');
    await expect(page.getByRole('heading', { name: 'Rozpis událostí' })).toBeVisible();
    await expect(page.getByTestId('events-link')).toContainText('Podmínky map (arcraiders.com)');

    await page.goto('/#quests/projects');
    const card = page.locator('[data-project="souls_offering_project"]');
    await card.getByRole('button', { name: /: přidat$/ }).click();
    await expect.poll(async () => (await stateOf(page)).projects ?? null).toEqual({ souls_offering_project: 1 });
    expect(errors).toEqual([]);
  });
});

test.describe('Milestone 4 (English)', () => {
  test.beforeEach(async ({ page }) => start(page, 'en'));

  test('advice, stash cleanup, Item Database, tier list, comparison and event schedule in English', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory/equipment');
    await expect(page.getByRole('columnheader', { name: 'Advice' })).toBeVisible();
    await expect(row(page, 'Spectrometer').locator('.advice')).toContainText('Recycle');
    await expect(row(page, 'Anvil Blueprint').locator('.advice')).toContainText('Blueprint not learned');
    await page.getByRole('tab', { name: 'Stash cleanup' }).click();
    await expect(page.getByTestId('cleanup-summary')).toContainText('Frees');
    await expect(row(page, 'Spectrometer')).toContainText(`1× ${AEC} (missing)`);
    expect(CZ.test(await page.locator('main').innerText())).toBe(false);

    await page.goto('/#items');
    await expect(page.getByRole('tab', { name: 'Recycling' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Material', { exact: true }).selectOption('Sensors');
    await expect(page.getByTestId('recycle-sources')).toContainText('Spectrometer');
    expect(CZ.test(await page.locator('main').innerText())).toBe(false);
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await expect(page.getByTestId('bp-progress')).toHaveText(/^Learned 0 of \d+$/);
    await page.getByRole('tab', { name: 'Traders' }).click();
    await expect(page.getByTestId('traders-date')).toContainText('from 2026-11-10');
    expect(CZ.test(await page.locator('main').innerText())).toBe(false);
    await page.getByRole('tab', { name: 'My tier list' }).click();
    await page.locator('[data-tl-id="osprey"]').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('tier-live')).toHaveText('Osprey: tier S');
    expect(CZ.test(await page.locator('main').innerText())).toBe(false);

    await page.goto('/#weapons');
    await page.getByLabel('Compare Anvil').check();
    await expect(page.getByTestId('weapon-compare').locator('..').locator('..')).toContainText('Pick at least two weapons');
    await page.getByLabel('Compare Osprey').check();
    await expect(page.getByTestId('weapon-compare')).toContainText('Damage');
    await expect(page.getByTestId('weapon-compare')).toContainText('My tier list');

    await page.goto('/#maps');
    await expect(page.getByRole('heading', { name: 'Event schedule' })).toBeVisible();
    await expect(page.getByTestId('events-link')).toContainText('Map conditions (arcraiders.com)');
    await page.goto('/#settings');
    await expect(page.getByTestId('data-sources-items')).toContainText('ARC Tracker /api/items');
    expect(errors).toEqual([]);
  });
});
