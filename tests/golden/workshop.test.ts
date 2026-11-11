import { describe, expect, it } from 'vitest';
import { O, plain } from './original';
import { rng } from './rng';
import { STATIONS, SOURCES } from '../../src/core/data/stations';
import { SKILLS } from '../../src/core/data/skills';
import { MAPS } from '../../src/core/data/maps';
import { nextNeeds, readiness, reqBlock, shopping, workshopProgress } from '../../src/core/workshop';
import { phases } from '../../src/core/phases';
import { mapStatus } from '../../src/core/maps';
import { runStats } from '../../src/core/runs';
import { isoWeek } from '../../src/core/util';
import { ROUTES } from '../../src/core/data/routes';

const r = rng(46);
const MATS = [...new Set([...STATIONS.flatMap(s => Object.values(s.levels).flat().map(([m]) => m)), ...Object.keys(SOURCES)])];

function randomState() {
  const stations: Record<string, number> = {};
  for (const st of STATIONS) stations[st.id] = r.chance(0.15) ? st.max : r.int(st.min, st.max);
  const inv: Record<string, number> = {};
  for (const m of MATS) if (r.chance(0.5)) inv[m] = r.chance(0.3) ? r.int(50, 200) : r.int(1, 12);
  const cur: Record<string, number> = {};
  for (const s of SKILLS) if (r.chance(0.3)) cur[s.id] = r.int(1, s.max);
  const runs = Array.from({ length: r.int(0, 40) }, () => ({
    id: 'x', ts: 0, map: r.pick(MAPS).id, route: r.chance(0.1) ? '' : r.pick(ROUTES).id,
    ok: r.chance(0.7), coins: r.int(0, 90000), min: r.chance(0.1) ? 0 : r.int(1, 120) / (r.chance(0.3) ? 2 : 1),
  }));
  const profile = { level: r.int(0, 75), coins: 0, rounds: r.int(0, 40), expBonus: 0, rewardPass: 0 };
  const amplified = r.chance(0.5) ? 0 : r.int(0, 5);
  return { stations, inv, cur, runs, profile, amplified };
}

describe('workshop, fáze, mapy a runy se shodují s originálem', () => {
  it('na 300 náhodných stavech', () => {
    for (let i = 0; i < 300; i++) {
      const s = randomState();
      const orig = { stations: s.stations, inv: s.inv, profile: s.profile, amplified: s.amplified, skills: { cur: s.cur } };
      const view = { stations: s.stations, inventory: s.inv, profile: s.profile };
      expect(plain(nextNeeds(view))).toEqual(plain(O.nextNeeds(orig)));
      for (const st of STATIONS) for (let l = st.min; l <= st.max + 1; l++) expect(reqBlock(view, st, l)).toBe(O.reqBlock(orig, st, l));
      for (const nn of nextNeeds(view)) expect(readiness(s.inv, nn.mats)).toBe(O.readiness(orig, nn.mats));
      expect(plain(shopping(view))).toEqual(plain(O.shopping(orig)));
      expect(workshopProgress(s.stations)).toEqual(plain(O.workshopProgress(orig)));
      const ours = phases({ profile: { ...s.profile, amplified: s.amplified }, stations: s.stations, skills: { current: s.cur } });
      expect(plain(ours)).toEqual(plain(O.phases(orig)));
      expect(plain(mapStatus(s.profile.rounds))).toEqual(plain(O.mapStatus(s.profile.rounds)));
      expect(plain(runStats(s.runs))).toEqual(plain(O.runStats(s.runs)));
    }
  });

  it('isoWeek pro všechny dny let 2024–2028', () => {
    for (let d = new Date(2024, 0, 1); d.getFullYear() < 2029; d.setDate(d.getDate() + 1)) {
      expect(isoWeek(d)).toBe(O.isoWeek(d));
    }
  });
});
