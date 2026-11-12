/* Stash Tetris (0.11.0): naskládat loot do omezeného batohu s co nejvyšší hodnotou. Čisté funkce bez DOM.
   Předměty, hodnoty a rarita jsou skutečná data aplikace (src/core/data/itemdata.ts). Data nemají velikost v mřížce,
   proto platí jednoduché a stálé zjednodušení podle typu předmětu: drobnosti a materiály 1×1, recyklovatelné věci,
   pistole, SMG, augmenty a štíty 1×2, dlouhé zbraně 2×2 (UI to říká). Kolo je dané číslem (seed). */
import { ITEM_DATA, type ItemDataRow, type ItemRarity } from './data/itemdata';
import { rng, shuffle } from './minigames';
import type { Key } from '../i18n';

export type Shape = 'small' | 'medium' | 'large';
export const SHAPE_SIZE: Record<Shape, [number, number]> = { small: [1, 1], medium: [1, 2], large: [2, 2] };
const SHAPE_OF_TYPE: Record<string, Shape> = {
  'Trinket': 'small', 'Quick Use': 'small', 'Topside Material': 'small', 'Refined Material': 'small', 'Nature': 'small',
  'Basic Material': 'small', 'Modification': 'small', 'Ammunition': 'small', 'Misc': 'small',
  'Recyclable': 'medium', 'Pistol': 'medium', 'SMG': 'medium', 'Hand Cannon': 'medium', 'Augment': 'medium', 'Shield': 'medium',
  'Assault Rifle': 'large', 'Battle Rifle': 'large', 'Sniper Rifle': 'large', 'Shotgun': 'large', 'Special': 'large', 'LMG': 'large',
};
export const shapeOfType = (type: string): Shape | null => SHAPE_OF_TYPE[type] ?? null;

export const COLS = 5;
export const ROWS = 4;
/* Počet předmětů v nabídce kola podle tvaru (celkem 28 políček na 20 v batohu: všechno se nevejde). */
export const OFFER: Record<Shape, number> = { small: 6, medium: 5, large: 3 };

export interface LootItem { id: string; name: string; type: string; rarity: ItemRarity; value: number; shape: Shape; w: number; h: number }
export interface TetrisRound { seed: number; cols: number; rows: number; items: LootItem[] }
/* rot = otočeno o 90° (šířka a výška se prohodí) */
export interface Placement { id: string; x: number; y: number; rot: boolean }

/* Předměty, které do kola smějí: s hodnotou a raritou, známý tvar, bez Amplified zbraní (hodnota mimo měřítko). */
let POOL: Record<Shape, ItemDataRow[]> | null = null;
export function lootPool(): Record<Shape, ItemDataRow[]> {
  if (!POOL) {
    const p: Record<Shape, ItemDataRow[]> = { small: [], medium: [], large: [] };
    const seen = new Set<string>();
    for (const r of ITEM_DATA) {
      const sh = shapeOfType(r.ty);
      if (!sh || !r.v || r.v <= 0 || !r.ra || /^Amplified\s/.test(r.n) || seen.has(r.n)) continue;
      seen.add(r.n);
      p[sh].push(r);
    }
    POOL = p;
  }
  return POOL;
}

export function makeRound(seed: number): TetrisRound {
  const r = rng(seed);
  const items: LootItem[] = [];
  for (const shape of ['large', 'medium', 'small'] as Shape[]) {
    for (const row of shuffle(lootPool()[shape], r).slice(0, OFFER[shape])) {
      const [w, h] = SHAPE_SIZE[shape];
      items.push({ id: 'i' + items.length, name: row.n, type: row.ty, rarity: row.ra!, value: row.v!, shape, w, h });
    }
  }
  /* pořadí v nabídce: podle hodnoty (jako by ležely na stole), stejné pro stejné kolo */
  items.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { seed, cols: COLS, rows: ROWS, items };
}

export const cellsOf = (it: Pick<LootItem, 'w' | 'h'>): number => it.w * it.h;
export const density = (it: Pick<LootItem, 'value' | 'w' | 'h'>): number => Math.round(it.value / cellsOf(it));
export const dims = (it: Pick<LootItem, 'w' | 'h'>, rot: boolean): [number, number] => (rot ? [it.h, it.w] : [it.w, it.h]);

/* Obsazení batohu: index políčka (y * cols + x) → id předmětu, nebo null. */
export function occupancy(round: TetrisRound, placements: Placement[], ignoreId?: string): (string | null)[] {
  const grid: (string | null)[] = Array(round.cols * round.rows).fill(null);
  const byId = new Map(round.items.map(i => [i.id, i]));
  for (const p of placements) {
    const it = byId.get(p.id);
    if (!it || p.id === ignoreId) continue;
    const [w, h] = dims(it, p.rot);
    for (let y = p.y; y < p.y + h; y++) for (let x = p.x; x < p.x + w; x++) if (x < round.cols && y < round.rows) grid[y * round.cols + x] = p.id;
  }
  return grid;
}

/* Vejde se předmět s levým horním rohem na (x, y)? Předmět se smí jen jednou; ignoreId = právě přesouvaný. */
export function canPlace(round: TetrisRound, placements: Placement[], it: LootItem, x: number, y: number, rot: boolean): boolean {
  const [w, h] = dims(it, rot);
  if (x < 0 || y < 0 || x + w > round.cols || y + h > round.rows) return false;
  const grid = occupancy(round, placements, it.id);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (grid[yy * round.cols + xx] !== null) return false;
  return true;
}

/* Umístí (nebo přesune) předmět; vrací nový seznam, nebo null, když se nevejde. */
export function place(round: TetrisRound, placements: Placement[], id: string, x: number, y: number, rot: boolean): Placement[] | null {
  const it = round.items.find(i => i.id === id);
  if (!it || !canPlace(round, placements, it, x, y, rot)) return null;
  return [...placements.filter(p => p.id !== id), { id, x, y, rot }];
}
export const removeItem = (placements: Placement[], id: string): Placement[] => placements.filter(p => p.id !== id);

export function scoreOf(round: TetrisRound, placements: Placement[]): number {
  const ids = new Set(placements.map(p => p.id));
  return round.items.filter(i => ids.has(i.id)).reduce((a, i) => a + i.value, 0);
}

/* Opsovo „hladové“ balení: podle hodnoty na políčko (pak hodnoty a názvu), každý předmět na první volné místo
   zleva shora, nejdřív v základní poloze, pak otočený. Není to nutně optimum, jen poctivý soupeř. */
export function greedy(round: TetrisRound): { placements: Placement[]; score: number } {
  const order = [...round.items].sort((a, b) => density(b) - density(a) || b.value - a.value || a.name.localeCompare(b.name));
  let placements: Placement[] = [];
  for (const it of order) {
    let done = false;
    for (const rot of it.w === it.h ? [false] : [false, true]) {
      for (let y = 0; y < round.rows && !done; y++) {
        for (let x = 0; x < round.cols && !done; x++) {
          const next = place(round, placements, it.id, x, y, rot);
          if (next) { placements = next; done = true; }
        }
      }
      if (done) break;
    }
  }
  return { placements, score: scoreOf(round, placements) };
}

/* Krátké rady po kole (klíč slovníku a parametry). Vždy aspoň jedna. */
export interface Tip { key: Key; params: Record<string, string | number> }
export function tipsFor(round: TetrisRound, placements: Placement[]): Tip[] {
  const tips: Tip[] = [];
  const packed = new Set(placements.map(p => p.id));
  const byDensity = [...round.items].sort((a, b) => density(b) - density(a) || b.value - a.value);
  const top = byDensity[0];
  tips.push({ key: 'games.tip.top', params: { name: top.name, value: density(top), size: `${top.w}×${top.h}` } });
  /* vzal méně výhodný předmět a výhodnější nechal ležet */
  const left = byDensity.find(i => !packed.has(i.id));
  const worstTaken = [...byDensity].reverse().find(i => packed.has(i.id));
  if (left && worstTaken && density(left) > density(worstTaken)) {
    tips.push({ key: 'games.tip.swap', params: { left: left.name, leftValue: density(left), took: worstTaken.name, tookValue: density(worstTaken) } });
  }
  const free = occupancy(round, placements).filter(c => c === null).length;
  if (free > 0) tips.push({ key: 'games.tip.free', params: { count: free } });
  /* velký předmět s nízkou hodnotou na políčko */
  const bigLow = round.items.filter(i => i.shape === 'large').sort((a, b) => density(a) - density(b))[0];
  if (bigLow && density(bigLow) < density(byDensity[Math.floor(byDensity.length / 2)])) {
    tips.push({ key: 'games.tip.big', params: { name: bigLow.name, value: density(bigLow) } });
  }
  return tips.slice(0, 3);
}
