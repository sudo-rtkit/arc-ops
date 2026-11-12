/* 0.11.0: minihry (Stash Tetris, recyklační kvíz), nátěry Opse a schéma 10. 0.12.0: Opsův hack (každé kolo řešitelné,
   ověřeno nezávislým řešičem), série kvízu po každé odpovědi, nátěry za hack a schéma 11. Čisté funkce, store a záloha. */
import { describe, expect, it } from 'vitest';
import { COLS, OFFER, ROWS, canPlace, cellsOf, density, greedy, lootPool, makeRound, occupancy, place, removeItem, scoreOf, shapeOfType, tipsFor, type Placement } from '../../src/core/stashTetris';
import { makeQuiz, qtyText, quizPools } from '../../src/core/recycleQuiz';
import { HACK_WIN, QUIZ_LEN, applyGameResult, applyQuizAnswer, emptyGames, hackPct, mergeGames, newSeed, normalizeGames, rng, tetrisPct, validSeed } from '../../src/core/minigames';
import { DIRS, HACK_NODES, HACK_SIZES, isSolved, kindOf, leaks, makeHack, powered, rotateAt, rotateMask, tileSteps, type HackNode } from '../../src/core/opsHack';
import { DEFAULT_PAINT, OPS_PALETTE, PAINTS, PAINT_KEEP, paintMap, paintOf, recolorPixels } from '../../src/core/paints';
import { itemData } from '../../src/core/itemdb';
import { STATIONS } from '../../src/core/data/stations';
import { AT_QUESTS } from '../../src/core/data/arctracker';
import { questName } from '../../src/core/quests';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { line, withMinigameHint } from '../../src/core/opsVoice';
import { OPS_LINES } from '../../src/i18n/opsLines';
import { SOUNDS } from '../../src/core/opsSound';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { tl, LANGS } from '../../src/i18n';

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
async function makeApp(initial?: unknown, kv = memoryKV()) {
  if (initial !== undefined) kv.setItem('arcops:state', JSON.stringify(initial));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return { app, state: () => app.store.getState().state };
}
const SEEDS = Array.from({ length: 150 }, (_, i) => 1 + i * 6607);

describe('Stash Tetris', () => {
  it('tvary podle typu jsou stálé (1×1 / 1×2 / 2×2)', () => {
    expect(shapeOfType('Trinket')).toBe('small');
    expect(shapeOfType('Recyclable')).toBe('medium');
    expect(shapeOfType('Pistol')).toBe('medium');
    expect(shapeOfType('Assault Rifle')).toBe('large');
    expect(shapeOfType('Blueprint')).toBeNull();
    expect(shapeOfType('Key')).toBeNull();
    for (const sh of ['small', 'medium', 'large'] as const) expect(lootPool()[sh].length).toBeGreaterThan(OFFER[sh] * 2);
  });

  it('kolo je dané číslem: stejné číslo = stejné kolo, skutečné názvy, hodnoty a rarita z dat', () => {
    const a = makeRound(4242), b = makeRound(4242), c = makeRound(4243);
    expect(a).toEqual(b);
    expect(a.items.map(i => i.name)).not.toEqual(c.items.map(i => i.name));
    expect(a.cols).toBe(COLS); expect(a.rows).toBe(ROWS);
    expect(a.items).toHaveLength(OFFER.small + OFFER.medium + OFFER.large);
    expect(new Set(a.items.map(i => i.name)).size).toBe(a.items.length);
    for (const it of a.items) {
      const row = itemData(it.name)!;
      expect(row.v).toBe(it.value);
      expect(row.ra).toBe(it.rarity);
      expect(shapeOfType(row.ty)).toBe(it.shape);
      expect(it.name.startsWith('Amplified ')).toBe(false);
    }
    /* víc políček než batoh: všechno se nevejde */
    expect(a.items.reduce((s, i) => s + cellsOf(i), 0)).toBeGreaterThan(COLS * ROWS);
  });

  it('pokládání: hranice, překryv, otočení, přesun a vyndání', () => {
    const r = makeRound(7);
    const big = r.items.find(i => i.shape === 'large')!, med = r.items.find(i => i.shape === 'medium')!;
    let p: Placement[] = place(r, [], big.id, 0, 0, false)!;
    expect(p).toHaveLength(1);
    expect(place(r, p, med.id, 1, 1, false)).toBeNull(); /* překryv */
    expect(place(r, p, med.id, COLS - 1, ROWS - 1, false)).toBeNull(); /* 1×2 přes spodní okraj */
    expect(canPlace(r, p, med, COLS - 2, ROWS - 1, true)).toBe(true); /* otočený 2×1 se vejde */
    p = place(r, p, med.id, COLS - 2, ROWS - 1, true)!;
    expect(occupancy(r, p).filter(Boolean)).toHaveLength(6);
    /* přesun stejného předmětu nepočítá s ním samým jako s překážkou */
    p = place(r, p, big.id, 1, 0, false)!;
    expect(p.filter(x => x.id === big.id)).toEqual([{ id: big.id, x: 1, y: 0, rot: false }]);
    expect(scoreOf(r, p)).toBe(big.value + med.value);
    expect(scoreOf(r, removeItem(p, big.id))).toBe(med.value);
  });

  it('Opsovo hladové balení je platné, bez překryvu a podle hodnoty na políčko', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const r = makeRound(seed);
      const g = greedy(r);
      let cells = 0;
      for (const pl of g.placements) {
        const it = r.items.find(i => i.id === pl.id)!;
        expect(canPlace(r, g.placements, it, pl.x, pl.y, pl.rot)).toBe(true);
        cells += cellsOf(it);
      }
      expect(occupancy(r, g.placements).filter(Boolean)).toHaveLength(cells);
      expect(g.score).toBe(scoreOf(r, g.placements));
      expect(g.score).toBeGreaterThan(0);
      /* nejhodnotnější předmět na políčko je vždy zabalený */
      const top = [...r.items].sort((a, b) => density(b) - density(a))[0];
      expect(g.placements.some(x => x.id === top.id)).toBe(true);
    }
  });

  it('rady: vždy aspoň jedna, výměna jen když zůstal výhodnější předmět', () => {
    const r = makeRound(99);
    const empty = tipsFor(r, []);
    expect(empty[0].key).toBe('games.tip.top');
    expect(empty.some(t => t.key === 'games.tip.free')).toBe(true);
    const worst = [...r.items].sort((a, b) => density(a) - density(b))[0];
    const tips = tipsFor(r, place(r, [], worst.id, 0, 0, false)!);
    expect(tips.find(t => t.key === 'games.tip.swap')?.params.took).toBe(worst.name);
    expect(tipsFor(r, greedy(r).placements).length).toBeGreaterThanOrEqual(1);
    for (const lang of LANGS) for (const tip of empty) expect(tl(lang, tip.key, tip.params)).not.toMatch(/\{\w+\}/);
  });
});

describe('recyklační kvíz', () => {
  it.each(LANGS)('každé kolo má 10 otázek s jistou odpovědí a vysvětlením (%s)', lang => {
    const P = quizPools();
    for (const seed of SEEDS) {
      const q = makeQuiz(seed, lang);
      expect(q.questions).toHaveLength(QUIZ_LEN);
      const kinds = new Set(q.questions.map(x => x.kind));
      expect(kinds.size).toBe(4);
      for (const x of q.questions) {
        const labels = x.options.map(o => o.label);
        expect(new Set(labels).size).toBe(labels.length);
        expect(x.options.some(o => o.id === x.answer)).toBe(true);
        const right = x.options.find(o => o.id === x.answer)!.label;
        const wrong = labels.filter(l => l !== right);
        expect(tl(lang, x.prompt.key, x.prompt.params)).not.toMatch(/\{\w+\}/);
        expect(tl(lang, x.explain.key, x.explain.params)).not.toMatch(/\{\w+\}/);
        if (x.kind === 'recycle') {
          const it = itemData(String(x.prompt.params.item))!;
          expect(right).toBe(qtyText(it.r!));
          expect(wrong).toHaveLength(3);
        } else if (x.kind === 'station') {
          const item = String(x.prompt.params.item);
          const uses = STATIONS.flatMap(s => Object.entries(s.levels).filter(([, m]) => m.some(([n]) => n === item)).map(([lv]) => `${s.name} ${lv}`));
          expect(uses).toEqual([right]);
          expect(wrong.every(w => !uses.includes(w))).toBe(true);
        } else if (x.kind === 'quest') {
          const item = String(x.prompt.params.item);
          const qs = AT_QUESTS.filter(qq => qq.deliver.some(([n]) => n === item));
          expect(qs).toHaveLength(1);
          expect(questName(qs[0], lang)).toBe(right);
        } else {
          expect(x.options).toHaveLength(2);
          const [a, b] = labels.map(l => itemData(l)!.v!);
          expect(Math.abs(a - b)).toBeGreaterThanOrEqual(0.2 * Math.max(a, b));
          expect(itemData(right)!.v).toBe(Math.max(a, b));
        }
      }
    }
    expect(P.station.length).toBeGreaterThan(10);
    expect(P.quest.length).toBeGreaterThan(10);
  });

  it('stejné číslo kola = stejné otázky; jazyk mění jen texty', () => {
    expect(makeQuiz(5, 'cs')).toEqual(makeQuiz(5, 'cs'));
    expect(makeQuiz(5, 'cs').questions.map(q => q.kind)).toEqual(makeQuiz(5, 'en').questions.map(q => q.kind));
    expect(makeQuiz(5, 'cs').questions.map(q => q.prompt.params.item)).toEqual(makeQuiz(5, 'en').questions.map(q => q.prompt.params.item));
  });
});

/* Nezávislý řešič pro test: zná jen aktuální (zamíchané) dlaždice, velikost a zdroj, ne řešení, ze kterého uzel vznikl.
   Prohledává otočení po řádcích; vodič musí navazovat na souseda nahoře a vlevo, nesmí vést ven z mřížky a nakonec
   musí být vše propojené se zdrojem. Vrací otočení (0–3 po směru) každé dlaždice, nebo null. */
function solveIndependently(cols: number, rows: number, tiles: number[], source: number): number[] | null {
  const n = cols * rows, pick = new Array<number>(n).fill(0), cur = new Array<number>(n).fill(0);
  const connected = () => {
    const seen = new Set([source]), stack = [source];
    while (stack.length) {
      const i = stack.pop()!, x = i % cols, y = Math.floor(i / cols);
      const nb: [number, number, number][] = [[1, x, y - 1], [2, x + 1, y], [4, x, y + 1], [8, x - 1, y]];
      for (const [bit, nx, ny] of nb) {
        if (!(cur[i] & bit) || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === n;
  };
  let steps = 0;
  const go = (i: number): boolean => {
    if (++steps > 2_000_000) return false;
    if (i === n) return connected();
    const x = i % cols, y = Math.floor(i / cols), tried = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const m = rotateMask(tiles[i], k);
      if (tried.has(m)) continue;
      tried.add(m);
      const up = y > 0 ? (cur[i - cols] & 4) !== 0 : false, left = x > 0 ? (cur[i - 1] & 2) !== 0 : false;
      if (((m & 1) !== 0) !== up || ((m & 8) !== 0) !== left) continue;
      if (x === cols - 1 && m & 2) continue;
      if (y === rows - 1 && m & 4) continue;
      cur[i] = m; pick[i] = k;
      if (go(i + 1)) return true;
    }
    cur[i] = 0;
    return false;
  };
  return go(0) ? pick : null;
}
const HACK_SEEDS = Array.from({ length: 400 }, (_, i) => 1 + i * 2477);

describe('Opsův hack', () => {
  it('kolo je dané číslem; tři uzly s rostoucí velikostí', () => {
    expect(makeHack(4242)).toEqual(makeHack(4242));
    expect(makeHack(4242).nodes[0].start).not.toEqual(makeHack(4243).nodes[0].start);
    const r = makeHack(77);
    expect(r.nodes).toHaveLength(HACK_NODES);
    expect(r.nodes.map(n => [n.cols, n.rows])).toEqual(HACK_SIZES.map(x => [...x]));
    for (let i = 1; i < r.nodes.length; i++) expect(r.nodes[i].cols * r.nodes[i].rows).toBeGreaterThan(r.nodes[i - 1].cols * r.nodes[i - 1].rows);
  });

  it('každé kolo je řešitelné: řešení z konstrukce i nezávislý řešič ze zamíchaných dlaždic', () => {
    for (const seed of HACK_SEEDS) {
      for (const node of makeHack(seed).nodes) {
        const n = node.cols * node.rows;
        const zero = new Array<number>(n).fill(0);
        /* řešení, ze kterého uzel vznikl: strom přes všechna políčka */
        expect(isSolved(node, zero), `seed ${seed}`).toBe(true);
        expect(node.solution.filter(m => m).length).toBe(n);
        expect(node.solution.reduce((s, m) => s + DIRS.filter(d => m & d).length, 0)).toBe(2 * (n - 1));
        /* začátek není vyřešený a má co otáčet */
        expect(isSolved(node, node.start), `seed ${seed} start`).toBe(false);
        expect(node.par).toBeGreaterThan(0);
        /* nezávislý řešič vidí jen zamíchané dlaždice */
        const shown = node.solution.map((m, i) => rotateMask(m, node.start[i]));
        const found = solveIndependently(node.cols, node.rows, shown, node.source);
        expect(found, `seed ${seed} ${node.cols}×${node.rows}`).not.toBeNull();
        expect(isSolved(node, node.start.map((s, i) => (s + found![i]) % 4)), `seed ${seed} řešič`).toBe(true);
      }
    }
  });

  it('Opsova norma = nejmenší počet otočení; otáčení po normě uzel vyřeší přesně za normu tahů', () => {
    for (const seed of HACK_SEEDS.slice(0, 80)) {
      for (const node of makeHack(seed).nodes) {
        let rot = [...node.start], moves = 0;
        node.solution.forEach((m, i) => {
          /* směr kratší cesty k poloze shodné s řešením */
          let cw = 0;
          while (rotateMask(m, rot[i] + cw) !== m) cw++;
          const ccw = (4 - ((rot[i] % 4) + 4) % 4) % 4 === 0 ? 0 : [0, 1, 2, 3].find(c => rotateMask(m, rot[i] - c) === m)!;
          const steps = Math.min(cw, ccw);
          expect(steps).toBe(tileSteps(m, rot[i]));
          for (let k = 0; k < steps; k++) { rot = rotateAt(rot, i, cw <= ccw ? 1 : -1); moves++; }
        });
        expect(moves).toBe(node.par);
        expect(isSolved(node, rot)).toBe(true);
      }
    }
  });

  it('výstupy jsou listy stromu, zdroj uprostřed; napájení a vodiče do prázdna se počítají', () => {
    for (const seed of HACK_SEEDS.slice(0, 50)) for (const node of makeHack(seed).nodes) {
      expect(node.outputs.length).toBeGreaterThanOrEqual(2);
      expect(node.outputs).not.toContain(node.source);
      for (const o of node.outputs) expect(DIRS.filter(d => node.solution[o] & d)).toHaveLength(1);
      expect(kindOf(node, node.source)).toBe('source');
      const zero = new Array<number>(node.solution.length).fill(0);
      expect(powered(node, zero).size).toBe(node.solution.length);
      expect(leaks(node, zero)).toBe(0);
      expect(powered(node, node.start).size < node.solution.length || leaks(node, node.start) > 0).toBe(true);
    }
    /* uzel 2×1 ručně: zdroj vlevo, výstup vpravo */
    const tiny: HackNode = { cols: 2, rows: 1, solution: [2, 8], start: [1, 0], source: 0, outputs: [1], par: 1 };
    expect(isSolved(tiny, [1, 0])).toBe(false);
    expect(leaks(tiny, [1, 0])).toBe(2);
    expect(powered(tiny, [1, 0])).toEqual(new Set([0]));
    expect(isSolved(tiny, rotateAt([1, 0], 0, -1))).toBe(true);
    expect(tileSteps(5, 1)).toBe(1); /* rovný vodič: dvě shodné polohy */
    expect(tileSteps(15, 3)).toBe(0); /* kříž: každá poloha */
    expect(tileSteps(3, 2)).toBe(2);
  });

  it('výsledek: procento normy, výhra od HACK_WIN %, 3 kola = Obvodová deska, kolo na normu = Uplink', () => {
    expect(hackPct(10, 10)).toBe(100);
    expect(hackPct(8, 10)).toBe(100);
    expect(hackPct(20, 10)).toBe(50);
    expect(hackPct(0, 0)).toBe(100);
    const g = emptyGames();
    let o = applyGameResult(g, { game: 'hack', moves: 40, par: 20 });
    expect(o).toEqual({ win: false, record: true, unlocked: ['olive'], pct: 50 });
    o = applyGameResult(g, { game: 'hack', moves: 25, par: 20 });
    expect(o).toEqual({ win: true, record: true, unlocked: [], pct: HACK_WIN });
    o = applyGameResult(g, { game: 'hack', moves: 30, par: 20 });
    expect(o).toMatchObject({ win: false, record: false, unlocked: ['circuit'] });
    o = applyGameResult(g, { game: 'hack', moves: 20, par: 20 });
    expect(o).toEqual({ win: true, record: true, unlocked: ['uplink'], pct: 100 });
    expect(g.hack).toEqual({ played: 4, bestPct: 100, perfect: 1 });
    expect(g.paints).toEqual(['olive', 'circuit', 'uplink']);
    /* hack se počítá do „dohraných kol“ (Pouštní) */
    for (let i = 0; i < 6; i++) o = applyGameResult(g, { game: 'hack', moves: 99, par: 20 });
    expect(o.unlocked).toEqual(['desert']);
  });
});

describe('výsledky, rekordy a odemykání nátěrů', () => {
  it('čísla kol a generátor', () => {
    expect(validSeed('42')).toBe(42);
    expect(validSeed('0')).toBeNull();
    expect(validSeed('1000000')).toBeNull();
    expect(validSeed('x')).toBeNull();
    const s = newSeed(rng(1));
    expect(validSeed(s)).toBe(s);
    expect(tetrisPct(50, 100)).toBe(50);
    expect(tetrisPct(100, 100)).toBe(100);
    expect(tetrisPct(99.9, 100)).toBe(99);
    expect(tetrisPct(0, 0)).toBe(0);
  });

  it('první kolo odemkne Polní olivu; rekord jen při zlepšení; Tetris 90 % a 100 % odemkne Rezavou a Zlacenou', () => {
    const g = emptyGames();
    let o = applyGameResult(g, { game: 'tetris', score: 5000, greedy: 10000 });
    expect(o).toEqual({ win: false, record: true, unlocked: ['olive'], pct: 50 });
    o = applyGameResult(g, { game: 'tetris', score: 4000, greedy: 10000 });
    expect(o).toEqual({ win: false, record: false, unlocked: [], pct: 40 });
    o = applyGameResult(g, { game: 'tetris', score: 9000, greedy: 10000 });
    expect(o.unlocked).toEqual(['rust']);
    o = applyGameResult(g, { game: 'tetris', score: 12000, greedy: 12000 });
    expect(o).toMatchObject({ win: true, record: true, unlocked: ['gold'] });
    expect(g.tetris).toEqual({ played: 4, best: 12000, bestPct: 100 });
    expect(g.paints).toEqual(['olive', 'rust', 'gold']);
  });

  it('kvíz: 8/10 odemkne Arktickou, série 10 Noční hlídku, 10 kol Pouštní; série se ukládá po každé odpovědi', () => {
    const g = emptyGames();
    let o = applyGameResult(g, { game: 'quiz', correct: 6, total: 10 });
    expect(o).toEqual({ win: false, record: true, unlocked: ['olive'] });
    o = applyGameResult(g, { game: 'quiz', correct: 8, total: 10 });
    expect(o).toMatchObject({ win: true, record: true, unlocked: ['arctic'] });
    /* série jen z odpovědí: 9 správně, chyba, 10 správně = Noční hlídka hned při desáté */
    for (let i = 0; i < 9; i++) expect(applyQuizAnswer(g, true)).toEqual({ streak: i + 1, unlocked: [] });
    expect(applyQuizAnswer(g, false)).toEqual({ streak: 0, unlocked: [] });
    for (let i = 0; i < 9; i++) applyQuizAnswer(g, true);
    expect(applyQuizAnswer(g, true)).toEqual({ streak: 10, unlocked: ['night'] });
    o = applyGameResult(g, { game: 'quiz', correct: 7, total: 10 });
    expect(o).toMatchObject({ win: true, record: false, unlocked: [] });
    /* dohrání kola sérii nemění */
    expect(g.quiz).toEqual({ played: 3, best: 8, streak: 10, bestStreak: 10 });
    for (let i = 0; i < 7; i++) o = applyGameResult(g, { game: 'quiz', correct: 1, total: 10 });
    expect(o.unlocked).toEqual(['desert']);
    expect(g.paints).toEqual(['olive', 'arctic', 'night', 'desert']);
  });

  it('kvíz přerušený uprostřed kola: série zůstane i po novém spuštění, rekord kola ani počet kol se nezmění', async () => {
    const kv = memoryKV();
    const { app, state } = await makeApp({ schema: 10, games: { quiz: { played: 2, best: 6, streak: 1, bestStreak: 3 }, paints: ['olive'] } }, kv);
    expect(app.actions.quizAnswer(true)).toEqual({ streak: 2, unlocked: [] });
    expect(app.actions.quizAnswer(true)).toEqual({ streak: 3, unlocked: [] });
    expect(app.actions.quizAnswer(true)).toEqual({ streak: 4, unlocked: [] });
    expect(state().games.quiz).toEqual({ played: 2, best: 6, streak: 4, bestStreak: 4 });
    /* odchod z kola bez dohrání: nové spuštění nad stejným úložištěm má sérii uloženou */
    await new Promise(r => setTimeout(r, 10));
    const again = await makeApp(undefined, kv);
    expect(again.state().games.quiz).toEqual({ played: 2, best: 6, streak: 4, bestStreak: 4 });
    again.app.actions.quizAnswer(false);
    expect(again.state().games.quiz).toEqual({ played: 2, best: 6, streak: 0, bestStreak: 4 });
  });

  it('normalizace: nesmysly se ořežou, vybraný nátěr musí být odemčený', () => {
    expect(normalizeGames(undefined)).toEqual(emptyGames());
    expect(normalizeGames({ tetris: { best: -5, played: 'x', bestPct: 5000 }, quiz: { best: 99, streak: 4, bestStreak: 1 }, hack: { played: 2, bestPct: 300, perfect: 9 }, paints: ['olive', 'nope', 'original', 'olive'], paint: 'gold' }))
      .toEqual({ tetris: { played: 0, best: 0, bestPct: 1000 }, quiz: { played: 0, best: QUIZ_LEN, streak: 4, bestStreak: 4 }, hack: { played: 2, bestPct: 100, perfect: 2 }, paints: ['olive'], paint: DEFAULT_PAINT });
    expect(normalizeGames({ paints: ['gold'], paint: 'gold' }).paint).toBe('gold');
  });

  it('import: nátěry se sjednotí, rekordy nesníží', () => {
    const cur = normalizeGames({ tetris: { played: 3, best: 9000, bestPct: 80 }, paints: ['olive', 'rust'], paint: 'rust' });
    const next = normalizeGames({ tetris: { played: 1, best: 2000, bestPct: 100 }, quiz: { best: 9, streak: 2, bestStreak: 5 }, hack: { played: 4, bestPct: 90, perfect: 1 }, paints: ['gold', 'uplink'], paint: 'gold' });
    expect(mergeGames(cur, next)).toEqual({
      tetris: { played: 3, best: 9000, bestPct: 100 }, quiz: { played: 0, best: 9, streak: 2, bestStreak: 5 }, hack: { played: 4, bestPct: 90, perfect: 1 }, paints: ['olive', 'rust', 'gold', 'uplink'], paint: 'gold',
    });
  });
});

describe('nátěry: přebarvení spritů', () => {
  it('lem, oči, oddělení a signální barvy zůstávají; plechy se mění', () => {
    const keep = new Set(PAINT_KEEP.map(k => parseInt(OPS_PALETTE[k].slice(1), 16)));
    for (const p of PAINTS) {
      const m = paintMap(p.id);
      if (p.id === DEFAULT_PAINT) { expect(m.size).toBe(0); continue; }
      expect(m.size).toBeGreaterThanOrEqual(7);
      for (const from of m.keys()) expect(keep.has(from), p.id).toBe(false);
      /* výsledné barvy nesplývají s meruňkovým lemem ani s tmavým oddělením */
      for (const [r, g, b] of m.values()) {
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        expect([OPS_PALETTE.apricot, OPS_PALETTE.ink, OPS_PALETTE.light]).not.toContain(hex);
      }
    }
  });
  it('přesná shoda barvy, alfa beze změny, původní vzhled nic nemění', () => {
    const px = (hex: string, a = 255) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), a];
    const data = new Uint8ClampedArray([...px(OPS_PALETTE.apricot), ...px(OPS_PALETTE.panel), ...px(OPS_PALETTE.panel, 0), ...px('#123456')]);
    const orig = Uint8ClampedArray.from(data);
    expect(recolorPixels(data, DEFAULT_PAINT)).toBe(0);
    expect(data).toEqual(orig);
    expect(recolorPixels(data, 'olive')).toBe(1);
    expect([...data.slice(0, 4)]).toEqual(px(OPS_PALETTE.apricot));
    expect([...data.slice(4, 8)]).toEqual(px('#1E2619'));
    expect([...data.slice(8, 16)]).toEqual([...orig.slice(8, 16)]);
    expect(paintOf('nope')).toBe(DEFAULT_PAINT);
    expect(paintOf(undefined)).toBe(DEFAULT_PAINT);
  });
});

describe('Ops: hlášky, zvuky a nabídka minihry', () => {
  it('reakce na výhru, rekord a odemčení mají v obou jazycích všechny povahy a aspoň 2 varianty', () => {
    for (const lang of LANGS) for (const k of ['game.win', 'game.record', 'game.unlock', 'game.done', 'hint.minigame', 'game.hackStart', 'game.hackNode'] as const) {
      for (const mode of ['plain', 'friendly', 'cheeky'] as const) expect(OPS_LINES[lang][k][mode].length, `${lang} ${k} ${mode}`).toBeGreaterThanOrEqual(2);
    }
    expect(SOUNDS).toEqual(expect.arrayContaining(['win', 'record', 'unlock']));
  });
  it('minihru nabídne jen místo „nic nechybí“ a jen když hráč s oknem pracuje', () => {
    expect(withMinigameHint(line('hint.idle'), true)).toEqual(line('hint.minigame'));
    expect(withMinigameHint(line('hint.idle'), false)).toEqual(line('hint.idle'));
    const miss = line('hint.missing', { mats: 'x', station: 'y', level: 1, count: 1 });
    expect(withMinigameHint(miss, true)).toBe(miss);
  });
});

describe('schéma 11 a store', () => {
  it('stav schématu 9 se načte beze ztrát a dostane prázdné minihry s původním vzhledem', () => {
    expect(SCHEMA).toBe(12);
    const old = { schema: 9, profile: { level: 12 }, inventory: { Fabric: 3 }, buddy: { outfit: { hat: null } }, quests: { done: {}, pinned: [], objectives: { a: [1] } } };
    const s = normalize(old, NOW);
    expect(s.schema).toBe(12);
    expect(s.games).toEqual(emptyGames());
    expect(s.profile.level).toBe(12);
    expect(s.inventory).toEqual({ Fabric: 3 });
  });
  it('stav a záloha schématu 10 (0.11.0) se načtou beze ztrát; hack začne od nuly', () => {
    const games10 = { tetris: { played: 4, best: 31000, bestPct: 96 }, quiz: { played: 3, best: 9, streak: 5, bestStreak: 12 }, paints: ['olive', 'rust', 'night'], paint: 'night' };
    const s = normalize({ schema: 10, profile: { level: 33 }, inventory: { Fabric: 9 }, games: games10 }, NOW);
    expect(s.schema).toBe(12);
    expect(s.games).toEqual({ ...games10, hack: { played: 0, bestPct: 0, perfect: 0 } });
    expect(s.inventory).toEqual({ Fabric: 9 });
    expect(s.profile.level).toBe(33);
    const p = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 10, exportedAt: '2026-11-12T10:00:00.000Z', state: { schema: 10, games: games10, inventory: { Fabric: 9 } } }), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(p.state.games).toEqual({ ...games10, hack: { played: 0, bestPct: 0, perfect: 0 } });
    expect(p.state.inventory).toEqual({ Fabric: 9 });
  });
  it('záloha nese minihry a nátěry a vrátí je beze změny; schéma 13 je novější verze', () => {
    const s = defaultState(NOW);
    s.games = normalizeGames({ tetris: { played: 2, best: 30000, bestPct: 95 }, quiz: { played: 1, best: 8, streak: 3, bestStreak: 8 }, hack: { played: 3, bestPct: 100, perfect: 1 }, paints: ['olive', 'arctic', 'circuit', 'uplink'], paint: 'uplink' });
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(12);
    expect(file.state.games).toEqual(s.games);
    const p = parseBackup(makeBackup(s), NOW);
    expect('error' in p ? p.error : p.state).toEqual(s);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 13, state: {} }), NOW)).toHaveProperty('error');
  });
  it('finishGame mění jen minihry; nátěr jde vybrat jen odemčený', async () => {
    const { app, state } = await makeApp({ schema: 9, profile: { level: 30, coins: 1234 }, inventory: { 'Metal Parts': 7 } });
    const before = structuredClone(state());
    expect(app.actions.setPaint('olive'), 'zamčený').toBeUndefined();
    expect(state().games.paint).toBe(DEFAULT_PAINT);
    const out = app.actions.finishGame({ game: 'tetris', score: 15000, greedy: 15000 });
    expect(out).toMatchObject({ win: true, record: true, unlocked: ['olive', 'rust', 'gold'] });
    const s = state();
    expect(s.games.tetris).toEqual({ played: 1, best: 15000, bestPct: 100 });
    for (const k of ['profile', 'inventory', 'items', 'stations', 'quests', 'skills', 'raids', 'blueprints'] as const) expect(s[k], k).toEqual(before[k]);
    app.actions.setPaint('gold');
    expect(state().games.paint).toBe('gold');
    app.actions.setPaint('night');
    expect(state().games.paint).toBe('gold');
    app.actions.setPaint(DEFAULT_PAINT);
    expect(state().games.paint).toBe(DEFAULT_PAINT);
  });
  it('import zálohy sjednotí nátěry a nesníží rekordy; reset modulu Minihry vrátí původní vzhled', async () => {
    const { app, state } = await makeApp({ schema: 10, games: { tetris: { played: 5, best: 20000, bestPct: 90 }, paints: ['olive', 'rust'], paint: 'rust' } });
    const backup = defaultState(NOW);
    backup.games = normalizeGames({ quiz: { played: 2, best: 8, bestStreak: 6 }, paints: ['arctic'], paint: 'arctic' });
    expect(await app.actions.importState(backup, makeBackup(backup), 'app')).toBe(true);
    expect(state().games).toEqual({ tetris: { played: 5, best: 20000, bestPct: 90 }, quiz: { played: 2, best: 8, streak: 0, bestStreak: 6 }, hack: { played: 0, bestPct: 0, perfect: 0 }, paints: ['olive', 'rust', 'arctic'], paint: 'arctic' });
    expect(await app.actions.resetModule('games')).toBe(true);
    expect(state().games).toEqual(emptyGames());
  });
});
