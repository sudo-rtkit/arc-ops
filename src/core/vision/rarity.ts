/* Vzácnost podle barvy rohu políčka (a rámečku). Barva mimo známé skupiny je 'unknown'; vzácnost je jen
   pomocný signál a rozpoznávání neblokuje. */
import { hueSat, type RgbaImage } from './image';
import type { Box } from './layout';
import { borderArea, medianColor, rarityArea, saturated } from './cells';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unknown';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'unknown'];

export function rarityOfColor(r: number, g: number, b: number): Rarity {
  const h = hueSat(r, g, b);
  if (h.s < 0.2) return h.v > 70 ? 'common' : 'unknown';
  if (h.s < 0.45) return 'unknown';
  if (h.h >= 290 || h.h < 10) return 'epic';
  if (h.h >= 185 && h.h < 235) return 'rare';
  if (h.h >= 95 && h.h < 165) return 'uncommon';
  if (h.h >= 20 && h.h < 60) return 'legendary';
  return 'unknown';
}

export interface RarityRead { rarity: Rarity; rgb: [number, number, number] | null }

/* Plný barevný roh má přednost; bez něj rozhodne rámeček (běžné předměty mají šedý rámeček bez rohu). */
export function readRarity(img: RgbaImage, cell: Box): RarityRead {
  const corner = medianColor(img, rarityArea(cell), saturated);
  if (corner && corner.share > 0.4) return { rarity: rarityOfColor(...corner.rgb), rgb: corner.rgb };
  const grey = medianColor(img, rarityArea(cell), (r, g, b) => { const h = hueSat(r, g, b); return h.s < 0.15 && h.v > 85 && h.v < 140; });
  if (grey && grey.share > 0.4) return { rarity: 'common', rgb: grey.rgb };
  const border = medianColor(img, borderArea(cell), saturated);
  if (border && border.share > 0.2) {
    const r = rarityOfColor(...border.rgb);
    if (r !== 'unknown' && r !== 'common') return { rarity: r, rgb: null };
  }
  return { rarity: 'common', rgb: null };
}
