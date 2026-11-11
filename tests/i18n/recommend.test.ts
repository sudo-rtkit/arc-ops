/* Texty doporučení v obou jazycích: stejná doporučení (logika se nemění), texty z klíčů slovníku. */
import { afterEach, describe, expect, it } from 'vitest';
import { recommend } from '../../src/core/recommend';
import { defaultState, normalize } from '../../src/core/state';
import { normalizeGoal } from '../../src/core/goals';
import { STATIONS } from '../../src/core/data/stations';
import { setLang, tl } from '../../src/i18n';

const NOW = new Date(2026, 10, 13, 12, 0).getTime(); // pátek
afterEach(() => setLang('cs'));

function sample() {
  const s = defaultState(NOW);
  s.inventory = Object.fromEntries(STATIONS.find(x => x.id === 'gunsmith')!.levels[1].map(([m, n]) => [m, n]));
  s.raids = normalize({ raids: [
    ...[1, 2, 3].map(i => ({ id: 'g' + i, type: 'money', route: 'galleria', map: 'buried', ok: true, coins: 30000, min: 10 })),
    ...[1, 2, 3].map(i => ({ id: 'o' + i, type: 'money', route: 'oldbattle', map: 'dam', ok: i === 1, coins: 40000, min: 10, lost: [{ name: 'Ferro', qty: 1 }] })),
    { id: 'l', type: 'money', ok: true, loot: [{ name: 'Wires', qty: 1 }] },
    { id: 'l2', type: 'money', ok: true, loot: [{ name: 'Wires', qty: 1 }] },
  ] }, 1).raids;
  s.profile.level = 5;
  s.profile.rounds = 10;
  s.goals = [normalizeGoal({ id: 'late', title: 'Quest A', priority: 1, due: '2026-11-10', createdAt: 1 }), normalizeGoal({ id: 'soon', title: 'Quest B', priority: 2, due: '2026-11-14', createdAt: 1 })];
  return s;
}

describe('doporučení v obou jazycích', () => {
  it('stejná doporučení a stejné pořadí v cs i en', () => {
    const cs = recommend(sample(), NOW);
    setLang('en');
    const en = recommend(sample(), NOW);
    expect(en.map(r => [r.id, r.score, r.tone, r.href])).toEqual(cs.map(r => [r.id, r.score, r.tone, r.href]));
    expect(en.map(r => r.why.length)).toEqual(cs.map(r => r.why.length));
    expect(cs.length).toBeGreaterThan(6);
  });

  it('české texty (znění jako dřív)', () => {
    const r = Object.fromEntries(recommend(sample(), NOW).map(x => [x.id, x]));
    expect(r['upgrade:gunsmith'].title).toBe('Upgraduj Gunsmith na 1');
    expect(r['upgrade:gunsmith'].why[0]).toBe('Recept: 20× Metal Parts (máš 20), 30× Rubber Parts (máš 30)');
    expect(r['route:best'].title).toBe('Nejvýnosnější trasa: Galleria + JKV');
    expect(r['route:best'].detail).toBe('180 000 mincí za hodinu z tvých runů.');
    expect(r['route:risky:oldbattle'].why[0]).toBe('Extrakce 33 % z 3 runů');
    expect(r['goal:late'].title).toBe('Cíl po termínu: Quest A');
    expect(r['goal:late'].detail).toBe('Termín uplynul před 3 dny.');
    expect(r['goal:soon'].detail).toBe('Zbývá 1 den.');
    expect(r.skill.title).toBe('Rozdej 6 volných skill bodů');
    expect(r.loot.title).toBe('Převeď loot z 2 raidů do Inventory');
    expect(r['map:unlock'].title).toBe('Spaceport se odemkne za 2 kola');
    expect(r.trials).toBeUndefined();
  });

  it('anglické texty', () => {
    setLang('en');
    const r = Object.fromEntries(recommend(sample(), NOW).map(x => [x.id, x]));
    expect(r['upgrade:gunsmith'].title).toBe('Upgrade Gunsmith to 1');
    expect(r['upgrade:gunsmith'].why[0]).toBe('Recipe: 20× Metal Parts (you have 20), 30× Rubber Parts (you have 30)');
    expect(r['route:best'].detail).toBe('180,000 coins per hour from your runs.');
    expect(r['route:risky:oldbattle'].title).toBe('You often die on the Old Battleground route');
    expect(r['route:risky:oldbattle'].why[0]).toBe('Extraction 33% in 3 runs');
    expect(r['goal:late'].detail).toBe('The deadline passed 3 days ago.');
    expect(r['goal:soon'].detail).toBe('1 day left.');
    expect(r['goal:soon'].why[0]).toBe('Priority medium');
    expect(r.skill.title).toBe('Spend 6 free skill points');
    expect(r.loot.title).toBe('Move loot from 2 raids to Inventory');
    expect(r['map:unlock'].title).toBe('Spaceport unlocks in 2 rounds');
    for (const x of Object.values(r)) for (const t of [x.title, x.detail, ...x.why]) expect(/[áčďéěíňóřšťúůýž]/i.test(t), t).toBe(false);
  });

  it('msg nese klíče a parametry, takže jde přeložit i bez nového výpočtu', () => {
    const r = recommend(sample(), NOW).find(x => x.id === 'route:best')!;
    expect(r.msg.title.key).toBe('rec.route.best');
    expect(tl('en', r.msg.title.key, r.msg.title.params)).toBe('Most profitable route: Galleria + JKV');
    expect(tl('cs', r.msg.title.key, r.msg.title.params)).toBe(r.title);
  });
});
