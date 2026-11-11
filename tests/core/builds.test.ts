import { describe, expect, it } from 'vitest';
import { addBlock, branchTotals, fitsPoints, fitsTotals, invalidNodes, nextPlanPoint, planSteps, planTarget, stepsFromBuild, totalPoints } from '../../src/core/skills';
import { PLANS } from '../../src/core/data/skills';
import type { PlanStep, Points } from '../../src/core/types';

const full = { level: 75, expBonus: 15 };

function fillBy(steps: PlanStep[]): Points {
  const cur: Points = {};
  for (let g = 0; g < 200; g++) {
    const nx = nextPlanPoint(cur, steps);
    if (!nx || addBlock(cur, nx.id, full)) break;
    cur[nx.id] = (cur[nx.id] || 0) + 1;
  }
  return cur;
}

describe('uložené buildy', () => {
  for (const key of Object.keys(PLANS)) {
    it(`stepsFromBuild: cíl plánu ${key} jde rozdat bez porušení pravidel`, () => {
      const target = fillBy(planSteps(key));
      expect(Object.keys(invalidNodes(target))).toEqual([]);
      const steps = stepsFromBuild(target);
      expect(fillBy(steps)).toEqual(target);
      expect(planTarget({}, steps)).toEqual(target);
    });
  }
  it('fitsTotals odpovídá pravidlu ze starší verze deníku (body ve větvi ≤ cíl)', () => {
    const cur = { c_used: 1, c_breaths: 3 };
    expect(fitsTotals(cur, { c: 4, m: 0, s: 0 })).toBe(true);
    expect(fitsTotals(cur, { c: 3, m: 30, s: 30 })).toBe(false);
    expect(branchTotals(cur)).toEqual({ c: 4, m: 0, s: 0 });
  });
  it('fitsPoints hlídá jednotlivé skilly', () => {
    expect(fitsPoints({ c_used: 1 }, { c_used: 1, c_breaths: 2 })).toBe(true);
    expect(fitsPoints({ c_breaths: 3 }, { c_breaths: 2 })).toBe(false);
    expect(totalPoints({})).toBe(0);
  });
});
