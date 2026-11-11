/* Ukázková záloha starého deníku (formát v1) pro testy importu. */
export const SAMPLE_V1 = {
  v: 1,
  profile: { level: 23, coins: 184500, rounds: 31, expBonus: 2, rewardPass: 17 },
  skills: { cur: { c_used: 1, c_breaths: 5, c_mule: 4 }, showPlan: false, plan: 'runner' },
  stations: { gunsmith: 2, gear: 2, medical: 1, refiner: 1, utility: 1, explosives: 0, scrappy: 3, outpost: 1, research: 0 },
  inv: { 'Metal Parts': 40, 'Wasp Driver': 3, 'ARC Alloy': 6, Fabric: 12 },
  steps: { 0: true, 2: true, 5: true },
  runs: [
    { id: 'r1', ts: 1762600000000, map: 'buried', route: 'galleria', ok: true, coins: 31000, min: 14 },
    { id: 'r2', ts: 1762601000000, map: 'dam', route: 'oldbattle', ok: false, coins: 0, min: 9.5 },
    { id: 'r3', ts: 1762602000000, map: 'buried', route: 'galleria', ok: true, coins: 28000, min: 12 },
  ],
  trials: { week: '2026-W45', stars: [3, 2, 1, 0, 3], names: ['Damage ARC', 'Loot', 'Extract', '', 'Search'] },
  raid: { 0: true, 3: true },
  amplified: 0,
  updated: 1762602000000,
};
