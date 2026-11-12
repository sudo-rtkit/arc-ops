/* 0.10.1 (milník 6, podmnožina): hlavní moduly v overlayi. Overlay drží jen kopii stavu; úpravy jdou do hlavního
   okna (hub) a vrátí se jako nový stav. Profil, inventář, dílna a skilly v obou jazycích, bez chyb v konzoli. */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const T = {
  cs: { profile: 'Profil', inventory: 'Inventář', workshop: 'Dílna', skills: 'Skilly', level: 'Level', up: 'Zvýšit: Gunsmith', lungs: 'Zvýšit: Youthful Lungs', count: 'Počet: Metal Parts', search: 'Hledat materiál' },
  en: { profile: 'Profile', inventory: 'Inventory', workshop: 'Workshop', skills: 'Skills', level: 'Level', up: 'Increase: Gunsmith', lungs: 'Increase: Youthful Lungs', count: 'Count: Metal Parts', search: 'Search material' },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`moduly v overlayi: profil, inventář, dílna, skilly (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.addInitScript(s => {
      if (sessionStorage.getItem('ovm')) return;
      sessionStorage.setItem('ovm', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
    }, JSON.stringify({ schema: 8, profile: { level: 10, coins: 500 }, inventory: { 'Metal Parts': 3 }, buddy: { enabled: true }, settings: { lang } }));
    await page.goto('/');
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();

    await ov.getByRole('tab', { name: L.profile, exact: true }).click();
    const prof = ov.getByTestId('ov-mod-profile');
    await prof.getByTestId('ov-prof-level').fill('21');
    await prof.getByTestId('ov-prof-level').press('Enter');
    await expect.poll(async () => (await stateOf(page)).profile.level).toBe(21);

    await ov.getByRole('tab', { name: L.inventory, exact: true }).click();
    const inv = ov.getByTestId('ov-mod-inventory');
    await inv.getByRole('spinbutton', { name: L.count }).fill('40');
    await inv.getByRole('spinbutton', { name: L.count }).blur();
    await expect.poll(async () => (await stateOf(page)).inventory['Metal Parts']).toBe(40);
    await inv.getByTestId('ov-inv-search').fill('zzzz-none');
    await expect(inv.locator('tbody tr')).toHaveCount(0);

    await ov.getByRole('tab', { name: L.workshop, exact: true }).click();
    await ov.getByTestId('ov-mod-workshop').getByRole('button', { name: L.up }).click();
    await expect.poll(async () => (await stateOf(page)).stations.gunsmith).toBe(1);
    await expect(ov.locator('tr[data-station="gunsmith"] [data-testid="ov-station-level"]')).toHaveText('1 / 4');

    await ov.getByRole('tab', { name: L.skills, exact: true }).click();
    await ov.getByTestId('ov-mod-skills').getByRole('button', { name: L.lungs }).click();
    await expect.poll(async () => (await stateOf(page)).skills.current).toEqual({ m_lungs: 1 });
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });
}
