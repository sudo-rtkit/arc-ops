/* 0.22.0: widgety nad hrou. Hlavní okno a okno widgetů jako dvě stránky (BroadcastChannel); nativní volání (Úpravy,
   Skrýt / zobrazit ze zkratky) nahrazuje v prohlížeči __widgetsTest, jako u ostatních oken. V obou jazycích:
   Hra bez ovladačů → Úpravy → widget z katalogu → přesun a změna velikosti → Uložit jako → přepnutí šablony →
   uložení po načtení a jiné rozlišení; Skrýt vše; panel Aplikace dál otevírá moduly. */
import { expect, test, type Page } from '@playwright/test';

const SHORING = 'shoring_up_defenses';
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const prefsOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:widgets') || 'null'));
const setMode = (w: Page, m: 'edit' | 'play') => w.evaluate(x => (window as unknown as { __widgetsTest: { mode: (m: string) => void } }).__widgetsTest.mode(x), m);
const hideKey = (w: Page) => w.evaluate(() => (window as unknown as { __widgetsTest: { hide: () => void } }).__widgetsTest.hide());
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const T = {
  cs: {
    toFind: 'Seznam k nalezení', quests: 'Připnuté úkoly', stash: 'Obsazenost skrýše', next: 'Co dál?', add: '+ Widget', layouts: 'Rozložení',
    saveAs: 'Uložit jako…', name: 'Večer', done: 'Hotovo · Esc', hideAll: 'Skrýt vše', right: 'Vpravo', free: 'Poslední potvrzený stav', added: 'Přidáno', app: 'Aplikace',
    search: 'Hledat widget nebo modul', module: 'Raid Journal', undo: 'Zpět', badName: 'Zadej jedinečný název (1–40 znaků).', fair: 'Mapy ani živá poloha do overlaye nepatří.',
  },
  en: {
    toFind: 'To find', quests: 'Pinned quests', stash: 'Stash capacity', next: 'What next?', add: '+ Widget', layouts: 'Layouts',
    saveAs: 'Save as…', name: 'Evening', done: 'Done · Esc', hideAll: 'Hide all', right: 'right', free: 'Last confirmed state', added: 'Added', app: 'App',
    search: 'Search widgets or modules', module: 'Raid Journal', undo: 'Undo', badName: 'Enter a unique name (1–40 characters).', fair: 'No maps or live position in this overlay.',
  },
} as const;

async function start(page: Page, lang: 'cs' | 'en', extra: Record<string, unknown> = {}) {
  await page.addInitScript(st => {
    if (sessionStorage.getItem('wg-seeded')) return;
    sessionStorage.setItem('wg-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', st);
  }, JSON.stringify({
    schema: 18, profile: { level: 9 }, buddy: { enabled: true }, opsPrefs: { widgets: { on: true } },
    quests: { done: {}, pinned: [SHORING] }, vision: { stash: { used: 187, max: 240, at: Date.now() } },
    settings: { autoSnapshot: false, lang }, ...extra,
  }));
  await page.goto('/');
  await expect(page.locator('.sidebar, .compact').first()).toBeVisible();
}
async function openWidgets(page: Page): Promise<Page> {
  const w = await page.context().newPage();
  await w.setViewportSize({ width: 1920, height: 1080 });
  await w.goto('/widgets.html');
  await expect(w.getByTestId('widgets')).toBeVisible();
  return w;
}

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];

  test(`widgety: Hra bez ovladačů, Úpravy, katalog, přesun, velikost, Uložit jako a šablona (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    const w = await openWidgets(page);
    const wErrors = watchErrors(w);
    const canvas = w.getByTestId('widgets');

    /* Hra: výchozí šablona Raid, jen zobrazení (nic k zaměření, žádný závoj ani lišta) */
    await expect(canvas).toHaveAttribute('data-mode', 'play');
    await expect(canvas).toHaveAttribute('data-layout', 'raid');
    await expect(w.getByTestId('widget-toFind')).toContainText(L.toFind);
    await expect(w.getByTestId('widget-quests')).toContainText(L.quests);
    await expect(canvas.locator('button, input, select, textarea, [tabindex]')).toHaveCount(0);
    await expect(w.locator('.wgc-veil')).toHaveCount(0);
    await expect(w.getByTestId('wg-toolbar')).toHaveCount(0);

    /* Úpravy (v Tauri je zapne Rust po kliku na Opse nebo zkratce) */
    await setMode(w, 'edit');
    await expect(canvas).toHaveAttribute('data-mode', 'edit');
    await expect(w.getByTestId('wg-add')).toBeFocused();
    await expect(w.locator('.wgc-veil')).toHaveCount(1);

    /* úprava osobního postupu v Úpravách jde do hlavního okna (allow-list) */
    await w.getByTestId('widget-quests').getByRole('checkbox').first().check();
    await expect.poll(async () => (await stateOf(page))?.quests?.objectives?.[SHORING]).toEqual([0]);

    /* katalog: všech deset widgetů, žádná mapa; přidání Obsazenosti skrýše */
    await w.getByTestId('wg-add').click();
    const cat = w.getByTestId('wg-catalog');
    await expect(cat.locator('.wg-catrow')).toHaveCount(10);
    await expect(cat).toContainText(L.fair);
    await w.getByTestId('wg-cat-stash').click();
    const stash = w.getByTestId('widget-stash');
    await expect(stash).toContainText(L.stash);
    await expect(stash).toContainText('187');
    await expect(stash).toContainText(lang === 'cs' ? '53 volných míst' : '53 free slots');
    await expect(cat.locator('[data-widget="stash"]')).toContainText(L.added);
    await expect(cat.locator('[data-widget="stash"] button')).toHaveCount(0);
    await w.keyboard.press('Escape');
    await expect(cat).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-mode', 'edit');

    /* přesun myší k pravému okraji: přichytí se na bezpečný odstup 24 px a ukotví vpravo */
    const handle = stash.getByTestId('wg-move');
    const hb = (await handle.boundingBox())!;
    const box0 = (await stash.boundingBox())!;
    await w.mouse.move(hb.x + 10, hb.y + 10);
    await w.mouse.down();
    const dx = 1920 - 24 - box0.width - box0.x + 3;
    await w.mouse.move(hb.x + 10 + dx / 2, hb.y + 210, { steps: 4 });
    await w.mouse.move(hb.x + 10 + dx, hb.y + 213, { steps: 4 });
    await expect(w.locator('.wg-guide.v')).toHaveCount(1);
    await w.mouse.up();
    const box1 = (await stash.boundingBox())!;
    expect(Math.round(1920 - (box1.x + box1.width))).toBe(24);
    expect(Math.round(box1.y) % 8).toBe(0);

    /* změna velikosti úchytem vpravo dole: po 8 px v mezích widgetu */
    const se = stash.locator('.wg-h.se');
    const sb = (await se.boundingBox())!;
    await w.mouse.move(sb.x + 4, sb.y + 4);
    await w.mouse.down();
    await w.mouse.move(sb.x + 4 - 50, sb.y + 4 + 37, { steps: 5 });
    await w.mouse.up();
    const box2 = (await stash.boundingBox())!;
    expect(box2.height).toBeGreaterThan(box1.height);
    expect(Math.round(box2.height) % 8).toBe(0);

    /* klávesnice na úchytu: šipka dolů o 8 px */
    await handle.focus();
    await w.keyboard.press('ArrowDown');
    await expect.poll(async () => Math.round((await stash.boundingBox())!.y)).toBe(Math.round(box2.y) + 8);

    /* nastavení widgetu: kotva vpravo, krytí, hustota; Zpět vrátí poslední krok */
    await stash.getByTestId('wg-settings-open').click();
    const set = w.getByTestId('wg-settings');
    await expect(set.getByTestId('wg-anchor')).toContainText(L.right);
    await set.getByTestId('wg-density-expanded').click();
    await expect(stash).toContainText(L.free);
    await set.getByTestId('wg-settings-done').click();
    await w.getByTestId('wg-undo').click();
    await expect(stash).not.toContainText(L.free);
    await w.keyboard.press('Control+Shift+KeyZ');
    await expect(stash).toContainText(L.free);

    /* Uložit jako: prázdný název neprojde, pak „Večer“ */
    await w.getByTestId('wg-layouts').click();
    await w.getByTestId('wg-layout-saveas').click();
    await w.getByTestId('wg-layout-save').click();
    await expect(w.getByRole('alert')).toHaveText(L.badName);
    await w.getByTestId('wg-layout-name').fill(L.name);
    await w.getByTestId('wg-layout-save').click();
    const own = (await canvas.getAttribute('data-layout'))!;
    expect(own).toMatch(/^l[0-9a-z]+$/);
    await expect(w.getByTestId('wg-layouts-pop')).toContainText(L.name);

    /* přepnutí na šablonu Lobby jedním klikem a zpět */
    await w.getByTestId('wg-layout-lobby').click();
    await expect(canvas).toHaveAttribute('data-layout', 'lobby');
    await expect(w.getByTestId('widget-next')).toContainText(L.next);
    await expect(w.getByTestId('widget-stash')).toBeVisible();
    await expect(w.getByTestId('widget-toFind')).toHaveCount(0);
    await w.getByTestId('wg-layout-' + own).click();
    await expect(canvas).toHaveAttribute('data-layout', own);
    await expect(w.getByTestId('widget-toFind')).toBeVisible();

    /* Hotovo → Hra; rozložení zůstane (jen místní úložiště, ne stav aplikace) */
    await w.getByTestId('wg-done').click();
    await expect(canvas).toHaveAttribute('data-mode', 'play');
    await expect(canvas.locator('button, input')).toHaveCount(0);
    const prefs = await prefsOf(w);
    expect(prefs).toMatchObject({ version: 1, active: own });
    const placed = prefs.layouts.find((l: { id: string }) => l.id === own).widgets.find((x: { id: string }) => x.id === 'stash');
    expect(placed).toMatchObject({ ax: 'right', dx: 24, density: 'expanded' });
    expect(JSON.stringify(await stateOf(page))).not.toContain(L.name);

    /* po načtení i v jiném rozlišení: stejná šablona, widget pořád 24 px od pravého okraje se stejnou velikostí */
    await w.setViewportSize({ width: 1280, height: 720 });
    await w.reload();
    await expect(canvas).toHaveAttribute('data-layout', own);
    const box3 = (await w.getByTestId('widget-stash').boundingBox())!;
    expect(Math.round(1280 - (box3.x + box3.width))).toBe(24);
    expect(Math.round(box3.width)).toBe(placed.w);
    expect(Math.round(box3.height)).toBe(placed.h);

    expect(errors).toEqual([]);
    expect(wErrors).toEqual([]);
  });

  test(`widgety: Skrýt vše a zkratka Skrýt / zobrazit (${lang})`, async ({ page }) => {
    await start(page, lang);
    const w = await openWidgets(page);
    const canvas = w.getByTestId('widgets');
    await expect(w.getByTestId('widget-toFind')).toBeVisible();
    await setMode(w, 'edit');
    await w.getByTestId('wg-hide').click();
    await expect(canvas).toHaveAttribute('data-mode', 'play');
    await expect(canvas).toHaveAttribute('data-hidden', 'true');
    await expect(canvas.locator('section')).toHaveCount(0);
    /* zkratka Skrýt / zobrazit ve Hře */
    await hideKey(w);
    await expect(canvas).toHaveAttribute('data-hidden', 'false');
    await expect(w.getByTestId('widget-toFind')).toBeVisible();
    await hideKey(w);
    await expect(canvas.locator('section')).toHaveCount(0);
    /* Úpravy (klik na Opse) widgety zase ukážou; skrytí rozložení nemaže */
    await setMode(w, 'edit');
    await expect(canvas).toHaveAttribute('data-hidden', 'false');
    await expect(w.getByTestId('widget-quests')).toBeVisible();
    await w.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-mode', 'play');
    expect((await prefsOf(w)).layouts[0].widgets.map((x: { id: string }) => x.id)).toEqual(['toFind', 'quests']);
  });

  test(`widgety: panel Aplikace a hledání Ctrl+K dál otevírají moduly (${lang})`, async ({ page }) => {
    await start(page, lang);
    const w = await openWidgets(page);
    await setMode(w, 'edit');
    /* Aplikace: stávající panel overlaye s plnými moduly */
    const [ov] = await Promise.all([w.waitForEvent('popup'), w.getByTestId('wg-app').click()]);
    await expect(ov.getByTestId('overlay')).toBeVisible();
    await ov.getByTestId('ov-app-entry').click();
    await expect(ov.getByTestId('ov-app-picker')).toBeVisible();
    await ov.close();
    /* Ctrl+K: hledání widgetů a modulů; modul se otevře v panelu Aplikace */
    await w.keyboard.press('Control+KeyK');
    const field = w.getByTestId('wg-search-field');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-label', L.search);
    await field.fill('journal');
    const [ov2] = await Promise.all([w.waitForEvent('popup'), w.getByTestId('wg-search-mod-journal').click()]);
    await expect(ov2.getByTestId('ov-app-host')).toHaveAttribute('data-module', 'journal');
    await expect(w.getByTestId('wg-search-pop')).toHaveCount(0);
    await expect(w.getByTestId('widgets')).toHaveAttribute('data-mode', 'edit');
  });
}

test('Nastavení: přepínač widgetů je ve výchozím stavu vypnutý a potřebuje Ops; nápověda k celé obrazovce', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.clear(); localStorage.setItem('arcops:state', JSON.stringify({ schema: 18, settings: { autoSnapshot: false, lang: 'cs' } })); } });
  await page.goto('/#settings');
  const sw = page.getByTestId('wg-switch');
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeDisabled();
  await expect(page.getByTestId('wg-needs-ops')).toBeVisible();
  await expect(page.getByTestId('wg-fullscreen')).toContainText('borderless');
  await page.getByTestId('ops-switch').check();
  await expect(sw).toBeEnabled();
  await sw.check();
  await expect(page.getByTestId('wg-options')).toBeVisible();
  await expect.poll(async () => (await stateOf(page))?.opsPrefs?.widgets?.on).toBe(true);
});
