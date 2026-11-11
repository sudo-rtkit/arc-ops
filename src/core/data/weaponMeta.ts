// Doplňující údaje ke zbraním z rešerše veřejných zdrojů (10. 11. 2026). Nejsou ověřené ve hře a po patchích mohou
// zastarat. Zdroje: docs/02-zdroje-hernich-dat.md. Prázdné pole znamená „nepodařilo se doložit“.

export interface WeaponMeta { category?: string; ammo?: string; info?: string; sources?: string[] }

const WIKI = 'https://arcraiders.wiki/wiki/Weapons';
const m = (category: string, ammo: string): WeaponMeta => ({ category, ammo, sources: [WIKI] });

export const WEAPON_META: Record<string, WeaponMeta> = {
  Kettle: m('Útočná puška', 'Light'), Rattler: m('Útočná puška', 'Medium'), Arpeggio: m('Útočná puška', 'Medium'),
  Tempest: m('Útočná puška', 'Medium'), Bettina: m('Útočná puška', 'Heavy'),
  Ferro: m('Bitevní puška', 'Heavy'), Stiletto: m('Bitevní puška', 'Light'), Renegade: m('Bitevní puška', 'Medium'), Aphelion: m('Bitevní puška', 'Energy Clip'),
  Stitcher: m('Samopal (SMG)', 'Light'), Canto: m('Samopal (SMG)', 'Medium'), Bobcat: m('Samopal (SMG)', 'Light'),
  'Il Toro': m('Brokovnice', 'Shotgun'), Vulcano: m('Brokovnice', 'Shotgun'), Dolabra: m('Brokovnice', 'Energy Clip'),
  Hairpin: m('Pistole', 'Light'), Burletta: m('Pistole', 'Light'), Venator: m('Pistole', 'Medium'),
  Bantam: m('Hand cannon', 'Heavy'), Anvil: m('Hand cannon', 'Heavy'),
  Torrente: m('Lehký kulomet (LMG)', 'Medium'),
  Osprey: m('Odstřelovací puška', 'Medium'), Jupiter: m('Odstřelovací puška', 'Energy Clip'),
  Rascal: m('Speciální', 'Launcher'), Hullcracker: m('Speciální', 'Launcher'), Equalizer: m('Speciální', 'Energy Clip'),
};
