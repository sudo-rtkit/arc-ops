/* Rozvržení obrazovky INVENTORY: najde mřížky čtvercových políček podle jejich tenkých rámečků a přiřadí je panelům
   STASH, BACKPACK a QUICK USE. Pracuje s měřítkem (velikostí políčka), ne s pevnými souřadnicemi, protože snímky
   nemají vždy přesně 1920×1080 a hráč může mít jiné rozlišení. */
import { lumMap, type RgbaImage } from './image';

export type PanelId = 'stash' | 'backpack' | 'quickUse';

export interface Box { x: number; y: number; w: number; h: number }

/* Mřížka políček: levý horní roh prvního políčka, velikost políčka a rozteč. present = která místa mřížky mají
   viditelný rámeček (řádek * cols + sloupec). */
export interface Grid {
  x: number; y: number; cell: number; pitchX: number; pitchY: number;
  cols: number; rows: number; present: boolean[];
}
export interface PanelGrid extends Grid { panel: PanelId }

export interface Layout {
  cellPx: number;
  /* Odhad měřítka UI: velikost políčka proti 96 px při výšce 1080 px. */
  ui: number;
  panels: PanelGrid[];
}

interface Seg { x: number; y0: number; y1: number }

const GAP_MAX = 64;      /* mezera mezi políčky je tmavá */
const EDGE = 18;         /* o kolik je rámeček jasnější než mezera */
const MIN_CELL = 36;     /* nejmenší podporované políčko (asi 720p s menším UI) */

/* Svislé úseky rámečků: pixel je jasnější než tmavá mezera vedle (vlevo u levého rámečku, vpravo u pravého). */
function verticalSegments(L: Float32Array, W: number, H: number, side: -1 | 1, minLen: number): Seg[] {
  const segs: Seg[] = [];
  const d = 3;
  for (let x = d; x < W - d; x++) {
    let start = -1, miss = 0;
    for (let y = 0; y <= H; y++) {
      let on = false;
      if (y < H) {
        const v = L[y * W + x], o = L[y * W + x + side * d];
        on = o < GAP_MAX && v - o > EDGE;
      }
      if (on) { if (start < 0) start = y; miss = 0; }
      else if (start >= 0) {
        if (++miss > 2 || y === H) {
          const end = y - miss;
          if (end - start + 1 >= minLen) segs.push({ x, y0: start, y1: end });
          start = -1; miss = 0;
        }
      }
    }
  }
  /* Tlustá čára (zvětšený snímek) dá úseky v sousedních sloupcích: necháme ten nejvíc vnější. */
  segs.sort((a, b) => a.x - b.x || a.y0 - b.y0);
  const out: Seg[] = [];
  for (const s of segs) {
    const dup = out.find(o => Math.abs(o.x - s.x) <= 2 && overlap(o, s) > 0.6 * Math.min(o.y1 - o.y0, s.y1 - s.y0));
    if (!dup) out.push({ ...s });
    else if (side === -1 ? s.x < dup.x : s.x > dup.x) Object.assign(dup, s);
  }
  return out;
}
const overlap = (a: Seg, b: Seg): number => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);

/* Kontrola vodorovného rámečku: část úsečky (střed) je jasnější než pixel nad ní (nahoře) nebo pod ní (dole). */
function hasHorizontal(L: Float32Array, W: number, H: number, x0: number, x1: number, y: number, side: -1 | 1): boolean {
  let hit = 0, n = 0;
  const r = Math.max(2, Math.round((x1 - x0) * 0.03));
  for (let x = Math.round(x0 + (x1 - x0) * 0.2); x <= x0 + (x1 - x0) * 0.8; x++) {
    n++;
    let best = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy, yo = yy + side * 3;
      if (yy < 0 || yy >= H || yo < 0 || yo >= H) continue;
      const v = L[yy * W + x], o = L[yo * W + x];
      if (o < GAP_MAX) best = Math.max(best, v - o);
    }
    if (best > EDGE) hit++;
  }
  return n > 0 && hit / n > 0.7;
}

/* Všechna celá čtvercová políčka na snímku. Částečně viditelná políčka (useknutý spodní řádek) nemají obě
   svislé strany dost dlouhé nebo jim chybí spodní rámeček, takže se nepočítají. */
export function findCells(img: RgbaImage, L: Float32Array = lumMap(img)): Box[] {
  const W = img.width, H = img.height;
  const left = verticalSegments(L, W, H, -1, MIN_CELL * 0.7);
  const right = verticalSegments(L, W, H, 1, MIN_CELL * 0.7);
  const boxes: Box[] = [];
  for (const a of left) {
    const len = a.y1 - a.y0 + 1;
    for (const b of right) {
      const w = b.x - a.x + 1;
      if (w < len * 0.95 || w > len * 1.35 + 8 || w < MIN_CELL) continue;
      const tol = Math.max(4, len * 0.05);
      if (Math.abs(a.y0 - b.y0) > tol || Math.abs(a.y1 - b.y1) > tol) continue;
      const yc = (a.y0 + a.y1 + b.y0 + b.y1) / 4;
      const y = Math.round(yc - (w - 1) / 2);
      if (y < 0 || y + w > H) continue;
      if (!hasHorizontal(L, W, H, a.x, b.x, y, -1) || !hasHorizontal(L, W, H, a.x, b.x, y + w - 1, 1)) continue;
      boxes.push({ x: a.x, y, w, h: w });
      break;
    }
  }
  /* Zvýrazněné políčko má dvojitý rámeček: necháme jedno políčko na místo. */
  const out: Box[] = [];
  for (const b of boxes.sort((p, q) => p.w - q.w)) {
    if (!out.some(o => Math.abs(o.x + o.w / 2 - b.x - b.w / 2) < o.w * 0.3 && Math.abs(o.y + o.h / 2 - b.y - b.h / 2) < o.h * 0.3)) out.push(b);
  }
  return out;
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/* Seskupí políčka stejné velikosti do mřížek (sousedi ve vzdálenosti jedné rozteče). */
export function groupGrids(cells: Box[]): Grid[] {
  if (!cells.length) return [];
  const size = median(cells.map(c => c.w));
  const same = cells.filter(c => Math.abs(c.w - size) <= Math.max(3, size * 0.06));
  const parent = same.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const isNeighbor = (a: Box, b: Box) => {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    return (dy < size * 0.15 && dx > size * 0.98 && dx < size * 1.3) || (dx < size * 0.15 && dy > size * 0.98 && dy < size * 1.3);
  };
  for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) if (isNeighbor(same[i], same[j])) parent[find(i)] = find(j);
  const groups = new Map<number, Box[]>();
  same.forEach((c, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), c]); });
  const grids: Grid[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const dxs: number[] = [], dys: number[] = [];
    for (const a of g) for (const b of g) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dy) < size * 0.15 && dx > size * 0.98 && dx < size * 1.3) dxs.push(dx);
      if (Math.abs(dx) < size * 0.15 && dy > size * 0.98 && dy < size * 1.3) dys.push(dy);
    }
    const pitchX = dxs.length ? median(dxs) : median(dys), pitchY = dys.length ? median(dys) : pitchX;
    const x0 = Math.min(...g.map(c => c.x)), y0 = Math.min(...g.map(c => c.y));
    const pos = g.map(c => ({ col: Math.round((c.x - x0) / pitchX), row: Math.round((c.y - y0) / pitchY), c }));
    const cols = Math.max(...pos.map(p => p.col)) + 1, rows = Math.max(...pos.map(p => p.row)) + 1;
    const present = new Array<boolean>(cols * rows).fill(false);
    for (const p of pos) present[p.row * cols + p.col] = true;
    /* Přesnější počátek: průměr odchylek všech políček od ideální mřížky. */
    const ox = pos.reduce((a, p) => a + p.c.x - p.col * pitchX, 0) / pos.length;
    const oy = pos.reduce((a, p) => a + p.c.y - p.row * pitchY, 0) / pos.length;
    grids.push({ x: Math.round(ox), y: Math.round(oy), cell: Math.round(median(g.map(c => c.w))), pitchX, pitchY, cols, rows, present });
  }
  return grids.sort((a, b) => a.x - b.x || a.y - b.y);
}

/* Přiřazení mřížek panelům podle polohy: STASH je čtyřsloupcová mřížka vlevo, BACKPACK čtyřsloupcová vpravo od ní
   a QUICK USE nejvýš třísloupcová mřížka vpravo od batohu. */
export function assignPanels(grids: Grid[], W: number): PanelGrid[] {
  const out: PanelGrid[] = [];
  const four = grids.filter(g => g.cols === 4);
  const stash = four.find(g => g.x + g.cols * g.pitchX < W * 0.4);
  if (stash) out.push({ ...stash, panel: 'stash' });
  const backpack = four.find(g => g !== stash && g.x > W * 0.4);
  if (backpack) out.push({ ...backpack, panel: 'backpack' });
  const quick = grids.find(g => g.cols <= 3 && backpack && g.x > backpack.x + backpack.cols * backpack.pitchX);
  if (quick) out.push({ ...quick, panel: 'quickUse' });
  return out;
}

export function detectLayout(img: RgbaImage, L: Float32Array = lumMap(img)): Layout | null {
  const grids = groupGrids(findCells(img, L));
  const panels = assignPanels(grids, img.width);
  if (!panels.length) return null;
  const cellPx = panels[0].cell;
  return { cellPx, ui: Math.round((cellPx / (96 * img.height / 1080)) * 100) / 100, panels };
}

/* Políčko mřížky na pozici (řádek, sloupec). */
export const cellBox = (g: Grid, row: number, col: number): Box =>
  ({ x: Math.round(g.x + col * g.pitchX), y: Math.round(g.y + row * g.pitchY), w: g.cell, h: g.cell });
