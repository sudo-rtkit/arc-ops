/* 0.34.0: oblečení v Šatníku Opse (cs + en): zamčené a odemčené sady, díl do slotu přežije reload, celá sada,
   „Vše automaticky“ oblečení sundá. Stav jen v localStorage tohoto testu (každý test má vlastní kontext). */
import { expect, test, type Page } from '@playwright/test';

const T = {
  cs: { head: 'Pokrývka hlavy', back: 'Záda', whole: 'Celá sada', wearing: 'Nosí celou sadu', auto: 'Vše automaticky', locked: 'Zamčeno', rule: 'Odemkne se na levelu 29', rounds: 'dohraných kolech miniher', extr: 'úspěšných extrakcích', clothing: 'Oblečení' },
  en: { head: 'Headwear', back: 'Back', whole: 'Whole set', wearing: 'Wearing the whole set', auto: 'All automatic', locked: 'Locked', rule: 'Unlocks at level 29', rounds: 'completed minigame rounds', extr: 'successful extractions', clothing: 'Clothing' },
} as const;

async function seed(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(lang => {
    if (sessionStorage.getItem('clothing-seeded')) return;
    sessionStorage.setItem('clothing-seeded', '1');
    const now = Date.now();
    /* level 17 = field + dune, 7 kol miniher = rain, 5 úspěšných extrakcí = forge (a 2 neúspěšné se nepočítají) */
    const raids = Array.from({ length: 7 }, (_, i) => ({ id: 'r' + i, ts: now - i * 60_000, map: 'dam', type: 'pvp', route: '', ok: i < 5, coins: 0, min: 20, notes: '' }));
    localStorage.setItem('arcops:state', JSON.stringify({
      schema: 19, settings: { lang, autoSnapshot: false }, profile: { level: 17 }, raids,
      games: { tetris: { played: 4, best: 0, bestPct: 0 }, quiz: { played: 3, best: 0, streak: 0, bestStreak: 0 } },
      whatsNew: { seen: '0.34.0' }, opsPrefs: { tutorial: { status: 'done', step: 'end' } },
    }));
  }, lang);
}
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state')!));
const opaque = (page: Page, sel: string) => page.locator(sel).evaluate((c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
});
const digest = (page: Page, sel: string) => page.locator(sel).evaluate((c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0;
  return h;
});

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`šatník: zamčené a odemčené sady, díl přežije reload, celá sada, Vše automaticky (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    /* líné načítání: geometrie (corner-*.js, detail-*.js) a atlasy oblečení se stáhnou, až když Ops něco nosí */
    const clothingRequests: string[] = [];
    page.on('request', r => { if (/\/assets\/(?:corner|detail)-(?:rookie|explorer|scavenger|veteran|legend)-[\w-]+\.(?:js|png)$/.test(r.url())) clothingRequests.push(r.url()); });
    await seed(page, lang);
    await page.goto('/#settings/wardrobe');
    const section = page.getByTestId('ops-clothing');
    await expect(section.getByRole('heading', { name: L.clothing })).toBeVisible();
    const sets = section.locator('.ops-clothing-set');
    await expect(sets).toHaveCount(16);
    await expect(sets.locator('xpath=self::*[@data-locked="false"]')).toHaveCount(4);
    for (const id of ['field', 'rain', 'forge', 'dune']) await expect(section.locator(`[data-set="${id}"]`)).toHaveAttribute('data-locked', 'false');
    /* zamčená sada: zašedlá, s podmínkou a bez možnosti obléct */
    const signal = section.locator('[data-set="signal"]');
    await expect(signal).toHaveAttribute('data-locked', 'true');
    await expect(signal).toContainText(L.locked);
    await expect(signal).toContainText(L.rule);
    await expect(signal.getByRole('button')).toBeDisabled();
    await expect(section.locator('[data-set="courier"]')).toContainText(L.rounds);
    await expect(section.locator('[data-set="winter"]')).toContainText(L.extr);
    /* výběr dílu jen ze 4 odemčených sad + nic */
    const head = section.getByLabel(L.head);
    await expect(head.locator('option')).toHaveCount(5);
    const preview = '[data-testid="ops-clothing"] canvas';
    await expect.poll(() => opaque(page, preview)).toBeGreaterThan(400);
    const bare = await digest(page, preview);
    expect(clothingRequests).toEqual([]);
    await head.selectOption('rain-headwear');
    await expect(page.locator(preview)).toHaveAttribute('data-clothing', 'rain-headwear|||');
    await expect.poll(() => digest(page, preview)).not.toBe(bare);
    await expect.poll(async () => (await stateOf(page)).buddy?.clothing).toEqual({ headwear: 'rain-headwear' });
    /* level 17 = podoba Průzkumník: jen její geometrie a atlas (náhled DETAIL, výběr podob CORNER pro každou podobu) */
    expect(clothingRequests.some(u => /\/detail-explorer-[\w-]+\.js$/.test(u))).toBe(true);
    expect(clothingRequests.some(u => /\/detail-explorer-[\w-]+\.png$/.test(u))).toBe(true);
    expect(clothingRequests.some(u => /\/detail-(?:rookie|scavenger|veteran|legend)-/.test(u))).toBe(false);
    /* míchání sad */
    await section.getByLabel(L.back).selectOption('forge-back');
    await expect.poll(async () => (await stateOf(page)).buddy?.clothing).toEqual({ headwear: 'rain-headwear', back: 'forge-back' });
    await page.reload();
    await expect(section.getByLabel(L.head)).toHaveValue('rain-headwear');
    await expect(section.getByLabel(L.back)).toHaveValue('forge-back');
    await expect(page.locator(preview)).toHaveAttribute('data-clothing', 'rain-headwear|||forge-back');
    await expect.poll(() => opaque(page, preview)).toBeGreaterThan(400);
    /* celá sada jedním klikem */
    const dune = section.locator('[data-set="dune"]');
    await dune.getByRole('button', { name: new RegExp(L.whole) }).click();
    await expect(dune.getByRole('button')).toHaveText(L.wearing);
    await expect.poll(async () => (await stateOf(page)).buddy?.clothing).toEqual({ headwear: 'dune-headwear', torso: 'dune-torso', neck: 'dune-neck', back: 'dune-back' });
    await expect(page.locator('.ops-preview canvas').first()).toHaveAttribute('data-clothing', 'dune-headwear|dune-torso|dune-neck|dune-back');
    /* Vše automaticky sundá i oblečení; sady zůstanou odemčené */
    await page.getByTestId('ops-auto-all').click();
    await expect.poll(async () => (await stateOf(page)).buddy?.clothing).toBeUndefined();
    await expect(section.getByLabel(L.head)).toHaveValue('');
    await expect(page.locator(preview)).toHaveAttribute('data-clothing', '');
    expect((await stateOf(page)).buddy.clothingSets).toEqual(['field', 'rain', 'forge', 'dune']);
    await expect(page.getByTestId('ops-auto-all')).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('bez oblečení se nic z oblečení nenačte (minihry s Opsem v DETAIL)', async ({ page }) => {
  const clothingRequests: string[] = [];
  page.on('request', r => { if (/\/assets\/(?:corner|detail)-(?:rookie|explorer|scavenger|veteran|legend)-[\w-]+\.(?:js|png)$/.test(r.url())) clothingRequests.push(r.url()); });
  await seed(page, 'cs');
  await page.goto('/#games');
  await expect.poll(() => opaque(page, '[data-testid="ops-canvas"] >> nth=0')).toBeGreaterThan(400);
  await expect(page.getByTestId('ops-canvas').first()).toHaveAttribute('data-clothing', '');
  expect(clothingRequests).toEqual([]);
});

test('oblečení z importovaného nebo ručně upraveného stavu: neznámá ID a zamčené sady se nenosí', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('clothing-bad')) return;
    sessionStorage.setItem('clothing-bad', '1');
    localStorage.setItem('arcops:state', JSON.stringify({
      schema: 19, settings: { lang: 'cs', autoSnapshot: false }, profile: { level: 5 }, whatsNew: { seen: '0.34.0' }, opsPrefs: { tutorial: { status: 'done', step: 'end' } },
      buddy: { clothingSets: ['field', 'evil', '../x'], clothing: { headwear: 'drone-headwear', torso: 'field-torso', neck: '../../etc/passwd', back: 'field-neck' } },
    }));
  });
  await page.goto('/#settings/wardrobe');
  const section = page.getByTestId('ops-clothing');
  await expect(section.locator('[data-set="drone"]')).toHaveAttribute('data-locked', 'true');
  await expect(section.locator('canvas')).toHaveAttribute('data-clothing', '|field-torso||');
  /* stav po první změně: jen známé hodnoty */
  await section.getByLabel('Krk').selectOption('field-neck');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state')!).buddy)).toMatchObject({
    clothingSets: ['field'], clothing: { headwear: 'drone-headwear', torso: 'field-torso', neck: 'field-neck' },
  });
});

/* DPI: oblečení se skládá v nativní mřížce s tělem, plátno je celý násobek (128 px DETAIL, 96 px CORNER) a každý
   nativní pixel je ostrý blok k × k (žádné vyhlazování) i při 125 %, 150 % a 200 % */
for (const dpr of [1.25, 1.5, 2]) test.describe(`DPI ${dpr * 100} %`, () => {
  test.use({ deviceScaleFactor: dpr });
  test(`oblečení zůstane ostré a celým násobkem (${dpr * 100} %)`, async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('clothing-dpi')) return;
      sessionStorage.setItem('clothing-dpi', '1');
      localStorage.setItem('arcops:state', JSON.stringify({
        schema: 19, settings: { lang: 'cs', autoSnapshot: false }, profile: { level: 70 }, whatsNew: { seen: '0.34.0' }, opsPrefs: { tutorial: { status: 'done', step: 'end' } },
        buddy: { clothingSets: ['drone'], clothing: { headwear: 'drone-headwear', torso: 'drone-torso', neck: 'drone-neck', back: 'drone-back' } },
      }));
    });
    await page.goto('/#settings/wardrobe');
    for (const [sel, n] of [['[data-testid="ops-clothing"] canvas', 128], ['[data-testid="ops-body-picker"] input[value="legend"] + canvas', 96]] as const) {
      const canvas = page.locator(sel);
      await expect(canvas).toHaveAttribute('data-clothing', 'drone-headwear|drone-torso|drone-neck|drone-back');
      await expect.poll(() => opaque(page, sel)).toBeGreaterThan(400);
      const r = await canvas.evaluate((c: HTMLCanvasElement, n: number) => {
        const k = c.width / n, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let bad = 0, semi = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4, j = ((y - (y % k)) * c.width + (x - (x % k))) * 4;
          if (d[i] !== d[j] || d[i + 1] !== d[j + 1] || d[i + 2] !== d[j + 2] || d[i + 3] !== d[j + 3]) bad++;
          if (d[i + 3] && d[i + 3] !== 255) semi++;
        }
        return { k, w: c.width, h: c.height, bad, semi };
      }, n);
      expect(Number.isInteger(r.k) && r.k >= 1).toBe(true);
      expect(r.k).toBe(Math.max(1, Math.floor(dpr + 1e-6)));
      expect(r.h).toBe(r.w);
      expect(r.bad).toBe(0);
      expect(r.semi).toBe(0);
    }
  });
});
