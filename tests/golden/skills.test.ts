import { describe, expect, it } from 'vitest';
import { O, plain } from './original';
import { rng } from './rng';
import { SKILLS, PLANS } from '../../src/core/data/skills';
import * as K from '../../src/core/skills';
import type { BranchId, Points } from '../../src/core/types';

const r = rng(20261110);
type Case = { cur: Points; profile: { level: number; expBonus: number } };

function randomTree(): Points {
  const cur: Points = {};
  const density = r.next();
  for (const s of SKILLS) if (r.chance(density)) { const n = r.int(0, s.max); if (n) cur[s.id] = n; }
  return cur;
}

/* Stromy vzniklé postupným rozdáváním podle plánu (všechny mezistavy). */
function planTrees(key: string): Points[] {
  const out: Points[] = [{}];
  const cur: Points = {};
  const prof = { level: 75, expBonus: 15 };
  for (let g = 0; g < 120; g++) {
    const nx = O.nextPlanPoint(cur, key);
    if (!nx || O.addBlock(cur, nx.id, prof)) break;
    cur[nx.id] = (cur[nx.id] || 0) + 1;
    out.push({ ...cur });
  }
  return out;
}

const cases: Case[] = [];
for (let i = 0; i < 300; i++) cases.push({ cur: randomTree(), profile: { level: r.int(0, 75), expBonus: r.int(0, 15) } });
for (const key of Object.keys(PLANS)) for (const cur of planTrees(key)) cases.push({ cur, profile: { level: r.int(0, 75), expBonus: r.int(0, 15) } });

describe('skill tree se shoduje s originálem', () => {
  it(`na ${cases.length} stromech`, () => {
    for (const { cur, profile } of cases) {
      expect(K.totalPoints(cur)).toBe(O.totalPoints(cur));
      for (const b of ['c', 'm', 's'] as BranchId[]) {
        expect(K.pointsIn(cur, b)).toBe(O.pointsIn(cur, b));
        expect(K.pointsIn(cur, b, { excludeEnd: true })).toBe(O.pointsIn(cur, b, { excludeEnd: true }));
        expect(K.choiceTaken(cur, b)).toBe(O.choiceTaken(cur, b));
        expect(K.endTaken(cur, b)).toBe(O.endTaken(cur, b));
      }
      expect(K.budget(profile)).toBe(O.budget(profile));
      for (const s of SKILLS) expect(K.addBlock(cur, s.id, profile), s.id).toBe(O.addBlock(cur, s.id, profile));
      expect(plain(K.invalidNodes(cur))).toEqual(plain(O.invalidNodes(cur)));
      expect(K.resetCost(cur)).toBe(O.resetCost(cur));
      for (const key of Object.keys(PLANS)) {
        const steps = K.planSteps(key);
        expect(plain(K.planTarget(cur, steps))).toEqual(plain(O.planTarget(cur, key)));
        expect(plain(K.nextPlanPoint(cur, steps))).toEqual(plain(O.nextPlanPoint(cur, key)));
        expect(plain(K.planProgress(cur, steps))).toEqual(plain(O.planProgress(cur, key)));
      }
    }
  });

  it('neznámý plán padá na Stamina Runner jako v originálu', () => {
    expect(plain(K.planSteps('nic'))).toEqual(plain(O.planSteps('nic')));
  });
});
