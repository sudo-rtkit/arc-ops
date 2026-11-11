// Převzato z původního deníku (stav hry 2.0 Frozen Trail, listopad 2026). Vygenerováno scripts/gen-data.mjs.
import type { ArcDiaryEntry } from '../types';

export const ARC_DIARY: ArcDiaryEntry[] = [
  { name: 'Tick, Pop', tac: 'Malí, stačí melee nebo jakákoli zbraň.', drops: ['Tick Pod', 'Pop Trigger'] },
  { name: 'Wasp, Hornet', tac: 'Létající drony, miř na trysky.', drops: ['Wasp Driver', 'Hornet Driver'] },
  { name: 'Snitch', tac: 'Nebojuje, prozradí tě a volá posily. Zabij prvního, miř na trysky.', drops: ['Snitch Scanner'] },
  { name: 'Fireball', tac: 'Uvnitř budov, plamenomet a hořící podlaha. Drž odstup.', drops: ['Fireball Burner'] },
  { name: 'Turret, Sentinel', tac: 'Statické a obrněné, ideálně granáty.', drops: ['Sentinel Firing Core'] },
  { name: 'Surveyor', tac: 'Sbírej z něj Surveyor Vault na Medical Lab 3.', drops: ['Surveyor Vault', 'ARC Alloy', 'ARC Powercell'] },
  { name: 'Leaper', tac: 'Slabý na oheň (Blaze Grenade). Schovej se do budovy, kam se nevejde.', drops: ['Leaper Pulse Unit', 'ARC Motion Core'] },
  { name: 'Rocketeer', tac: 'Trysky, potřebuje hodně damage. Wolfpack a Hullcracker.', drops: ['Rocketeer Driver', 'ARC Motion Core'] },
  { name: 'Bastion', tac: 'Zadní plát a klouby nohou. Jeden odláká, ostatní bijí klouby.', drops: ['Bastion Cell', 'ARC Circuitry', 'ARC Motion Core'] },
  { name: 'Bombardier', tac: 'Stejné slabiny jako Bastion, bez pancíře na těle. Nejdřív Spottery, pak kryt se střechou.', drops: ['Bombardier Cell'] },
  { name: 'Queen', tac: 'Klouby nohou a jádro na hlavě během laseru. Tým, launchery, EMP.', drops: ['Queen Reactor', 'Magnetic Accelerator'] },
  { name: 'Matriarch', tac: 'Klouby a jádro hlavy, Equalizer.', drops: [] },
  { name: 'Bully (2.0)', tac: 'Rychlý a agresivní. Bij z krytu, ze dveří nebo ze střechy.', drops: ['Bully Fragmenter'] },
  { name: 'Skulker (2.0)', tac: 'Útočí z okraje zorného pole a ustupuje. Neustále se rozhlížej.', drops: ['Skulker Targeter'] },
  { name: 'Hydra (2.0)', tac: 'Třídílná věž na Frigate, sekce střílejí nezávisle. Rozdělte si je.', drops: [] },
];
