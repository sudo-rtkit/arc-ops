/* Umělé pohledy na STASH ze vzorového snímku: zakrytí řádků a posun obsahu mřížky (jako posunutí kolečkem). */
import type { RgbaImage } from '../../src/core/vision/image';
import { detectLayout } from '../../src/core/vision/layout';

const BG = [10, 13, 26, 255];

/* Oblast posuvného obsahu STASH: od horního okraje mřížky po spodní okraj panelu (asi 6,45 rozteče). */
function viewport(img: RgbaImage) {
  const g = detectLayout(img)!.panels.find(p => p.panel === 'stash')!;
  return { g, x0: g.x - 4, x1: Math.round(g.x + 4 * g.pitchX), y0: g.y - 4, y1: Math.round(g.y + 6.45 * g.pitchY) };
}

const clone = (img: RgbaImage): RgbaImage => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });
const put = (img: RgbaImage, x: number, y: number, px: ArrayLike<number>) => { const i = (y * img.width + x) * 4; for (let c = 0; c < 4; c++) img.data[i + c] = px[c]; };
const get = (img: RgbaImage, x: number, y: number) => img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4);

/* Řádky od `fromRow` dál se zakryjí pozadím. */
export function hideRowsFrom(img: RgbaImage, fromRow: number): RgbaImage {
  const v = viewport(img), out = clone(img);
  for (let y = Math.round(v.g.y + fromRow * v.g.pitchY - 4); y < v.y1; y++) for (let x = v.x0; x < v.x1; x++) put(out, x, y, BG);
  return out;
}

/* Obsah mřížky se posune nahoru o `rows` roztečí; co se dole odkryje, je pozadí. */
export function scrollRows(img: RgbaImage, rows: number): RgbaImage {
  const v = viewport(img), out = clone(img), dy = Math.round(rows * v.g.pitchY);
  for (let y = v.y0; y < v.y1; y++) for (let x = v.x0; x < v.x1; x++) put(out, x, y, y + dy < v.y1 ? get(img, x, y + dy) : BG);
  return out;
}
