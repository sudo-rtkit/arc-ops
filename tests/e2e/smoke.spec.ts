/* Kouřový test: všech 14 obrazovek bez chyby, změna přežije znovunačtení, import zálohy deníku, export a import. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SAMPLE_V1 } from '../core/sample';

const MODULES: [string, string][] = [
  ['dashboard', 'Dashboard'], ['profile', 'Player Profile'], ['skills', 'Skill Tree'], ['workshop', 'Workshop'], ['inventory', 'Inventory'], ['quests', 'Quests'],
  ['maps', 'Maps'], ['arc', 'ARC Database'], ['weapons', 'Weapons'], ['items', 'Item Database'], ['money', 'Money Runs'], ['trials', 'Weekly Trials'],
  ['journal', 'Raid Journal'], ['checklist', 'Raid Checklist'], ['stats', 'Statistics'], ['games', 'Minihry'], ['settings', 'Settings & Backup'],
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const saved = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Uloženo' }).first()).toBeVisible({ timeout: 5000 });
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));

async function importText(page: Page, text: string) {
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Importovat zálohu' }).click();
  await page.getByLabel('Text zálohy (JSON)').fill(text);
  await page.getByRole('button', { name: 'Pokračovat ke kontrole' }).click();
  await expect(page.getByRole('dialog', { name: 'Kontrola před importem' })).toBeVisible();
  await page.getByRole('button', { name: 'Potvrdit import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import dokončen' })).toBeVisible();
  await page.getByRole('button', { name: 'Hotovo' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('všech 15 modulů se otevře bez chyby v konzoli', async ({ page }) => {
  const errors = watchErrors(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  for (const [id, name] of MODULES) {
    await page.locator(`.sidebar a.nav-item[href="#${id}"]`).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page).toHaveTitle(`${name} · ARC OPS`);
  }
  expect(errors).toEqual([]);
});

test('změna levelu přežije znovunačtení', async ({ page }) => {
  await page.goto('/#profile');
  const level = page.getByLabel('Level', { exact: true });
  await level.fill('42');
  await level.press('Enter');
  await saved(page);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel('Level', { exact: true })).toHaveValue('42');
  expect((await stateOf(page)).profile.level).toBe(42);
});

test('ořez hodnoty mimo rozsah ukáže hint', async ({ page }) => {
  await page.goto('/#profile');
  const level = page.getByLabel('Level', { exact: true });
  await level.fill('999');
  await level.press('Enter');
  await expect(level).toHaveValue('75');
  await expect(page.getByText('Upraveno na povolený rozsah 0–75.')).toBeVisible();
});

test('import zálohy deníku nastaví level, zásobu a počet raidů', async ({ page }) => {
  const errors = watchErrors(page);
  await importText(page, JSON.stringify(SAMPLE_V1));
  await saved(page);
  const st = await stateOf(page);
  expect(st.profile.level).toBe(23);
  expect(st.inventory['Metal Parts']).toBe(40);
  expect(st.raids).toHaveLength(3);
  await page.goto('/#journal');
  await expect(page.getByText(/^3 záznamy/)).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('23 / 75');
  /* před importem vznikl snímek */
  const snaps = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('arcops:snap:')));
  expect(snaps.some(k => k.includes('-import-'))).toBe(true);
  expect(errors).toEqual([]);
});

test('export a import vrátí stejný stav', async ({ page }) => {
  await importText(page, JSON.stringify(SAMPLE_V1));
  await saved(page);
  await page.goto('/#profile');
  await page.getByLabel('Mince', { exact: true }).fill('777777');
  await page.getByLabel('Mince', { exact: true }).press('Enter');
  await saved(page);
  await page.waitForTimeout(700);
  const before = await stateOf(page);
  await page.goto('/#settings');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportovat zálohu' }).click();
  const file = await (await dl).path();
  const text = readFileSync(file!, 'utf8');
  expect(JSON.parse(text).app).toBe('arc-raiders-companion');
  /* změna, která se importem musí vrátit */
  await page.goto('/#profile');
  await page.getByLabel('Level', { exact: true }).fill('5');
  await page.getByLabel('Level', { exact: true }).press('Enter');
  await saved(page);
  await importText(page, text);
  await saved(page);
  await page.waitForTimeout(700);
  const after = await stateOf(page);
  const strip = (s: Record<string, unknown>) => ({ ...s, meta: undefined, profileLog: undefined });
  expect(strip(after)).toEqual(strip(before));
});

test('zápis raidu přidá kolo a projeví se v Journalu i Dashboardu', async ({ page }) => {
  await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Zapsat raid' });
  await dialog.getByLabel('Výdělek (mince)').fill('31000');
  await dialog.getByLabel('Délka (minuty)').fill('12');
  await dialog.getByRole('button', { name: 'Uložit raid' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.kpi-strip')).toContainText('31 000');
  await expect(page.locator('.topbar')).toContainText('1');
  await page.waitForTimeout(700);
  await saved(page);
  expect((await stateOf(page)).profile.rounds).toBe(1);
  await page.goto('/#journal');
  await expect(page.getByText(/^1 záznam/)).toBeVisible();
});

for (const [w, h] of [[1024, 640], [1280, 800], [1920, 1080]]) {
  test(`snímky obrazovek ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await importText(page, JSON.stringify(SAMPLE_V1));
    for (const id of ['dashboard', 'skills', 'workshop', 'inventory', 'money', 'settings', 'dashboard/goals', 'dashboard/recs', 'inventory/planner', 'weapons/loadouts', 'journal', 'checklist', 'stats']) {
      await page.goto('/#' + id);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `${id} vodorovně přetéká`).toBe(false);
      const narrow = await page.evaluate(() => [...document.querySelectorAll('.dash-grid > .panel')].filter(e => e.getBoundingClientRect().width < 150).length);
      expect(narrow, `${id}: karta přehledu je stlačená`).toBe(0);
      await page.screenshot({ path: `test-results/screens/${w}-${id.replace('/', '-')}.png` });
    }
  });
}
