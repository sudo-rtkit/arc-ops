/* Porovnání zbraní (milník 4): která hodnota v řádku je lepší. Čisté funkce. */
import { weaponStats, type WeaponStatRow } from './itemdb';

export const COMPARE_MAX = 4;
export type StatKey = Exclude<keyof WeaponStatRow, 'n'>;
/* Pořadí řádků; lower = menší je lepší (hmotnost). */
export const STAT_ROWS: { key: StatKey; lower?: boolean; dec?: boolean }[] = [
  { key: 'dmg', dec: true }, { key: 'fr', dec: true }, { key: 'rng', dec: true }, { key: 'stab', dec: true },
  { key: 'agi', dec: true }, { key: 'stl', dec: true }, { key: 'mag' }, { key: 'w', lower: true, dec: true },
];

/* Indexy nejlepší hodnoty. Prázdné, když jsou známé méně než dvě hodnoty nebo jsou všechny stejné. */
export function bestIndexes(values: (number | null | undefined)[], lower = false): number[] {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => typeof x[0] === 'number' && Number.isFinite(x[0]));
  if (known.length < 2) return [];
  const best = lower ? Math.min(...known.map(x => x[0])) : Math.max(...known.map(x => x[0]));
  if (known.every(x => x[0] === best)) return [];
  return known.filter(x => x[0] === best).map(x => x[1]);
}

/* Tier jako číslo pro porovnání (S nejlepší); neznámý = null. */
export const tierRank = (tier: string | undefined | null): number | null => {
  const i = ['S', 'A', 'B', 'C', 'D'].indexOf(String(tier || ''));
  return i < 0 ? null : i;
};

export function statsRow(names: string[], key: StatKey): (number | null)[] {
  return names.map(n => weaponStats(n)?.[key] ?? null);
}

/* Výběr k porovnání: přidat/odebrat, nejvýš COMPARE_MAX. */
export function toggleCompare(list: string[], id: string): string[] {
  if (list.includes(id)) return list.filter(x => x !== id);
  return list.length >= COMPARE_MAX ? list : [...list, id];
}
