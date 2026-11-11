// Isolated Playwright capture. No application source or personal storage is changed.
// Usage: node docs/design/capture-current.mjs [current|after|after-en] [cs|en]  (default: current, language cs;
// a target ending with "-en" defaults to en; needs `pnpm dev` on :1420)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const target = ['after', 'after-en'].includes(process.argv[2]) ? process.argv[2] : 'current';
const lang = process.argv[3] === 'en' || process.argv[3] === 'cs' ? process.argv[3] : target.endsWith('-en') ? 'en' : 'cs';
/* texty ovládacích prvků podle jazyka (stejné klíče slovníku jako UI) */
const L = lang === 'en'
  ? { detail: /Show details of the raid/, log: 'Log raid', min: 'Length (minutes)', save: 'Save raid',
    trials: ['ARC damage', 'Material gathering', 'Extraction', 'Exploration', 'Searching'], note: 'Quiet run, extracted without contact.' }
  : { detail: /Zobrazit detail raidu/, log: 'Zapsat raid', min: 'Délka (minuty)', save: 'Uložit raid',
    trials: ['Poškození ARC', 'Sběr materiálu', 'Extrakce', 'Průzkum', 'Prohledávání'], note: 'Klidný průchod, extrakce bez kontaktu.' };
const isAfter = target !== 'current';
const dir = new URL(`./${target}/`, import.meta.url);
const file = name => new URL(name, dir).pathname.replace(/^\/(\w:)/, '$1');
/* layout checks: page-level horizontal overflow and squeezed dashboard cards (same rule as tests/e2e/smoke.spec.ts) */
const layout = page => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > innerWidth,
  narrowCards: [...document.querySelectorAll('.dash-grid > .panel, .kpi-strip > .panel')].filter(e => e.getBoundingClientRect().width < 150).length,
  clipped: [...document.querySelectorAll('.page .panel')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto').length,
}));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: lang === 'en' ? 'en-US' : 'cs-CZ', deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:1420');
await page.getByRole('heading', { level: 1, name: 'Dashboard', exact: true }).waitFor();
await page.waitForTimeout(1200);
await page.screenshot({ path: file('00-dashboard-fresh-1280.png') });
await page.evaluate(async ({ lang, L }) => {
  const { SAMPLE_V1 } = await import('/tests/core/sample.ts');
  const { parseBackup } = await import('/src/core/backup.ts');
  const parsed = parseBackup(JSON.stringify(SAMPLE_V1), Date.now(), lang);
  if ('error' in parsed) throw Error(parsed.error);
  const s = parsed.state;
  s.settings.lang = lang;
  s.trials.week = '2026-W46';
  s.trials.stars = [3, 2, 1, 0, 3];
  s.trials.names = L.trials;
  s.raids.forEach((r, i) => { r.ts = new Date('2026-11-10T19:00:00+01:00').getTime() + i * 1200000; });
  s.raids[2].gear = [{ name: 'Ferro', qty: 1 }, { name: 'Bandage', qty: 3 }];
  s.raids[2].loot = [{ name: 'Metal Parts', qty: 3 }, { name: 'Fabric', qty: 2 }];
  s.raids[2].notes = L.note;
  s.planner.stations = { gunsmith: 3, medical: 2 };
  localStorage.setItem('arcops:state', JSON.stringify(s));
}, { lang, L: { trials: L.trials, note: L.note } });
await page.reload();
await page.getByRole('heading', { level: 1, name: 'Dashboard', exact: true }).waitFor();
const modules = ['dashboard','profile','skills','workshop','inventory','maps','arc','weapons','money','trials','journal','checklist','stats','settings'];
const additional = ['dashboard/goals','dashboard/recs','inventory/planner','weapons/loadouts'];
const records = [];
for (const id of [...modules, ...additional]) {
  await page.goto('http://127.0.0.1:1420/#' + id);
  await page.locator('.page h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1279, 40); // pointer off interactive elements (no stale hover)
  await page.waitForTimeout(180);
  const name = id.replace('/', '-') + '-1280.png';
  await page.screenshot({ path: file(name) });
  records.push({ id, file: name, viewport: '1280x800', text: await page.locator('main').innerText(), ...(await layout(page)) });
}
await page.goto('http://127.0.0.1:1420/#journal');
await page.getByRole('button', { name: L.detail }).first().click();
await page.mouse.move(1279, 40);
await page.waitForTimeout(150);
await page.screenshot({ path: file('journal-detail-1280.png') });
if (isAfter) {
  /* dialog zápisu raidu s chybou validace (pole propojené přes aria-describedby) */
  await page.getByRole('button', { name: L.log }).first().click();
  const dlg = page.getByRole('dialog', { name: L.log });
  await dlg.getByLabel(L.min).fill('150');
  await dlg.getByRole('button', { name: L.save }).click();
  await page.mouse.move(1279, 40);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file('raid-form-1280.png') });
  await page.keyboard.press('Escape');
}
for (const [w, h] of [[1024, 768], [1920, 1080]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('http://127.0.0.1:1420/#dashboard');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(w - 1, 40);
  await page.waitForTimeout(250);
  const name = `dashboard-${w}.png`;
  await page.screenshot({ path: file(name) });
  records.push({ id: 'dashboard', file: name, viewport: `${w}x${h}`, ...(await layout(page)) });
  if (isAfter && w === 1024) {
    /* kompaktní navigace: tooltip přes portál mimo scrollující .nav */
    await page.locator('.sidebar a.nav-item[href="#journal"]').hover();
    await page.waitForTimeout(150);
    await page.screenshot({ path: file('nav-tooltip-1024.png'), clip: { x: 0, y: 0, width: 400, height: 768 } });
  }
}
await writeFile(new URL('capture-manifest.json', dir), JSON.stringify({ date: new Date().toISOString().slice(0, 10), lang, engine: 'Playwright / headless Edge', fixture: 'SAMPLE_V1 + explicit design-only raid detail, planner and current week; isolated ephemeral context', errors, records }, null, 2));
await browser.close();
console.log(JSON.stringify({ screenshots: records.length + 2, errors, overflows: records.filter(r => r.overflow).map(r => r.file), narrow: records.filter(r => r.narrowCards).map(r => r.file), clipped: records.filter(r => r.clipped).map(r => r.file + ':' + r.clipped) }));
