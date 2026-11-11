/* Hráčovy vlastní snímky (jen lokálně, složka own/ je v .gitignore kvůli avataru a tagu). Bez složky se testy
   přeskočí, takže čerstvý klon projde. Ručně odečtené hodnoty jsou v own/expected-own.json.
   Regresní testy oprav milníku 3b: 1 hlavička u posunutého STASH, 2 tmavé šedé předměty bez počtu, 3 navázání
   snímků bez společného celého řádku, 4 políčka pod tooltipem, 5 nápověda přes prázdný batoh. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FIXTURES } from './load';
import { readScreenshot, type PanelRead, type ScreenRead } from '../../src/core/vision/read';
import { mergePanels, occupied } from '../../src/core/vision/merge';
import { analyzeShots } from '../../src/core/visionImport';
import type { RgbaImage } from '../../src/core/vision/image';

const OWN = FIXTURES + 'own/';
const HAS_OWN = existsSync(OWN + 'expected-own.json');
const exp = HAS_OWN ? JSON.parse(readFileSync(OWN + 'expected-own.json', 'utf8')) : {};
const cache = new Map<string, ScreenRead>();
export const loadOwn = (f: string): RgbaImage => { const p = PNG.sync.read(readFileSync(OWN + f)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
const read = (f: string): ScreenRead => { if (!cache.has(f)) cache.set(f, readScreenshot(loadOwn(f))); return cache.get(f)!; };
const panel = (f: string, id: string) => read(f).panels.find(p => p.panel === id);
const R: Record<string, string> = { common: 'c', uncommon: 'u', rare: 'r', epic: 'e', legendary: 'l', unknown: '?' };

/* Políčka panelu jako řádky tokenů ve tvaru expected-own.json: „15u“, „IIr“, „-c“; zakryté 'H', prázdné null. */
function tokens(p: PanelRead): (string | null)[][] {
  return Array.from({ length: p.grid.rows }, (_, row) => Array.from({ length: p.grid.cols }, (_, col) => {
    if (p.hidden.some(h => h.row === row && h.col === col)) return 'H';
    const c = p.cells.find(x => x.row === row && x.col === col);
    return c ? `${c.count ?? c.tier ?? '-'}${R[c.rarity]}` : null;
  }));
}
/* Řádky z expected (u neúplného posledního řádku se doplní null). */
const pad = (rows: (string | null)[][], cols = 4, height = rows.length) =>
  [...rows, ...Array.from({ length: Math.max(0, height - rows.length) }, () => [])].map(r => [...r, ...new Array(Math.max(0, cols - r.length)).fill(null)]);

const ALL = ['own-all-1-top.png', 'own-all-2.png', 'own-all-3.png', 'own-all-4.png', 'own-all-5-end.png'];

describe.skipIf(!HAS_OWN)('vlastní snímky hráče', () => {
  describe('oprava 1: hlavička STASH nezávisí na posunutí mřížky', () => {
    it.each(ALL)('%s: 97/232, hodnota 180 133', f => {
      const r = read(f);
      expect([r.headerSlots, r.headerSlotsMax, r.stashValue]).toEqual([97, 232, 180133]);
      expect(r.warnings).not.toContain('headerUnreadable');
    });
    it('posunutý filtr materiálů (s tooltipem): 39, hodnota 79 966', () => {
      for (const f of ['own-materials-scrolled-tooltip-crude-explosives.png', 'own-materials-scrolled-tooltip-fabric.png']) {
        expect([read(f).headerSlots, read(f).headerSlotsMax, read(f).stashValue], f).toEqual([39, null, 79966]);
      }
    });
    it('oříznutý snímek s posunutým STASH: 198/268, hodnota 737 183', () => {
      const r = read('own-all-legendary-cropped-tooltip.png');
      expect([r.headerSlots, r.headerSlotsMax, r.stashValue]).toEqual([198, 268, 737183]);
    });
  });

  describe('oprava 2: tmavé šedé předměty bez počtu nejsou prázdná místa', () => {
    it('own-all-2: zaměřovač (4,3), (5,0) a tlumič (5,1)', () => {
      const p = panel('own-all-2.png', 'stash')!;
      for (const [row, col] of [[4, 3], [5, 0], [5, 1]]) {
        const c = p.cells.find(x => x.row === row && x.col === col);
        expect(c, `${row},${col}`).toBeDefined();
        expect([c!.count, c!.tier, c!.rarity]).toEqual([null, null, 'common']);
      }
    });
    it.each(ALL)('%s: všechna políčka podle expected-own.json', f => {
      const p = panel(f, 'stash')!;
      expect(tokens(p)).toEqual(pad(exp[f].rows, 4, p.grid.rows));
    });
    it('filtr materiálů a quick use: políčka podle expected-own.json', () => {
      expect(tokens(panel('own-materials-top-taskbar.png', 'stash')!)).toEqual(pad(exp['own-materials-top-taskbar.png'].rows));
      const q = panel('own-quickuse-filter.png', 'stash')!;
      expect(tokens(q)).toEqual(pad(exp['own-quickuse-filter.png'].rows, 4, q.grid.rows));
    });
    it('oříznutý snímek: useknutý horní řádek se nečte, celé řádky sedí', () => {
      const p = panel('own-all-legendary-cropped-tooltip.png', 'stash')!;
      expect(tokens(p)).toEqual(pad(exp['own-all-legendary-cropped-tooltip.png'].rows.slice(1)));
      expect(p.partialTop?.visible).toBeGreaterThan(40);
    });
  });

  describe('oprava 3: navázání snímků bez společného celého řádku', () => {
    const stashes = () => ALL.map(f => panel(f, 'stash')!);
    it('5 snímků celého stashe dá přesně 97 políček bez varování', () => {
      const m = mergePanels(stashes());
      expect(occupied(m)).toBe(97);
      expect(m.warnings).toEqual([]);
      expect(m.overlaps).toEqual([1, 0, 0, 0]);
      expect(m.links).toEqual(['overlap', 'partial', 'partial', 'partial']);
    });
    it('kontrolní součet sedí a nulování chybějících je dostupné', () => {
      const a = analyzeShots(ALL.map(read), []);
      expect([a.found, a.headerSlots, a.checksumOk, a.canZero]).toEqual([97, 97, true, true]);
      expect(a.warnings).not.toContain('noOverlap');
      expect(a.warnings).not.toContain('checksum');
    });
    it('vynechaný prostřední snímek se pozná (varování, součet nesedí)', () => {
      const a = analyzeShots([read(ALL[0]), read(ALL[1]), read(ALL[3]), read(ALL[4])], []);
      expect(a.warnings).toContain('noOverlap');
      expect(a.checksumOk).toBe(false);
      expect(a.canZero).toBe(false);
    });
  });

  describe('oprava 4: políčka pod tooltipem jsou zakrytá, ne nečitelná', () => {
    it('tooltip přes pravý sloupec nerozbije hledání STASH (dřív noStash)', () => {
      const r = read('own-materials-scrolled-tooltip-fabric.png');
      expect(r.panel).toBe('stash');
      expect(r.warnings).not.toContain('noStash');
      expect(r.warnings).not.toContain('countUnreadable');
      const p = panel('own-materials-scrolled-tooltip-fabric.png', 'stash')!;
      expect(p.hidden.every(h => h.col === 3)).toBe(true);
      for (let row = 1; row <= 5; row++) expect(p.hidden.some(h => h.row === row && h.col === 3), `${row}`).toBe(true);
    });
    it('baterie: sloupce 2–3 v řádcích 1–5 zakryté, ostatní políčka podle filtru materiálů', () => {
      const p = panel('own-materials-tooltip-battery.png', 'stash')!;
      const want = pad(exp['own-materials-top-taskbar.png'].rows).map((r, row) => r.map((x, col) => (row >= 1 && col >= 2 ? 'H' : x)));
      expect(tokens(p)).toEqual(want);
      expect(read('own-materials-tooltip-battery.png').warnings).not.toContain('countUnreadable');
    });
    it('střední díly: sloupec 3 v řádcích 0–3 zakrytý', () => {
      const p = panel('own-materials-tooltip-medium-gun-parts.png', 'stash')!;
      const want = pad(exp['own-materials-top-taskbar.png'].rows).map((r, row) => r.map((x, col) => (row <= 3 && col === 3 ? 'H' : x)));
      expect(tokens(p)).toEqual(want);
    });
    it('výbušniny (posunuto): viditelná políčka podle expected, sloupec 3 v řádcích 0–4 zakrytý', () => {
      const p = panel('own-materials-scrolled-tooltip-crude-explosives.png', 'stash')!;
      const want = exp['own-materials-scrolled-tooltip-crude-explosives.png'].rowsVisible.map((r: (string | null)[]) => r.map(x => x ?? 'H'));
      expect(tokens(p)).toEqual(want);
    });
    it('zakrytá políčka se nepočítají, ale hlásí se; spojení s nimi jako se zástupným znakem', () => {
      const a = analyzeShots([read('own-materials-top-taskbar.png'), read('own-materials-scrolled-tooltip-crude-explosives.png')], []);
      expect(a.merged!.overlaps).toEqual([3]);
      expect([a.found, a.hidden, a.headerSlots, a.checksumOk]).toEqual([34, 2, 39, false]);
      expect(a.warnings).toContain('occluded');
      expect(a.warnings).not.toContain('noOverlap');
    });
  });

  describe('oprava 5: nápověda a zástupné ikony nejsou předměty', () => {
    it('prázdný batoh pod nápovědou „Empty slot for a weapon“ nemá žádný předmět', () => {
      for (const f of ALL) {
        const bp = panel(f, 'backpack')!;
        expect(bp.cells, f).toEqual([]);
        expect([bp.slots, bp.slotsMax]).toEqual([0, 10]);
      }
    });
    it('volný loadout před raidem: zástupné ikony nejsou předměty, STASH není', () => {
      const r = read('own-prerade-free-loadout.png');
      expect(r.warnings).toContain('noStash');
      expect(r.panels.flatMap(p => p.cells)).toEqual([]);
      expect(r.panels.find(p => p.panel === 'backpack')?.slots).toBe(0);
    });
    it('po raidu KNOCKED OUT: batoh 0/14 a quick use 0/4 prázdné', () => {
      const bp = panel('own-after-raid-knocked-out.png', 'backpack')!, qu = panel('own-after-raid-knocked-out.png', 'quickUse')!;
      expect([bp.slots, bp.slotsMax, bp.cells.length]).toEqual([0, 14, 0]);
      expect([qu.slots, qu.slotsMax, qu.cells.length]).toEqual([0, 4, 0]);
    });
  });

  describe('po raidu: batoh a quick use', () => {
    const f = 'own-after-raid-survived-findings.png';
    it('batoh 14/14 a quick use 4/4 přesně podle expected (odznak „nové“ nevadí)', () => {
      const bp = panel(f, 'backpack')!, qu = panel(f, 'quickUse')!;
      expect([bp.slots, bp.slotsMax]).toEqual([14, 14]);
      expect(tokens(bp)).toEqual(pad(exp[f].backpack.rows));
      expect([qu.slots, qu.slotsMax]).toEqual([4, 4]);
      expect(tokens(qu)).toEqual(pad(exp[f].quickUse.rows, 3));
    });
    it('oříznutý snímek: batoh 2/14 (64, 8), quick use 2/4 (2, 1)', () => {
      const g = 'own-all-legendary-cropped-tooltip.png';
      expect(panel(g, 'backpack')!.cells.map(c => c.count)).toEqual([64, 8]);
      expect(panel(g, 'quickUse')!.cells.map(c => c.count)).toEqual([2, 1]);
    });
  });
});
