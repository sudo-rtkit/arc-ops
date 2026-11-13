/* Čísla o předmětech (src/core/data/itemdata.ts z ARC Tracker /api/items) a statistiky zbraní
   (src/core/data/weaponStats.ts z MetaForge): hledání podle názvu, recyklace tam i zpět, blueprinty, obchodníci.
   Čisté funkce; data jsou statická (datum stažení ITEMS_DATE). */
import { ITEM_DATA, ITEMS_DATE, TRADER_OFFERS, type ItemDataRow, type TraderOffer } from './data/itemdata';
import { WEAPON_STATS, type WeaponStatRow } from './data/weaponStats';
import type { Qty } from './data/arctracker';
import { isObj, safeEntries } from './util';

export { ITEMS_DATE, ITEM_DATA, TRADER_OFFERS };
export type { ItemDataRow, TraderOffer, WeaponStatRow };

const lower = (s: string) => s.trim().toLowerCase();
const BY_NAME = new Map(ITEM_DATA.map(r => [lower(r.n), r]));
const TIERED = /\s(I|II|III|IV)$/;

/* Data předmětu podle anglického názvu. Zbraň bez tieru v názvu („Anvil“) dostane údaje tieru I. */
export function itemData(name: string): ItemDataRow | undefined {
  const k = lower(name);
  return BY_NAME.get(k) ?? (TIERED.test(name.trim()) ? undefined : BY_NAME.get(k + ' i'));
}
export const recycleOutputs = (name: string): Qty[] => itemData(name)?.r ?? [];
export const stackOf = (name: string): number => Math.max(1, itemData(name)?.s ?? 1);
/* Počet políček ve stashi pro daný počet kusů. */
export const slotsFor = (count: number, stack: number): number => (count > 0 ? Math.ceil(count / Math.max(1, stack)) : 0);

/* ----- recyklace ----- */
export interface RecycleSource { name: string; qty: number; outputs: Qty[]; value?: number; type: string }
/* Ze kterých předmětů vznikne materiál: seřazeno podle výtěžku (kusů materiálu z jednoho předmětu), pak podle názvu. */
export function recycleSources(material: string): RecycleSource[] {
  const m = lower(material);
  const out: RecycleSource[] = [];
  for (const r of ITEM_DATA) {
    const hit = r.r?.find(([n]) => lower(n) === m);
    if (hit) out.push({ name: r.n, qty: hit[1], outputs: r.r!, type: r.ty, ...(r.v ? { value: r.v } : {}) });
  }
  return out.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}
/* Všechny materiály, které recyklací vznikají (pro výběr v obráceném hledání). */
let outputNames: string[] | null = null;
export function recycleMaterials(): string[] {
  if (!outputNames) outputNames = [...new Set(ITEM_DATA.flatMap(r => (r.r ?? []).map(([n]) => n)))].sort((a, b) => a.localeCompare(b));
  return outputNames;
}
export const recyclable = (): ItemDataRow[] => ITEM_DATA.filter(r => r.r?.length);

/* ----- blueprinty ----- */
export const BLUEPRINTS: ItemDataRow[] = ITEM_DATA.filter(r => r.ty === 'Blueprint');
export const isBlueprint = (name: string): boolean => itemData(name)?.ty === 'Blueprint';
/* Předmět, který blueprint odemyká („Anvil Blueprint“ → „Anvil“). */
export const blueprintTarget = (bp: string): string => bp.replace(/\s+Blueprint$/i, '').trim();
/* Uložené naučené blueprinty: jen známé tvary (název do 120 znaků, kladný čas). Neznámé názvy se ponechají kvůli
   pozdějším aktualizacím dat. */
export function normalizeBlueprints(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of safeEntries(raw).slice(0, 2000)) {
    const n = Math.round(Number(v));
    if (k.trim() && k.length <= 120 && Number.isFinite(n) && n > 0) out[k] = Math.min(n, 9e15);
  }
  return out;
}

/* ----- obchodníci ----- */
export const TRADERS: string[] = [...new Set(TRADER_OFFERS.map(o => o.trader))].sort((a, b) => a.localeCompare(b));
export const offersOf = (trader: string): TraderOffer[] => TRADER_OFFERS.filter(o => o.trader === trader);
/* Cena v mincích, když je nabídka za Coins (jinak null: platí se předmětem). */
export const coinPrice = (o: TraderOffer): number | null => (o.cost.length === 1 && o.cost[0][0] === 'Coins' ? o.cost[0][1] : null);

/* ----- statistiky zbraní ----- */
const W_BY = new Map(WEAPON_STATS.map(r => [lower(r.n), r]));
/* Statistiky podle názvu zbraně aplikace; „Aphelion“ najde i „Aphelion Rifle“. */
export function weaponStats(name: string): WeaponStatRow | undefined {
  const k = lower(name);
  return W_BY.get(k) ?? WEAPON_STATS.find(r => lower(r.n).startsWith(k + ' '));
}
