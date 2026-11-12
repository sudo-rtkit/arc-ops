/* Umělé obrazovky postupu pro testy bez vlastních snímků (0.10.1). Text se kreslí ze vzorů písmen aplikace
   (letterGlyphs.ts, glyphs.ts), takže test ověřuje celou cestu: druh obrazovky, polohy, čtení a párování s daty.
   Rozvržení odpovídá obrazovkám hry v 1920×1080; menší a větší rozlišení se dělají změnou velikosti. */
import type { RgbaImage } from '../../src/core/vision/image';
import { LETTER_GLYPHS } from '../../src/core/vision/letterGlyphs';
import { GLYPHS } from '../../src/core/vision/glyphs';
import { HEAD_GLYPHS } from '../../src/core/vision/headGlyphs';

type RGB = [number, number, number];
export const CREAM: RGB = [249, 238, 223];
export const INK: RGB = [24, 24, 32];
export const WHITE: RGB = [236, 236, 236];
const BG: RGB = [10, 10, 14];

export function canvas(w = 1920, h = 1080, bg: RGB = BG): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([bg[0], bg[1], bg[2], 255], i * 4);
  return { width: w, height: h, data };
}
export function rect(img: RgbaImage, x: number, y: number, w: number, h: number, c: RGB) {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) img.data.set(c, (yy * img.width + xx) * 4);
}
export function frame(img: RgbaImage, x: number, y: number, s: number, t: number, c: RGB) {
  rect(img, x, y, s, t, c); rect(img, x, y + s - t, s, t, c); rect(img, x, y, t, s, c); rect(img, x + s - t, y, t, s, c);
}
export function disc(img: RgbaImage, cx: number, cy: number, r: number, c: RGB) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) rect(img, x, y, 1, 1, c);
}

/* Znak ze vzoru: písmena z tučného písma názvu, číslice a lomítko z písma hlaviček. Vrací šířku. */
const tmpl = (ch: string) => (/[\d/]/.test(ch) ? GLYPHS.find(t => t.ch === ch && t.font === 'ui') : LETTER_GLYPHS.find(t => t.ch === ch && t.font === 'name') ?? HEAD_GLYPHS.find(t => t.ch === ch));
export function text(img: RgbaImage, x: number, y: number, h: number, s: string, c: RGB): number {
  let cx = x;
  for (const ch of s) {
    if (ch === ' ') { cx += Math.round(h * 0.45); continue; }
    if (ch === ',') { rect(img, cx, y + h - Math.round(h * 0.2), Math.max(2, Math.round(h * 0.15)), Math.round(h * 0.25), c); cx += Math.round(h * 0.3); continue; }
    const t = tmpl(ch);
    if (!t) throw new Error('bez vzoru: ' + ch);
    const gh = Math.round(h * t.rh), gy = y + Math.round(h * t.rt), gw = Math.max(2, Math.round(gh * t.ar));
    for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) {
      const row = t.rows[Math.min(10, Math.floor((yy * 11) / gh))];
      if (row[Math.min(6, Math.floor((xx * 7) / gw))] === '#') rect(img, cx + xx, gy + yy, 1, 1, c);
    }
    cx += gw + Math.max(2, Math.round(h * 0.14));
  }
  return cx - x;
}

/* Římská číslice s patkami (jako ranky v tooltipu): I, II, III, IV, V. */
export function roman(img: RgbaImage, x: number, y: number, h: number, v: number, c: RGB): number {
  const t = Math.max(2, Math.round(h * 0.12)), stem = Math.max(2, Math.round(h * 0.18)), gap = Math.max(2, Math.round(h * 0.16));
  const stems = v === 4 ? 1 : v === 5 ? 0 : v;
  const vw = v >= 4 ? Math.round(h * 0.9) : 0;
  const w = stems * stem + Math.max(0, stems - 1) * gap + (vw ? (stems ? gap : 0) + vw : 0) + 2 * t;
  rect(img, x, y, w, t, c); rect(img, x, y + h - t, w, t, c);
  let cx = x + t;
  for (let i = 0; i < stems; i++) { rect(img, cx, y, stem, h, c); cx += stem + gap; }
  if (vw) {
    for (let yy = t; yy < h - t; yy++) {
      const f = (yy - t) / (h - 2 * t), half = vw / 2, off = Math.round(f * (half - stem / 2));
      rect(img, cx + off, y + yy, stem, 1, c); rect(img, cx + vw - stem - off, y + yy, stem, 1, c);
    }
  }
  return w;
}

/* Horní lišta: buď zvýrazněná záložka (bez šipky zpět), nebo šipka zpět + nadpis a podnadpis. */
export function tab(img: RgbaImage, x: number, label: string) {
  const w = text(img, x + 16, 24, 15, label, WHITE);
  rect(img, x + 6, 12, w + 20, 2, WHITE);
  rect(img, x + 6, 49, w + 20, 2, WHITE);
}
export function header(img: RgbaImage, title: string, sub = '') {
  disc(img, 86, 31, 15, [46, 50, 65]);
  const w = text(img, 141, 24, 15, title, WHITE);
  if (sub) text(img, 141 + w + 40, 26, 12, sub, WHITE);
}

export function profileScreen(o: { level: string; xp: string; coins: string }): RgbaImage {
  const img = canvas();
  tab(img, 320, 'RAIDER');
  text(img, 1626, 24, 15, o.coins, [232, 222, 206]);
  rect(img, 1580, 72, 300, 46, [46, 50, 65]);
  rect(img, 1580, 118, 300, 107, CREAM);
  text(img, 1600, 141, 19, o.level, INK);
  rect(img, 1600, 170, 260, 8, [205, 200, 192]);
  text(img, 1700, 190, 15, o.xp, [96, 96, 104]);
  return img;
}

/* Úkol obchodníka: název, cíle se zaškrtávacími políčky (true = plné, false = prázdné). */
export function questScreen(o: { trader: string; title: string; checks: boolean[] }): RgbaImage {
  const img = canvas();
  header(img, o.trader, 'GRENADES');
  tab(img, 580, 'QUESTS');
  rect(img, 1404, 112, 468, 856, CREAM);
  text(img, 858, 430, 19, o.title, WHITE);
  o.checks.forEach((c, i) => {
    const y = 141 + i * 40;
    if (c) rect(img, 1420, y, 16, 16, [138, 139, 147]);
    else frame(img, 1420, y, 16, 2, [101, 107, 122]);
    rect(img, 1445, y + 4, 200, 8, [120, 112, 104]);
  });
  return img;
}

/* Skill tree s tooltipem skillu: název, aktuální rank (tmavě) a případně šipka a další rank (modře). */
const BLUE: RGB = [63, 146, 172];
export function skillScreen(o: { name: string; current: number | null; next?: number; totals?: [string, string, string] }): RgbaImage {
  const img = canvas();
  header(img, 'SKILL TREE');
  const [c, m, s] = o.totals ?? ['0', '17', '4'];
  text(img, 698, 890, 26, c, [40, 230, 120]);
  text(img, 945, 620, 26, m, [250, 205, 20]);
  text(img, 1250, 890, 26, s, [240, 30, 30]);
  rect(img, 1132, 338, 520, 147, CREAM);
  text(img, 1153, 360, 19, o.name, INK);
  let x = 1520;
  if (o.current !== null) x += roman(img, x, 358, 22, o.current, INK) + 14;
  if (o.next) {
    for (let yy = 0; yy < 16; yy++) rect(img, x, 361 + yy, Math.max(1, Math.round(8 - Math.abs(yy - 8))), 1, BLUE);
    x += 22;
    roman(img, x, 358, 22, o.next, BLUE);
  }
  return img;
}
