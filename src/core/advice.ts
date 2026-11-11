/* Rada „nech / recykluj / prodej“ k předmětům v Zásobě a Vybavení (milník 4). Čisté funkce.
   - Nech: předmět je potřeba pro další úroveň stanice (nebo cíl stanice z Planneru a Goal Trackeru), dostupný úkol,
     další fázi běžícího projektu, materiálový cíl, položku Planneru, nebo je to nenaučený blueprint.
     Nechá se jen potřebný počet; přebytek dostane vlastní radu.
   - Recykluj: předmět (nebo přebytek) potřeba není, ale recyklací vznikne materiál, který chybí.
   - Prodej: ani jedno; ukáže se prodejní hodnota. Bez dat o předmětu je rada „bez dat“.
   Hráč může u předmětu radu přepsat na „vždy nechat“ (state.advice.keep). */
import type { AppState, ItemStock, Lang } from './types';
import { getStations } from './gamedata';
import { nextNeeds } from './workshop';
import { planRequirements, type ReqKind } from './planner';
import { projectNeeds, questNeeds } from './quests';
import { isBlueprint, itemData, slotsFor } from './itemdb';
import { isObj } from './util';
import { t } from '../i18n';

export type AdviceKind = 'keep' | 'recycle' | 'sell' | 'unknown';
export type NeedKind = ReqKind | 'project' | 'blueprint';
export interface NeedSource { key: string; kind: NeedKind; label: string; qty: number }
export interface NeedEntry { name: string; total: number; sources: NeedSource[] }
/* klíč = název malými písmeny */
export type NeedIndex = Map<string, NeedEntry>;

export interface NeedInput { key: string; kind: NeedKind; label: string; mat: string; qty: number }
const lower = (s: string) => s.trim().toLowerCase();

/* Součet potřeb podle materiálu. Stejný zdroj a materiál se počítá jen jednou (první výskyt), jako v Planneru. */
export function needIndex(list: NeedInput[]): NeedIndex {
  const seen = new Set<string>();
  const out: NeedIndex = new Map();
  for (const r of list) {
    if (r.qty <= 0 || !r.mat.trim()) continue;
    const id = r.key + '|' + lower(r.mat);
    if (seen.has(id)) continue;
    seen.add(id);
    const e = out.get(lower(r.mat)) ?? { name: r.mat, total: 0, sources: [] };
    e.total += r.qty;
    e.sources.push({ key: r.key, kind: r.kind, label: r.label, qty: r.qty });
    out.set(lower(r.mat), e);
  }
  return out;
}

/* Potřeby ze stavu: další úroveň stanic, Planner (cílové úrovně, crafting, vlastní položky), cíle, dostupné úkoly,
   další fáze běžících projektů a nenaučené blueprinty ve vybavení. Úkoly a cíle se počítají vždy (i když je
   Planner nezahrnuje). today = YYYY-MM-DD. */
export function collectNeeds(s: AppState, today: string, lang: Lang): NeedIndex {
  const stations = getStations(s.gameData);
  const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
  const list: NeedInput[] = [];
  for (const n of nextNeeds(view, stations)) {
    for (const [mat, qty] of n.mats) list.push({ key: `station:${n.station.id}:${n.level}`, kind: 'station', label: `${n.station.name} ${n.level}`, mat, qty });
  }
  const planner = { ...s.planner, includeGoals: true, includeQuests: true };
  for (const r of planRequirements(view, planner, s.goals, stations, questNeeds(s.quests.done, lang))) {
    list.push({ key: r.key, kind: r.kind, label: r.label, mat: r.mat, qty: r.qty });
  }
  for (const p of projectNeeds(s.projects, today, lang)) {
    for (const [mat, qty] of p.mats) list.push({ key: `project:${p.id}`, kind: 'project', label: t('advice.src.project', { name: p.label }), mat, qty });
  }
  for (const it of Object.values(s.items)) {
    if (isBlueprint(it.name) && !s.blueprints[it.name]) list.push({ key: `blueprint:${it.name}`, kind: 'blueprint', label: t('advice.src.blueprint'), mat: it.name, qty: 1 });
  }
  return needIndex(list);
}

export interface StockEntry { key: string; name: string; count: number; kind: 'material' | 'item' }
export interface Advice {
  key: string; name: string; count: number; stockKind: StockEntry['kind'];
  kind: AdviceKind;
  /* rada pro přebytek (počet nad potřebou); u „nech“ bez přebytku stejná jako kind */
  rest: Exclude<AdviceKind, 'keep'>;
  override: boolean;
  need: number; keep: number; surplus: number;
  reasons: NeedSource[];
  /* všechny výstupy recyklace; needed = materiál, který chybí */
  recycle: { name: string; qty: number; needed: boolean }[];
  value: number | null; stack: number; valuePerSlot: number | null;
  slots: number; slotsFreed: number; surplusValue: number | null;
}

/* Rada pro jeden předmět. haveOf = kolik má hráč daného materiálu (kvůli tomu, jestli výstup recyklace chybí). */
export function advise(e: StockEntry, needs: NeedIndex, haveOf: (name: string) => number, keepOverride = false): Advice {
  const data = itemData(e.name);
  const n = needs.get(lower(e.name));
  const need = n?.total ?? 0;
  const keep = keepOverride ? e.count : Math.min(e.count, need);
  const surplus = e.count - keep;
  const recycle = (data?.r ?? []).map(([name, qty]) => {
    const m = needs.get(lower(name));
    return { name, qty, needed: !!m && m.total > haveOf(name) };
  });
  const rest: Advice['rest'] = recycle.some(r => r.needed) ? 'recycle' : data?.v ? 'sell' : 'unknown';
  const kind: AdviceKind = keepOverride || need > 0 ? 'keep' : rest;
  const stack = Math.max(1, data?.s ?? 1);
  const value = data?.v ?? null;
  return {
    key: e.key, name: e.name, count: e.count, stockKind: e.kind, kind, rest, override: keepOverride,
    need, keep, surplus, reasons: n?.sources ?? [], recycle,
    value, stack, valuePerSlot: value === null ? null : value * stack,
    slots: slotsFor(e.count, stack), slotsFreed: slotsFor(e.count, stack) - slotsFor(keep, stack),
    surplusValue: value === null ? null : value * surplus,
  };
}

/* Celá zásoba: materiály (inventory) i vybavení (items, klíč = název + tier). */
export function stockEntries(s: AppState): StockEntry[] {
  const out: StockEntry[] = [];
  for (const [name, count] of Object.entries(s.inventory)) if (count > 0) out.push({ key: name, name, count, kind: 'material' });
  for (const it of Object.values(s.items) as ItemStock[]) if (it.count > 0) out.push({ key: it.key, name: it.key, count: it.count, kind: 'item' });
  return out;
}
export function haveOfState(s: AppState): (name: string) => number {
  const by = new Map<string, number>();
  const add = (k: string, n: number) => by.set(lower(k), (by.get(lower(k)) || 0) + n);
  for (const [k, n] of Object.entries(s.inventory)) add(k, n);
  for (const it of Object.values(s.items)) add(it.key, it.count);
  return name => by.get(lower(name)) || 0;
}

export function adviseAll(s: AppState, today: string, lang: Lang): Map<string, Advice> {
  const needs = collectNeeds(s, today, lang);
  const haveOf = haveOfState(s);
  return new Map(stockEntries(s).map(e => [e.key, advise(e, needs, haveOf, !!s.advice.keep[e.key])]));
}

/* Úklid stashe: co jde pryč (přebytek bez „vždy nechat“), seřazené podle hodnoty na políčko. */
export type CleanupSort = 'low' | 'high';
export function cleanupRows(all: Iterable<Advice>, sort: CleanupSort = 'low'): Advice[] {
  const rows = [...all].filter(a => !a.override && a.surplus > 0);
  const v = (a: Advice) => a.valuePerSlot ?? (sort === 'low' ? Infinity : -1);
  return rows.sort((a, b) => (sort === 'low' ? v(a) - v(b) : v(b) - v(a)) || a.name.localeCompare(b.name));
}
export function cleanupSummary(rows: Advice[]): { items: number; slots: number; value: number; recycle: number; sell: number } {
  return {
    items: rows.length,
    slots: rows.reduce((a, r) => a + r.slotsFreed, 0),
    value: rows.reduce((a, r) => a + (r.rest === 'sell' ? r.surplusValue ?? 0 : 0), 0),
    recycle: rows.filter(r => r.rest === 'recycle').length,
    sell: rows.filter(r => r.rest === 'sell').length,
  };
}

export const emptyAdvice = () => ({ keep: {} as Record<string, true> });
export function normalizeAdvice(raw: unknown): { keep: Record<string, true> } {
  const keep: Record<string, true> = {};
  const k = isObj(raw) && isObj(raw.keep) ? raw.keep : {};
  for (const [name, v] of Object.entries(k).slice(0, 5000)) if (v === true && name.trim() && name.length <= 130) keep[name] = true;
  return { keep };
}
