/* Vyhodnocení po raidu (0.15.0, spec docs/superpowers/specs/2026-11-12-priprava-na-raid-design.md, „Později“).
   Čisté funkce, jen čtou stav; inventář mění dál jen stávající potvrzené zápisy (snímek FINDINGS / STASH, raid).
   - Nalezeno z plánu = vyšší z čísel: přírůstek zásoby od spuštění plánu (snímek zásoby v raidPlan.snap)
     a loot zapsaný u raidu (snímek FINDINGS nebo ruční loot). Vyšší, ne součet: loot převedený do Inventory
     je v přírůstku zásoby už obsažený, takže se nic nezapočítá dvakrát.
   - Potřeba = co při spuštění plánu chybělo. Plán ze starší verze snímek zásoby nemá: zásoba před raidem se pak
     odvodí z aktuální zásoby bez lootu záznamu, který už je v Inventory; ruční vyhodnocení bez snímku není.
   - Nově hotové požadavky: cíl, kterému při spuštění něco chybělo a po připočtení nálezu nechybí nic
     (stejný výpočet jako seznam k hledání, cíl po cíli).
   - Další raid: stejný výpočet seznamu a bodování map jako příprava, nad zásobou po raidu. */
import type { AppState, ItemQty, Lang, Raid, RaidGoals, RaidPlan, RaidPlanRecord } from './types';
import { stockOf } from './compact';
import { itemData } from './itemdb';
import { goalLabels, goalOptions, raidList, recommendedMap, scoreMaps, validGoals, type MapScore, type RaidRow } from './raidPrep';
import { questById, questName } from './quests';
import { line, type LineRef } from './opsVoice';
import type { LootArea } from './lootAreas';
import { itemAreas } from './lootAreas';
import { itemFacts, loadoutHaveOf, loadoutSummary, type LoadoutSummary } from './loadouts';
import { getWeapons } from './gamedata';

const low = (s: string) => s.trim().toLowerCase();

/* ----- cíle po jednom ----- */
export type GoalKind = 'station' | 'quest' | 'project';
export const goalKeys = (g: RaidGoals): string[] => [
  ...g.stations.map(id => 'station:' + id), ...g.quests.map(id => 'quest:' + id), ...g.projects.map(id => 'project:' + id),
];
function singleGoal(key: string): RaidGoals {
  const i = key.indexOf(':');
  const kind = key.slice(0, i), id = key.slice(i + 1);
  return { stations: kind === 'station' ? [id] : [], quests: kind === 'quest' ? [id] : [], projects: kind === 'project' ? [id] : [], money: false };
}

/* Snímek při spuštění plánu: zásoba a chybějící počet každého předmětu ze seznamu a cíle, kterým něco chybí. */
export function planSnapshot(s: AppState, goals: RaidGoals, lang: Lang, today: string): Pick<RaidPlan, 'snap' | 'open'> {
  const rows = raidList(s, goals, lang, today);
  const stock = stockOf(s);
  return {
    snap: rows.map(r => ({ mat: r.mat, have: stock[r.mat] ?? 0, missing: r.missing })),
    open: goalKeys(goals).filter(k => raidList(s, singleGoal(k), lang, today).length > 0),
  };
}

/* ----- vyhodnocení ----- */
export interface EvalRow { mat: string; need: number; found: number; missing: number; areas: LootArea[] }
export interface EvalDone { key: string; kind: GoalKind; name: string }
export type EvalKind = 'all' | 'partial' | 'none' | 'upgrade';
export interface RaidEval {
  /* podle čeho: loot zapsaný u raidu (snímek nebo ručně), nebo jen přírůstek zásoby */
  source: 'raid' | 'stock';
  raidId: string | null;
  /* plán spuštěný ve starší verzi (bez snímku zásoby) */
  legacy: boolean;
  rows: EvalRow[];
  /* kusy: potřeba, nalezeno z plánu (nejvýš potřeba), stále chybí */
  need: number; found: number; missing: number;
  done: EvalDone[];
  kind: EvalKind;
  /* odhad hodnoty nalezených předmětů z plánu (prodejní cena z katalogu), null = neznámá */
  value: number | null;
  /* nález, který ještě není v zásobě (loot nepřevedený do Inventory); pro výpočet stavu po raidu */
  extra: Record<string, number>;
}

/* Raid, který k plánu patří: nejnovější záznam od spuštění plánu (podle času raidu nebo snímku FINDINGS). */
export function planRaid(s: Pick<AppState, 'raids'>, plan: Pick<RaidPlan, 'startedAt'>): Raid | null {
  const list = s.raids.filter(r => r.ts >= plan.startedAt || (r.lootScan?.at ?? 0) >= plan.startedAt);
  return list.sort((a, b) => Math.max(b.ts, b.lootScan?.at ?? 0) - Math.max(a.ts, a.lootScan?.at ?? 0))[0] ?? null;
}
/* Je vyhodnocení tohoto plánu už v deníku? */
export const savedRaid = (s: Pick<AppState, 'raids'>, plan: Pick<RaidPlan, 'startedAt'>): Raid | null =>
  s.raids.find(r => r.plan && r.plan.at === plan.startedAt) ?? null;

/* Zásoba po raidu: aktuální zásoba + nález, který v ní ještě není (záporné číslo = odečíst). Jen pro výpočet,
   nic se neukládá. */
export function afterState(s: AppState, extra: Record<string, number>): AppState {
  const keys = Object.keys(extra).filter(k => extra[k] !== 0);
  if (!keys.length) return s;
  const stock = stockOf(s);
  const inventory = { ...s.inventory };
  for (const k of keys) inventory[k] = Math.max(0, (stock[k] ?? 0) + extra[k]);
  return { ...s, inventory };
}

const qtyBy = (list: ItemQty[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of list) m.set(low(x.name), (m.get(low(x.name)) ?? 0) + Math.max(0, x.qty));
  return m;
};

/* Vyhodnocení aktivního plánu. raid = záznam raidu, jehož loot se započítá (null = jen přírůstek zásoby). */
export function evaluateRaid(s: AppState, plan: RaidPlan, raid: Pick<Raid, 'id' | 'loot' | 'lootApplied'> | null, lang: Lang, today: string): RaidEval {
  const stock = stockOf(s);
  const loot = qtyBy(raid?.loot ?? []);
  const legacy = plan.snap === null;
  /* plán ze starší verze: zásoba před raidem = aktuální zásoba bez lootu záznamu, který už je v Inventory */
  let snap = plan.snap, openAtStart = plan.open;
  if (legacy) {
    const applied = qtyBy(raid?.lootApplied ?? []);
    const back: Record<string, number> = {};
    for (const x of raid?.loot ?? []) {
      const k = Object.keys(stock).find(m => low(m) === low(x.name)) ?? x.name;
      const n = Math.min(loot.get(low(x.name)) ?? 0, applied.get(low(x.name)) ?? 0);
      if (n > 0) back[k] = -n;
    }
    const before = afterState(s, back);
    ({ snap, open: openAtStart } = planSnapshot(before, plan.goals, lang, today));
  }
  const extra: Record<string, number> = {};
  const rows: EvalRow[] = [];
  for (const b of snap ?? []) {
    const got = loot.get(low(b.mat)) ?? 0;
    const diff = Math.max(0, (stock[b.mat] ?? 0) - b.have);
    const found = Math.max(diff, got);
    if (got > diff) extra[b.mat] = got - diff;
    if (b.missing <= 0) continue;
    rows.push({ mat: b.mat, need: b.missing, found, missing: Math.max(0, b.missing - found), areas: itemAreas(b.mat) });
  }
  const need = rows.reduce((a, r) => a + r.need, 0);
  const found = rows.reduce((a, r) => a + Math.min(r.need, r.found), 0);
  /* nově hotové požadavky: cíl s něčím chybějícím při spuštění, po připočtení nálezu bez chybějícího */
  const after = afterState(s, extra);
  const valid = validGoals(s, plan.goals, lang, today);
  const open = openAtStart;
  const opts = goalOptions(s, lang, today);
  const done: EvalDone[] = [];
  for (const key of goalKeys(valid)) {
    if (!open.includes(key) || raidList(after, singleGoal(key), lang, today).length > 0) continue;
    const kind = key.slice(0, key.indexOf(':')) as GoalKind, id = key.slice(key.indexOf(':') + 1);
    const name = kind === 'station' ? (o => (o ? `${o.name} ${o.level}` : id))(opts.stations.find(x => x.id === id))
      : kind === 'quest' ? (q => (q ? questName(q, lang) : id))(questById(id))
        : opts.projects.find(x => x.id === id)?.label ?? id;
    done.push({ key, kind, name });
  }
  const valued = rows.filter(r => r.found > 0 && itemData(r.mat)?.v);
  const value = valued.length ? valued.reduce((a, r) => a + Math.min(r.need, r.found) * (itemData(r.mat)!.v ?? 0), 0) : null;
  /* vylepšení (stanice, projekt) má přednost; hotový úkol je „vše nalezeno“ a ukáže se v seznamu hotových */
  const upgrade = done.some(d => d.kind !== 'quest');
  const kind: EvalKind = upgrade ? 'upgrade' : rows.every(r => r.missing === 0) ? 'all' : found > 0 ? 'partial' : 'none';
  return { source: raid && raid.loot.length ? 'raid' : 'stock', raidId: raid?.id ?? null, legacy, rows, need, found, missing: need - found, done, kind, value, extra };
}

/* Shrnutí od Opse podle výsledku (varianty a povaha v okně, které ho ukáže). */
export function evalLine(ev: RaidEval): LineRef {
  if (ev.kind === 'upgrade') {
    const up = ev.done.filter(d => d.kind !== 'quest');
    return line('raid.eval.upgrade', { name: up.map(d => d.name).slice(0, 2).join(', '), count: up.length });
  }
  if (ev.kind === 'all') return line('raid.eval.all', { count: ev.found });
  if (ev.kind === 'partial') return line('raid.eval.partial', { count: ev.found, need: ev.need, missing: ev.missing });
  return line('raid.eval.none', { count: ev.need });
}

/* Další raid: stejné cíle (bez těch, co už neplatí) nad zásobou po raidu, stejný výpočet seznamu a mapy. */
export interface NextRaid { goals: RaidGoals; rows: RaidRow[]; units: number; best: MapScore | undefined; scores: MapScore[] }
export function nextRaid(s: AppState, plan: RaidPlan, ev: RaidEval, lang: Lang, today: string): NextRaid {
  const after = afterState(s, ev.extra);
  const goals = validGoals(after, plan.goals, lang, today);
  const rows = raidList(after, goals, lang, today);
  const scores = scoreMaps(after, goals, lang);
  return { goals, rows, units: rows.reduce((a, r) => a + r.missing, 0), best: recommendedMap(scores), scores };
}

/* ----- 0.23.0: loadout plánu ----- */
/* Souhrn loadoutu z builderu (hodnota, riziko, dostupnost) nad aktuální zásobou; null = plán bez loadoutu nebo smazaný. */
export function planLoadout(s: AppState, id: string): { name: string; sum: LoadoutSummary } | null {
  const l = id ? s.loadouts.find(x => x.id === id) : undefined;
  if (!l) return null;
  const weapons = getWeapons(s.gameData);
  return { name: l.name, sum: loadoutSummary(l, wid => weapons.find(w => w.id === wid)?.name || wid, loadoutHaveOf(s)) };
}
/* Hodnota v riziku: známá jen tehdy, když mají cenu všechny předměty mimo bezpečnou kapsu (jinak null, nic se nehádá). */
export const knownRisk = (sum: LoadoutSummary): number | null => (sum.riskUnknown.length ? null : sum.risk);
/* Co se s výbavou stalo: vyřazení = ztráta hodnoty v riziku, přežití = výbava zůstala; bez záznamu raidu nevíme. */
export function loadoutOutcome(raid: Pick<Raid, 'ok'> | null): 'lost' | 'kept' | null {
  return raid ? (raid.ok ? 'kept' : 'lost') : null;
}

/* Záznam plánu do deníku (Raid.plan). 0.23.0: s hodnotou loadoutu v riziku (null = neznámá). */
export function planRecord(s: AppState, plan: RaidPlan, ev: RaidEval, lang: Lang, today: string): RaidPlanRecord {
  const lo = planLoadout(s, plan.loadout);
  return {
    at: plan.startedAt, goals: goalLabels(s, plan.goals, lang, today), money: plan.goals.money, map: plan.map, loadout: plan.loadout,
    items: ev.rows.map(r => ({ mat: r.mat, need: r.need, found: Math.min(r.need, r.found) })),
    done: ev.done.map(d => d.name), value: ev.value,
    ...(lo ? { risk: knownRisk(lo.sum) } : {}),
  };
}

/* ----- 0.24.0: výbava rozpoznaná ze snímků ----- */
/* Výbava zapsaná u automatického záznamu raidu (zbraně s tierem, augment, štít a předměty z loadoutu; ze snímku
   loadoutu nebo FINDINGS) a její hodnota podle prodejních cen z katalogu. Hodnota jen ze známých cen; předměty bez
   ceny se vypíšou zvlášť (nic se nehádá). null = záznam není automatický nebo výbavu nemá. */
export interface RaidGear { names: string[]; value: number; unknown: string[]; lost: boolean }
export function raidGear(raid: Pick<Raid, 'gear' | 'ok' | 'auto'> | null): RaidGear | null {
  if (!raid?.auto || !raid.gear.length) return null;
  let value = 0;
  const unknown: string[] = [];
  for (const g of raid.gear) {
    const f = itemFacts(g.name);
    if (f.value === null) unknown.push(g.name); else value += f.value * g.qty;
  }
  return { names: raid.gear.map(g => (g.qty > 1 ? `${g.qty}× ${g.name}` : g.name)), value, unknown, lost: !raid.ok };
}
