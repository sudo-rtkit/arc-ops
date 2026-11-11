/* Normalizace nových částí stavu schématu 3: items (předměty pro 3b) a vision (naučené otisky ikon). */
import { ITEM_CATEGORIES, ITEM_TIERS, LEARNED_MAX, itemKey, type ItemCategory, type ItemStock, type ItemTier, type VisionState } from './types';
import type { LearnedFp } from './vision/match';
import { FP_LEN } from './vision/fingerprint';
import { RARITIES, type Rarity } from './vision/rarity';
import { clampInt, clampNum, isObj, text, uid } from './util';

export const emptyVision = (): VisionState => ({ learned: [], profile: null, lastImportAt: 0 });

export function normalizeItemStock(raw: unknown): Record<string, ItemStock> {
  const out: Record<string, ItemStock> = {};
  if (!isObj(raw)) return out;
  for (const v of Object.values(raw).slice(0, 5000)) {
    if (!isObj(v)) continue;
    const name = text(v.name, 120).trim();
    const count = clampInt(v.count ?? 0, 0, 99999);
    if (!name || !count) continue;
    const category: ItemCategory = ITEM_CATEGORIES.includes(v.category as ItemCategory) ? (v.category as ItemCategory) : 'other';
    const tier = ITEM_TIERS.includes(v.tier as ItemTier) ? (v.tier as ItemTier) : undefined;
    const key = itemKey(name, tier);
    out[key] = tier ? { key, name, category, tier, count } : { key, name, category, count };
  }
  return out;
}

export function normalizeLearned(raw: unknown): LearnedFp[] {
  const list: LearnedFp[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(raw) ? raw : []) {
    if (!isObj(v) || !Array.isArray(v.fp) || v.fp.length !== FP_LEN) continue;
    if (v.kind !== 'material' && v.kind !== 'item') continue;
    const fp = v.fp.map(x => clampInt(x, 0, 255));
    let id = text(v.id || uid(), 24);
    if (seen.has(id)) id = uid() + seen.size;
    seen.add(id);
    const e: LearnedFp = { id, itemKey: text(v.itemKey, 120), kind: v.kind, fp, at: clampInt(v.at || 0, 0, 9e15) };
    if (RARITIES.includes(v.rarity as Rarity)) e.rarity = v.rarity as Rarity;
    list.push(e);
  }
  /* Nejstarší se odmažou; pořadí zůstane od nejstaršího. */
  return list.sort((a, b) => a.at - b.at).slice(-LEARNED_MAX);
}

export function normalizeVision(raw: unknown): VisionState {
  const v = isObj(raw) ? raw : {};
  const p = isObj(v.profile) ? v.profile : null;
  const cellPx = p ? Number(p.cellPx) : NaN;
  return {
    learned: normalizeLearned(v.learned),
    profile: p && Number.isFinite(cellPx) && cellPx > 0 ? { cellPx: clampInt(cellPx, 1, 2000), ui: clampNum(p.ui, 0, 10) } : null,
    lastImportAt: clampInt(v.lastImportAt || 0, 0, 9e15),
  };
}
