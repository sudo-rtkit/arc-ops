/* Milník 3b: Inventory → Vybavení (ruční evidence předmětů) a Zápis raidu → Loot ze snímku (batoh a quick use,
   odečtení výbavy, předvyplnění lootu). V obou jazycích. Snímek KNOCKED OUT je hráčův vlastní (jen lokálně);
   bez něj se ten test přeskočí. */
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('../fixtures/vision/', import.meta.url));
const AMMO = FIX + 'sample-stash-ammo-filter-1080p.png';
const KNOCKED = FIX + 'own/own-after-raid-knocked-out.png';
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const fresh = async (page: Page) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload(); };

test.describe('Vybavení a loot ze snímku (čeština)', () => {
  test.beforeEach(async ({ page }) => fresh(page));

  test('Vybavení: přidání z katalogu, počet, úprava tieru, smazání s potvrzením', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory/equipment');
    await expect(page.getByRole('tab', { name: 'Vybavení' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Zatím žádné vybavení.')).toBeVisible();

    await page.getByRole('button', { name: 'Přidat předmět' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Nový předmět' });
    await dlg.getByLabel('Název', { exact: true }).fill('Anvil');
    /* kategorie se doplní z katalogu */
    await expect(dlg.getByLabel('Kategorie')).toHaveValue('weapon');
    await dlg.getByLabel('Tier').selectOption('II');
    await dlg.getByRole('button', { name: 'Počet: přidat' }).click();
    await dlg.getByRole('button', { name: 'Uložit' }).click();
    await expect(dlg).toBeHidden();

    const anvil = page.locator('tbody[data-category="weapon"] tr[data-item="Anvil II"]');
    await expect(anvil).toContainText('Anvil');
    await expect(anvil.getByRole('textbox', { name: 'Počet: Anvil II' })).toHaveValue('2');
    await expect(page.getByTestId('equip-summary')).toHaveText('1 druh, 2 ks');
    await anvil.getByRole('button', { name: 'Počet: Anvil II: přidat' }).click();
    await expect(anvil.getByRole('textbox', { name: 'Počet: Anvil II' })).toHaveValue('3');

    await anvil.getByRole('button', { name: 'Upravit Anvil II' }).click();
    const edit = page.getByRole('dialog', { name: 'Upravit předmět' });
    await edit.getByLabel('Tier').selectOption('III');
    await edit.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.locator('tr[data-item="Anvil III"]')).toBeVisible();
    await expect(page.locator('tr[data-item="Anvil II"]')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page))?.items).toEqual({ 'Anvil III': { key: 'Anvil III', name: 'Anvil', category: 'weapon', tier: 'III', count: 3 } });

    await page.getByRole('button', { name: 'Smazat Anvil III' }).click();
    const conf = page.getByRole('dialog', { name: 'Smazat předmět?' });
    await expect(conf).toContainText('Anvil III zmizí z evidence vybavení.');
    await conf.getByRole('button', { name: 'Smazat' }).click();
    await expect(page.getByText('Zatím žádné vybavení.')).toBeVisible();
    await expect.poll(async () => (await stateOf(page)).items).toEqual({});
    expect(errors).toEqual([]);
  });

  test('Loot ze snímku: batoh a quick use, odečtení výbavy, předvyplnění a uložení raidu', async ({ page }) => {
    const errors = watchErrors(page);
    await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Zapsat raid' });
    await dlg.getByLabel('Výbava: název', { exact: true }).fill('Light Ammo');
    await dlg.getByLabel('Výbava: počet', { exact: true }).fill('30');
    await dlg.getByRole('button', { name: 'Výbava: Přidat', exact: true }).click();
    await dlg.getByLabel('Získané materiály (loot): název').fill('Metal Parts');
    await dlg.getByRole('button', { name: 'Získané materiály (loot): Přidat' }).click();

    await dlg.getByRole('button', { name: 'Loot ze snímku' }).click();
    const scan = dlg.getByTestId('loot-scan');
    await scan.getByTestId('loot-scan-file').setInputFiles(AMMO);
    await expect(scan.getByTestId('loot-scan-found')).toHaveText('Batoh 2/14 · Quick use 2/4');
    await expect(scan.locator('tbody tr')).toHaveCount(4);
    await expect(scan.getByRole('combobox', { name: 'Název předmětu v políčkách B1/1' })).toHaveValue('Light Ammo');
    await expect(scan.getByRole('textbox', { name: 'Počet v políčkách B1/1' })).toHaveValue('64');
    await expect(scan.getByRole('combobox', { name: 'Název předmětu v políčkách Q2/1' })).toHaveValue('Shield Recharger');
    /* Bandage se do lootu nepřidá */
    await scan.getByRole('checkbox', { name: 'Přidat do lootu: políčka Q1/1' }).uncheck();
    await scan.getByRole('button', { name: 'Předvyplnit loot' }).click();
    await expect(scan.getByTestId('loot-scan-result')).toContainText('Do lootu přidány 3 položky.');
    await expect(scan.getByTestId('loot-scan-result')).toContainText('Odečtena výbava: 30× Light Ammo');

    await expect(dlg.getByLabel('Získané materiály (loot): počet Light Ammo')).toHaveValue('34');
    await expect(dlg.getByLabel('Získané materiály (loot): počet Heavy Ammo')).toHaveValue('8');
    await dlg.getByRole('button', { name: 'Uložit raid' }).click();
    await expect(dlg).toBeHidden();
    await expect.poll(async () => (await stateOf(page))?.raids?.[0]?.loot).toEqual([
      { name: 'Metal Parts', qty: 1 }, { name: 'Light Ammo', qty: 34 }, { name: 'Heavy Ammo', qty: 8 }, { name: 'Shield Recharger', qty: 1 },
    ]);
    const st = await stateOf(page);
    expect(st.inventory).toEqual({});
    expect(st.raids[0].lootApplied).toEqual([]);
    expect(JSON.stringify(st)).not.toMatch(/data:image|base64/);
    expect(errors).toEqual([]);
  });

  test('Loot ze snímku: snímek bez batohu dá hlášku', async ({ page }) => {
    await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Zapsat raid' });
    await dlg.getByRole('button', { name: 'Loot ze snímku' }).click();
    /* Ctrl+V: obrázek jedné barvy */
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      c.getContext('2d')!.fillRect(0, 0, 64, 36);
      const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png'));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'x.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await expect(dlg.getByText('Na snímku jsem nenašel batoh (BACKPACK).', { exact: false })).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Předvyplnit loot' })).toHaveCount(0);
  });

  test('Loot ze snímku: KNOCKED OUT s prázdným batohem nic nepředvyplní', async ({ page }) => {
    test.skip(!existsSync(KNOCKED), 'vlastní snímek hráče není k dispozici');
    await page.getByRole('button', { name: 'Zapsat raid' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Zapsat raid' });
    await dlg.getByRole('button', { name: 'Loot ze snímku' }).click();
    await dlg.getByTestId('loot-scan-file').setInputFiles(KNOCKED);
    await expect(dlg.getByTestId('loot-scan-found')).toHaveText('Batoh 0/14 · Quick use 0/4');
    await expect(dlg.getByTestId('loot-scan-empty')).toContainText('Batoh i quick use jsou prázdné');
    await expect(dlg.getByRole('button', { name: 'Předvyplnit loot' })).toHaveCount(0);
  });

  test('Settings: Zdroje dat s MetaForge, odkaz jen na kliknutí', async ({ page }) => {
    await page.goto('/#settings');
    await expect(page.getByTestId('data-sources')).toHaveText('Data o předmětech: MetaForge (metaforge.app/arc-raiders), neoficiální, nejsou od Embarku.');
    const link = page.getByRole('button', { name: /MetaForge – ARC Raiders/ });
    await expect(link).toHaveAttribute('title', 'https://metaforge.app/arc-raiders');
    await expect(page.locator('a[href*="metaforge"]')).toHaveCount(0);
  });
});

test.describe('Equipment and loot from screenshot (English)', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => fresh(page));

  test('Equipment: add, count, delete; no Czech text', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory/equipment');
    await expect(page.getByRole('tab', { name: 'Equipment' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Add item' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'New item' });
    await dlg.getByLabel('Name', { exact: true }).fill('Light Shield');
    await expect(dlg.getByLabel('Category')).toHaveValue('shield');
    await dlg.getByRole('button', { name: 'Save' }).click();
    const row = page.locator('tbody[data-category="shield"] tr[data-item="Light Shield"]');
    await expect(row.getByRole('textbox', { name: 'Count: Light Shield' })).toHaveValue('1');
    await expect(page.getByTestId('equip-summary')).toHaveText('1 kind, 1 pcs');
    const cz = await page.evaluate(re => [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && new RegExp(re).test(e.textContent || '')).map(e => e.textContent), CZ.source);
    expect(cz).toEqual([]);
    await page.getByRole('button', { name: 'Delete Light Shield' }).click();
    await page.getByRole('dialog', { name: 'Delete item?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No equipment yet.', { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Loot from screenshot: read, subtract gear, prefill, save', async ({ page }) => {
    const errors = watchErrors(page);
    await page.getByRole('button', { name: 'Log raid' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Log raid' });
    await dlg.getByLabel('Gear: name', { exact: true }).fill('Bandage');
    await dlg.getByRole('button', { name: 'Gear: Add', exact: true }).click();
    await dlg.getByRole('button', { name: 'Loot from screenshot' }).click();
    await dlg.getByTestId('loot-scan-file').setInputFiles(AMMO);
    await expect(dlg.getByTestId('loot-scan-found')).toHaveText('Backpack 2/14 · Quick use 2/4');
    await dlg.getByRole('button', { name: 'Prefill loot' }).click();
    await expect(dlg.getByTestId('loot-scan-result')).toContainText('4 entries added to the loot.');
    await expect(dlg.getByTestId('loot-scan-result')).toContainText('Gear subtracted: Bandage');
    const cz = await page.evaluate(re => [...document.querySelectorAll('[role="dialog"] *')].filter(e => e.children.length === 0 && new RegExp(re).test(e.textContent || '')).map(e => e.textContent), CZ.source);
    expect(cz).toEqual([]);
    await dlg.getByRole('button', { name: 'Save raid' }).click();
    await expect(dlg).toBeHidden();
    await expect.poll(async () => (await stateOf(page))?.raids?.[0]?.loot).toEqual([
      { name: 'Light Ammo', qty: 64 }, { name: 'Heavy Ammo', qty: 8 }, { name: 'Bandage', qty: 1 }, { name: 'Shield Recharger', qty: 1 },
    ]);
    expect(errors).toEqual([]);
  });

  test('Settings: Data sources', async ({ page }) => {
    await page.goto('/#settings');
    await expect(page.getByTestId('data-sources')).toHaveText('Item data: MetaForge (metaforge.app/arc-raiders), unofficial, not from Embark.');
  });
});
