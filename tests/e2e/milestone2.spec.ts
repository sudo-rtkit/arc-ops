/* Milník 2: cíle, doporučení, Raid Journal s lootem a převodem, šablony checklistů, Material Planner, loadouty, trasy a ceník. */
import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
/* počká, až se změna zapíše (automatické ukládání po 0,5 s) */
async function settle(page: Page) {
  await page.waitForTimeout(800);
  await expect(page.getByRole('status').filter({ hasText: 'Uloženo' }).first()).toBeVisible({ timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('nové záložky Dashboardu, Inventory a Weapons se otevřou bez chyby; navigace má 14 položek', async ({ page }) => {
  const errors = watchErrors(page);
  await expect(page.locator('.sidebar a.nav-item')).toHaveCount(14);
  for (const [hash, text] of [['#dashboard/goals', 'Goal Tracker'], ['#dashboard/recs', 'Zapiš první raid'], ['#inventory/planner', 'Cílové úrovně stanic'], ['#weapons/loadouts', 'Zatím nemáš uložený loadout']]) {
    await page.goto('/' + hash);
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await page.goto('/#dashboard');
  await expect(page.getByRole('heading', { name: 'Aktivní cíle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Doporučení' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('cíl materiálu se splní sám, když je materiál na skladě', async ({ page }) => {
  await page.goto('/#dashboard/goals');
  await page.getByRole('button', { name: 'Nový cíl' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nový cíl' });
  await dlg.getByLabel('Název').fill('Kov na Gunsmith');
  await dlg.getByLabel('Priorita').selectOption('1');
  await dlg.getByLabel('Vazba').selectOption('material');
  await dlg.getByLabel('Materiál').fill('Metal Parts');
  await dlg.getByLabel('Počet na skladě').fill('5');
  await dlg.getByRole('button', { name: 'Uložit cíl' }).click();
  await expect(page.locator('.goal-row').filter({ hasText: 'Kov na Gunsmith' })).toContainText('0 / 5');
  await page.goto('/#inventory');
  await page.getByLabel('Hledat materiál').fill('Metal Parts');
  const inp = page.getByLabel('Mám Metal Parts', { exact: true });
  await inp.fill('5');
  await inp.press('Enter');
  await settle(page);
  const st = await stateOf(page);
  expect(st.goals[0]).toMatchObject({ title: 'Kov na Gunsmith', priority: 1 });
  expect(st.goals[0].doneAt).toBeGreaterThan(0);
  await page.goto('/#stats');
  await expect(page.locator('.panel').filter({ hasText: 'Dokončené cíle' })).toContainText('Kov na Gunsmith');
});

test('raid s lootem: zápis zásobu nemění, převod je ruční a idempotentní, úprava nic nepřičte', async ({ page }) => {
  await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Zapsat raid' });
  await dlg.getByLabel('Výdělek (mince)').fill('20000');
  await dlg.getByLabel('Získané materiály (loot): název').fill('Metal Parts');
  await dlg.getByLabel('Získané materiály (loot): počet').fill('3');
  await dlg.getByRole('button', { name: 'Získané materiály (loot): Přidat' }).click();
  await dlg.getByLabel('Ztracená výbava: název').fill('Light Shield');
  await dlg.getByRole('button', { name: 'Ztracená výbava: Přidat' }).click();
  await dlg.getByRole('button', { name: 'Uložit raid' }).click();
  await expect(dlg).toBeHidden();
  await settle(page);
  let st = await stateOf(page);
  expect(st.raids[0].loot).toEqual([{ name: 'Metal Parts', qty: 3 }]);
  expect(st.raids[0].lost).toEqual([{ name: 'Light Shield', qty: 1 }]);
  expect(st.inventory['Metal Parts']).toBeUndefined();
  expect(st.profile.rounds).toBe(1);

  await page.goto('/#journal');
  await expect(page.getByText('Loot nepřeveden')).toBeVisible();
  await page.getByRole('button', { name: /Zobrazit detail raidu/ }).click();
  await page.getByRole('button', { name: 'Převést loot do Inventory' }).click();
  await expect(page.getByText('Loot v Inventory').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Převést loot do Inventory' })).toHaveCount(0);
  await settle(page);
  st = await stateOf(page);
  expect(st.inventory['Metal Parts']).toBe(3);

  /* úprava raidu: kola ani zásoba se nezmění */
  await page.getByRole('button', { name: /^Upravit raid/ }).click();
  const edit = page.getByRole('dialog', { name: 'Upravit raid' });
  await edit.getByLabel('Výdělek (mince)').fill('25000');
  await edit.getByRole('button', { name: 'Uložit raid' }).click();
  await settle(page);
  st = await stateOf(page);
  expect(st.raids[0].coins).toBe(25000);
  expect(st.inventory['Metal Parts']).toBe(3);
  expect(st.profile.rounds).toBe(1);

  /* vrácení převodu */
  await page.getByRole('button', { name: 'Vrátit převod' }).click();
  await settle(page);
  expect((await stateOf(page)).inventory['Metal Parts']).toBeUndefined();
});

test('vlastní šablona checklistu se uloží i s odškrtnutím', async ({ page }) => {
  await page.goto('/#checklist');
  await page.getByRole('button', { name: 'Nový checklist' }).click();
  await page.getByRole('dialog', { name: 'Nový checklist' }).getByLabel('Název checklistu').fill('Lov ARC');
  await page.getByRole('button', { name: 'Vytvořit' }).click();
  await page.getByRole('button', { name: 'Upravit', exact: true }).click();
  await page.getByLabel('Nový bod checklistu').fill('Granáty na pancíř');
  await page.getByRole('button', { name: 'Přidat bod' }).click();
  await page.getByRole('button', { name: 'Hotovo', exact: true }).click();
  await page.getByText('Granáty na pancíř').click();
  await settle(page);
  await page.reload();
  await expect(page.getByRole('button', { name: /Lov ARC 1\/1/ })).toBeVisible();
  const st = await stateOf(page);
  const t = st.checklists.templates.find((x: { name: string }) => x.name === 'Lov ARC');
  expect(t.items).toHaveLength(1);
  expect(st.checklists.checked[t.items[0].id]).toBe(true);
  expect(st.checklists.templates.some((x: { id: string }) => x.id === 'raid')).toBe(true);
});

test('Material Planner: další úroveň všech stanic dává stejný součet jako nákupní seznam', async ({ page }) => {
  await page.goto('/#inventory/planner');
  await page.getByRole('button', { name: 'Vše na další úroveň' }).click();
  await settle(page);
  const st = await stateOf(page);
  expect(st.planner.stations.gunsmith).toBe(1);
  expect(st.inventory).toEqual({});
  const planNeed = await page.locator('.stat').filter({ hasText: 'Potřeba celkem' }).locator('.stat-val').innerText();
  await page.goto('/#inventory/shopping');
  const shop = await page.locator('table tbody tr td:nth-child(3)').allInnerTexts();
  const sum = shop.reduce((a, t) => a + Number(t.replace(/\s/g, '')), 0);
  expect(Number(planNeed.replace(/\s/g, ''))).toBe(sum);
});

test('loadout se předvyplní do zápisu raidu a ukáže se ve statistikách', async ({ page }) => {
  await page.goto('/#weapons/loadouts');
  await page.getByRole('button', { name: 'Nový loadout' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Nový loadout' });
  await dlg.getByLabel('Název', { exact: true }).fill('Money Ferro');
  await dlg.getByLabel('Augment').fill('Looting Mk. 2');
  await dlg.getByRole('button', { name: 'Uložit loadout' }).click();
  await page.getByRole('button', { name: 'Zapsat raid s loadoutem' }).click();
  const raid = page.getByRole('dialog', { name: 'Zapsat raid' });
  await expect(raid.getByLabel('Loadout')).toHaveValue(/.+/);
  await expect(raid.locator('.item-list').first()).toContainText('Looting Mk. 2');
  await raid.getByRole('button', { name: 'Uložit raid' }).click();
  await settle(page);
  const st = await stateOf(page);
  expect(st.raids[0].loadout).toBe(st.loadouts[0].id);
  expect(st.raids[0].gear).toEqual([{ name: 'Looting Mk. 2', qty: 1 }]);
  await page.goto('/#stats');
  await expect(page.locator('.panel').filter({ hasText: 'Loadout Planner' })).toContainText('Money Ferro');
});

test('úprava trasy a prodejního ceníku se uloží a jde vrátit', async ({ page }) => {
  await page.goto('/#money/galleria');
  await page.getByRole('button', { name: 'Upravit trasu' }).click();
  const dlg = page.getByRole('dialog', { name: /Upravit trasu/ });
  await dlg.getByLabel('Riziko').fill('Žádné');
  await dlg.getByRole('button', { name: 'Uložit trasu' }).click();
  await expect(page.locator('.facts')).toContainText('Žádné');
  await page.getByRole('tab', { name: 'Co prodávat' }).click();
  await page.getByRole('button', { name: /^Upravit Lance/ }).click();
  const sell = page.getByRole('dialog', { name: /Upravit: Lance/ });
  await sell.getByLabel('Cena (mince)').fill('12000');
  await sell.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.locator('table')).toContainText('12 000');
  await settle(page);
  let st = await stateOf(page);
  expect(st.gameData.routes.galleria).toEqual({ risk: 'Žádné' });
  expect(st.gameData.sell.s0).toEqual({ price: 12000 });
  await page.getByRole('button', { name: /^Vrátit výchozí Lance/ }).click();
  await settle(page);
  st = await stateOf(page);
  expect(st.gameData.sell.s0).toBeUndefined();
});

test('reset nového modulu se potvrzuje a vytvoří snímek', async ({ page }) => {
  await page.goto('/#dashboard/goals');
  await page.getByRole('button', { name: 'Nový cíl' }).first().click();
  await page.getByRole('dialog', { name: 'Nový cíl' }).getByLabel('Název').fill('Smazat mě');
  await page.getByRole('button', { name: 'Uložit cíl' }).click();
  await settle(page);
  await page.goto('/#settings');
  await page.getByLabel('Reset modulu').selectOption('goals');
  await page.getByRole('button', { name: 'Vynulovat Goal Tracker' }).click();
  const c = page.getByRole('dialog', { name: 'Vynulovat: Goal Tracker' });
  await expect(c).toBeVisible();
  await c.getByRole('button', { name: 'Vynulovat Goal Tracker' }).click();
  await settle(page);
  expect((await stateOf(page)).goals).toEqual([]);
  const snaps = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('arcops:snap:')));
  expect(snaps.some(k => k.includes('-reset-'))).toBe(true);
});
