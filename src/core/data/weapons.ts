// Zbraně. Tier a značka anti-ARC pocházejí z deníku (weaponsDiary.ts). Kategorie a munice v WEAPON_META deník neměl:
// jsou z rešerše veřejných zdrojů a nejsou ověřené ve hře.
import type { Weapon } from '../types';
import { ANTI_ARC, TIERS } from './weaponsDiary';
import { WEAPON_META } from './weaponMeta';
import { slug } from './arc';

export const WEAPONS: Weapon[] = TIERS.flatMap(([tier, names]) => names.map((name): Weapon => {
  const meta = WEAPON_META[name] || {};
  return {
    id: slug(name), name, origin: 'denik', tier, antiArc: ANTI_ARC.includes(name),
    category: meta.category || '', ammo: meta.ammo || '', info: meta.info || '',
    sources: meta.sources || [],
  };
}));

export const TIER_ORDER = ['S', 'A', 'B', 'C'] as const;
