/* Rozpoznávací jádro nad vzorovými snímky (cizí inventář, 1919×1079) a ručně odečtenými hodnotami v expected.json. */
import { describe, expect, it } from 'vitest';
import { loadFixture, expected, AMMO, TOOLTIP, TOP } from './load';
import { readScreenshot, type CellRead, type ScreenRead } from '../../src/core/vision/read';

const at = (r: ScreenRead, row: number, col: number): CellRead | undefined => r.cells.find(c => c.row === row && c.col === col);
const panel = (r: ScreenRead, id: string) => r.panels.find(p => p.panel === id)!;

describe('munice (filtr)', () => {
  const r = readScreenshot(loadFixture(AMMO));
  const e = expected[AMMO];
  it('najde STASH a hlavičku', () => {
    expect(r.panel).toBe('stash');
    expect(r.headerSlots).toBe(7);
    expect(r.headerSlotsMax).toBeNull();
    expect(r.stashValue).toBe(e.stashValue);
  });
  it('mince a prémiová měna', () => {
    expect(r.coins).toBe(51060);
    expect(r.premium).toBe(3950);
  });
  it('7 políček s počty 6, 100, 56, 80, 68, 31, 3', () => {
    expect(r.cells.map(c => [c.row, c.col, c.count])).toEqual(e.cells.map((c: { row: number; col: number; count: number }) => [c.row, c.col, c.count]));
    expect(at(r, 0, 0)!.rarity).toBe('rare');
  });
  it('políčka od řádku 1, sloupce 3 jsou prázdná', () => {
    expect(r.cells.every(c => c.row < 1 || (c.row === 1 && c.col < 3))).toBe(true);
    expect(panel(r, 'stash').empty.length).toBe(24 - 7);
  });
  it('batoh 2/14 s počty 64 a 8, quick use 2/4 s počty 2 a 1', () => {
    const bp = panel(r, 'backpack'), qu = panel(r, 'quickUse');
    expect([bp.slots, bp.slotsMax]).toEqual([2, 14]);
    expect(bp.cells.map(c => c.count)).toEqual([64, 8]);
    expect([qu.slots, qu.slotsMax]).toEqual([2, 4]);
    expect(qu.cells.map(c => c.count)).toEqual([2, 1]);
  });
});

describe('celý stash s tooltipem', () => {
  const r = readScreenshot(loadFixture(TOOLTIP));
  const e = expected[TOOLTIP];
  it('hlavička 200/268, hodnota 752 983, mince', () => {
    expect([r.headerSlots, r.headerSlotsMax, r.stashValue, r.coins]).toEqual([200, 268, 752983, 51060]);
  });
  it('24 celých políček s počty, 7. řádek se ignoruje', () => {
    const rows = [0, 1, 2, 3, 4, 5].map(row => [0, 1, 2, 3].map(col => at(r, row, col)?.count ?? null));
    expect(rows).toEqual(e.countsByRow);
    expect(r.cells.length).toBe(24);
    expect(r.cells.some(c => c.row >= e.partialRowIgnored)).toBe(false);
  });
  it('tooltip: název, kategorie, vzácnost a stoh pojmenují zvýrazněné políčko (2,3)', () => {
    expect(r.tooltip).toMatchObject({ name: e.tooltip.name, category: e.tooltip.category, rarity: 'epic', stack: { n: 2, max: 3 }, cell: { panel: 'stash', ...e.tooltip.forCell } });
    expect(at(r, 2, 3)?.name).toBe('MAGNETIC ACCELERATOR');
    expect(r.cells.filter(c => c.name).length).toBe(1);
  });
  it('zvýrazněné políčko (řádek 2, sloupec 3) se přečte', () => {
    expect(at(r, 2, 3)?.count).toBe(2);
    expect(at(r, 2, 3)?.rarity).toBe('epic');
  });
});

describe('zbraně', () => {
  const r = readScreenshot(loadFixture(TOP));
  const e = expected[TOP];
  it('tiery podle expected.json', () => {
    const rows = [0, 1, 2, 3, 4, 5].map(row => [0, 1, 2, 3].map(col => at(r, row, col)?.tier ?? null));
    expect(rows).toEqual(e.tiersByRow);
  });
  it('políčka bez počtu nemají počet', () => {
    expect(r.cells.length).toBe(24);
    expect(r.cells.every(c => c.count === null)).toBe(true);
  });
  it('vzácnosti', () => {
    expect([0, 1, 2, 3].map(c => at(r, 0, c)!.rarity)).toEqual(['epic', 'epic', 'rare', 'rare']);
    expect(at(r, 1, 1)!.rarity).toBe('uncommon');
    expect(at(r, 1, 2)!.rarity).toBe('common');
  });
});

it('na snímku bez inventory vrátí varování', () => {
  const img = { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4).fill(30) };
  const r = readScreenshot(img);
  expect(r.warnings).toContain('noInventory');
  expect(r.cells).toEqual([]);
});
