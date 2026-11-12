/* 0.10.0: Bedňák 2.0, povahy, zvuky a průvodce prvním spuštěním ve webovém sestavení, v obou jazycích.
   Průvodce se v automatizovaném prohlížeči sám nespouští (navigator.webdriver); tady si ho test vyžádá
   (window.__arcopsTutorial), aby šlo ověřit první spuštění. Zvuky se v prohlížeči jen zaznamenají (__opsSound.log). */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const opaquePixels = (page: Page, sel: string) => page.locator(sel).first().evaluate((c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++;
  return n;
});
async function seed(page: Page, state: unknown, opts: { tutorial?: boolean; size?: { width: number; height: number } } = {}) {
  if (opts.size) await page.setViewportSize(opts.size);
  await page.addInitScript(([s, tut]) => {
    if (tut) (window as unknown as { __arcopsTutorial: boolean }).__arcopsTutorial = true;
    if (sessionStorage.getItem('ops2-seeded')) return;
    sessionStorage.setItem('ops2-seeded', '1');
    localStorage.clear();
    if (s) localStorage.setItem('arcops:state', s);
  }, [state ? JSON.stringify(state) : '', opts.tutorial ? '1' : ''] as const);
  await page.goto('/');
}

const T = {
  cs: {
    welcome: 'Čau, raidere. Jsem Ops. Ty nosíš kořist, já hlídám, co ti chybí. Dáme rychlou prohlídku?',
    welcomeCheeky: 'Jsem Ops. Nejchytřejší bedna v okolí. Dáme prohlídku, ať víš, s kým máš tu čest?',
    start: 'Jdeme na to', manual: 'Vyplnit ručně', done: 'Hotovo', next: 'Dál', resume: 'Pokračovat', skip: 'Přeskočit průvodce',
    shot: /Načíst snímek/, soon: 'připravujeme', profileShotLine: 'Otevřel jsem profil. Vlož snímek obrazovky RAIDER (Ctrl+V) a já z něj přečtu level, XP a mince.', restart: 'Spustit průvodce znovu', hide: 'Schovat do příštího spuštění',
    profileLine: 'Nejdřív ať vím, s kým vyrážím. Pošli mi snímek profilu, napiš mi svůj level, nebo obnov zálohu.',
    captureNoKey: 'Abych mohl číst inventář, zapni mě v Nastavení a vyber zkratku. Bez tvého souhlasu nic nezapíšu.',
    resumeLine: 'Minule jsme nedokončili prohlídku. Pokračujeme, kde jsme skončili?',
    inventory: 'Tady je Inventář. Co máš, co prodat a co recyklovat.',
    plain: 'Věcný', friendly: 'Kamarádský', cheeky: 'Drzý',
    samplePlain: 'Chybí ti 2× Power Cable na Gear Bench 2.',
    sampleFriendly: 'Ještě 2× Power Cable a Gear Bench 2 je tvůj, raidere.',
    sampleCheeky: '2× Power Cable. Jen tohle. Viděl jsem tě kolem toho projít.',
    sound: 'Zvuky Opse', volume: /^Hlasitost/, test: 'Přehrát ukázku', dialogs: 'Dialogy a průvodce', skipped: 'Přeskočený.',
    compactHint: 'Ještě 2× Power Cable, 2× Electrical Components, 4× Hornet Driver a Gear Bench 2 je tvůj, raidere.',
    region: 'Kompaktní režim', ovTitle: 'Polní konzole',
  },
  en: {
    welcome: 'Hi, raider. I am Ops. You carry the loot, I keep track of what you are missing. Quick tour?',
    welcomeCheeky: 'I am Ops. The smartest crate around. A tour, so you know who you are dealing with?',
    start: "Let's go", manual: 'Fill in manually', done: 'Done', next: 'Next', resume: 'Continue', skip: 'Skip the guide',
    shot: /Load a screenshot/, soon: 'coming soon', profileShotLine: 'I opened your profile. Paste a RAIDER screenshot (Ctrl+V) and I will read level, XP and coins from it.', restart: 'Restart the guide', hide: 'Hide until next start',
    profileLine: 'First let me know who I am heading out with. Send me a profile screenshot, tell me your level, or restore a backup.',
    captureNoKey: 'To read your inventory, enable me in Settings and pick a shortcut. Nothing is written without your OK.',
    resumeLine: 'We did not finish the tour last time. Continue where we left off?',
    inventory: 'This is the Inventory. What you have, what to sell and what to recycle.',
    plain: 'Matter-of-fact', friendly: 'Friendly', cheeky: 'Cheeky',
    samplePlain: 'You need 2× Power Cable for Gear Bench 2.',
    sampleFriendly: 'Just 2× Power Cable more and Gear Bench 2 is yours, raider.',
    sampleCheeky: '2× Power Cable. That is all. I saw you walk right past it.',
    sound: 'Ops sounds', volume: /^Volume/, test: 'Play a sample', dialogs: 'Dialogues and guide', skipped: 'Skipped.',
    compactHint: 'Just 2× Power Cable, 2× Electrical Components, 4× Hornet Driver more and Gear Bench 2 is yours, raider.',
    region: 'Compact mode', ovTitle: 'Field console',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  const fresh = { schema: 8, settings: { autoSnapshot: false, lang } };

  test.describe(`Ops 0.10.0 (${lang})`, () => {
    test('průvodce: první spuštění, ruční profil, pokračování po přerušení, přeskočení a nové spuštění', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, fresh, { tutorial: true });
      const tour = page.getByTestId('tour');
      await expect(tour).toBeVisible();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.welcome);
      await expect.poll(() => opaquePixels(page, '.tour canvas')).toBeGreaterThan(800);
      await expect(tour.locator('canvas')).toHaveAttribute('data-variant', 'detail');
      /* aplikace zůstává použitelná (karta není modální) */
      await page.locator('.sidebar a.nav-item[href="#workshop"]').click();
      await expect(page).toHaveURL(/#workshop$/);
      await tour.getByRole('button', { name: L.start }).click();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.profileLine);
      /* 0.10.1: profil ze snímku je aktivní: otevře Profil → Načíst ze snímku, z odbočky jde i ruční vyplnění */
      await expect(tour.getByRole('button', { name: L.shot })).toBeEnabled();
      await tour.getByRole('button', { name: L.shot }).click();
      await expect(page).toHaveURL(/#profile\/shot$/);
      await expect(tour.getByTestId('tour-line')).toHaveText(L.profileShotLine);
      await expect(page.getByTestId('progress-shot')).toBeVisible();
      await expect(page.locator('.sidebar a.nav-item[href="#profile"]')).toHaveClass(/tour-target/);
      await tour.getByRole('button', { name: L.manual }).click();
      await expect(page).toHaveURL(/#profile$/);
      await tour.getByRole('button', { name: L.done, exact: true }).click();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.captureNoKey);
      await tour.getByRole('button', { name: L.next, exact: true }).click();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.inventory);
      await expect(page.locator('.sidebar a.nav-item[href="#inventory"]')).toHaveClass(/tour-target/);
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs.tutorial).toEqual({ status: 'active', step: 'tour-inventory' });

      /* přerušení: po znovunačtení se zeptá a pokračuje od uloženého kroku */
      await page.reload();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.resumeLine);
      await tour.getByRole('button', { name: L.resume }).click();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.inventory);
      /* schovat do příštího spuštění: zmizí, stav zůstane rozběhnutý */
      await tour.getByRole('button', { name: L.hide }).click();
      await expect(tour).toHaveCount(0);
      await page.reload();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.resumeLine);
      /* přeskočení v libovolném kroku */
      await tour.getByRole('button', { name: L.resume }).click();
      await tour.getByRole('button', { name: L.skip }).click();
      await expect(tour).toHaveCount(0);
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs.tutorial.status).toBe('skipped');
      await page.reload();
      await expect(page.locator('.shell')).toBeVisible();
      await expect(tour).toHaveCount(0);

      /* znovu z Nastavení */
      await page.goto('/#settings');
      await expect(page.getByTestId('tour-status')).toHaveText(L.skipped);
      await page.getByRole('button', { name: L.restart }).click();
      await expect(tour.getByTestId('tour-line')).toHaveText(L.welcome);
      expect(errors).toEqual([]);
    });

    test('povaha: přepnutí změní viditelnou hlášku (ukázka v Nastavení i průvodce)', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, fresh, { tutorial: true });
      await page.goto('/#settings');
      const sample = page.getByTestId('ops-sample');
      await expect(sample).toContainText(L.sampleFriendly);
      await expect(page.getByTestId('tour-line')).toHaveText(L.welcome);
      await page.getByRole('button', { name: L.cheeky, exact: true }).click();
      await expect(sample).toContainText(L.sampleCheeky);
      await expect(page.getByTestId('tour-line')).toHaveText(L.welcomeCheeky);
      await page.getByRole('button', { name: L.plain, exact: true }).click();
      await expect(sample).toContainText(L.samplePlain);
      await expect(page.getByRole('button', { name: L.plain, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs.personality).toBe('plain');
      /* dialogy vypnuté: průvodce se po přeskočení sám nevrátí */
      await page.getByTestId('ops-dialogs').uncheck();
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs.dialogs).toBe(false);
      expect(errors).toEqual([]);
    });

    test('zvuky: výchozí zapnuto potichu, hlasitost, ukázka, vypnutí', async ({ page }) => {
      const errors = watchErrors(page);
      await seed(page, fresh);
      await page.goto('/#settings');
      const on = page.getByTestId('ops-sound');
      await expect(on).toBeChecked();
      await expect(page.getByLabel(L.volume)).toHaveValue('25');
      await page.getByLabel(L.volume).fill('60');
      await page.getByLabel(L.volume).blur();
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs.volume).toBe(60);
      await page.getByRole('button', { name: L.test }).click();
      expect(await page.evaluate(() => (window as unknown as { __opsSound: { log: string[] } }).__opsSound.log.slice())).toContain('done');
      await on.uncheck();
      await expect(page.getByRole('button', { name: L.test })).toBeDisabled();
      await expect(page.getByLabel(L.volume)).toBeDisabled();
      await page.waitForTimeout(700);
      expect((await stateOf(page)).opsPrefs).toMatchObject({ sound: false, volume: 60 });
      expect(errors).toEqual([]);
    });

    test('Bedňák 2.0 v kompaktu (menší varianta s radou) a v overlayi (detail v hlavičce)', async ({ page, context }) => {
      const errors = watchErrors(page);
      await seed(page, {
        schema: 7, profile: { level: 20, xp: 2977, xpNext: 29000, coins: 58313, rounds: 40 }, stations: { gear: 1 },
        inventory: { 'Power Cable': 1, 'Electrical Components': 3, 'Hornet Driver': 1 },
        planner: { stations: { gear: 2 }, items: [], includeGoals: true, includeQuests: true },
        buddy: { enabled: true }, mainWindow: { mode: 'compact' }, settings: { autoSnapshot: false, lang },
      }, { size: { width: 420, height: 720 } });
      const c = page.getByRole('region', { name: L.region });
      const row = c.getByTestId('compact-opsrow');
      /* 0.10.1: v kompaktu menší varianta (96 px) */
      await expect(row.locator('canvas')).toHaveAttribute('data-variant', 'corner');
      await expect.poll(() => opaquePixels(page, '.cw-opsrow canvas')).toBeGreaterThan(800);
      await expect(row.getByTestId('ops-line')).toHaveText(L.compactHint);

      const ov = await context.newPage();
      const ovErrors = watchErrors(ov);
      await ov.goto('/overlay.html');
      await expect(ov.getByRole('heading', { name: L.ovTitle })).toBeVisible();
      await expect(ov.locator('.ov-header canvas')).toHaveAttribute('data-variant', 'detail');
      await expect.poll(() => opaquePixels(ov, '.ov-header canvas')).toBeGreaterThan(800);
      await expect(ov.locator('.ov-header').getByTestId('ops-line')).toHaveText(L.compactHint);
      await expect.poll(() => opaquePixels(ov, '.ov-opscard canvas')).toBeGreaterThan(800);

      /* okno buddyho: CORNER 96 px */
      const bd = await context.newPage();
      await bd.goto('/buddy.html');
      await expect(bd.locator('canvas')).toHaveAttribute('data-variant', 'corner', { timeout: 15_000 });
      await expect.poll(() => bd.locator('canvas').evaluate((x: HTMLCanvasElement) => x.width)).toBe(96);
      await expect.poll(() => opaquePixels(bd, 'canvas')).toBeGreaterThan(500);
      expect([...errors, ...ovErrors]).toEqual([]);
    });
  });
}
