/* 0.10.1: postup ze snímku. Umělé obrazovky kreslené ze vzorů písmen (tests/vision/progress-synth.ts), žádné vlastní
   snímky hráče. Overlay: snímek profilu ze zkratky → revize s jistotou polí → potvrzený zápis se snímkem stavu.
   Hlavní okno: Profil → Načíst ze snímku (soubor) → úkol jen jako informace, rank skillu z tooltipu zapsán. */
import { expect, test, type Page } from '@playwright/test';
import { toPngBase64 } from '../vision/findings';
import { profileScreen, questScreen, skillScreen } from '../vision/progress-synth';

const PROFILE = toPngBase64(profileScreen({ level: 'LEVEL 20', xp: '2,977/29,000 XP', coins: '58,313' }));
const QUEST = Buffer.from(toPngBase64(questScreen({ trader: 'APOLLO', title: 'SHORING UP DEFENSES', checks: [true, true, false, true] })), 'base64');
const SKILL = Buffer.from(toPngBase64(skillScreen({ name: 'MARATHON RUNNER', current: 5 })), 'base64');
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en', extra: Record<string, unknown> = {}) {
  await page.addInitScript(s => {
    if (sessionStorage.getItem('progress-seeded')) return;
    sessionStorage.setItem('progress-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', s);
  }, JSON.stringify({ schema: 8, profile: { level: 12, coins: 1000, xp: 5, xpNext: 100 }, buddy: { enabled: true }, settings: { autoSnapshot: true, lang }, ...extra }));
  await page.goto('/');
}
async function capture(page: Page, b64: string) {
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    return (window as unknown as { __opsTest: { capture: (w: number, h: number, d: ArrayLike<number>) => string } }).__opsTest.capture(bmp.width, bmp.height, px);
  }, b64);
}

const T = {
  cs: { title: 'Profil', write: 'Potvrdit a zapsat 4 změny', done: 'Zapsány 4 hodnoty.', shot: 'Načíst ze snímku', quest: 'Úkol obchodníka', skill: 'Skill tree', skillWrite: 'Potvrdit a zapsat 1 změnu', skillDone: 'Zapsána 1 hodnota.', nothing: 'Není co zapsat' },
  en: { title: 'Profile', write: 'Confirm and write 4 changes', done: '4 values written.', shot: 'Load from a screenshot', quest: 'Trader quest', skill: 'Skill tree', skillWrite: 'Confirm and write 1 change', skillDone: '1 value written.', nothing: 'Nothing to write' },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`profil ze snímku v overlayi (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    await expect.poll(async () => !!(await stateOf(page))?.meta, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(700);
    const before = await stateOf(page);

    expect(await capture(page, PROFILE)).toBe('progress');
    const rev = ov.getByTestId('progress-review');
    await expect(rev).toBeVisible();
    await expect(rev.getByRole('heading', { name: L.title })).toBeVisible();
    await expect(rev.locator('tr[data-row]')).toHaveCount(4);
    await expect(rev.locator('tr[data-row="level"] [data-testid="progress-read"]')).toHaveText('20');
    await expect(rev.locator('tr[data-row="coins"] [data-testid="progress-read"]')).toHaveText(/58[\s .,]?313/);
    /* nic se nezapsalo bez potvrzení */
    await page.waitForTimeout(600);
    expect((await stateOf(page)).profile).toEqual(before.profile);

    await rev.getByTestId('progress-write').click();
    await expect(ov.getByTestId('ov-progress-done')).toHaveText(L.done);
    await expect.poll(async () => (await stateOf(page)).profile).toMatchObject({ level: 20, xp: 2977, xpNext: 29000, coins: 58313 });
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });

  test(`Profil → Načíst ze snímku: úkol jen informace, rank skillu z tooltipu (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto('/#profile/shot');
    const box = page.getByTestId('progress-shot');
    await expect(box).toBeVisible();

    await box.getByTestId('progress-shot-file').setInputFiles({ name: 'quest.png', mimeType: 'image/png', buffer: QUEST });
    const rev = box.getByTestId('progress-review');
    await expect(rev.getByRole('heading', { name: L.quest })).toBeVisible();
    await expect(rev.getByTestId('progress-quest')).toContainText('Apollo');
    await expect(rev.locator('.pr-objectives li')).toHaveCount(4);
    await expect(rev.locator('.pr-objectives li[data-checked="false"]')).toHaveCount(1);
    /* úkol není v aplikaci splněný: nic předvybraného, jen připnutí na přání */
    await expect(rev.getByTestId('progress-write')).toBeDisabled();

    await box.getByTestId('progress-shot-file').setInputFiles({ name: 'skill.png', mimeType: 'image/png', buffer: SKILL });
    await expect(rev.getByRole('heading', { name: L.skill })).toBeVisible();
    await expect(rev.locator('tr[data-row="m_marathon"] [data-testid="progress-read"]')).toHaveText('5/5');
    await expect(rev.getByTestId('progress-totals').locator('tr')).toHaveCount(4);
    await rev.getByTestId('progress-write').click();
    await expect(box.getByTestId('progress-shot-done')).toHaveText(L.skillDone);
    await expect.poll(async () => (await stateOf(page)).skills.current).toEqual({ m_marathon: 5 });
    expect(errors).toEqual([]);
  });
}
