/* Oblasti s čísly mimo políčka, odvozené z polohy a rozteče mřížky (ne z pevných souřadnic). */
import type { RgbaImage } from './image';
import type { Box, Grid } from './layout';

/* Hlavička STASH: „200/268“ a hodnota stashe. Začíná za ikonou mřížky, končí před tlačítkem EXPAND. */
export const stashHeaderArea = (g: Grid): Box =>
  ({ x: g.x + g.pitchX * 0.17, y: g.y - g.pitchY * 0.95, w: g.pitchX * 2.4, h: g.pitchY * 0.27 });

/* Počet obsazených míst za názvem BACKPACK / QUICK USE („2/14“). */
export const panelLabelArea = (g: Grid): Box =>
  ({ x: g.x + g.pitchX * 0.95, y: g.y - g.pitchY * 0.42, w: g.pitchX * 1.3, h: g.pitchY * 0.26 });

/* Mince vpravo nahoře. Výška pásu je úměrná velikosti políčka (měřítko UI). */
export const coinsArea = (img: RgbaImage, cellPx: number): Box =>
  ({ x: img.width * 0.78, y: 0, w: img.width * 0.22, h: Math.min(img.height, cellPx * 0.72) });
