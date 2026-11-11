/* Položky s počtem (výbava, loot, ztráty) a převod lootu do Inventory bez dvojího započtení. */
import type { ItemQty } from './types';
import { clampInt, isObj, text } from './util';

export const ITEM_MAX = 99999;

/* Vyčistí seznam: prázdné názvy pryč, stejné názvy se sečtou, počet 1–99 999. Pořadí podle prvního výskytu. */
export function normalizeItems(raw: unknown, max = 100): ItemQty[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemQty[] = [];
  const at = new Map<string, number>();
  for (const x of raw) {
    if (!isObj(x)) continue;
    const name = text(x.name, 80).trim();
    if (!name) continue;
    const qty = clampInt(x.qty ?? 1, 1, ITEM_MAX);
    const i = at.get(name);
    if (i === undefined) { if (out.length >= max) continue; at.set(name, out.length); out.push({ name, qty }); }
    else out[i].qty = Math.min(ITEM_MAX, out[i].qty + qty);
  }
  return out;
}

export const itemMap = (items: ItemQty[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const i of items) m[i.name] = (m[i.name] || 0) + i.qty;
  return m;
};
export const itemsTotal = (items: ItemQty[]): number => items.reduce((a, i) => a + i.qty, 0);

/* Rozdíl mezi tím, co raid říká, a tím, co už bylo převedeno. Kladné = přičíst, záporné = odečíst. */
export function lootDelta(loot: ItemQty[], applied: ItemQty[]): Record<string, number> {
  const want = itemMap(loot), have = itemMap(applied);
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(want), ...Object.keys(have)])) {
    const d = (want[k] || 0) - (have[k] || 0);
    if (d) out[k] = d;
  }
  return out;
}

/* Přičte (nebo odečte) rozdíl do zásoby; výsledek v mezích 0–99 999, nulové položky zmizí. */
export function applyDelta(inventory: Record<string, number>, delta: Record<string, number>): Record<string, number> {
  const inv = { ...inventory };
  for (const [k, d] of Object.entries(delta)) {
    const n = clampInt((inv[k] || 0) + d, 0, ITEM_MAX);
    if (n > 0) inv[k] = n; else delete inv[k];
  }
  return inv;
}

export type LootState = 'none' | 'pending' | 'applied' | 'changed';
/* none = raid nemá loot ani převod; pending = nic převedeno; applied = převedeno vše; changed = loot se po převodu změnil. */
export function lootState(loot: ItemQty[], applied: ItemQty[]): LootState {
  if (!loot.length && !applied.length) return 'none';
  if (!applied.length) return 'pending';
  return Object.keys(lootDelta(loot, applied)).length ? 'changed' : 'applied';
}
