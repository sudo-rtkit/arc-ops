/* Generátor vzorů písmen textu malými a velkými písmeny (src/core/vision/bodyGlyphs.ts) z vlastních snímků detailu
   stanice. Běží jen na vyžádání a jen s lokální složkou vlastních snímků:
     GEN_BODY=1 pnpm vitest run tests/vision/body.gen.test.ts
   GEN_BODY_ONLY=gear-level.png vezme vzory jen z jednoho snímku (pro poctivé měření přesnosti na druhém snímku).
   Popisky jsou ručně odečtené texty: názvy materiálů z expected-manual.json a popis stanice v panelu (ruční přepis
   textu ze snímku). Výsledkem jsou tvary písmen jako malé binární masky, ne herní grafika. */
import { expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import { stationLayout } from '../../src/core/vision/progress';
import { darkInk, inkRows } from '../../src/core/vision/text';
import { mixedWords, segmentMixed } from '../../src/core/vision/mixed';
import { featuresOf } from '../../src/core/vision/digits';
import { GH, GW } from '../../src/core/vision/glyphs';
import { resize, type RgbaImage } from '../../src/core/vision/image';
import type { Box } from '../../src/core/vision/layout';

const DIR = FIXTURES + 'own/return-and-progression/';
/* popis stanice v panelu (ruční přepis ze snímku, řádky jak jsou zalomené ve hře) */
const DESC: Record<string, string[]> = {
  'gear-level.png': ['The Gear Bench lets you craft Shields and', 'Augments provided you have the right', 'resources'],
  'gunsmith-level.png': ['Add that extra oomph to your weapons by', 'upgrading them here'],
};
interface Acc { soft: number[]; ar: number; rh: number; rt: number; holes: number[]; n: number }

it.runIf(process.env.GEN_BODY === '1' && existsSync(DIR + 'expected-manual.json'))('generuje vzory písmen textu malými písmeny', () => {
  const exp = JSON.parse(readFileSync(DIR + 'expected-manual.json', 'utf8'));
  const only = process.env.GEN_BODY_ONLY;
  const files = Object.keys(DESC).filter(f => !only || f === only);
  const load = (f: string): RgbaImage => { const p = PNG.sync.read(readFileSync(DIR + f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
  const acc = new Map<string, Acc>();
  const misses: string[] = [];
  let used = 0;
  const add = (img: RgbaImage, box: Box, label: string, what: string, scale: string) => {
    const line = segmentMixed(img, box, darkInk);
    const ws = mixedWords(line);
    const lw = label.split(/\s+/).filter(Boolean);
    if (ws.length !== lw.length) { misses.push(`${scale} ${what}: ${ws.length} slov, čekáno ${lw.length} (${label})`); return; }
    ws.forEach((w, k) => {
      const chars = [...lw[k].replace(/[^A-Za-z]/g, '')];
      if (w.length !== chars.length) { misses.push(`${scale} ${what}: slovo ${lw[k]} má ${w.length} znaků`); return; }
      w.forEach((g, i) => {
        const f = featuresOf(g, line.lineTop, line.lineH);
        const key = chars[i];
        const a = acc.get(key) || { soft: new Array(GW * GH).fill(0), ar: 0, rh: 0, rt: 0, holes: [0, 0, 0], n: 0 };
        f.soft.forEach((v, j) => { a.soft[j] += v; });
        a.holes[f.holes]++; a.ar += f.ar; a.rh += f.rh; a.rt += f.rt; a.n++; used++;
        acc.set(key, a);
      });
    });
  };
  for (const width of [0, 1366, 2560]) for (const f of files) {
    const src = load(f);
    const img = width === 0 ? src : resize(src, width, Math.round((src.height * width) / src.width));
    const scale = width ? String(width) : 'orig';
    const u = img.height / 1080;
    const lay = stationLayout(img);
    if (!lay) { misses.push(`${scale} ${f}: panel nenalezen`); continue; }
    const names = Object.keys(exp[f.replace('.png', '')].resources);
    lay.resources.forEach((r, i) => { if (r.name && names[i]) add(img, r.name, names[i], `${f} název ${i + 1}`, scale); });
    /* popis: řádky pod názvem stanice v horní části panelu (první je štítek, druhý název) */
    const p = lay.panel;
    const top: Box = { x: p.x + u * 20, y: p.y + u * 10, w: p.w - u * 40, h: p.h * 0.33 };
    const rows = inkRows(img, top, darkInk, 3).filter(r => r.y1 - r.y0 + 1 >= u * 8);
    const desc = rows.slice(2, 2 + DESC[f].length);
    if (desc.length !== DESC[f].length) { misses.push(`${scale} ${f}: popis ${desc.length} řádků`); continue; }
    desc.forEach((r, i) => add(img, { x: top.x, y: r.y0 - u * 3, w: top.w, h: r.y1 - r.y0 + 1 + u * 6 }, DESC[f][i], `${f} popis ${i + 1}`, scale));
  }
  if (misses.length) console.log(misses.join('\n'));
  console.log(`znaků: ${used}, vzorů: ${acc.size} (${[...acc.keys()].sort().join('')})`);
  expect(misses.filter(m => m.startsWith('orig'))).toEqual([]);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const list = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ch, a]) => {
    const rows: string[] = [];
    for (let y = 0; y < GH; y++) { let s = ''; for (let x = 0; x < GW; x++) s += a.soft[y * GW + x] / a.n >= 0.5 ? '#' : '.'; rows.push(s); }
    return `  { ch: '${ch}', ar: ${r2(a.ar / a.n)}, rh: ${r2(a.rh / a.n)}, rt: ${r2(a.rt / a.n)}, holes: ${a.holes.indexOf(Math.max(...a.holes))}, rows: [${rows.map(r => `'${r}'`).join(', ')}] }, // ${a.n}×`;
  });
  writeFileSync(fileURLToPath(new URL('../../src/core/vision/bodyGlyphs.ts', import.meta.url)), `/* Vzory písmen textu malými a velkými písmeny (názvy materiálů v detailu stanice) jako malé binární masky GW×GH.
   Vygenerováno testem tests/vision/body.gen.test.ts (GEN_BODY=1, potřebuje lokální vlastní snímky) z názvů materiálů a
   popisu stanice${only ? ` (jen ${only})` : ''}. Jde o tvary písmen, ne o herní grafiku. Výška a poloha jsou v jednotkách řádku od horní
   hrany velkých písmen po účaří (core/vision/mixed.ts). Písmena, která na snímcích nejsou, se čtou jako '?'
   (velká písmena doplní vzory tooltipu a hlaviček) a název se dohledá přibližně. */
export interface BodyTemplate { ch: string; ar: number; rh: number; rt: number; holes: number; rows: string[] }
export const BODY_GLYPHS: BodyTemplate[] = [
${list.join('\n')}
];
`);
}, 300000);
