// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.
import type { GameMap } from '../types';

export const MAPS: GameMap[] = [
  { id: 'dam', name: 'Dam Battlegrounds', rounds: 0, diff: 2, best: 'Začátek, malí ARC, money runy', places: 'Research & Administration, Old Battleground (Baron Husk), Pale Apartments, Dome, Power Generation Complex', live: 'https://allthings.how/arc-raiders/map/loot-arc/' },
  { id: 'buried', name: 'Buried City', rounds: 0, diff: 3, best: 'Rostliny (Great Mullein), trinkety, medical', places: 'Space Travel, Research, Hospital, Library, Galleria, JKV, Town Hall (klíčová místnost)', live: 'https://arcraidershub.com/maps/buried-city' },
  { id: 'spaceport', name: 'Spaceport', rounds: 12, diff: 3, best: 'Tech a industrial loot, questy u Shani', places: 'Departure Building, Arrivals Building, Control Tower A6', live: 'https://arcraidershub.com/maps/spaceport' },
  { id: 'bluegate', name: 'The Blue Gate', rounds: 18, diff: 4, best: 'Farmy (Fertilizer), quest pro Outpost', places: 'Farmland Village, Ruined Homestead, Checkpoint, Barren Clearing (ARC loot), Ancient Fort', live: 'https://allthings.how/arc-raiders/map/loot-arc/' },
  { id: 'riven', name: 'Riven Tides', rounds: 20, diff: 5, best: 'Nejtěžší mapa, ARC Turbine, Beachcombing', places: 'Exodus Hotel, pláž a bazén, Harbor Dockyard, Wreckage (ARC loot)', live: 'https://arcraidershub.com/maps/riven-tides' },
  { id: 'stella', name: 'Stella Montis', rounds: 24, diff: 4, best: 'Interiéry, Shredder (jen tady), peníze', places: 'Assembly, Medical Research, Loading Bay', live: 'https://allthings.how/arc-raiders/map/loot-arc/' },
  { id: 'pendola', name: 'Pendola Pass', rounds: 25, diff: 3, best: 'Materiály na Outpost, Emperor, Frigate', places: 'Railyard, Cielo Sereno Observatory, Almatera Station, Fallen Emperor, Old Town', live: 'https://allthings.how/arc-raiders/map/loot-arc/' },
];

export const CONDITIONS: [string, string][] = [
  ['Night Raid', 'Lepší loot, víc nepřátel, horší viditelnost. Nejlepší na money runy s gearem.'],
  ['Lush Blooms', 'Víc vzácných rostlin, ideální pro Buried City Great Mullein run.'],
  ['Harvest Season', 'Víc ovoce a zeleniny, tedy Scrappy upgrady.'],
  ['Husk Graveyard', 'Pole zničených ARC s díly bez boje.'],
  ['Electromagnetic Storm', 'Dobrý pro Trials s létajícími ARC a ARC Probes.'],
  ['Redirection', 'Jen Pendola Pass: Emperor Payloady pro Gunsmith IV.'],
  ['Frigate', 'Amplification Modules a Research Points.'],
];
