/* 0.19.0: „Co je nového“ po aktualizaci a nové kroky průvodce, v obou jazycích.
   Karta se v automatizovaném prohlížeči sama neukazuje (navigator.webdriver, jako průvodce); test si ji vyžádá
   (window.__arcopsWhatsNew). Aktualizace = uložený stav staršího schématu bez pole whatsNew.
   1) Aktualizace z 0.16.1 (schéma 14): karta s 0.19.0 a staršími verzemi, odkaz bodu otevře modul a kartu zavře,
      po obnovení stránky už není; Nastavení → O aplikaci ji otevře znovu se všemi verzemi.
   2) Nová instalace (bez stavu): žádná karta. Stejná verze (schéma 18, viděl 0.22.0): žádná karta.
   3) Průvodce: po buildech přijde „Co dál?“, příprava na raid, mapa a hledání (Ukaž mi to otevře Ctrl+K). */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function seed(page: Page, state: unknown, opts: { whatsNew?: boolean; tutorial?: boolean } = {}) {
  await page.addInitScript(([s, wn, tut]) => {
    const w = window as unknown as { __arcopsWhatsNew?: boolean; __arcopsTutorial?: boolean };
    if (wn) w.__arcopsWhatsNew = true;
    if (tut) w.__arcopsTutorial = true;
    if (sessionStorage.getItem('wn-seeded')) return;
    sessionStorage.setItem('wn-seeded', '1');
    localStorage.clear();
    if (s) localStorage.setItem('arcops:state', s);
  }, [state ? JSON.stringify(state) : '', opts.whatsNew ? '1' : '', opts.tutorial ? '1' : ''] as const);
}

const T = {
  cs: {
    title: 'Co je nového', since: 'Od verze 0.16.1, kterou jsi měl naposledy.', all: 'Novinky posledních verzí.', older: 'Starší verze (6)',
    v19: 'Verze 0.22.0', ok: 'Rozumím', close: 'Zavřít novinky', raid: 'Příprava na raid', search: 'Hledat (Ctrl+K)', reopen: 'Co je nového',
    raidHead: 'Příprava na raid', searchDialog: 'Hledat všude', version: 'ARC Raiders Companion 0.22.0',
    advisorLine: 'Nevíš, co dál? Na Dashboardu ti v kartě „Co dál?“ poradím i s důvodem.',
    raidLine: 'Před raidem mrkni do Přípravy na raid. Řeknu ti, co hledat a kam jít. Nad hrou to máš v záložce Raid.',
    mapLine: 'V Mapách stačí vložit snímek herní mapy a máš interaktivní mapu se svými body.',
    searchLine: 'Hledáš něco? Ctrl+K najde předměty, úkoly i stanice. Karta předmětu ti řekne, proč ho potřebuješ.',
    next: 'Dál', show: 'Ukaž mi to', step: (n: number) => `Krok ${n} z 14`,
  },
  en: {
    title: "What's new", since: 'Since version 0.16.1, the one you had last.', all: 'Highlights of recent versions.', older: 'Older versions (6)',
    v19: 'Version 0.22.0', ok: 'Got it', close: "Close what's new", raid: 'Raid prep', search: 'Search (Ctrl+K)', reopen: "What's new",
    raidHead: 'Raid prep', searchDialog: 'Search everywhere', version: 'ARC Raiders Companion 0.22.0',
    advisorLine: 'Not sure what to do next? The "What next?" card on the Dashboard tells you, and why.',
    raidLine: 'Check Raid prep before a raid. I tell you what to look for and where to go. Over the game it is in the Raid tab.',
    mapLine: 'In Maps, just add a screenshot of the in-game map and you get an interactive map with your points.',
    searchLine: 'Looking for something? Ctrl+K finds items, quests and stations. The item card tells you why you need it.',
    next: 'Next', show: 'Show me', step: (n: number) => `Step ${n} of 14`,
  },
} as const;

const upgraded = (lang: 'cs' | 'en') => ({
  schema: 14, profile: { level: 12, rounds: 3 }, stations: { gear: 1 }, opsPrefs: { tutorial: { status: 'done', step: 'end' } },
  settings: { autoSnapshot: false, lang },
});

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];

  test(`po aktualizaci: karta Co je nového, odkaz otevře modul, znovu z Nastavení (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, upgraded(lang), { whatsNew: true });
    await page.goto('/#dashboard');
    const card = page.getByTestId('whatsnew');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-mode', 'pending');
    await expect(card.getByRole('heading', { name: L.title })).toBeVisible();
    await expect(card).toContainText(L.since);
    await expect(card.locator('.whatsnew-release').first()).toHaveAttribute('data-version', '0.22.0');
    await expect(card.locator('.whatsnew-release').first()).toContainText(L.v19);
    /* starší verze 0.21.0, 0.20.1, 0.20.0, 0.19.0, 0.18.0 a 0.17.0 jsou sbalené; 0.16.1 a starší tu nejsou */
    const older = card.locator('details.whatsnew-older');
    await expect(older.locator('summary')).toHaveText(L.older);
    await expect(card.locator('[data-version="0.16.1"]')).toHaveCount(0);
    /* karta nebere fokus a nic neblokuje: modul pod ní funguje */
    await expect(card).not.toBeFocused();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    /* odkaz bodu (0.18.0 → hledání) */
    await older.locator('summary').click();
    await card.locator('[data-version="0.18.0"]').getByRole('button', { name: L.search }).click();
    await expect(page.getByRole('dialog', { name: L.searchDialog })).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).whatsNew).toEqual({ seen: '0.22.0' });
    await page.keyboard.press('Escape');
    /* po obnovení stránky už nic */
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(card).toHaveCount(0);

    /* Nastavení → O aplikaci: verze a znovu otevřená karta se všemi verzemi */
    await page.goto('/#settings/about');
    await expect(page.getByTestId('app-version')).toContainText('0.22.0');
    await page.getByTestId('whatsnew-reopen').click();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-mode', 'all');
    await expect(card).toContainText(L.all);
    await expect(card).toBeFocused();
    await card.locator('details.whatsnew-older summary').click();
    await expect(card.locator('[data-version="0.10.0"]')).toBeVisible();
    await expect(card).toContainText(L.version);
    /* odkaz na přípravu na raid (0.14.0) */
    await card.locator('[data-version="0.14.0"]').getByRole('button', { name: L.raid }).click();
    await expect(page).toHaveURL(/#raid$/);
    await expect(page.locator('h1')).toHaveText(L.raidHead);
    await expect(card).toHaveCount(0);
    /* zavření tlačítkem */
    await page.goto('/#settings/about');
    await page.getByTestId('whatsnew-reopen').click();
    await card.getByRole('button', { name: L.ok }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).whatsNew).toEqual({ seen: '0.22.0' });
    expect(errors).toEqual([]);
  });

  test(`nová instalace: žádná karta (${lang})`, async ({ page }) => {
    await seed(page, null, { whatsNew: true });
    await page.goto('/#dashboard');
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.getByTestId('whatsnew')).toHaveCount(0);
  });

  test(`stejná verze (schéma 18, viděl 0.22.0): žádná karta (${lang})`, async ({ page }) => {
    await seed(page, { schema: 18, whatsNew: { seen: '0.22.0' }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang } }, { whatsNew: true });
    await page.goto('/#dashboard');
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.getByTestId('whatsnew')).toHaveCount(0);
  });

  test(`aktualizace z 0.21.0: jen 0.22.0, křížek kartu zavře (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { schema: 18, whatsNew: { seen: '0.21.0' }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang } }, { whatsNew: true });
    await page.goto('/#dashboard');
    const card = page.getByTestId('whatsnew');
    await expect(card.locator('.whatsnew-release')).toHaveCount(1);
    await expect(card.locator('.whatsnew-release').first()).toHaveAttribute('data-version', '0.22.0');
    await expect(card.locator('details')).toHaveCount(0);
    await card.getByRole('button', { name: L.close }).click();
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).whatsNew).toEqual({ seen: '0.22.0' });
    expect(errors).toEqual([]);
  });

  test(`průvodce: Co dál?, příprava na raid, mapa a hledání (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, { schema: 17, whatsNew: { seen: '0.20.1' }, opsPrefs: { personality: 'friendly', tutorial: { status: 'active', step: 'tour-builds' } }, settings: { autoSnapshot: false, lang } }, { tutorial: true });
    await page.goto('/#dashboard');
    const tour = page.getByTestId('tour');
    /* rozběhnutý průvodce se po startu nejdřív zeptá, zda pokračovat */
    await tour.getByRole('button', { name: lang === 'cs' ? 'Pokračovat' : 'Continue' }).click();
    await expect(tour).toHaveAttribute('data-step', 'tour-builds');
    await tour.getByRole('button', { name: L.next, exact: true }).click();
    await expect(tour.getByTestId('tour-line')).toHaveText(L.advisorLine);
    await expect(tour).toContainText(L.step(8));
    await expect(page.locator('.sidebar a.nav-item[href="#dashboard"]')).toHaveClass(/tour-target/);
    await tour.getByRole('button', { name: L.next, exact: true }).click();
    await expect(tour.getByTestId('tour-line')).toHaveText(L.raidLine);
    await tour.getByRole('button', { name: L.show }).click();
    await expect(page).toHaveURL(/#raid$/);
    await tour.getByRole('button', { name: L.next, exact: true }).click();
    await expect(tour.getByTestId('tour-line')).toHaveText(L.mapLine);
    await expect(page.locator('.sidebar a.nav-item[href="#maps"]')).toHaveClass(/tour-target/);
    await tour.getByRole('button', { name: L.next, exact: true }).click();
    await expect(tour.getByTestId('tour-line')).toHaveText(L.searchLine);
    await tour.getByRole('button', { name: L.show }).click();
    await expect(page.getByRole('dialog', { name: L.searchDialog })).toBeVisible();
    await page.keyboard.press('Escape');
    await tour.getByRole('button', { name: L.next, exact: true }).click();
    await expect(tour).toHaveAttribute('data-step', 'tour-compact');
    await expect.poll(async () => (await stateOf(page)).opsPrefs.tutorial).toEqual({ status: 'active', step: 'tour-compact' });
    expect(errors).toEqual([]);
  });
}
