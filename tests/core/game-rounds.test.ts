/* 0.13.0 (schéma 12): rozehraná kola miniher. Normalizace a meze, obnovení proti skutečnému kolu, idempotence
   odměn (dohrání ani odpověď se nezapočítají dvakrát), restart aplikace, zahození jen jedné hry, migrace a záloha. */
import { describe, expect, it } from 'vitest';
import {
  MAX_PLACEMENTS, answerQuiz, emptyRounds, finishRound, hackSig, mergeRounds, normalizeRounds, normalizeSavedHack,
  normalizeSavedQuiz, normalizeSavedTetris, quizSig, restoreHack, restoreQuiz, restoreTetris, roundSummary, saveRound, sigOf, tetrisSig,
} from '../../src/core/gameRounds';
import { emptyGames } from '../../src/core/minigames';
import { greedy, makeRound } from '../../src/core/stashTetris';
import { makeQuiz } from '../../src/core/recycleQuiz';
import { isSolved, makeHack, rotateAt, rotateMask } from '../../src/core/opsHack';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { SavedHack, SavedQuiz, SavedTetris } from '../../src/core/types';

const NOW = new Date(2026, 10, 12, 18, 0).getTime();
const SEED = 4242;
async function makeApp(initial?: unknown, kv = memoryKV()) {
  if (initial !== undefined) kv.setItem('arcops:state', JSON.stringify(initial));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return { app, state: () => app.store.getState().state, kv };
}
const flush = () => new Promise(r => setTimeout(r, 10));

const tRound = makeRound(SEED);
const tGreedy = greedy(tRound);
const tetris = (over: Partial<SavedTetris> = {}): SavedTetris =>
  ({ seed: SEED, status: 'active', sig: tetrisSig(tRound), placements: tGreedy.placements.slice(0, 3), held: null, ...over });
const qRound = makeQuiz(SEED, 'cs');
const quiz = (over: Partial<SavedQuiz> = {}): SavedQuiz =>
  ({ seed: SEED, status: 'active', sig: quizSig(qRound), lang: 'cs', index: 2, picked: null, correct: 1, ...over });
const hRound = makeHack(SEED);
const hack = (over: Partial<SavedHack> = {}): SavedHack =>
  ({ seed: SEED, status: 'active', sig: hackSig(hRound), node: 0, rot: rotateAt(hRound.nodes[0].start, 0, 1), moves: 1, ...over });
/* otočení, při kterém je uzel vyřešený (poloha z řešení: 0 u každé dlaždice) */
const solvedRot = (k: number) => hRound.nodes[k].solution.map(() => 0);

describe('normalizace uloženého kola', () => {
  it('platné kolo projde beze změny, chybějící pole začnou prázdná', () => {
    expect(normalizeRounds(undefined)).toEqual(emptyRounds());
    expect(normalizeSavedTetris(tetris())).toEqual(tetris());
    expect(normalizeSavedTetris({ ...tetris(), held: undefined })).toEqual(tetris({ held: null }));
    expect(normalizeSavedQuiz(quiz({ picked: 'b', correct: 3 }))).toEqual(quiz({ picked: 'b', correct: 3 }));
    expect(normalizeSavedHack(hack())).toEqual(hack());
  });
  it('vadné nebo přerostlé kolo se zahodí celé (nic se nedomýšlí)', () => {
    const bad: [string, unknown][] = [
      ['seed 0', tetris({ seed: 0 })], ['seed přes mez', tetris({ seed: 1_000_000 })], ['seed text', { ...tetris(), seed: '4242' }],
      ['neznámý stav', { ...tetris(), status: 'paused' }], ['otisk', tetris({ sig: 'xyz' })],
      ['dvakrát stejný předmět', tetris({ placements: [{ id: 'i1', x: 0, y: 0, rot: false }, { id: 'i1', x: 2, y: 0, rot: false }] })],
      ['cizí id', tetris({ placements: [{ id: '__proto__', x: 0, y: 0, rot: false }] })],
      ['záporná souřadnice', tetris({ placements: [{ id: 'i1', x: -1, y: 0, rot: false }] })],
      ['desetinná souřadnice', tetris({ placements: [{ id: 'i1', x: 0.5, y: 0, rot: false }] })],
      ['otočení jako text', { ...tetris(), placements: [{ id: 'i1', x: 0, y: 0, rot: 'yes' }] }],
      ['příliš mnoho předmětů', tetris({ placements: Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => ({ id: 'i' + (i % 99), x: 0, y: 0, rot: false })) })],
      ['v ruce předmět z batohu', tetris({ held: { id: tGreedy.placements[0].id, rot: false } })],
      ['dohrané s předmětem v ruce', tetris({ status: 'done', held: { id: 'i13', rot: false } })],
    ];
    for (const [why, v] of bad) expect(normalizeSavedTetris(v), why).toBeNull();
    const badQ: [string, unknown][] = [
      ['otázka mimo kolo', quiz({ index: 10 })], ['odpověď e', quiz({ picked: 'e' })], ['víc správných než odpovědí', quiz({ index: 2, picked: null, correct: 3 })],
      ['jazyk', { ...quiz(), lang: 'de' }], ['dohrané bez odpovědi', quiz({ status: 'done', index: 9, picked: null })],
    ];
    for (const [why, v] of badQ) expect(normalizeSavedQuiz(v), why).toBeNull();
    const badH: [string, unknown][] = [
      ['otočení 4', hack({ rot: [4, ...hRound.nodes[0].start.slice(1)] })], ['prázdné otočení', hack({ rot: [] })],
      ['přerostlá mřížka', hack({ rot: Array(65).fill(0) })], ['uzel mimo', hack({ node: 9 })], ['záporné tahy', hack({ moves: -1 })],
    ];
    for (const [why, v] of badH) expect(normalizeSavedHack(v), why).toBeNull();
  });
  it('vadné kolo jedné hry nezničí ostatní kola ani rekordy, sérii a nátěry', () => {
    const s = normalize({
      schema: 12, profile: { level: 30 }, inventory: { Fabric: 4 },
      games: { quiz: { played: 3, best: 8, streak: 4, bestStreak: 6 }, paints: ['olive'], paint: 'olive' },
      gameRounds: { tetris: { ...tetris(), placements: 'nope' }, quiz: quiz(), hack: hack() },
    }, NOW);
    expect(s.gameRounds).toEqual({ tetris: null, quiz: quiz(), hack: hack() });
    expect(s.games.quiz).toEqual({ played: 3, best: 8, streak: 4, bestStreak: 6 });
    expect(s.games.paint).toBe('olive');
    expect(s.inventory).toEqual({ Fabric: 4 });
    expect(normalize({ schema: 12, gameRounds: 'garbage' }, NOW).gameRounds).toEqual(emptyRounds());
  });
});

describe('obnovení proti skutečnému kolu', () => {
  it('Tetris vrátí přesný batoh, otočení i předmět v ruce; přesah, překryv a jiné kolo odmítne', () => {
    const rotated = tGreedy.placements.find(p => p.rot) ?? tGreedy.placements[0];
    const held = tRound.items.find(i => !tGreedy.placements.some(p => p.id === i.id))!;
    const s = tetris({ placements: tGreedy.placements, held: { id: held.id, rot: true } });
    expect(restoreTetris(s, tRound)).toEqual({ placements: tGreedy.placements, held: { id: held.id, rot: true }, done: false });
    expect(restoreTetris(s, tRound)!.placements.find(p => p.id === rotated.id)!.rot).toBe(rotated.rot);
    const [a, b] = tGreedy.placements;
    expect(restoreTetris(tetris({ placements: [a, { ...b, x: a.x, y: a.y }] }), tRound)).toBeNull();
    const big = tRound.items.find(i => i.shape === 'large')!;
    expect(restoreTetris(tetris({ placements: [{ id: big.id, x: tRound.cols - 1, y: 0, rot: false }] }), tRound)).toBeNull();
    expect(restoreTetris(tetris({ placements: [{ id: 'i0', x: 30, y: 0, rot: false }] }), tRound)).toBeNull();
    expect(restoreTetris(tetris({ placements: [{ id: 'i99', x: 0, y: 0, rot: false }] }), tRound)).toBeNull();
    expect(restoreTetris(tetris(), makeRound(SEED + 1))).toBeNull();
    /* data aplikace se změnila (jiný otisk): kolo se nedá věrně obnovit */
    expect(restoreTetris(tetris({ sig: sigOf('jiná data') }), tRound)).toBeNull();
    expect(restoreTetris(null, tRound)).toBeNull();
  });
  it('kvíz vrátí otázku, zvolenou odpověď a skóre; nesmyslnou odpověď a dohrané kolo uprostřed odmítne', () => {
    expect(restoreQuiz(quiz({ picked: 'a', correct: 2 }), qRound)).toEqual({ index: 2, picked: 'a', correct: 2, done: false });
    const two = qRound.questions.findIndex(q => q.options.length === 2);
    if (two >= 0) expect(restoreQuiz(quiz({ index: two, picked: 'd', correct: 0 }), qRound)).toBeNull();
    expect(restoreQuiz(quiz({ status: 'done', index: 4, picked: 'a', correct: 2 }), qRound)).toBeNull();
    expect(restoreQuiz(quiz({ status: 'done', index: 9, picked: 'a', correct: 7 }), qRound)).toEqual({ index: 9, picked: 'a', correct: 7, done: true });
    /* jiný jazyk dává jiné názvy úkolů: otisk kola v češtině na anglické kolo nesedí, pokud se liší otázky */
    const en = makeQuiz(SEED, 'en');
    if (quizSig(en) !== quizSig(qRound)) expect(restoreQuiz(quiz(), en)).toBeNull();
  });
  it('hack vrátí uzel, otočení a tahy; vyřešený poslední uzel bez dohrání a nedořešené dohrané kolo odmítne', () => {
    expect(restoreHack(hack(), hRound, isSolved)).toEqual({ node: 0, rot: hack().rot, moves: 1, done: false });
    expect(restoreHack(hack({ node: 1, rot: hRound.nodes[0].start }), hRound, isSolved)).toBeNull();
    expect(restoreHack(hack({ node: 0, rot: solvedRot(0) }), hRound, isSolved)).not.toBeNull();
    expect(restoreHack(hack({ node: 2, rot: solvedRot(2), moves: 40 }), hRound, isSolved)).toBeNull();
    expect(restoreHack(hack({ node: 2, rot: solvedRot(2), moves: 40, status: 'done' }), hRound, isSolved)).toEqual({ node: 2, rot: solvedRot(2), moves: 40, done: true });
    expect(restoreHack(hack({ node: 2, rot: hRound.nodes[2].start, moves: 40, status: 'done' }), hRound, isSolved)).toBeNull();
    expect(restoreHack(hack(), makeHack(SEED + 1), isSolved)).toBeNull();
  });
});

describe('odměny se nezapočítají dvakrát', () => {
  it('dohrání: druhé dohrání stejného kola nic nepřipíše; dohrané kolo nejde přepsat průběžným uložením', () => {
    const g = emptyGames(), r = emptyRounds();
    const score = tGreedy.score;
    const done = tetris({ placements: tGreedy.placements, status: 'done' });
    expect(finishRound(g, r, { game: 'tetris', score, greedy: score }, done)).toMatchObject({ win: true, unlocked: ['olive', 'rust', 'gold'] });
    expect(finishRound(g, r, { game: 'tetris', score, greedy: score }, done)).toBeNull();
    expect(g.tetris).toEqual({ played: 1, best: score, bestPct: 100 });
    expect(saveRound(r, 'tetris', tetris())).toBe(false);
    expect(r.tetris!.status).toBe('done');
    /* jiné kolo dohrané kolo nahradí */
    expect(saveRound(r, 'tetris', tetris({ seed: SEED + 1 }))).toBe(true);
    expect(r.tetris).toMatchObject({ seed: SEED + 1, status: 'active' });
  });
  it('odpověď: už zodpovězená otázka ani starší otázka sérii znovu nezvýší', () => {
    const g = emptyGames(), r = emptyRounds();
    expect(answerQuiz(g, r, quiz({ index: 0, picked: 'a', correct: 1 }), true)).toEqual({ streak: 1, unlocked: [] });
    expect(answerQuiz(g, r, quiz({ index: 0, picked: 'b', correct: 1 }), true)).toBeNull();
    expect(saveRound(r, 'quiz', quiz({ index: 1, picked: null, correct: 1 }))).toBe(true);
    expect(answerQuiz(g, r, quiz({ index: 0, picked: 'a', correct: 1 }), true)).toBeNull();
    expect(answerQuiz(g, r, quiz({ index: 1, picked: 'c', correct: 2 }), true)).toEqual({ streak: 2, unlocked: [] });
    expect(answerQuiz(g, r, quiz({ index: 1, picked: null, correct: 2 }), true)).toBeNull();
    expect(g.quiz.streak).toBe(2);
    expect(finishRound(g, r, { game: 'quiz', correct: 8, total: 10 }, quiz({ index: 9, picked: 'a', correct: 8 }))).toMatchObject({ win: true });
    expect(answerQuiz(g, r, quiz({ index: 9, picked: 'a', correct: 8 }), true)).toBeNull();
    expect(g.quiz).toEqual({ played: 1, best: 8, streak: 2, bestStreak: 2 });
  });
  it('store: po restartu aplikace dohrané kolo nic nepřipíše a rozehrané pokračuje přesně', async () => {
    const { app, state, kv } = await makeApp({ schema: 11, profile: { level: 20 }, inventory: { 'Metal Parts': 5 } });
    expect(app.actions.saveRound('hack', hack())).toBe(true);
    expect(app.actions.saveRound('hack', hack())).toBe(false);
    const qa = app.actions.answerQuiz(quiz({ index: 0, picked: 'a', correct: 1 }), true);
    expect(qa).toEqual({ streak: 1, unlocked: [] });
    expect(app.actions.finishRound({ game: 'tetris', score: 100, greedy: 200 }, tetris({ status: 'done' }))).toMatchObject({ win: false });
    await flush();

    const again = await makeApp(undefined, kv);
    expect(again.state().gameRounds.hack).toEqual(hack());
    expect(again.state().gameRounds.quiz).toEqual(quiz({ index: 0, picked: 'a', correct: 1 }));
    expect(again.app.actions.answerQuiz(quiz({ index: 0, picked: 'a', correct: 1 }), true)).toBeNull();
    expect(again.app.actions.finishRound({ game: 'tetris', score: 100, greedy: 200 }, tetris({ status: 'done' }))).toBeNull();
    expect(again.state().games.tetris.played).toBe(1);
    expect(again.state().games.quiz).toEqual({ played: 0, best: 0, streak: 1, bestStreak: 1 });
    /* herní data se nemění */
    expect(again.state().inventory).toEqual({ 'Metal Parts': 5 });
    expect(again.state().profile.level).toBe(20);
    expect(state().schema).toBe(13);
  });
});

describe('nové kolo, reset a záloha', () => {
  it('zahození jen vybrané hry; rekordy, série a nátěry zůstanou; reset miniher smaže i kola', async () => {
    const { app, state } = await makeApp({ schema: 12, games: { quiz: { played: 2, best: 7, streak: 3, bestStreak: 5 }, paints: ['olive'], paint: 'olive' } });
    app.actions.saveRound('tetris', tetris());
    app.actions.saveRound('quiz', quiz());
    app.actions.saveRound('hack', hack());
    const before = structuredClone(state().games);
    expect(app.actions.discardRound('quiz')).toBe(true);
    expect(app.actions.discardRound('quiz')).toBe(false);
    expect(state().gameRounds).toEqual({ tetris: tetris(), quiz: null, hack: hack() });
    expect(state().games).toEqual(before);
    expect(roundSummary(state().gameRounds, 'tetris')).toEqual({ seed: SEED, params: { count: 3 } });
    expect(roundSummary(state().gameRounds, 'quiz')).toBeNull();
    expect(roundSummary(state().gameRounds, 'hack')).toEqual({ seed: SEED, params: { n: 1, moves: 1 } });
    expect(await app.actions.resetModule('games')).toBe(true);
    expect(state().gameRounds).toEqual(emptyRounds());
  });
  it('migrace: stav a záloha schématu 11 se načtou beze ztrát s prázdnými koly; záloha 12 nese kola; 14 je novější', () => {
    expect(SCHEMA).toBe(13);
    const games11 = { tetris: { played: 4, best: 31000, bestPct: 96 }, quiz: { played: 3, best: 9, streak: 5, bestStreak: 12 }, hack: { played: 2, bestPct: 90, perfect: 1 }, paints: ['olive', 'uplink'], paint: 'uplink' };
    const s = normalize({ schema: 11, profile: { level: 33 }, inventory: { Fabric: 9 }, games: games11 }, NOW);
    expect(s.schema).toBe(13);
    expect(s.gameRounds).toEqual(emptyRounds());
    expect(s.games).toEqual(games11);
    const p11 = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 11, exportedAt: 'x', state: { schema: 11, games: games11, inventory: { Fabric: 9 } } }), NOW);
    if ('error' in p11) throw new Error(p11.error);
    expect(p11.state.gameRounds).toEqual(emptyRounds());
    expect(p11.state.games).toEqual(games11);

    const st = defaultState(NOW);
    st.gameRounds = { tetris: tetris(), quiz: quiz({ picked: 'c', correct: 3 }), hack: hack() };
    const file = JSON.parse(makeBackup(st));
    expect(file.schema).toBe(13);
    const back = parseBackup(JSON.stringify(file), NOW);
    if ('error' in back) throw new Error(back.error);
    expect(back.state.gameRounds).toEqual(st.gameRounds);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 14, state: {} }), NOW)).toHaveProperty('error');
  });
  it('import zálohy: rozehrané kolo tohoto počítače má přednost, záloha doplní jen hry bez kola', async () => {
    const cur = { tetris: tetris({ status: 'done' }), quiz: null, hack: null };
    const next = { tetris: tetris(), quiz: quiz(), hack: null };
    expect(mergeRounds(cur, next)).toEqual({ tetris: tetris({ status: 'done' }), quiz: quiz(), hack: null });

    const { app, state } = await makeApp({ schema: 12 });
    app.actions.finishRound({ game: 'tetris', score: 10, greedy: 10 }, tetris({ status: 'done' }));
    const backup = defaultState(NOW);
    backup.gameRounds = { tetris: tetris(), quiz: quiz(), hack: null };
    const parsed = parseBackup(makeBackup(backup), NOW);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(await app.actions.importState(parsed.state, makeBackup(backup), 'app')).toBe(true);
    expect(state().gameRounds.tetris!.status).toBe('done');
    expect(state().gameRounds.quiz).toEqual(quiz());
    /* staré rozehrané kolo ze zálohy nejde dohrát podruhé */
    expect(app.actions.finishRound({ game: 'tetris', score: 10, greedy: 10 }, tetris({ status: 'done' }))).toBeNull();
    expect(state().games.tetris.played).toBe(1);
  });
  it('otisky kol jsou stálé pro stejné číslo a liší se mezi koly', () => {
    expect(tetrisSig(makeRound(SEED))).toBe(tetrisSig(tRound));
    expect(tetrisSig(makeRound(SEED + 1))).not.toBe(tetrisSig(tRound));
    expect(hackSig(makeHack(SEED))).toBe(hackSig(hRound));
    expect(quizSig(makeQuiz(SEED, 'cs'))).toBe(quizSig(qRound));
    expect(sigOf([1])).toMatch(/^[0-9a-f]{8}$/);
    /* rotateMask je použitý jen kvůli výpočtu vyřešené polohy v testech */
    expect(rotateMask(hRound.nodes[0].solution[0], 0)).toBe(hRound.nodes[0].solution[0]);
  });
});
