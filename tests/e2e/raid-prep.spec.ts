/* 0.14.0: příprava na raid, vlastní mapa a záložka Raid v overlayi, v obou jazycích.
   Výběr cílů → seznam → spuštění → záložka Raid v overlayi → „mám“ (inventář beze změny) → vyhledání předmětu;
   vlastní snímek mapy (vygenerovaný abstraktní obrázek, žádná herní mapa) → bod → zvýraznění → přesun → smazání a Zpět. */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
/* Abstraktní testovací podklad 640 × 400: jen pruhy a mřížka, žádný herní obsah. */
function testImage(): Buffer {
  const png = new PNG({ width: 640, height: 400 });
  for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) {
    const i = (y * 640 + x) * 4, line = x % 80 < 2 || y % 80 < 2;
    png.data[i] = line ? 200 : 70 + (x >> 4); png.data[i + 1] = line ? 190 : 80 + (y >> 3); png.data[i + 2] = line ? 170 : 75; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
/* Úkol After Rain Comes (ss10y, Buried City: Wires 5, Battery 2) je dostupný po ss10s a jeho předchozích úkolech. */
const DONE = Object.fromEntries(['ss10s', 'ss10k', 'ss10g', 'ss10f', 'ss10c', 'ss10a', 'ss10', 'ss7', 'ss5', 'ss4', 'ss3', 'ss1', 'ss2'].map(id => [id, 1]));
const T = {
  cs: { nav: 'Příprava na raid', quest: 'After Rain Comes', start: 'Spustit plán', active: 'Plán aktivní', tab: 'Raid', keep: 'NECHAT', none: 'Bez výsledku',
    emptyTitle: 'Připrav raid v aplikaci', mapEmpty: 'Tvoje mapa začíná snímkem', save: 'Uložit bod', area: 'Typ místa', type: 'Typ bodu', undo: 'Zpět', del: 'Smazat', end: 'Ukončit plán', unknown: 'Neznámé' },
  en: { nav: 'Raid prep', quest: 'After Rain Comes', start: 'Start plan', active: 'Plan active', tab: 'Raid', keep: 'KEEP', none: 'No results',
    emptyTitle: 'Prepare a raid in the app', mapEmpty: 'Your map starts with a screenshot', save: 'Save point', area: 'Loot area', type: 'Point type', undo: 'Undo', del: 'Delete', end: 'End plan', unknown: 'Unknown' },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`příprava na raid → overlay Raid → vyhledání předmětu (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('rp')) return;
      sessionStorage.setItem('rp', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({ schema: 12, profile: { level: 12, rounds: 3 }, stations: { gear: 1 }, inventory: { 'Power Cable': 1, Wires: 2 }, quests: { done: DONE }, buddy: { enabled: true }, settings: { lang } }));
    await page.goto('/');
    await page.locator('.sidebar a.nav-item[href="#raid"]').click();
    await expect(page.getByRole('heading', { level: 1, name: L.nav })).toBeVisible();
    /* výchozí výběr: další vylepšení z kompaktu (Gear Bench 2); přidám úkol */
    const goals = page.getByTestId('raid-goals');
    await expect(goals.getByRole('checkbox', { name: /Gear Bench 2/ })).toBeChecked();
    await goals.getByRole('checkbox', { name: new RegExp(L.quest) }).check();
    const list = page.getByTestId('raid-list');
    await expect(list.locator('tr[data-mat="Power Cable"] td').nth(1)).toHaveText('2×');
    await expect(list.locator('tr[data-mat="Power Cable"] [data-area="Electrical"]')).toBeVisible();
    await expect(list.locator('tr[data-mat="Wires"] td').nth(1)).toHaveText('3×');
    await expect(list.locator('tr[data-mat="Hornet Driver"] [data-area="ARC"]')).toBeVisible();
    /* doporučená mapa: úkol je na Buried City, důvod je čitelný */
    await expect(page.getByTestId('raid-rec')).toContainText('Buried City');
    await expect(page.getByTestId('raid-rec')).toContainText(L.quest);
    await page.getByTestId('raid-start').click();
    await expect(page.getByTestId('raid-active')).toContainText(L.active);
    await expect(page.getByTestId('raid-ops').getByTestId('ops-line')).not.toHaveText('');
    await expect.poll(async () => (await stateOf(page)).raidPlan?.map).toBe('buried');
    const inv = (await stateOf(page)).inventory;

    /* overlay: záložka Raid na konci, seznam, „mám“ nemění inventář, vyhledání předmětu */
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    const tabs = ov.getByRole('tab');
    await expect(tabs.last()).toHaveText(new RegExp('^' + L.tab));
    await tabs.last().click();
    const raid = ov.getByTestId('ov-raid');
    await expect(raid.locator('[data-mat="Power Cable"] strong')).toHaveText('2×');
    await expect(ov.getByTestId('ovr-lookup')).not.toBeFocused();
    await raid.locator('[data-mat="Power Cable"] input[type=checkbox]').check();
    await expect.poll(async () => (await stateOf(page)).raidPlan.found).toEqual(['Power Cable']);
    expect((await stateOf(page)).inventory).toEqual(inv);
    await ov.getByTestId('ovr-lookup').fill('power cab');
    await expect(ov.getByTestId('ovr-verdict')).toHaveAttribute('data-kind', 'keep');
    await expect(ov.getByTestId('ovr-verdict')).toContainText(L.keep);
    await expect(ov.getByTestId('ovr-verdict')).toContainText('Gear Bench 2');
    await ov.getByTestId('ovr-lookup').fill('zzzz nic');
    await expect(raid.getByText(L.none)).toBeVisible();
    await expect(ov.getByTestId('ovr-nomap')).toBeVisible();

    /* bez plánu: výzva do přípravy */
    await page.getByTestId('raid-end').click();
    await expect(ov.getByTestId('ov-raid-empty')).toContainText(L.emptyTitle);
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });

  test(`vlastní mapa: snímek, bod, zvýraznění, přesun, smazání a Zpět (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('mp')) return;
      sessionStorage.setItem('mp', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({
      schema: 12, stations: { gear: 1 }, inventory: { 'Power Cable': 1 }, buddy: { enabled: true }, settings: { lang },
      maps: { dam: { notes: '', visited: {}, todo: [], pois: [{ id: 'old1', name: 'Old POI', note: 'n' }] } },
    }));
    await page.goto('/#raid');
    await expect(page.getByTestId('raid-goals').getByRole('checkbox', { name: /Gear Bench 2/ })).toBeChecked();
    await page.getByTestId('raid-start').click();
    await expect.poll(async () => (await stateOf(page)).raidPlan?.map).toBe('dam');
    await page.goto('/#maps/dam');
    await expect(page.getByTestId('map-empty')).toContainText(L.mapEmpty);
    await expect(page.getByTestId('map-plan-strip')).toBeVisible();
    await page.getByTestId('map-file').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: testImage() });
    const stage = page.getByTestId('map-stage');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await stateOf(page)).maps.dam.img).toMatchObject({ w: 640, h: 400 });
    /* starý bod jen s názvem zůstal v seznamu (bez polohy) */
    await expect(page.getByTestId('map-points')).toContainText('Old POI');

    /* klik = nový bod */
    const box = (await stage.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const form = page.getByTestId('map-point-form');
    await expect(form.getByLabel(L.type)).toBeFocused();
    await form.getByLabel(L.type).selectOption('crate');
    await form.getByLabel(L.area).selectOption('Electrical');
    await form.getByRole('button', { name: L.save }).click();
    await expect(form).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).maps.dam.pois.length).toBe(2);
    const p = (await stateOf(page)).maps.dam.pois[1];
    expect(p).toMatchObject({ type: 'crate', area: 'Electrical' });
    expect(p.x).toBeGreaterThan(0.4); expect(p.x).toBeLessThan(0.6);
    /* plán chce Power Cable (Electrical) → bod svítí, detail ukáže předmět */
    const pin = page.locator(`[data-poi="${p.id}"]`);
    await expect(pin).toHaveAttribute('data-highlight', 'area');
    await expect(page.getByTestId('map-hl-count')).toContainText('1');
    await expect(page.getByTestId('map-detail-plan')).toContainText('Power Cable');

    /* tažení bodu: zápis až po puštění */
    const pb = (await pin.boundingBox())!;
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await page.mouse.down();
    await page.mouse.move(pb.x + pb.width / 2 + 60, pb.y + pb.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await stateOf(page)).maps.dam.pois[1].x).toBeGreaterThan(p.x + 0.03);

    /* přiblížení tlačítkem */
    await page.getByTestId('map-viewer').getByRole('button', { name: lang === 'cs' ? 'Přiblížit' : 'Zoom in' }).click();
    await expect(page.getByTestId('map-zoom')).toHaveText(/125/);

    /* overlay: malý náhled se zvýrazněným bodem */
    const ov = await context.newPage();
    await ov.goto('/overlay.html');
    await ov.getByRole('tab').last().click();
    await expect(ov.getByTestId('ovr-minimap').locator('.map-pin.highlight')).toHaveCount(1);
    await ov.close();

    /* smazání a Zpět */
    await page.getByTestId('map-detail').getByRole('button', { name: L.del }).click();
    await expect.poll(async () => (await stateOf(page)).maps.dam.pois.length).toBe(1);
    await page.getByRole('button', { name: L.undo }).click();
    await expect.poll(async () => (await stateOf(page)).maps.dam.pois.length).toBe(2);
    expect(errors).toEqual([]);
  });
}
