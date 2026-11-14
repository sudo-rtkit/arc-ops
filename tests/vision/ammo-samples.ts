/* 0.27.0: vlastní snímky hráče s ikonou druhu munice (jen lokálně, tests/fixtures/vision/own) a pomůcka pro jiné
   rozlišení. Sdílí je generátor vzorů (ammo.gen.test.ts) a testy čtení (ammo.test.ts). */
import { resize, type RgbaImage } from '../../src/core/vision/image';
import type { Box } from '../../src/core/vision/layout';
import type { AmmoType } from '../../src/core/vision/ammoIcon';

/* snímek, místo zbraně, druh munice (podle zbraně a katalogu MetaForge), zbraň */
export const AMMO_SAMPLES: [string, 'weapon1' | 'weapon2', AmmoType, string][] = [
  ['own-after-raid-survived-findings.png', 'weapon1', 'light', 'Kettle I'],
  ['own-after-raid-survived-findings.png', 'weapon2', 'heavy', 'Ferro II'],
  ['own-after-raid-survived-findings-2.png', 'weapon1', 'heavy', 'Ferro I'],
  ['own-inraid-inventory.png', 'weapon1', 'light', 'Stitcher I'],
  ['return-and-progression/return-findings.png', 'weapon1', 'heavy', 'Anvil IV'],
  ['return-and-progression/return-findings.png', 'weapon2', 'medium', 'Torrente II'],
];
/* obraz zmenšený nebo zvětšený na šířku width a místo zbraně přepočtené na něj */
export function scaled(img: RgbaImage, box: Box, width: number): { img: RgbaImage; box: Box } {
  if (width === img.width) return { img, box };
  const k = width / img.width;
  return { img: resize(img, width, Math.round(img.height * k)), box: { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k } };
}
