/* Generátor vzorů číslic (src/core/vision/glyphs.ts) z testovacích snímků. Běží jen na vyžádání:
   GEN_GLYPHS=1 pnpm vitest run tests/vision/glyphs.gen.test.ts
   Popisky znaků pocházejí z ručně odečtených hodnot v expected.json. Čárky se nečtou (zahodí je segmentace). */
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFixture, expected, AMMO, TOOLTIP, TOP } from './load';
import { detectLayout, type PanelGrid } from '../../src/core/vision/layout';
import { segmentLine, isCream, isGold, featuresOf, type PixelTest } from '../../src/core/vision/digits';
import { countArea, gridCells } from '../../src/core/vision/cells';
import { coinsArea, panelLabelArea, stashHeaderArea } from '../../src/core/vision/regions';
import { GH, GW, type GlyphFont } from '../../src/core/vision/glyphs';
import type { Box } from '../../src/core/vision/layout';
import { resize, type RgbaImage } from '../../src/core/vision/image';

interface Acc { soft: number[]; ar: number; rh: number; rt: number; holes: number[]; n: number }

it.runIf(process.env.GEN_GLYPHS === '1')('generuje vzory číslic', () => {
  const acc = new Map<string, Acc>();
  const misses: string[] = [];
  let scale = '';
  /* trailing = číslo je na konci řádku (před ním jen části ikony, které se zahodí). */
  const add = (img: RgbaImage, box: Box, test: PixelTest, font: GlyphFont, label: string, what: string, trailing = false) => {
    const line = segmentLine(img, box, test, null);
    const chars = [...label.replace(/,/g, '')];
    let gs = line.glyphs.filter(g => g.y1 - g.y0 + 1 <= line.lineH * 1.1);
    if (trailing && gs.length > chars.length) gs = gs.slice(-chars.length);
    if (gs.length !== chars.length) { misses.push(`${scale} ${what}: ${gs.length} znaků, čekáno ${chars.length} (${label})`); return; }
    gs.forEach((g, i) => {
      const f = featuresOf(g, line.lineTop, line.lineH);
      const k = font + ':' + chars[i] + ':' + scale;
      const a = acc.get(k) || { soft: new Array(GW * GH).fill(0), ar: 0, rh: 0, rt: 0, holes: [0, 0, 0], n: 0 };
      f.soft.forEach((v, j) => { a.soft[j] += v; });
      a.holes[f.holes]++; a.ar += f.ar; a.rh += f.rh; a.rt += f.rt; a.n++;
      acc.set(k, a);
    });
  };
  const stashCounts: Record<string, (number | null)[][]> = {
    [AMMO]: [[6, 100, 56, 80], [68, 31, 3, null]],
    [TOOLTIP]: expected[TOOLTIP].countsByRow,
  };
  /* Vzory ze tří měřítek (1919, 1366 a 3200 px na šířku); testy robustnosti používají jiná (1600, 2560). */
  for (const width of [1919, 1366, 3200]) for (const f of [AMMO, TOOLTIP, TOP]) {
    const src = loadFixture(f);
    const img = width === src.width ? src : resize(src, width, Math.round((src.height * width) / src.width));
    scale = String(width);
    const lay = detectLayout(img)!;
    const panel = (id: string) => lay.panels.find(p => p.panel === id) as PanelGrid;
    const stash = panel('stash');
    const e = expected[f];
    const slots = e.headerSlotsMax ? `${e.headerSlots}/${e.headerSlotsMax}` : String(e.headerSlots);
    add(img, stashHeaderArea(stash), isCream, 'ui', slots + String(e.stashValue), f + ' hlavička');
    add(img, coinsArea(img, lay.cellPx), isCream, 'ui', String(e.coins), f + ' mince');
    add(img, coinsArea(img, lay.cellPx), isGold, 'ui', '3950', f + ' prémiová měna', true);
    add(img, panelLabelArea(panel('backpack')), isCream, 'ui', '2/14', f + ' batoh');
    add(img, panelLabelArea(panel('quickUse')), isCream, 'ui', '2/4', f + ' quick use');
    for (const c of gridCells(stash)) {
      const n = stashCounts[f]?.[c.row]?.[c.col];
      if (n) add(img, countArea(c.box), isCream, 'cell', '×' + n, `${f} políčko ${c.row},${c.col}`);
    }
    const bp = gridCells(panel('backpack')), qu = gridCells(panel('quickUse'));
    for (const x of bp.filter(c => c.row === 0 && c.col === 0)) add(img, countArea(x.box), isCream, 'cell', '×64', f + ' batoh 0');
    for (const x of bp.filter(c => c.row === 2 && c.col === 0)) add(img, countArea(x.box), isCream, 'cell', '×8', f + ' batoh 8');
    for (const x of qu.filter(c => c.row === 0 && c.col === 0)) add(img, countArea(x.box), isCream, 'cell', '×2', f + ' quick 0');
    for (const x of qu.filter(c => c.row === 1 && c.col === 0)) add(img, countArea(x.box), isCream, 'cell', '×1', f + ' quick 3');
  }
  /* V původním měřítku se musí najít všechny znaky; v ostatních se nepasující řádek jen vynechá. */
  if (misses.length) console.log(misses.join('\n'));
  expect(misses.filter(m => m.startsWith('1919'))).toEqual([]);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const list = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, a]) => {
    const [font, ch, sc] = k.split(':');
    const rows: string[] = [];
    for (let y = 0; y < GH; y++) {
      let s = '';
      for (let x = 0; x < GW; x++) s += a.soft[y * GW + x] / a.n >= 0.5 ? '#' : '.';
      rows.push(s);
    }
    return `  { ch: '${ch}', font: '${font}', ar: ${r2(a.ar / a.n)}, rh: ${r2(a.rh / a.n)}, rt: ${r2(a.rt / a.n)}, holes: ${a.holes.indexOf(Math.max(...a.holes))}, rows: [${rows.map(r => `'${r}'`).join(', ')}] }, // ${sc} px, ${a.n}×`;
  });
  const file = fileURLToPath(new URL('../../src/core/vision/glyphs.ts', import.meta.url));
  writeFileSync(file, `/* Vzory číslic herního písma jako malé binární masky GW×GH ('#' = tah). Vygenerováno ze snímků
   v tests/fixtures/vision testem tests/vision/glyphs.gen.test.ts (GEN_GLYPHS=1). Jde o tvary číslic, ne o herní grafiku.
   font: 'cell' = úzké písmo počtů v políčkách, 'ui' = písmo hlaviček a mincí. ar = šířka/výška, rh = výška proti
   řádku, rt = horní okraj proti řádku, holes = počet uzavřených otvorů. Každý znak má vzor pro tři měřítka snímku. Číslice 7 v písmu políček na vzorcích chybí; čte se podle vzoru 'ui'. */
export type GlyphFont = 'cell' | 'ui';
export interface GlyphTemplate { ch: string; font: GlyphFont; ar: number; rh: number; rt: number; holes: number; rows: string[] }
export const GW = ${GW};
export const GH = ${GH};
export const GLYPHS: GlyphTemplate[] = [
${list.join('\n')}
];
`);
});
