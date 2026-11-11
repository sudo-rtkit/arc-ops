// Doplňující údaje k ARC jednotkám z rešerše veřejných zdrojů (10. 11. 2026). Nejsou ověřené ve hře a po patchích
// mohou zastarat. Zdroje: docs/02-zdroje-hernich-dat.md. Prázdné pole znamená „nepodařilo se doložit“
// (nebezpečnost a obtížnost žádný zdroj jednotně neuvádí, proto zůstávají prázdné).

export interface ArcMeta {
  type?: string; category?: string; difficulty?: number; danger?: string;
  traits?: string; weakness?: string; gear?: string; sources?: string[];
}

const WIKI = 'https://arcraiders.wiki/wiki/ARC';
const ALLTHINGS = 'https://allthings.how/how-to-defeat-every-arc-enemy-in-arc-raiders-weak-points-and-loot/';

export const ARC_META: Record<string, ArcMeta> = {
  Tick: { type: 'Pozemní, malý', category: 'Hexapod', weakness: 'Zničíš ho jakoukoli zbraní.', sources: [WIKI] },
  Pop: { type: 'Pozemní, malý', category: 'Koule (Ball)', weakness: 'Zničíš ho jakoukoli zbraní.', sources: [WIKI] },
  Wasp: { type: 'Létající, malý', category: 'Bojový dron', weakness: 'Zničení trysek ho rozhodí.', sources: [WIKI] },
  Hornet: { type: 'Létající, malý', category: 'Bojový dron', weakness: 'Nepancéřované zadní trysky; zničení trysek ho rozhodí.', sources: [WIKI] },
  Snitch: { type: 'Létající, malý', category: 'Průzkumný dron', weakness: 'Zničení trysek ho rozhodí. Přivolává okolní ARC, zabij ho rychle.', sources: [WIKI] },
  Fireball: { type: 'Pozemní, malý', category: 'Koule (Ball)', weakness: 'Slabé místo (bílé jádro) je odkryté, když se otevře k útoku; stačí jedna rána heavy munice.', sources: [WIKI] },
  Turret: { type: 'Pozemní, statický', category: 'Věž (Turret)', weakness: 'Vyprovokuj útok a schovej se za kryt; obvykle 2 rány heavy munice.', sources: [WIKI] },
  Sentinel: { type: 'Pozemní, statický', category: 'Věž (Turret)', weakness: 'Žlutý kanystr na rameni; vyprovokuj útok a schovej se za kryt.', sources: [WIKI] },
  Surveyor: { type: 'Pozemní, malý', category: 'Koule (Ball)', weakness: 'Slabé místo je odkryté během laseru; omráčení Hornet Driverem nebo Showstopperem, doporučené výbušniny.', sources: [WIKI] },
  Leaper: { type: 'Pozemní, velký', category: 'Čtyřnožec', weakness: 'Klouby nohou a oko; výbušniny rychle zabírají, omráčený je bezbranný.', sources: [WIKI] },
  Rocketeer: { type: 'Létající, velký', category: 'Bojový dron', weakness: 'Trysky a skener nahoře, stříbrný kanystr na zádech.', sources: [WIKI] },
  Bastion: { type: 'Pozemní, velký', category: 'Hexapod', weakness: 'Žluté klouby nohou a zadní kanystr; omráčený je bezbranný.', sources: [WIKI, ALLTHINGS] },
  Bombardier: { type: 'Pozemní, velký', category: 'Hexapod', weakness: 'Žluté klouby nohou a zadní kanystr; nejúčinnější heavy munice a Hullcracker.', sources: [WIKI, ALLTHINGS] },
  Queen: { type: 'Obří', category: 'Hexapod (boss)', weakness: 'Odstřel pancéřové pláty k červenému jádru; žlutá slabá místa na nohou.', sources: [WIKI] },
  Matriarch: { type: 'Obří', category: 'Hexapod (boss)', weakness: 'Odstřel pancéřové pláty k červenému jádru; žlutá slabá místa na nohou.', sources: [WIKI] },
  Bully: { type: 'Pozemní, velký', category: 'Čtyřnožec', weakness: 'Nohy a hlavu jde zničit.', sources: [WIKI] },
  Skulker: { type: 'Pozemní, malý', category: 'Vznášející se dron', sources: [WIKI] },
  Hydra: { type: 'Pozemní, statický', category: 'Věž (Turret)', weakness: 'Slabá místa na zádech; doporučený Hullcracker, ve skupině jde snáz.', sources: [WIKI] },
};
