/* Krémové panely přes inventory: tooltip předmětu (velký, s názvem a spodním pruhem „15/15 · váha · cena“)
   a krátká nápověda („Empty slot for a weapon“). Políčka pod nimi nejsou vidět, takže se nečtou: označí se jako
   zakrytá. Hledá se na hrubé mapě bloků (asi 1/12 políčka), takže je to rychlé při každém rozlišení. */
import type { RgbaImage } from './image';
import type { Box } from './layout';

export interface Overlay { box: Box; kind: 'tooltip' | 'hint' }

/* Teplá krémová barva panelu (asi 249,238,223) a o něco tmavší spodní pruh (asi 206,193,176). */
export const isPanelCream = (r: number, g: number, b: number): boolean => {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return l > 175 && r >= g && g >= b - 2 && r - b >= 12 && r - b <= 70;
};

export function findOverlays(img: RgbaImage, cellPx: number): Overlay[] {
  const s = Math.max(4, Math.round(cellPx / 12));
  const bw = Math.floor(img.width / s), bh = Math.floor(img.height / s);
  const on = new Uint8Array(bw * bh), d = img.data, W = img.width;
  const step = Math.max(1, Math.floor(s / 4));
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let n = 0, hit = 0;
    for (let y = by * s; y < (by + 1) * s; y += step) for (let x = bx * s; x < (bx + 1) * s; x += step) {
      const i = (y * W + x) * 4; n++;
      if (isPanelCream(d[i], d[i + 1], d[i + 2])) hit++;
    }
    /* Text v panelu bloky jen zředí; stačí většina. */
    if (hit >= n * 0.5) on[by * bw + bx] = 1;
  }
  const seen = new Uint8Array(on.length), out: Overlay[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    let x0 = bw, y0 = bh, x1 = -1, y1 = -1, n = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % bw, y = (p - x) / bw; n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const q = ny * bw + nx;
        if (on[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    const w = (x1 - x0 + 1) * s, h = (y1 - y0 + 1) * s, fill = n / ((x1 - x0 + 1) * (y1 - y0 + 1));
    /* Ikony předmětů (obvaz, láhev) jsou menší než políčko; panel je široký obdélník. */
    if (w < cellPx * 1.2 || h < cellPx * 0.3 || fill < 0.55) continue;
    out.push({ box: { x: x0 * s, y: y0 * s, w, h }, kind: h >= cellPx * 2 && w >= cellPx * 2.5 ? 'tooltip' : 'hint' });
  }
  return out;
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* Políčko je zakryté, když zasahuje do panelu. Nad tooltipem visí záložka „ACTIONS“ (šedá, ne krémová), proto se
   u tooltipu započítá i pruh nad ním. Políčko bez nalezeného rámečku stačí, aby se pruhu dotklo. */
export function occludedBy(cell: Box, framed: boolean, overlays: Overlay[], cellPx: number): boolean {
  for (const o of overlays) {
    const m = cellPx * 0.1;
    if (intersects({ x: cell.x + m, y: cell.y + m, w: cell.w - 2 * m, h: cell.h - 2 * m }, o.box)) return true;
    if (o.kind === 'tooltip') {
      const tab: Box = { x: o.box.x, y: o.box.y - cellPx * 0.6, w: o.box.w, h: cellPx * 0.6 };
      if (intersects({ x: cell.x + m, y: cell.y + (framed ? cell.h * 0.35 : m), w: cell.w - 2 * m, h: cell.h * 0.6 }, tab)) return true;
    }
  }
  return false;
}
