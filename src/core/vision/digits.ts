/* Čtení čísel z políček a hlaviček: „×19“, „200/268“, „7“, „51,060“ a tieru „I–IV“. Text se rozdělí na znaky
   (souvislé oblasti pixelů), každý znak se zmenší na malou mřížku a porovná se vzory z glyphs.ts. Tier se čte
   podle počtu svislých tahů, protože římské číslice tvoří jeden spojený tvar. */
import { hueSat, lumAt, rgbAt, type RgbaImage } from './image';
import type { Box } from './layout';
import { GLYPHS, GH, GW, type GlyphFont, type GlyphTemplate } from './glyphs';

export type Tier = 'I' | 'II' | 'III' | 'IV';
/* Test pixelu textu. ink = odstupňovaná intenzita 0–1 (pro tvar znaku); maska je ink >= 0,4. */
export type PixelTest = ((r: number, g: number, b: number, lum: number) => boolean) & { ink?: (r: number, g: number, b: number, lum: number) => number };
const withInk = (ink: (r: number, g: number, b: number, lum: number) => number): PixelTest =>
  Object.assign((r: number, g: number, b: number, l: number) => ink(r, g, b, l) >= 0.4, { ink });
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/* Krémový text (počty, hlavička, mince). */
export const isCream: PixelTest = withInk((r, g, b, l) => (hueSat(r, g, b).s < 0.4 ? clamp01((l - 50) / 150) : 0));
/* Žlutá prémiová měna. */
export const isGold: PixelTest = withInk((r, g, b) => { const h = hueSat(r, g, b); return h.s > 0.5 && h.h > 30 && h.h < 60 ? clamp01((h.v - 60) / 150) : 0; });
/* Šedý tier v rohu zbraně. */
export const isGrey: PixelTest = (r, g, b, l) => l > 55 && l < 175 && hueSat(r, g, b).s < 0.3;

export interface Comp { x0: number; y0: number; x1: number; y1: number; n: number }
export interface Glyph extends Comp { soft: number[]; holes: number; ch: string; score: number }
export interface Line { glyphs: Glyph[]; lineTop: number; lineH: number; mask: Uint8Array; w: number; h: number }

/* Binární maska výřezu podle testu pixelu. */
export function maskOf(img: RgbaImage, box: Box, test: PixelTest): { mask: Uint8Array; ink: Float32Array; w: number; h: number } {
  const x0 = Math.max(0, Math.round(box.x)), y0 = Math.max(0, Math.round(box.y));
  const w = Math.max(0, Math.min(Math.round(box.w), img.width - x0)), h = Math.max(0, Math.min(Math.round(box.h), img.height - y0));
  const mask = new Uint8Array(w * h), ink = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = rgbAt(img, x0 + x, y0 + y), l = lumAt(img, x0 + x, y0 + y);
    const on = test(r, g, b, l);
    if (on) mask[y * w + x] = 1;
    ink[y * w + x] = test.ink ? test.ink(r, g, b, l) : on ? 1 : 0;
  }
  return { mask, ink, w, h };
}

/* Souvislé oblasti (8-okolí). */
export function components(mask: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(mask.length), out: Comp[] = [], stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const c: Comp = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    out.push(c);
  }
  return out;
}

/* Části jednoho znaku nad sebou (např. rozpadlé „×“ po zmenšení) se spojí. */
function mergeStacked(cs: Comp[]): Comp[] {
  const list = [...cs].sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
    if (ov >= 0.6 * Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1)) {
      list[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
      list.splice(j, 1); j = i;
    }
  }
  return list;
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

/* Dvě slepené číslice („00“) se rozdělí v nejslabším sloupci. Vyšší tvary (ikony) se nedělí. */
function splitWide(mask: Uint8Array, w: number, c: Comp, lineH: number): Comp[] {
  const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
  if (cw <= lineH * 0.95 || ch > lineH * 1.2 || ch < lineH * 0.75) return [c];
  let best = -1, bestInk = Infinity;
  for (let x = c.x0 + Math.round(cw * 0.3); x <= c.x0 + Math.round(cw * 0.7); x++) {
    let ink = 0;
    for (let y = c.y0; y <= c.y1; y++) ink += mask[y * w + x];
    if (ink < bestInk) { bestInk = ink; best = x; }
  }
  const part = (x0: number, x1: number): Comp | null => {
    let y0 = c.y1, y1 = c.y0, n = 0, a = x1, b = x0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x]) { n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); a = Math.min(a, x); b = Math.max(b, x); }
    return n ? { x0: a, y0, x1: b, y1, n } : null;
  };
  const l = part(c.x0, best - 1), r = part(best + 1, c.x1);
  if (!l || !r) return [c];
  return [...splitWide(mask, w, l, lineH), ...splitWide(mask, w, r, lineH)];
}

/* Počet uzavřených otvorů znaku (8 má dva, 0/6/9 jeden). Tvar se změnou měřítka mění, počet otvorů ne. */
export function holesOf(mask: Uint8Array, w: number, c: Comp): number {
  const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1, seen = new Uint8Array(cw * ch);
  const bg = (x: number, y: number) => !mask[(c.y0 + y) * w + c.x0 + x];
  let holes = 0;
  for (let y0 = 0; y0 < ch; y0++) for (let x0 = 0; x0 < cw; x0++) {
    if (seen[y0 * cw + x0] || !bg(x0, y0)) continue;
    let edge = false, n = 0;
    const stack = [y0 * cw + x0]; seen[y0 * cw + x0] = 1;
    while (stack.length) {
      const p = stack.pop()!, x = p % cw, y = (p - x) / cw; n++;
      if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || seen[ny * cw + nx] || !bg(nx, ny)) continue;
        seen[ny * cw + nx] = 1; stack.push(ny * cw + nx);
      }
    }
    if (!edge) holes++;
  }
  return Math.min(holes, 2);
}

/* Tahy zmenšeného písma nemají plnou intenzitu: maska se vztáhne k nejsilnějším polím znaku. */
export function normalizeInk(soft: number[]): number[] {
  const top = [...soft].sort((a, b) => b - a)[Math.floor(soft.length * 0.1)] || 0;
  const k = 1 / Math.max(0.3, top);
  return soft.map(v => Math.min(1, v * k));
}

/* Měkká maska znaku GW×GH (podíl rozsvícených pixelů v každém políčku mřížky). */
export function softOf(mask: ArrayLike<number>, w: number, c: Comp): number[] {
  const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1, out: number[] = [];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const xa = c.x0 + (gx * cw) / GW, xb = c.x0 + ((gx + 1) * cw) / GW;
    const ya = c.y0 + (gy * ch) / GH, yb = c.y0 + ((gy + 1) * ch) / GH;
    let on = 0, all = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
      const fy = Math.min(y + 1, yb) - Math.max(y, ya);
      for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
        const f = fy * (Math.min(x + 1, xb) - Math.max(x, xa));
        all += f; on += f * mask[y * w + x];
      }
    }
    out.push(all ? on / all : 0);
  }
  return out;
}

export interface GlyphFeatures { soft: number[]; ar: number; rh: number; rt: number; holes: number }
export const featuresOf = (g: Comp & { soft: number[]; holes: number }, lineTop: number, lineH: number): GlyphFeatures => ({
  soft: g.soft, holes: g.holes, ar: (g.x1 - g.x0 + 1) / (g.y1 - g.y0 + 1), rh: (g.y1 - g.y0 + 1) / lineH, rt: (g.y0 - lineTop) / lineH,
});

const bitsOf = (t: GlyphTemplate): number[] => {
  const out: number[] = [];
  for (const row of t.rows) for (const c of row) out.push(c === '#' ? 1 : 0);
  return out;
};
const TEMPLATES = GLYPHS.map(t => ({ ...t, bits: bitsOf(t) }));

/* Vzdálenost znaku od vzoru: tvar + poměr stran + výška a poloha v řádku (rozliší čárku, tečku a „×“). */
export function glyphDistance(f: GlyphFeatures, t: { bits: number[]; ar: number; rh: number; rt: number; holes: number }): number {
  let d = 0;
  for (let i = 0; i < f.soft.length; i++) d += Math.abs(f.soft[i] - t.bits[i]);
  d /= f.soft.length;
  return d + 0.35 * Math.abs(Math.log(f.ar / t.ar)) + 1.0 * Math.abs(f.rh - t.rh) + 0.5 * Math.abs(f.rt - t.rt) + 0.15 * Math.abs(f.holes - t.holes);
}

export const MAX_GLYPH_DIST = 0.4;

export function classify(f: GlyphFeatures, font: GlyphFont): { ch: string; score: number } {
  let best = { ch: '?', d: Infinity };
  for (const t of TEMPLATES) {
    const d = glyphDistance(f, t) + (t.font === font ? 0 : 0.06);
    if (d < best.d) best = { ch: t.ch, d };
  }
  return best.d <= MAX_GLYPH_DIST ? { ch: best.ch, score: 1 - best.d } : { ch: '?', score: Math.max(0, 1 - best.d) };
}

/* Rozdělí výřez na znaky a změří řádek (výška nejvyššího znaku). Drobný šum se zahodí. */
export function segmentLine(img: RgbaImage, box: Box, test: PixelTest, font: GlyphFont | null): Line {
  const { mask, ink, w, h } = maskOf(img, box, test);
  let cs = mergeStacked(components(mask, w, h)).filter(c => c.n >= 3);
  /* Výška řádku = nejčastější výška znaků (ikona mince vedle čísla je vyšší a nesmí ji určit, „×“ je nižší);
     při shodě vyhraje vyšší. */
  const heights = cs.map(c => c.y1 - c.y0 + 1);
  let lineH = 1, bestN = 0;
  for (const hh of heights) {
    const n = heights.filter(x => Math.abs(x - hh) <= Math.max(1, hh * 0.12)).length;
    if (n > bestN || (n === bestN && hh > lineH)) { bestN = n; lineH = hh; }
  }
  /* Čárky a tečky (oddělovače tisíců) se pro čtení čísla nepotřebují a zahodí se se šumem. */
  cs = cs.filter(c => c.y1 - c.y0 + 1 >= lineH * 0.34);
  cs = cs.flatMap(c => splitWide(mask, w, c, lineH));
  const tall = cs.filter(c => Math.abs(c.y1 - c.y0 + 1 - lineH) <= Math.max(1, lineH * 0.15));
  const lineTop = tall.length ? median(tall.map(c => c.y0)) : 0;
  const glyphs: Glyph[] = cs.sort((a, b) => a.x0 - b.x0).map(c => {
    const soft = normalizeInk(softOf(ink, w, c));
    const g = { ...c, soft, holes: holesOf(mask, w, c), ch: '?', score: 0 };
    if (font) Object.assign(g, classify(featuresOf(g, lineTop, lineH), font));
    return g;
  });
  return { glyphs, lineTop, lineH, mask, w, h };
}

/* Slova: znaky oddělené mezerou větší než část výšky řádku. */
export function words(line: Line, gapFactor = 0.45): Glyph[][] {
  const out: Glyph[][] = [];
  let cur: Glyph[] = [];
  for (const g of line.glyphs) {
    if (cur.length && g.x0 - cur[cur.length - 1].x1 - 1 > line.lineH * gapFactor) { out.push(cur); cur = []; }
    cur.push(g);
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface ReadText { text: string; conf: number }
export const wordText = (w: Glyph[]): ReadText => ({ text: w.map(g => g.ch).join(''), conf: Math.min(...w.map(g => g.score)) });

/* Číslo s oddělovači tisíců („51,060“, „752,983“, „7“). */
export function parseGrouped(s: string): number | null {
  if (!/^\d{1,3}(,\d{3})*$/.test(s) && !/^\d+$/.test(s)) return null;
  return Number(s.replace(/,/g, ''));
}

/* Počet v pravém dolním rohu políčka („×19“). Vrací null, když tam žádný krémový text není. */
export function readCount(img: RgbaImage, area: Box): { count: number | null; conf: number; text: string } | null {
  const line = segmentLine(img, area, isCream, 'cell');
  if (!line.glyphs.length) return null;
  const ws = words(line, 0.6);
  const last = ws[ws.length - 1];
  /* Znak „×“ je malý a po zmenšení snímku má nestálý tvar: pozná se i podle polohy (nízký, uprostřed výšky řádku). */
  const first = last[0];
  if (first.ch !== '×' && last.length > 1) {
    const f = featuresOf(first, line.lineTop, line.lineH);
    if (f.rh > 0.3 && f.rh < 0.65 && f.rt > 0.15 && f.rt < 0.5 && f.ar > 0.6 && f.ar < 1.6) { first.ch = '×'; first.score = Math.max(first.score, 0.7); }
  }
  const rt = wordText(last);
  const m = /^×?(\d{1,5})$/.exec(rt.text);
  if (!m) return { count: null, conf: 0, text: rt.text };
  /* Bez „×“ na začátku je čtení nejisté. */
  return { count: Number(m[1]), conf: rt.text.startsWith('×') ? rt.conf : rt.conf * 0.6, text: rt.text };
}

/* Počet běhů rozsvícených pixelů v řádku masky v rozmezí sloupců. */
function runs(mask: Uint8Array, w: number, y: number, x0: number, x1: number): number {
  let n = 0, on = false;
  for (let x = x0; x <= x1; x++) { const v = !!mask[y * w + x]; if (v && !on) n++; on = v; }
  return n;
}

/* Začátek nejpravějšího běhu v řádku (nebo -1). */
function lastRunStart(mask: Uint8Array, w: number, y: number, x0: number, x1: number): number {
  let start = -1, on = false;
  for (let x = x0; x <= x1; x++) { const v = !!mask[y * w + x]; if (v && !on) start = x; on = v; }
  return start;
}

/* Tier: šedá římská číslice vpravo dole (patky nahoře a dole tahy spojují do jednoho tvaru).
   V se pozná podle pravého ramene, které se směrem dolů posouvá doleva; svislé tahy stojí na místě.
   Bez V rozhoduje počet tahů v prostřední části znaku. */
export function readTier(img: RgbaImage, area: Box): Tier | null {
  const { mask, w, h } = maskOf(img, area, isGrey);
  const cs = components(mask, w, h).filter(c => c.n >= 6);
  if (!cs.length) return null;
  const c = cs.sort((a, b) => b.x1 - a.x1)[0];
  const ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1;
  if (ch < 6 || cw > ch * 1.6 || c.x1 < w * 0.6) return null;
  const row = (f: number) => Math.round(c.y0 + f * (ch - 1));
  const slope = lastRunStart(mask, w, row(0.3), c.x0, c.x1) - lastRunStart(mask, w, row(0.75), c.x0, c.x1);
  const mid = [0.35, 0.45, 0.55, 0.65].map(f => runs(mask, w, row(f), c.x0, c.x1)).sort((a, b) => a - b);
  const stems = mid[1];
  if (slope > Math.max(1.5, ch * 0.12)) return stems >= 2 ? 'IV' : null; /* samotné V tier není */
  return stems >= 1 && stems <= 3 ? (['I', 'II', 'III'] as const)[stems - 1] : null;
}

/* Čísla v řádku: všechna slova, která jdou přečíst jako číslo nebo „a/b“. */
export interface NumberToken { text: string; conf: number; x0: number; x1: number }
export function numberTokens(img: RgbaImage, box: Box, test: PixelTest, font: GlyphFont = 'ui'): NumberToken[] {
  const line = segmentLine(img, box, test, font);
  /* Ikony (vyšší než řádek) se vynechají; slovo z neznámých znaků se zahodí. */
  const ws = words(line).map(w => w.filter(g => g.y1 - g.y0 + 1 <= line.lineH * 1.12)).filter(w => w.length);
  const toks = ws.map(w => ({ ...wordText(w), x0: w[0].x0 + box.x, x1: w[w.length - 1].x1 + box.x }))
    .filter(t => /^[\d/]+$/.test(t.text));
  /* Mezera po zahozené čárce rozdělí „51,060“ na dvě slova: trojice číslic těsně za číslem se připojí. */
  const out: NumberToken[] = [];
  for (const t of toks) {
    const prev = out[out.length - 1];
    if (prev && /^\d{3}$/.test(t.text) && /\d$/.test(prev.text) && t.x0 - prev.x1 - 1 <= line.lineH * 0.85) {
      prev.text += ',' + t.text; prev.conf = Math.min(prev.conf, t.conf); prev.x1 = t.x1;
    } else out.push({ ...t });
  }
  return out;
}
