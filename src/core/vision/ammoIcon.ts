/* 0.27.0: druh munice z ikony v místě zbraně (MANAGE LOADOUT, FINDINGS po raidu). Vlevo od řádku munice („0/20“)
   kreslí hra krémovou ikonu druhu munice: lehká = čtyři svislé náboje, střední = tři vodorovné náboje se svislou
   lištou, těžká = jeden velký šikmý náboj (brokové, energetické a raketové mají vlastní ikony). Ikona se ořízne na
   nejmenší obdélník krémových pixelů, rozdělí na mřížku ICON_W × ICON_H (podíl inkoustu v každém poli) a porovná
   se vzory (ammoIcons.ts, malé číselné masky vygenerované z vlastních snímků testem tests/vision/ammo.gen.test.ts,
   ne herní grafika). Druh se vrátí jen při jisté shodě: vysoká shoda, velký odstup od jiného druhu a poměr stran
   blízko vzoru. Jinak null a čtení zbraně se chová jako v 0.25.0 (druh munice se nepoužije). Druh, pro který vzor
   není (snímek s takovou zbraní zatím chybí), se nepozná: jeho ikona nedosáhne prahu shody s žádným vzorem.
   Čistá funkce, jen čte pixely; vstup je omezený výřezem místa (pár set pixelů). */
import type { RgbaImage } from './image';
import type { Box } from './layout';
import { frac } from './cells';
import { isCream, maskOf } from './digits';
import { AMMO_ICONS } from './ammoIcons';

export type AmmoType = 'light' | 'medium' | 'heavy' | 'shotgun' | 'energy' | 'launcher';
export const AMMO_TYPES: readonly AmmoType[] = ['light', 'medium', 'heavy', 'shotgun', 'energy', 'launcher'];
export const ICON_W = 12;
export const ICON_H = 12;
export const ICON_LEN = ICON_W * ICON_H;
/* vzor: druh, poměr stran (šířka / výška) a mřížka jako řádky šestnáctkových číslic 0–f (podíl inkoustu × 15) */
export interface AmmoIconTemplate { t: AmmoType; a: number; rows: string[] }
export interface AmmoIcon { v: number[]; aspect: number }

/* Ikona munice: levý okraj pruhu dole, před číslem munice (to začíná asi na 13 % šířky místa). */
export const ammoIconArea = (b: Box): Box => frac(b, 0.01, 0.82, 0.122, 0.99);

/* Hranice inkoustu v jedné ose (1 % a 99 % hmoty), jako span v equip.ts. */
function span(counts: Float64Array, total: number): [number, number] {
  const lo = total * 0.01, hi = total * 0.99;
  let acc = 0, a = 0, b = counts.length - 1;
  for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc > lo) { a = i; break; } }
  acc = 0;
  for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc >= hi) { b = i; break; } }
  return [a, b];
}

/* Ikona munice ve výřezu. null = ikona chybí nebo je moc malá (nízké rozlišení, prázdné místo). Ikona je vyšší než
   text řádku (asi tři čtvrtiny pruhu), takže nízký krémový útvar (konec čísla) se za ikonu nevezme. */
export function ammoIconOf(img: RgbaImage, box: Box): AmmoIcon | null {
  const area = ammoIconArea(box);
  const { mask, ink, w, h } = maskOf(img, area, isCream);
  if (w < 6 || h < 6) return null;
  const cols = new Float64Array(w), rows = new Float64Array(h);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { cols[x]++; rows[y]++; n++; }
  if (n < 12) return null;
  const [x0, x1] = span(cols, n), [y0, y1] = span(rows, n);
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
  if (sh < Math.max(6, h * 0.5) || sw < 4) return null;
  const v: number[] = [];
  for (let gy = 0; gy < ICON_H; gy++) {
    const ya = y0 + Math.floor((gy * sh) / ICON_H), yb = Math.max(ya + 1, y0 + Math.floor(((gy + 1) * sh) / ICON_H));
    for (let gx = 0; gx < ICON_W; gx++) {
      const xa = x0 + Math.floor((gx * sw) / ICON_W), xb = Math.max(xa + 1, x0 + Math.floor(((gx + 1) * sw) / ICON_W));
      let s = 0, k = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { k++; s += Math.min(1, ink[y * w + x]); }
      v.push(k ? s / k : 0);
    }
  }
  return { v, aspect: Math.round((sw / sh) * 1000) / 1000 };
}

/* Korelace dvou mřížek (středěný kosinus), 0–1. */
export function iconSimilarity(a: number[], b: number[]): number {
  if (a.length !== ICON_LEN || b.length !== ICON_LEN) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < ICON_LEN; i++) { ma += a[i]; mb += b[i]; }
  ma /= ICON_LEN; mb /= ICON_LEN;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < ICON_LEN; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return aa && bb ? Math.max(0, ab / Math.sqrt(aa * bb)) : 0;
}

/* Mřížka vzoru (řádky šestnáctkových číslic) jako čísla 0–1. null = vadný vzor. */
export function templateGrid(t: AmmoIconTemplate): number[] | null {
  if (t.rows.length !== ICON_H || t.rows.some(r => !/^[0-9a-f]+$/.test(r) || r.length !== ICON_W)) return null;
  return t.rows.flatMap(r => [...r].map(c => parseInt(c, 16) / 15));
}
/* Mřížka ikony jako řádky šestnáctkových číslic (pro generátor vzorů). */
export const gridRows = (v: number[]): string[] =>
  Array.from({ length: ICON_H }, (_, y) => v.slice(y * ICON_W, (y + 1) * ICON_W).map(x => Math.max(0, Math.min(15, Math.round(x * 15))).toString(16)).join(''));

/* Prahy podle vlastních snímků hráče (tests/vision/ammo.test.ts): stejný druh 0,9 a víc, jiný druh nejvýš 0,5. */
export const AMMO_SURE = 0.85;
export const AMMO_MARGIN = 0.2;
/* největší dovolený rozdíl poměru stran proti vzoru (násobek) */
export const AMMO_ASPECT_TOL = 1.3;

export interface AmmoTypeRead {
  /* druh jen při jisté shodě */
  type: AmmoType | null;
  /* nejlepší druh (i pod prahem), jeho shoda a shoda nejlepšího jiného druhu */
  best: AmmoType | null; score: number; second: number;
}

let grids: { t: AmmoType; a: number; v: number[] }[] | null = null;
const defaultGrids = () => (grids ??= prepare(AMMO_ICONS));
function prepare(list: AmmoIconTemplate[]): { t: AmmoType; a: number; v: number[] }[] {
  const out: { t: AmmoType; a: number; v: number[] }[] = [];
  for (const t of list) { const v = templateGrid(t); if (v && t.a > 0 && AMMO_TYPES.includes(t.t)) out.push({ t: t.t, a: t.a, v }); }
  return out;
}

/* Druh munice z ikony v místě zbraně. templates = vzory (výchozí ammoIcons.ts). */
export function classifyAmmoIcon(icon: AmmoIcon | null, templates?: AmmoIconTemplate[]): AmmoTypeRead {
  const none: AmmoTypeRead = { type: null, best: null, score: 0, second: 0 };
  if (!icon || icon.v.length !== ICON_LEN || !(icon.aspect > 0)) return none;
  const list = templates ? prepare(templates) : defaultGrids();
  const best = new Map<AmmoType, number>();
  for (const t of list) {
    if (Math.max(icon.aspect / t.a, t.a / icon.aspect) > AMMO_ASPECT_TOL) continue;
    const s = iconSimilarity(icon.v, t.v);
    if (s > (best.get(t.t) ?? 0)) best.set(t.t, s);
  }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return none;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const [bt, bs] = ranked[0], second = ranked[1]?.[1] ?? 0;
  const sure = bs >= AMMO_SURE && bs - second >= AMMO_MARGIN;
  return { type: sure ? bt : null, best: bt, score: r3(bs), second: r3(second) };
}

export const readAmmoType = (img: RgbaImage, box: Box, templates?: AmmoIconTemplate[]): AmmoTypeRead => classifyAmmoIcon(ammoIconOf(img, box), templates);
