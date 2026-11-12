/* 0.16.0: celá aplikace z overlaye. Tlačítko Aplikace (vedle záložek): výběr modulu (skupiny jako postranní panel, šipky), plné
   moduly ve velkém panelu, zápis jen přes hlavní okno. Úprava ve třech plných modulech (Raid Checklist, Weekly
   Trials, Raid Journal s formulářem raidu) se objeví v hlavním okně; Nastavení jen „Otevřít v aplikaci“.
   Hlavní okno se v testu nenačítá znovu (jen změna #), jako ve skutečné aplikaci. */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const go = (page: Page, hash: string) => page.evaluate(h => { window.location.hash = h; }, hash);
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const T = {
  cs: {
    app: 'Aplikace', quests: 'Úkoly', raid: 'Raid', back: 'Moduly', group: 'Raidy', openInApp: 'Otevřít v aplikaci', stars1: 'Hvězdy výzvy 1', three: '3 hvězdy',
    name1: 'Název výzvy 1', log: 'Zapsat raid', save: 'Uložit raid', grip: /^Změnit velikost panelu/, mainOnly: 'jen v aplikaci',
  },
  en: {
    app: 'App', quests: 'Quests', raid: 'Raid', back: 'Modules', group: 'Raids', openInApp: 'Open in app', stars1: 'Challenge 1 stars', three: '3 stars',
    name1: 'Challenge 1 name', log: 'Log raid', save: 'Save raid', grip: /^Resize the panel/, mainOnly: 'app only',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`celá aplikace z overlaye: Checklist, Trials, Journal a Nastavení (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('ova')) return;
      sessionStorage.setItem('ova', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({ schema: 14, profile: { level: 12, coins: 800 }, buddy: { enabled: true }, settings: { lang } }));
    await page.goto('/');
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();

    /* Aplikace není záložka: záložky a jejich pořadí se nemění (Raid zůstává poslední, šipka z něj vede na Přehled);
       tlačítko Aplikace je v liště hned za záložkami a dostane se na něj Tabem */
    const tabs = ov.getByRole('tab');
    await expect(tabs).toHaveCount(9);
    await expect(tabs.last()).toHaveText(new RegExp('^' + L.raid));
    await tabs.last().click();
    await ov.keyboard.press('ArrowRight');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await tabs.last().click();
    await ov.keyboard.press('Tab');
    const appEntry = ov.getByTestId('ov-app-entry');
    await expect(appEntry).toBeFocused();
    await expect(appEntry).toHaveText(L.app);
    await ov.keyboard.press('Enter');
    await expect(appEntry).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'false');
    const picker = ov.getByTestId('ov-app-picker');
    await expect(picker).toBeVisible();
    await expect(picker.locator('button[data-module]')).toHaveCount(18);
    await expect(picker.getByText(L.group, { exact: true })).toBeVisible();
    await expect(picker.locator('button[data-module="settings"]')).toContainText(L.mainOnly);

    /* výběr šipkami a Enter: z Journalu šipkou dolů na Raid Checklist */
    await picker.locator('button[data-module="journal"]').focus();
    await ov.keyboard.press('ArrowDown');
    await expect(picker.locator('button[data-module="checklist"]')).toBeFocused();
    await ov.keyboard.press('Enter');
    const host = ov.getByTestId('ov-app-host');
    await expect(host).toHaveAttribute('data-module', 'checklist');
    await expect(ov.getByTestId('overlay')).toHaveClass(/ov-wide/);
    await expect(ov.getByTestId('ov-app-back')).toBeFocused();

    /* 1) Raid Checklist: zaškrtnutí bodu zapíše hlavní okno */
    const view = ov.getByTestId('ov-appview');
    const box = view.getByRole('checkbox').first();
    const itemLabel = (await view.locator('label:has(input[type="checkbox"])').first().innerText()).trim();
    await box.check();
    await expect.poll(async () => Object.keys((await stateOf(page)).checklists.checked).length).toBe(1);
    await go(page, '#checklist');
    await expect(page.getByRole('checkbox', { name: itemLabel })).toBeChecked();

    /* 2) Weekly Trials: hvězdy a název výzvy */
    await ov.getByTestId('ov-app-back').click();
    await expect(picker.locator('button[data-module="checklist"]')).toBeFocused();
    await picker.locator('button[data-module="trials"]').click();
    await expect(host).toHaveAttribute('data-module', 'trials');
    await view.getByRole('radiogroup', { name: L.stars1 }).getByRole('radio', { name: L.three }).click();
    await view.getByRole('textbox', { name: L.name1 }).fill('Overlay trial');
    await view.getByRole('textbox', { name: L.name1 }).press('Enter');
    await expect.poll(async () => (await stateOf(page)).trials.stars[0]).toBe(3);
    await expect.poll(async () => (await stateOf(page)).trials.names[0]).toBe('Overlay trial');
    await go(page, '#trials');
    await expect(page.getByRole('radiogroup', { name: L.stars1 }).getByRole('radio', { name: L.three })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: L.name1 })).toHaveValue('Overlay trial');

    /* 3) Raid Journal: formulář raidu v overlayi (loot ze snímku souboru jen v aplikaci), nový raid má v obou oknech stejné id */
    await ov.getByTestId('ov-app-back').click();
    await picker.locator('button[data-module="journal"]').click();
    await expect(host).toHaveAttribute('data-module', 'journal');
    await view.getByRole('button', { name: L.log }).first().click();
    const dialog = ov.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('in-app-only')).toBeVisible();
    await dialog.getByRole('button', { name: L.save }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).raids.length).toBe(1);
    const raidId: string = (await stateOf(page)).raids[0].id;
    await go(page, '#journal');
    await expect(page.locator('.page')).not.toContainText(lang === 'cs' ? 'Zatím nemáš zapsaný raid.' : 'You have not recorded a raid yet.');
    await expect(page.getByRole('button', { name: new RegExp('^' + (lang === 'cs' ? 'Upravit raid' : 'Edit the raid')) })).toHaveCount(1);
    /* overlay po potvrzení ukazuje stejný záznam (stejné id: úprava z overlaye se trefí do raidu v hlavním okně) */
    await view.getByRole('button', { name: new RegExp('^' + (lang === 'cs' ? 'Upravit raid' : 'Edit the raid')) }).first().click();
    await expect(ov.getByRole('dialog')).toBeVisible();
    await ov.getByRole('dialog').getByRole('button', { name: L.save }).click();
    await page.waitForTimeout(400);
    const after = await stateOf(page);
    expect(after.raids.length).toBe(1);
    expect(after.raids[0].id).toBe(raidId);

    /* panel: velikost úchytem z klávesnice se pamatuje na tomto počítači (mimo stav aplikace a zálohu) */
    const grip = ov.getByRole('button', { name: L.grip });
    await grip.focus();
    await ov.keyboard.press('ArrowLeft');
    await expect.poll(() => ov.evaluate(() => localStorage.getItem('arcops:overlay:panel'))).not.toBeNull();
    const panel = JSON.parse((await ov.evaluate(() => localStorage.getItem('arcops:overlay:panel')))!);
    expect(panel.w).toBeGreaterThan(0);
    expect(JSON.stringify(await stateOf(page))).not.toContain('overlay:panel');

    /* Nastavení: jen v hlavním okně, „Otevřít v aplikaci“ otevře hlavní okno na Nastavení */
    await ov.getByTestId('ov-app-back').click();
    await picker.locator('button[data-module="settings"]').click();
    await expect(host).toHaveAttribute('data-module', 'settings');
    await expect(view.getByTestId('in-app-only')).toBeVisible();
    await expect(view.getByTestId('ops-switch')).toHaveCount(0);
    await view.getByRole('button', { name: L.openInApp }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#settings');

    /* ostatní záložky dál fungují; návrat z Aplikace vrátí běžný overlay */
    await ov.getByRole('tab', { name: new RegExp('^' + L.quests) }).click();
    await expect(ov.getByTestId('overlay')).not.toHaveClass(/ov-wide/);
    await expect(ov.locator('.ov-quest').first()).toBeVisible();
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });
}

test('plné moduly v overlayi: všechny moduly se otevřou bez chyby a bez druhého zapisovatele', async ({ page, context }) => {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('ovb')) return;
    sessionStorage.setItem('ovb', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify({ schema: 14, profile: { level: 20 }, inventory: { 'Metal Parts': 5 }, buddy: { enabled: true }, settings: { lang: 'cs' } }));
  await page.goto('/');
  const ov = await context.newPage();
  const ovErrors = watchErrors(ov);
  await ov.goto('/overlay.html');
  await expect(ov.getByTestId('overlay')).toBeVisible();
  await ov.getByTestId('ov-app-entry').click();
  const ids = await ov.locator('[data-testid="ov-app-picker"] button[data-module]').evaluateAll(b => b.map(x => x.getAttribute('data-module')!));
  /* základ až po prvním uložení hlavního okna (normalizovaný stav) */
  await expect.poll(async () => (await stateOf(page))?.meta !== undefined).toBe(true);
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => localStorage.getItem('arcops:state'));
  for (const id of ids) {
    await ov.evaluate(h => { window.location.hash = h; }, '#' + id);
    await expect(ov.getByTestId('ov-app-host')).toHaveAttribute('data-module', id);
    await expect(ov.getByTestId('ov-appview').locator('.page').first()).toBeVisible();
    await expect(ov.getByTestId('ov-appview')).not.toContainText(/Modul se v overlayi nepodařilo zobrazit/);
  }
  /* map image a import ze souboru: v overlayi jen „Otevřít v aplikaci“ */
  await ov.evaluate(() => { window.location.hash = '#maps'; });
  await expect(ov.getByTestId('ov-appview').getByTestId('in-app-only')).toBeVisible();
  await expect(ov.getByTestId('map-change')).toHaveCount(0);
  await ov.evaluate(() => { window.location.hash = '#inventory/import'; });
  await expect(ov.getByTestId('ov-appview').getByTestId('in-app-only')).toHaveAttribute('data-route', 'inventory/import');
  await expect(ov.getByTestId('scan-file')).toHaveCount(0);
  /* jen prohlížení nic nezapsalo */
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => localStorage.getItem('arcops:state'))).toBe(saved);
  expect(ovErrors).toEqual([]);
});
