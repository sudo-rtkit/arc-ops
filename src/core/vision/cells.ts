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

/* Podíl světlých neutrálních pixelů (ikona kategorie vlevo dole). Každý předmět ji má, i tmavý šedý bez počtu
   (zaměřovač, tlumič); prázdné místo, šedý kroužek v QUICK USE i zástupné ikony volného loadoutu ji nemají. */
export function creamShare(img: RgbaImage, area: Box): number {
  let on = 0, n = 0;
  for (let y = Math.round(area.y); y < area.y + area.h; y++) for (let x = Math.round(area.x); x < area.x + area.w; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++;
    const [r, g, b] = rgbAt(img, x, y);
    if (0.299 * r + 0.587 * g + 0.114 * b > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 60) on++;
  }
  return n ? on / n : 0;
}

/* Podpis políčka pro navázání posunutých snímků: průměrný jas v mřížce 8 sloupců × 16 pásů přes celou výšku
   políčka. Pás mimo viditelnou část (useknutý řádek) má hodnotu -1. Jsou to jen čísla, ne obraz. */
export const SIG_COLS = 8, SIG_BANDS = 16;
export function cellSig(img: RgbaImage, b: Box, visTop = -Infinity, visBottom = Infinity): number[] {
  const out: number[] = [];
  const x0 = b.x + b.w * 0.06, w = b.w * 0.88;
  for (let band = 0; band < SIG_BANDS; band++) {
    const ya = b.y + (band * b.h) / SIG_BANDS, yb = b.y + ((band + 1) * b.h) / SIG_BANDS;
    const visible = ya >= visTop && yb <= visBottom;
    for (let c = 0; c < SIG_COLS; c++) {
      if (!visible) { out.push(-1); continue; }
      let s = 0, n = 0;
      const xa = x0 + (c * w) / SIG_COLS, xb = x0 + ((c + 1) * w) / SIG_COLS;
      for (let y = Math.ceil(ya); y < yb; y++) for (let x = Math.ceil(xa); x < xb; x++) {
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        s += lumAt(img, x, y); n++;
      }
      out.push(n ? Math.round(s / n) : -1);
    }
  }
  return out;
}

/* Rozdíl dvou podpisů přes pásy viditelné v obou (průměrný rozdíl jasu); null = žádný společný pás. */
export function sigDiff(a: number[], b: number[]): { diff: number; bands: number; spread: number } | null {
  let s = 0, n = 0, bands = 0, lo = Infinity, hi = -Infinity;
  for (let band = 0; band < SIG_BANDS; band++) {
    const k = band * SIG_COLS;
    if (a[k] < 0 || b[k] < 0) continue;
    bands++;
    for (let c = 0; c < SIG_COLS; c++) { s += Math.abs(a[k + c] - b[k + c]); n++; lo = Math.min(lo, a[k + c]); hi = Math.max(hi, a[k + c]); }
  }
  return n ? { diff: s / n, bands, spread: hi - lo } : null;
}

/* Jas rámečku políčka (průměr po obvodu, nejsvětlejší z několika sousedních linek). Zvýrazněné políčko pod kurzorem
   má navíc světlý obrys vně políčka, kde je jinak tmavá mezera (offsets záporné = vně). */
export function frameLum(img: RgbaImage, b: Box, offsets: number[] = [-5, -4, -3, -2, -1, 0, 1]): number {
  let best = 0;
  for (const o of offsets) {
    let s = 0, n = 0;
    const x0 = Math.round(b.x + o), y0 = Math.round(b.y + o), x1 = Math.round(b.x + b.w - 1 - o), y1 = Math.round(b.y + b.h - 1 - o);
    for (let x = x0 + 4; x <= x1 - 4; x += 2) for (const y of [y0, y1]) if (x >= 0 && y >= 0 && x < img.width && y < img.height) { s += lumAt(img, x, y); n++; }
    for (let y = y0 + 4; y <= y1 - 4; y += 2) for (const x of [x0, x1]) if (x >= 0 && y >= 0 && x < img.width && y < img.height) { s += lumAt(img, x, y); n++; }
    if (n) best = Math.max(best, s / n);
  }
  return best;
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

/* 0.23.0: volné místo „+“ na přípravě vlastního loadoutu (BACKPACK, QUICK USE, AUGMENTED SLOTS, SAFE POCKET).
   Uvnitř je jen tenký modrozelený křížek uprostřed, jinak tma; předmět by měl ikonu i mimo střed a ikonu kategorie.
   Na vlastním snímku (1080p): křížek ~20 px široký, tah ~3 px, barva ~(64, 144, 176). */
const tealPx = (r: number, g: number, b: number): boolean => { const h = hueSat(r, g, b); return h.s > 0.35 && h.h >= 180 && h.h < 215 && h.v > 90; };
export function isPlusSlot(img: RgbaImage, b: Box): boolean {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const arm = b.w * 0.14, bar = Math.max(1.5, b.w * 0.03);
  let barOn = 0, barN = 0, offOn = 0, offN = 0, outOn = 0, outN = 0;
  const x0 = Math.round(b.x + b.w * 0.12), x1 = Math.round(b.x + b.w * 0.88), y0 = Math.round(b.y + b.h * 0.12), y1 = Math.round(b.y + b.h * 0.88);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const [r, g, bl] = rgbAt(img, x, y);
    const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
    const inCross = (dx <= bar && dy <= arm) || (dy <= bar && dx <= arm);
    const on = tealPx(r, g, bl);
    if (inCross) { barN++; if (on) barOn++; }
    else if (dx <= arm * 1.6 && dy <= arm * 1.6) { offN++; if (on || lumAt(img, x, y) > 100) offOn++; }
    else { outN++; if (on || lumAt(img, x, y) > 100) outOn++; }
  }
  if (!barN || !offN || !outN) return false;
  return barOn / barN > 0.35 && offOn / offN < 0.08 && outOn / outN < 0.02;
}
