/* 0.9.0: kompaktní režim hlavního okna ve webovém sestavení (nativní okno je nahrazené zástupcem, jeho volání
   čte window.__winTest.log). Obsah v obou jazycích, prázdný stav, nízká varianta, rozbalení a návrat, připnutí,
   sbalení sekcí a chování křížku včetně Nastavení. */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.COMPACT_SHOTS || '';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const winLog = (page: Page) => page.evaluate(() => (window as unknown as { __winTest: { log: string[] } }).__winTest.log.slice());
/* uložení stavu (debounce 500 ms) */
const settle = (page: Page) => page.waitForTimeout(800);

/* Hráč jako v návrhu: level 20, Gear Bench 1 → 2 zvolený v Planneru, tři připnuté úkoly. */
const PLAYER = (lang: 'cs' | 'en', extra: Record<string, unknown> = {}) => ({
  schema: 7,
  profile: { level: 20, xp: 2977, xpNext: 29000, coins: 58313, rounds: 40 },
  stations: { gear: 1 },
  inventory: { 'Power Cable': 1, 'Electrical Components': 3, 'Hornet Driver': 1 },
  planner: { stations: { gear: 2 }, items: [], includeGoals: true, includeQuests: true },
  quests: { done: {}, pinned: ['shoring_up_defenses', 'battening_down', 'taking_stock'] },
  mainWindow: { mode: 'compact' },
  settings: { autoSnapshot: false, lang },
  ...extra,
});

/* Stav se vloží před prvním načtením (jen jednou za test, reload ho pak nepřepíše). */
async function seed(page: Page, state: unknown, size = { width: 420, height: 720 }) {
  await page.setViewportSize(size);
  await page.addInitScript(s => {
    if (sessionStorage.getItem('compact-seeded')) return;
    sessionStorage.setItem('compact-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify(state));
  await page.goto('/');
  await expect(page.locator((state as { mainWindow?: { mode?: string } }).mainWindow?.mode === 'compact' ? '.cw' : '.shell').first()).toBeVisible();
}

test('kompakt česky: profil, úkoly, nákupy, vylepšení a akce', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, PLAYER('cs'));
  const c = page.getByRole('region', { name: 'Kompaktní režim' });
  await expect(c.getByLabel('Úroveň 20')).toBeVisible();
  await expect(c.getByLabel(/^Mince: 58\s313$/)).toBeVisible();
  await expect(c.getByText(/2\s977 \/ 29\s000 XP/)).toBeVisible();
  await expect(c.getByTestId('compact-ops')).toHaveText('Ops vypnut');
  /* úkoly: tři připnuté, počítadlo 03 */
  await expect(c.getByRole('heading', { name: 'Aktivní úkoly' })).toBeVisible();
  const quests = c.getByTestId('compact-quests').locator('li');
  await expect(quests).toHaveCount(3);
  await expect(quests.nth(0)).toContainText('Shoring Up Defenses');
  await expect(quests.nth(1)).toContainText('Battening Down');
  await expect(quests.nth(2)).toContainText('Taking Stock');
  await expect(c.locator('[data-section="quests"] .cw-tag')).toHaveText('03');
  /* nákupy pro Gear Bench 2: mám / potřebuji, rarita barvou i slovem */
  await expect(c.getByText('Pro Gear Bench 2')).toBeVisible();
  const shop = c.getByTestId('compact-shop').locator('li');
  await expect(shop).toHaveCount(3);
  await expect(c.getByRole('listitem', { name: 'Power Cable, Vzácné: mám 1 z 3' })).toBeVisible();
  await expect(shop.first()).toHaveAttribute('data-rarity', /\w+/);
  await expect(shop.first().locator('small')).toBeVisible();
  /* další vylepšení */
  await expect(c.getByTestId('compact-upgrade')).toContainText('Gear Bench');
  await expect(c.getByTestId('compact-upgrade')).toContainText('Chybí 8 ks');
  await expect(c.getByTestId('compact-upgrade')).toContainText('Hornet Driver −4');
  /* Snímek: v prohlížeči nedostupný, s nápovědou (tlačítko zůstává v pořadí Tabu) */
  const cap = c.getByTestId('compact-capture');
  await expect(cap).toHaveAttribute('aria-disabled', 'true');
  await cap.click({ force: true }); /* aria-disabled: klik jen ukáže nápovědu */
  await expect(c.getByTestId('compact-toast')).toContainText('Snímek funguje jen v desktopové aplikaci.');
  await expect(c.getByRole('button', { name: 'Zápis raidu' })).toBeVisible();
  await expect(c.getByRole('button', { name: 'Úklid stashe' })).toBeVisible();
  /* ovládání okna s pojmenovanými tlačítky */
  for (const name of ['Vždy navrchu', 'Rozbalit aplikaci', 'Minimalizovat', 'Zavřít okno']) await expect(c.getByRole('button', { name, exact: true })).toBeVisible();
  /* střed se nevejde jen výjimečně; profil a akce jsou vidět */
  const box = await page.locator('.cw-footer').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/compact-cs.png` });
  expect(errors).toEqual([]);
});

test('kompakt anglicky: texty a formát čísel', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, PLAYER('en', { buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' } }));
  const c = page.getByRole('region', { name: 'Compact mode' });
  await expect(c.getByLabel('Level 20')).toBeVisible();
  await expect(c.getByLabel('Coins: 58,313')).toBeVisible();
  await expect(c.getByText('2,977 / 29,000 XP')).toBeVisible();
  await expect(c.getByTestId('compact-ops')).toHaveText('Ops ready');
  for (const h of ['Active quests', 'Shopping list', 'Next upgrade']) await expect(c.getByRole('heading', { name: h })).toBeVisible();
  await expect(c.getByText('For Gear Bench 2')).toBeVisible();
  await expect(c.getByText('Have / need')).toBeVisible();
  await expect(c.getByTestId('compact-upgrade')).toContainText('Missing 8 pcs');
  await expect(c.getByRole('button', { name: 'Log raid' })).toBeVisible();
  await expect(c.getByRole('button', { name: 'Stash cleanup' })).toBeVisible();
  await c.getByTestId('compact-capture').click({ force: true });
  await expect(c.getByTestId('compact-toast')).toContainText('Capture works only in the desktop app.');
  /* žádná čeština v anglickém kompaktu */
  const text = await c.innerText();
  expect(/[áčďéěíňóřšťúůýž]/i.test(text), text).toBe(false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/compact-en.png` });
  expect(errors).toEqual([]);
});

for (const lang of ['cs', 'en'] as const) {
  test(`prázdný stav nového hráče (${lang}): jediná výzva otevře profil v plné aplikaci`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { schema: 7, mainWindow: { mode: 'compact' }, settings: { autoSnapshot: false, lang } });
    const c = page.getByTestId('compact');
    await expect(c.getByTestId('compact-empty')).toBeVisible();
    await expect(c.getByRole('heading', { name: lang === 'cs' ? 'Začni svou první výpravou.' : 'Start your first expedition.' })).toBeVisible();
    await expect(c.getByTestId('compact-ops')).toHaveText(lang === 'cs' ? 'Ops čeká' : 'Ops waiting');
    await expect(c.getByTestId('compact-toast')).toHaveText(lang === 'cs' ? 'Offline · data jen v tomto zařízení' : 'Offline · data stays on this device');
    /* rychlé akce jsou skryté, výzva je jen jedna */
    await expect(c.getByTestId('compact-capture')).toHaveCount(0);
    await expect(c.locator('.cw-content button')).toHaveCount(1);
    if (SHOTS && lang === 'cs') await page.screenshot({ path: `${SHOTS}/compact-empty.png` });
    await c.getByRole('button', { name: lang === 'cs' ? 'Nastavit profil' : 'Set up profile' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Player Profile' })).toBeVisible();
    await expect(page).toHaveURL(/#profile$/);
    await settle(page);
    expect((await stateOf(page)).mainWindow.mode).toBe('full');
    expect(errors).toEqual([]);
  });
}

for (const lang of ['cs', 'en'] as const) {
  test(`nízká varianta 420 × 520 (${lang}): vše bez posouvání, rarita jen v popisku`, async ({ page }) => {
    await seed(page, PLAYER(lang), { width: 420, height: 520 });
    const c = page.getByTestId('compact');
    await expect(c).toHaveClass(/\bcw--short\b/);
    const shop = c.getByTestId('compact-shop').locator('li');
    await expect(shop.first().locator('small')).toBeHidden();
    await expect(shop.first()).toHaveAttribute('title', lang === 'cs' ? /Vzácné|Neobvyklé|Běžné|Epické|Legendární|Rarita/ : /Rare|Uncommon|Common|Epic|Legendary|Rarity/);
    await expect(c.locator('.cw-missing')).toBeHidden();
    const overflow = await page.locator('.cw-content').evaluate(el => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
    const foot = await page.locator('.cw-footer').boundingBox();
    expect(foot!.y + foot!.height).toBeLessThanOrEqual(520);
    if (SHOTS && lang === 'cs') await page.screenshot({ path: `${SHOTS}/compact-short.png` });
  });
}

test('rozbalení a návrat, zkratky v okně, připnutí jen v kompaktu, sbalení sekcí se pamatuje', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, PLAYER('cs'));
  const c = page.getByTestId('compact');
  /* připnutí: výchozí vypnuto, přepínač s aria-pressed */
  const pin = c.getByTestId('compact-pin');
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  /* sbalení sekce */
  await c.locator('[data-section="shop"] summary').click();
  await expect(c.getByTestId('compact-shop')).toBeHidden();
  /* rozbalení do plné aplikace: připnutí tam není */
  await c.getByTestId('compact-expand').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('compact-pin')).toHaveCount(0);
  await expect(page.getByTestId('to-compact')).toBeFocused();
  await settle(page);
  let st = await stateOf(page);
  expect(st.mainWindow).toMatchObject({ mode: 'full', pin: true, collapsed: { shop: true } });
  /* zpět pojmenovaným tlačítkem: připnutí i sbalení zůstalo */
  await page.getByTestId('to-compact').click();
  await expect(page.getByTestId('compact-pin')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('compact-shop')).toBeHidden();
  await expect(page.getByTestId('compact-expand')).toBeFocused();
  /* místní zkratky */
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByTestId('compact-pin')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Shift+M');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Control+Shift+P'); /* v plném režimu nic */
  await page.keyboard.press('Control+Shift+M');
  await expect(page.getByTestId('compact-pin')).toHaveAttribute('aria-pressed', 'false');
  /* sekce znovu otevřít klávesnicí */
  await page.locator('[data-section="shop"] summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('compact-shop')).toBeVisible();
  await settle(page);
  st = await stateOf(page);
  expect(st.mainWindow).toMatchObject({ mode: 'compact', pin: false, collapsed: {} });
  expect(await winLog(page)).toEqual(expect.arrayContaining(['pin:true', 'mode:full', 'mode:compact', 'pin:false']));
  /* po reloadu zůstane kompakt */
  await page.reload();
  await expect(page.getByTestId('compact')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Zápis raidu a Úklid stashe rozbalí aplikaci na správné místo', async ({ page }) => {
  await seed(page, PLAYER('cs'));
  await page.getByRole('button', { name: 'Zápis raidu' }).click();
  await expect(page.getByRole('dialog', { name: 'Zapsat raid' })).toBeVisible();
  await expect(page).toHaveURL(/#journal$/);
  await page.keyboard.press('Escape');
  await page.getByTestId('to-compact').click();
  await page.getByRole('button', { name: 'Úklid stashe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Úklid stashe' })).toHaveAttribute('aria-selected', 'true');
});

test('křížek: poprvé dialog, zapamatovaná volba pak potichu, změna v Nastavení (cs)', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, PLAYER('cs'));
  await page.getByTestId('compact-close').click();
  const dlg = page.getByRole('dialog', { name: 'Zavřít aplikaci?' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('close-tray')).toBeFocused();
  /* Escape jen zruší */
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  expect(await winLog(page)).not.toContain('hide');
  /* bez zapamatování: provede se, ale příště se zeptá znovu */
  await page.getByTestId('compact-close').click();
  await dlg.getByRole('button', { name: 'Ukončit aplikaci' }).click();
  await expect(dlg).toBeHidden();
  expect(await winLog(page)).toContain('quit');
  await settle(page);
  expect((await stateOf(page)).mainWindow.close).toBe('ask');
  /* se zapamatováním */
  await page.getByTestId('compact-close').click();
  await dlg.getByLabel('Zapamatovat volbu').check();
  await dlg.getByRole('button', { name: 'Skrýt do oznamovací oblasti' }).click();
  await expect(dlg).toBeHidden();
  expect((await winLog(page)).filter(x => x === 'hide')).toHaveLength(1);
  await settle(page);
  expect((await stateOf(page)).mainWindow.close).toBe('tray');
  await page.getByTestId('compact-close').click();
  await expect(dlg).toBeHidden();
  expect((await winLog(page)).filter(x => x === 'hide')).toHaveLength(2);
  /* Nastavení → Okno aplikace: zpět na „Pokaždé se zeptat“ */
  await page.getByTestId('compact-expand').click();
  await page.goto('/#settings');
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: 'Okno aplikace' }) });
  await expect(panel.getByRole('button', { name: 'Skrýt do oznamovací oblasti' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Pokaždé se zeptat' }).click();
  await expect(panel.getByRole('button', { name: 'Pokaždé se zeptat' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByLabel('Počet úkolů v kompaktu').selectOption('5');
  await settle(page);
  expect((await stateOf(page)).mainWindow).toMatchObject({ close: 'ask', quests: 5 });
  await panel.getByTestId('win-to-compact').click();
  await expect(page.getByTestId('compact')).toBeVisible();
  await page.getByTestId('compact-close').click();
  await expect(dlg).toBeVisible();
  expect(errors).toEqual([]);
});

test('close button settings in English and pinning a quest', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, PLAYER('en', { mainWindow: { mode: 'full' }, quests: { done: {}, pinned: [] } }), { width: 1280, height: 800 });
  await page.goto('/#settings');
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: 'App window' }) });
  await expect(panel.getByRole('button', { name: 'Ask every time' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Quit app' }).click();
  await expect(panel.getByRole('button', { name: 'Quit app' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('Ctrl+Shift+M');
  /* připnutý úkol jde v kompaktu první */
  await page.goto('/#quests');
  const row = page.locator('tr[data-quest="taking_stock"]');
  await page.getByLabel('Search quests').fill('Taking Stock');
  await row.getByRole('button', { name: 'Pin to compact mode: Taking Stock' }).click();
  await expect(row).toContainText('Pinned');
  await page.getByTestId('to-compact').click();
  await expect(page.getByTestId('compact-quests').locator('li').first()).toContainText('Taking Stock');
  /* zapamatované „Quit app“: křížek bez dialogu */
  await page.getByTestId('compact-close').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await winLog(page)).toContain('quit');
  await settle(page);
  expect((await stateOf(page)).mainWindow.close).toBe('quit');
  expect(errors).toEqual([]);
});
