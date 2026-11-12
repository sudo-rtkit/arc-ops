/* 0.16.0: velký panel overlaye pro plné moduly (Aplikace). Čisté funkce a místní uložení velikosti a polohy.
   - Vše ve fyzických pixelech (jako buddy). Panel zůstane celý v pracovní ploše monitoru.
   - Velikost a poloha patří tomuto počítači: leží jen v localStorage webview (místní data aplikace), ne ve stavu
     aplikace, takže nejdou do zálohy ani se importem nemění (stejně jako sbalení postranního panelu).
   - Bez uložené hodnoty, nebo když uložený panel není na žádném monitoru, se panel vycentruje na monitoru overlaye. */
import type { Rect } from './layout';

export const PANEL_KEY = 'arcops:overlay:panel';
/* nejmenší a výchozí rozměr v CSS px (násobí se měřítkem monitoru) */
export const PANEL_MIN = { w: 900, h: 600 } as const;
export const PANEL_DEFAULT = { w: 1560, h: 1000 } as const;
/* krok klávesnicí (šipky na úchytu) v CSS px */
export const PANEL_STEP = 40;

export interface Screen { work: Rect; sf: number }

export function normalizePanel(raw: unknown): Rect | null {
  const r = raw as Partial<Rect> | null;
  if (!r || typeof r !== 'object') return null;
  const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w < 200 || h < 200 || w > 20000 || h > 20000 || Math.abs(x) > 100000 || Math.abs(y) > 100000) return null;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));

/* Výchozí panel: skoro celá pracovní plocha, nejvýš PANEL_DEFAULT, uprostřed. */
export function defaultPanel(s: Screen): Rect {
  const w = Math.round(Math.min(s.work.w * 0.94, PANEL_DEFAULT.w * s.sf));
  const h = Math.round(Math.min(s.work.h * 0.94, PANEL_DEFAULT.h * s.sf));
  return { x: Math.round(s.work.x + (s.work.w - w) / 2), y: Math.round(s.work.y + (s.work.h - h) / 2), w, h };
}

/* Panel celý na monitoru: velikost mezi minimem a pracovní plochou, poloha uvnitř. */
export function clampPanel(r: Rect, s: Screen): Rect {
  const minW = Math.min(PANEL_MIN.w * s.sf, s.work.w), minH = Math.min(PANEL_MIN.h * s.sf, s.work.h);
  const w = clamp(r.w, minW, s.work.w), h = clamp(r.h, minH, s.work.h);
  return { x: clamp(r.x, s.work.x, s.work.x + s.work.w - w), y: clamp(r.y, s.work.y, s.work.y + s.work.h - h), w, h };
}

/* Kam panel dát: na monitor, kde leží střed uloženého panelu; jinak výchozí na monitoru overlaye (current). */
export function fitPanel(saved: Rect | null, screens: Screen[], current: Screen): Rect {
  if (saved) {
    const c = { x: saved.x + saved.w / 2, y: saved.y + saved.h / 2 };
    const s = screens.find(x => inside(c, x.work));
    if (s) return clampPanel(saved, s);
  }
  return defaultPanel(current);
}

export const resizePanel = (r: Rect, dw: number, dh: number, s: Screen): Rect => clampPanel({ ...r, w: r.w + dw, h: r.h + dh }, s);
export const movePanel = (r: Rect, dx: number, dy: number, s: Screen): Rect => clampPanel({ ...r, x: r.x + dx, y: r.y + dy }, s);

/* Uložení v localStorage; bez úložiště (soukromý režim, chyba) se nic nepamatuje a platí výchozí panel. */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
export function readPanel(store: Store | null = local()): Rect | null {
  try { const v = store?.getItem(PANEL_KEY); return v ? normalizePanel(JSON.parse(v)) : null; } catch { return null; }
}
export function writePanel(r: Rect | null, store: Store | null = local()): void {
  try { if (!r) store?.removeItem(PANEL_KEY); else { const n = normalizePanel(r); if (n) store?.setItem(PANEL_KEY, JSON.stringify(n)); } } catch { /* bez úložiště */ }
}
