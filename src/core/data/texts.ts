// Nápovědy a pravidla převzatá doslova z původního deníku. Test tests/golden/data.test.ts hlídá, že se od originálu neliší.

export const TEXTS = {
  treeRules: 'Pravidla stromu jsou zjednodušená: volba po 10 bodech ve větvi, střední patro až po volbě, první konec po 30 a druhý po 40 bodech ve větvi.',
  workshopHint: 'Zadávej, kolik materiálu máš ve stashi. Stejný materiál se sdílí mezi stanicemi a nákupním seznamem. Priorita: Gunsmith → Gear Bench → Scrappy → Medical Lab → Refiner → Utility → Explosives.',
  amplified: 'Gunsmith IV, Research Station IV, Amplification Module z Frigate nebo Emperora a zbraň na tier IV. Amplifikace je trvalá a přidá +70 max durability.',
  shoppingHint: 'Součet materiálu na další level všech stanic. ARC díly jsou nahoře, jdi na ně cíleně.',
  mapsHint: 'Mapy odemyká počet odehraných kol, ne level. Počítá se i kolo, ve kterém umřeš. Po každém raidu klikni na +.',
  pendola: 'Na Pendola Pass se hodnota lootu mění mezi zápasy (Dynamic Loot Zones). Na začátku raidu se podívej, které zóny jsou označené jako hodnotné.',
  runHint: 'Každý zapsaný run zvýší i počet odehraných kol.',
  sellRules: 'Pravidla: počítej coiny na slot, žádné zbytečné PvP, kolem 10. minuty k extrakci, po velkém nálezu extrahuj hned, nejdražší věc do Safe Pocketu.',
  tierHint: 'C u Equalizeru, Hullcrackeru a Bettiny platí pro PvP. Proti velkým ARC patří k nejlepším.',
  trialsHint: 'Hvězdy na 1 000, 2 500 a 4 000 bodech dávají Uncommon, Rare a Epic item nebo blueprint. Každé pondělí se hvězdy samy vynulují.',
  rewardPassHint: 'Feats: Easy 15 RP, Medium 25 RP, Hard 50 RP. Týdenní milníky na 4, 8 a 12 bodech dávají každý 250 RP.',
} as const;

/* Změny ve 2.0, které mění loadout. */
export const PATCH_NOTES: string[] = [
  'Granáty dávají o víc než 50 % větší damage pancéřovým plátům ARC a asi o 30 % menší křehkým částem.',
  'Jupiter je silnější proti pancíři, o trochu slabší na weak pointy.',
  'Heavy Shield se méně opotřebovává (0,15 místo 0,20) a zpomaluje jen o 10 %.',
  'Snap Hook má dosah 18 m a stojí 4 % durability za použití. Grappling Hook umí i slanění a houpání.',
  'Anvil je teď modrý (rare), roli levného hand cannonu převzal Bantam.',
];
