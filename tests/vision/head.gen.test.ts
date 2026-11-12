/* Generátor vzorů písma nadpisů (src/core/vision/headGlyphs.ts) z vlastních snímků obrazovek postupu. Běží jen na
   vyžádání a jen s lokální složkou vlastních snímků:  GEN_HEAD=1 pnpm vitest run tests/vision/head.gen.test.ts
   Popisky jsou ručně odečtené texty nadpisů (hlavička podobrazovky, záložka, název úkolu). Výsledkem jsou tvary písmen
   jako malé binární masky, ne herní grafika. */
import { expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import { segmentText } from '../../src/core/vision/tooltip';
import { featuresOf } from '../../src/core/vision/digits';
import { GH, GW } from '../../src/core/vision/glyphs';
import { resize, type RgbaImage } from '../../src/core/vision/image';
import { lightInk } from '../../src/core/vision/text';

const DIR = FIXTURES + 'own/return-and-progression/';
interface Acc { soft: number[]; ar: number; rh: number; rt: number; holes: number[]; n: number }
/* [snímek, x, y, w, h v pixelech 1080p (x od levého okraje), text] */
const SAMPLES: [string, number, number, number, number, string][] = [
  ['gear-level.png', 132, 17, 250, 30, 'GEAR BENCH LEVEL 01'],
  ['gunsmith-level.png', 132, 17, 225, 30, 'GUNSMITH LEVEL 01'],
  ['quest-shoring.png', 132, 17, 320, 30, 'APOLLO GRENADES & GADGETS'],
  ['quest-shoring.png', 596, 19, 90, 26, 'QUESTS'],
  ['quest-shoring.png', 850, 424, 330, 34, 'SHORING UP DEFENSES'],
  ['quest-battening.png', 850, 424, 330, 34, 'BATTENING DOWN'],
  ['quest-shoring.png', 850, 400, 200, 22, 'RIVEN TIDES'],
  ['skill-tree.png', 132, 17, 130, 30, 'SKILL TREE'],
  ['gear-level.png', 548, 19, 100, 26, 'LEVEL UP'],
  ['profile.png', 325, 19, 80, 26, 'RAIDER'],
  ['workshop-overview.png', 180, 19, 116, 26, 'WORKSHOP'],
];

it.runIf(process.env.GEN_HEAD === '1' && existsSync(DIR + 'expected-manual.json'))('generuje vzory písma nadpisů', () => {
  const load = (f: string): RgbaImage => { const p = PNG.sync.read(readFileSync(DIR + f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
  const acc = new Map<string, Acc>();
  const misses: string[] = [];
  for (const width of [0, 1366, 2560]) for (const [f, x, y, w, h, label] of SAMPLES) {
    const src = load(f);
    const img = width === 0 ? src : resize(src, width, Math.round((src.height * width) / src.width));
    const u = img.height / 1080, scale = width ? String(width) : 'orig';
    const line = segmentText(img, { x: x * u, y: y * u, w: w * u, h: h * u }, null, lightInk);
    /* pomlčka (plochý tvar) do popisku nepatří */
    const gs = line.glyphs.filter(g => (g.x1 - g.x0 + 1) / (g.y1 - g.y0 + 1) < 3);
    const chars = [...label.replace(/\s/g, '')];
    if (gs.length !== chars.length) { misses.push(`${scale} ${f} ${label}: ${gs.length} znaků, čekáno ${chars.length}`); continue; }
    gs.forEach((g, i) => {
      const ft = featuresOf(g, line.lineTop, line.lineH);
      const k = chars[i] + ':' + scale;
      const a = acc.get(k) || { soft: new Array(GW * GH).fill(0), ar: 0, rh: 0, rt: 0, holes: [0, 0, 0], n: 0 };
      ft.soft.forEach((v, j) => { a.soft[j] += v; });
      a.holes[ft.holes]++; a.ar += ft.ar; a.rh += ft.rh; a.rt += ft.rt; a.n++;
      acc.set(k, a);
    });
  }
  if (misses.length) console.log(misses.join('\n'));
  expect(misses.filter(m => m.startsWith('orig'))).toEqual([]);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const list = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => {
    const [ch, sc] = k.split(':');
    const rows: string[] = [];
    for (let yy = 0; yy < GH; yy++) { let s = ''; for (let xx = 0; xx < GW; xx++) s += a.soft[yy * GW + xx] / a.n >= 0.5 ? '#' : '.'; rows.push(s); }
    return `  { ch: '${ch}', font: 'head', ar: ${r2(a.ar / a.n)}, rh: ${r2(a.rh / a.n)}, rt: ${r2(a.rt / a.n)}, holes: ${a.holes.indexOf(Math.max(...a.holes))}, rows: [${rows.map(r => `'${r}'`).join(', ')}] }, // ${sc}, ${a.n}×`;
  });
  writeFileSync(fileURLToPath(new URL('../../src/core/vision/headGlyphs.ts', import.meta.url)), `/* Vzory písma nadpisů obrazovek postupu (světlý text na tmavém: hlavička podobrazovky, záložka, název úkolu) jako
   malé binární masky GW×GH ('#' = tah). Vygenerováno ze snímků testem tests/vision/head.gen.test.ts (GEN_HEAD=1,
   potřebuje lokální vlastní snímky). Jde o tvary písmen, ne o herní grafiku. Chybějící písmena se čtou podle vzorů
   tučného názvu z tooltipu (letterGlyphs.ts) nebo jako '?'. */
export interface HeadTemplate { ch: string; font: 'head'; ar: number; rh: number; rt: number; holes: number; rows: string[] }
export const HEAD_GLYPHS: HeadTemplate[] = [
${list.join('\n')}
];
`);
}, 300000);
