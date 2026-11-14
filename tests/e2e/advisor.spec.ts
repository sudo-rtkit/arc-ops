/* 0.17.0: rádce „Co dál?“ v obou jazycích.
   1) Dashboard: karta „Co dál?“ s tipy podle priority, klik na tip otevře modul, skrytí a odložení se zapíší,
      Všechny tipy ukážou prioritu a skryté tipy a vrátí je.
   2) Overlay: přehled ukáže tipy a Ops při otevření řekne ten nejdůležitější; klik otevře plný modul v overlayi,
      skrytí z overlaye zapíše hlavní okno.
   3) Kompakt: nejdůležitější tip pod Opsem otevře plnou aplikaci na cíli tipu.
   4) Nastavení: rada nahlas jde vypnout. */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* Gear Bench 2 je připravený (88), cíl má termín dnes (78), 20 volných skill bodů (60). */
const seedState = (lang: 'cs' | 'en', extra: Record<string, unknown> = {}) => ({
  schema: 14, profile: { level: 20, rounds: 10, coins: 500 }, stations: { gear: 1 },
  inventory: { 'Power Cable': 3, 'Electrical Components': 5, 'Hornet Driver': 5 },
  skills: { current: { c_used: 1 } },
  goals: [{ id: 'g1', title: 'Test', priority: 2, due: today(), createdAt: 1, link: { kind: 'manual', target: 5, progress: 1 } }],
  buddy: { enabled: true }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang }, ...extra,
});
async function seed(page: Page, state: unknown) {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('adv')) return;
    sessionStorage.setItem('adv', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, JSON.stringify(state));
}

const T = {
  cs: {
    card: 'Co dál?', all: 'Všechny tipy', upgrade: 'Vylepši Gear Bench na 2', goal: 'Blíží se termín: Test', skills: 'Rozdej 20 volných skill bodů',
    open: (x: string) => `Otevřít tip: ${x}`, hide: (x: string) => `Skrýt tip: ${x}`, snooze: (x: string) => `Odložit o den: ${x}`,
    restoreAll: 'Vrátit všechny skryté', hiddenTitle: 'Skryté a odložené tipy', dismissed: 'Skrytý; vrátí se, až se podmínka změní.', priority: 'Priorita 88',
    speak: /^(Co dál\? Do dílny! Gear Bench 2 má všechno, co potřebuje\.|Mám tip: Gear Bench na 2\. Materiál už je v bedně\.)$/,
    compactOpen: 'Otevřít v aplikaci: Vylepši Gear Bench na 2', toggle: 'Ops radí nahlas „Co dál?“',
  },
  en: {
    card: 'What next?', all: 'All tips', upgrade: 'Upgrade Gear Bench to 2', goal: 'Due soon: Test', skills: 'Spend 20 free skill points',
    open: (x: string) => `Open tip: ${x}`, hide: (x: string) => `Hide tip: ${x}`, snooze: (x: string) => `Snooze for a day: ${x}`,
    restoreAll: 'Restore all hidden', hiddenTitle: 'Hidden and snoozed tips', dismissed: 'Hidden; it comes back when its condition changes.', priority: 'Priority 88',
    speak: /^(What next\? The workshop! Gear Bench 2 has everything it needs\.|Here is a tip: Gear Bench to 2\. The material is already in the stash\.)$/,
    compactOpen: 'Open in the app: Upgrade Gear Bench to 2', toggle: 'Ops says "What next?" out loud',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Dashboard: karta Co dál?, otevření, skrytí, odložení a Všechny tipy (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, seedState(lang));
    await page.goto('/#dashboard');
    const card = page.getByTestId('advisor-card');
    await expect(page.getByRole('heading', { name: L.card })).toBeVisible();
    const rows = card.getByTestId('advisor-tip');
    await expect(rows.first()).toHaveAttribute('data-tip', 'upgrade:gear');
    await expect(rows.nth(1)).toHaveAttribute('data-tip', 'goal:g1');
    await expect(card).toContainText(L.upgrade);
    await expect(card).toContainText(L.skills);

    /* klik na tip otevře modul */
    await card.getByRole('button', { name: L.open(L.upgrade) }).click();
    await expect(page).toHaveURL(/#workshop$/);
    await page.goto('/#dashboard');

    /* skrytí: zmizí z karty a zapíše klíč podmínky */
    await card.getByRole('button', { name: L.hide(L.goal) }).click();
    await expect(card.locator('[data-tip="goal:g1"]')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page))?.advisor?.dismissed).toEqual({ 'goal:g1': `${today()}:soon` });
    expect((await stateOf(page)).schema).toBe(19);
    /* odložení o den */
    await card.getByRole('button', { name: L.snooze(L.skills) }).click();
    await expect(card.locator('[data-tip="skills"]')).toHaveCount(0);
    await expect.poll(async () => Object.keys((await stateOf(page)).advisor.snoozed)).toEqual(['skills']);

    /* Všechny tipy: priorita, skryté a odložené, návrat */
    await page.getByTestId('advisor-all').click();
    await expect(page).toHaveURL(/#dashboard\/tips$/);
    const view = page.getByTestId('advisor-all-view');
    await expect(view.locator('[data-tip="upgrade:gear"]')).toContainText(L.priority);
    await expect(page.getByRole('heading', { name: L.hiddenTitle })).toBeVisible();
    await expect(page.getByTestId('advisor-hidden').locator('[data-tip="goal:g1"]')).toContainText(L.dismissed);
    await expect(page.getByTestId('advisor-hidden').locator('[data-tip="skills"]')).toBeVisible();
    await page.getByRole('button', { name: L.restoreAll }).click();
    await expect(page.getByTestId('advisor-hidden')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).advisor).toMatchObject({ dismissed: {}, snoozed: {} });
    await page.goto('/#dashboard');
    await expect(card.locator('[data-tip="goal:g1"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`overlay: přehled s tipy, Ops řekne nejdůležitější, klik otevře modul v overlayi (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await seed(page, seedState(lang));
    await page.goto('/');
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    const list = ov.getByTestId('ov-advisor');
    await expect(list.locator('li').first()).toHaveAttribute('data-tip', 'upgrade:gear');
    await expect(list).toContainText(L.upgrade);
    await expect(list).toContainText(L.goal);
    await expect(ov.locator('.ov-header').getByTestId('ops-line')).toHaveText(L.speak);

    /* skrytí z overlaye zapíše hlavní okno (relay) */
    await list.getByRole('button', { name: L.hide(L.goal) }).click();
    await expect.poll(async () => Object.keys((await stateOf(page))?.advisor?.dismissed ?? {})).toEqual(['goal:g1']);
    await expect(list.locator('[data-tip="goal:g1"]')).toHaveCount(0);

    /* klik na tip otevře plný modul přímo v overlayi */
    await list.getByRole('button', { name: L.open(L.upgrade) }).click();
    await expect(ov.getByTestId('ov-app-host')).toHaveAttribute('data-module', 'workshop');
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });

  test(`kompakt: nejdůležitější tip pod Opsem otevře plnou aplikaci; rada nahlas jde vypnout (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 420, height: 720 });
    await seed(page, seedState(lang, { mainWindow: { mode: 'compact' } }));
    await page.goto('/');
    const tip = page.getByTestId('compact-tip');
    await expect(tip).toHaveAttribute('data-tip', 'upgrade:gear');
    await tip.getByRole('button', { name: L.compactOpen }).click();
    await expect(page).toHaveURL(/#workshop$/);
    await expect.poll(async () => (await stateOf(page)).mainWindow.mode).toBe('full');

    /* Nastavení: rada nahlas jde vypnout (nastavení tohoto počítače) */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#settings');
    const toggle = page.getByTestId('ops-advisor');
    await expect(toggle).toBeChecked();
    await page.getByLabel(L.toggle).uncheck();
    await expect.poll(async () => (await stateOf(page)).opsPrefs.advisor).toBe(false);
    expect(errors).toEqual([]);
  });
}
