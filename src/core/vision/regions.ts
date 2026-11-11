/* Oblasti s čísly mimo políčka, odvozené z polohy a rozteče mřížky (ne z pevných souřadnic). */
import type { RgbaImage } from './image';
import type { Box, Grid } from './layout';

/* Hlavička STASH: „200/268“ a hodnota stashe. Začíná za ikonou mřížky, končí před tlačítkem EXPAND. Měří se od
   horního okraje posuvné oblasti (viewportOf), ne od prvního celého řádku, takže sedí i u posunutého STASH.
   Bez top se vezme okraj těsně nad mřížkou (STASH na začátku). dy = posun pásu při opakovaném hledání. */
export const stashHeaderArea = (g: Grid, top: number = g.y - Math.max(2, Math.round(g.pitchY * 0.04)), dy = 0): Box =>
  ({ x: g.x + g.pitchX * 0.17, y: top - g.pitchY * 0.95 + dy, w: g.pitchX * 2.4, h: g.pitchY * 0.34 });

/* Počet obsazených míst za názvem BACKPACK / QUICK USE („2/14“). */
export const panelLabelArea = (g: Grid): Box =>
  ({ x: g.x + g.pitchX * 0.95, y: g.y - g.pitchY * 0.42, w: g.pitchX * 1.3, h: g.pitchY * 0.26 });

/* Mince vpravo nahoře. Výška pásu je úměrná velikosti políčka (měřítko UI). */
export const coinsArea = (img: RgbaImage, cellPx: number): Box =>
  ({ x: img.width * 0.78, y: 0, w: img.width * 0.22, h: Math.min(img.height, cellPx * 0.72) });
