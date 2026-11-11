/* Spojení více snímků stejného panelu: překryv mezi po sobě jdoucími snímky se započítá jen jednou. */
import { describe, expect, it } from 'vitest';
import { loadFixture, expected, TOOLTIP, AMMO } from './load';
import { hideRowsFrom, scrollRows } from './synth';
import { readScreenshot } from '../../src/core/vision/read';
import { isCell, mergePanels, occupied } from '../../src/core/vision/merge';

const stashOf = (img: Parameters<typeof readScreenshot>[0]) => readScreenshot(img).panels.find(p => p.panel === 'stash')!;
const counts = (rows: ReturnType<typeof mergePanels>['rows']) => rows.map(r => r.map(c => (isCell(c) ? c.count : null)));

describe('spojení snímků', () => {
  const src = loadFixture(TOOLTIP);
  const a = stashOf(hideRowsFrom(src, 4));
  const b = stashOf(scrollRows(src, 2));
  it('pohledy se překrývají ve dvou řádcích', () => {
    expect(a.grid.rows).toBe(4);
    expect(b.grid.rows).toBe(4);
    expect(b.cells.find(c => c.row === 0 && c.col === 0)?.count).toBe(3);
  });
  it('dva překrývající se výřezy nezdvojí řádky', () => {
    const m = mergePanels([a, b]);
    expect(m.rows.length).toBe(6);
    expect(counts(m.rows)).toEqual(expected[TOOLTIP].countsByRow);
    expect(occupied(m)).toBe(24);
    expect(m.overlaps).toEqual([2]);
    expect(m.warnings).toEqual([]);
  });
  it('stejný snímek dvakrát nic nepřidá', () => {
    const full = stashOf(src);
    const m = mergePanels([full, full]);
    expect(m.rows.length).toBe(6);
    expect(occupied(m)).toBe(24);
  });
  it('snímky bez překryvu se připojí s varováním', () => {
    const m = mergePanels([stashOf(loadFixture(AMMO)), b]);
    expect(m.warnings).toContain('noOverlap');
  });
  it('prázdná políčka se počítají jako prázdná', () => {
    const m = mergePanels([stashOf(loadFixture(AMMO))]);
    expect(occupied(m)).toBe(7);
    expect(m.rows[1][3]).toBeNull();
  });
});
