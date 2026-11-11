/* Generátor vzorů písmen tooltipu (src/core/vision/letterGlyphs.ts) z testovacích snímků. Běží jen na vyžádání
   a jen s lokální složkou vlastních snímků:  GEN_LETTERS=1 pnpm vitest run tests/vision/letters.gen.test.ts
   Popisky jsou ručně odečtené hodnoty z expected.json a own/expected-own.json (název, štítky, stoh).
   Výsledkem jsou tvary písmen jako malé binární masky, ne herní grafika. */
import { expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FIXTURES, TOOLTIP, expected, loadFixture } from './load';
import { detectLayout } from '../../src/core/vision/layout';
import { findOverlays } from '../../src/core/vision/overlays';
import { segmentText, tooltipParts } from '../../src/core/vision/tooltip';
import { featuresOf } from '../../src/core/vision/digits';
import { GH, GW } from '../../src/core/vision/glyphs';
import { resize, type RgbaImage } from '../../src/core/vision/image';
import type { Box } from '../../src/core/vision/layout';
import type { LetterFont } from '../../src/core/vision/letterGlyphs';

const OWN = FIXTURES + 'own/';
interface Acc { soft: number[]; ar: number; rh: number; rt: number; holes: number[]; n: number }

it.runIf(process.env.GEN_LETTERS === '1' && existsSync(OWN + 'expected-own.json'))('generuje vzory písmen tooltipu', () => {
  const own = JSON.parse(readFileSync(OWN + 'expected-own.json', 'utf8'));
  const loadOwn = (f: string): RgbaImage => { const p = PNG.sync.read(readFileSync(OWN + f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
  const sources: { img: () => RgbaImage; tip: { name: string; category: string; rarity: string; stack?: string }; f: string }[] = [
    { f: TOOLTIP, img: () => loadFixture(TOOLTIP), tip: { ...expected[TOOLTIP].tooltip, stack: '2/3' } },
    ...['own-materials-tooltip-medium-gun-parts.png', 'own-materials-tooltip-battery.png', 'own-materials-scrolled-tooltip-crude-explosives.png',
      'own-materials-scrolled-tooltip-fabric.png', 'own-all-legendary-cropped-tooltip.png'].map(f => ({ f, img: () => loadOwn(f), tip: own[f].tooltip })),
  ];
  const acc = new Map<string, Acc>();
  const misses: string[] = [];
  let scale = '';
  const add = (img: RgbaImage, box: Box, font: LetterFont, label: string, what: string, skipLead = false) => {
    const line = segmentText(img, box, null);
    const chars = [...label.replace(/\s/g, '')];
    let gs = line.glyphs;
    if (skipLead && gs.length === chars.length + 1) gs = gs.slice(1);
    if (gs.length !== chars.length) { misses.push(`${scale} ${what}: ${gs.length} znaků, čekáno ${chars.length} (${label}) [${gs.map(g => g.x1 - g.x0 + 1).join(',')}]`); return; }
    gs.forEach((g, i) => {
      const f = featuresOf(g, line.lineTop, line.lineH);
      const k = font + ':' + chars[i] + ':' + scale;
      const a = acc.get(k) || { soft: new Array(GW * GH).fill(0), ar: 0, rh: 0, rt: 0, holes: [0, 0, 0], n: 0 };
      f.soft.forEach((v, j) => { a.soft[j] += v; });
      a.holes[f.holes]++; a.ar += f.ar; a.rh += f.rh; a.rt += f.rt; a.n++;
      acc.set(k, a);
    });
  };
  for (const width of [0, 1366, 3200]) for (const s of sources) {
    const src = s.img();
    const img = width === 0 ? src : resize(src, width, Math.round((src.height * width) / src.width));
    scale = width ? String(width) : 'orig';
    const lay = detectLayout(img)!;
    const tip = findOverlays(img, lay.cellPx).find(o => o.kind === 'tooltip');
    const parts = tip && tooltipParts(img, tip.box);
    if (!parts) { misses.push(`${scale} ${s.f}: tooltip nenalezen`); continue; }
    add(img, parts.name, 'name', s.tip.name, s.f + ' název');
    add(img, parts.tags, 'tag', `${s.tip.category} ${s.tip.rarity}`, s.f + ' štítky', true);
    if (s.tip.stack && parts.stack) add(img, parts.stack, 'tip', s.tip.stack, s.f + ' stoh');
    else if (s.tip.stack) misses.push(`${scale} ${s.f}: pruh nenalezen`);
  }
  if (misses.length) console.log(misses.join('\n'));
  expect(misses.filter(m => m.startsWith('orig'))).toEqual([]);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const list = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => {
    const [font, ch, sc] = k.split(':');
    const rows: string[] = [];
    for (let y = 0; y < GH; y++) { let s = ''; for (let x = 0; x < GW; x++) s += a.soft[y * GW + x] / a.n >= 0.5 ? '#' : '.'; rows.push(s); }
    return `  { ch: '${ch}', font: '${font}', ar: ${r2(a.ar / a.n)}, rh: ${r2(a.rh / a.n)}, rt: ${r2(a.rt / a.n)}, holes: ${a.holes.indexOf(Math.max(...a.holes))}, rows: [${rows.map(r => `'${r}'`).join(', ')}] }, // ${sc}, ${a.n}×`;
  });
  writeFileSync(fileURLToPath(new URL('../../src/core/vision/letterGlyphs.ts', import.meta.url)), `/* Vzory písmen a číslic textu v tooltipu jako malé binární masky GW×GH ('#' = tah). Vygenerováno ze snímků
   testem tests/vision/letters.gen.test.ts (GEN_LETTERS=1, potřebuje lokální vlastní snímky). Jde o tvary písmen,
   ne o herní grafiku. font: 'name' = tučný název, 'tag' = štítky kategorie a vzácnosti, 'tip' = čísla ve spodním
   pruhu. Písmena, která na vzorcích nejsou (J, Q, W, Z), se čtou jako '?' a název se dohledá přibližně. */
export type LetterFont = 'name' | 'tag' | 'tip';
export interface LetterTemplate { ch: string; font: LetterFont; ar: number; rh: number; rt: number; holes: number; rows: string[] }
export const LETTER_GLYPHS: LetterTemplate[] = [
${list.join('\n')}
];
`);
}, 300000);
