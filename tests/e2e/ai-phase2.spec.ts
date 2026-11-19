/* 0.31.0: AI asistent fáze 2 v obou jazycích, se zkušební náhradou nativní vrstvy (window.__aiTest): žádná síť.
   Každý nový druh otázky přes svoje tlačítko: Zeptat se Opse u úkolu (Úkoly) a u stanice (Workshop), AI Raid Planner
   u aktivního plánu (Příprava na raid) a Shrnout raid ve vyhodnocení po raidu. Dotaz se pošle jen na kliknutí, s daty
   daného druhu v ohraničeném bloku; odpověď je prostý text se zdroji a tlačítky, která počítá aplikace. Ve výchozím
   stavu (vypnuto) tlačítka jen otevřou panel a nic se nevolá. */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'gsk_FAKE_E2E_KEY_not_real_0456';
type Sent = { provider: string; model: string; messages: { role: string; content: string }[] };
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const asks = (page: Page) => page.evaluate(() => (window as unknown as { __aiAsks: Sent[] }).__aiAsks);

async function seed(page: Page, lang: 'cs' | 'en', on: boolean) {
  await page.addInitScript(([s, key, withKey]) => {
    const keys = new Map<string, string>();
    if (withKey) keys.set('groq', key);
    const w = window as unknown as Record<string, unknown>;
    w.__aiAsks = [];
    w.__aiTest = {
      keySet: async (p: string, k: string) => { keys.set(p, k); },
      keyClear: async (p: string) => { keys.delete(p); },
      keyStatus: async (p: string) => keys.has(p),
      ask: async (provider: string, model: string, messages: unknown[]) => {
        (w.__aiAsks as unknown[]).push({ provider, model, messages });
        return { text: '**Riskuješ** málo. [klik](https://evil.example) <b>Vezmi</b> Wires a jdi na Dam.', today: 1 };
      },
    };
    if (sessionStorage.getItem('ai2-e2e')) return;
    sessionStorage.setItem('ai2-e2e', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, [JSON.stringify({
    schema: 19, inventory: { Wires: 3, Battery: 1, 'Power Cable': 1 }, quests: { done: { ss10s: 1 }, pinned: ['ss10y'] },
    buddy: { enabled: true }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang },
    ...(on ? { ai: { on: true, consentAt: Date.UTC(2026, 10, 14), consentVersion: 1 } } : {}),
  }), KEY, on] as const);
}

const T = {
  cs: { page: 'Zeptej se Opse', sources: /^Vychází z \d+ údaj/, note: 'Vytvořeno AI, čísla počítá aplikace.', sum: 'Shrnout raid', raidHead: 'Příprava na raid' },
  en: { page: 'Ask Ops', sources: /^Based on \d+ fact/, note: 'AI-generated, the app computes the numbers.', sum: 'Sum up raid', raidHead: 'Raid prep' },
} as const;

async function expectAnswer(page: Page, kind: string, L: (typeof T)['cs' | 'en']) {
  await expect(page.locator('h1')).toHaveText(L.page);
  const result = page.getByTestId('ask-result');
  await expect(result).toHaveAttribute('data-status', 'answer');
  const answer = page.getByTestId('ask-answer');
  await expect(answer).toContainText('Riskuješ málo. klik Vezmi Wires a jdi na Dam.');
  await expect(answer.locator('a, b, img')).toHaveCount(0);
  await expect(page.getByTestId('ask-ainote')).toHaveText(L.note);
  await expect(page.getByTestId('ask-sources').locator('summary')).toHaveText(L.sources);
  await expect(page.getByTestId('ask-thinking')).toHaveCount(0);
  const last = (await asks(page)).at(-1)!;
  expect(last.messages.map(m => m.role)).toEqual(['system', 'user']);
  const user = last.messages[1].content;
  expect(user.match(/<question>/g)).toHaveLength(1);
  expect(user.match(/<app_data /g)).toHaveLength(1);
  expect(user).toContain(`<app_data kind="${kind}">`);
  expect(JSON.stringify(last)).not.toContain(KEY.slice(4, 20));
  return user;
}

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`AI fáze 2: úkol, stanice, AI Raid Planner a Shrnout raid (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, true);

    /* Co dál?: každý ze tří nejlepších tipů má Proč? (zdarma, bez AI, dokud hráč neklikne) */
    await page.goto('/#ask');
    await expect(page.getByTestId('ask-ops')).toHaveAttribute('data-block', '');
    const tips = page.getByTestId('ask-next').locator('li[data-tip]');
    const nTips = await tips.count();
    expect(nTips).toBeGreaterThan(0);
    expect(nTips).toBeLessThanOrEqual(3);
    await expect(page.getByTestId('ask-next').getByTestId('ask-why')).toHaveCount(nTips);
    for (let i = 0; i < nTips; i++) await expect(tips.nth(i).getByTestId('ask-why')).toBeEnabled();
    expect(await asks(page)).toEqual([]);

    /* Úkoly: Zeptat se Opse u otevřeného úkolu → úkoly a dílna se zaměřením na úkol */
    await page.goto('/#quests/q=ss10y');
    await expect(page.getByTestId('quest-detail')).toBeVisible();
    expect(await asks(page)).toEqual([]);
    await page.getByTestId('quest-ask').click();
    let user = await expectAnswer(page, 'quests-workshop', L);
    expect(user).toContain('"focus":{"quest":{"name":"After Rain Comes"');
    expect(user).toContain('"status":"available"');
    await expect(page.getByTestId('ask-open-quest')).toBeVisible();
    await page.getByTestId('ask-open-quest').click();
    await expect(page.getByTestId('quest-detail')).toBeVisible();

    /* Workshop: Zeptat se Opse u stanice → recept další úrovně proti zásobě */
    await page.evaluate(() => { window.location.hash = 'workshop'; });
    await page.locator('[data-station="gear"]').getByTestId('station-ask').click();
    user = await expectAnswer(page, 'quests-workshop', L);
    expect(user).toContain('"focus":{"station":{"name":"Gear Bench"');
    await expect(page.getByTestId('ask-open-station')).toBeVisible();

    /* Příprava na raid: bez spuštěného plánu tlačítko není; po spuštění AI Raid Planner nad aktivním plánem */
    await page.evaluate(() => { window.location.hash = 'raid'; });
    await expect(page.locator('h1')).toHaveText(L.raidHead);
    await expect(page.getByTestId('raid-ask')).toHaveCount(0);
    await page.getByTestId('raid-start').click();
    await expect(page.getByTestId('raid-active')).toBeVisible();
    const before = (await asks(page)).length;
    await page.getByTestId('raid-ask').click();
    user = await expectAnswer(page, 'raid-prep', L);
    expect((await asks(page)).length).toBe(before + 1);
    expect(user).toContain('"planActive":true');
    expect(user).toContain('"map":{"name":');
    await expect(page.getByTestId('ask-open-raid')).toBeVisible();

    /* Shrnout raid: až po vyhodnocení a jen na kliknutí (vyhodnocení samo AI nevolá) */
    await page.getByTestId('ask-open-raid').click();
    await expect(page.locator('h1')).toHaveText(L.raidHead);
    await expect(page.getByTestId('raid-eval-ask')).toHaveCount(0);
    await page.getByTestId('raid-eval').click();
    await expect(page.getByTestId('raid-eval-sum')).toBeVisible();
    const n = (await asks(page)).length;
    await expect(page.getByTestId('raid-eval-ask')).toHaveText(L.sum);
    expect((await asks(page)).length).toBe(n);
    await page.getByTestId('raid-eval-ask').click();
    user = await expectAnswer(page, 'post-raid', L);
    expect(user).toContain('"evaluation":{');
    expect((await asks(page)).length).toBe(n + 1);
    expect(errors).toEqual([]);
  });

  test(`AI fáze 2 ve výchozím stavu (vypnuto): tlačítka jen otevřou panel, nic se nevolá (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, false);
    await page.goto('/#quests/q=ss10y');
    await page.getByTestId('quest-ask').click();
    await expect(page.locator('h1')).toHaveText(L.page);
    await expect(page.getByTestId('ask-ops')).toHaveAttribute('data-block', 'consent');
    await expect(page.getByTestId('ask-result')).toHaveCount(0);
    await page.evaluate(() => { window.location.hash = 'workshop'; });
    await page.locator('[data-station="gear"]').getByTestId('station-ask').click();
    await page.evaluate(() => { window.location.hash = 'raid'; });
    await page.getByTestId('raid-start').click();
    await page.getByTestId('raid-ask').click();
    await expect(page.locator('h1')).toHaveText(L.page);
    await expect(page.getByTestId('ask-result')).toHaveCount(0);
    expect(await asks(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
