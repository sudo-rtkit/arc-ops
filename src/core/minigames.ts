/* Minihry (0.11.0, schéma 10): stav, zápis výsledku kola a odemykání nátěrů. Čisté funkce bez DOM.
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

export const emptyGames = (): GamesState => ({
  tetris: { played: 0, best: 0, bestPct: 0 },
  quiz: { played: 0, best: 0, streak: 0, bestStreak: 0 },
  paints: [],
  paint: DEFAULT_PAINT,
});

export function normalizeGames(raw: unknown): GamesState {
  const r = isObj(raw) ? raw : {};
  const g = emptyGames();
  const tt = isObj(r.tetris) ? r.tetris : {};
  const q = isObj(r.quiz) ? r.quiz : {};
  const n = (v: unknown, hi: number) => (Number.isFinite(Number(v)) ? clampInt(v, 0, hi) : 0);
  g.tetris = { played: n(tt.played, MAX_COUNT), best: n(tt.best, MAX_VALUE), bestPct: n(tt.bestPct, 1000) };
  g.quiz = { played: n(q.played, MAX_COUNT), best: n(q.best, QUIZ_LEN), streak: n(q.streak, MAX_COUNT), bestStreak: n(q.bestStreak, MAX_COUNT) };
  if (g.quiz.bestStreak < g.quiz.streak) g.quiz.bestStreak = g.quiz.streak;
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
    paints, paint: next.paint,
  });
}

/* Procenta Opsova (hladového) balení, dolů zaokrouhlená: stejná hodnota = 100. */
export const tetrisPct = (score: number, greedy: number): number => (greedy > 0 ? Math.floor((Math.max(0, score) * 100) / greedy + 1e-9) : score > 0 ? 100 : 0);

export type GameResult =
  | { game: 'tetris'; score: number; greedy: number }
  /* streak = série po posledním kole, maxStreak = nejdelší série během kola (včetně navázání na předchozí) */
  | { game: 'quiz'; correct: number; total: number; streak: number; maxStreak: number };

export interface GameOutcome {
  /* kolo „vyhrané“: Tetris aspoň jako Ops, kvíz aspoň QUIZ_WIN z 10 */
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
  } else {
    const correct = clampInt(r.correct, 0, QUIZ_LEN);
    win = correct >= QUIZ_WIN;
    record = correct > g.quiz.best && correct > 0;
    g.quiz.played = Math.min(MAX_COUNT, g.quiz.played + 1);
    g.quiz.best = Math.max(g.quiz.best, correct);
    g.quiz.streak = clampInt(r.streak, 0, MAX_COUNT);
    g.quiz.bestStreak = Math.max(g.quiz.bestStreak, clampInt(r.maxStreak, 0, MAX_COUNT), g.quiz.streak);
  }
  const unlocked = newlyUnlocked(g);
  if (unlocked.length) g.paints = PAINT_IDS.filter(id => g.paints.includes(id) || unlocked.includes(id));
  return { win, record, unlocked, ...(pct !== undefined ? { pct } : {}) };
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
