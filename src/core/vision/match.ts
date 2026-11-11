/* Párování otisku ikony s naučenými otisky (přednost) a s katalogem (milník 3b). Pod prahem vrací „neznámé“.
   Stejná ikona s jinou vzácností je jiný předmět, takže se různé známé vzácnosti nepárují. */
import { similarity } from './fingerprint';
import type { Rarity } from './rarity';

/* Prahy podle vzorků: stejné předměty ≥ 0,985 (i napříč měřítky), různé ≤ 0,91. */
export const MATCH_SURE = 0.95;
export const MATCH_MAYBE = 0.93;

export type FpKind = 'material' | 'item';
/* Naučený otisk. itemKey = název materiálu, nebo klíč předmětu (3b: název + tier); '' = jiný předmět bez názvu. */
export interface LearnedFp { id: string; itemKey: string; kind: FpKind; fp: number[]; rarity?: Rarity; at: number }
/* Položka katalogu s otiskem (3b, generuje scripts/gen-catalog.mjs). */
export interface CatalogFp { key: string; kind: FpKind; fp?: number[]; rarity?: Rarity }

export interface Match {
  status: 'known' | 'uncertain' | 'unknown';
  itemKey: string | null; kind: FpKind | null; score: number; source: 'learned' | 'catalog' | 'tooltip' | null;
}

/* Katalog má otisky z ikon MetaForge, ne ze hry: shoda bývá nižší (0,90–0,99) než u naučených otisků, ale druhý
   nejlepší předmět je výrazně níž. Rozhoduje proto i odstup od druhého nejlepšího. */
export const CATALOG_SURE = 0.95;
export const CATALOG_MAYBE = 0.88;
export const CATALOG_MARGIN = 0.04;

const rarityOk = (a: Rarity | undefined, b: Rarity | undefined) => !a || !b || a === 'unknown' || b === 'unknown' || a === b;

function best<T extends { fp?: number[]; rarity?: Rarity }>(fp: number[], rarity: Rarity, list: T[]): { item: T; score: number } | null {
  let out: { item: T; score: number } | null = null;
  for (const x of list) {
    if (!x.fp || !rarityOk(rarity, x.rarity)) continue;
    const s = similarity(fp, x.fp);
    if (!out || s > out.score) out = { item: x, score: s };
  }
  return out;
}

/* Nejlepší shoda a skóre nejlepšího jiného předmětu (jiný klíč). */
function bestTwo(fp: number[], rarity: Rarity, list: CatalogFp[]): { item: CatalogFp; score: number; second: number } | null {
  let top: { item: CatalogFp; score: number } | null = null;
  const scores: { key: string; s: number }[] = [];
  for (const x of list) {
    if (!x.fp || !rarityOk(rarity, x.rarity)) continue;
    const s = similarity(fp, x.fp);
    scores.push({ key: x.key, s });
    if (!top || s > top.score) top = { item: x, score: s };
  }
  if (!top) return null;
  let second = 0;
  for (const x of scores) if (x.key !== top.item.key && x.s > second) second = x.s;
  return { ...top, second };
}

const statusOf = (score: number): Match['status'] => (score >= MATCH_SURE ? 'known' : score >= MATCH_MAYBE ? 'uncertain' : 'unknown');

export function matchFp(fp: number[], rarity: Rarity, learned: LearnedFp[], catalog: CatalogFp[] = []): Match {
  const l = best(fp, rarity, learned);
  if (l && l.score >= MATCH_MAYBE) return { status: statusOf(l.score), itemKey: l.item.itemKey, kind: l.item.kind, score: l.score, source: 'learned' };
  const c = bestTwo(fp, rarity, catalog);
  if (c && c.score >= CATALOG_MAYBE && c.score - c.second >= CATALOG_MARGIN) {
    return { status: c.score >= CATALOG_SURE ? 'known' : 'uncertain', itemKey: c.item.key, kind: c.item.kind, score: c.score, source: 'catalog' };
  }
  const top = Math.max(l?.score ?? 0, c?.score ?? 0);
  return { status: 'unknown', itemKey: null, kind: null, score: top, source: null };
}

/* Shluky stejných ikon (spojení přes podobnost ≥ prahu a stejnou vzácnost). Pořadí shluků i prvků zůstává podle vstupu. */
export function clusterFps<T extends { fp: number[]; rarity: Rarity }>(xs: T[], thr: number = MATCH_SURE): T[][] {
  const parent = xs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    if (find(i) === find(j) || !rarityOk(xs[i].rarity, xs[j].rarity)) continue;
    if (similarity(xs[i].fp, xs[j].fp) >= thr) parent[find(j)] = find(i);
  }
  const groups = new Map<number, T[]>();
  xs.forEach((x, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), x]); });
  return [...groups.values()];
}
