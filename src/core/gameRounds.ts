/* Rozehraná kola miniher (0.13.0, schéma 12): uložení, kontrola a obnovení. Čisté funkce bez DOM.
   - Každá hra má nejvýš jedno uložené kolo. 'active' = rozehrané, jde v něm pokračovat i po restartu aplikace.
     'done' = dohrané: výsledek se při návratu na stejné kolo jen zobrazí a odměny (kola, rekordy, série, nátěry)
     se podruhé nepřipíšou. Dohrání a připsání odměn proběhne v jedné změně stavu (finishRound), stejně tak
     odpověď v kvízu a série (answerQuiz), takže nic nejde započítat dvakrát.
   - Normalizace kontroluje jen tvar a meze (nic negeneruje). Proti skutečnému kolu se uložený stav ověří až při
     obnovení (restore*): otisk kola (sig) a pravidla hry. Vadné nebo nekompatibilní kolo se zahodí jen pro tu
     jednu hru; rekordy, série a nátěry zůstávají.
   Modul je lehký (bez dat předmětů): kola dostává jako parametry. */
import type { GameRounds, GamesState, SavedHack, SavedQuiz, SavedTetris } from './types';
import type { Placement, TetrisRound } from './stashTetris';
import type { QuizRound } from './recycleQuiz';
import type { HackRound } from './opsHack';
import { MAX_COUNT, QUIZ_LEN, applyGameResult, applyQuizAnswer, validSeed, type GameOutcome, type GameResult } from './minigames';
import { isObj } from './util';
import { isLang } from '../i18n';

export type GameId = keyof GameRounds;
export const GAME_IDS: readonly GameId[] = ['tetris', 'quiz', 'hack'];
/* meze uloženého kola (batoh 5×4 má nejvýš 20 předmětů, největší uzel hacku 6×6) */
export const MAX_PLACEMENTS = 32;
export const MAX_GRID = 64;
export const MAX_TILES = 64;
export const MAX_NODES = 8;
const ITEM_ID = /^i\d{1,2}$/;
const OPTION_ID = /^[a-d]$/;
const SIG = /^[0-9a-f]{8}$/;

export const emptyRounds = (): GameRounds => ({ tetris: null, quiz: null, hack: null });

/* Otisk kola: FNV-1a (32 bitů) z JSON. Stačí k poznání, že stejné číslo kola dnes dává jiné kolo. */
export function sigOf(x: unknown): string {
  const str = JSON.stringify(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const tetrisSig = (r: TetrisRound): string => sigOf([r.cols, r.rows, r.items.map(i => [i.id, i.name, i.value, i.w, i.h])]);
export const quizSig = (r: QuizRound): string => sigOf(r.questions.map(q => [q.kind, q.prompt, q.options, q.answer]));
export const hackSig = (r: HackRound): string => sigOf(r.nodes.map(n => [n.cols, n.rows, n.solution, n.start, n.source, n.par]));

/* ----- normalizace (tvar a meze; vadné kolo = null, nic se nedomýšlí) ----- */
const int = (v: unknown, lo: number, hi: number): number | null => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
const status = (v: unknown) => (v === 'active' || v === 'done' ? v : null);
function head(r: Record<string, unknown>): { seed: number; status: 'active' | 'done'; sig: string } | null {
  const seed = Number.isInteger(r.seed) ? validSeed(r.seed) : null, st = status(r.status);
  if (seed === null || !st || typeof r.sig !== 'string' || !SIG.test(r.sig)) return null;
  return { seed, status: st, sig: r.sig };
}

export function normalizeSavedTetris(raw: unknown): SavedTetris | null {
  if (!isObj(raw)) return null;
  const h = head(raw);
  if (!h || !Array.isArray(raw.placements) || raw.placements.length > MAX_PLACEMENTS) return null;
  const placements: SavedTetris['placements'] = [];
  const ids = new Set<string>();
  for (const p of raw.placements) {
    if (!isObj(p) || typeof p.id !== 'string' || !ITEM_ID.test(p.id) || ids.has(p.id) || typeof p.rot !== 'boolean') return null;
    const x = int(p.x, 0, MAX_GRID - 1), y = int(p.y, 0, MAX_GRID - 1);
    if (x === null || y === null) return null;
    ids.add(p.id);
    placements.push({ id: p.id, x, y, rot: p.rot });
  }
  let held: SavedTetris['held'] = null;
  if (raw.held !== null && raw.held !== undefined) {
    const hd = raw.held;
    if (!isObj(hd) || typeof hd.id !== 'string' || !ITEM_ID.test(hd.id) || ids.has(hd.id) || typeof hd.rot !== 'boolean') return null;
    held = { id: hd.id, rot: hd.rot };
  }
  if (h.status === 'done' && held) return null;
  return { ...h, placements, held };
}

export function normalizeSavedQuiz(raw: unknown): SavedQuiz | null {
  if (!isObj(raw)) return null;
  const h = head(raw);
  if (!h || !isLang(raw.lang)) return null;
  const index = int(raw.index, 0, QUIZ_LEN - 1), correct = int(raw.correct, 0, QUIZ_LEN);
  const picked = raw.picked === null || raw.picked === undefined ? null : typeof raw.picked === 'string' && OPTION_ID.test(raw.picked) ? raw.picked : undefined;
  if (index === null || correct === null || picked === undefined) return null;
  /* správných nejvýš tolik, kolik je zodpovězených otázek; dohrané kolo má odpověď na poslední otázku */
  if (correct > index + (picked ? 1 : 0) || (h.status === 'done' && !picked)) return null;
  return { ...h, lang: raw.lang, index, picked, correct };
}

export function normalizeSavedHack(raw: unknown): SavedHack | null {
  if (!isObj(raw)) return null;
  const h = head(raw);
  if (!h || !Array.isArray(raw.rot) || raw.rot.length < 1 || raw.rot.length > MAX_TILES) return null;
  const node = int(raw.node, 0, MAX_NODES - 1), moves = int(raw.moves, 0, MAX_COUNT);
  if (node === null || moves === null || !raw.rot.every(v => int(v, 0, 3) !== null)) return null;
  return { ...h, node, rot: [...(raw.rot as number[])], moves };
}

export function normalizeRounds(raw: unknown): GameRounds {
  const r = isObj(raw) ? raw : {};
  return { tetris: normalizeSavedTetris(r.tetris), quiz: normalizeSavedQuiz(r.quiz), hack: normalizeSavedHack(r.hack) };
}
const NORMALIZE = { tetris: normalizeSavedTetris, quiz: normalizeSavedQuiz, hack: normalizeSavedHack } as const;

/* Import zálohy: rozehrané kolo tohoto počítače má přednost (jinak by se staré kolo ze zálohy dalo dohrát
   podruhé); záloha doplní jen hry, které tu žádné uložené kolo nemají. */
export const mergeRounds = (cur: GameRounds, next: GameRounds): GameRounds =>
  ({ tetris: cur.tetris ?? next.tetris, quiz: cur.quiz ?? next.quiz, hack: cur.hack ?? next.hack });

/* ----- obnovení proti skutečnému kolu ----- */
export interface TetrisProgress { placements: Placement[]; held: { id: string; rot: boolean } | null; done: boolean }
export function restoreTetris(s: SavedTetris | null, round: TetrisRound): TetrisProgress | null {
  if (!s || s.seed !== round.seed || s.sig !== tetrisSig(round)) return null;
  let placements: Placement[] = [];
  for (const p of s.placements) {
    const it = round.items.find(i => i.id === p.id);
    if (!it || p.x + 1 > round.cols || p.y + 1 > round.rows) return null;
    const next = placeLocal(round, placements, p);
    if (!next) return null;
    placements = next;
  }
  if (s.held && !round.items.some(i => i.id === s.held!.id)) return null;
  return { placements, held: s.held ? { ...s.held } : null, done: s.status === 'done' };
}
/* stejné pravidlo jako stashTetris.place (bez importu modulu s daty předmětů) */
function placeLocal(round: TetrisRound, placements: Placement[], p: Placement): Placement[] | null {
  const it = round.items.find(i => i.id === p.id)!;
  const [w, h] = p.rot ? [it.h, it.w] : [it.w, it.h];
  if (p.x + w > round.cols || p.y + h > round.rows) return null;
  const byId = new Map(round.items.map(i => [i.id, i]));
  for (const q of placements) {
    const o = byId.get(q.id)!;
    const [ow, oh] = q.rot ? [o.h, o.w] : [o.w, o.h];
    if (p.x < q.x + ow && q.x < p.x + w && p.y < q.y + oh && q.y < p.y + h) return null;
  }
  return [...placements, { id: p.id, x: p.x, y: p.y, rot: p.rot }];
}

export interface QuizProgress { index: number; picked: string | null; correct: number; done: boolean }
export function restoreQuiz(s: SavedQuiz | null, round: QuizRound): QuizProgress | null {
  if (!s || s.seed !== round.seed || s.sig !== quizSig(round)) return null;
  const q = round.questions[s.index];
  if (!q || (s.picked && !q.options.some(o => o.id === s.picked))) return null;
  if (s.status === 'done' && s.index !== round.questions.length - 1) return null;
  return { index: s.index, picked: s.picked, correct: s.correct, done: s.status === 'done' };
}

export interface HackProgress { node: number; rot: number[]; moves: number; done: boolean }
/* solved = isSolved z opsHack (předává se, aby modul zůstal lehký) */
export function restoreHack(s: SavedHack | null, round: HackRound, solved: (node: HackRound['nodes'][number], rot: readonly number[]) => boolean): HackProgress | null {
  if (!s || s.seed !== round.seed || s.sig !== hackSig(round)) return null;
  const n = round.nodes[s.node];
  if (!n || s.rot.length !== n.cols * n.rows) return null;
  const last = s.node === round.nodes.length - 1, isDone = solved(n, s.rot);
  /* dohrané kolo = vyřešený poslední uzel; rozehrané s vyřešeným posledním uzlem by šlo jen podvrhnout */
  if (s.status === 'done' ? !(last && isDone) : last && isDone) return null;
  if (s.status === 'done' && s.moves < 1) return null;
  return { node: s.node, rot: [...s.rot], moves: s.moves, done: s.status === 'done' };
}

/* ----- změny stavu (na místě; false/null = nic se nezměnilo) ----- */
type SavedOf<G extends GameId> = NonNullable<GameRounds[G]>;

/* Průběžné uložení rozehraného kola. Dohrané kolo stejného čísla se nepřepíše (návrat do něj ho neoživí). */
export function saveRound<G extends GameId>(r: GameRounds, game: G, data: SavedOf<G>): boolean {
  const next = NORMALIZE[game]({ ...data, status: 'active' }) as SavedOf<G> | null;
  if (!next) return false;
  const cur = r[game];
  if (cur && cur.seed === next.seed && cur.status === 'done') return false;
  if (cur && JSON.stringify(cur) === JSON.stringify(next)) return false;
  r[game] = next;
  return true;
}

export function discardRound(r: GameRounds, game: GameId): boolean {
  if (!r[game]) return false;
  r[game] = null;
  return true;
}

/* Dohrání kola: odměny a značka „dohráno“ najednou. Stejné kolo podruhé nic nepřipíše (vrací null). */
export function finishRound<G extends GameId>(g: GamesState, r: GameRounds, result: GameResult & { game: G }, data: SavedOf<G>): GameOutcome | null {
  const cur = r[result.game];
  if (cur && cur.seed === data.seed && cur.status === 'done') return null;
  const next = NORMALIZE[result.game]({ ...data, status: 'done' }) as SavedOf<G> | null;
  if (!next) return null;
  const out = applyGameResult(g, result);
  r[result.game] = next;
  return out;
}

/* Odpověď v kvízu: série a uložené kolo najednou. Otázka, na kterou už uložené kolo odpověď má (nebo dohrané kolo),
   se podruhé nezapočítá (vrací null). data = stav kola po odpovědi (picked vyplněné). */
export function answerQuiz(g: GamesState, r: GameRounds, data: SavedQuiz, correct: boolean): { streak: number; unlocked: string[] } | null {
  if (!data.picked) return null;
  const cur = r.quiz;
  if (cur && cur.seed === data.seed && (cur.status === 'done' || cur.index > data.index || (cur.index === data.index && cur.picked))) return null;
  const next = normalizeSavedQuiz({ ...data, status: 'active' });
  if (!next) return null;
  const out = applyQuizAnswer(g, correct);
  r.quiz = next;
  return out;
}

/* Krátký popis rozehraného kola pro rozcestník (klíč slovníku a parametry). */
export function roundSummary(r: GameRounds, game: GameId): { seed: number; params: Record<string, number> } | null {
  const s = r[game];
  if (!s || s.status !== 'active') return null;
  if (game === 'tetris') { const t = s as SavedTetris; return { seed: t.seed, params: { count: t.placements.length } }; }
  if (game === 'quiz') { const q = s as SavedQuiz; return { seed: q.seed, params: { n: q.index + 1, total: QUIZ_LEN, correct: q.correct } }; }
  const h = s as SavedHack;
  return { seed: h.seed, params: { n: h.node + 1, moves: h.moves } };
}
