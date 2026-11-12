/* 0.10.2: ruční zaškrtávání cílů úkolu v Quests, postup „Cíle n/m“, uložení a obnovení po načtení stránky,
   postup v kompaktu podle cílů. Úkol se zaškrtnutím všech cílů nesplní. V obou jazycích. */
import { expect, test, type Page } from '@playwright/test';

const SHORING = 'shoring_up_defenses';
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en') {
  /* starší stav (schéma 8) bez cílů: načte se a dostane prázdné cíle; zapíše se jen při prvním načtení */
  await page.addInitScript(st => {
    if (sessionStorage.getItem('qo-seeded')) return;
    sessionStorage.setItem('qo-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', st);
  }, JSON.stringify({ schema: 8, profile: { level: 5 }, quests: { done: {}, pinned: [SHORING] }, settings: { autoSnapshot: false, lang } }));
  await page.goto('/');
}

const T = {
  cs: { search: 'Hledat úkol', detail: 'Zobrazit detail úkolu Shoring Up Defenses', obj: 'Cíl splněn:', p0: 'Cíle 0/4', p2: 'Cíle 2/4', p4: 'Cíle 4/4', compact: 'Shoring Up Defenses: 2 z 4 cílů' },
  en: { search: 'Search quests', detail: 'Show details of quest Shoring Up Defenses', obj: 'Objective done:', p0: 'Objectives 0/4', p2: 'Objectives 2/4', p4: 'Objectives 4/4', compact: 'Shoring Up Defenses: 2 of 4 objectives' },
};

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`Quests: ruční zaškrtnutí cílů a jejich uložení (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto('/#quests');
    await page.getByLabel(L.search).fill('Shoring Up Defenses');
    const row = page.locator(`tr[data-quest="${SHORING}"]`);
    await expect(row.getByTestId('quest-obj-progress')).toHaveText(L.p0);
    await row.getByRole('button', { name: L.detail }).click();
    const detail = page.getByTestId('quest-detail');
    const boxes = detail.getByRole('checkbox', { name: new RegExp('^' + L.obj) });
    await expect(boxes).toHaveCount(4);

    await boxes.nth(0).check();
    await boxes.nth(2).check();
    await expect(row.getByTestId('quest-obj-progress')).toHaveText(L.p2);
    await expect.poll(async () => (await stateOf(page)).quests.objectives).toEqual({ [SHORING]: [0, 2] });
    expect((await stateOf(page)).schema).toBe(10);

    /* po načtení stránky zůstane */
    await page.reload();
    await page.getByLabel(L.search).fill('Shoring Up Defenses');
    await expect(row.getByTestId('quest-obj-progress')).toHaveText(L.p2);
    await row.getByRole('button', { name: L.detail }).click();
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(1)).not.toBeChecked();
    await expect(boxes.nth(2)).toBeChecked();

    /* kompakt: postup aktivního úkolu podle cílů */
    await page.keyboard.press('Control+Shift+M');
    const cq = page.locator(`[data-testid="compact-quests"] li[data-quest="${SHORING}"]`);
    await expect(cq.getByLabel(L.compact)).toHaveText('2/4');
    await page.keyboard.press('Control+Shift+M');
    await expect(page.locator('.shell').first()).toBeVisible();

    /* všechny cíle zaškrtnuté: úkol se sám nesplní; odškrtnutí funguje */
    await page.goto('/#quests');
    await page.getByLabel(L.search).fill('Shoring Up Defenses');
    if (!(await detail.isVisible())) await row.getByRole('button', { name: L.detail }).click();
    await boxes.nth(1).check();
    await boxes.nth(3).check();
    await expect(row.getByTestId('quest-obj-progress')).toHaveText(L.p4);
    await expect(row).not.toHaveAttribute('data-status', 'done');
    await boxes.nth(0).uncheck();
    await expect.poll(async () => (await stateOf(page)).quests.objectives).toEqual({ [SHORING]: [1, 2, 3] });
    expect((await stateOf(page)).quests.done).toEqual({});
    expect(errors).toEqual([]);
  });
}
