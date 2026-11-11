/* Vizuál v2 („Teplý grafit“): strukturální zásahy z docs/design/visual-v2.md kap. 9 (P1) nemění chování ani data. */
import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_V1 } from '../core/sample';

async function importSample(page: Page) {
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Importovat zálohu' }).click();
  await page.getByLabel('Text zálohy (JSON)').fill(JSON.stringify(SAMPLE_V1));
  await page.getByRole('button', { name: 'Pokračovat ke kontrole' }).click();
  await page.getByRole('button', { name: 'Potvrdit import' }).click();
  await page.getByRole('button', { name: 'Hotovo' }).click();
}
const top = (page: Page, sel: string) => page.locator(sel).first().evaluate(e => Math.round(e.getBoundingClientRect().top));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('tokeny v2 jsou načtené a písma jsou lokální', async ({ page }) => {
  const v = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (n: string) => cs.getPropertyValue(n).trim().toUpperCase();
    return { accent: get('--accent'), app: get('--bg-app'), grid: get('--chart-grid') };
  });
  expect(v).toEqual({ accent: '#F4AD82', app: '#141719', grid: '#465158' });
  const remote = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith(location.origin)));
  expect(remote).toEqual([]);
});

test('kompaktní navigace: tooltip je portál mimo .nav a funguje myší i klávesnicí', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const item = page.locator('.sidebar a.nav-item[href="#journal"]');
  await expect(item).toHaveAttribute('aria-label', 'Raid Journal');
  await item.hover();
  const tip = page.locator('body > .tooltip');
  await expect(tip).toHaveText('Raid Journal');
  await expect(page.locator('.nav .tooltip')).toHaveCount(0);
  await page.mouse.move(600, 400);
  await expect(tip).toHaveCount(0);
  /* klávesnice: focus na položce ukáže stejný popisek */
  await page.locator('.sidebar a.nav-item[href="#dashboard"]').focus();
  await page.keyboard.press('Tab');
  await expect(tip).toHaveText('Player Profile');
  /* rozbalený panel tooltip nepotřebuje */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.sidebar a.nav-item[href="#maps"]').hover();
  await expect(tip).toHaveCount(0);
});

test('zápis raidu: chyba validace je propojená s polem přes aria-describedby', async ({ page }) => {
  await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Zapsat raid' });
  const min = dlg.getByLabel('Délka (minuty)');
  await expect(min).not.toHaveAttribute('aria-invalid', 'true');
  await min.fill('150');
  await dlg.getByRole('button', { name: 'Uložit raid' }).click();
  await expect(dlg).toBeVisible();
  await expect(min).toHaveAttribute('aria-invalid', 'true');
  const ids = (await min.getAttribute('aria-describedby'))!.split(' ');
  const texts = await Promise.all(ids.map(id => page.locator('#' + id).innerText()));
  expect(texts.join(' ')).toContain('Délka musí být 0–120 minut.');
  await expect(dlg.getByLabel('Výdělek (mince)')).not.toHaveAttribute('aria-invalid', 'true');
  /* oprava hodnoty uloží raid jako dřív */
  await min.fill('12');
  await dlg.getByRole('button', { name: 'Uložit raid' }).click();
  await expect(dlg).toBeHidden();
});

test('Material Planner: souhrn je nahoře, jen jednou a odpovídá tabulce', async ({ page }) => {
  await page.goto('/#inventory/planner');
  await page.getByRole('button', { name: 'Vše na další úroveň' }).click();
  const summary = page.locator('.planner-summary');
  await expect(summary.getByRole('heading', { name: 'Souhrn plánu' })).toBeVisible();
  expect(await top(page, '.planner-summary')).toBeLessThan(await top(page, '.planner-targets'));
  await expect(page.locator('.stat').filter({ hasText: 'Potřeba celkem' })).toHaveCount(1);
  const need = Number((await summary.locator('.stat').filter({ hasText: 'Potřeba celkem' }).locator('.stat-val').innerText()).replace(/\s/g, ''));
  const col = await page.locator('.mat-table tbody tr td:nth-child(3)').allInnerTexts();
  expect(need).toBe(col.reduce((a, t) => a + Number(t.replace(/\s/g, '')), 0));
});

test('Raid Journal: datum a čas jsou zvlášť, filtry ve dvou řádcích při 1280 a v jednom při 1920', async ({ page }) => {
  await importSample(page);
  await page.goto('/#journal');
  const cell = page.locator('.journal-table tbody tr').first().locator('.date-cell');
  await expect(cell.locator('.date')).toHaveText(/\d/);
  await expect(cell.locator('.time')).toHaveText(/\d{1,2}:\d{2}/);
  expect(await cell.locator('.time').evaluate(e => e.getBoundingClientRect().top)).toBeGreaterThan(await cell.locator('.date').evaluate(e => e.getBoundingClientRect().top));
  const f = '.journal-filters';
  const rowOf = async (label: string) => page.locator(f).getByLabel(label, { exact: true }).evaluate(e => Math.round(e.getBoundingClientRect().top));
  const [search, type, map, result, loadout] = await Promise.all(['Hledat v poznámkách, trasách a položkách', 'Typ', 'Mapa', 'Výsledek', 'Loadout'].map(rowOf));
  expect([type, map]).toEqual([search, search]);
  expect(result).toBeGreaterThan(search);
  expect(loadout).toBe(result);
  /* všech pět filtrů pořád filtruje */
  await page.locator(f).getByLabel('Výsledek', { exact: true }).selectOption('dead');
  await expect(page.getByText(/^1 záznam/)).toBeVisible();
  await page.getByRole('button', { name: 'Vymazat filtry' }).first().click();
  await expect(page.getByText(/^3 záznamy/)).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const [s2, l2] = await Promise.all([rowOf('Hledat v poznámkách, trasách a položkách'), rowOf('Loadout')]);
  expect(l2).toBe(s2);
});

test('Statistics: dvojice hlavních grafů je pod sebou při 1280 a vedle sebe při 1920; mřížka používá --chart-grid', async ({ page }) => {
  await importSample(page);
  await page.goto('/#stats');
  const panels = page.locator('.chart-pair > .panel');
  await expect(panels).toHaveCount(2);
  await expect(panels.nth(0).getByRole('heading')).toHaveText('Vývoj výdělku v čase');
  await expect(panels.nth(1).getByRole('heading')).toHaveText('Výsledky raidů');
  const box = async () => Promise.all([0, 1].map(i => panels.nth(i).evaluate(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; })));
  let [a, b] = await box();
  expect(b.y).toBeGreaterThan(a.y);
  expect(b.x).toBe(a.x);
  await page.setViewportSize({ width: 1920, height: 1080 });
  [a, b] = await box();
  expect(b.y).toBe(a.y);
  expect(b.x).toBeGreaterThan(a.x);
  const strokes = await page.locator('.chart-box svg line').evaluateAll(ls => [...new Set(ls.map(l => l.getAttribute('stroke')))]);
  expect(strokes).toEqual(['var(--chart-grid)']);
  await page.goto('/#maps');
  const axis = await page.locator('svg[aria-label^="Odemykání map"] line').evaluateAll(ls => ls.map(l => l.getAttribute('stroke')));
  expect(axis.filter(s => s === 'var(--chart-grid)').length).toBeGreaterThan(0);
  expect(axis.filter(s => s === 'var(--border-subtle)')).toEqual([]);
});
