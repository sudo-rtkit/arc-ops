/* 0.30.0: AI asistent Ops v obou jazycích, se zkušební náhradou nativní vrstvy (window.__aiTest, jen v prohlížeči):
   žádná síť. Výchozí stav vypnuto a bez souhlasu a klíče se nic nevolá; souhlas, zapnutí a klíč v Nastavení (klíč se
   nikam neuloží a pole se vyprázdní); otázka v panelu Zeptej se Opse s odpovědí jako prostým textem, zdroji a poznámkou;
   chyba služby; tlačítko na kartě předmětu; polní konzole nad hrou se bez jistoty „mimo raid“ ptát nenechá. */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'gsk_FAKE_E2E_KEY_not_real_0123';
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const stateText = (page: Page) => page.evaluate(() => localStorage.getItem('arcops:state') || '');
const asks = (page: Page) => page.evaluate(() => (window as unknown as { __aiAsks: { provider: string; model: string; messages: { role: string; content: string }[] }[] }).__aiAsks);

async function seed(page: Page, lang: 'cs' | 'en', extra: Record<string, unknown> = {}) {
  await page.addInitScript(([s, key]) => {
    /* zkušební nativní vrstva AI (náhrada Rustu): klíče v paměti stránky, dotazy se zaznamenají */
    const keys = new Map<string, string>();
    const w = window as unknown as Record<string, unknown>;
    w.__aiAsks = [];
    w.__aiTest = {
      keySet: async (p: string, k: string) => { keys.set(p, k); },
      keyClear: async (p: string) => { keys.delete(p); },
      keyStatus: async (p: string) => keys.has(p),
      ask: async (provider: string, model: string, messages: unknown[]) => {
        (w.__aiAsks as unknown[]).push({ provider, model, messages });
        const q = JSON.stringify(messages);
        if (q.includes('kvota') || q.includes('quota')) throw 'ai:quota';
        return { text: '**Nech si** Wires: [víc](https://evil.example) <b>potřebuješ</b> je na Gear Bench. ' + key.slice(0, 3), today: 1 };
      },
    };
    if (sessionStorage.getItem('ai-e2e')) return;
    sessionStorage.setItem('ai-e2e', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, [JSON.stringify({ schema: 19, inventory: { Wires: 7 }, buddy: { enabled: true }, opsPrefs: { tutorial: { status: 'done', step: 'end' } }, settings: { autoSnapshot: false, lang }, ...extra }), KEY] as const);
}

const T = {
  cs: {
    consent: 'Rozumím a souhlasím', on: 'Zapnout AI asistenta', save: 'Uložit klíč', ask: 'Zeptat se', page: 'Zeptej se Opse',
    setup: 'potvrď v Nastavení', saved: 'Klíč je uložený', note: 'Vytvořeno AI, čísla počítá aplikace.', quota: 'Bezplatná kvóta služby',
    sources: /^Vychází z \d+ údaj/, askItem: 'Zeptat se Opse', today: 'Dnes 1 dotaz', inRaid: 'Během raidu se neptám', q: 'Proč si mám nechat Wires?', qQuota: 'kvota test',
  },
  en: {
    consent: 'I understand and agree', on: 'Turn on the AI assistant', save: 'Save key', ask: 'Ask', page: 'Ask Ops',
    setup: 'confirm in Settings', saved: 'The key is stored', note: 'AI-generated, the app computes the numbers.', quota: "The service's free quota",
    sources: /^Based on \d+ fact/, askItem: 'Ask Ops', today: '1 request today', inRaid: 'I do not take questions during a raid', q: 'Why should I keep Wires?', qQuota: 'quota test',
  },
} as const;

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`AI asistent: vypnuto, souhlas, klíč, otázka, chyba a karta předmětu (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await seed(page, lang);
    await page.goto('/#ask');
    await expect(page.locator('h1')).toHaveText(L.page);
    /* výchozí stav: bez souhlasu; pole otázky zakázané, nic se nevolá */
    const panel = page.getByTestId('ask-ops');
    await expect(panel).toHaveAttribute('data-block', 'consent');
    await expect(page.getByTestId('ask-setup')).toContainText(L.setup);
    await expect(page.getByTestId('ask-input')).toBeDisabled();
    expect(await asks(page)).toEqual([]);
    expect(JSON.parse(await stateText(page)).ai ?? { on: false }).toMatchObject({ on: false });

    /* Nastavení → AI asistent: zapnout jde až po souhlasu */
    await page.getByTestId('ask-settings').click();
    const set = page.getByTestId('ai-settings');
    await expect(set).toBeVisible();
    await expect(page.getByTestId('ai-on')).toBeDisabled();
    await expect(page.getByTestId('ai-consent')).toContainText(lang === 'cs' ? 'Google' : 'Google');
    await page.getByTestId('ai-consent-accept').click();
    await page.getByTestId('ai-on').check();
    await expect.poll(async () => JSON.parse(await stateText(page)).ai).toMatchObject({ on: true, provider: 'groq' });
    /* model: neplatné id se neuloží */
    await page.getByTestId('ai-model').fill('bad model!');
    await page.getByTestId('ai-model').press('Enter');
    await expect(set.getByRole('alert')).toBeVisible();
    await page.getByTestId('ai-model').fill('');
    await page.getByTestId('ai-model').press('Enter');
    /* klíč: jde jen do nativní vrstvy, pole se vyprázdní, ve stavu není */
    await page.getByTestId('ai-key').fill(KEY);
    await page.getByTestId('ai-key-save').click();
    await expect(page.getByTestId('ai-key-msg')).toContainText(L.saved);
    await expect(page.getByTestId('ai-key')).toHaveValue('');
    await expect(page.getByTestId('ai-key')).toHaveAttribute('type', 'password');
    expect(await stateText(page)).not.toContain(KEY.slice(4, 20));

    /* otázka v panelu: odpověď jako prostý text se zdroji a poznámkou */
    await page.evaluate(() => { window.location.hash = 'ask'; });
    await expect(panel).toHaveAttribute('data-block', '');
    await expect(page.getByTestId('ask-next')).toBeVisible();
    await page.getByTestId('ask-input').fill(L.q);
    await page.getByTestId('ask-send').click();
    const result = page.getByTestId('ask-result');
    await expect(result).toHaveAttribute('data-status', 'answer');
    const answer = page.getByTestId('ask-answer');
    await expect(answer).toContainText('Nech si Wires: víc potřebuješ je na Gear Bench.');
    await expect(answer.locator('a, b, img')).toHaveCount(0);
    await expect(answer).not.toContainText('https://');
    await expect(page.getByTestId('ask-ainote')).toHaveText(L.note);
    await expect(page.getByTestId('ask-sources').locator('summary')).toHaveText(L.sources);
    const sent = await asks(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(sent[0].messages.map(m => m.role)).toEqual(['system', 'user']);
    expect(sent[0].messages[1].content).toContain('<question>');
    expect(sent[0].messages[1].content).toContain('<app_data');
    expect(JSON.stringify(sent)).not.toContain(KEY.slice(4, 20));
    await expect.poll(async () => JSON.parse(await stateText(page)).ai).toMatchObject({ count: 1 });

    /* chyba služby (kvóta): srozumitelná zpráva, nezůstane „přemýšlí“ */
    await page.getByTestId('ask-input').fill(L.qQuota);
    await page.getByTestId('ask-send').click();
    await expect(page.getByTestId('ask-error')).toHaveAttribute('data-error', 'quota');
    await expect(page.getByTestId('ask-error')).toContainText(L.quota);
    await expect(page.getByTestId('ask-thinking')).toHaveCount(0);

    /* karta předmětu: Zeptat se Opse položí otázku k předmětu (druh item) */
    await page.evaluate(() => { window.location.hash = 'inventory'; });
    await page.locator('[data-item-link="Wires"]').first().click();
    await page.getByTestId('item-card-ask').click();
    await expect(page.locator('h1')).toHaveText(L.page);
    await expect(result).toHaveAttribute('data-status', 'answer');
    await expect(page.getByTestId('ask-actions')).toBeVisible();
    const last = (await asks(page)).at(-1)!;
    expect(last.messages[1].content).toContain('<app_data kind="item">');
    expect(last.messages[1].content).toContain('"name":"Wires"');

    /* polní konzole nad hrou: bez jistoty „mimo raid“ (v prohlížeči hlídání hry neběží) se ptát nejde */
    const before = (await asks(page)).length;
    const ov = await context.newPage();
    const ovErrors = watchErrors(ov);
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    const ovAsk = ov.getByTestId('ov-ask');
    await expect(ovAsk).toBeVisible();
    await expect(ovAsk.getByTestId('ask-ops')).toHaveAttribute('data-block', 'inRaid');
    await expect(ovAsk.getByTestId('ask-inraid')).toContainText(L.inRaid);
    await expect(ovAsk.getByTestId('ask-input')).toHaveCount(0);
    await expect(ov.getByTestId('ov-ask-why')).toHaveCount(0);
    expect((await asks(page)).length).toBe(before);

    /* Nastavení: dnešní počet dotazů (kvóta i úspěch došly ke službě) */
    await page.evaluate(() => { window.location.hash = 'settings/ai'; });
    await expect(page.getByTestId('ai-today')).toContainText(lang === 'cs' ? 'Dnes 3 dotazy' : '3 requests today');
    expect(errors).toEqual([]);
    expect(ovErrors).toEqual([]);
  });

  test(`AI asistent ve výchozím stavu: v konzoli nic, na kartě předmětu jen otevře panel bez dotazu (${lang})`, async ({ page, context }) => {
    const errors = watchErrors(page);
    await seed(page, lang);
    await page.goto('/#inventory');
    await page.locator('[data-item-link="Wires"]').first().click();
    await page.getByTestId('item-card-ask').click();
    await expect(page.locator('h1')).toHaveText(L.page);
    await expect(page.getByTestId('ask-result')).toHaveCount(0);
    const ov = await context.newPage();
    await ov.goto('/overlay.html');
    await expect(ov.getByTestId('overlay')).toBeVisible();
    await expect(ov.getByTestId('ov-ask')).toHaveCount(0);
    expect(await asks(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
