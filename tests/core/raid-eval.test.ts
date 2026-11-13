/* 0.15.0 (schéma 14): vyhodnocení po raidu a historie plánů. Snímek zásoby při spuštění, nalezené z plánu
   (přírůstek zásoby i loot záznamu, nikdy dvakrát), nově hotové požadavky, druh shrnutí pro Opse, další raid,
   záznam plánu v deníku, statistika map s malým vzorkem, důvod v bodování map, migrace a akce store. */
import { describe, expect, it } from 'vitest';
import { defaultState, normalize, normalizeRaid, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { setQuestDone } from '../../src/core/quests';
import { emptyGoals, normalizePlanRecord, normalizeRaidPlan, raidList, scoreMaps } from '../../src/core/raidPrep';
import { evalLine, evaluateRaid, nextRaid, planRaid, planRecord, planSnapshot, savedRaid } from '../../src/core/raidEval';
import { PLAN_MIN_SAMPLE, planMapStats } from '../../src/core/runs';
import { sayLine } from '../../src/core/opsVoice';
import { OPS_LINES } from '../../src/i18n/opsLines';
import { migrateMaterialNames } from '../../src/core/materialRename';
import type { AppState, Raid, RaidGoals, RaidPlan, RaidPlanRecord } from '../../src/core/types';

const NOW = new Date(2026, 10, 12, 18, 0).getTime();
const TODAY = '2026-11-12';
const goals = (g: Partial<RaidGoals>): RaidGoals => ({ ...emptyGoals(), ...g });
function base(over: Partial<AppState> = {}): AppState {
  const s = defaultState(NOW);
  s.quests.done = setQuestDone(setQuestDone({}, 'ss10s', true, NOW), 'ss10e', true, NOW);
  s.stations.gear = 1;
  return Object.assign(s, over);
}
/* Gear Bench 2: Power Cable 3, Electrical Components 5, Hornet Driver 5 */
function planned(s: AppState, g: RaidGoals): RaidPlan {
  return { goals: g, map: 'dam', loadout: '', route: '', startedAt: NOW, sig: '', found: [], ...planSnapshot(s, g, 'cs', TODAY) };
}
const raid = (over: Partial<Raid>): Raid => normalizeRaid({ id: 'r1', ts: NOW + 60_000, map: 'dam', ...over });
const rec = (items: [string, number, number][], over: Partial<RaidPlanRecord> = {}): RaidPlanRecord =>
  ({ at: NOW, goals: ['Gear Bench 2'], money: false, map: 'dam', loadout: '', items: items.map(([mat, need, found]) => ({ mat, need, found })), done: [], value: null, ...over });

describe('snímek zásoby při spuštění plánu', () => {
  it('uloží zásobu a chybějící počet každého předmětu ze seznamu a cíle, kterým něco chybí', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const p = planSnapshot(s, goals({ stations: ['gear'], quests: ['ss10y'] }), 'cs', TODAY);
    expect(p.snap).toContainEqual({ mat: 'Power Cable', have: 1, missing: 2 });
    expect(p.snap).toContainEqual({ mat: 'Hornet Driver', have: 0, missing: 5 });
    expect(p.snap!.some(x => x.mat === 'Electrical Components')).toBe(false);
    expect(p.open).toEqual(['station:gear', 'quest:ss10y']);
  });
});

describe('vyhodnocení po raidu', () => {
  it('podle přírůstku zásoby: nalezeno proti potřebě, co chybí, částečný výsledek; nic se nezapisuje', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const plan = planned(s, goals({ stations: ['gear'] }));
    s.inventory['Power Cable'] = 3;
    s.inventory['Hornet Driver'] = 2;
    const before = structuredClone(s);
    const ev = evaluateRaid(s, plan, null, 'cs', TODAY);
    expect(ev.source).toBe('stock');
    expect(ev.rows.find(r => r.mat === 'Power Cable')).toMatchObject({ need: 2, found: 2, missing: 0 });
    expect(ev.rows.find(r => r.mat === 'Hornet Driver')).toMatchObject({ need: 5, found: 2, missing: 3 });
    expect([ev.need, ev.found, ev.missing, ev.kind]).toEqual([7, 4, 3, 'partial']);
    expect(ev.done).toEqual([]);
    expect(s).toEqual(before);
    expect(evalLine(ev)).toEqual({ line: 'raid.eval.partial', params: { count: 4, need: 7, missing: 3 } });
  });
  it('nově hotová stanice: „Gear Bench 2“ a shrnutí upgrade', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const plan = planned(s, goals({ stations: ['gear'] }));
    s.inventory['Power Cable'] = 3;
    s.inventory['Hornet Driver'] = 5;
    const ev = evaluateRaid(s, plan, null, 'cs', TODAY);
    expect(ev.done).toEqual([{ key: 'station:gear', kind: 'station', name: 'Gear Bench 2' }]);
    expect(ev.kind).toBe('upgrade');
    expect(evalLine(ev)).toEqual({ line: 'raid.eval.upgrade', params: { name: 'Gear Bench 2', count: 1 } });
  });
  it('loot záznamu se započítá, i když není v Inventory; převedený loot se nezapočítá dvakrát', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const plan = planned(s, goals({ stations: ['gear'] }));
    const r = raid({ loot: [{ name: 'Power Cable', qty: 2 }, { name: 'hornet driver', qty: 5 }] });
    s.raids.push(r);
    const ev = evaluateRaid(s, plan, r, 'cs', TODAY);
    expect(ev.source).toBe('raid');
    expect(ev.found).toBe(7);
    expect(ev.extra).toEqual({ 'Power Cable': 2, 'Hornet Driver': 5 });
    expect(ev.kind).toBe('upgrade');
    /* loot převedený do Inventory: přírůstek zásoby je týž loot, ne další nález */
    s.inventory['Power Cable'] = 3; s.inventory['Hornet Driver'] = 5;
    r.lootApplied = structuredClone(r.loot);
    const ev2 = evaluateRaid(s, plan, r, 'cs', TODAY);
    expect(ev2.found).toBe(7);
    expect(ev2.extra).toEqual({});
    expect(ev2.rows.find(x => x.mat === 'Power Cable')!.found).toBe(2);
  });
  it('úkol s kompletními předměty je „vše nalezeno“; prázdný nález je „nic“', () => {
    const s = base();
    const g = goals({ quests: ['ss10y'] });
    const plan = planned(s, g);
    expect(evaluateRaid(s, plan, null, 'cs', TODAY).kind).toBe('none');
    for (const r of raidList(s, g, 'cs', TODAY)) s.inventory[r.mat] = r.need;
    const ev = evaluateRaid(s, plan, null, 'cs', TODAY);
    expect(ev.kind).toBe('all');
    expect(ev.done).toEqual([{ key: 'quest:ss10y', kind: 'quest', name: 'After Rain Comes' }]);
    expect(evalLine(ev).line).toBe('raid.eval.all');
  });
  it('úkol, který hráč mezitím splnil, se za nově hotový požadavek nevydává', () => {
    const s = base();
    const plan = planned(s, goals({ quests: ['ss10y'] }));
    s.quests.done = setQuestDone(s.quests.done, 'ss10y', true, NOW);
    expect(evaluateRaid(s, plan, null, 'cs', TODAY).done).toEqual([]);
  });
  it('plán ze starší verze (bez snímku): potřeba z aktuálního seznamu a nálezu v Inventory', () => {
    const s = base({ inventory: { 'Power Cable': 3, 'Electrical Components': 5 } });
    const plan: RaidPlan = { ...planned(s, goals({ stations: ['gear'] })), snap: null, open: [] };
    const r = raid({ loot: [{ name: 'Power Cable', qty: 2 }], lootApplied: [{ name: 'Power Cable', qty: 2 }] });
    const ev = evaluateRaid(s, plan, r, 'cs', TODAY);
    expect(ev.legacy).toBe(true);
    expect(ev.rows.find(x => x.mat === 'Power Cable')).toMatchObject({ need: 2, found: 2, missing: 0 });
    expect(ev.rows.find(x => x.mat === 'Hornet Driver')).toMatchObject({ need: 5, found: 0 });
  });
  it('další raid: stejné cíle nad zásobou po raidu, doporučená mapa a seznam', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const g = goals({ stations: ['gear'], quests: ['ss10y'] });
    const plan = planned(s, g);
    const r = raid({ loot: [{ name: 'Power Cable', qty: 2 }] });
    const ev = evaluateRaid(s, plan, r, 'cs', TODAY);
    const n = nextRaid(s, plan, ev, 'cs', TODAY);
    expect(n.rows.some(x => x.mat === 'Power Cable')).toBe(false);
    expect(n.rows.find(x => x.mat === 'Hornet Driver')!.missing).toBe(5);
    expect(n.best?.id).toBe('buried');
    expect(n.best?.reasons.map(x => x.key)).toContain('raid.reason.quests');
  });
  it('raid plánu: nejnovější záznam od spuštění; uložený plán se pozná podle času spuštění', () => {
    const s = base();
    const plan = planned(s, goals({ stations: ['gear'] }));
    s.raids.push(raid({ id: 'old', ts: NOW - 1000 }), raid({ id: 'a', ts: NOW + 10 }), raid({ id: 'b', ts: NOW + 20 }));
    expect(planRaid(s, plan)?.id).toBe('b');
    expect(savedRaid(s, plan)).toBeNull();
    s.raids[1].plan = rec([]);
    expect(savedRaid(s, plan)?.id).toBe('a');
  });
});

describe('shrnutí od Opse', () => {
  it('každý druh má v obou jazycích a všech povahách aspoň 2 varianty a dosadí čísla', () => {
    for (const k of ['raid.eval.all', 'raid.eval.partial', 'raid.eval.none', 'raid.eval.upgrade'] as const) {
      for (const lang of ['cs', 'en'] as const) for (const m of ['plain', 'friendly', 'cheeky'] as const) expect(OPS_LINES[lang][k][m].length).toBeGreaterThanOrEqual(2);
    }
    expect(sayLine({ line: 'raid.eval.partial', params: { count: 4, need: 7, missing: 3 } }, 'plain', 'cs')).toBe('Z plánu nalezeno 4 z 7 ks, chybí 3.');
    expect(sayLine({ line: 'raid.eval.upgrade', params: { name: 'Gear Bench 2', count: 1 } }, 'friendly', 'en')).toContain('Gear Bench 2');
  });
});

describe('historie plánů: statistika map', () => {
  it('jen mapy s daty, průměr nalezených kusů, úspěšnost a označení malého vzorku', () => {
    const raids = [
      { map: 'dam', plan: rec([['Wires', 3, 3]]) }, { map: 'dam', plan: rec([['Wires', 3, 1]]) }, { map: 'dam', plan: rec([['Wires', 2, 2]], { done: ['Gear Bench 2'] }) },
      { map: 'buried', plan: rec([['Wires', 4, 0]]) }, { map: 'stella' },
    ] as Pick<Raid, 'map' | 'plan'>[];
    const st = planMapStats(raids);
    expect(st.map(x => x.map)).toEqual(['dam', 'buried']);
    expect(st[0]).toMatchObject({ n: 3, found: 6, avg: 2, ok: 2, little: false });
    expect(st[0].rate).toBeCloseTo(2 / 3);
    expect(st[1]).toMatchObject({ n: 1, avg: 0, ok: 0, little: true });
  });
  it('do bodování map jde historie jen od minimálního vzorku, s čitelným důvodem', () => {
    const s = base();
    const add = (n: number, map: string) => { for (let i = 0; i < n; i++) s.raids.push(raid({ id: map + i, map, plan: rec([['Wires', 3, 3]]) })); };
    add(PLAN_MIN_SAMPLE - 1, 'dam');
    const g = goals({ stations: ['gear'] });
    const before = scoreMaps(s, g, 'cs').find(m => m.id === 'dam')!;
    expect(before.reasons.some(r => r.key === 'raid.reason.history')).toBe(false);
    add(1, 'dam');
    s.raids.forEach((r, i) => { r.id = 'x' + i; });
    const after = scoreMaps(s, g, 'cs').find(m => m.id === 'dam')!;
    expect(after.reasons).toContainEqual({ key: 'raid.reason.history', params: { avg: 3, count: PLAN_MIN_SAMPLE } });
    expect(after.score).toBe(before.score + 1);
  });
});

describe('schéma 14: migrace, záloha a normalizace', () => {
  it('stav schématu 13 se načte beze ztrát: plán bez snímku zásoby, raidy bez plánu', () => {
    const old = {
      schema: 13, inventory: { Wires: 4 },
      raids: [{ id: 'r1', ts: 5, map: 'dam', type: 'quest', ok: true, coins: 100, loot: [{ name: 'Wires', qty: 2 }] }],
      raidPlan: { goals: { quests: ['ss10y'] }, map: 'buried', loadout: '', route: '', startedAt: 7, sig: '', found: ['Wires'] },
    };
    const s = normalize(old, NOW);
    expect(SCHEMA).toBe(17);
    expect(s.schema).toBe(17);
    expect(s.raids[0]).toMatchObject({ id: 'r1', coins: 100, loot: [{ name: 'Wires', qty: 2 }] });
    expect(s.raids[0].plan).toBeUndefined();
    expect(s.raidPlan).toMatchObject({ map: 'buried', startedAt: 7, found: ['Wires'], snap: null, open: [] });
  });
  it('vadný plán v záznamu se zahodí, platný se ořeže; záloha plán i snímek nese', () => {
    expect(normalizePlanRecord('x')).toEqual({});
    expect(normalizePlanRecord({ at: 3, goals: ['A', 5, ''], map: 'mars', items: [{ mat: 'Wires', need: 2, found: 9 }, { mat: 'wires', need: 1 }, { mat: '' }], value: 'x' }))
      .toEqual({ plan: { at: 3, goals: ['A'], money: false, map: '', loadout: '', items: [{ mat: 'Wires', need: 2, found: 2 }], done: [], value: null } });
    expect(normalizeRaidPlan({ map: 'dam', snap: [{ mat: 'Wires', have: -3, missing: 2 }, { mat: 'wires' }], open: ['station:gear', 'bad', 7] }))
      .toMatchObject({ snap: [{ mat: 'Wires', have: 0, missing: 2 }], open: ['station:gear'] });
    const s = base();
    s.raidPlan = planned(s, goals({ stations: ['gear'] }));
    s.raids.push(raid({ plan: rec([['Wires', 3, 1]], { value: 120, done: ['Gear Bench 2'] }) }));
    const p = parseBackup(makeBackup(s), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(p.state.raidPlan).toEqual(s.raidPlan);
    expect(p.state.raids[0].plan).toEqual(s.raids[0].plan);
  });
  it('přejmenování materiálu projde i plánem v záznamu a snímkem zásoby', () => {
    const s = base();
    s.raidPlan = { ...planned(s, goals({})), snap: [{ mat: 'Cable Strippers', have: 1, missing: 2 }] };
    s.raids.push(raid({ plan: rec([['Cable Strippers', 2, 1]]) }));
    migrateMaterialNames(s, { 'Cable Strippers': 'Cable Stripper' });
    expect(s.raidPlan.snap).toEqual([{ mat: 'Cable Stripper', have: 1, missing: 2 }]);
    expect(s.raids[0].plan!.items).toEqual([{ mat: 'Cable Stripper', need: 2, found: 1 }]);
  });
});

describe('store: vyhodnocení a deník', () => {
  async function makeApp() {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } })));
    let t = NOW;
    const app = createApp(createBrowserStorage(kv, () => t), { now: () => t, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    return { app, state: () => app.store.getState().state, tick: (ms: number) => { t += ms; } };
  }
  it('spuštění uloží snímek zásoby; zápis raidu s plánem uloží plán a nalezené, inventář jen podle zápisu', async () => {
    const { app, state, tick } = await makeApp();
    app.actions.startRaidPlan({ goals: goals({ stations: ['gear'] }), map: 'dam', loadout: '', route: '', sig: '' });
    expect(state().raidPlan!.snap).toContainEqual({ mat: 'Power Cable', have: 1, missing: 2 });
    expect(state().raidPlan!.open).toEqual(['station:gear']);
    tick(60_000);
    app.actions.invSet('Power Cable', 2);
    const inv = structuredClone(state().inventory);
    const id = app.actions.addRaid({ map: 'dam', type: 'quest', ok: true, coins: 500, loot: [{ name: 'Hornet Driver', qty: 1 }] }, { withPlan: true });
    expect(state().inventory).toEqual(inv);
    const r = state().raids.find(x => x.id === id)!;
    expect(r.plan).toMatchObject({ at: NOW, goals: ['Gear Bench 2'], map: 'dam' });
    expect(r.plan!.items).toEqual(expect.arrayContaining([{ mat: 'Power Cable', need: 2, found: 1 }, { mat: 'Hornet Driver', need: 5, found: 1 }]));
    expect(state().raidPlan).not.toBeNull();
    /* bez withPlan a bez aktivního plánu se nic nepřipojí; vstup plán zvenku nepodstrčí */
    const id2 = app.actions.addRaid({ map: 'dam', plan: rec([]) });
    expect(state().raids.find(x => x.id === id2)!.plan).toBeUndefined();
  });
  it('„Uložit do deníku“ k existujícímu záznamu; plán je v deníku jen jednou; zrušení plánu u záznamu', async () => {
    const { app, state, tick } = await makeApp();
    app.actions.startRaidPlan({ goals: goals({ stations: ['gear'] }), map: 'dam', loadout: '', route: '', sig: '' });
    tick(1000);
    const a = app.actions.addRaid({ map: 'dam', loot: [{ name: 'Power Cable', qty: 2 }] });
    const b = app.actions.addRaid({ map: 'dam' });
    const inv = structuredClone(state().inventory);
    expect(app.actions.attachRaidPlan(a)).toBe(true);
    expect(state().raids.find(x => x.id === a)!.plan!.items).toContainEqual({ mat: 'Power Cable', need: 2, found: 2 });
    expect(app.actions.attachRaidPlan(b)).toBe(true);
    expect(state().raids.find(x => x.id === a)!.plan).toBeUndefined();
    expect(state().raids.find(x => x.id === b)!.plan).toBeDefined();
    expect(state().inventory).toEqual(inv);
    expect(app.actions.attachRaidPlan('nope')).toBe(false);
    app.actions.detachRaidPlan(b);
    expect(state().raids.find(x => x.id === b)!.plan).toBeUndefined();
    app.actions.endRaidPlan();
    expect(app.actions.attachRaidPlan(a)).toBe(false);
  });
  it('úprava záznamu plán zachová', async () => {
    const { app, state } = await makeApp();
    app.actions.startRaidPlan({ goals: goals({ stations: ['gear'] }), map: 'dam', loadout: '', route: '', sig: '' });
    const id = app.actions.addRaid({ map: 'dam' }, { withPlan: true });
    const p = structuredClone(state().raids.find(x => x.id === id)!.plan);
    app.actions.updateRaid(id, { coins: 900, notes: 'x' });
    expect(state().raids.find(x => x.id === id)!.plan).toEqual(p);
    expect(planRecord(state(), state().raidPlan!, evaluateRaid(state(), state().raidPlan!, null, 'cs', TODAY), 'cs', TODAY).at).toBe(NOW);
  });
});
