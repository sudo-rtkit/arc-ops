/* Statistiky zbraní ARC Raiders pro porovnání. Zdroj: MetaForge (odkaz v Settings → Zdroje dat), neoficiální, ne od Embarku.
   Vygenerováno scripts/gen-catalog.mjs 2026-11-11 (26 zbraní, hodnoty pro tier I). Jen čísla.
   dmg = poškození, fr = kadence, rng = dostřel, stab = stabilita, agi = ovladatelnost, stl = nenápadnost, mag = zásobník, w = hmotnost (kg). */
export interface WeaponStatRow { n: string; dmg?: number; fr?: number; rng?: number; stab?: number; agi?: number; stl?: number; mag?: number; w?: number }
export const WEAPON_STATS: WeaponStatRow[] = [
  { n: 'Anvil', dmg: 40, fr: 10.3, rng: 50.2, stab: 67.8, agi: 70.1, stl: 10, mag: 6, w: 5 },
  { n: 'Aphelion Rifle', dmg: 25, fr: 10.2, rng: 75.6, stab: 76.4, agi: 46.7, stl: 16, mag: 10, w: 10 },
  { n: 'Arpeggio', dmg: 9.5, fr: 21.8, rng: 55.9, stab: 75.5, agi: 57.3, stl: 14, mag: 24, w: 6 },
  { n: 'Bantam', dmg: 24, fr: 23.3, rng: 32.9, stab: 56.1, agi: 73.9, stl: 9, mag: 8, w: 3 },
  { n: 'Bettina', dmg: 16, fr: 22, rng: 51.6, stab: 68.8, agi: 49.4, stl: 14, mag: 22, w: 11 },
  { n: 'Bobcat', dmg: 6, fr: 66.7, rng: 44, stab: 37.4, agi: 73.1, stl: 21, mag: 20, w: 7 },
  { n: 'Burletta', dmg: 10, fr: 33.3, rng: 35.5, stab: 71.7, agi: 84.4, stl: 24, mag: 12, w: 4 },
  { n: 'Canto', dmg: 6.5, fr: 56.7, rng: 50.8, stab: 44.1, agi: 75, stl: 24, mag: 18, w: 4 },
  { n: 'Dolabra', dmg: 50, fr: 8.7, rng: 53.4, stab: 79.4, agi: 29.3, stl: 1, mag: 8, w: 8 },
  { n: 'Equalizer', dmg: 8, fr: 33.3, rng: 66.4, stab: 85.9, agi: 45.5, stl: 1, mag: 50, w: 14 },
  { n: 'Ferro', dmg: 40, fr: 6.6, rng: 53.1, stab: 78.1, agi: 31.5, stl: 8, mag: 1, w: 8 },
  { n: 'Hairpin', dmg: 20, fr: 9, rng: 38, stab: 92.1, agi: 78.3, stl: 70, mag: 8, w: 3 },
  { n: 'Hullcracker', dmg: 100, fr: 9.3, rng: 38.9, stab: 96.2, agi: 67.9, stl: 1, mag: 5, w: 7 },
  { n: 'Il Toro', dmg: 63, fr: 8.5, rng: 17, stab: 82, agi: 62.2, stl: 18, mag: 5, w: 8 },
  { n: 'Jupiter', dmg: 60, fr: 5, rng: 73.4, stab: 85.4, agi: 68.4, stl: 1, mag: 5, w: 9 },
  { n: 'Kettle', dmg: 8.5, fr: 30, rng: 42.9, stab: 73.3, agi: 58.5, stl: 26, mag: 20, w: 7 },
  { n: 'Osprey', dmg: 45, fr: 8.4, rng: 79.1, stab: 79, agi: 56.6, stl: 12, mag: 8, w: 7 },
  { n: 'Rascal', dmg: 75, fr: 13.7, rng: 28.3, stab: 87.8, agi: 78.1, stl: 1, mag: 1, w: 4 },
  { n: 'Rattler', dmg: 9, fr: 33.3, rng: 56.1, stab: 78.2, agi: 54.2, stl: 14, mag: 12, w: 6 },
  { n: 'Renegade', dmg: 35, fr: 12, rng: 68.8, stab: 80.9, agi: 46.3, stl: 16, mag: 8, w: 10 },
  { n: 'Stiletto', dmg: 19, fr: 14.2, rng: 51.8, stab: 75.6, agi: 66.5, stl: 20, mag: 10, w: 7 },
  { n: 'Stitcher', dmg: 6.5, fr: 45.3, rng: 40.7, stab: 45, agi: 73.8, stl: 19, mag: 20, w: 5 },
  { n: 'Tempest', dmg: 10, fr: 36.7, rng: 55.9, stab: 68.4, agi: 50, stl: 14, mag: 25, w: 11 },
  { n: 'Torrente', dmg: 8, fr: 58.3, rng: 49.9, stab: 74.7, agi: 37.7, stl: 1, mag: 60, w: 12 },
  { n: 'Venator', dmg: 16, fr: 32.7, rng: 48.4, stab: 54.8, agi: 76.4, stl: 12, mag: 10, w: 5 },
  { n: 'Vulcano', dmg: 49.5, fr: 17.3, rng: 22, stab: 61.1, agi: 67.3, stl: 15, mag: 4, w: 8 },
];
