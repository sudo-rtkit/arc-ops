import { describe, expect, it } from 'vitest';
import { rollWeek } from '../../src/core/week';

const base = { week: '2026-W45', stars: [3, 1, 0, 0, 0], names: ['A', '', '', '', ''], notes: ['', '', '', '', ''], history: [] };

describe('týdenní reset Trials', () => {
  it('nový týden vynuluje hvězdy, nechá názvy a uloží týden do historie', () => {
    const t = rollWeek(base, new Date(2026, 10, 10));
    expect(t.week).toBe('2026-W46');
    expect(t.stars).toEqual([0, 0, 0, 0, 0]);
    expect(t.names[0]).toBe('A');
    expect(t.history).toEqual([{ week: '2026-W45', stars: [3, 1, 0, 0, 0], names: base.names, notes: base.notes }]);
  });
  it('stejný týden nic nemění', () => {
    const t = { ...base, week: '2026-W46' };
    expect(rollWeek(t, new Date(2026, 10, 10))).toBe(t);
  });
  it('prázdný týden se do historie neukládá, týden jen s názvem ano', () => {
    expect(rollWeek({ ...base, stars: [0, 0, 0, 0, 0], names: ['', '', '', '', ''] }, new Date(2026, 10, 10)).history).toEqual([]);
    expect(rollWeek({ ...base, stars: [0, 0, 0, 0, 0] }, new Date(2026, 10, 10)).history).toHaveLength(1);
    expect(rollWeek({ ...base, week: '' }, new Date(2026, 10, 10)).history).toEqual([]);
  });
});
