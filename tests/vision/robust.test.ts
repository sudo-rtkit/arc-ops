/* Robustnost: snímek zmenšený na 1600×900 a zvětšený na 2560×1440 dá stejné výsledky jako původní 1919×1079.
   (Vzory číslic vznikly ze snímků v měřítku 1919, 1366 a 3200 px, tato dvě měřítka mezi nimi nejsou.) */
import { describe, expect, it } from 'vitest';
import { loadFixture, expected, AMMO, TOOLTIP, TOP } from './load';
import { readScreenshot, type ScreenRead } from '../../src/core/vision/read';
import { resize } from '../../src/core/vision/image';
import { similarity } from '../../src/core/vision/fingerprint';

const grid = (r: ScreenRead, pick: (c: ScreenRead['cells'][number]) => unknown) =>
  [0, 1, 2, 3, 4, 5].map(row => [0, 1, 2, 3].map(col => { const c = r.cells.find(x => x.row === row && x.col === col); return c ? pick(c) : null; }));

for (const [w, h] of [[1600, 900], [2560, 1440]]) {
  describe(`${w}×${h}`, () => {
    it('munice: počty, hlavička, mince, batoh', () => {
      const r = readScreenshot(resize(loadFixture(AMMO), w, h));
      expect(r.cells.map(c => c.count)).toEqual([6, 100, 56, 80, 68, 31, 3]);
      expect([r.headerSlots, r.headerSlotsMax, r.stashValue, r.coins, r.premium]).toEqual([7, null, 3258, 51060, 3950]);
      const bp = r.panels.find(p => p.panel === 'backpack')!;
      expect(bp.cells.map(c => c.count)).toEqual([64, 8]);
    });
    it('celý stash: 24 počtů a hlavička', () => {
      const r = readScreenshot(resize(loadFixture(TOOLTIP), w, h));
      expect(grid(r, c => c.count)).toEqual(expected[TOOLTIP].countsByRow);
      expect([r.headerSlots, r.headerSlotsMax, r.stashValue]).toEqual([200, 268, 752983]);
    });
    it('zbraně: tiery', () => {
      const r = readScreenshot(resize(loadFixture(TOP), w, h));
      expect(grid(r, c => c.tier)).toEqual(expected[TOP].tiersByRow);
    });
    it('otisky stejného políčka se shodují napříč měřítky', () => {
      const base = readScreenshot(loadFixture(TOOLTIP));
      const r = readScreenshot(resize(loadFixture(TOOLTIP), w, h));
      for (const c of r.cells) {
        const b = base.cells.find(x => x.row === c.row && x.col === c.col)!;
        expect(similarity(c.fp, b.fp)).toBeGreaterThan(0.97);
      }
    });
  });
}
