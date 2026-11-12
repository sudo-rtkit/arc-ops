/* Umělá obrazovka FINDINGS po raidu (veřejná, bez vlastních snímků hráče): políčka se zkopírují ze vzorového
   snímku STASH (filtr munice) do míst BACKPACK a QUICK USE jako na obrazovce po raidu a vpravo dole se nakreslí
   krémové tlačítko CONTINUE. Bez tlačítka jde o „jinou obrazovku s batohem“ (např. příprava loadoutu). */
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';
import { detectLayout, cellBox } from '../../src/core/vision/layout';
import { AMMO, loadFixture } from './load';

const BG = [10, 13, 26, 255];
const CREAM = [249, 238, 223, 255];

/* Políčka STASH vzoru (řádek, sloupec) pro batoh (2 řádky po 4) a quick use (1 řádek po 3); (1,3) je prázdné místo. */
export const BACKPACK_FROM: [number, number][][] = [[[0, 0], [0, 1], [0, 2], [0, 3]], [[1, 0], [1, 1], [1, 2], [1, 3]]];
export const QUICK_FROM: [number, number][][] = [[[1, 2], [0, 0], [1, 3]]];
/* Počty, které na umělé obrazovce musí vyjít (podle tests/fixtures/vision/expected.json). */
export const BACKPACK_COUNTS = [6, 100, 56, 80, 68, 31, 3];
export const QUICK_COUNTS = [3, 6];

export interface FindingsOptions { button?: boolean; /* jiný obsah: vynechá políčka batohu podle indexu */ skip?: number[] }

export function syntheticFindings(opts: FindingsOptions = {}): RgbaImage {
  const src = loadFixture(AMMO);
  const g = detectLayout(src)!.panels.find(p => p.panel === 'stash')!;
  const W = src.width, H = src.height;
  const out: RgbaImage = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let i = 0; i < W * H; i++) out.data.set(BG, i * 4);
  const m = Math.round((g.pitchX - g.cell) / 2);
  const copy = (r: number, c: number, x: number, y: number) => {
    const b = cellBox(g, r, c);
    for (let dy = -m; dy < b.h + m; dy++) for (let dx = -m; dx < b.w + m; dx++) {
      const si = ((b.y + dy) * W + (b.x + dx)) * 4, di = ((y + dy) * W + (x + dx)) * 4;
      out.data.set(src.data.subarray(si, si + 4), di);
    }
  };
  /* rozmístění jako na snímku FINDINGS 1080p: batoh od x 1064, quick use od x 1524, oba od y 332 */
  const place = (rows: [number, number][][], x0: number, y0: number, skip: number[] = []) => {
    let k = 0;
    rows.forEach((row, ri) => row.forEach(([r, c], ci) => {
      if (!skip.includes(k++)) copy(r, c, Math.round(x0 + ci * g.pitchX), Math.round(y0 + ri * g.pitchY));
      else copy(1, 3, Math.round(x0 + ci * g.pitchX), Math.round(y0 + ri * g.pitchY));
    }));
  };
  place(BACKPACK_FROM, 1064, 332, opts.skip);
  place(QUICK_FROM, 1524, 332);
  if (opts.button !== false) {
    for (let y = 1006; y < 1062; y++) for (let x = 1673; x < 1872; x++) out.data.set(CREAM, (y * W + x) * 4);
    /* tmavý nápis uprostřed (písmena jako svislé tahy) přeruší krémové řádky jako na skutečném snímku */
    for (let y = 1025; y < 1044; y++) for (let x = 1723; x < 1822; x++) if (x % 7 < 3) out.data.set([20, 20, 24, 255], (y * W + x) * 4);
  }
  return out;
}

export const toPngBase64 = (img: RgbaImage): string => {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png).toString('base64');
};
