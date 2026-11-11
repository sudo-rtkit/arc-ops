// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.
export const TIERS: [string, string[]][] = [
  ['S', ['Vulcano', 'Bobcat', 'Tempest', 'Canto', 'Dolabra', 'Renegade']],
  ['A', ['Stitcher', 'Anvil', 'Il Toro', 'Osprey', 'Burletta', 'Jupiter', 'Bantam', 'Stiletto']],
  ['B', ['Ferro', 'Arpeggio', 'Venator', 'Kettle']],
  ['C', ['Aphelion', 'Bettina', 'Torrente', 'Rattler', 'Equalizer', 'Hairpin', 'Hullcracker', 'Rascal']],
];

export const ANTI_ARC: string[] = ['Equalizer', 'Jupiter', 'Hullcracker', 'Bettina', 'Renegade'];

/* fáze, level, na hráče, na ARC */
export const WEAPON_PHASES: [string, string, string, string][] = [
  ['1', 'lvl 1–10', 'Co dá Free Loadout, Rattler III z prvního questu', 'Ferro'],
  ['2', 'lvl 10–20', 'Il Toro, Stitcher, Burletta', 'Stiletto'],
  ['3', 'lvl 20–45', 'Tempest, Canto, Bobcat, Bantam', 'Jupiter, Hullcracker, Renegade'],
  ['4', 'lvl 45–75', 'Vulcano, Dolabra', 'Equalizer, Amplified Anvil nebo Jupiter'],
];
