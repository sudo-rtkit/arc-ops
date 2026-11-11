/* Tooltip předmětu: krémový panel vedle kurzoru. Nahoře štítky „kategorie | vzácnost“ (tmavý text na barvě
   vzácnosti), pod nimi název velkým tučným písmem, dole pruh „15/15 · váha · cena“. Všechen text je tmavý.
   Písmena se čtou stejně jako číslice: rozdělení na souvislé tvary a porovnání se vzory z letterGlyphs.ts
   (malé binární masky vytvořené z testovacích snímků, ne herní grafika). Název se pak přiřadí ke katalogu
   přibližným porovnáním (names.ts), takže chybějící vzor písmene nevadí. */
import { hueSat, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';
import { components, featuresOf, glyphDistance, holesOf, maskOf, mergeStacked, normalizeInk, softOf, words, type Glyph, type Line, type PixelTest } from './digits';
import { GLYPHS } from './glyphs';
import { LETTER_GLYPHS, type LetterFont } from './letterGlyphs';
import { rarityOfColor, type Rarity } from './rarity';
import { isPanelCream } from './overlays';

export interface TooltipRead {
  /* přečtený název (velká písmena, neznámý znak = '?') */
  name: string; nameConf: number;
  /* text štítku kategorie, např. „TOPSIDE MATERIAL“ */
  category: string;
  rarity: Rarity;
  stack: { n: number; max: number } | null;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/* Tmavý text na krémovém panelu i na barevném štítku. */
export const isInk: PixelTest = Object.assign((r: number, g: number, b: number, l: number) => l < 90, { ink: (_r: number, _g: number, _b: number, l: number) => clamp01((125 - l) / 70) });

/* Přesné okraje panelu: řádky a sloupce, kde převládá krémová barva. */
export function refineBox(img: RgbaImage, b: Box): Box {
  const frac = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0, on = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      n++; if (isPanelCream(...rgbAt(img, x, y))) on++;
    }
    return n ? on / n : 0;
  };
  const x0 = Math.round(b.x), x1 = Math.round(b.x + b.w - 1), y0 = Math.round(b.y), y1 = Math.round(b.y + b.h - 1);
  const pad = 12;
  const rowOk = (y: number) => frac(x0, y, x1, y) > 0.45, colOk = (x: number) => frac(x, y0, x, y1) > 0.45;
  let top = y0 - pad; while (top < y1 && !rowOk(top)) top++;
  let bottom = y1 + pad; while (bottom > top && !rowOk(bottom)) bottom--;
  let left = x0 - pad; while (left < x1 && !colOk(left)) left++;
  let right = x1 + pad; while (right > left && !colOk(right)) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/* Řádky textu uvnitř panelu (svislá projekce tmavých pixelů). */
export function textLines(img: RgbaImage, b: Box): { y0: number; y1: number }[] {
  const out: { y0: number; y1: number }[] = [];
  const xa = Math.round(b.x + b.w * 0.03), xb = Math.round(b.x + b.w * 0.97);
  let start = -1, miss = 0;
  for (let y = Math.round(b.y) + 2; y <= b.y + b.h - 2; y++) {
    let n = 0;
    for (let x = xa; x <= xb; x++) { const [r, g, bb] = rgbAt(img, x, y); if (isInk(r, g, bb, 0.299 * r + 0.587 * g + 0.114 * bb)) n++; }
    if (n >= 2) { if (start < 0) start = y; miss = 0; }
    else if (start >= 0 && ++miss > 1) { out.push({ y0: start, y1: y - miss }); start = -1; miss = 0; }
  }
  if (start >= 0) out.push({ y0: start, y1: Math.round(b.y + b.h - 2) });
  return out.filter(l => l.y1 - l.y0 >= 3);
}

const TEMPLATES = LETTER_GLYPHS.map(t => ({ ...t, bits: t.rows.join('').split('').map(c => (c === '#' ? 1 : 0)) }));
const UI_DIGITS = GLYPHS.filter(t => t.font === 'ui').map(t => ({ ...t, bits: t.rows.join('').split('').map(c => (c === '#' ? 1 : 0)) }));
export const MAX_LETTER_DIST = 0.42;

export function classifyLetter(f: ReturnType<typeof featuresOf>, font: LetterFont): { ch: string; score: number } {
  let best = { ch: '?', d: Infinity };
  for (const t of TEMPLATES) {
    const d = glyphDistance(f, t) + (t.font === font ? 0 : 0.08);
    if (d < best.d) best = { ch: t.ch, d };
  }
  /* Číslice v pruhu tooltipu, které na vzorcích chybí, se vezmou z písma hlaviček. */
  if (font === 'tip') for (const t of UI_DIGITS) { const d = glyphDistance(f, t) + 0.1; if (d < best.d) best = { ch: t.ch, d }; }
  return best.d <= MAX_LETTER_DIST ? { ch: best.ch, score: 1 - best.d } : { ch: '?', score: Math.max(0, 1 - best.d) };
}

/* Rozdělení řádku na znaky. Na rozdíl od číslic se široké tvary nedělí (M, W jsou širší než vysoké). */
export function segmentText(img: RgbaImage, box: Box, font: LetterFont | null): Line {
  const { mask, ink, w, h } = maskOf(img, box, isInk);
  let cs = mergeStacked(components(mask, w, h)).filter(c => c.n >= 3);
  const hs = cs.map(c => c.y1 - c.y0 + 1).sort((a, b) => a - b);
  const lineH = hs.length ? hs[Math.floor((hs.length - 1) * 0.8)] : 1;
  cs = cs.filter(c => c.y1 - c.y0 + 1 >= lineH * 0.15 && c.y1 - c.y0 + 1 <= lineH * 1.6);
  const tall = cs.filter(c => Math.abs(c.y1 - c.y0 + 1 - lineH) <= Math.max(1, lineH * 0.15)).map(c => c.y0).sort((a, b) => a - b);
  const lineTop = tall.length ? tall[Math.floor((tall.length - 1) / 2)] : 0;
  const glyphs: Glyph[] = cs.sort((a, b) => a.x0 - b.x0).map(c => {
    const g = { ...c, soft: normalizeInk(softOf(ink, w, c)), holes: holesOf(mask, w, c), ch: '?', score: 0 };
    if (font) Object.assign(g, classifyLetter(featuresOf(g, lineTop, lineH), font));
    return g;
  });
  return { glyphs, lineTop, lineH, mask, w, h };
}

export const lineText = (line: Line, gap = 0.4): { text: string; conf: number } => {
  const ws = words(line, gap);
  return { text: ws.map(w => w.map(g => g.ch).join('')).join(' '), conf: ws.length ? Math.min(...ws.flat().map(g => g.score)) : 0 };
};

/* Oblasti textu tooltipu: řádek štítků, řádek názvu a první pole spodního pruhu. */
export interface TooltipParts { box: Box; tags: Box; name: Box; stack: Box | null }
export function tooltipParts(img: RgbaImage, raw: Box): TooltipParts | null {
  const box = refineBox(img, raw);
  if (box.w < 20 || box.h < 20) return null;
  const lines = textLines(img, box);
  if (lines.length < 2) return null;
  const pad = 3;
  const area = (l: { y0: number; y1: number }, x0 = box.x + box.w * 0.03, x1 = box.x + box.w * 0.97): Box => ({ x: x0, y: l.y0 - pad, w: x1 - x0, h: l.y1 - l.y0 + 1 + 2 * pad });
  const [tags, name] = lines;
  /* Spodní pruh: poslední řádek, pokud leží v dolní desetině panelu. Pole stohu je vlevo (asi třetina šířky). */
  const last = lines[lines.length - 1];
  const stack = lines.length >= 3 && last.y0 > box.y + box.h * 0.8 ? area(last, box.x + 2, box.x + box.w * 0.3) : null;
  return { box, tags: area(tags), name: area(name), stack };
}

/* Vzácnost podle barvy štítku: syté pixely v řádku štítků; šedý štítek = běžný předmět. */
function tagRarity(img: RgbaImage, b: Box): Rarity {
  const hs: [number, number, number][] = [];
  for (let y = Math.round(b.y); y < b.y + b.h; y++) for (let x = Math.round(b.x); x < b.x + b.w; x += 2) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const [r, g, bb] = rgbAt(img, x, y), h = hueSat(r, g, bb);
    if (h.s > 0.45 && h.v > 90) hs.push([r, g, bb]);
  }
  if (hs.length < 20) return 'common';
  const m = (i: number) => hs.map(p => p[i]).sort((a, c) => a - c)[Math.floor(hs.length / 2)];
  const r = rarityOfColor(m(0), m(1), m(2));
  return r === 'unknown' ? 'common' : r;
}

export const RARITY_WORDS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export function readTooltip(img: RgbaImage, raw: Box, _cellPx: number): TooltipRead | null {
  const parts = tooltipParts(img, raw);
  if (!parts) return null;
  const name = lineText(segmentText(img, parts.name, 'name'), 0.38);
  const tagLine = segmentText(img, parts.tags, 'tag');
  /* Ikona kategorie na začátku řádku štítků není písmeno: první slovo z jednoho tvaru se vynechá. */
  const tw = words(tagLine, 0.45).map(w => w.map(g => g.ch).join(''));
  if (tw.length && tw[0].length === 1) tw.shift();
  if (tw.length > 1) tw.pop(); /* poslední slovo je vzácnost */
  let stack: TooltipRead['stack'] = null;
  if (parts.stack) {
    const st = lineText(segmentText(img, parts.stack, 'tip'), 0.6).text.replace(/\s/g, '');
    const m = /^(\d{1,5})\/(\d{1,5})$/.exec(st);
    if (m && Number(m[1]) <= Number(m[2])) stack = { n: Number(m[1]), max: Number(m[2]) };
  }
  const text = name.text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { name: text, nameConf: name.conf, category: tw.join(' '), rarity: tagRarity(img, parts.tags), stack };
}
