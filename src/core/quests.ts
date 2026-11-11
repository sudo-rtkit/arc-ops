/* Úkoly (questy) z dat ARC Tracker: stav splnění, dostupnost podle předchozích úkolů a předměty, které je potřeba
   donést ze zásoby. Ty jdou do nákupního seznamu a do Material Planneru stejně jako potřeby stanic Workshopu.
   Čisté funkce; stav splnění drží store (state.quests.done: id → čas zaškrtnutí). */
import { AT_PROJECTS, AT_QUESTS, type AtQuest, type Loc } from './data/arctracker';
import type { Lang, Recipe } from './types';

export const QUESTS: AtQuest[] = AT_QUESTS;
export const PROJECTS = AT_PROJECTS;
const BY_ID = new Map(QUESTS.map(q => [q.id, q]));
export const questById = (id: string): AtQuest | undefined => BY_ID.get(id);

/* Text ze zdroje: čeština, když ji zdroj má, jinak angličtina. */
export const locText = (v: Loc, lang: Lang): string => (typeof v === 'string' ? v : lang === 'cs' && v.cs ? v.cs : v.en);
export const questName = (q: AtQuest, lang: Lang): string => locText(q.name, lang);

export type QuestStatus = 'done' | 'active' | 'locked';
/* Dostupný = nesplněný a všechny předchozí úkoly jsou splněné (neznámý předchozí úkol nebrání). */
export function questStatus(q: AtQuest, done: Record<string, number>): QuestStatus {
  if (done[q.id]) return 'done';
  return q.prev.every(p => !BY_ID.has(p) || done[p]) ? 'active' : 'locked';
}

/* Řetěz předchozích úkolů (bez samotného úkolu), bez opakování a bez zacyklení. */
export function prerequisites(id: string): string[] {
  const out: string[] = [], seen = new Set<string>([id]);
  const stack = [...(BY_ID.get(id)?.prev ?? [])];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p) || !BY_ID.has(p)) continue;
    seen.add(p); out.push(p);
    stack.push(...BY_ID.get(p)!.prev);
  }
  return out;
}

/* Zaškrtnutí úkolu: splněný úkol znamená i splněné předchozí, takže se doplní i ty. Odškrtnutí platí jen pro úkol. */
export function setQuestDone(done: Record<string, number>, id: string, value: boolean, now: number): Record<string, number> {
  if (!BY_ID.has(id)) return done;
  const out = { ...done };
  if (!value) { delete out[id]; return out; }
  for (const p of [id, ...prerequisites(id)]) if (!out[p]) out[p] = now;
  return out;
}

/* Normalizace uloženého stavu: jen známé tvary (id do 80 znaků, kladný čas). Neznámá id se ponechají kvůli
   pozdějším aktualizacím dat. */
export function normalizeQuestDone(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 2000)) {
    const n = Math.round(Number(v));
    if (k && k.length <= 80 && Number.isFinite(n) && n > 0) out[k] = Math.min(n, 9e15);
  }
  return out;
}

export interface QuestNeed { id: string; label: string; mats: Recipe }
/* Potřeby dostupných úkolů: předměty, které hráč donese ze zásoby (předměty objevené až během úkolu se nepočítají). */
export function questNeeds(done: Record<string, number>, lang: Lang): QuestNeed[] {
  return QUESTS.filter(q => q.deliver.length && questStatus(q, done) === 'active')
    .map(q => ({ id: q.id, label: questName(q, lang), mats: q.deliver.map(([m, n]) => [m, n] as [string, number]) }));
}

export function questProgress(done: Record<string, number>): { done: number; total: number } {
  return { done: QUESTS.filter(q => done[q.id]).length, total: QUESTS.length };
}

/* ----- projekty (milník 4): počet hotových fází, potřeby další fáze ----- */
/* Projekt běží, když už začal a ještě neskončil (datum YYYY-MM-DD; chybějící datum nebrání). */
export const projectActive = (p: { start?: string; end?: string }, today: string): boolean =>
  (!p.start || p.start <= today) && (!p.end || p.end >= today);
export const projectById = (id: string) => PROJECTS.find(p => p.id === id);

/* Uložený počet hotových fází: jen známé projekty, 0 až počet fází. */
export function normalizeProjects(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    const p = projectById(k);
    const n = Math.round(Number(v));
    if (p && Number.isFinite(n) && n > 0) out[k] = Math.min(n, p.phases.length);
  }
  return out;
}

/* Potřeby další fáze každého běžícího projektu (předměty k odevzdání). */
export function projectNeeds(done: Record<string, number>, today: string, lang: Lang): QuestNeed[] {
  const out: QuestNeed[] = [];
  for (const p of PROJECTS) {
    if (!projectActive(p, today)) continue;
    const phases = [...p.phases].sort((a, b) => a.phase - b.phase);
    const next = phases[done[p.id] || 0];
    if (!next || !next.req.length) continue;
    out.push({ id: `${p.id}:${next.phase}`, label: `${locText(p.name, lang)} ${next.phase}`, mats: next.req.map(([m, n]) => [m, n] as [string, number]) });
  }
  return out;
}
