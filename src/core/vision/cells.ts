/* Rozdělení panelu na políčka a výřezy jednoho políčka. Poměry platí pro herní políčko při libovolném měřítku:
   horních 75 % je ikona (vlevo dole roh vzácnosti), dolní pruh nese ikonu kategorie vlevo a počet nebo tier vpravo. */
import { hueSat, lumAt, rgbAt, type RgbaImage } from './image';
import { cellBox, type Box, type Grid } from './layout';

export const frac = (b: Box, x0: number, y0: number, x1: number, y1: number): Box =>
  ({ x: b.x + b.w * x0, y: b.y + b.h * y0, w: b.w * (x1 - x0), h: b.h * (y1 - y0) });

/* Ikona: střed bez rohů (vpravo nahoře bývá značka „viděno“), nad spodním pruhem. */
export const iconArea = (b: Box): Box => frac(b, 0.06, 0.05, 0.94, 0.74);
export const rarityArea = (b: Box): Box => frac(b, 0.015, 0.6, 0.09, 0.72);
export const categoryArea = (b: Box): Box => frac(b, 0.04, 0.77, 0.3, 0.96);
export const countArea = (b: Box): Box => frac(b, 0.45, 0.77, 0.965, 0.96);
export const tierArea = (b: Box): Box => frac(b, 0.7, 0.77, 0.965, 0.96);
/* Rámeček: levý okraj políčka uprostřed výšky. */
export const borderArea = (b: Box): Box => ({ x: b.x - 1, y: b.y + b.h * 0.3, w: Math.max(3, b.w * 0.03), h: b.h * 0.25 });

/* Podíl jasných pixelů v ikoně: prázdné políčko je tmavé (nanejvýš šedý zástupný kroužek v QUICK USE). */
export function brightShare(img: RgbaImage, area: Box, min = 100): number {
  let on = 0, n = 0;
  const step = Math.max(1, Math.floor(area.w / 48));
  for (let y = Math.round(area.y); y < area.y + area.h; y += step) for (let x = Math.round(area.x); x < area.x + area.w; x += step) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++; if (lumAt(img, x, y) > min) on++;
  }
  return n ? on / n : 0;
}

/* Medián barvy pixelů výřezu, které projdou testem. */
export function medianColor(img: RgbaImage, area: Box, test: (r: number, g: number, b: number) => boolean = () => true): { rgb: [number, number, number]; share: number } | null {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  let n = 0;
  for (let y = Math.round(area.y); y < area.y + area.h; y++) for (let x = Math.round(area.x); x < area.x + area.w; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++;
    const [r, g, b] = rgbAt(img, x, y);
    if (!test(r, g, b)) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  if (!rs.length) return null;
  const m = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return { rgb: [m(rs), m(gs), m(bs)], share: rs.length / n };
}

export const saturated = (r: number, g: number, b: number): boolean => { const h = hueSat(r, g, b); return h.s > 0.45 && h.v > 90; };

export interface GridCell { row: number; col: number; box: Box; framed: boolean }

/* Všechna místa mřížky. framed = rámeček byl na snímku nalezen; místo bez rámečku uvnitř mřížky může být
   zvýrazněné (vybrané) políčko, místo za koncem panelu nic neobsahuje. */
export function gridCells(g: Grid): GridCell[] {
  const out: GridCell[] = [];
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++)
    out.push({ row, col, box: cellBox(g, row, col), framed: g.present[row * g.cols + col] });
  return out;
}
