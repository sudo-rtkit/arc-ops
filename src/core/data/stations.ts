// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.
import type { Station } from '../types';

export const STATIONS: Station[] = [
  { id: 'gunsmith', name: 'Gunsmith', min: 0, max: 4, role: 'Zbraně a mody', levels: { 1: [['Metal Parts', 20], ['Rubber Parts', 30]], 2: [['Rusted Tools', 3], ['Mechanical Components', 5], ['Wasp Driver', 8]], 3: [['Rusted Gear', 3], ['Advanced Mechanical Components', 5], ['Sentinel Firing Core', 4]], 4: [['Radial Press', 3], ['Magnetic Accelerator', 3], ['Emperor Modulator', 1]] }, req: { 4: { outpost: 4 } } },
  { id: 'gear', name: 'Gear Bench', min: 0, max: 3, role: 'Štíty a augmenty', levels: { 1: [['Plastic Parts', 25], ['Fabric', 30]], 2: [['Power Cable', 3], ['Electrical Components', 5], ['Hornet Driver', 5]], 3: [['Industrial Battery', 3], ['Advanced Electrical Components', 5], ['Bastion Cell', 6]] } },
  { id: 'medical', name: 'Medical Lab', min: 0, max: 3, role: 'Léčení', levels: { 1: [['Fabric', 50], ['ARC Alloy', 6]], 2: [['Cracked Bioscanner', 2], ['Durable Cloth', 5], ['Tick Pod', 8]], 3: [['Rusted Shut Medical Kit', 3], ['Antiseptic', 8], ['Surveyor Vault', 5]] } },
  { id: 'refiner', name: 'Refiner', min: 0, max: 3, role: 'Komponenty pro ostatní stanice', levels: { 1: [['Metal Parts', 60], ['ARC Powercell', 5]], 2: [['Toaster', 3], ['ARC Motion Core', 5], ['Fireball Burner', 8]], 3: [['Motor', 3], ['ARC Circuitry', 10], ['Bombardier Cell', 6]] } },
  { id: 'utility', name: 'Utility Station', min: 0, max: 3, role: 'Gadgety', levels: { 1: [['Plastic Parts', 50], ['ARC Alloy', 6]], 2: [['Damaged Heat Sink', 2], ['Electrical Components', 5], ['Snitch Scanner', 6]], 3: [['Fried Motherboard', 3], ['Advanced Electrical Components', 5], ['Leaper Pulse Unit', 4]] } },
  { id: 'explosives', name: 'Explosives Station', min: 0, max: 3, role: 'Granáty a miny', levels: { 1: [['Chemicals', 50], ['ARC Alloy', 6]], 2: [['Synthesized Fuel', 3], ['Crude Explosives', 5], ['Pop Trigger', 5]], 3: [['Laboratory Reagents', 3], ['Explosive Compound', 5], ['Rocketeer Driver', 3]] } },
  { id: 'scrappy', name: 'Scrappy', min: 1, max: 5, role: 'Pasivní materiál po každém raidu', levels: { 2: [['Dog Collar', 1]], 3: [['Lemon', 3], ['Apricot', 3]], 4: [['Prickly Pear', 6], ['Olives', 6], ['Cat Bed', 1]], 5: [['Mushroom', 12], ['Apricot', 12], ['Very Comfortable Pillow', 3]] } },
  { id: 'outpost', name: 'Outpost', min: 0, max: 4, role: 'Základna na povrchu, odemyká Research Station', levels: { 1: [['Planks', 3], ['Sheet Metal', 5], ['ARC Alloy', 10], ['Advanced Electrical Components', 3]], 2: [['Steel Cable', 3], ['Sheet Metal', 20], ['Cable Stripper', 3]], 3: [['Epoxy Bucket', 3], ['Planks', 35], ['Hand Drill', 3]], 4: [['Sheet Metal', 40], ['Laser Level', 3], ['Insulation Roll', 3]] }, req: { 1: { level: 18 } }, notes: { 1: 'Sheltered Retreat: vyfoť farmářský dům u Ruined Homestead (Blue Gate), pak 800 damage létajícím ARC a 300 Bullymu.' } },
  { id: 'research', name: 'Research Station', min: 0, max: 4, role: 'Výzkum blueprintů a Amplified zbraní', levels: { 1: [['Mini Pump', 3], ['Planks', 35], ['Battered Paperback', 5]], 2: [['Calculator', 3], ['Raider Logbook', 3], ['Skulker Targeter', 5]], 3: [['Differential Microphone', 3], ['Exodus Technical Handbook', 3], ['Bully Fragmenter', 6]], 4: [['Thermal Shaker', 3], ['ARC Data Module', 3], ['Frigate Inductor', 1]] }, req: { 1: { outpost: 1 }, 2: { outpost: 2 }, 3: { outpost: 3 }, 4: { outpost: 4 } }, notes: { 1: 'Recept pro level I se ve zdrojích liší, ověř ho ve hře.' } },
];

export const STATION: Record<string, Station> = Object.fromEntries(STATIONS.map(s => [s.id, s]));

/* Odkud se materiál bere (u ARC dílů dropy podle deníku, jinak běžný loot). */
export const SOURCES: Record<string, string> = {
  'Wasp Driver': 'ARC: Wasp',
  'Hornet Driver': 'ARC: Hornet',
  'Fireball Burner': 'ARC: Fireball (v budovách)',
  'Tick Pod': 'ARC: Tick',
  'Snitch Scanner': 'ARC: Snitch',
  'Pop Trigger': 'ARC: Pop',
  'Sentinel Firing Core': 'ARC: Sentinel',
  'Bastion Cell': 'ARC: Bastion',
  'Bombardier Cell': 'ARC: Bombardier',
  'Surveyor Vault': 'ARC: Surveyor',
  'Leaper Pulse Unit': 'ARC: Leaper',
  'Rocketeer Driver': 'ARC: Rocketeer',
  'ARC Motion Core': 'ARC: Rocketeer, Leaper, Bastion',
  'ARC Alloy': 'ARC: většina strojů',
  'ARC Powercell': 'ARC: většina strojů',
  'ARC Circuitry': 'ARC: Bastion',
  'Magnetic Accelerator': 'ARC: Queen',
  'Skulker Targeter': 'ARC: Skulker',
  'Bully Fragmenter': 'ARC: Bully',
  'Frigate Inductor': 'ARC Frigate',
  'Emperor Modulator': 'Uvnitř Emperora (Pendola Pass)',
  'Steel Cable': 'Pendola Pass: Railyard, Fallen Emperor; nebo Celeste za Assorted Seeds',
  Lemon: 'Ovoce, víc při Harvest Season',
  Apricot: 'Ovoce, víc při Harvest Season',
  'Prickly Pear': 'Ovoce',
  Olives: 'Ovoce',
  Mushroom: 'Rostliny',
  'Raider Logbook': 'Research item (100 RP)',
  'Exodus Technical Handbook': 'Research item (150 RP)',
  'ARC Data Module': 'Research item (200 RP)',
};
