/* 0.8.0: katalog buildů v Skill Tree → Buildy. Filtr štítků, řazení, detail s velkým stromem jen pro čtení,
   přepínač 76/91, načtení jako plán, porovnání s mým stromem (reset 2 000 za bod), uložení jako můj build.
   V obou jazycích; v angličtině bez českých textů. */
import { expect, test, type Page } from '@playwright/test';

const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
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
    for (const a of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && rx.test(v)) hits.push(a + ': ' + v.slice(0, 120));
    }
  }
  return hits;
}, CZ.source);

/* Level 75 a 10 bodů v Survival, které Buldozer nechce celé (Looter's Instincts 5 > 3, Silent Scavenger 4 > 0). */
const seed = (lang: 'cs' | 'en') => ({
  schema: 6,
  profile: { level: 75, expBonus: 0 },
  skills: { current: { s_craft: 1, s_instincts: 5, s_silent: 4 }, showPlan: true, activePlan: 'runner', builds: [{ id: 'mine', name: 'Old build', note: '', points: { c_used: 1 } }] },
  settings: { autoSnapshot: true, lang },
});
async function start(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('b8-seeded')) return;
    sessionStorage.setItem('b8-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify(seed(lang)));
  await page.goto('/#skills/builds');
  await page.locator('.page h1').waitFor();
}

const L = {
  cs: {
    broken: 'Broken', expedition: 'Expedice', all: 'Vše', sort: 'Řadit', sortName: 'Název', first: 'Agresivní PvP',
    open: 'Otevřít detail buildu Buldozer', openBalanced: 'Otevřít detail buildu Vyvážený raid', theory: 'Teorie – vyzkoušej sám',
    p76: '76 bodů', p91: '91 bodů', v91: '91 bodů (Expedice)', own: 'Vlastní návrh ARC OPS', compare: 'Porovnat s mým stromem',
    reset: /Nutný reset: 6 bodů máš navíc/, cost: /Reset stojí 20\s000 mincí/, extra: 'Navíc', load: 'Načíst jako plán', loaded: 'Je to tvůj plán',
    save: 'Uložit jako můj build', saveDlg: 'Uložit build z katalogu', saveBtn: 'Uložit build', back: 'Zpět na katalog', tree: 'Strom buildu Buldozer (91)',
    noReset: 'Bez resetu: přidej 81 bodů.', count2: '2 z 12 buildů', count12: '12 z 12 buildů', summary: 'Shrnutí',
  },
  en: {
    broken: 'Broken', expedition: 'Expedition', all: 'All', sort: 'Sort', sortName: 'Name', first: 'Aggressive PvP',
    open: 'Open details of the Bulldozer build', openBalanced: 'Open details of the Balanced Raid build', theory: 'Theory - try it yourself',
    p76: '76 points', p91: '91 points', v91: '91 points (Expeditions)', own: 'ARC OPS own design', compare: 'Compare with my tree',
    reset: /Reset needed: you have 6 extra points/, cost: /The reset costs 20,000 coins/, extra: 'Extra', load: 'Load as plan', loaded: 'This is your plan',
    save: 'Save as my build', saveDlg: 'Save a catalog build', saveBtn: 'Save build', back: 'Back to the catalog', tree: 'Tree of the Bulldozer (91) build',
    noReset: 'No reset needed: add 81 points.', count2: '2 of 12 builds', count12: '12 of 12 builds', summary: 'Summary',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const x = L[lang];
  test(`katalog buildů (${lang}): filtr, řazení, detail, 76/91, plán, porovnání, uložení`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    const cards = page.locator('[data-build]');
    await expect(cards).toHaveCount(12);
    await expect(page.getByTestId('catalog-count')).toHaveText(x.count12);

    /* filtr štítků */
    const filter = page.getByRole('group', { name: lang === 'cs' ? 'Filtr štítků' : 'Filter by tag' });
    await filter.getByRole('button', { name: x.broken, exact: true }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-build', 'buldozer');
    await expect(cards.nth(1)).toHaveAttribute('data-build', 'prizrak');
    await expect(page.getByTestId('catalog-count')).toHaveText(x.count2);
    await expect(cards.nth(1).getByText(x.theory)).toBeVisible();
    await expect(cards.nth(1).locator('.mini-node.end.on')).toHaveCount(2);
    await filter.getByRole('button', { name: x.all, exact: true }).click();
    await filter.getByRole('button', { name: x.expedition, exact: true }).click();
    await expect(cards).toHaveCount(2);
    await filter.getByRole('button', { name: x.all, exact: true }).click();
    await expect(cards).toHaveCount(12);

    /* řazení podle názvu */
    await page.getByLabel(x.sort, { exact: true }).selectOption('name');
    await expect(cards.first().locator('h3')).toHaveText(x.first);

    /* mini strom: zvýrazněné uzly a koncové uzly */
    const bulCard = page.locator('[data-build="buldozer"]');
    await expect(bulCard.locator('.mini-node.on')).toHaveCount(25);
    await expect(bulCard.locator('.mini-node.end.on')).toHaveCount(3);
    await expect(bulCard.getByText('Bull Rush · Mule\'s Gallop · Sprinting On Fumes')).toBeVisible();

    /* detail Buldozeru */
    await page.getByRole('button', { name: x.open }).click();
    const detail = page.locator('[data-build-detail="buldozer"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('note')).toContainText(x.theory);
    await expect(detail.getByText(x.own, { exact: true })).toBeVisible();
    await expect(page.getByTestId('build-points')).toHaveText(x.p76);
    await expect(detail.getByRole('region', { name: x.summary })).toBeVisible();
    /* velký strom jen pro čtení: žádná tlačítka +/− */
    const roTree = detail.locator('.tree-ro');
    await expect(roTree.locator('.node.has')).toHaveCount(25);
    await expect(roTree.getByRole('button')).toHaveCount(0);

    /* porovnání s mým stromem (76): Survival má body navíc → reset */
    await detail.getByRole('button', { name: x.compare }).click();
    const cmp = detail.locator('.build-compare');
    await expect(cmp).toContainText(x.reset);
    await expect(cmp).toContainText(x.cost);
    await expect(cmp.getByRole('group', { name: x.extra, exact: true })).toContainText('Silent Scavenger');

    /* přepínač 76 / 91: varianta 91 chce i moje body v Survival → bez resetu */
    await detail.getByRole('button', { name: x.v91 }).click();
    await expect(detail.getByRole('button', { name: x.v91 })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('build-points')).toHaveText(x.p91);
    await expect(page.getByRole('region', { name: x.tree }).locator('.node.has')).toHaveCount(30);
    await expect(cmp).toContainText(x.noReset);

    /* načíst jako plán */
    await detail.getByRole('button', { name: x.load }).click();
    await expect(detail.getByText(x.loaded)).toBeVisible();
    await page.waitForTimeout(700);
    expect((await stateOf(page)).skills.activePlan).toBe('catalog:buldozer:91');

    /* uložit jako můj build */
    await detail.getByRole('button', { name: x.save }).click();
    const dlg = page.getByRole('dialog', { name: x.saveDlg });
    await expect(dlg.getByLabel(lang === 'cs' ? 'Název' : 'Name', { exact: true })).toHaveValue(lang === 'cs' ? 'Buldozer (91)' : 'Bulldozer (91)');
    await dlg.getByRole('button', { name: x.saveBtn }).click();
    await expect(dlg).toHaveCount(0);
    await page.waitForTimeout(700);
    const st = await stateOf(page);
    expect(st.skills.builds).toHaveLength(2);
    expect(st.skills.builds[0]).toEqual({ id: 'mine', name: 'Old build', note: '', points: { c_used: 1 } });
    expect(Object.values(st.skills.builds[1].points as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(91);
    expect(st.skills.current).toEqual({ s_craft: 1, s_instincts: 5, s_silent: 4 });

    if (lang === 'en') expect(await czechInUi(page), 'detail en').toEqual([]);

    /* zpět do katalogu: uložený build v Moje buildy */
    await detail.getByRole('button', { name: x.back }).click();
    await expect(cards).toHaveCount(12);
    await expect(page.locator('table').getByText(lang === 'cs' ? 'Buldozer (91)' : 'Bulldozer (91)', { exact: true })).toBeVisible();

    /* zdroj z webu: jen tlačítko ExtLink, žádný odkaz s href */
    await page.getByRole('button', { name: x.openBalanced }).click();
    const bal = page.locator('[data-build-detail="balanced-raid"]');
    await expect(bal.getByRole('button', { name: /thearcraiders\.com/ })).toBeVisible();
    await expect(bal.getByRole('link')).toHaveCount(0);
    if (lang === 'en') expect(await czechInUi(page), 'detail en (balanced)').toEqual([]);

    /* plán z katalogu v roletce plánu a rozdání bodů */
    await page.goto('/#skills');
    await expect(page.getByLabel(lang === 'cs' ? 'Plán' : 'Plan', { exact: true })).toHaveValue('catalog:buldozer:91');
    expect(errors).toEqual([]);
  });
}

for (const [w, h] of [[1024, 640], [1920, 1080]] as const) {
  test(`katalog buildů ${w}×${h}: nic nepřetéká`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await start(page, 'en');
    await expect(page.locator('[data-build]')).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    const narrow = await page.evaluate(() => [...document.querySelectorAll('.build-card')].filter(e => e.getBoundingClientRect().width < 300).length);
    expect(narrow).toBe(0);
    await page.screenshot({ path: `test-results/screens-builds/${w}-catalog.png`, fullPage: true });
    await page.getByRole('button', { name: L.en.open }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/screens-builds/${w}-detail.png`, fullPage: true });
  });
}
