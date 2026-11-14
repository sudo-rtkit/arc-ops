/* 0.13.0: rozehraná kola miniher. Každá hra: odchod z kola a načtení stránky znovu (jako restart aplikace),
   pokračování z rozcestníku přesně tam, kde hráč skončil, dohrání jen jednou (návrat do dohraného kola odměny
   nepřipíše). Nové kolo s potvrzením (klávesnice i myš), jiné kolo v adrese se zeptá, vadné uložené kolo se
   bezpečně zahodí bez ztráty rekordů a nátěrů. */
import { expect, test, type Page } from '@playwright/test';
import { greedy, makeRound } from '../../src/core/stashTetris';
import { makeQuiz } from '../../src/core/recycleQuiz';
import { isSolved, makeHack, rotateAt, rotateMask, type HackNode } from '../../src/core/opsHack';
import { hackSig } from '../../src/core/gameRounds';
/* 0.25.0: aplikace načítá slovníky po jazycích; test počítá očekávané texty v Node s oběma slovníky */
import '../setup-i18n';
import { tl } from '../../src/i18n';

const SEED = 4242;
const esc = (s: string) => s.replace(/["\\]/g, '\\$&');
const stateOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('arcops:state') || 'null'));
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
async function start(page: Page, lang: 'cs' | 'en', extra: Record<string, unknown> = {}) {
  await page.addInitScript(st => {
    if (sessionStorage.getItem('mg-seeded')) return;
    sessionStorage.setItem('mg-seeded', '1');
    localStorage.clear();
    localStorage.setItem('arcops:state', st);
  }, JSON.stringify({ schema: 11, profile: { level: 20 }, inventory: { 'Metal Parts': 5 }, settings: { autoSnapshot: false, lang }, ...extra }));
  await page.goto('/');
}
/* tahy, které uzel vyřeší (každá dlaždice kratší cestou; uzel může skončit dřív) */
function solveSteps(node: HackNode, from: number[]): { i: number; dir: 1 | -1 }[] {
  let rot = [...from];
  const plan: { i: number; dir: 1 | -1 }[] = [];
  node.solution.forEach((m, i) => {
    let cw = 0; while (rotateMask(m, rot[i] + cw) !== m) cw++;
    let ccw = 0; while (rotateMask(m, rot[i] - ccw) !== m) ccw++;
    for (let n = 0; n < Math.min(cw, ccw); n++) plan.push({ i, dir: cw <= ccw ? 1 : -1 });
  });
  const steps: typeof plan = [];
  for (const st of plan) {
    if (isSolved(node, rot)) break;
    rot = rotateAt(rot, st.i, st.dir);
    steps.push(st);
  }
  return steps;
}

for (const lang of ['cs', 'en'] as const) {
  test(`Stash Tetris: odchod a restart uprostřed kola, pokračování, dohrání jen jednou (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto(`/#games/tetris-${SEED}`);
    const round = makeRound(SEED);
    const g = greedy(round);
    const cell = (x: number, y: number) => page.locator(`[data-testid="games-bag"] [data-cell="${y * round.cols + x}"]`);
    const item = (name: string) => page.locator(`.mg-loot-item[data-item="${esc(name)}"]`);
    /* pouhé otevření kolo nerozehraje */
    await expect(page.getByTestId('games-autosave')).toBeVisible();
    await page.getByTestId('games-back').click();
    await expect(page.getByTestId('games-play-tetris')).toBeVisible();
    await page.goto(`/#games/tetris-${SEED}`);

    /* dva předměty do batohu (i s otočením), třetí v ruce otočený */
    const placed = g.placements.slice(0, 2);
    for (const p of placed) {
      const it = round.items.find(i => i.id === p.id)!;
      await item(it.name).click();
      if (p.rot) await page.keyboard.press('r');
      await cell(p.x, p.y).click();
    }
    const med = round.items.find(i => i.shape === 'medium' && !placed.some(p => p.id === i.id))!;
    await item(med.name).click();
    await page.keyboard.press('r');
    await expect(page.getByTestId('games-selected')).toContainText('(2×1)');
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.tetris?.held?.rot).toBe(true);

    /* odchod do rozcestníku: rozehrané kolo s průběhem a volbou Pokračovat / Nové kolo */
    await page.getByTestId('games-back').click();
    await expect(page.getByTestId('games-saved-tetris')).toHaveAttribute('data-seed', String(SEED));
    await expect(page.getByTestId('games-saved-tetris-progress')).toHaveText(tl(lang, 'games.saved.tetris', { count: 2 }));
    await expect(page.getByTestId('games-play-tetris')).toHaveCount(0);

    /* restart aplikace */
    await page.reload();
    await page.goto('/#games');
    await page.getByTestId('games-continue-tetris').click();
    await expect(page).toHaveURL(new RegExp(`#games/tetris-${SEED}$`));
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'resumed');
    await expect(page.getByTestId('games-resume')).toHaveText(tl(lang, 'games.resume.resumed'));
    for (const p of placed) {
      const it = round.items.find(i => i.id === p.id)!;
      await expect(page.locator(`[data-testid="games-bag"] .mg-item[data-item="${esc(it.name)}"]`)).toBeVisible();
      await expect(item(it.name)).toHaveClass(/packed/);
    }
    await expect(page.getByTestId('games-selected')).toContainText(med.name);
    await expect(page.getByTestId('games-selected')).toContainText('(2×1)');
    await expect(item(med.name)).toHaveAttribute('aria-pressed', 'true');
    const value = placed.reduce((s, p) => s + round.items.find(i => i.id === p.id)!.value, 0);
    await expect(page.getByTestId('games-score')).toContainText(tl(lang, 'games.t.valueOf', { value }));

    /* dohrát: odměna jednou */
    await page.keyboard.press('Escape');
    await page.getByTestId('games-finish').click();
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.t.resultLine', { you: value, ops: g.score }));
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.tetris?.status).toBe('done');
    expect((await stateOf(page)).games.tetris.played).toBe(1);

    /* návrat do dohraného kola (i po restartu) jen ukáže výsledek */
    await page.goto('/#games');
    await expect(page.getByTestId('games-play-tetris')).toBeVisible();
    await page.reload();
    await page.goto(`/#games/tetris-${SEED}`);
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'doneBefore');
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.t.resultLine', { you: value, ops: g.score }));
    await expect(page.getByTestId('games-finish')).toHaveCount(0);
    await page.waitForTimeout(300);
    const st = await stateOf(page);
    expect(st.schema).toBe(19);
    expect(st.games.tetris).toEqual({ played: 1, best: value, bestPct: Math.floor(value * 100 / g.score) });
    expect(st.inventory).toEqual({ 'Metal Parts': 5 });

    /* hrát stejné kolo znovu: prázdný batoh, rekordy zůstanou */
    await page.getByTestId('games-replay').click();
    await expect(page.getByTestId('games-finish')).toBeVisible();
    await expect(page.locator('[data-testid="games-bag"] .mg-item')).toHaveCount(0);
    await expect(page.getByTestId('games-resume')).toHaveCount(0);
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.tetris).toBeNull();
    expect((await stateOf(page)).games.tetris.played).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`Recyklační kvíz: restart po odpovědi, pokračování bez druhého započtení, dohrání jednou (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto(`/#games/quiz-${SEED}`);
    const quiz = makeQuiz(SEED, lang);
    const qs = quiz.questions;
    /* 1. špatně, 2.–3. správně; 4. správně, ale bez „Další otázka“ */
    for (const [i, q] of qs.slice(0, 4).entries()) {
      await expect(page.getByTestId('games-question')).toHaveText(tl(lang, q.prompt.key, q.prompt.params));
      const id = i === 0 ? q.options.find(o => o.id !== q.answer)!.id : q.answer;
      await page.locator(`.mg-option[data-option="${id}"]`).click();
      if (i < 3) await page.getByTestId('games-next').click();
    }
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.quiz).toMatchObject({ index: 3, picked: qs[3].answer, correct: 3, status: 'active' });
    expect((await stateOf(page)).games.quiz).toEqual({ played: 0, best: 0, streak: 3, bestStreak: 3 });

    await page.goto('/#dashboard');
    await page.reload();
    await page.goto('/#games');
    await expect(page.getByTestId('games-saved-quiz-progress')).toHaveText(tl(lang, 'games.saved.quiz', { n: 4, total: 10, correct: 3 }));
    /* klávesnice: Tab na Pokračovat a Enter */
    await page.getByTestId('games-continue-quiz').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#games/quiz-${SEED}$`));
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'resumed');
    await expect(page.getByTestId('games-question')).toHaveText(tl(lang, qs[3].prompt.key, qs[3].prompt.params));
    await expect(page.getByTestId('games-explain').locator('p')).toHaveText(tl(lang, qs[3].explain.key, qs[3].explain.params));
    await expect(page.locator('.mg-option').first()).toBeDisabled();
    await expect(page.getByTestId('games-quiz-score')).toContainText(tl(lang, 'games.q.of', { n: 3, total: 10 }));
    /* klávesy 1–4 už zodpovězenou otázku nezmění a série se podruhé nepřičte */
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.waitForTimeout(200);
    expect((await stateOf(page)).games.quiz.streak).toBe(3);

    await page.getByTestId('games-next').click();
    for (const q of qs.slice(4)) {
      await expect(page.getByTestId('games-question')).toHaveText(tl(lang, q.prompt.key, q.prompt.params));
      await page.keyboard.press(String(q.options.findIndex(o => o.id === q.answer) + 1));
      await page.getByTestId('games-next').click();
    }
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.q.score', { n: 9, total: 10 }));
    await expect.poll(async () => (await stateOf(page))?.games?.quiz).toEqual({ played: 1, best: 9, streak: 9, bestStreak: 9 });

    /* dohrané kolo po restartu jen ukáže výsledek */
    await page.reload();
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'doneBefore');
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.q.score', { n: 9, total: 10 }));
    await page.waitForTimeout(300);
    expect((await stateOf(page)).games.quiz).toEqual({ played: 1, best: 9, streak: 9, bestStreak: 9 });
    expect(errors).toEqual([]);
  });

  test(`Opsův hack: restart ve druhém uzlu, pokračování s otočením a tahy, dohrání jednou (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, lang);
    await page.goto(`/#games/hack-${SEED}`);
    const round = makeHack(SEED);
    const cell = (i: number) => page.locator(`[data-testid="games-hack-grid"] [data-cell="${i}"]`);
    const s0 = solveSteps(round.nodes[0], round.nodes[0].start);
    for (const st of s0) await cell(st.i).click(st.dir === 1 ? undefined : { button: 'right' });
    await expect(page.getByTestId('games-hack-cracked')).toBeVisible();
    /* restart s vyřešeným uzlem: pokračuje se tlačítkem Další uzel */
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.hack?.moves).toBe(s0.length);
    await page.reload();
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'resumed');
    await expect(page.getByTestId('games-hack-cracked')).toBeVisible();
    await page.getByTestId('games-hack-next').click();
    await expect(page.getByTestId('games-hack-grid')).toHaveAttribute('data-node', '1');

    /* dva tahy ve druhém uzlu (klávesnicí), pak odchod a restart */
    const n1 = round.nodes[1];
    const s1 = solveSteps(n1, n1.start);
    const firstTwo = s1.slice(0, 2);
    for (const st of firstTwo) { await cell(st.i).focus(); await page.keyboard.press(st.dir === 1 ? 'Enter' : 'q'); }
    let rot = [...n1.start];
    for (const st of firstTwo) rot = rotateAt(rot, st.i, st.dir);
    const moves = s0.length + firstTwo.length;
    await expect.poll(async () => (await stateOf(page))?.gameRounds?.hack).toEqual({ seed: SEED, status: 'active', sig: hackSig(round), node: 1, rot, moves });
    await page.getByTestId('games-back').click();
    await page.reload();
    await expect(page.getByTestId('games-saved-hack-progress')).toHaveText(tl(lang, 'games.saved.hack', { n: 2, total: 3, moves }));
    await page.getByTestId('games-continue-hack').click();
    await expect(page.getByTestId('games-hack-grid')).toHaveAttribute('data-node', '1');
    for (const [i, r] of rot.entries()) await expect(cell(i)).toHaveAttribute('data-rot', String(r));
    await expect(page.getByTestId('games-hack-moves')).toHaveText(tl(lang, 'games.h.moves', { moves, par: round.nodes[0].par + n1.par }));

    /* dohrát zbytek */
    for (const st of solveSteps(n1, rot)) await cell(st.i).click(st.dir === 1 ? undefined : { button: 'right' });
    await page.getByTestId('games-hack-next').click();
    const n2 = round.nodes[2];
    const s2 = solveSteps(n2, n2.start);
    for (const st of s2) await cell(st.i).click(st.dir === 1 ? undefined : { button: 'right' });
    await expect(page.getByTestId('games-result')).toBeVisible();
    await expect.poll(async () => (await stateOf(page))?.games?.hack?.played).toBe(1);
    const total = (await stateOf(page)).gameRounds.hack.moves;

    await page.reload();
    await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'doneBefore');
    const par = round.nodes.reduce((s, n) => s + n.par, 0);
    await expect(page.getByTestId('games-result')).toHaveText(tl(lang, 'games.h.resultLine', { moves: total, par }));
    /* dlaždice dohraného kola se neotáčí */
    await page.waitForTimeout(300);
    const st = await stateOf(page);
    expect(st.games.hack.played).toBe(1);
    expect(st.profile.level).toBe(20);
    expect(errors).toEqual([]);
  });
}

test('Nové kolo s potvrzením a jiné kolo v adrese: zahodí jen vybranou hru, rekordy a nátěry zůstanou', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, 'cs', { games: { quiz: { played: 2, best: 8, streak: 4, bestStreak: 6 }, paints: ['olive'], paint: 'olive' } });
  /* rozehrát kvíz i hack */
  await page.goto(`/#games/quiz-${SEED}`);
  const q0 = makeQuiz(SEED, 'cs').questions[0];
  await page.locator(`.mg-option[data-option="${q0.answer}"]`).click();
  await page.goto(`/#games/hack-${SEED}`);
  await page.locator('[data-testid="games-hack-grid"] [data-cell="0"]').click();
  await expect.poll(async () => (await stateOf(page))?.gameRounds?.hack?.moves).toBe(1);

  /* Nové kolo: dotaz; Esc ho zavře a fokus se vrátí na Nové kolo */
  await page.goto('/#games');
  await page.getByTestId('games-new-quiz').click();
  await expect(page.getByTestId('games-confirm-quiz')).toContainText(tl('cs', 'games.discard.ask', { seed: String(SEED) }));
  await expect(page.getByTestId('games-cancel-quiz')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('games-confirm-quiz')).toHaveCount(0);
  await expect(page.getByTestId('games-new-quiz')).toBeFocused();
  await page.getByTestId('games-new-quiz').click();
  await page.getByTestId('games-cancel-quiz').click();
  await expect(page.getByTestId('games-saved-quiz')).toBeVisible();
  /* potvrzení: nové číslo kola, staré kolo kvízu zahozené, hack a záznamy beze změny */
  const before = (await stateOf(page)).games;
  await page.getByTestId('games-new-quiz').click();
  await page.getByTestId('games-discard-quiz').click();
  await expect(page).toHaveURL(/#games\/quiz-\d+$/);
  expect(page.url()).not.toMatch(new RegExp(`quiz-${SEED}$`));
  await expect.poll(async () => (await stateOf(page))?.gameRounds?.quiz).toBeNull();
  let st = await stateOf(page);
  expect(st.gameRounds.hack).toMatchObject({ seed: SEED, moves: 1 });
  expect(st.games.quiz).toEqual({ played: 2, best: 8, streak: 5, bestStreak: 6 });
  expect(st.games).toEqual(before);
  expect(st.games.paints).toContain('olive');
  expect(st.games.paint).toBe('olive');

  /* jiné kolo hacku v adrese (sdílené číslo): dotaz, Pokračovat vede na rozehrané kolo */
  await page.goto('/#games/hack-777');
  await expect(page.getByTestId('games-conflict')).toHaveAttribute('data-seed', String(SEED));
  await expect(page.getByTestId('games-hack-grid')).toHaveCount(0);
  await page.getByTestId('games-conflict-continue').click();
  await expect(page).toHaveURL(new RegExp(`#games/hack-${SEED}$`));
  await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'resumed');
  /* znovu jiné kolo: zahodit a hrát ho */
  await page.goto('/#games/hack-777');
  await page.getByTestId('games-conflict-discard').click();
  await expect(page.getByTestId('games-hack')).toHaveAttribute('data-seed', '777');
  await expect(page.getByTestId('games-resume')).toHaveCount(0);
  await expect.poll(async () => (await stateOf(page))?.gameRounds?.hack).toBeNull();
  st = await stateOf(page);
  expect(st.games.quiz.streak).toBe(5);
  expect(errors).toEqual([]);
});

test('Vadné a nekompatibilní uložené kolo se bezpečně zahodí; ostatní data zůstanou (en)', async ({ page }) => {
  const errors = watchErrors(page);
  const round = makeHack(SEED);
  await start(page, 'en', {
    schema: 12,
    games: { tetris: { played: 3, best: 9000, bestPct: 80 }, paints: ['olive', 'rust'], paint: 'rust' },
    gameRounds: {
      tetris: { seed: SEED, status: 'active', sig: 'zz', placements: 'garbage' },
      /* platný tvar, ale otisk jiného kola (např. po změně dat aplikace) */
      hack: { seed: SEED, status: 'active', sig: 'deadbeef', node: 0, rot: round.nodes[0].start, moves: 3 },
      quiz: { seed: SEED, status: 'active', sig: '00000000', lang: 'en', index: 99, picked: null, correct: 0 },
    },
  });
  await page.goto('/#games');
  await expect(page.getByTestId('games-play-tetris')).toBeVisible();
  await expect(page.getByTestId('games-play-quiz')).toBeVisible();
  await expect(page.getByTestId('games-saved-hack')).toBeVisible();
  await page.getByTestId('games-continue-hack').click();
  await expect(page.getByTestId('games-resume')).toHaveAttribute('data-kind', 'invalid');
  await expect(page.getByTestId('games-resume')).toHaveText(tl('en', 'games.resume.invalid'));
  await expect(page.getByTestId('games-hack-moves')).toHaveText(tl('en', 'games.h.moves', { moves: 0, par: round.nodes[0].par }));
  await expect.poll(async () => (await stateOf(page))?.gameRounds?.hack ?? null).toBeNull();
  const st = await stateOf(page);
  expect(st.games.tetris).toEqual({ played: 3, best: 9000, bestPct: 80 });
  expect(st.games.paint).toBe('rust');
  expect(st.inventory).toEqual({ 'Metal Parts': 5 });
  expect(errors).toEqual([]);
});
