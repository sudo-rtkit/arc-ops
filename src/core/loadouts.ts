/* Loadout Planner: uložené sestavy výbavy a jejich výsledky z Raid Journalu.
   0.23.0 (schéma 19): loadout builder. Sestava podle míst ve hře (augment, štít, dvě zbraně, BACKPACK, QUICK USE,
   AUGMENTED SLOTS, SAFE POCKET), počty míst a mez váhy (výchozí podle obrazovek hry, jinak upravitelné), a součty:
   hodnota podle prodejních cen z katalogu, váha proti mezi, dostupnost ve skrýši a hodnota v riziku při vyřazení
   (vše kromě bezpečné kapsy). Neznámé zůstává neznámé: předmět bez ceny nebo váhy v katalogu se do součtu nepočítá
   a vypíše se zvlášť; zbraň bez uvedeného tieru má cenu jen tehdy, když je stejná pro všechny tiery. Čisté funkce. */
import type { AppState, ItemQty, ItemTier, Loadout, LoadoutKind, LoadoutSlots, Raid } from './types';
import { ITEM_TIERS } from './types';
import { clampInt, isObj, text, uid } from './util';
import { normalizeItems } from './raidItems';
import { runStats } from './runs';
import { ITEM_DATA, type ItemDataRow } from './data/itemdata';

export const LOADOUT_PURPOSES = ['Money run', 'Lov ARC', 'PvP', 'Questy', 'Trials', 'Free Loadout', 'Jiné'];
export const LOADOUT_KINDS: readonly LoadoutKind[] = ['custom', 'free'];

/* Výchozí počty míst a mez váhy podle obrazovek hry (MANAGE LOADOUT, 0.22.1 vlastní snímky hráče):
   vlastní loadout bez augmentu 0/20 batoh, 0/5 quick use, 0/1 augmented, 0/3 safe pocket, váha 0.0/30.0;
   volný loadout 0/14 a 0/4, váha 0.0/35.0, bez bezpečné kapsy („no Safe Pocket“) a bez augmented slots.
   S augmentem se počty mohou lišit; katalog je neuvádí, proto jdou upravit. */
export const LOADOUT_PRESETS: Readonly<Record<LoadoutKind, Readonly<LoadoutSlots>>> = {
  custom: { backpack: 20, quickUse: 5, augmented: 1, safe: 3, weight: 30 },
  free: { backpack: 14, quickUse: 4, augmented: 0, safe: 0, weight: 35 },
};
export const SLOT_MAX = 60;
export const WEIGHT_MAX = 500;
const LIST_MAX = 40;

export type LoadoutSection = 'augment' | 'shield' | 'weapon1' | 'weapon2' | 'backpack' | 'quickUse' | 'augmented' | 'safe';
export const LOADOUT_SECTIONS: readonly LoadoutSection[] = ['augment', 'shield', 'weapon1', 'weapon2', 'backpack', 'quickUse', 'augmented', 'safe'];
/* Místa s počtem (seznamy předmětů) a jejich klíč v Loadout. */
export type ListSection = 'backpack' | 'quickUse' | 'augmented' | 'safe';
export const LIST_SECTIONS: readonly ListSection[] = ['backpack', 'quickUse', 'augmented', 'safe'];
const LIST_KEY: Record<ListSection, 'items' | 'quickUse' | 'augmented' | 'safe'> = { backpack: 'items', quickUse: 'quickUse', augmented: 'augmented', safe: 'safe' };
export const sectionItems = (l: Loadout, s: ListSection): ItemQty[] => l[LIST_KEY[s]];
export const withSectionItems = (l: Loadout, s: ListSection, items: ItemQty[]): Loadout => ({ ...l, [LIST_KEY[s]]: items });

const tierOf = (v: unknown): ItemTier | '' => (ITEM_TIERS.includes(v as ItemTier) ? (v as ItemTier) : '');
const slotNum = (v: unknown, max: number, decimals = 0): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  const f = 10 ** decimals;
  return Math.min(max, Math.round(n * f) / f);
};
export function normalizeSlots(raw: unknown, kind: LoadoutKind): LoadoutSlots {
  const d = LOADOUT_PRESETS[kind];
  if (!isObj(raw)) return { ...d };
  /* chybějící klíč = výchozí; výslovné null = neznámé */
  const pick = (k: keyof LoadoutSlots, max: number, dec = 0) => (k in raw ? slotNum(raw[k], max, dec) : d[k]);
  return { backpack: pick('backpack', SLOT_MAX), quickUse: pick('quickUse', SLOT_MAX), augmented: pick('augmented', SLOT_MAX), safe: pick('safe', SLOT_MAX), weight: pick('weight', WEIGHT_MAX, 1) };
}

/* Schéma 19: starší loadout dostane druh (volný jen s účelem „Free Loadout“), tiery '' (neuvedené), prázdná nová
   místa a výchozí počty míst svého druhu. */
export function normalizeLoadout(x: Record<string, unknown>): Loadout {
  const kind: LoadoutKind = LOADOUT_KINDS.includes(x.kind as LoadoutKind) ? (x.kind as LoadoutKind) : x.purpose === 'Free Loadout' ? 'free' : 'custom';
  return {
    id: text(x.id || uid(), 24), name: text(x.name, 80).trim() || 'Loadout', purpose: text(x.purpose, 40),
    primary: text(x.primary, 60), secondary: text(x.secondary, 60), augment: text(x.augment, 80), shield: text(x.shield, 80),
    items: normalizeItems(x.items, LIST_MAX), note: text(x.note, 2000),
    kind, primaryTier: tierOf(x.primaryTier), secondaryTier: tierOf(x.secondaryTier),
    quickUse: normalizeItems(x.quickUse, LIST_MAX), augmented: normalizeItems(x.augmented, LIST_MAX), safe: normalizeItems(x.safe, LIST_MAX),
    slots: normalizeSlots(x.slots, kind), shop: x.shop === true,
  };
}
export function normalizeLoadouts(raw: unknown): Loadout[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(isObj).slice(0, 100).map(normalizeLoadout).map(l => {
    if (seen.has(l.id)) l.id = uid() + seen.size;
    seen.add(l.id);
    return l;
  });
}
export const emptyLoadout = (kind: LoadoutKind = 'custom'): Loadout => normalizeLoadout({ id: 'new', name: '', purpose: kind === 'free' ? 'Free Loadout' : 'Money run', kind });

/* Název zbraně s tierem („Anvil II“); bez tieru jen název. */
export const weaponLabel = (name: string, tier: ItemTier | ''): string => (name && tier ? `${name} ${tier}` : name);

/* Výbava, kterou loadout předvyplní do zápisu raidu: zbraně, augment, štít a předměty ze všech míst. */
export function loadoutGear(l: Loadout, weaponName: (id: string) => string): ItemQty[] {
  const order: LoadoutSection[] = ['weapon1', 'weapon2', 'augment', 'shield', ...LIST_SECTIONS];
  const lines = loadoutLines(l, weaponName).sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  return normalizeItems(lines.map(x => ({ name: x.name, qty: x.qty })), 200);
}

/* ----- údaje o předmětu z katalogu ----- */
export interface ItemFacts { value: number | null; weight: number | null; stack: number }
const lower = (s: string) => s.trim().toLowerCase();
const ROWS = new Map(ITEM_DATA.map(r => [lower(r.n), r]));
const TIERED = /\s(I|II|III|IV)$/;
const same = (xs: (number | undefined)[]): number | null => (xs.length && xs.every(x => x !== undefined && x === xs[0]) ? (xs[0] as number) : null);
/* Cena (prodejní hodnota), váha a stack. Přesný název má přednost. Název bez tieru u předmětu, který v katalogu
   existuje jen s tiery (zbraně), dostane číslo jen tehdy, když je pro všechny tiery stejné; jinak je neznámé. */
export function itemFacts(name: string): ItemFacts {
  const k = lower(name);
  const r = ROWS.get(k);
  if (r) return { value: r.v ?? null, weight: r.w ?? null, stack: Math.max(1, r.s ?? 1) };
  if (!k || TIERED.test(name.trim())) return { value: null, weight: null, stack: 1 };
  const tiers = ITEM_TIERS.map(t => ROWS.get(`${k} ${t.toLowerCase()}`)).filter((x): x is ItemDataRow => !!x);
  if (!tiers.length) return { value: null, weight: null, stack: 1 };
  return { value: same(tiers.map(t => t.v)), weight: same(tiers.map(t => t.w)), stack: Math.max(1, tiers[0].s ?? 1) };
}

/* ----- řádky loadoutu ----- */
export interface LoadoutLine { section: LoadoutSection; name: string; qty: number }
export function loadoutLines(l: Loadout, weaponName: (id: string) => string): LoadoutLine[] {
  const out: LoadoutLine[] = [];
  if (l.augment.trim()) out.push({ section: 'augment', name: l.augment.trim(), qty: 1 });
  if (l.shield.trim()) out.push({ section: 'shield', name: l.shield.trim(), qty: 1 });
  if (l.primary) out.push({ section: 'weapon1', name: weaponLabel(weaponName(l.primary), l.primaryTier), qty: 1 });
  if (l.secondary) out.push({ section: 'weapon2', name: weaponLabel(weaponName(l.secondary), l.secondaryTier), qty: 1 });
  for (const s of LIST_SECTIONS) for (const i of sectionItems(l, s)) out.push({ section: s, name: i.name, qty: i.qty });
  return out;
}

/* ----- dostupnost ve skrýši ----- */
/* Kolik kusů hráč má (Zásoba i Vybavení, bez ohledu na velikost písmen). Název bez tieru splní kterýkoli tier
   (zbraň „Anvil“ = Anvil i Anvil I–IV); název s tierem jen ten tier. */
export function loadoutHaveOf(s: Pick<AppState, 'inventory' | 'items'>): (name: string) => number {
  const by = new Map<string, number>();
  const add = (k: string, n: number) => { if (n > 0) by.set(lower(k), (by.get(lower(k)) || 0) + n); };
  for (const [k, n] of Object.entries(s.inventory)) add(k, n);
  for (const it of Object.values(s.items)) add(it.key, it.count);
  return name => {
    const k = lower(name);
    let n = by.get(k) || 0;
    if (!TIERED.test(name.trim())) for (const t of ITEM_TIERS) n += by.get(`${k} ${t.toLowerCase()}`) || 0;
    return n;
  };
}

/* ----- souhrn ----- */
export interface LineInfo extends LoadoutLine { unitValue: number | null; value: number | null; weight: number | null; slots: number }
export interface NeedRow { name: string; need: number; have: number; missing: number }
export interface SlotUse { section: ListSection; used: number; max: number | null; over: boolean }
export interface LoadoutSummary {
  kind: LoadoutKind;
  lines: LineInfo[];
  /* hodnota: součet známých cen; unknown = předměty bez ceny v katalogu */
  value: number; valueUnknown: string[];
  /* váha (kg, na desetiny) proti mezi; over = nad mezí (jen se známou mezí) */
  weight: number; weightUnknown: string[]; weightMax: number | null; weightOver: boolean;
  /* v riziku při vyřazení: vše kromě bezpečné kapsy; safeValue = chráněno v bezpečné kapse.
     Volný loadout: výbavu dává hra, ze skrýše se neriskuje nic (free = true). */
  risk: number; riskUnknown: string[]; safeValue: number; free: boolean;
  slots: SlotUse[];
  need: NeedRow[]; missing: NeedRow[];
}
const round1 = (n: number) => Math.round(n * 10) / 10;
export function loadoutSummary(l: Loadout, weaponName: (id: string) => string, haveOf: (name: string) => number): LoadoutSummary {
  const lines: LineInfo[] = loadoutLines(l, weaponName).map(x => {
    const f = itemFacts(x.name);
    const list = (LIST_SECTIONS as readonly string[]).includes(x.section);
    return { ...x, unitValue: f.value, value: f.value === null ? null : f.value * x.qty, weight: f.weight === null ? null : round1(f.weight * x.qty), slots: list ? Math.ceil(x.qty / f.stack) : 0 };
  });
  const names = (xs: LineInfo[]) => [...new Set(xs.map(x => x.name))];
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  const free = l.kind === 'free';
  const atRisk = lines.filter(x => x.section !== 'safe');
  const weight = round1(sum(lines.map(x => x.weight)));
  const weightMax = l.slots.weight;
  const slots = LIST_SECTIONS.map(section => {
    const used = lines.filter(x => x.section === section).reduce((a, x) => a + x.slots, 0);
    const max = l.slots[section];
    return { section, used, max, over: max !== null && used > max };
  });
  const by = new Map<string, NeedRow>();
  for (const x of lines) {
    const k = lower(x.name);
    const r = by.get(k) ?? { name: x.name, need: 0, have: haveOf(x.name), missing: 0 };
    r.need += x.qty;
    by.set(k, r);
  }
  const need = [...by.values()].map(r => ({ ...r, missing: Math.max(0, r.need - r.have) }));
  return {
    kind: l.kind, lines,
    value: sum(lines.map(x => x.value)), valueUnknown: names(lines.filter(x => x.value === null)),
    weight, weightUnknown: names(lines.filter(x => x.weight === null)), weightMax, weightOver: weightMax !== null && weight > weightMax + 1e-9,
    risk: free ? 0 : sum(atRisk.map(x => x.value)), riskUnknown: free ? [] : names(atRisk.filter(x => x.value === null)),
    safeValue: sum(lines.filter(x => x.section === 'safe').map(x => x.value)), free,
    slots, need, missing: need.filter(r => r.missing > 0),
  };
}

/* Pravidla míst: bezpečná kapsa jen tam, kde ji loadout má (počet > 0; volný loadout ji nemá); augmented slots
   stejně. Vrací místa, která v builderu jdou plnit. */
export const usableSections = (l: Pick<Loadout, 'slots'>): ListSection[] =>
  LIST_SECTIONS.filter(s => s === 'backpack' || s === 'quickUse' || l.slots[s] === null || (l.slots[s] ?? 0) > 0);

/* Přepnutí druhu: počty míst a mez váhy na výchozí hodnoty druhu; předměty v místech, která druh nemá, se zahodí
   (volný loadout nemá bezpečnou kapsu ani augmented slots). */
export function switchKind(l: Loadout, kind: LoadoutKind): Loadout {
  const next: Loadout = { ...l, kind, slots: { ...LOADOUT_PRESETS[kind] } };
  for (const s of LIST_SECTIONS) if (!usableSections(next).includes(s)) Object.assign(next, withSectionItems(next, s, []));
  return next;
}

/* ----- porovnání dvou loadoutů ----- */
export type CompareMetric = 'value' | 'risk' | 'weight' | 'missing' | 'slots';
export interface CompareRow { metric: CompareMetric; a: number; b: number; diff: number; unknownA: boolean; unknownB: boolean }
export function compareLoadouts(a: LoadoutSummary, b: LoadoutSummary): CompareRow[] {
  const used = (s: LoadoutSummary) => s.slots.reduce((x, y) => x + y.used, 0);
  const missing = (s: LoadoutSummary) => s.missing.reduce((x, y) => x + y.missing, 0);
  const row = (metric: CompareMetric, va: number, vb: number, ua = false, ub = false): CompareRow => ({ metric, a: va, b: vb, diff: round1(vb - va), unknownA: ua, unknownB: ub });
  return [
    row('value', a.value, b.value, a.valueUnknown.length > 0, b.valueUnknown.length > 0),
    row('risk', a.risk, b.risk, a.riskUnknown.length > 0, b.riskUnknown.length > 0),
    row('weight', a.weight, b.weight, a.weightUnknown.length > 0, b.weightUnknown.length > 0),
    row('missing', missing(a), missing(b)),
    row('slots', used(a), used(b)),
  ];
}

/* ----- nákupní seznam ----- */
export interface LoadoutShopRow { name: string; missing: number; loadouts: string[] }
/* Chybějící předměty loadoutů označených „do nákupního seznamu“; stejný předmět ve více loadoutech = největší chybějící
   počet (loadouty se nepoužívají zároveň, takže se nesčítají). */
export function loadoutShopping(loadouts: Loadout[], weaponName: (id: string) => string, haveOf: (name: string) => number): LoadoutShopRow[] {
  const by = new Map<string, LoadoutShopRow>();
  for (const l of loadouts.filter(x => x.shop)) {
    for (const m of loadoutSummary(l, weaponName, haveOf).missing) {
      const k = lower(m.name);
      const r = by.get(k) ?? { name: m.name, missing: 0, loadouts: [] };
      r.missing = Math.max(r.missing, m.missing);
      r.loadouts.push(l.name);
      by.set(k, r);
    }
  }
  return [...by.values()].sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));
}

/* ----- předvyplnění ze snímku obrazovky ----- */
export type ScanSlot = 'augment' | 'shield' | 'weapon1' | 'weapon2' | 'backpack' | 'quickUse';
export interface ScanRow { slot: ScanSlot; name: string; qty: number }
export interface ScanMeta { kind: 'free' | 'custom' | 'unknown'; backpackMax: number | null; quickUseMax: number | null; weightMax: number | null }
/* Z potvrzených řádků kontroly snímku (jen pojmenované; hráč je zkontroloval) složí loadout. Zbraň se přiřadí ke
   zbrani aplikace podle názvu (tier z konce názvu); neznámá zbraň zůstane pod svým názvem. Počty míst a mez váhy
   jen z přečtených čísel (co se nepřečetlo, zůstane výchozí hodnota druhu). Nic se nehádá: prázdné řádky se vynechají. */
export function loadoutFromScan(rows: ScanRow[], meta: ScanMeta, weapons: { id: string; name: string }[], base: Loadout = emptyLoadout(meta.kind === 'free' ? 'free' : 'custom')): Loadout {
  const kind: LoadoutKind = meta.kind === 'unknown' ? base.kind : meta.kind;
  let l: Loadout = kind === base.kind ? { ...base } : switchKind(base, kind);
  const named = rows.map(r => ({ ...r, name: r.name.trim(), qty: clampInt(r.qty, 1, 99999) })).filter(r => r.name);
  const weapon = (raw: string): { id: string; tier: ItemTier | '' } => {
    const m = /^(.*?)\s+(I|II|III|IV)$/.exec(raw);
    const nm = m ? m[1] : raw, tier = m ? (m[2] as ItemTier) : '';
    const w = weapons.find(x => lower(x.name) === lower(nm));
    return { id: w ? w.id : nm, tier };
  };
  const one = (slot: ScanSlot) => named.find(r => r.slot === slot)?.name ?? '';
  l = { ...l, augment: one('augment') || l.augment, shield: one('shield') || l.shield };
  const w1 = one('weapon1'), w2 = one('weapon2');
  if (w1) { const w = weapon(w1); l = { ...l, primary: w.id, primaryTier: w.tier }; }
  if (w2) { const w = weapon(w2); l = { ...l, secondary: w.id, secondaryTier: w.tier }; }
  const list = (slot: 'backpack' | 'quickUse') => normalizeItems(named.filter(r => r.slot === slot).map(r => ({ name: r.name, qty: r.qty })), LIST_MAX);
  l = { ...l, items: list('backpack'), quickUse: list('quickUse') };
  l.slots = {
    ...l.slots,
    ...(meta.backpackMax !== null ? { backpack: Math.min(SLOT_MAX, meta.backpackMax) } : {}),
    ...(meta.quickUseMax !== null ? { quickUse: Math.min(SLOT_MAX, meta.quickUseMax) } : {}),
    ...(meta.weightMax !== null ? { weight: Math.min(WEIGHT_MAX, meta.weightMax) } : {}),
  };
  return l;
}

/* ----- výsledky z deníku ----- */
export interface LoadoutStats { id: string; n: number; ok: number; rate: number; coins: number; perHour: number; avg: number; lost: number }

/* Výsledky podle loadoutu. Raid bez loadoutu má klíč ''. */
export function loadoutStats(raids: Raid[]): LoadoutStats[] {
  const groups: Record<string, Raid[]> = {};
  for (const r of raids) (groups[r.loadout || ''] ||= []).push(r);
  return Object.entries(groups).map(([id, list]) => {
    const s = runStats(list);
    return { id, n: s.n, ok: s.ok, rate: s.rate, coins: s.coins, perHour: s.perHour, avg: s.avg, lost: list.reduce((a, r) => a + r.lost.reduce((b, i) => b + i.qty, 0), 0) };
  }).sort((a, b) => b.perHour - a.perHour || b.n - a.n);
}

export interface ItemTally { name: string; qty: number; raids: number }
/* Součet položek přes raidy (ztráty, loot); raids = v kolika raidech se položka objevila. */
export function tallyItems(raids: Raid[], pick: (r: Raid) => ItemQty[]): ItemTally[] {
  const by: Record<string, ItemTally> = {};
  for (const r of raids) for (const i of pick(r)) {
    const t = (by[i.name] ||= { name: i.name, qty: 0, raids: 0 });
    t.qty += i.qty; t.raids++;
  }
  return Object.values(by).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}
