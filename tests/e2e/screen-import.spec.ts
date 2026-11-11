/* Milník 3a/3b: Inventory → Ze snímku. Vložení testovacího snímku (výběr souboru a Ctrl+V), kontrola tabulky
   (název z tooltipu, katalog), oprava cíle, zápis, kontrola Zásoby, Vybavení a profilu, učení ikon a Settings.
   V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('../fixtures/vision/', import.meta.url));
const TOOLTIP = FIX + 'sample-stash-all-tooltip-1080p.png';
const AMMO = FIX + 'sample-stash-ammo-filter-1080p.png';
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const snapshotKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(k => /-import-/.test(k)));
const row = (page: Page, cell: string) => page.locator(`.scan-table tbody tr[data-cells~="${cell}"]`);
/* výběr cíle řádku (v řádku jsou i pole názvu a kategorie předmětu) */
const TARGET = /^(Předmět v políčkách|Item in cells)/;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

/* Vložení obrázku událostí paste (stejně jako Ctrl+V se snímkem ve schránce). */
async function pasteImage(page: Page, file: string) {
  const b64 = readFileSync(file).toString('base64');
  await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, b64);
}

test.describe('Ze snímku (čeština)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('vložení snímku, tabulka, pojmenování, zápis, Zásoba, profil, učení a Settings', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory/import');
    await expect(page.getByRole('tab', { name: 'Ze snímku' })).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('scan-file').setInputFiles(TOOLTIP);

    await expect(page.locator('.scan-table tbody tr')).toHaveCount(13);
    await expect(page.getByTestId('scan-checksum')).toContainText('Nalezeno 24 z 200 obsazených míst');
    await expect(page.locator('.scan-shot canvas')).toHaveCount(1);
    await expect(page.getByLabel('Nafotil(a) jsem celý stash, chybějící nastavit na 0')).toBeDisabled();
    const coins = page.getByLabel(/Aktualizovat mince v profilu \(51\s060\)/);
    await expect(coins).toBeChecked();

    /* skupina tří políček s Magnetic Accelerator (řádek 2, sloupce 1–3) */
    const mag = row(page, '2,3');
    await expect(mag).toHaveAttribute('data-cells', '2,1 2,2 2,3');
    await expect(mag.getByRole('textbox', { name: /Počet v políčkách/ })).toHaveValue('8');
    /* 3b: název z tooltipu pojmenuje celou skupinu */
    await expect(mag).toContainText('Rozpoznáno');
    await expect(mag).toContainText('z tooltipu');
    await expect(mag.getByRole('combobox', { name: TARGET })).toHaveValue('Magnetic Accelerator');
    await expect(mag.locator('td').nth(4)).toContainText('+8');

    /* katalog: předmět do Vybavení (Ion Sputter) a materiál, který aplikace nevede (nový vlastní) */
    await expect(row(page, '1,3')).toContainText('katalog');
    await expect(row(page, '1,3').getByRole('combobox', { name: TARGET })).toHaveValue('\u0000item');
    await expect(row(page, '1,3').getByLabel('Název předmětu')).toHaveValue('Ion Sputter');

    /* ×19 → nový vlastní materiál s vlastním názvem */
    const big = row(page, '4,0');
    await big.getByRole('combobox', { name: TARGET }).selectOption({ label: 'Nový vlastní materiál…' });
    await big.getByLabel('Název nového materiálu').fill('');
    await expect(page.getByRole('button', { name: 'Zapsat' })).toBeDisabled();
    await big.getByLabel('Název nového materiálu').fill('Testovací díl');
    await page.getByRole('button', { name: 'Zapsat' }).click();

    await expect(page.getByTestId('scan-done')).toContainText(/Zapsáno: 12 materiálů, mince 51\s060/);
    await expect(page.getByTestId('scan-done')).toContainText('1 předmět ve Vybavení');
    await expect(page.getByTestId('scan-done')).toContainText('4 nové vlastní materiály');
    await expect(page.locator('.scan-table')).toHaveCount(0);

    const st = await stateOf(page);
    expect(st.schema).toBe(4);
    expect(st.inventory['Magnetic Accelerator']).toBe(8);
    expect(st.inventory['Testovací díl']).toBe(19);
    expect(st.gameData.materialsCustom.map((m: { name: string }) => m.name)).toContain('Testovací díl');
    expect(st.items['Ion Sputter']).toEqual({ key: 'Ion Sputter', name: 'Ion Sputter', category: 'other', count: 3 });
    expect(st.profile.coins).toBe(51060);
    expect(st.vision.learned).toHaveLength(13);
    expect(JSON.stringify(st)).not.toMatch(/data:image|base64/);
    expect(await snapshotKeys(page)).toHaveLength(1);

    /* Zásoba a profil */
    await page.getByRole('link', { name: 'Zpět do Zásoby' }).click();
    await expect(page.getByRole('tab', { name: 'Zásoba' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Hledat materiál').fill('Magnetic');
    await expect(page.getByRole('textbox', { name: 'Mám Magnetic Accelerator', exact: true })).toHaveValue('8');
    await page.getByLabel('Hledat materiál').fill('Testovací');
    await expect(page.getByRole('textbox', { name: 'Mám Testovací díl', exact: true })).toHaveValue('19');
    await page.goto('/#profile');
    await expect(page.locator('main')).toContainText(/51\s060/);

    /* druhé vložení (Ctrl+V): naučené ikony se poznají samy */
    await page.goto('/#inventory/import');
    await pasteImage(page, TOOLTIP);
    const again = row(page, '2,3');
    await expect(again).toContainText('Rozpoznáno');
    await expect(again.getByRole('combobox', { name: TARGET })).toHaveValue('Magnetic Accelerator');
    await expect(again.locator('td').nth(3)).toContainText('8');
    await expect(row(page, '0,0').getByRole('combobox', { name: TARGET })).toHaveValue('Complex Gun Parts');
    await expect(row(page, '0,0')).toContainText('naučeno');

    /* Settings: počet naučených ikon a smazání s potvrzením */
    await page.goto('/#settings');
    await expect(page.getByTestId('learned-count')).toHaveText('13');
    await page.getByRole('button', { name: 'Smazat naučené' }).click();
    await expect(page.getByRole('dialog', { name: 'Smazat naučené ikony?' })).toContainText('13 naučených ikon');
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat naučené' }).click();
    await expect(page.getByTestId('learned-count')).toHaveText('0');
    /* uložení je odložené (500 ms) */
    await expect.poll(async () => (await stateOf(page)).vision.learned.length).toBe(0);
    expect(errors).toEqual([]);
  });

  test('snímek bez inventory: hláška a nic se nezapíše', async ({ page }) => {
    await page.goto('/#inventory/import');
    /* obrázek 64×36 jedné barvy */
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      c.getContext('2d')!.fillRect(0, 0, 64, 36);
      const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png'));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'x.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await expect(page.getByText('Na snímku jsem nenašel inventory. Vlož snímek obrazovky INVENTORY (Tab).').first()).toBeVisible();
    await expect(page.locator('.scan-table')).toHaveCount(0);
  });
});

test.describe('From screenshot (English)', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('paste, review, name an unknown item, write, check Stock and profile', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#inventory/import');
    await expect(page.getByRole('tab', { name: 'From screenshot' })).toHaveAttribute('aria-selected', 'true');
    await pasteImage(page, TOOLTIP);
    await expect(page.locator('.scan-table tbody tr')).toHaveCount(13);
    await expect(page.getByTestId('scan-checksum')).toContainText('Found 24 of 200 occupied slots');
    await expect(page.getByLabel('I captured the whole stash, set missing materials to 0')).toBeDisabled();
    await expect(page.getByLabel(/Update coins in the profile \(51,060\)/)).toBeChecked();

    const mag = row(page, '2,3');
    await expect(mag).toContainText('Recognised');
    await expect(mag).toContainText('from tooltip');
    await expect(mag.getByRole('combobox', { name: TARGET })).toHaveValue('Magnetic Accelerator');
    /* no Czech text in the screen (user data excepted: material names are English) */
    const cz = await page.evaluate(re => [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && new RegExp(re).test(e.textContent || '')).map(e => e.textContent), CZ.source);
    expect(cz).toEqual([]);
    await page.getByRole('button', { name: 'Write' }).click();
    await expect(page.getByTestId('scan-done')).toContainText('Written: 12 materials, coins 51,060');
    await expect(page.getByTestId('scan-done')).toContainText('1 item in Equipment');

    const st = await stateOf(page);
    expect(st.inventory['Magnetic Accelerator']).toBe(8);
    expect(st.profile.coins).toBe(51060);
    expect(await snapshotKeys(page)).toHaveLength(1);

    await page.getByRole('link', { name: 'Back to Stock' }).click();
    await page.getByLabel('Search materials').fill('Magnetic');
    await expect(page.getByRole('textbox', { name: 'I have Magnetic Accelerator', exact: true })).toHaveValue('8');
    await page.goto('/#profile');
    await expect(page.locator('main')).toContainText('51,060');
    await page.goto('/#settings');
    await expect(page.getByTestId('learned-count')).toHaveText('13');
    expect(errors).toEqual([]);
  });

  test('filtered stash: 7 of 7, setting missing to 0 stays unavailable; ammo from the catalog goes to Equipment', async ({ page }) => {
    await page.goto('/#inventory/import');
    await page.getByTestId('scan-file').setInputFiles(AMMO);
    await expect(page.locator('.scan-table tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('scan-checksum')).toContainText('Found 7 of 7 occupied slots');
    await expect(page.getByLabel('I captured the whole stash, set missing materials to 0')).toBeDisabled();
    await page.getByLabel(/Update coins in the profile/).uncheck();
    /* every row set to "Do not write" and no coins: nothing to write */
    for (const cell of ['0,0', '0,1', '0,3', '1,2']) await row(page, cell).getByRole('combobox', { name: TARGET }).selectOption({ label: 'Do not write' });
    await expect(page.getByRole('button', { name: 'Write' })).toBeDisabled();
    await page.getByRole('button', { name: 'Discard screenshots' }).click();
    await expect(page.locator('.scan-table')).toHaveCount(0);
    expect((await stateOf(page))?.profile?.coins ?? 0).toBe(0);

    /* again with the defaults: four ammo kinds into Equipment */
    await page.getByTestId('scan-file').setInputFiles(AMMO);
    await expect(row(page, '0,1').getByLabel('Item name')).toHaveValue('Light Ammo');
    await page.getByLabel(/Update coins in the profile/).uncheck();
    await page.getByRole('button', { name: 'Write' }).click();
    await expect(page.getByTestId('scan-done')).toContainText('4 items in Equipment');
    await page.getByRole('link', { name: 'To Equipment' }).click();
    await expect(page.getByRole('tab', { name: 'Equipment' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('tbody[data-category="ammo"] tr[data-item]')).toHaveCount(4);
    await expect(page.getByRole('textbox', { name: 'Count: Light Ammo', exact: true })).toHaveValue('156');
    expect((await stateOf(page)).items['Medium Ammo'].count).toBe(179);
    expect((await stateOf(page))?.profile?.coins ?? 0).toBe(0);
  });
});
