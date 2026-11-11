/* Otisky a párování: stejný předmět ve dvou políčkách má podobnost nad prahem, různé předměty pod prahem.
   Skupiny stejných předmětů jsou ručně odečtené v expected.json (sameItemGroups). */
import { describe, expect, it } from 'vitest';
import { loadFixture, expected, AMMO, TOOLTIP } from './load';
import { readScreenshot, type CellRead } from '../../src/core/vision/read';
import { similarity } from '../../src/core/vision/fingerprint';
import { MATCH_MAYBE, MATCH_SURE, clusterFps, matchFp, type LearnedFp } from '../../src/core/vision/match';

const key = (c: { row: number; col: number }) => `${c.row},${c.col}`;
const groupsOf = (f: string): string[][] => expected[f].sameItemGroups.map((g: number[][]) => g.map(([r, c]) => `${r},${c}`).sort());

describe.each([TOOLTIP, AMMO])('otisky %s', f => {
  const r = readScreenshot(loadFixture(f));
  const groups = groupsOf(f);
  const gid = (c: CellRead) => groups.findIndex(g => g.includes(key(c)));
  it('stejný předmět nad prahem, různé předměty pod prahem', () => {
    const bad: string[] = [];
    for (const a of r.cells) for (const b of r.cells) {
      if (key(a) >= key(b)) continue;
      const s = similarity(a.fp, b.fp);
      if (gid(a) === gid(b) ? s <= MATCH_SURE : s >= MATCH_MAYBE) bad.push(`${key(a)}~${key(b)} ${s.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });
  it('shlukování dá přesně ručně odečtené skupiny', () => {
    const got = clusterFps(r.cells).map(g => g.map(key).sort()).sort();
    expect(got).toEqual([...groups].sort());
  });
});

describe('matchFp', () => {
  const r = readScreenshot(loadFixture(TOOLTIP));
  const cell = (row: number, col: number) => r.cells.find(c => c.row === row && c.col === col)!;
  const learned: LearnedFp[] = [{ id: 'a', itemKey: 'Magnetic Accelerator', kind: 'material', fp: cell(2, 3).fp, rarity: 'epic', at: 1 }];
  it('naučený otisk pozná stejný předmět v jiných políčkách', () => {
    for (const [row, col] of [[2, 1], [2, 2]]) {
      const m = matchFp(cell(row, col).fp, 'epic', learned);
      expect(m).toMatchObject({ status: 'known', itemKey: 'Magnetic Accelerator', kind: 'material', source: 'learned' });
    }
  });
  it('podobný, ale jiný předmět je neznámý', () => {
    expect(matchFp(cell(2, 0).fp, 'epic', learned).status).toBe('unknown');
    expect(matchFp(cell(2, 0).fp, 'epic', learned).itemKey).toBeNull();
  });
  it('stejná ikona s jinou vzácností je jiný předmět', () => {
    expect(matchFp(cell(2, 2).fp, 'rare', learned).status).toBe('unknown');
  });
  it('bez naučených otisků je vše neznámé', () => {
    expect(matchFp(cell(2, 2).fp, 'epic', []).status).toBe('unknown');
  });
  it('naučený otisk má přednost před katalogem', () => {
    const m = matchFp(cell(2, 2).fp, 'epic', learned, [{ key: 'Jiný', kind: 'item', fp: cell(2, 2).fp, rarity: 'epic' }]);
    expect(m.source).toBe('learned');
    expect(matchFp(cell(2, 2).fp, 'epic', [], [{ key: 'Jiný', kind: 'item', fp: cell(2, 2).fp }]).source).toBe('catalog');
  });
});
