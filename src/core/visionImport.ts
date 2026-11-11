/* Převod rozpoznaných snímků na změny stavu. analyzeShots připraví potvrzovací tabulku STASH (skupiny stejných
   předmětů, kontrolní součet, mince); applyVisionImport po potvrzení změní stav. analyzeLoot přečte BACKPACK
   a QUICK USE ze snímku po raidu pro předvyplnění lootu. Všechny funkce jsou čisté: snímek stavu a uložení přidává
   store. Pořadí rozpoznání: název z tooltipu, naučené otisky, katalog (MetaForge). */
import type { AppState, ItemCategory, ItemQty, LearnedFp } from './types';
import { ITEM_CATEGORIES, LEARNED_MAX, itemKey } from './types';
import { getMaterials } from './gamedata';
import { OTHER_CATEGORY } from './gametext';
import { LIMITS } from './state';
import { clampInt, text, uid } from './util';
import type { CellRead, PanelRead, ScreenRead, VisionWarning } from './vision/read';
import type { Rarity } from './vision/rarity';
import type { Tier } from './vision/digits';
import type { PanelId } from './vision/layout';
import { hiddenCount, isCell, mergePanels, occupied, type MergedPanel } from './vision/merge';
import { MATCH_SURE, clusterFps, matchFp, type CatalogFp, type FpKind, type Match } from './vision/match';
import { similarity } from './vision/fingerprint';
import { categoryFromTag, catalogByName, itemCategoryOf, matchName } from './catalog';

export type ImportWarning = VisionWarning | 'noOverlap' | 'differentState' | 'checksum';

/* Políčko skupiny: snímek, řádek a sloupec v tom snímku, řádek ve spojeném výsledku (u lootu panel). */
export interface CellRef { shot: number; row: number; col: number; merged: number; panel?: PanelId }

export interface ImportGroup {
  id: string;
  cells: CellRef[];
  fp: number[]; rarity: Rarity; tier: Tier | null;
  /* součet počtů (políčko bez počtu = 1 kus); null = žádný počet nešel přečíst */
  count: number | null;
  countSure: boolean;
  match: Match;
  /* kategorie podle štítku tooltipu, když název v katalogu chybí */
  tagCategory?: ItemCategory | 'material';
}

export interface ImportAnalysis {
  groups: ImportGroup[];
  merged: MergedPanel | null;
  headerSlots: number | null; headerSlotsMax: number | null;
  found: number;
  /* místa zakrytá tooltipem, která žádný jiný snímek neukázal (nepočítají se do found) */
  hidden: number;
  checksumOk: boolean;
  /* „chybějící na 0“ jde jen při sedícím součtu a nefiltrovaném stashi (hlavička s maximem, např. 200/268) */
  canZero: boolean;
  coins: number | null; stashValue: number | null;
  profile: { cellPx: number; ui: number } | null;
  warnings: ImportWarning[];
}

/* Co rozpoznávání zná kromě naučených otisků: katalog a názvy, ke kterým se přiřadí text z tooltipu. */
export interface MatchContext {
  catalog?: CatalogFp[];
  /* materiály aplikace (přesné názvy) */
  materials?: string[];
  /* další známé názvy (katalog, evidované předměty) */
  names?: string[];
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const firstOf = <T>(xs: (T | null)[]): T | null => xs.find(x => x !== null) ?? null;

interface Located { c: CellRead; ref: CellRef }
interface TipEntry { fp: number[]; rarity: Rarity; itemKey: string; kind: FpKind; tag: ItemCategory | 'material' | null }

/* Název z tooltipu přiřazený ke známému názvu (materiál aplikace, katalog, evidence). */
function resolveTooltip(c: CellRead, tag: string, ctx: MatchContext): TipEntry | null {
  if (!c.name) return null;
  const materials = ctx.materials ?? [];
  const hit = matchName(c.name, [...materials, ...(ctx.names ?? [])]);
  if (!hit) return null;
  const tagCat = categoryFromTag(tag);
  const cat = catalogByName(hit.name)?.category ?? tagCat;
  const kind: FpKind = materials.includes(hit.name) || cat === 'material' ? 'material' : 'item';
  return { fp: c.fp, rarity: c.rarity, itemKey: hit.name, kind, tag: tagCat };
}

/* Rozpoznání políček a seskupení stejných předmětů (sdílí import STASH i loot z batohu). */
function groupCells(cells: Located[], tips: TipEntry[], learned: LearnedFp[], ctx: MatchContext): ImportGroup[] {
  const tipFor = (c: CellRead): TipEntry | undefined => tips.find(t => t.fp === c.fp) ?? tips.find(t => t.rarity === c.rarity && similarity(t.fp, c.fp) >= MATCH_SURE);
  const matched = cells.map(x => {
    const tip = tipFor(x.c);
    const m: Match = tip ? { status: 'known', itemKey: tip.itemKey, kind: tip.kind, score: 1, source: 'tooltip' } : matchFp(x.c.fp, x.c.rarity, learned, ctx.catalog ?? []);
    return { ...x, m, tip, fp: x.c.fp, rarity: x.c.rarity };
  });
  const groups: ImportGroup[] = [];
  const toGroup = (list: typeof matched, match: Match) => {
    const counts = list.map(x => x.c.count ?? (x.c.countText ? null : 1));
    const readable = counts.filter((n): n is number => n !== null);
    const tip = list.find(x => x.tip)?.tip;
    groups.push({
      id: `g${list[0].ref.panel ? list[0].ref.panel + '-' : ''}${list[0].ref.shot}-${list[0].ref.row}-${list[0].ref.col}`,
      cells: list.map(x => x.ref), fp: list[0].c.fp, rarity: list[0].c.rarity, tier: list[0].c.tier,
      count: readable.length ? readable.reduce((a, b) => a + b, 0) : null,
      countSure: readable.length === counts.length && list.every(x => x.c.countConf >= 0.6),
      match, ...(tip?.tag ? { tagCategory: tip.tag } : {}),
    });
  };
  /* Poznané se seskupí podle klíče (a tieru), neznámé podle podobnosti ikon. */
  const known = new Map<string, typeof matched>();
  for (const x of matched) if (x.m.itemKey !== null) {
    const k = `${x.m.kind}:${x.m.itemKey}:${x.c.tier ?? ''}`;
    known.set(k, [...(known.get(k) || []), x]);
  }
  for (const list of known.values()) toGroup(list, list.reduce((a, x) => (x.m.score < a.score ? x.m : a), list[0].m));
  for (const list of clusterFps(matched.filter(x => x.m.itemKey === null))) toGroup(list, list[0].m);
  return groups;
}

export function analyzeShots(reads: ScreenRead[], learned: LearnedFp[], ctx: MatchContext = {}): ImportAnalysis {
  /* Zakrytí hlásí až spojený STASH (nápověda přes batoh se importu stashe netýká). */
  const warnings: ImportWarning[] = uniq(reads.flatMap(r => r.warnings)).filter(w => w !== 'occluded');
  const withStash = reads.map((r, shot) => ({ r, shot, p: r.panels.find(p => p.panel === 'stash') })).filter(x => x.p);
  const empty: ImportAnalysis = {
    groups: [], merged: null, headerSlots: null, headerSlotsMax: null, found: 0, hidden: 0, checksumOk: false, canZero: false,
    coins: firstOf(reads.map(r => r.coins)), stashValue: null, profile: null, warnings,
  };
  if (!withStash.length) return empty;

  const merged = mergePanels(withStash.map(x => x.p!));
  warnings.push(...merged.warnings);
  const stashReads = withStash.map(x => x.r);
  const values = uniq(stashReads.map(r => r.stashValue).filter((v): v is number => v !== null));
  const slots = uniq(stashReads.map(r => r.headerSlots).filter((v): v is number => v !== null));
  if (values.length > 1 || slots.length > 1) warnings.push('differentState');

  /* Políčka spojeného výsledku s odkazem na původní snímek. */
  const cells: Located[] = merged.rows.flatMap((row, mi) => row.flatMap((c, col) => (isCell(c) ? [{ c, ref: { shot: withStash[merged.source[mi].shot].shot, row: merged.source[mi].row, col, merged: mi } }] : [])));
  /* Tooltip pojmenuje své políčko; políčka se stejnou ikonou se pak poznají podle něj. */
  const tips = cells.flatMap(x => { const t = resolveTooltip(x.c, reads[x.ref.shot].tooltip?.category ?? '', ctx); return t ? [t] : []; });
  const groups = groupCells(cells, tips, learned, ctx);
  /* Pořadí skupin podle prvního políčka ve stashi. id = první políčko skupiny (snímek-řádek-sloupec): stálé při
     novém výpočtu, takže výběr v tabulce zůstane. */
  const pos = (g: ImportGroup) => Math.min(...g.cells.map(c => c.merged * 100 + c.col));
  groups.sort((a, b) => pos(a) - pos(b));

  const headerSlots = firstOf(stashReads.map(r => r.headerSlots));
  const headerSlotsMax = firstOf(stashReads.map(r => r.headerSlotsMax));
  const found = occupied(merged), hidden = hiddenCount(merged);
  if (hidden) warnings.push('occluded');
  const checksumOk = headerSlots !== null && found === headerSlots;
  if (!checksumOk) warnings.push('checksum');
  const first = stashReads[0];
  return {
    groups, merged, headerSlots, headerSlotsMax, found, hidden, checksumOk, canZero: checksumOk && headerSlotsMax !== null,
    coins: firstOf(reads.map(r => r.coins)), stashValue: firstOf(stashReads.map(r => r.stashValue)),
    profile: first.cellPx ? { cellPx: first.cellPx, ui: first.ui } : null,
    warnings: uniq(warnings),
  };
}

/* Cíl řádku tabulky: materiál z aplikace, nový vlastní materiál, předmět do evidence (Vybavení), nebo nezapisovat. */
export type Target =
  | { kind: 'material'; name: string }
  | { kind: 'newMaterial'; name: string }
  | { kind: 'item'; name: string; category: ItemCategory }
  | { kind: 'skip' };

/* Kategorie předmětu: evidence, katalog, štítek tooltipu, jinak „ostatní“. */
export function itemCategoryFor(name: string, g: Pick<ImportGroup, 'tagCategory'> | null, items: AppState['items'] = {}): ItemCategory {
  const own = Object.values(items).find(x => x.name === name)?.category;
  if (own) return own;
  const cat = catalogByName(name)?.category;
  if (cat) return itemCategoryOf(cat);
  const tag = g?.tagCategory;
  return tag && tag !== 'material' && ITEM_CATEGORIES.includes(tag) ? tag : 'other';
}

export function defaultTarget(g: ImportGroup, materials: string[], items: AppState['items'] = {}): Target {
  const m = g.match;
  if (m.status === 'unknown' || !m.itemKey) return { kind: 'skip' };
  if (materials.includes(m.itemKey)) return { kind: 'material', name: m.itemKey };
  /* Materiál, který aplikace zatím nevede (např. Battery), se nabídne jako nový vlastní materiál. */
  if (m.kind === 'material') return { kind: 'newMaterial', name: m.itemKey };
  /* Ostatní předměty jdou do evidence vybavení. */
  return { kind: 'item', name: m.itemKey, category: itemCategoryFor(m.itemKey, g, items) };
}

export interface VisionApply {
  rows: { group: ImportGroup; target: Target; count: number }[];
  /* null = mince se nemění */
  coins: number | null;
  zeroMissing: boolean;
  canZero: boolean;
  profile: { cellPx: number; ui: number } | null;
}
export interface VisionSummary { materials: number; items: number; zeroed: number; newMaterials: number; coins: number | null; learned: number; other: number }

/* Přidá naučený otisk. Téměř stejný otisk téhož předmětu jen obnoví čas; otisk, který dřív patřil jinému předmětu,
   se nahradí (hráč rozpoznání opravil). Nejstarší otisky nad limit se odmažou. U předmětů je klíčem název
   (tier se čte z políčka, ikona je pro všechny tiery stejná). */
export function addLearned(list: LearnedFp[], e: { itemKey: string; kind: FpKind; fp: number[]; rarity?: Rarity }, now: number): LearnedFp[] {
  const sameRarity = (x: LearnedFp) => !x.rarity || !e.rarity || x.rarity === e.rarity;
  const out = list.filter(x => !(sameRarity(x) && (x.itemKey !== e.itemKey || x.kind !== e.kind) && similarity(x.fp, e.fp) >= MATCH_SURE));
  const dup = out.find(x => x.itemKey === e.itemKey && x.kind === e.kind && sameRarity(x) && similarity(x.fp, e.fp) >= 0.99);
  if (dup) dup.at = now;
  else out.push({ id: uid() + out.length, itemKey: text(e.itemKey, 120), kind: e.kind, fp: e.fp.map(v => clampInt(v, 0, 255)), ...(e.rarity ? { rarity: e.rarity } : {}), at: now });
  return out.sort((a, b) => a.at - b.at).slice(-LEARNED_MAX);
}

/* Klíč, který by se naučil pro daný cíl (materiál / předmět podle názvu, '' = jiný předmět bez zápisu). */
const learnKey = (t: Target): { itemKey: string; kind: FpKind } =>
  t.kind === 'skip' ? { itemKey: '', kind: 'item' } : { itemKey: text(t.name, 80).trim(), kind: t.kind === 'item' ? 'item' : 'material' };

/* Učí se vše, co už není naučené pod stejným klíčem: oprava, nové pojmenování, ale i shoda z tooltipu nebo katalogu
   (otisk ze hry je přesnější než otisk z ikony katalogu). */
const alreadyLearned = (m: Match, t: Target): boolean => {
  const k = learnKey(t);
  return m.status === 'known' && m.source === 'learned' && m.kind === k.kind && m.itemKey === k.itemKey;
};

export function applyVisionImport(s: AppState, input: VisionApply, now: number): VisionSummary {
  const sum: VisionSummary = { materials: 0, items: 0, zeroed: 0, newMaterials: 0, coins: null, learned: 0, other: 0 };
  const counts = new Map<string, number>();
  const itemCounts = new Map<string, { name: string; category: ItemCategory; tier?: Tier; count: number }>();
  for (const r of input.rows) {
    const t = r.target;
    if (t.kind === 'skip') { sum.other++; continue; }
    const name = text(t.name, 80).trim();
    if (!name) { sum.other++; continue; }
    if (t.kind === 'item') {
      const tier = r.group.tier ?? undefined;
      const key = itemKey(name, tier);
      const cur = itemCounts.get(key);
      itemCounts.set(key, { name, category: ITEM_CATEGORIES.includes(t.category) ? t.category : 'other', ...(tier ? { tier } : {}), count: (cur?.count || 0) + Math.max(0, r.count) });
      continue;
    }
    if (t.kind === 'newMaterial' && !getMaterials(s).some(m => m.name === name)) {
      s.gameData.materialsCustom.push({ name, category: OTHER_CATEGORY, source: '' });
      sum.newMaterials++;
    }
    counts.set(name, (counts.get(name) || 0) + Math.max(0, r.count));
  }
  for (const [name, n] of counts) {
    const v = clampInt(n, LIMITS.inventory[0], LIMITS.inventory[1]);
    if (v) s.inventory[name] = v; else delete s.inventory[name];
    sum.materials++;
  }
  /* Rozpoznané předměty dostanou přesný počet (přepis), stejně jako materiály. */
  for (const [key, it] of itemCounts) {
    const v = clampInt(it.count, 0, LIMITS.inventory[1]);
    if (v) s.items[key] = { key, name: it.name, category: it.category, ...(it.tier ? { tier: it.tier } : {}), count: v };
    else delete s.items[key];
    sum.items++;
  }
  if (input.zeroMissing && input.canZero) {
    for (const m of getMaterials(s)) if (!counts.has(m.name) && s.inventory[m.name]) { delete s.inventory[m.name]; sum.zeroed++; }
    for (const key of Object.keys(s.items)) if (!itemCounts.has(key)) { delete s.items[key]; sum.zeroed++; }
  }
  if (input.coins !== null) { s.profile.coins = clampInt(input.coins, LIMITS.coins[0], LIMITS.coins[1]); sum.coins = s.profile.coins; }
  for (const r of input.rows) {
    if (alreadyLearned(r.group.match, r.target)) continue;
    const e = learnKey(r.target);
    if (r.target.kind !== 'skip' && !e.itemKey) continue;
    s.vision.learned = addLearned(s.vision.learned, { ...e, fp: r.group.fp, rarity: r.group.rarity }, now);
    sum.learned++;
  }
  s.vision.lastImportAt = now;
  if (input.profile) s.vision.profile = { ...input.profile };
  return sum;
}

/* ----- loot ze snímku po raidu (BACKPACK + QUICK USE) ----- */

export interface LootAnalysis {
  groups: ImportGroup[];
  backpack: { slots: number | null; max: number | null; cells: number } | null;
  quickUse: { slots: number | null; max: number | null; cells: number } | null;
  /* batoh i quick use jsou prázdné (např. KNOCKED OUT) */
  empty: boolean;
  /* na snímku není batoh */
  noBackpack: boolean;
}

const LOOT_PANELS: PanelId[] = ['backpack', 'quickUse'];

/* Přečte batoh a quick use ze snímku obrazovky FINDINGS po raidu nebo z INVENTORY (výbava EQUIPMENT se ignoruje). */
export function analyzeLoot(read: ScreenRead, learned: LearnedFp[], ctx: MatchContext = {}): LootAnalysis {
  const panel = (id: PanelId): PanelRead | undefined => read.panels.find(p => p.panel === id);
  const cells: Located[] = LOOT_PANELS.flatMap(id => panel(id)?.cells.map(c => ({ c, ref: { shot: 0, row: c.row, col: c.col, merged: c.row, panel: id } })) ?? []);
  const tips = cells.flatMap(x => { const t = resolveTooltip(x.c, read.tooltip?.category ?? '', ctx); return t ? [t] : []; });
  const groups = groupCells(cells, tips, learned, ctx);
  const order = (g: ImportGroup) => Math.min(...g.cells.map(c => (c.panel === 'quickUse' ? 1000 : 0) + c.row * 10 + c.col));
  groups.sort((a, b) => order(a) - order(b));
  const info = (id: PanelId) => { const p = panel(id); return p ? { slots: p.slots, max: p.slotsMax, cells: p.cells.length } : null; };
  const backpack = info('backpack'), quickUse = info('quickUse');
  return { groups, backpack, quickUse, empty: !cells.length && !!backpack, noBackpack: !backpack };
}

/* Loot = obsah batohu a quick use minus výbava zadaná pro raid (stejný název, bez ohledu na velikost písmen).
   Co by vyšlo záporné nebo nulové, se vynechá. */
export function lootMinusGear(found: ItemQty[], gear: ItemQty[]): ItemQty[] {
  const left = new Map<string, number>();
  for (const g of gear) { const k = g.name.trim().toLowerCase(); left.set(k, (left.get(k) || 0) + g.qty); }
  const out: ItemQty[] = [];
  for (const f of found) {
    const k = f.name.trim().toLowerCase();
    const take = Math.min(left.get(k) || 0, f.qty);
    if (take) left.set(k, (left.get(k) || 0) - take);
    const qty = f.qty - take;
    if (qty <= 0) continue;
    const same = out.find(o => o.name.toLowerCase() === k);
    if (same) same.qty += qty; else out.push({ name: f.name.trim(), qty });
  }
  return out;
}

/* Sloučí předvyplněný loot do seznamu lootu formuláře (stejný název se sečte). */
export function mergeLoot(loot: ItemQty[], add: ItemQty[], max = 99999): ItemQty[] {
  const out = loot.map(x => ({ ...x }));
  for (const a of add) {
    const i = out.findIndex(o => o.name.toLowerCase() === a.name.toLowerCase());
    if (i >= 0) out[i].qty = Math.min(max, out[i].qty + a.qty); else if (out.length < 100) out.push({ ...a });
  }
  return out;
}
