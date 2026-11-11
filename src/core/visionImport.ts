/* Převod rozpoznaných snímků STASH na změny stavu. analyzeShots připraví potvrzovací tabulku (skupiny stejných
   předmětů, kontrolní součet, mince); applyVisionImport po potvrzení změní stav. Obě funkce jsou čisté:
   snímek stavu a uložení přidává store. */
import type { AppState, LearnedFp } from './types';
import { LEARNED_MAX } from './types';
import { getMaterials } from './gamedata';
import { OTHER_CATEGORY } from './gametext';
import { LIMITS } from './state';
import { clampInt, text, uid } from './util';
import type { ScreenRead, VisionWarning } from './vision/read';
import type { Rarity } from './vision/rarity';
import type { Tier } from './vision/digits';
import { hiddenCount, isCell, mergePanels, occupied, type MergedPanel } from './vision/merge';
import { MATCH_SURE, clusterFps, matchFp, type FpKind, type Match } from './vision/match';
import { similarity } from './vision/fingerprint';

export type ImportWarning = VisionWarning | 'noOverlap' | 'differentState' | 'checksum';

/* Políčko skupiny: snímek, řádek a sloupec v tom snímku, řádek ve spojeném výsledku. */
export interface CellRef { shot: number; row: number; col: number; merged: number }

export interface ImportGroup {
  id: string;
  cells: CellRef[];
  fp: number[]; rarity: Rarity; tier: Tier | null;
  /* součet počtů (políčko bez počtu = 1 kus); null = žádný počet nešel přečíst */
  count: number | null;
  countSure: boolean;
  match: Match;
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

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const firstOf = <T>(xs: (T | null)[]): T | null => xs.find(x => x !== null) ?? null;

export function analyzeShots(reads: ScreenRead[], learned: LearnedFp[]): ImportAnalysis {
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
  const cells = merged.rows.flatMap((row, mi) => row.flatMap((c, col) => (isCell(c) ? [{ c, ref: { shot: withStash[merged.source[mi].shot].shot, row: merged.source[mi].row, col, merged: mi } }] : [])));
  const matched = cells.map(x => ({ ...x, m: matchFp(x.c.fp, x.c.rarity, learned), fp: x.c.fp, rarity: x.c.rarity }));
  const groups: ImportGroup[] = [];
  const toGroup = (list: typeof matched, match: Match) => {
    const counts = list.map(x => x.c.count ?? (x.c.countText ? null : 1));
    const readable = counts.filter((n): n is number => n !== null);
    groups.push({
      id: `g${list[0].ref.shot}-${list[0].ref.row}-${list[0].ref.col}`, cells: list.map(x => x.ref), fp: list[0].c.fp, rarity: list[0].c.rarity, tier: list[0].c.tier,
      count: readable.length ? readable.reduce((a, b) => a + b, 0) : null,
      countSure: readable.length === counts.length && list.every(x => x.c.countConf >= 0.6),
      match,
    });
  };
  /* Poznané (naučené nebo z katalogu) se seskupí podle klíče, neznámé podle podobnosti ikon. */
  const known = new Map<string, typeof matched>();
  for (const x of matched) if (x.m.itemKey !== null) {
    const k = `${x.m.kind}:${x.m.itemKey}:${x.c.tier ?? ''}`;
    known.set(k, [...(known.get(k) || []), x]);
  }
  for (const list of known.values()) toGroup(list, list.reduce((a, x) => (x.m.score < a.score ? x.m : a), list[0].m));
  for (const list of clusterFps(matched.filter(x => x.m.itemKey === null))) toGroup(list, list[0].m);
  /* Pořadí skupin podle prvního políčka ve stashi. */
  const pos = (g: ImportGroup) => Math.min(...g.cells.map(c => c.merged * 100 + c.col));
  groups.sort((a, b) => pos(a) - pos(b));
  /* id = první políčko skupiny (snímek-řádek-sloupec): stálé při novém výpočtu, takže výběr v tabulce zůstane. */

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

/* Cíl řádku tabulky: materiál z aplikace, nový vlastní materiál, nebo jiný předmět (v 3a se nezapisuje). */
export type Target = { kind: 'material'; name: string } | { kind: 'newMaterial'; name: string } | { kind: 'skip' };

export function defaultTarget(g: ImportGroup, materials: string[]): Target {
  if (g.match.kind === 'material' && g.match.itemKey && g.match.status !== 'unknown' && materials.includes(g.match.itemKey)) return { kind: 'material', name: g.match.itemKey };
  return { kind: 'skip' };
}

export interface VisionApply {
  rows: { group: ImportGroup; target: Target; count: number }[];
  /* null = mince se nemění */
  coins: number | null;
  zeroMissing: boolean;
  canZero: boolean;
  profile: { cellPx: number; ui: number } | null;
}
export interface VisionSummary { materials: number; zeroed: number; newMaterials: number; coins: number | null; learned: number; other: number }

/* Přidá naučený otisk. Téměř stejný otisk téhož předmětu jen obnoví čas; otisk, který dřív patřil jinému předmětu,
   se nahradí (hráč rozpoznání opravil). Nejstarší otisky nad limit se odmažou. */
export function addLearned(list: LearnedFp[], e: { itemKey: string; kind: FpKind; fp: number[]; rarity?: Rarity }, now: number): LearnedFp[] {
  const sameRarity = (x: LearnedFp) => !x.rarity || !e.rarity || x.rarity === e.rarity;
  const out = list.filter(x => !(sameRarity(x) && (x.itemKey !== e.itemKey || x.kind !== e.kind) && similarity(x.fp, e.fp) >= MATCH_SURE));
  const dup = out.find(x => x.itemKey === e.itemKey && x.kind === e.kind && sameRarity(x) && similarity(x.fp, e.fp) >= 0.99);
  if (dup) dup.at = now;
  else out.push({ id: uid() + out.length, itemKey: text(e.itemKey, 120), kind: e.kind, fp: e.fp.map(v => clampInt(v, 0, 255)), ...(e.rarity ? { rarity: e.rarity } : {}), at: now });
  return out.sort((a, b) => a.at - b.at).slice(-LEARNED_MAX);
}

const sameTarget = (m: Match, t: Target): boolean =>
  m.status === 'known' && (t.kind === 'skip' ? m.kind === 'item' : t.kind === 'material' && m.kind === 'material' && m.itemKey === t.name);

export function applyVisionImport(s: AppState, input: VisionApply, now: number): VisionSummary {
  const sum: VisionSummary = { materials: 0, zeroed: 0, newMaterials: 0, coins: null, learned: 0, other: 0 };
  const counts = new Map<string, number>();
  for (const r of input.rows) {
    const t = r.target;
    if (t.kind === 'skip') { sum.other++; continue; }
    const name = text(t.name, 80).trim();
    if (!name) { sum.other++; continue; }
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
  if (input.zeroMissing && input.canZero) {
    for (const m of getMaterials(s)) if (!counts.has(m.name) && s.inventory[m.name]) { delete s.inventory[m.name]; sum.zeroed++; }
  }
  if (input.coins !== null) { s.profile.coins = clampInt(input.coins, LIMITS.coins[0], LIMITS.coins[1]); sum.coins = s.profile.coins; }
  for (const r of input.rows) {
    if (sameTarget(r.group.match, r.target)) continue;
    const e = r.target.kind === 'skip'
      ? { itemKey: '', kind: 'item' as const }
      : { itemKey: text(r.target.name, 80).trim(), kind: 'material' as const };
    if (e.kind === 'material' && !e.itemKey) continue;
    s.vision.learned = addLearned(s.vision.learned, { ...e, fp: r.group.fp, rarity: r.group.rarity }, now);
    sum.learned++;
  }
  s.vision.lastImportAt = now;
  if (input.profile) s.vision.profile = { ...input.profile };
  return sum;
}
