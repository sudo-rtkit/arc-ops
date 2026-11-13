/* 0.11.0: Minihry ve webovém sestavení, v obou jazycích. 0.12.0: Opsův hack (klávesnice i myš, tři uzly, norma a
   nátěry) a série kvízu uložená po každé odpovědi. Stash Tetris (myš i klávesnice, otočení, srovnání
   s Opsovým balením a rady), recyklační kvíz (vysvětlení, klávesy 1–4) a odemčení nátěru s výběrem v šatníku.
   Kola mají pevné číslo v adrese, takže test zná předměty a otázky z jádra. Starší stav (schéma 9) se načte. */
import { expect, test, type Page } from '@playwright/test';
import { greedy, makeRound } from '../../src/core/stashTetris';
import { makeQuiz } from '../../src/core/recycleQuiz';
import { isSolved, makeHack, rotateAt, rotateMask } from '../../src/core/opsHack';
import { OPS_LINES } from '../../src/i18n/opsLines';
import { tl } from '../../src/i18n';

const SEED = 4242;
const esc = (s: string) => s.replace(/["\\]/g, '\\$&');
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
const soundLog = (page: Page) => page.evaluate(() => (window as unknown as { __opsSound: { log: string[] } }).__opsSound.log.slice());
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en') {
  await page.addInitScript(st => {
    if (sessionStorage.getItem('mg-seeded')) return;
    sessionStorage.setItem('mg-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', st);
  }, JSON.stringify({ schema: 9, profile: { level: 20 }, inventory: { 'Metal Parts': 5 }, settings: { autoSnapshot: false, lang } }));
  await page.goto('/');
}
/* barvy plátna Opse (přesné RGB, jen neprůhledné pixely) */
const canvasColors = (page: Page, sel: string) => page.locator(sel).first().evaluate((c: HTMLCanvasElement) => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out = new Set<string>();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255) out.add('#' + [d[i], d[i + 1], d[i + 2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase());
  return [...out];
});

const T = {
  cs: { nav: 'Minihry', tetris: 'Stash Tetris', quiz: 'Recyklační kvíz', play: 'Hrát', shapes: /zjednodušené podle typu/, finish: 'Hotovo, vyhodnotit', showOps: 'Ukázat Opsovo balení',
    pct: '100 % Opsova balení', unlock: 'Nový nátěr Polní oliva, Rezavá bedna, Zlacená! Zkusíme ho v šatníku?', rotate: 'Otočit (R)', next: 'Další otázka', score: 'Správně 9 z 10',
    unlockQuiz: 'Nový nátěr Polní oliva, Arktická! Zkusíme ho v šatníku?', arctic: 'Arktická', night: 'Noční hlídka', original: 'Původní', wrong: /^Vedle\. Správně je:/, correct: 'Správně!', wardrobe: 'Šatník Opse' },
  en: { nav: 'Minigames', tetris: 'Stash Tetris', quiz: 'Recycle quiz', play: 'Play', shapes: /simplified by type/, finish: 'Done, score it', showOps: "Show Ops's packing",
    pct: "100% of Ops's packing", unlock: 'New paint Field Olive, Rust Bucket, Gold Plated! Shall we try it in the wardrobe?', rotate: 'Rotate (R)', next: 'Next question', score: '9 of 10 correct',
    unlockQuiz: 'New paint Field Olive, Arctic! Shall we try it in the wardrobe?', arctic: 'Arctic', night: 'Night Watch', original: 'Original', wrong: /^Not quite\. The answer is:/, correct: 'Correct!', wardrobe: 'Ops wardrobe' },
};

const HT = {
  cs: { name: 'Opsův hack', unlock: 'Nový nátěr Polní oliva, Uplink! Zkusíme ho v šatníku?', uplink: 'Uplink' },
  en: { name: 'Ops hack', unlock: 'New paint Field Olive, Uplink! Shall we try it in the wardrobe?', uplink: 'Uplink' },
};

for (const lang of ['cs', 'en'] as const) {
  const L = T[lang];
  const H = HT[lang];

  test(`Stash Tetris: myš, klávesnice, otočení, výsledek proti Opsovi a odemčené nátěry (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.locator('.sidebar a.nav-item[href="#games"]').click();
    await expect(page.getByRole('heading', { level: 1, name: L.nav })).toBeVisible();
    await expect(page).toHaveTitle(`${L.nav} · ARC OPS`);
    /* hra se spustí jen na kliknutí; dostane číslo kola v adrese */
    await page.getByTestId('games-play-tetris').click();
    await expect(page).toHaveURL(/#games\/tetris-\d+$/);
    await page.goto(`/#games/tetris-${SEED}`);
    await expect(page.getByRole('heading', { level: 1, name: L.tetris })).toBeVisible();
    await expect(page.getByTestId('games-shapes-note')).toHaveText(L.shapes);

    const round = makeRound(SEED);
    const g = greedy(round);
    const cell = (x: number, y: number) => page.locator(`[data-testid="games-bag"] [data-cell="${y * round.cols + x}"]`);
    const item = (name: string) => page.locator(`.mg-loot-item[data-item="${esc(name)}"]`);

    /* klávesnice: první předmět Opsova balení vybrat Enterem, šipkami na místo, Enter položí */
    const [first, ...rest] = g.placements;
    const firstItem = round.items.find(i => i.id === first.id)!;
    await item(firstItem.name).focus();
    await page.keyboard.press('Enter');
    await expect(item(firstItem.name)).toHaveAttribute('aria-pressed', 'true');
    await cell(0, 0).focus();
    for (let i = 0; i < first.x; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < first.y; i++) await page.keyboard.press('ArrowDown');
    if (first.rot) await page.keyboard.press('r');
    await page.keyboard.press('Enter');
    await expect(page.locator(`.mg-item[data-item="${esc(firstItem.name)}"]`)).toBeVisible();

    /* otočení: 1×2 předmět v ruce se otočí na 2×1 klávesou R i tlačítkem; Esc ho pustí */
    const med = round.items.find(i => i.shape === 'medium')!;
    await item(med.name).click();
    await expect(page.getByTestId('games-selected')).toContainText('(1×2)');
    await page.keyboard.press('r');
    await expect(page.getByTestId('games-selected')).toContainText('(2×1)');
    await page.getByRole('button', { name: L.rotate }).click();
    await expect(page.getByTestId('games-selected')).toContainText('(1×2)');
    await page.keyboard.press('Escape');
    await expect(item(med.name)).toHaveAttribute('aria-pressed', 'false');

    /* náhled místa: přes okraj nebo přes jiný předmět je špatně */
    await item(med.name).click();
    await cell(first.x, first.y).hover();
    await expect(page.getByTestId('games-ghost')).toHaveAttribute('data-ok', 'no');
    await page.keyboard.press('Escape');

    /* myš: zbytek Opsova balení (pravé tlačítko otočí) */
    for (const p of rest) {
      const it = round.items.find(i => i.id === p.id)!;
      await item(it.name).click();
      if (p.rot) await cell(p.x, p.y).click({ button: 'right' });
      await cell(p.x, p.y).click();
    }
    await expect(page.getByTestId('games-score')).toContainText(tl(lang, 'games.t.valueOf', { value: g.score }));

    /* vyndat a vrátit: klik na položený předmět ho vezme do ruky */
    await cell(first.x, first.y).click();
    await expect(page.getByTestId('games-selected')).toContainText(firstItem.name);
    await expect(page.getByTestId('games-score')).toContainText(tl(lang, 'games.t.valueOf', { value: g.score - firstItem.value }));
    await cell(first.x, first.y).click();
    await expect(page.getByTestId('games-score')).toContainText(tl(lang, 'games.t.valueOf', { value: g.score }));

    await page.getByRole('button', { name: L.finish }).click();
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.t.resultLine', { you: g.score, ops: g.score }));
    await expect(page.getByTestId('games-pct')).toHaveText(L.pct);
    await expect(page.getByTestId('games-tips').locator('li').first()).toBeVisible();
    await page.getByRole('button', { name: L.showOps }).click();
    await expect(page.getByTestId('games-ops-bag').locator('.mg-item')).toHaveCount(g.placements.length);
    /* Ops zareaguje na odemčení (Kamarádský, první varianta) a v aktivním okně pípne */
    await expect(page.getByTestId('games-ops').getByTestId('ops-line')).toHaveText(L.unlock);
    await expect.poll(() => soundLog(page)).toContain('unlock');

    await expect.poll(async () => (await stateOf(page))?.games?.tetris.played).toBe(1);
    const st = await stateOf(page);
    expect(st.schema).toBe(15);
    expect(st.games.tetris).toEqual({ played: 1, best: g.score, bestPct: 100 });
    expect(st.games.paints).toEqual(['olive', 'rust', 'gold']);
    expect(st.games.paint).toBe('original');
    /* herní data se nezměnila */
    expect(st.profile.level).toBe(20);
    expect(st.inventory).toEqual({ 'Metal Parts': 5 });

    /* rozcestník ukazuje rekord a odemčené nátěry */
    await page.getByTestId('games-back').click();
    await expect(page.getByTestId('games-paints').locator('li[data-unlocked="yes"]')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test(`Recyklační kvíz: vysvětlení, klávesy, výsledek a nátěr v šatníku (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto('/#games');
    await page.getByTestId('games-play-quiz').click();
    await expect(page).toHaveURL(/#games\/quiz-\d+$/);
    await page.goto(`/#games/quiz-${SEED}`);
    await expect(page.getByRole('heading', { level: 1, name: L.quiz })).toBeVisible();
    const quiz = makeQuiz(SEED, lang);
    expect(quiz.questions).toHaveLength(10);
    for (const [i, q] of quiz.questions.entries()) {
      await expect(page.getByTestId('games-question')).toHaveText(tl(lang, q.prompt.key, q.prompt.params));
      if (i === 0) {
        /* první otázka špatně (myší) */
        const bad = q.options.find(o => o.id !== q.answer)!;
        await page.locator(`.mg-option[data-option="${bad.id}"]`).click();
        await expect(page.getByTestId('games-explain').locator('b')).toHaveText(L.wrong);
      } else if (i === 1) {
        /* druhá klávesou 1–4 */
        await page.keyboard.press(String(q.options.findIndex(o => o.id === q.answer) + 1));
        await expect(page.getByTestId('games-explain').locator('b')).toHaveText(L.correct);
      } else {
        await page.locator(`.mg-option[data-option="${q.answer}"]`).click();
        await expect(page.getByTestId('games-explain').locator('b')).toHaveText(L.correct);
      }
      await expect(page.getByTestId('games-explain').locator('p')).toHaveText(tl(lang, q.explain.key, q.explain.params));
      await expect(page.locator(`.mg-option[data-option="${q.answer}"]`)).toHaveAttribute('data-correct', 'yes');
      await page.getByTestId('games-next').click();
    }
    await expect(page.getByTestId('games-result')).toHaveText(L.score);
    await expect(page.getByTestId('games-ops').getByTestId('ops-line')).toHaveText(L.unlockQuiz);
    await expect.poll(async () => (await stateOf(page))?.games?.quiz.played).toBe(1);
    const st = await stateOf(page);
    expect(st.games.quiz).toEqual({ played: 1, best: 9, streak: 9, bestStreak: 9 });
    expect(st.games.paints).toEqual(['olive', 'arctic']);

    /* šatník: odemčený nátěr jde vybrat, zamčený ne; plechy se přebarví, meruňkový lem zůstane */
    await page.goto('/#games');
    await page.getByRole('link', { name: L.wardrobe }).first().click();
    await expect(page).toHaveURL(/#settings\/wardrobe$/);
    const picker = page.getByTestId('ops-paints');
    await expect(picker.getByRole('radio', { name: L.original })).toHaveAttribute('aria-checked', 'true');
    await expect(picker.getByRole('radio', { name: L.night })).toBeDisabled();
    const preview = '.ops-preview canvas';
    await expect.poll(async () => (await canvasColors(page, preview)).includes('#1D2225')).toBe(true);
    await picker.getByRole('radio', { name: L.arctic }).click();
    await expect(picker.getByRole('radio', { name: L.arctic })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(preview)).toHaveAttribute('data-paint', 'arctic');
    await expect.poll(async () => (await canvasColors(page, preview)).includes('#3B4650')).toBe(true);
    const colors = await canvasColors(page, preview);
    expect(colors).toContain('#F4AD82');
    expect(colors).not.toContain('#1D2225');
    await expect.poll(async () => (await stateOf(page))?.games?.paint).toBe('arctic');

    /* po načtení zůstane; zpět na původní */
    await page.reload();
    await expect(page.getByTestId('ops-paints').getByRole('radio', { name: L.arctic })).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('ops-paints').getByRole('radio', { name: L.original }).click();
    await expect.poll(async () => (await stateOf(page))?.games?.paint).toBe('original');
    expect(errors).toEqual([]);
  });
  test(`Opsův hack: klávesnice i myš, tři uzly, výsledek proti normě a nátěry (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto('/#games');
    await expect(page.getByTestId('games-hack-stats')).toBeVisible();
    await page.getByTestId('games-play-hack').click();
    await expect(page).toHaveURL(/#games\/hack-\d+$/);
    await page.goto(`/#games/hack-${SEED}`);
    await expect(page.getByRole('heading', { level: 1, name: H.name })).toBeVisible();
    await expect(page).toHaveTitle(`${L.nav} · ARC OPS`);
    /* Ops ohlásí terminál (Kamarádský; varianty se střídají, kolo se v testu otevřelo dvakrát) */
    const opsLine = page.getByTestId('games-ops').getByTestId('ops-line');
    const saidOneOf = async (key: 'game.hackStart' | 'game.hackNode') => {
      await expect.poll(async () => (OPS_LINES[lang][key].friendly as string[]).includes((await opsLine.textContent()) ?? '')).toBe(true);
    };
    await saidOneOf('game.hackStart');

    const round = makeHack(SEED);
    const cell = (i: number) => page.locator(`[data-testid="games-hack-grid"] [data-cell="${i}"]`);
    let moves = 0;
    for (const [k, node] of round.nodes.entries()) {
      await expect(page.getByTestId('games-hack-grid')).toHaveAttribute('data-node', String(k));
      await expect(page.getByTestId('games-hack-grid').locator('[data-cell]')).toHaveCount(node.cols * node.rows);
      await expect(page.getByTestId('games-hack-cracked')).toHaveCount(0);
      /* plán: každá dlaždice kratší cestou do polohy řešení; uzel může skončit dřív (jiné platné řešení) */
      let rot = [...node.start];
      const plan: { i: number; dir: 1 | -1 }[] = [];
      node.solution.forEach((m, i) => {
        let cw = 0; while (rotateMask(m, rot[i] + cw) !== m) cw++;
        let ccw = 0; while (rotateMask(m, rot[i] - ccw) !== m) ccw++;
        const dir: 1 | -1 = cw <= ccw ? 1 : -1;
        for (let n = 0; n < Math.min(cw, ccw); n++) plan.push({ i, dir });
      });
      const steps: typeof plan = [];
      for (const st of plan) {
        if (isSolved(node, rot)) break;
        rot = rotateAt(rot, st.i, st.dir);
        steps.push(st);
      }
      expect(isSolved(node, rot)).toBe(true);
      if (k === 0) {
        /* první uzel klávesnicí: šipky přesouvají, Enter po směru, Q proti směru */
        await cell(0).focus();
        await page.keyboard.press('ArrowRight');
        await expect(cell(1)).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(cell(1 + node.cols)).toBeFocused();
        for (const st of steps) {
          await cell(st.i).focus();
          await page.keyboard.press(st.dir === 1 ? 'Enter' : 'q');
        }
      } else {
        /* další uzly myší: klik po směru, pravé tlačítko proti směru */
        for (const st of steps) await cell(st.i).click(st.dir === 1 ? undefined : { button: 'right' });
      }
      moves += steps.length;
      await expect(page.getByTestId('games-hack-grid').locator('[data-powered="no"]')).toHaveCount(0);
      await expect(page.getByTestId('games-hack-status')).toContainText(tl(lang, 'games.h.noLeaks'));
      if (k + 1 < round.nodes.length) {
        await expect(page.getByTestId('games-hack-cracked').locator('b')).toHaveText(tl(lang, 'games.h.cracked', { n: k + 1 }));
        await saidOneOf('game.hackNode');
        await expect(page.getByTestId('games-hack-next')).toBeFocused();
        /* vyřešený uzel se už neotáčí (dlaždice jsou aria-disabled, proto vynucený klik) */
        const before = await cell(0).getAttribute('data-rot');
        await cell(0).click({ force: true });
        await expect(cell(0)).toHaveAttribute('data-rot', before!);
        await page.getByTestId('games-hack-next').focus();
        await page.keyboard.press('Enter');
      }
    }
    const par = round.nodes.reduce((s, n) => s + n.par, 0);
    expect(moves).toBeLessThanOrEqual(par);
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.h.resultLine', { moves, par }));
    await expect(page.getByTestId('games-pct')).toHaveText(tl(lang, 'games.h.pctOfPar', { pct: 100 }));
    /* první kolo na normu: Polní oliva a Uplink */
    await expect(page.getByTestId('games-ops').getByTestId('ops-line')).toHaveText(H.unlock);
    await expect.poll(() => soundLog(page)).toContain('beep');
    await expect.poll(() => soundLog(page)).toContain('unlock');
    await expect.poll(async () => (await stateOf(page))?.games?.hack.played).toBe(1);
    const st = await stateOf(page);
    expect(st.schema).toBe(15);
    expect(st.games.hack).toEqual({ played: 1, bestPct: 100, perfect: 1 });
    expect(st.games.paints).toEqual(['olive', 'uplink']);
    expect(st.inventory).toEqual({ 'Metal Parts': 5 });
    expect(st.profile.level).toBe(20);

    await page.getByTestId('games-back').click();
    await expect(page.getByTestId('games-hack-stats')).toContainText(tl(lang, 'games.pct', { pct: 100 }));
    await expect(page.getByTestId('games-paints').locator('li[data-unlocked="yes"]')).toHaveCount(3);
    await expect(page.getByTestId('games-paints').locator('li[data-paint="uplink"]')).toContainText(H.uplink);
    await expect(page.getByTestId('games-paints').locator('li[data-paint="circuit"]')).toHaveAttribute('data-unlocked', 'no');
    expect(errors).toEqual([]);
  });

  test(`Recyklační kvíz: odchod uprostřed kola zachová sérii, rekord kola ne (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto(`/#games/quiz-${SEED}`);
    const quiz = makeQuiz(SEED, lang);
    await expect(page.getByTestId('games-streak-note')).toBeVisible();
    for (const q of quiz.questions.slice(0, 3)) {
      await expect(page.getByTestId('games-question')).toHaveText(tl(lang, q.prompt.key, q.prompt.params));
      await page.locator(`.mg-option[data-option="${q.answer}"]`).click();
      await page.getByTestId('games-next').click();
    }
    await expect(page.getByTestId('games-quiz-score')).toContainText(tl(lang, 'games.q.streak', { count: 3 }));
    await page.getByTestId('games-back').click();
    await expect.poll(async () => (await stateOf(page))?.games?.quiz.streak).toBe(3);
    await page.reload();
    const st = await stateOf(page);
    expect(st.games.quiz).toEqual({ played: 0, best: 0, streak: 3, bestStreak: 3 });
    await expect(page.getByTestId('games-quiz-stats')).toContainText('3');
    expect(errors).toEqual([]);
  });
}
