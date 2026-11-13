/* 0.18.0: hledání všude (Ctrl+K) a karta předmětu „Proč to potřebuju?“ v obou jazycích.
   1) Hlavní okno: Ctrl+K, překlep v názvu předmětu, Enter otevře kartu s „Kde je potřeba“ (úkol After Rain Comes),
      rada Nech, odkaz z karty otevře detail úkolu; nedávná hledání; český název modulu bez diakritiky; pole
      v postranním panelu; karta z názvu předmětu v Inventory. Nic z toho nezapisuje stav.
   2) Overlay: tlačítko Hledat i Ctrl+K, karta předmětu v overlayi, úkol se otevře v záložce Aplikace; Esc zavře
      jen paletu / kartu, ne overlay. */
import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
/* After Rain Comes (ss10y) je dostupný po ss10s a chce 5× Wires; hráč má 2 */
const seedState = (lang: 'cs' | 'en') => ({
  schema: 14, profile: { level: 12, rounds: 10, coins: 500 }, inventory: { Wires: 2, 'Metal Parts': 4 },
  quests: { done: { ss10s: 1 } }, buddy: { enabled: true }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang },
});
async function seed(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('srch')) return;
    sessionStorage.setItem('srch', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify(seedState(lang)));
}

const T = {
  cs: { title: 'Hledat všude', needed: 'Kde je potřeba', keep: 'Nech', kicker: 'Proč to potřebuju?', recent: 'Nedávné', raidPrep: 'Příprava na raid', field: 'Hledat všude (Ctrl+K)', items: 'Předměty', quests: 'Úkoly' },
  en: { title: 'Search everywhere', needed: 'Where it is needed', keep: 'Keep', kicker: 'Why do I need this?', recent: 'Recent', raidPrep: 'Raid prep', field: 'Search everywhere (Ctrl+K)', items: 'Items', quests: 'Quests' },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Ctrl+K → předmět → karta s „Kde je potřeba“ (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang);
    await page.goto('/#dashboard');
    await expect(page.locator('.sidebar')).toBeVisible();

    /* Ctrl+K otevře paletu s fokusem v poli; překlep najde Wires jako první výsledek */
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: L.title });
    await expect(palette).toBeVisible();
    const input = page.getByTestId('search-input');
    await expect(input).toBeFocused();
    await input.fill('wirse');
    await expect(palette.locator('.sp-group[data-group="item"] .sp-group-head')).toHaveText(L.items);
    await expect(palette.getByRole('option', { selected: true })).toContainText('Wires');
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();

    /* karta: údaje, rada a kde je potřeba (dostupný úkol s počtem) */
    const card = page.getByTestId('item-card');
    await expect(card).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Wires' })).toBeVisible();
    await expect(card).toContainText(L.kicker);
    await expect(card.locator('[data-fact="value"] dd')).toHaveText('200');
    await expect(card.locator('[data-fact="stack"] dd')).toHaveText('15');
    await expect(page.getByTestId('item-card-have')).toHaveText('2');
    await expect(page.getByTestId('item-card-verdict')).toHaveAttribute('data-kind', 'keep');
    await expect(page.getByTestId('item-card-verdict')).toContainText(L.keep);
    const needs = page.getByTestId('item-card-needs');
    await expect(needs.getByRole('heading', { name: L.needed })).toBeVisible();
    const quest = needs.locator('li[data-need="quest"][data-when="now"]').filter({ hasText: 'After Rain Comes' });
    await expect(quest).toContainText('5×');
    await expect(quest).toContainText('2 / 5');
    await expect(page.getByTestId('item-card-areas')).toContainText('Electrical');

    /* odkaz z karty otevře detail úkolu */
    await quest.getByRole('button', { name: /After Rain Comes/ }).click();
    await expect(card).toBeHidden();
    await expect(page).toHaveURL(/#quests\/q%3Dss10y$/);
    await expect(page.locator('tr[data-quest="ss10y"]')).toHaveClass(/selected/);
    await expect(page.getByTestId('quest-detail')).toBeVisible();

    /* nedávná hledání: prázdný dotaz ukáže Wires; český název modulu bez diakritiky */
    await page.keyboard.press('Control+k');
    await expect(palette.locator('.sp-group[data-group="recent"]')).toContainText(L.recent);
    await expect(palette.locator('.sp-group[data-group="recent"] [role="option"]').first()).toContainText('Wires');
    await input.fill(lang === 'cs' ? 'priprava na raid' : 'raid prep');
    await expect(palette.getByRole('option', { selected: true })).toContainText(L.raidPrep);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#raid$/);

    /* Esc paletu zavře; pole v postranním panelu ji otevře s napsaným textem */
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await page.getByRole('textbox', { name: L.field }).pressSequentially('after');
    await expect(palette).toBeVisible();
    await expect(input).toHaveValue('after');
    await expect(palette.locator('.sp-group[data-group="quest"] .sp-group-head')).toHaveText(L.quests);
    await page.keyboard.press('Escape');

    /* karta z názvu předmětu v Inventory */
    await page.evaluate(() => { window.location.hash = '#inventory'; });
    await page.locator('button[data-item-link="Metal Parts"]').first().click();
    await expect(page.getByRole('dialog', { name: 'Metal Parts' })).toBeVisible();
    await expect(page.getByTestId('item-card-have')).toHaveText('4');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();

    /* nedávná hledání jsou jen v localStorage, stav se nezměnil */
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcops:search:recent') || '[]'))).toEqual(expect.arrayContaining(['item:Wires', 'module:raid']));
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
    expect(st.inventory).toEqual({ Wires: 2, 'Metal Parts': 4 });
    expect(st.quests.done).toEqual({ ss10s: 1 });
    expect(st.advice?.keep ?? {}).toEqual({});
    expect(Object.keys(st)).not.toContain('search');
    expect(errors).toEqual([]);
  });

  test(`hledání v overlayi: tlačítko i Ctrl+K, karta a úkol (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await seed(page, lang);
    await page.goto('/');
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();

    /* tlačítko Hledat vedle Aplikace; záložky se nemění */
    await expect(ov.getByRole('tab')).toHaveCount(9);
    await ov.getByTestId('ov-search').click();
    const palette = ov.getByRole('dialog', { name: L.title });
    await expect(palette).toBeVisible();
    await expect(ov.getByTestId('search-input')).toBeFocused();
    await ov.getByTestId('search-input').fill('WIRES');
    await expect(palette.getByRole('option', { selected: true })).toContainText('Wires');
    await ov.keyboard.press('Enter');
    const card = ov.getByTestId('item-card');
    await expect(card).toBeVisible();
    await expect(ov.getByTestId('item-card-needs').getByRole('heading', { name: L.needed })).toBeVisible();
    await expect(ov.getByTestId('item-card-needs').locator('li[data-need="quest"]').filter({ hasText: 'After Rain Comes' })).toContainText('5×');
    /* Esc zavře kartu, overlay zůstane */
    await ov.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(ov.getByTestId('overlay')).toBeVisible();

    /* Ctrl+K v overlayi, úkol se otevře v záložce Aplikace s detailem */
    await ov.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await ov.getByTestId('search-input').fill('after rain comes');
    await expect(palette.getByRole('option', { selected: true })).toContainText('After Rain Comes');
    await ov.keyboard.press('Enter');
    await expect(ov.getByTestId('ov-app-host')).toHaveAttribute('data-module', 'quests');
    await expect(ov.getByTestId('ov-appview').locator('tr[data-quest="ss10y"]')).toHaveClass(/selected/);
    await expect(ov.getByTestId('ov-appview').getByTestId('quest-detail')).toBeVisible();

    /* Esc v paletě zavře jen paletu */
    await ov.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await ov.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(ov.getByTestId('overlay')).toBeVisible();
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });

  test(`kompakt: řádek nákupu otevře kartu předmětu v aplikaci (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 420, height: 720 });
    await page.addInitScript(s => {
      if (sessionStorage.getItem('srch-c')) return;
      sessionStorage.setItem('srch-c', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({ ...seedState(lang), mainWindow: { mode: 'compact' } }));
    await page.goto('/');
    await expect(page.locator('.cw').first()).toBeVisible();
    const row = page.getByTestId('compact-shop').locator('li').first();
    const mat = await row.getAttribute('data-mat');
    expect(mat).toBeTruthy();
    await row.getByTestId('compact-card').click();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.getByRole('dialog', { name: mat! })).toBeVisible();
    await expect(page.getByTestId('item-card-needs').getByRole('heading', { name: L.needed })).toBeVisible();
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'))).mainWindow.mode).toBe('full');
    expect(errors).toEqual([]);
  });
}
