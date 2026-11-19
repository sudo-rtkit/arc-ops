/* 0.32.0: AI asistent fáze 3 (Personal AI Analyst) a verze souhlasu v obou jazycích, se zkušební náhradou nativní
   vrstvy (window.__aiTest): žádná síť.
   - Statistics: Zeptat se Opse v záhlaví a Proč? u řádku mapy v panelu Mapy: přežití, loot a trend. Dotaz se pošle
     jen na kliknutí, s balíkem raid-stats (souhrny s velikostí vzorku, bez poznámek); malý vzorek je v tabulce
     označený. Ve výchozím stavu (vypnuto) tlačítko jen otevře panel.
   - Nový souhlas: souhlas bez verze (0.30/0.31) dotazy blokuje; panel odkáže do Nastavení, kde je vidět, co přibylo;
     po souhlasu dotaz projde. Chyba „model nenalezen“ ukáže výchozí model služby. */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'gsk_FAKE_E2E_KEY_not_real_0789';
const NOTE = 'squad with SquadMateXyz77 raider.test@example.com';
type Sent = { provider: string; model: string; messages: { role: string; content: string }[] };
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
const asks = (page: Page) => page.evaluate(() => (window as unknown as { __aiAsks: Sent[] }).__aiAsks);
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const dataOf = (user: string) => JSON.parse(user.slice(user.indexOf('>\n', user.indexOf('<app_data')) + 2, user.lastIndexOf('\n</app_data>')));

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12);
const raid = (i: number, map: string, ok: boolean, loot: { name: string; qty: number }[]) => ({
  id: `e2e-raid-${i}`, ts: T0 + i * DAY, map, type: 'money', route: '', ok, coins: ok ? 1200 : 0, min: 20, notes: NOTE,
  loadout: '', gear: [{ name: 'Ferro II', qty: 1 }], loot, lost: [], goals: [], lootApplied: [],
});
/* Dam: 7 raidů (3 vyřazení, 4 přežití s lootem), Buried City: 2 vyřazení (malý vzorek) */
const RAIDS = [
  ...Array.from({ length: 7 }, (_, i) => raid(i, 'dam', i >= 3, i >= 3 ? [{ name: 'Wires', qty: 2 }] : [])),
  raid(7, 'buried', false, []), raid(8, 'buried', false, []),
];

async function seed(page: Page, lang: 'cs' | 'en', ai: Record<string, unknown> | null) {
  await page.addInitScript(([s, key]) => {
    const keys = new Map<string, string>([['groq', key]]);
    const w = window as unknown as Record<string, unknown>;
    w.__aiAsks = [];
    w.__aiTest = {
      keySet: async (p: string, k: string) => { keys.set(p, k); },
      keyClear: async (p: string) => { keys.delete(p); },
      keyStatus: async (p: string) => keys.has(p),
      ask: async (provider: string, model: string, messages: { content: string }[]) => {
        (w.__aiAsks as unknown[]).push({ provider, model, messages });
        if (messages[1].content.includes('MODEL-GONE')) throw new Error('ai:model');
        return { text: 'Na **Dam** přežíváš ve 4 ze 7 raidů. Na Buried City jsou jen 2 raidy, to je málo dat.', today: 1 };
      },
    };
    if (sessionStorage.getItem('ai3-e2e')) return;
    sessionStorage.setItem('ai3-e2e', '1'); localStorage.clear(); localStorage.setItem('arcops:state', s);
  }, [JSON.stringify({
    schema: 19, raids: RAIDS, buddy: { enabled: true }, opsPrefs: { tutorial: { status: 'done', step: 'end' } },
    settings: { autoSnapshot: false, lang }, ...(ai ? { ai } : {}),
  }), KEY] as const);
}

const T = {
  cs: { page: 'Zeptej se Opse', sources: /^Vychází z \d+ údaj/, note: 'Vytvořeno AI, čísla počítá aplikace.', little: 'málo dat (2 raidy)', journal: 'Deník raidů: 9 raidů', reconsent: 'Seznam toho, co se posílá, se od tvého souhlasu rozšířil', newBadge: 'nové', hint: 'Výchozí model služby je openai/gpt-oss-120b' },
  en: { page: 'Ask Ops', sources: /^Based on \d+ fact/, note: 'AI-generated, the app computes the numbers.', little: 'little data (2 raids)', journal: 'Raid journal: 9 raids', reconsent: 'The list of what is sent has grown since you agreed', newBadge: 'new', hint: 'The service default is openai/gpt-oss-120b' },
} as const;

async function expectStatsAnswer(page: Page, L: (typeof T)['cs' | 'en']) {
  await expect(page.locator('h1')).toHaveText(L.page);
  await expect(page.getByTestId('ask-result')).toHaveAttribute('data-status', 'answer');
  const answer = page.getByTestId('ask-answer');
  await expect(answer).toContainText('Na Dam přežíváš ve 4 ze 7 raidů.');
  await expect(answer.locator('a, b')).toHaveCount(0);
  await expect(page.getByTestId('ask-ainote')).toHaveText(L.note);
  await expect(page.getByTestId('ask-sources').locator('summary')).toHaveText(L.sources);
  await expect(page.getByTestId('ask-sources')).toContainText(L.journal);
  const last = (await asks(page)).at(-1)!;
  expect(last.messages.map(m => m.role)).toEqual(['system', 'user']);
  const user = last.messages[1].content;
  expect(user.match(/<question>/g)).toHaveLength(1);
  expect(user.match(/<app_data /g)).toHaveLength(1);
  expect(user).toContain('<app_data kind="raid-stats">');
  /* nikdy poznámky, jména hráčů, e-maily, id záznamů, klíč */
  for (const bad of ['SquadMateXyz77', 'example.com', 'e2e-raid-', KEY.slice(4, 20), '"notes"']) expect(JSON.stringify(last), bad).not.toContain(bad);
  expect(last.messages[0].content).toContain('smallSample');
  return dataOf(user).raidStats;
}

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  test(`AI fáze 3: Zeptat se Opse ve Statistics a Proč? u mapy (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, { on: true, consentAt: Date.UTC(2026, 10, 15), consentVersion: 1 });
    await page.goto('/#stats');
    await expect(page.locator('h1')).toHaveText('Statistics');
    /* tabulka map: stejná čísla, malý vzorek označený; nic se zatím neposlalo */
    const maps = page.getByTestId('stats-ai-maps');
    await expect(maps.locator('tr[data-map]')).toHaveCount(2);
    await expect(maps.locator('tr[data-map="dam"] td').nth(1)).toHaveText('7');
    await expect(maps.locator('tr[data-map="dam"] td').nth(2)).toHaveText('4 / 3');
    await expect(maps.locator('tr[data-map="buried"]')).toContainText(L.little);
    await expect(maps.locator('tr[data-map="dam"]')).not.toContainText(L.little);
    expect(await asks(page)).toEqual([]);

    /* záhlaví: Zeptat se Opse → analytika celého deníku */
    await page.getByTestId('stats-ask').click();
    let d = await expectStatsAnswer(page, L);
    expect(d.overall).toMatchObject({ raids: 9, survived: 4, knockedOut: 5, smallSample: false });
    expect(d.focusMap).toBeNull();
    expect(d.maps.find((m: { map: string }) => m.map === 'Buried City')).toMatchObject({ raids: 2, smallSample: true });
    expect(await asks(page)).toHaveLength(1);
    await expect(page.getByTestId('ask-open-stats')).toBeVisible();
    await page.getByTestId('ask-open-stats').click();
    await expect(page.locator('h1')).toHaveText('Statistics');

    /* Proč? u řádku mapy → odkaz map:dam, otázka se jménem mapy */
    await page.locator('tr[data-map="dam"]').getByTestId('stats-ask-map').click();
    d = await expectStatsAnswer(page, L);
    expect(d.focusMap).toMatchObject({ map: 'Dam Battlegrounds', raids: 7, survived: 4, knockedOut: 3 });
    const last = (await asks(page)).at(-1)!;
    expect(last.messages[1].content).toContain('Dam Battlegrounds');
    expect(await asks(page)).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test(`AI fáze 3 ve výchozím stavu: Zeptat se Opse ve Statistics jen otevře panel, nic se nevolá (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page, lang, null);
    await page.goto('/#stats');
    await page.getByTestId('stats-ask').click();
    await expect(page.locator('h1')).toHaveText(L.page);
    await expect(page.getByTestId('ask-ops')).toHaveAttribute('data-block', 'consent');
    await expect(page.getByTestId('ask-result')).toHaveCount(0);
    await page.evaluate(() => { window.location.hash = 'stats'; });
    await page.locator('tr[data-map="dam"]').getByTestId('stats-ask-map').click();
    await expect(page.getByTestId('ask-result')).toHaveCount(0);
    expect(await asks(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`nový souhlas: souhlas bez verze blokuje, Nastavení ukáže, co přibylo, po souhlasu dotaz projde (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    /* souhlas z 0.30/0.31 (bez verze), asistent zapnutý, klíč uložený */
    await seed(page, lang, { on: true, consentAt: Date.UTC(2026, 10, 14) });
    await page.goto('/#ask');
    const panel = page.getByTestId('ask-ops');
    await expect(panel).toHaveAttribute('data-block', 'reconsent');
    await expect(page.getByTestId('ask-setup')).toContainText(L.reconsent);
    await expect(page.getByTestId('ask-input')).toBeDisabled();
    /* ani tlačítko ve Statistics nic nepošle */
    await page.evaluate(() => { window.location.hash = 'stats'; });
    await page.getByTestId('stats-ask').click();
    await expect(panel).toHaveAttribute('data-block', 'reconsent');
    await expect(page.getByTestId('ask-result')).toHaveAttribute('data-status', 'error');
    await expect(page.getByTestId('ask-error')).toHaveAttribute('data-error', 'reconsent');
    expect(await asks(page)).toEqual([]);

    /* Nastavení: co přibylo, označené v seznamu; nový souhlas */
    await page.getByTestId('ask-settings').click();
    const re = page.getByTestId('ai-reconsent');
    await expect(re).toBeVisible();
    await expect(re.locator('li[data-item]')).toHaveCount(4);
    for (const id of ['quests', 'raid', 'postRaid', 'stats']) await expect(re.locator(`li[data-item="${id}"]`)).toHaveCount(1);
    const items = page.getByTestId('ai-consent-items');
    await expect(items.locator('li')).toHaveCount(6);
    await expect(items.locator('li[data-new="1"]')).toHaveCount(4);
    await expect(items.locator('li[data-item="item"]')).not.toContainText(L.newBadge);
    await expect(items.locator('li[data-item="stats"]')).toContainText(L.newBadge);
    await expect(page.getByTestId('ai-on')).toBeChecked();
    expect((await stateOf(page)).ai).toMatchObject({ consentVersion: 0 });
    await page.getByTestId('ai-reconsent-accept').click();
    await expect(re).toHaveCount(0);
    await expect(items.locator('li[data-new="1"]')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page)).ai).toMatchObject({ on: true, consentVersion: 1 });

    /* teď dotaz projde: volná otázka o mapě dostane stručný souhrn deníku */
    await page.evaluate(() => { window.location.hash = 'ask'; });
    await expect(panel).toHaveAttribute('data-block', '');
    await page.getByTestId('ask-input').fill(lang === 'cs' ? 'Proč se mi na Dam nedaří?' : 'Why am I struggling on Dam?');
    await page.getByTestId('ask-send').click();
    await expect(page.getByTestId('ask-result')).toHaveAttribute('data-status', 'answer');
    const sent = (await asks(page)).at(-1)!;
    expect(sent.messages[1].content).toContain('<app_data kind="question">');
    expect(dataOf(sent.messages[1].content).raidStats.focusMap).toMatchObject({ map: 'Dam Battlegrounds', raids: 7 });

    /* model nenalezen: kód chyby a nápověda s výchozím modelem služby */
    await page.getByTestId('ask-input').fill('MODEL-GONE raid');
    await page.getByTestId('ask-send').click();
    await expect(page.getByTestId('ask-error')).toHaveAttribute('data-error', 'model');
    await expect(page.getByTestId('ask-error-hint')).toContainText(L.hint);
    expect(errors).toEqual([]);
  });
}
