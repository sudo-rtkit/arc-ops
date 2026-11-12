/* Minihry (0.11.0, schéma 10; 0.12.0, schéma 11 = Opsův hack a série kvízu po každé odpovědi): stav, zápis výsledku
   kola a odemykání nátěrů. Čisté funkce bez DOM.
   Minihry jsou jen zábava mimo raid: výsledek mění jen tento stav (rekordy, série, nátěry), nikdy herní data
   (profil, inventář, dílnu, úkoly). Aplikace nezná stav raidu, proto nic nenabízí sama, když je hra v popředí. */
import type { GamesState } from './types';
import { DEFAULT_PAINT, PAINT_IDS, isPaint, newlyUnlocked } from './paints';
import { clampInt, isObj } from './util';

export const MAX_COUNT = 1_000_000;
export const MAX_VALUE = 1e9;
export const QUIZ_LEN = 10;
/* Kolo kvízu je výhra od 7 správných odpovědí z 10. */
export const QUIZ_WIN = 7;
/* Kolo hacku je výhra od 80 % Opsovy normy (norma / tahy). */
export const HACK_WIN = 80;

export const emptyGames = (): GamesState => ({
  tetris: { played: 0, best: 0, bestPct: 0 },
  quiz: { played: 0, best: 0, streak: 0, bestStreak: 0 },
  hack: { played: 0, bestPct: 0, perfect: 0 },
  paints: [],
  paint: DEFAULT_PAINT,
});

export function normalizeGames(raw: unknown): GamesState {
  const r = isObj(raw) ? raw : {};
  const g = emptyGames();
  const tt = isObj(r.tetris) ? r.tetris : {};
  const q = isObj(r.quiz) ? r.quiz : {};
  /* schéma 11: hack ve starším stavu chybí a začne od nuly */
  const h = isObj(r.hack) ? r.hack : {};
  const n = (v: unknown, hi: number) => (Number.isFinite(Number(v)) ? clampInt(v, 0, hi) : 0);
  g.tetris = { played: n(tt.played, MAX_COUNT), best: n(tt.best, MAX_VALUE), bestPct: n(tt.bestPct, 1000) };
  g.quiz = { played: n(q.played, MAX_COUNT), best: n(q.best, QUIZ_LEN), streak: n(q.streak, MAX_COUNT), bestStreak: n(q.bestStreak, MAX_COUNT) };
  if (g.quiz.bestStreak < g.quiz.streak) g.quiz.bestStreak = g.quiz.streak;
  g.hack = { played: n(h.played, MAX_COUNT), bestPct: n(h.bestPct, 100), perfect: n(h.perfect, MAX_COUNT) };
  if (g.hack.perfect > g.hack.played) g.hack.perfect = g.hack.played;
  const list = Array.isArray(r.paints) ? r.paints : [];
  g.paints = PAINT_IDS.filter(id => id !== DEFAULT_PAINT && list.includes(id));
  g.paint = isPaint(r.paint) && (r.paint === DEFAULT_PAINT || g.paints.includes(r.paint)) ? r.paint : DEFAULT_PAINT;
  return g;
}

/* Import zálohy: sbírka nátěrů se sjednotí a rekordy se nesníží (jako sbírka dílů Opse). Série a výběr
   nátěru přijdou ze zálohy. */
export function mergeGames(cur: GamesState, next: GamesState): GamesState {
  const paints = PAINT_IDS.filter(id => id !== DEFAULT_PAINT && (cur.paints.includes(id) || next.paints.includes(id)));
  return normalizeGames({
    tetris: { played: Math.max(cur.tetris.played, next.tetris.played), best: Math.max(cur.tetris.best, next.tetris.best), bestPct: Math.max(cur.tetris.bestPct, next.tetris.bestPct) },
    quiz: { played: Math.max(cur.quiz.played, next.quiz.played), best: Math.max(cur.quiz.best, next.quiz.best), streak: next.quiz.streak, bestStreak: Math.max(cur.quiz.bestStreak, next.quiz.bestStreak) },
    hack: { played: Math.max(cur.hack.played, next.hack.played), bestPct: Math.max(cur.hack.bestPct, next.hack.bestPct), perfect: Math.max(cur.hack.perfect, next.hack.perfect) },
    paints, paint: next.paint,
  });
}

/* Hack: procento Opsovy normy = norma / tahy, nejvýš 100 (stejně nebo méně tahů = 100). */
export const hackPct = (moves: number, par: number): number =>
  moves <= 0 ? (par <= 0 ? 100 : 0) : Math.min(100, Math.floor((Math.max(0, par) * 100) / moves + 1e-9));

/* Procenta Opsova (hladového) balení, dolů zaokrouhlená: stejná hodnota = 100. */
export const tetrisPct = (score: number, greedy: number): number => (greedy > 0 ? Math.floor((Math.max(0, score) * 100) / greedy + 1e-9) : score > 0 ? 100 : 0);

export type GameResult =
  | { game: 'tetris'; score: number; greedy: number }
  /* kvíz: série správných odpovědí se ukládá už po každé odpovědi (applyQuizAnswer), kolo zapíše jen skóre */
  | { game: 'quiz'; correct: number; total: number }
  /* hack: tahy (otočení) za celé kolo a Opsova norma */
  | { game: 'hack'; moves: number; par: number };

export interface GameOutcome {
  /* kolo „vyhrané“: Tetris aspoň jako Ops, kvíz aspoň QUIZ_WIN z 10, hack aspoň HACK_WIN % Opsovy normy */
  win: boolean;
  /* nový rekord (lepší než dosavadní nejlepší, a ne první kolo s nulou) */
  record: boolean;
  /* nově odemčené nátěry */
  unlocked: string[];
  pct?: number;
}

/* Zapíše výsledek dohraného kola do stavu (na místě) a vrátí, co se stalo. */
export function applyGameResult(g: GamesState, r: GameResult): GameOutcome {
  let win = false, record = false, pct: number | undefined;
  if (r.game === 'tetris') {
    const score = clampInt(r.score, 0, MAX_VALUE), greedy = clampInt(r.greedy, 0, MAX_VALUE);
    pct = tetrisPct(score, greedy);
    win = pct >= 100;
    record = score > g.tetris.best && score > 0;
    g.tetris.played = Math.min(MAX_COUNT, g.tetris.played + 1);
    g.tetris.best = Math.max(g.tetris.best, score);
    g.tetris.bestPct = Math.max(g.tetris.bestPct, Math.min(1000, pct));
  } else if (r.game === 'quiz') {
    const correct = clampInt(r.correct, 0, QUIZ_LEN);
    win = correct >= QUIZ_WIN;
    record = correct > g.quiz.best && correct > 0;
    g.quiz.played = Math.min(MAX_COUNT, g.quiz.played + 1);
    g.quiz.best = Math.max(g.quiz.best, correct);
  } else {
    const moves = clampInt(r.moves, 0, MAX_COUNT), par = clampInt(r.par, 0, MAX_COUNT);
    pct = hackPct(moves, par);
    win = pct >= HACK_WIN;
    record = pct > g.hack.bestPct && pct > 0;
    g.hack.played = Math.min(MAX_COUNT, g.hack.played + 1);
    g.hack.bestPct = Math.max(g.hack.bestPct, pct);
    if (pct >= 100) g.hack.perfect = Math.min(MAX_COUNT, g.hack.perfect + 1);
  }
  return { win, record, unlocked: unlockNew(g), ...(pct !== undefined ? { pct } : {}) };
}

/* Odemkne nově splněné nátěry (na místě) a vrátí jejich seznam. */
function unlockNew(g: GamesState): string[] {
  const unlocked = newlyUnlocked(g);
  if (unlocked.length) g.paints = PAINT_IDS.filter(id => g.paints.includes(id) || unlocked.includes(id));
  return unlocked;
}

/* 0.12.0: jedna odpověď kvízu. Série se ukládá hned, takže odchod uprostřed kola ji nesmaže. Nejlepší skóre kola
   se dál počítá jen z dohraných kol (applyGameResult). Vrací novou sérii a nově odemčené nátěry (série 10). */
export function applyQuizAnswer(g: GamesState, correct: boolean): { streak: number; unlocked: string[] } {
  g.quiz.streak = correct ? Math.min(MAX_COUNT, g.quiz.streak + 1) : 0;
  g.quiz.bestStreak = Math.max(g.quiz.bestStreak, g.quiz.streak);
  return { streak: g.quiz.streak, unlocked: unlockNew(g) };
}

/* Seedovaný generátor (mulberry32): stejné číslo kola = stejné kolo. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const SEED_MAX = 999_999;
export const validSeed = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= SEED_MAX ? n : null;
};
/* Nové číslo kola (náhodné, 1–999 999). */
export const newSeed = (rnd: () => number = Math.random): number => 1 + Math.floor(rnd() * SEED_MAX);

/* Seedované zamíchání (Fisher–Yates) kopie pole. */
export function shuffle<T>(list: readonly T[], r: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
