/* Vlastní tier list S–D (milník 4) pro zbraně (id zbraně) a předměty (anglický název). Každý tier je seřazený seznam;
   položka je nejvýš v jednom tieru. Čisté funkce, vrací nové objekty. */
import { TIER_IDS, type TierId, type TierListState, type TierLists } from './types';
import { isObj } from './util';

export const emptyTierLists = (): TierLists => ({ S: [], A: [], B: [], C: [], D: [] });
export const emptyTierList = (): TierListState => ({ weapons: emptyTierLists(), items: emptyTierLists() });
export const isTier = (v: unknown): v is TierId => (TIER_IDS as readonly unknown[]).includes(v);

export function tierOf(lists: TierLists, id: string): TierId | null {
  for (const tier of TIER_IDS) if (lists[tier].includes(id)) return tier;
  return null;
}

/* Přesun položky do tieru na pozici index (výchozí konec); tier null = vyřadit z žebříčku. */
export function placeTier(lists: TierLists, id: string, tier: TierId | null, index?: number): TierLists {
  const out = emptyTierLists();
  for (const t of TIER_IDS) out[t] = lists[t].filter(x => x !== id);
  if (tier) {
    const list = out[tier];
    const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(index)));
    list.splice(at, 0, id);
  }
  return out;
}

/* Klávesnice: posun v pořadí uvnitř tieru (-1 doleva, +1 doprava). */
export function moveWithin(lists: TierLists, id: string, dir: -1 | 1): TierLists {
  const tier = tierOf(lists, id);
  if (!tier) return lists;
  const i = lists[tier].indexOf(id), j = i + dir;
  if (j < 0 || j >= lists[tier].length) return lists;
  const list = [...lists[tier]];
  [list[i], list[j]] = [list[j], list[i]];
  return { ...lists, [tier]: list };
}

/* Klávesnice: o tier výš (-1, k S) nebo níž (+1, k D). Mimo žebříček: dolů = D, nahoru = S. Pod D se nic nemění. */
export function shiftTier(lists: TierLists, id: string, dir: -1 | 1): TierLists {
  const cur = tierOf(lists, id);
  if (!cur) return placeTier(lists, id, dir > 0 ? 'D' : 'S');
  const k = TIER_IDS.indexOf(cur) + dir;
  if (k < 0 || k >= TIER_IDS.length) return lists;
  return placeTier(lists, id, TIER_IDS[k]);
}

function normalizeLists(raw: unknown): TierLists {
  const out = emptyTierLists();
  const r = isObj(raw) ? raw : {};
  const seen = new Set<string>();
  for (const tier of TIER_IDS) {
    const list = Array.isArray(r[tier]) ? (r[tier] as unknown[]) : [];
    for (const v of list.slice(0, 500)) {
      const id = typeof v === 'string' ? v.trim().slice(0, 130) : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out[tier].push(id);
    }
  }
  return out;
}
export function normalizeTierList(raw: unknown): TierListState {
  const r = isObj(raw) ? raw : {};
  return { weapons: normalizeLists(r.weapons), items: normalizeLists(r.items) };
}
