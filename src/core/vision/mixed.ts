/* Text malými a velkými písmeny (0.12.0): názvy materiálů v detailu stanice dílny („Power Cable“, „Wasp Driver“).
   Řádek se změří podle účaří (nejčastější spodní hrana znaků) a horní hrany velkých písmen a dotažnic, takže výška a
   poloha malého písmene (x, dotažnice, dolní dotažnice g/p/y) jsou ve všech velikostech stejné. Znak se porovná se
   vzory bodyGlyphs.ts (vygenerované z vlastních snímků) a s velkými písmeny tooltipu a hlaviček (malá přirážka).
   Nic se nehádá: znak bez dost blízkého vzoru je '?'. Výsledek je jen text a jistota; přiřazení ke známému názvu
   dělá core/progressImport.ts (přibližná shoda, nikdy vymyšlený název). Čisté funkce, jen čtou pixely. */
import type { RgbaImage } from './image';
import type { Box } from './layout';
import { components, featuresOf, glyphDistance, holesOf, maskOf, mergeStacked, normalizeInk, softOf, type Comp, type Glyph, type GlyphFeatures, type PixelTest } from './digits';
import { BODY_GLYPHS } from './bodyGlyphs';
import { LETTER_GLYPHS } from './letterGlyphs';
import { HEAD_GLYPHS } from './headGlyphs';

const bits = (rows: string[]) => rows.join('').split('').map(c => (c === '#' ? 1 : 0));
type T = { ch: string; ar: number; rh: number; rt: number; holes: number; bits: number[]; penalty: number };
const TEMPLATES: T[] = [
  ...BODY_GLYPHS.map(t => ({ ...t, bits: bits(t.rows), penalty: 0 })),
  /* velká písmena jiných písem: jen ta, která vzory textu nemají (jinak by přebila vlastní vzor) */
  ...[...LETTER_GLYPHS.filter(t => t.font === 'name'), ...HEAD_GLYPHS]
    .filter(t => /^[A-Z]$/.test(t.ch) && !BODY_GLYPHS.some(b => b.ch === t.ch))
    .map(t => ({ ...t, bits: bits(t.rows), penalty: 0.08 })),
];
export const MAX_MIXED_DIST = 0.4;

/* Nejbližší vzor a odstup od druhého nejlepšího jiného znaku. */
export function classifyMixed(f: GlyphFeatures): { ch: string; score: number } {
  const best = new Map<string, number>();
  for (const t of TEMPLATES) {
    const d = glyphDistance(f, t) + t.penalty;
    if (d < (best.get(t.ch) ?? Infinity)) best.set(t.ch, d);
  }
  const [a, b] = [...best.entries()].sort((x, y) => x[1] - y[1]);
  if (!a || a[1] > MAX_MIXED_DIST) return { ch: '?', score: a ? Math.max(0, 1 - a[1]) : 0 };
  /* dva skoro stejně blízké znaky (l/I, rn/m) = nejisté */
  const margin = b ? b[1] - a[1] : 1;
  return { ch: a[0], score: Math.min(1 - a[1], 0.5 + 4 * margin) };
}

export interface MixedLine { glyphs: Glyph[]; lineTop: number; lineH: number; base: number; xTop: number; mask: Uint8Array; w: number; h: number }

const modeOf = (xs: number[], tol = 1): number => {
  let best = xs[0] ?? 0, n = 0;
  for (const v of xs) {
    const c = xs.filter(x => Math.abs(x - v) <= tol).length;
    if (c > n || (c === n && v > best)) { n = c; best = v; }
  }
  return best;
};

/* Rozdělí výřez na znaky a změří řádek: účaří, výška malých písmen a horní hrana velkých. Tečky, čárky a pomlčky
   (malé nebo ploché tvary) se zahodí; do názvů nepatří. */
export function segmentMixed(img: RgbaImage, box: Box, ink: PixelTest): MixedLine {
  const { mask, ink: soft, w, h } = maskOf(img, box, ink);
  let cs: Comp[] = mergeStacked(components(mask, w, h)).filter(c => c.n >= 3 && !(c.y0 <= 0 && c.y1 >= h - 1));
  const empty: MixedLine = { glyphs: [], lineTop: 0, lineH: 1, base: 0, xTop: 0, mask, w, h };
  if (!cs.length) return empty;
  const hs = cs.map(c => c.y1 - c.y0 + 1).sort((a, b) => a - b);
  const big = hs[Math.floor((hs.length - 1) * 0.8)];
  /* šum a interpunkce: nízké tvary (tečka, čárka, pomlčka) pryč */
  cs = cs.filter(c => c.y1 - c.y0 + 1 >= big * 0.45);
  if (!cs.length) return empty;
  const base = modeOf(cs.map(c => c.y1));
  const onBase = cs.filter(c => Math.abs(c.y1 - base) <= 1);
  const xTop = modeOf(onBase.map(c => c.y0));
  const xh = Math.max(1, base - xTop + 1);
  const tall = onBase.filter(c => c.y0 <= xTop - xh * 0.25).map(c => c.y0).sort((a, b) => a - b);
  const lineTop = tall.length ? tall[Math.floor((tall.length - 1) / 2)] : Math.round(xTop - xh * 0.45);
  const lineH = Math.max(1, base - lineTop + 1);
  /* tvary výrazně nad horní hranou nebo pod dolní dotažnicí do řádku nepatří */
  cs = cs.filter(c => c.y0 >= lineTop - lineH * 0.35 && c.y1 <= base + lineH * 0.6);
  const glyphs: Glyph[] = cs.sort((a, b) => a.x0 - b.x0).map(c => {
    const g: Glyph = { ...c, soft: normalizeInk(softOf(soft, w, c)), holes: holesOf(mask, w, c), ch: '?', score: 0 };
    Object.assign(g, classifyMixed(featuresOf(g, lineTop, lineH)));
    /* úzký svislý tah: l a I jsou v tomto písmu stejné, i má nahoře tečku oddělenou mezerou (spojí ji mergeStacked) */
    if (BARS.has(g.ch) || (g.ch === '?' && c.x1 - c.x0 + 1 <= lineH * 0.3 && c.y1 - c.y0 + 1 >= lineH * 0.8 && c.y1 <= base + 1)) {
      const gap = hasGapRow(mask, w, c, c.y0 + 1, c.y0 + Math.max(2, Math.round((c.y1 - c.y0 + 1) * 0.4)));
      if (gap) Object.assign(g, { ch: 'i', score: Math.max(g.score, 0.6) });
      else if (g.ch !== '?' && g.ch !== 'i') g.ch = 'l';
      else if (g.ch === 'i') g.score = Math.min(g.score, 0.5);
    }
    return g;
  });
  /* svislý tah na začátku slova je velké I (názvy začínají velkým písmenem), uvnitř slova malé l */
  for (const word of mixedWords({ glyphs, lineTop, lineH, base, xTop, mask, w, h })) if (word[0]?.ch === 'l') word[0].ch = 'I';
  return { glyphs, lineTop, lineH, base, xTop, mask, w, h };
}

const BARS = new Set(['l', 'I', 'i']);
/* Je ve výřezu tvaru prázdný řádek (mezi tečkou a tahem)? */
function hasGapRow(mask: Uint8Array, w: number, c: Comp, ya: number, yb: number): boolean {
  for (let y = ya; y <= Math.min(yb, c.y1 - 1); y++) {
    let ink = 0;
    for (let x = c.x0; x <= c.x1; x++) ink += mask[y * w + x];
    if (!ink) return true;
  }
  return false;
}

/* Slova podle mezer (mezera mezi slovy je v tomto písmu aspoň asi třetina výšky řádku). */
export function mixedWords(line: MixedLine, gap = 0.3): Glyph[][] {
  const out: Glyph[][] = [];
  let cur: Glyph[] = [];
  for (const g of line.glyphs) {
    if (cur.length && g.x0 - cur[cur.length - 1].x1 - 1 > line.lineH * gap) { out.push(cur); cur = []; }
    cur.push(g);
  }
  if (cur.length) out.push(cur);
  return out;
}

/* Řádek textu: text ('?' = nepřečtený znak), jistota (nejhorší znak) a jistoty jednotlivých znaků. */
export function readMixed(img: RgbaImage, box: Box, ink: PixelTest): { text: string; conf: number; scores: number[]; chars: number } {
  const line = segmentMixed(img, box, ink);
  const ws = mixedWords(line);
  const text = ws.map(w => w.map(g => g.ch).join('')).join(' ');
  const scores = line.glyphs.map(g => g.score);
  return { text, conf: scores.length ? Math.min(...scores) : 0, scores, chars: scores.length };
}
