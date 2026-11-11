// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.
import type { Route } from '../types';

export const ROUTES: Route[] = [
  { id: 'galleria', name: 'Galleria + JKV', map: 'buried', risk: 'Nízké', loadout: 'Free Loadout', yield: '~30 000 / raid', phase: '1', steps: ['Najdi červeně ohraničenou budovu Space Travel. Cíl je neoznačená budova vedle.', 'Vejdi z východu pod nápisem GALLERIA SOLDANELLA, po prvních schodech vyčisti malý turret.', 'V prvním patře sklič všechny Great Mullein v květináčích, pak to samé v horním patře.', 'Ze střechy najdi budovu s nápisem JKV a vylez po lešení na fasádě do 6. patra.', 'Vylootuj dvě místnosti, krumpáčem proraz zabarikádované dveře mezi nimi a vylootuj další dvě a raider bag.', 'Extrahuj na nejbližší Metro Station.'] },
  { id: 'oldbattle', name: 'Old Battleground', map: 'dam', risk: 'Nízké až střední', loadout: 'Slušná zbraň', yield: 'až ~40 000 / raid', phase: '1–2', steps: ['Jdi do oblasti Old Battleground a vyčisti okolí velkého stroje (Baron Husk).', 'Až je bezpečno, breachni ho a vylootuj ARC díly a cennosti.', 'Po cestách okolo zachyť ARC Couriery a další cíle s lootem.', 'Drž se potichu a vyhýbej se velkým hlídkám ARC.', 'S plným batohem a Safe Pocketem jdi k nejbližší extrakci.'] },
  { id: 'rna', name: 'Research & Admin lockery', map: 'dam', risk: 'Střední', loadout: 'Zbraň, munice, 3 Light Grenades', yield: '60 000+ / raid', phase: '2–3', steps: ['Najdi nejvyšší budovu Research & Administration a přijď z jihu po modrých kovových schodech.', 'Sentinel turret na schodech zničíš asi 3 granáty.', 'Nahoře v kanceláři nech šuplíky zatím zavřené, ať nejsi vidět.', 'Pravými rohovými dveřmi do chodby, vyčisti malý turret.', 'Na konci chodby prohledej všechny lockery v místnostech 1 a 2.', 'Vrať se ke křižovatce s Firebally a Ticky, vyčisti ji a vylootuj lockery a místnost 3.', 'S těžkým batohem extrahuj, dál už klesá výnos a roste riziko PvP.'] },
  { id: 'farmland', name: 'Farmland Village', map: 'bluegate', risk: 'Vyšší (PvP)', loadout: 'Augment se Safe Pocketem', yield: '30 000–60 000 / raid', phase: '2–4', steps: ['Vylootuj všechny budovy a kontejnery ve vesnici: obchody, domy, popelnice.', 'Prohledej hromady hlíny na polích, každá dá 3 Fertilizer (stack do 5, ~1 000 / ks).', 'Volitelně: průmyslová budova se ziplinem, za breachnutými dveřmi je zaručená bedna se zbraní.', 'Extrahuj přes Raider Hatch (s klíčem) nebo nejbližší extrakcí.'] },
  { id: 'assembly', name: 'Assembly', map: 'stella', risk: 'Střední', loadout: 'Interiérový loadout', yield: 'neuvedeno', phase: '3–4', steps: ['Priorita Assembly. Záloha: Medical Research (červená zóna), Loading Bay (žlutá).', 'Lootuj jen modré a lepší, kolem 10. minuty extrahuj.'] },
  { id: 'arrivals', name: 'Arrivals + Control Tower A6', map: 'spaceport', risk: 'Střední', loadout: 'Klíč od Control Tower', yield: 'neuvedeno', phase: '2–4', steps: ['Arrivals Building bývá méně obsazená než Departure Building.', 'S klíčem od Control Tower A6 otevřeš další high-tier loot.', 'Lootuj jen modré a lepší, kolem 10. minuty extrahuj.'] },
];

export const SELL: [string, number, string][] = [
  ['Lance’s Mixtape (5th Edition)', 10000, '0,2 kg, stack do 3, nejlepší cena na váhu'],
  ['Breathtaking Snow Globe', 7000, 'trinket'],
  ['Music Box, Playing Cards, Red Coral Jewelry', 5000, 'trinkety'],
  ['Hodinky, alba, vázy', 3000, 'trinkety, přibližně'],
  ['Fireball Burner, Hornet Driver, Snitch Scanner', 2000, 'za slot; nejdřív zkontroluj upgrady'],
  ['Fertilizer', 1000, 'stack do 5'],
  ['Queen Reactor', 13000, 'potřeba i na Amplified node Charged Burst'],
  ['Amplification Module Mk. I a Mk. V', 7000, 'duplikát radši recykluj na 7 Amplified Fragments'],
];
