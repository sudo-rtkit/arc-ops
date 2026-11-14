/* 0.23.0: loadout builder (sestava, souhrn hodnoty, váhy a rizika, dostupnost ve skrýši, nákupní seznam, duplikace
   a porovnání, předvyplnění ze snímku, použití v Přípravě na raid) a panel Zátěž aplikace v Nastavení. V obou jazycích.
   Snímek je umělá obrazovka FINDINGS z veřejného vzoru (tests/vision/findings.ts), žádný vlastní snímek hráče. */
import { expect, test, type Page } from '@playwright/test';
import { syntheticFindings, toPngBase64 } from '../vision/findings';

const FINDINGS = Buffer.from(toPngBase64(syntheticFindings()), 'base64');
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function seed(page: Page, state: Record<string, unknown>) {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('lo')) return;
    sessionStorage.setItem('lo', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify({ schema: 18, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, ...state }));
}

const T = {
  cs: {
    newLo: 'Nový loadout', name: 'Název', save: 'Uložit loadout', backpack: 'Batoh (BACKPACK)', safe: 'Bezpečná kapsa (SAFE POCKET)', add: 'Přidat',
    shield: 'Štít', shop: 'Do nákupního seznamu', dup: 'Duplikovat', edit: 'Upravit', copy: /\(kopie\)$/, removeBandage: 'Batoh (BACKPACK): odebrat Bandage', compare: 'Porovnat loadouty',
    kindFree: 'Volný loadout', noSafe: 'tento loadout ji nemá', scanOpen: 'Ze snímku obrazovky', apply: 'Předvyplnit loadout', loadoutSel: 'Uložený loadout',
    shopTitle: 'Pro loadouty', perf: 'Zátěž aplikace', perfNa: 'jen v desktopové aplikaci', fps: 'FPS hry', low: 'Režim nízké zátěže', lowWait: 'začne šetřit',
  },
  en: {
    newLo: 'New loadout', name: 'Name', save: 'Save loadout', backpack: 'Backpack (BACKPACK)', safe: 'Safe pocket (SAFE POCKET)', add: 'Add',
    shield: 'Shield', shop: 'Add to shopping list', dup: 'Duplicate', edit: 'Edit', copy: /\(copy\)$/, removeBandage: 'Backpack (BACKPACK): remove Bandage', compare: 'Compare loadouts',
    kindFree: 'Free loadout', noSafe: 'this loadout has none', scanOpen: 'From a screenshot', apply: 'Prefill loadout', loadoutSel: 'Saved loadout',
    shopTitle: 'For loadouts', perf: 'App load', perfNa: 'only in the Windows desktop app', fps: 'Game FPS', low: 'Low-impact mode', lowWait: 'starts saving',
  },
} as const;

async function addItem(dlg: ReturnType<Page['getByRole']>, label: string, name: string, qty: number, add: string) {
  const list = dlg.locator('fieldset.item-list').filter({ has: dlg.page().locator('legend', { hasText: label }) });
  await list.locator('input[list]').fill(name);
  await list.locator('input.num-input').last().fill(String(qty));
  await list.getByRole('button', { name: `${label}: ${add}` }).click();
}

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];

  test(`loadout builder: sestava, souhrn, dostupnost, nákupní seznam, porovnání a Příprava na raid (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { settings: { autoSnapshot: false, lang }, inventory: { Bandage: 2 }, profile: { level: 12, rounds: 3 }, stations: { gear: 1 } });
    await page.goto('/#weapons/loadouts');
    await page.getByRole('button', { name: L.newLo }).first().click();
    const dlg = page.getByRole('dialog', { name: L.newLo });
    await dlg.getByLabel(L.name, { exact: true }).fill('Money Ferro');
    await dlg.getByLabel(L.shield, { exact: true }).fill('Light Shield');
    await addItem(dlg, L.backpack, 'Bandage', 5, L.add);
    await addItem(dlg, L.safe, 'Agave', 1, L.add);
    /* souhrn: hodnota 640 + 5×250 + 1000, v riziku bez bezpečné kapsy, váha proti 30 kg */
    const sum = dlg.getByTestId('lo-summary');
    await expect(sum.getByTestId('lo-value')).toContainText(/2[\s,. ]?890/);
    await expect(sum.getByTestId('lo-risk')).toContainText(/1[\s,. ]?890/);
    await expect(sum.getByTestId('lo-weight')).toContainText('/ 30');
    /* dostupnost: Bandage 2 z 5 → chybí 3; štít a Agave chybí taky */
    const avail = dlg.getByTestId('lo-avail-table');
    await expect(avail.locator('tr[data-item="Bandage"] td').nth(3)).toHaveText('3×');
    await expect(avail.locator('tr[data-item="Light Shield"]')).toHaveClass(/lo-missing/);
    await dlg.getByText(L.shop, { exact: true }).click();
    /* volný loadout nemá bezpečnou kapsu: přepnutí ji schová, zpět na vlastní */
    await dlg.getByRole('button', { name: L.kindFree }).click();
    await expect(dlg.getByTestId('lo-no-safe')).toContainText(L.noSafe);
    await expect(sum.getByTestId('lo-weight')).toContainText('/ 35');
    await dlg.getByRole('button', { name: L.kindFree === 'Volný loadout' ? 'Vlastní loadout' : 'Custom loadout' }).click();
    await addItem(dlg, L.safe, 'Agave', 1, L.add);
    await dlg.getByRole('button', { name: L.save }).click();
    await expect(dlg).toBeHidden();

    const card = page.locator('[data-loadout="Money Ferro"]');
    await expect(card.getByTestId('lo-card-missing')).toContainText('3× Bandage');
    await expect.poll(async () => (await stateOf(page)).loadouts?.[0]).toMatchObject({
      name: 'Money Ferro', kind: 'custom', shield: 'Light Shield', shop: true, items: [{ name: 'Bandage', qty: 5 }], safe: [{ name: 'Agave', qty: 1 }],
      slots: { backpack: 20, quickUse: 5, augmented: 1, safe: 3, weight: 30 },
    });
    expect((await stateOf(page)).schema).toBe(19);

    /* nákupní seznam: chybějící předměty označeného loadoutu */
    await page.goto('/#inventory/shopping');
    const shop = page.getByTestId('loadout-shop');
    await expect(page.getByRole('heading', { name: L.shopTitle })).toBeVisible();
    await expect(shop.locator('tr[data-item="Bandage"] td').nth(1)).toHaveText('3×');
    await expect(shop.locator('tr[data-item="Light Shield"]')).toContainText('Money Ferro');

    /* šablona: duplikace a porovnání vedle sebe */
    await page.goto('/#weapons/loadouts');
    await page.getByRole('button', { name: `${L.dup} Money Ferro`, exact: true }).click();
    await expect(page.locator('[data-loadout]')).toHaveCount(2);
    await expect.poll(async () => (await stateOf(page)).loadouts?.length).toBe(2);
    const copyName = (await stateOf(page)).loadouts[1].name as string;
    expect(copyName).toMatch(L.copy);
    /* kopie bez batohu (Bandage) */
    await page.getByRole('button', { name: `${L.edit} ${copyName}`, exact: true }).click();
    const edit = page.getByRole('dialog');
    await edit.getByRole('button', { name: L.removeBandage }).click();
    await edit.getByRole('button', { name: L.save }).click();
    await expect(edit).toBeHidden();
    const cmp = page.getByTestId('lo-compare');
    await expect(page.getByRole('heading', { name: L.compare })).toBeVisible();
    await expect(cmp.locator('tr[data-metric="value"] td').nth(1)).toContainText(/2[\s,. ]?890/);
    await expect(cmp.locator('tr[data-metric="value"] td').nth(3)).toContainText(/−?-?1[\s,. ]?250/);
    await expect(cmp.locator('tr[data-metric="missing"] td').nth(1)).toHaveText('5');

    /* Příprava na raid: vybraný loadout ukáže souhrn a co chybí */
    await page.goto('/#raid');
    await page.getByLabel(L.loadoutSel).selectOption({ label: 'Money Ferro · Money run' });
    await expect(page.getByTestId('raid-loadout-sum').getByTestId('lo-risk')).toContainText(/1[\s,. ]?890/);
    await expect(page.getByTestId('raid-loadout-missing')).toContainText('3× Bandage');
    expect(errors).toEqual([]);
  });

  test(`loadout ze snímku: kontrola a předvyplnění (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { settings: { autoSnapshot: false, lang } });
    await page.goto('/#weapons/loadouts');
    await page.getByRole('button', { name: L.newLo }).first().click();
    const dlg = page.getByRole('dialog', { name: L.newLo });
    await dlg.getByRole('button', { name: L.scanOpen }).click();
    await dlg.getByTestId('lo-scan-file').setInputFiles({ name: 'findings.png', mimeType: 'image/png', buffer: FINDINGS });
    const scan = dlg.getByTestId('lo-scan');
    await expect(scan.getByTestId('lo-scan-found')).toBeVisible();
    await expect(scan.locator('tr[data-row]').first()).toBeVisible();
    const rows = await scan.locator('tr[data-row]').count();
    expect(rows).toBeGreaterThan(3);
    /* jeden řádek vynechám */
    await scan.locator('tr[data-row] input[type=checkbox]').first().uncheck();
    await scan.getByRole('button', { name: L.apply }).click();
    await dlg.getByLabel(L.name, { exact: true }).fill('Ze snímku');
    await dlg.getByRole('button', { name: L.save }).click();
    await expect(dlg).toBeHidden();
    await expect.poll(async () => (await stateOf(page)).loadouts?.[0]?.name).toBe('Ze snímku');
    const lo = (await stateOf(page)).loadouts[0];
    expect(lo.items.length + lo.quickUse.length).toBe(rows - 1);
    expect([...lo.items, ...lo.quickUse].every((i: { name: string }) => /Ammo/.test(i.name))).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`Nastavení → Zátěž aplikace (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { settings: { autoSnapshot: false, lang } });
    await page.goto('/#settings/load');
    const panel = page.getByTestId('perf-panel');
    await expect(page.getByRole('heading', { name: L.perf })).toBeVisible();
    /* v prohlížeči se proces neměří; widgety vypnuté = 0 oken */
    await expect(panel.getByTestId('perf-na')).toContainText(L.perfNa);
    await expect(panel.getByTestId('perf-widgets')).toContainText('0');
    await expect(panel.getByTestId('perf-fps')).toContainText(L.fps);
    await panel.getByText(L.low, { exact: true }).click();
    await expect(panel.getByTestId('perf-low-state')).toContainText(L.lowWait);
    await expect.poll(async () => (await stateOf(page)).opsPrefs.lowImpact).toBe(true);
    await page.reload();
    await expect(page.getByTestId('perf-low')).toBeChecked();
    expect(errors).toEqual([]);
  });
}
