/* Angličtina jako druhý jazyk: přepnutí v Settings, volba po reloadu, výchozí jazyk podle navigator.language,
   průchod všemi 14 moduly bez českých textů (kromě uživatelských dat) a kontrola rozložení s delšími texty. */
import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_V1 } from '../core/sample';

const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const MODULES = ['dashboard', 'profile', 'skills', 'workshop', 'inventory', 'maps', 'arc', 'weapons', 'items', 'money', 'trials', 'journal', 'checklist', 'stats', 'games', 'settings'];
const SUBTABS = ['dashboard/goals', 'dashboard/recs', 'inventory/import', 'inventory/shopping', 'inventory/hunt', 'inventory/planner', 'inventory/equipment', 'inventory/cleanup', 'items/blueprints', 'items/traders', 'items/tiers', 'weapons/loadouts', 'skills/plan', 'skills/builds', 'games/tetris-4242', 'games/quiz-4242'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));

/* Český text v UI: viditelný text i popisky pro čtečky (aria-label, title, placeholder). Výjimka: prvek výslovně
   označený lang="cs" (název jazyka „Čeština“ v přepínači je záměrně v původní podobě). */
const czechInUi = (page: Page) => page.evaluate((re) => {
  const rx = new RegExp(re);
  const hits: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script, style') || el.closest('[lang]')?.getAttribute('lang') === 'cs') continue;
    const t = (n.textContent || '').trim();
    if (t && rx.test(t)) hits.push('text: ' + t.slice(0, 120));
  }
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    if (el.closest('[lang]')?.getAttribute('lang') === 'cs') continue;
    for (const a of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && rx.test(v)) hits.push(a + ': ' + v.slice(0, 120));
    }
  }
  return hits;
}, CZ.source);

async function importSampleEn(page: Page) {
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Import backup' }).click();
  await page.getByLabel('Backup text (JSON)').fill(JSON.stringify(SAMPLE_V1));
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByRole('dialog', { name: 'Review before import' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import complete' })).toBeVisible();
  await expect(page.locator('.toast').first()).toContainText('Data from the old diary imported.');
  await page.getByRole('button', { name: 'Done' }).click();
}

test.describe('přepnutí jazyka (výchozí čeština)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('přepnutí v Settings se projeví hned, uloží se a po reloadu zůstane', async ({ page }) => {
    const errors = watchErrors(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await page.goto('/#settings');
    await expect(page.getByRole('heading', { name: 'Jazyk' })).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    /* bez restartu: shell i obsah jsou hned anglicky */
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.sidebar')).toContainText('Overview');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(700);
    expect((await stateOf(page)).settings.lang).toBe('en');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    /* a zpět na češtinu */
    await page.getByRole('button', { name: 'Čeština' }).click();
    await expect(page.getByRole('heading', { name: 'Jazyk' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Jazyk' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('uživatelský text se při přepnutí nemění', async ({ page }) => {
    await page.goto('/#maps');
    await page.getByRole('button', { name: 'Detail a poznámky' }).first().click();
    await page.getByLabel('Poznámky k mapě').fill('Moje poznámka: žluťoučký kůň');
    await page.getByLabel('Poznámky k mapě').blur();
    await page.keyboard.press('Escape');
    await page.goto('/#settings');
    await page.getByRole('button', { name: 'English' }).click();
    await page.goto('/#maps');
    await page.getByRole('button', { name: 'Details and notes' }).first().click();
    await expect(page.getByLabel('Map notes')).toHaveValue('Moje poznámka: žluťoučký kůň');
    await page.waitForTimeout(700);
    const st = await stateOf(page);
    expect(st.maps.dam.notes).toBe('Moje poznámka: žluťoučký kůň');
    expect(st.steps[0].text).toMatch(/^Otevři záložku Outpost/);
  });
});

test.describe('angličtina podle navigator.language', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('první spuštění s en-US je anglicky a výchozí obsah vznikne anglicky', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.sidebar')).toContainText('Overview');
    await expect(page.getByRole('button', { name: 'Log raid' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Log raid' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Log raid' });
    await dlg.getByLabel('Length (minutes)').fill('150');
    await dlg.getByRole('button', { name: 'Save raid' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('The length must be 0–120 minutes.');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const st = await stateOf(page);
    expect(st.settings.lang).toBe('en');
    expect(st.steps[0].text).toMatch(/^Open the Outpost tab/);
    expect(st.checklists.templates[0].name).toBe('Before the raid');
  });

  test('všech 15 modulů a záložky v angličtině bez českých textů a bez chyby', async ({ page }) => {
    const errors = watchErrors(page);
    await importSampleEn(page);
    for (const id of [...MODULES, ...SUBTABS]) {
      await page.goto('/#' + id);
      await page.locator('.page h1').waitFor();
      await page.waitForTimeout(120);
      expect(await czechInUi(page), id).toEqual([]);
    }
    /* detail raidu, detail mapy a dialog Upravit přehled */
    await page.goto('/#journal');
    await page.getByRole('button', { name: /Show details of the raid/ }).first().click();
    expect(await czechInUi(page), 'journal detail').toEqual([]);
    await page.goto('/#maps');
    await page.getByRole('button', { name: 'Details and notes' }).first().click();
    expect(await czechInUi(page), 'map detail').toEqual([]);
    await page.keyboard.press('Escape');
    await page.goto('/#dashboard');
    await page.getByRole('button', { name: 'Edit overview' }).click();
    expect(await czechInUi(page), 'edit overview').toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const [w, h] of [[1024, 640], [1280, 800], [1920, 1080]]) {
    test(`rozložení v angličtině ${w}×${h}: nic nepřetéká, karty nejsou stlačené`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await importSampleEn(page);
      for (const id of ['dashboard', 'skills', 'workshop', 'inventory', 'money', 'settings', 'dashboard/goals', 'dashboard/recs', 'inventory/planner', 'weapons/loadouts', 'journal', 'checklist', 'stats',
        'profile', 'maps', 'arc', 'weapons', 'trials']) {
        await page.goto('/#' + id);
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(overflow, `${id} vodorovně přetéká`).toBe(false);
        const narrow = await page.evaluate(() => [...document.querySelectorAll('.dash-grid > .panel')].filter(e => e.getBoundingClientRect().width < 150).length);
        expect(narrow, `${id}: karta přehledu je stlačená`).toBe(0);
        await page.screenshot({ path: `test-results/screens-en/${w}-${id.replace('/', '-')}.png` });
      }
    });
  }
});
