/* Loadout Planner: uložené sestavy výbavy a jejich výsledky z Raid Journalu. */
import type { ItemQty, Loadout, Raid } from './types';
import { isObj, text, uid } from './util';
import { normalizeItems } from './raidItems';
import { runStats } from './runs';

export const LOADOUT_PURPOSES = ['Money run', 'Lov ARC', 'PvP', 'Questy', 'Trials', 'Free Loadout', 'Jiné'];

export function normalizeLoadout(x: Record<string, unknown>): Loadout {
  return {
    id: text(x.id || uid(), 24), name: text(x.name, 80).trim() || 'Loadout', purpose: text(x.purpose, 40),
    primary: text(x.primary, 60), secondary: text(x.secondary, 60), augment: text(x.augment, 80), shield: text(x.shield, 80),
    items: normalizeItems(x.items, 40), note: text(x.note, 2000),
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

/* Výbava, kterou loadout předvyplní do zápisu raidu: zbraně, augment, štít a položky. */
export function loadoutGear(l: Loadout, weaponName: (id: string) => string): ItemQty[] {
  const out: ItemQty[] = [];
  for (const w of [l.primary, l.secondary]) if (w) out.push({ name: weaponName(w), qty: 1 });
  for (const t of [l.augment, l.shield]) if (t.trim()) out.push({ name: t.trim(), qty: 1 });
  return normalizeItems([...out, ...l.items], 100);
}

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
