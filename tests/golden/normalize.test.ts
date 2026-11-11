import { describe, expect, it } from 'vitest';
import { O, plain } from './original';
import { rng } from './rng';
import { normalizeV1 } from '../../src/core/importV1';
import { SKILLS } from '../../src/core/data/skills';
import { STATIONS } from '../../src/core/data/stations';

const r = rng(7);
const junk = () => r.pick<unknown>([null, undefined, 'x', -5, 1e20, NaN, '12', 3.6, true, {}, [], '  7 ', Infinity]);
const val = (lo: number, hi: number) => (r.chance(0.3) ? junk() : r.int(lo - 5, hi + 5) + (r.chance(0.2) ? 0.5 : 0));
const maybe = <T,>(f: () => T): T | undefined => (r.chance(0.2) ? undefined : f());

function randomRaw(): unknown {
  if (r.chance(0.05)) return junk();
  return {
    v: 1,
    profile: maybe(() => (r.chance(0.1) ? junk() : { level: val(0, 75), coins: val(0, 1e6), rounds: val(0, 100), expBonus: val(0, 15), rewardPass: val(0, 60) })),
    skills: maybe(() => ({
      cur: Object.fromEntries(SKILLS.filter(() => r.chance(0.4)).map(s => [s.id, val(0, s.max)] as [string, unknown]).concat(r.chance(0.2) ? [['bogus', 3]] : [])),
      showPlan: r.pick([true, false, undefined, 0]), plan: r.pick(['runner', 'looter', 'nic', undefined]),
    })),
    stations: maybe(() => Object.fromEntries(STATIONS.filter(() => r.chance(0.7)).map(s => [s.id, val(s.min, s.max)]))),
    inv: maybe(() => Object.fromEntries(Array.from({ length: r.int(0, 10) }, (_, i) => ['Mat ' + i + 'x'.repeat(r.int(0, 100)), val(0, 99999)]))),
    steps: maybe(() => Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i - 2), r.pick([true, false, 1])]))),
    runs: maybe(() => (r.chance(0.1) ? junk() : Array.from({ length: r.int(0, 30) }, (_, i) => (r.chance(0.1) ? junk() : {
      id: r.pick(['abc', 'x'.repeat(40), 5, 'id' + i]), ts: val(0, 2e12), map: r.pick(['dam', 'buried', 'nic', undefined]),
      route: r.pick(['galleria', '', undefined, 'y'.repeat(30)]), ok: r.pick([true, false, undefined, 0]), coins: val(0, 1e5), min: val(0, 120),
    })))),
    trials: maybe(() => ({ week: r.pick(['2026-W46', '', 'xxxxxxxxxxxxxxxx', undefined]), stars: [val(0, 3), val(0, 3), val(0, 3)], names: ['a', 'b'.repeat(100), 5] })),
    raid: maybe(() => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i - 1), r.pick([true, false])]))),
    amplified: val(0, 99), updated: val(0, 2e12),
  };
}

describe('normalizeV1 je věrný převod normalize z deníku', () => {
  it('na 400 náhodných, neúplných a poškozených vstupech', () => {
    for (let i = 0; i < 400; i++) {
      const raw = randomRaw();
      /* Run bez id dostane v obou případech náhodné id; to jediné nejde porovnat. */
      const given = new Set(((raw as { runs?: unknown })?.runs instanceof Array ? (raw as { runs: { id?: unknown }[] }).runs : [])
        .map(x => (x && typeof x === 'object' && x.id ? String(x.id).slice(0, 24) : null)));
      const mask = (s: { runs: { id: string }[] }) => ({ ...s, runs: s.runs.map(x => ({ ...x, id: given.has(x.id) ? x.id : '?' })) });
      expect(mask(plain(normalizeV1(raw)))).toEqual(mask(plain(O.normalize(raw))));
    }
  });
  it('výchozí stav je shodný', () => {
    expect(plain(normalizeV1({}))).toEqual(plain(O.DEFAULT_STATE()));
  });
});
