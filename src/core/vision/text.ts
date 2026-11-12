/* Čtení textu mimo inventář (0.10.1): nadpisy, karty a panely obrazovek postupu (profil, dílna, úkoly, skill tree).
   Znaky se dělí a porovnávají stejně jako v tooltipu (vzory písmen z letterGlyphs.ts a číslic z glyphs.ts).
   Polarita a barva textu se volí testem pixelu. Nic se nehádá: znak bez dost blízkého vzoru je '?', číslo, které
   nejde přečíst celé, je null. Čisté funkce, jen čtou pixely. */
import { hueSat, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';
import { featuresOf, glyphDistance, holesOf, normalizeInk, softOf, words, type Glyph, type Line, type PixelTest } from './digits';
import { GLYPHS } from './glyphs';
import { LETTER_GLYPHS } from './letterGlyphs';
import { HEAD_GLYPHS } from './headGlyphs';
import { segmentText } from './tooltip';
import { isPanelCream } from './overlays';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const test = (ink: (r: number, g: number, b: number, l: number) => number): PixelTest =>
  Object.assign((r: number, g: number, b: number, l: number) => ink(r, g, b, l) >= 0.4, { ink });

/* Světlý neutrální text na tmavém podkladu (nadpisy, název úkolu, záložky). */
export const lightInk: PixelTest = test((r, g, b, l) => (hueSat(r, g, b).s < 0.35 ? clamp01((l - 70) / 120) : 0));
/* Tmavý nebo šedý text na krémovém panelu. */
export const darkInk: PixelTest = test((_r, _g, _b, l) => clamp01((190 - l) / 90));
/* Barevný text v rozmezí odstínu (součty větví skill tree, červený počet v receptu, modrý další rank). */
export function hueInk(h0: number, h1: number, minS = 0.45, minV = 110): PixelTest {
  return test((r, g, b) => {
    const h = hueSat(r, g, b);
    const inHue = h0 <= h1 ? h.h >= h0 && h.h <= h1 : h.h >= h0 || h.h <= h1;
    return inHue && h.s >= minS ? clamp01((h.v - minV + 40) / 80) : 0;
  });
}
export const anyInk = (...ts: PixelTest[]): PixelTest =>
  test((r, g, b, l) => Math.max(...ts.map(t => (t.ink ? t.ink(r, g, b, l) : t(r, g, b, l) ? 1 : 0))));

/* Slovo přečteného řádku: text, jistota (nejhorší znak), poloha v obrázku a výška znaků. */
export interface WordRead { text: string; conf: number; x0: number; x1: number; h: number; glyphs: Glyph[] }
export interface LineRead { text: string; conf: number; words: WordRead[]; lineH: number; line: Line }

/* Písmo řádku: 'name' = tmavý tučný text na krémovém panelu (vzory z tooltipu), 'head' = světlé nadpisy na tmavém.
   Vzory druhého písma platí s malou přirážkou, takže chybějící písmeno jednoho písma doplní druhé. */
export type TextFont = 'name' | 'head';
const bits = (rows: string[]) => rows.join('').split('').map(c => (c === '#' ? 1 : 0));
const LETTERS = [
  ...LETTER_GLYPHS.filter(t => t.font === 'name').map(t => ({ ...t, font: 'name' as TextFont, bits: bits(t.rows) })),
  ...HEAD_GLYPHS.map(t => ({ ...t, font: 'head' as TextFont, bits: bits(t.rows) })),
];
export const MAX_TEXT_DIST = 0.42;
export function classifyText(g: Glyph, lineTop: number, lineH: number, font: TextFont): { ch: string; score: number } {
  const f = featuresOf(g, lineTop, lineH);
  let best = { ch: '?', d: Infinity };
  for (const t of LETTERS) {
    const d = glyphDistance(f, t) + (t.font === font ? 0 : 0.06);
    if (d < best.d) best = { ch: t.ch, d };
  }
  return best.d <= MAX_TEXT_DIST ? { ch: best.ch, score: 1 - best.d } : { ch: '?', score: Math.max(0, 1 - best.d) };
}

function splitPair(g: Glyph, line: Line, font: TextFont): Glyph[] {
  const cw = g.x1 - g.x0 + 1, ch = g.y1 - g.y0 + 1;
  if (cw < ch * 0.9) return [g];
  const col = (x: number) => { let n = 0; for (let y = g.y0; y <= g.y1; y++) n += line.mask[y * line.w + x]; return n; };
  let best = -1, bestInk = Infinity;
  for (let x = g.x0 + Math.round(cw * 0.3); x <= g.x0 + Math.round(cw * 0.7); x++) { const n = col(x); if (n < bestInk) { bestInk = n; best = x; } }
  const part = (x0: number, x1: number): Glyph | null => {
    let y0 = g.y1, y1 = g.y0, n = 0, a = x1, b = x0;
    for (let y = g.y0; y <= g.y1; y++) for (let x = x0; x <= x1; x++) if (line.mask[y * line.w + x]) { n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); a = Math.min(a, x); b = Math.max(b, x); }
    if (!n) return null;
    const c = { x0: a, y0, x1: b, y1, n };
    const p: Glyph = { ...c, soft: normalizeInk(softOf(line.mask, line.w, c)), holes: holesOf(line.mask, line.w, c), ch: '?', score: 0 };
    return Object.assign(p, classifyText(p, line.lineTop, line.lineH, font));
  };
  const l = part(g.x0, best - 1), r = part(best + 1, g.x1);
  return l && r && l.ch !== '?' && r.ch !== '?' ? [l, r] : [g];
}

/* Řádek textu velkými písmeny. gap = mezera mezi slovy jako část výšky řádku. */
export function readLine(img: RgbaImage, box: Box, ink: PixelTest, font: TextFont = 'name', gap = 0.38): LineRead {
  const line = segmentText(img, box, null, ink);
  /* apostrof (malý tvar nahoře) a pomlčka (plochý tvar) do slov nepatří */
  line.glyphs = line.glyphs.filter(g => {
    const gh = g.y1 - g.y0 + 1, gw = g.x1 - g.x0 + 1;
    return !(gh < line.lineH * 0.45 && g.y0 - line.lineTop < line.lineH * 0.2) && gw / gh < 3;
  });
  for (const g of line.glyphs) Object.assign(g, classifyText(g, line.lineTop, line.lineH, font));
  /* Při malém rozlišení se dvě písmena slepí: široký nepřečtený tvar se zkusí rozdělit v nejslabším sloupci. */
  line.glyphs = line.glyphs.flatMap(g => (g.ch === '?' ? splitPair(g, line, font) : [g]));
  const ws = words(line, gap).map(w => ({
    text: w.map(g => g.ch).join(''), conf: Math.min(...w.map(g => g.score)),
    x0: Math.round(box.x) + w[0].x0, x1: Math.round(box.x) + w[w.length - 1].x1,
    h: Math.max(...w.map(g => g.y1 - g.y0 + 1)), glyphs: w,
  }));
  return { text: ws.map(w => w.text).join(' '), conf: ws.length ? Math.min(...ws.map(w => w.conf)) : 0, words: ws, lineH: line.lineH, line };
}

/* Číslice a lomítko: vzory písma hlaviček (ui), políček (cell) a pruhu tooltipu (tip). */
const DIGITS = [
  ...GLYPHS.filter(t => /^[\d/]$/.test(t.ch)),
  ...LETTER_GLYPHS.filter(t => /^[\d/]$/.test(t.ch)),
  ...HEAD_GLYPHS.filter(t => /^[\d/]$/.test(t.ch)),
].map(t => ({ ...t, bits: t.rows.join('').split('').map(c => (c === '#' ? 1 : 0)) }));
export const MAX_DIGIT_DIST = 0.42;

export function classifyDigit(g: Glyph, lineTop: number, lineH: number, slash = true): { ch: string; score: number; margin: number } {
  const f = featuresOf(g, lineTop, lineH);
  const best = new Map<string, number>();
  for (const t of DIGITS) {
    if (!slash && t.ch === '/') continue;
    const d = glyphDistance(f, t);
    if (d < (best.get(t.ch) ?? Infinity)) best.set(t.ch, d);
  }
  const [a, b] = [...best.entries()].sort((x, y) => x[1] - y[1]);
  if (!a || a[1] > MAX_DIGIT_DIST) return { ch: '?', score: a ? Math.max(0, 1 - a[1]) : 0, margin: 0 };
  /* dvě skoro stejně blízké číslice (9/5, 7/1) = nejisté: jistota klesá s malým odstupem od druhé nejlepší */
  const margin = b ? b[1] - a[1] : 1;
  return { ch: a[0], score: Math.min(1 - a[1], 0.5 + 4 * margin), margin };
}

/* Čárka nebo tečka: malý tvar dole v řádku. */
const isComma = (g: Glyph, line: Line) => (g.y1 - g.y0 + 1) < line.lineH * 0.45 && g.y0 - line.lineTop > line.lineH * 0.45;

/* Slovo jako číslo („20“, „2,977/29,000“, „58,313“). Čárky se ověří podle polohy (skupiny po třech). */
export function wordNumber(w: Glyph[], line: Line, slash = true): { text: string; conf: number; scores: number[] } {
  let text = '';
  const scores: number[] = [];
  for (const g of w) {
    if (isComma(g, line)) { text += ','; scores.push(1); continue; }
    const c = classifyDigit(g, line.lineTop, line.lineH, slash);
    text += c.ch; scores.push(c.score);
  }
  return { text, conf: scores.length ? Math.min(...scores) : 0, scores };
}

/* Číslo se skupinami tisíců; špatně umístěná čárka = nečitelné. */
export function parseNumber(s: string): number | null {
  if (!/^\d{1,3}(,\d{3})*$/.test(s) && !/^\d+$/.test(s)) return null;
  return Number(s.replace(/,/g, ''));
}

/* Číslo z výřezu (všechny tvary v jednom slově, ikony vyšší než řádek se vynechají). */
export function readNumberIn(img: RgbaImage, box: Box, ink: PixelTest): { value: number | null; conf: number; text: string } {
  const line = segmentText(img, box, null, ink);
  const gs = line.glyphs.filter(g => g.y1 - g.y0 + 1 <= line.lineH * 1.15 && g.n >= 4);
  if (!gs.length) return { value: null, conf: 0, text: '' };
  const r = wordNumber(gs, line, false);
  const v = parseNumber(r.text);
  return { value: v, conf: v === null ? 0 : r.conf, text: r.text };
}

/* Podíl krémových pixelů ve výřezu (řídce). */
export function creamShare(img: RgbaImage, b: Box, step = 3): number {
  let on = 0, n = 0;
  for (let y = Math.round(b.y); y < b.y + b.h; y += step) for (let x = Math.round(b.x); x < b.x + b.w; x += step) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    n++; if (isPanelCream(...rgbAt(img, x, y))) on++;
  }
  return n ? on / n : 0;
}

/* Krémový panel v oblasti: sloupce, kde převládá krém, pak řádky v jejich rozsahu. null = žádný panel. */
export function creamPanel(img: RgbaImage, area: Box, minW: number, minH: number): Box | null {
  const x0 = Math.max(0, Math.round(area.x)), x1 = Math.min(img.width - 1, Math.round(area.x + area.w - 1));
  const y0 = Math.max(0, Math.round(area.y)), y1 = Math.min(img.height - 1, Math.round(area.y + area.h - 1));
  const colFrac = (x: number) => { let on = 0, n = 0; for (let y = y0; y <= y1; y += 2) { n++; if (isPanelCream(...rgbAt(img, x, y))) on++; } return on / n; };
  /* nejdelší souvislý úsek sloupců s aspoň čtvrtinou krému */
  let best: [number, number] | null = null, start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const ok = x <= x1 && colFrac(x) >= 0.25;
    if (ok && start < 0) start = x;
    if (!ok && start >= 0) { if (!best || x - start > best[1] - best[0]) best = [start, x - 1]; start = -1; }
  }
  if (!best || best[1] - best[0] + 1 < minW) return null;
  const [a, b] = best, rowFrac = (y: number) => { let on = 0, n = 0; for (let x = a; x <= b; x += 2) { n++; if (isPanelCream(...rgbAt(img, x, y))) on++; } return on / n; };
  let top = -1, bottom = -1, gap = 0;
  for (let y = y0; y <= y1; y++) {
    if (rowFrac(y) >= 0.5) { if (top < 0) top = y; bottom = y; gap = 0; }
    else if (top >= 0 && ++gap > minH * 0.5) break;
  }
  if (top < 0 || bottom - top + 1 < minH) return null;
  return { x: a, y: top, w: b - a + 1, h: bottom - top + 1 };
}

/* Řádky textu ve výřezu (svislá projekce pixelů inkoustu). */
export function inkRows(img: RgbaImage, b: Box, ink: PixelTest, minPx = 2): { y0: number; y1: number }[] {
  const out: { y0: number; y1: number }[] = [];
  const xa = Math.max(0, Math.round(b.x)), xb = Math.min(img.width - 1, Math.round(b.x + b.w - 1));
  let start = -1, miss = 0;
  const yEnd = Math.min(img.height - 1, Math.round(b.y + b.h - 1));
  for (let y = Math.max(0, Math.round(b.y)); y <= yEnd; y++) {
    let n = 0;
    for (let x = xa; x <= xb; x++) { const [r, g, bb] = rgbAt(img, x, y); if (ink(r, g, bb, 0.299 * r + 0.587 * g + 0.114 * bb)) n++; }
    if (n >= minPx) { if (start < 0) start = y; miss = 0; }
    else if (start >= 0 && ++miss > 1) { out.push({ y0: start, y1: y - miss }); start = -1; miss = 0; }
  }
  if (start >= 0) out.push({ y0: start, y1: yEnd });
  return out.filter(l => l.y1 - l.y0 >= 3);
}

/* ----- římské číslice (ranky skillů, úrovně stanic) -----
   Číslice mají patky nahoře a dole, které tahy spojí do jednoho tvaru. Uprostřed výšky se spočítají běhy:
   svislé tahy stojí na místě, ramena V se směrem dolů sbíhají. I, II, III = počet tahů; V = dvě sbíhavá ramena;
   IV = tah a za ním V. Jiný tvar = null (nic se nehádá). */
function runsAt(mask: Uint8Array, w: number, y: number, x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const v = x <= x1 && !!mask[y * w + x];
    if (v && s < 0) s = x;
    if (!v && s >= 0) { out.push([s, x - 1]); s = -1; }
  }
  return out;
}

export function romanOf(mask: Uint8Array, w: number, c: { x0: number; y0: number; x1: number; y1: number }): number | null {
  const ch = c.y1 - c.y0 + 1;
  if (ch < 6) return null;
  const row = (f: number) => Math.round(c.y0 + f * (ch - 1));
  const hi = runsAt(mask, w, row(0.33), c.x0, c.x1), lo = runsAt(mask, w, row(0.62), c.x0, c.x1);
  if (!hi.length || hi.length > 4) return null;
  /* tahy jsou úzké; plný blok nebo skvrna číslice není */
  if (hi.some(r => r[1] - r[0] + 1 > ch * 0.45)) return null;
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  /* V: poslední dva běhy nahoře se dole přiblíží (nebo slijí) */
  let v = false;
  if (hi.length >= 2) {
    const a = hi[hi.length - 2], b = hi[hi.length - 1], dTop = mid(b) - mid(a);
    const lowRight = lo.filter(r => r[1] >= a[0]);
    const dLow = lowRight.length >= 2 ? mid(lowRight[lowRight.length - 1]) - mid(lowRight[lowRight.length - 2]) : 0;
    v = dLow < dTop - Math.max(1.5, ch * 0.12);
  }
  /* svislé tahy: stejný počet běhů a stejná poloha nahoře i dole */
  if (!v) {
    if (lo.length !== hi.length) return null;
    if (hi.some((r, i) => Math.abs(mid(r) - mid(lo[i])) > Math.max(1.5, ch * 0.1))) return null;
    return hi.length <= 3 ? hi.length : null;
  }
  const stems = hi.length - 2;
  if (stems === 0) return 5;
  if (stems === 1) return 4;
  return null;
}
