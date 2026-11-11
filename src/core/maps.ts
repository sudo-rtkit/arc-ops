/* Odemykání map podle odehraných kol. Věrný převod z původního deníku. */
import type { GameMap } from './types';
import { MAPS } from './data/maps';

export interface MapStatus { map: GameMap; open: boolean; left: number }

export function mapStatus(rounds: number, maps: GameMap[] = MAPS): MapStatus[] {
  return maps.map(m => ({ map: m, open: rounds >= m.rounds, left: Math.max(0, m.rounds - rounds) }));
}

/* Klíčová místa mapy jako seznam (v deníku jsou jedním textem). */
export const mapPlaces = (m: GameMap): string[] => m.places.split(', ').map(s => s.trim()).filter(Boolean);
