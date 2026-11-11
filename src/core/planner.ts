/* Material Planner: součet materiálu na cílové úrovně stanic, crafting, vlastní cíle a cíle z Goal Trackeru.
   Každý požadavek nese klíč zdroje; součet jde přes jedinečné klíče, takže se nic nezapočítá dvakrát. */
import type { Goal, PlannerItem, PlannerState, Recipe, Station } from './types';
import { clampInt, isObj, text, uid } from './util';
import { STATIONS, SOURCES } from './data/stations';
import { normalizeItems } from './raidItems';
import { reqBlock, type WorkshopView } from './workshop';
import { isDone } from './goals';
import { t } from '../i18n';

export type ReqKind = 'station' | 'craft' | 'custom' | 'goal' | 'quest';
export interface Requirement { key: string; kind: ReqKind; label: string; mat: string; qty: number; blocked: string | null }
export interface PlanRow {
  mat: string; need: number; have: number; missing: number; src: string; arc: boolean;
  sources: { key: string; kind: ReqKind; label: string; qty: number; blocked: string | null }[];
  /* Souběh: každý zdroj zvlášť by materiál měl, dohromady ne. */
  contention: boolean;
}
export interface StationTarget { station: Station; current: number; target: number; fromPlan: number; fromGoals: number; goalTitles: string[] }

export const emptyPlanner = (): PlannerState => ({ stations: {}, items: [], includeGoals: true, includeQuests: true });

/* Cílová úroveň stanice = max(aktuální, plán, otevřené cíle stanic). Úrovně se tak nikdy nepočítají dvakrát. */
export function stationTargets(view: WorkshopView, planner: PlannerState, goals: Goal[], stations: Station[] = STATIONS): StationTarget[] {
  return stations.map(st => {
    const current = view.stations[st.id] ?? st.min;
    const fromPlan = clampInt(planner.stations[st.id] ?? current, st.min, st.max);
    const gs = planner.includeGoals ? goals.filter(g => !isDone(g) && g.link.kind === 'station' && g.link.station === st.id) : [];
    const fromGoals = gs.reduce((a, g) => Math.max(a, g.link.kind === 'station' ? g.link.level : 0), 0);
    return { station: st, current, target: Math.max(current, fromPlan, Math.min(st.max, fromGoals)), fromPlan, fromGoals, goalTitles: gs.map(g => g.title) };
  });
}

export function planRequirements(view: WorkshopView, planner: PlannerState, goals: Goal[], stations: Station[] = STATIONS, quests: { id: string; label: string; mats: Recipe }[] = []): Requirement[] {
  const reqs = new Map<string, Requirement>();
  const add = (r: Requirement) => {
    const k = r.key + '|' + r.mat;
    const prev = reqs.get(k);
    /* stejný zdroj a materiál jen jednou; v jednom receptu se stejný materiál sečte */
    if (prev) prev.qty += r.qty; else reqs.set(k, { ...r });
  };
  for (const t of stationTargets(view, planner, goals, stations)) {
    for (let lvl = t.current + 1; lvl <= t.target; lvl++) {
      const recipe = t.station.levels[lvl];
      if (!recipe) continue;
      const key = `station:${t.station.id}:${lvl}`;
      const blocked = reqBlock(view, t.station, lvl);
      for (const [mat, qty] of recipe) add({ key, kind: 'station', label: `${t.station.name} ${lvl}`, mat, qty, blocked });
    }
  }
  for (const it of planner.items) {
    for (const m of it.mats) add({ key: `${it.kind}:${it.id}`, kind: it.kind, label: it.kind === 'craft' ? `${it.name} × ${it.qty}` : it.name, mat: m.name, qty: m.qty * it.qty, blocked: null });
  }
  if (planner.includeGoals) {
    for (const g of goals) {
      if (isDone(g) || g.link.kind !== 'material') continue;
      add({ key: `goal:${g.id}`, kind: 'goal', label: t('planner.req.goal', { title: g.title }), mat: g.link.mat, qty: g.link.qty, blocked: null });
    }
  }
  /* Dostupné úkoly: předměty, které je potřeba donést ze zásoby (milník 3b). */
  if (planner.includeQuests) {
    for (const q of quests) for (const [mat, qty] of q.mats) add({ key: `quest:${q.id}`, kind: 'quest', label: t('planner.req.quest', { name: q.label }), mat, qty, blocked: null });
  }
  return [...reqs.values()];
}

export function planNeeds(view: WorkshopView, planner: PlannerState, goals: Goal[], stations: Station[] = STATIONS, sources: Record<string, string> = SOURCES, quests: { id: string; label: string; mats: Recipe }[] = []): PlanRow[] {
  const by: Record<string, PlanRow> = {};
  for (const r of planRequirements(view, planner, goals, stations, quests)) {
    const row = (by[r.mat] ||= { mat: r.mat, need: 0, have: 0, missing: 0, src: '', arc: false, sources: [], contention: false });
    row.need += r.qty;
    row.sources.push({ key: r.key, kind: r.kind, label: r.label, qty: r.qty, blocked: r.blocked });
  }
  return Object.values(by).map(row => {
    row.have = view.inventory[row.mat] || 0;
    row.missing = Math.max(0, row.need - row.have);
    row.src = sources[row.mat] || 'Loot';
    row.arc = row.src.startsWith('ARC');
    row.contention = row.missing > 0 && row.sources.length > 1 && row.sources.every(s => s.qty <= row.have);
    return row;
  }).sort((a, b) => (Number(b.arc) - Number(a.arc)) || (b.missing - a.missing) || a.mat.localeCompare(b.mat));
}

export interface PlanSummary { rows: number; need: number; missing: number; missingKinds: number; contention: number; blockedLevels: number }
export function planSummary(rows: PlanRow[]): PlanSummary {
  const blocked = new Set<string>();
  for (const r of rows) for (const s of r.sources) if (s.blocked) blocked.add(s.key);
  return {
    rows: rows.length, need: rows.reduce((a, r) => a + r.need, 0), missing: rows.reduce((a, r) => a + r.missing, 0),
    missingKinds: rows.filter(r => r.missing > 0).length, contention: rows.filter(r => r.contention).length, blockedLevels: blocked.size,
  };
}

function normalizeItem(x: Record<string, unknown>): PlannerItem {
  return {
    id: text(x.id || uid(), 24), kind: x.kind === 'custom' ? 'custom' : 'craft', name: text(x.name, 80).trim() || t('planner.defaultItem'),
    qty: clampInt(x.qty ?? 1, 1, 999), mats: normalizeItems(x.mats, 30),
  };
}

export function normalizePlanner(raw: unknown): PlannerState {
  const p = isObj(raw) ? raw : {};
  const stations: Record<string, number> = {};
  const st = isObj(p.stations) ? p.stations : {};
  for (const s of STATIONS) if (st[s.id] !== undefined) stations[s.id] = clampInt(st[s.id], s.min, s.max);
  const seen = new Set<string>();
  const items = (Array.isArray(p.items) ? p.items : []).filter(isObj).slice(0, 200).map(normalizeItem).map(i => {
    if (seen.has(i.id)) i.id = uid() + seen.size;
    seen.add(i.id);
    return i;
  });
  return { stations, items, includeGoals: p.includeGoals !== false, includeQuests: p.includeQuests !== false };
}

