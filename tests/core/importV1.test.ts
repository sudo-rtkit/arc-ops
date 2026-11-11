import { describe, expect, it } from 'vitest';
import { importV1, isDiaryV1 } from '../../src/core/importV1';
import { normalize } from '../../src/core/state';
import { SAMPLE_V1 } from './sample';

describe('import zálohy ze starého deníku', () => {
  it('rozpozná zálohu v1', () => {
    expect(isDiaryV1(SAMPLE_V1)).toBe(true);
    expect(isDiaryV1({ schema: 2 })).toBe(false);
    expect(isDiaryV1('x')).toBe(false);
  });

  it('přenese profil, strom, stanice, zásobu, kroky, raidy, Trials, checklist a Amplified', () => {
    const { state, report } = importV1(SAMPLE_V1, 1762700000000);
    expect(state.profile).toMatchObject({ level: 23, coins: 184500, rounds: 31, expBonus: 2, rewardPass: 17, amplified: 0 });
    expect(state.skills.current).toEqual(SAMPLE_V1.skills.cur);
    expect(state.skills.showPlan).toBe(false);
    expect(state.skills.activePlan).toBe('runner');
    expect(state.skills.builds).toHaveLength(1);
    expect(state.stations).toEqual(SAMPLE_V1.stations);
    expect(state.inventory).toEqual(SAMPLE_V1.inv);
    expect(state.steps.filter(s => s.done).map(s => s.id)).toEqual(['n0', 'n2', 'n5']);
    expect(state.raids).toHaveLength(3);
    expect(state.raids.every(r => r.type === 'money')).toBe(true);
    expect(state.raids[1]).toMatchObject({ id: 'r2', ok: false, coins: 0, min: 9.5, map: 'dam', route: 'oldbattle' });
    expect(state.trials).toMatchObject({ week: '2026-W45', stars: [3, 2, 1, 0, 3] });
    expect(state.trials.names[0]).toBe('Damage ARC');
    expect(state.checklists.checked).toEqual({ r0: true, r3: true });
    expect(state.meta.importedFrom?.source).toBe('denik-v1');
    expect(report.ok).toBe(true);
    for (const row of report.rows.slice(0, 15)) expect(row.source, row.label).toBe(row.value);
  });

  it('záloha bez pole plan dostane Solo Looter', () => {
    const raw = { ...SAMPLE_V1, skills: { cur: { c_used: 1 }, showPlan: true } };
    const { state, report } = importV1(raw);
    expect(state.skills.activePlan).toBe('looter');
    expect(report.notes.join(' ')).toMatch(/Solo Looter/);
  });

  it('poškozený vstup dá výchozí hodnoty a report se stále shoduje', () => {
    const { state, report } = importV1({ v: 1, profile: { level: 999, coins: -5 }, inv: { A: 'x', B: 5 }, runs: 'nic' });
    expect(state.profile.level).toBe(75);
    expect(state.profile.coins).toBe(0);
    expect(state.inventory).toEqual({ B: 5 });
    expect(report.ok).toBe(true);
  });

  it('výsledek importu je už normalizovaný', () => {
    const { state } = importV1(SAMPLE_V1, 5);
    expect(normalize(state, 5)).toEqual(state);
  });
});
