import { describe, expect, it } from 'vitest';
import { defaultState, normalize } from '../../src/core/state';
import { rng } from '../golden/rng';

const r = rng(99);
const junk = () => r.pick<unknown>([null, 'x', -1, 1e30, NaN, {}, [], true, '5']);

describe('normalize (schéma 2)', () => {
  it('doplní výchozí hodnoty', () => {
    expect(normalize({}, 1)).toEqual(defaultState(1));
    expect(normalize(null, 1)).toEqual(defaultState(1));
  });
  it('ořízne meze', () => {
    const s = normalize({ profile: { level: 200, coins: -1, expBonus: 99, rewardPass: 61, amplified: 500, xp: 5.6 },
      raids: [{ coins: 5e9, min: 500, map: 'xxx', type: 'zzz' }], inventory: { A: 1e9, B: 0, C: -4 } }, 1);
    expect(s.profile).toMatchObject({ level: 75, coins: 0, expBonus: 15, rewardPass: 60, amplified: 99, xp: 6 });
    expect(s.raids[0]).toMatchObject({ coins: 1e8, min: 120, map: 'dam', type: 'money' });
    expect(s.inventory).toEqual({ A: 99999 });
  });
  it('je idempotentní i na náhodném vstupu', () => {
    for (let i = 0; i < 300; i++) {
      const raw = {
        profile: { level: r.chance(0.5) ? junk() : r.int(-10, 100), coins: junk() },
        skills: { current: { c_used: junk(), c_breaths: r.int(-2, 9) }, activePlan: r.pick(['looter', 'build:x', junk()]), builds: r.chance(0.5) ? [{ id: 'x', name: 'B', points: { c_used: 1 } }] : junk() },
        raids: r.chance(0.5) ? [{ id: 'a' }, { id: 'a' }, junk(), { ok: false, coins: 5 }] : junk(),
        steps: r.chance(0.5) ? [{ id: 'q', text: 'x', done: true }, { id: 'q' }] : junk(),
        trials: { week: '2026-W01', stars: [junk(), 2, 9], history: [{ week: 'x', stars: [1] }, junk()] },
        maps: { dam: { notes: 'n', visited: { a: true, b: 1 }, pois: [{ name: 'p' }], todo: [junk()] }, nic: {} },
        dashboard: { order: ['raids', 'raids', 'x'], hidden: { kpi: true, zz: true } },
        gameData: { arc: { tick: { tactic: 'x', difficulty: 9 } }, arcCustom: [{ name: 'Moje' }], recipes: { 'gunsmith:1': [['A', 3]], 'x:1': [] } },
        profileLog: [{ day: '2026-11-10', level: 3 }, { day: '2026-11-10', level: 4 }, { day: 'zz' }],
      };
      const once = normalize(raw, 7);
      expect(normalize(once, 7)).toEqual(once);
    }
  });
  it('id raidů jsou jedinečná', () => {
    const s = normalize({ raids: [{ id: 'a' }, { id: 'a' }] });
    expect(new Set(s.raids.map(x => x.id)).size).toBe(2);
  });
});
