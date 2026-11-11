/* Milník 2: Raid Journal (výbava, loot, ztráty, cíle), cíle, Material Planner, loadouty, doporučení, trasy, ceník, šablony. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { defaultState, normalize } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { importV1 } from '../../src/core/importV1';
import { applyDelta, lootDelta, lootState, normalizeItems } from '../../src/core/raidItems';
import { goalProgress, sortGoals, daysLeft, normalizeGoal } from '../../src/core/goals';
import { planNeeds, planSummary, stationTargets } from '../../src/core/planner';
import { shopping } from '../../src/core/workshop';
import { recommend } from '../../src/core/recommend';
import { getRoutes, getSell, routeLookup } from '../../src/core/gamedata';
import { loadoutGear, loadoutStats, tallyItems } from '../../src/core/loadouts';
import { ROUTES } from '../../src/core/data/routes';
import { STATIONS } from '../../src/core/data/stations';
import type { AppState } from '../../src/core/types';
import { SAMPLE_V1 } from './sample';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();

async function makeApp(content: string | null = null) {
  const kv = memoryKV();
  if (content !== null) kv.setItem('arcops:state', content);
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
  await app.init();
  return { app, kv, st: () => app.store.getState().state };
}

/* Stav z milníku 1: schéma 2 bez nových polí. */
const M1_STATE = {
  schema: 2,
  meta: { createdAt: 5, updatedAt: 6, importedFrom: null },
  profile: { level: 30, coins: 120000, xp: 10, xpNext: 100, rounds: 40, expBonus: 2, rewardPass: 12, amplified: 0 },
  stations: { gunsmith: 2, gear: 1, scrappy: 3 },
  inventory: { 'Metal Parts': 12, 'ARC Alloy': 3 },
  raids: [{ id: 'r1', ts: 1000, map: 'dam', type: 'money', route: 'oldbattle', ok: true, coins: 30000, min: 12, notes: 'staré' }],
  checklists: { templates: [{ id: 'raid', name: 'Před raidem', items: [{ id: 'r0', text: 'A' }] }], active: 'raid', checked: { r0: true }, routeChecks: { 'galleria:0': true } },
  gameData: { arc: { tick: { tactic: 'moje' } }, recipes: { 'gunsmith:3': [['Metal Parts', 5]] } },
  dashboard: { hidden: { steps: true }, order: ['raids', 'kpi'] },
};

describe('zpětné načtení', () => {
  it('stav milníku 1 se načte beze ztrát a dostane výchozí nová pole', () => {
    const s = normalize(M1_STATE, NOW);
    expect(s.profile.level).toBe(30);
    expect(s.inventory).toEqual({ 'Metal Parts': 12, 'ARC Alloy': 3 });
    expect(s.raids[0]).toMatchObject({ id: 'r1', route: 'oldbattle', coins: 30000, notes: 'staré', loadout: '', gear: [], loot: [], lost: [], goals: [], lootApplied: [] });
    expect(s.checklists.checked).toEqual({ r0: true });
    expect(s.checklists.routeChecks).toEqual({ 'galleria:0': true });
    expect(s.gameData.arc.tick).toEqual({ tactic: 'moje' });
    expect(s.gameData.recipes['gunsmith:3']).toEqual([['Metal Parts', 5]]);
    expect(s.goals).toEqual([]);
    expect(s.loadouts).toEqual([]);
    expect(s.planner).toEqual({ stations: {}, items: [], includeGoals: true, includeQuests: true });
    expect(s.gameData.routes).toEqual({});
    expect(s.gameData.sellCustom).toEqual([]);
    /* nové karty dashboardu se přidají na konec, skrytí a pořadí zůstanou */
    expect(s.dashboard.order.slice(0, 2)).toEqual(['raids', 'kpi']);
    expect(s.dashboard.order.slice(-2)).toEqual(['goals', 'recs']);
    expect(s.dashboard.hidden).toEqual({ steps: true });
  });

  it('záloha starého deníku v1 se převede a nová pole mají výchozí hodnoty', () => {
    const { state, report } = importV1(SAMPLE_V1, NOW);
    expect(report.ok).toBe(true);
    expect(state.raids).toHaveLength(SAMPLE_V1.runs.length);
    for (const r of state.raids) expect(r).toMatchObject({ loadout: '', gear: [], loot: [], lost: [], goals: [], lootApplied: [] });
    expect(state.goals).toEqual([]);
    expect(normalize(JSON.parse(JSON.stringify(state)), NOW)).toEqual(state);
  });

  it('záloha uchová všechna nová pole a normalize je idempotentní', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const gid = a.addGoal({ title: 'Gunsmith 3', priority: 1, due: '2026-11-20', link: { kind: 'station', station: 'gunsmith', level: 3 } });
    a.addGoal({ title: 'Ruční', link: { kind: 'manual', target: 5, progress: 2 } });
    const lid = a.saveLoadout({ name: 'Money', purpose: 'Money run', primary: 'ferro', augment: 'Looting Mk. 2', items: [{ name: 'Bandage', qty: 3 }] });
    a.addRaid({ map: 'dam', route: 'oldbattle', ok: true, coins: 40000, min: 11, loadout: lid, gear: [{ name: 'Ferro', qty: 1 }], loot: [{ name: 'Metal Parts', qty: 4 }], lost: [], goals: [gid] });
    a.setPlannerTarget('gunsmith', 3);
    a.addPlannerItem({ kind: 'craft', name: 'Bandage', qty: 4, mats: [{ name: 'Fabric', qty: 2 }] });
    a.addTemplate('Lov ARC');
    a.editRoute('galleria', { risk: 'Žádné' });
    a.addCustomRoute('Moje trasa', 'spaceport');
    a.editSell('s0', { price: 12000 });
    a.addCustomSell('Rubber Duck', 500, 'trinket');
    const s = st();
    const back = parseBackup(makeBackup(s, new Date(NOW)), NOW);
    if ('error' in back) throw new Error(back.error);
    expect(back.state).toEqual(s);
    expect(normalize(JSON.parse(JSON.stringify(s)), NOW)).toEqual(s);
  });
});

describe('Raid Journal: loot, úpravy, mazání', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('položky se sečtou podle názvu a rozdíl převodu sedí', () => {
    expect(normalizeItems([{ name: ' A ', qty: 2 }, { name: 'A', qty: 3 }, { name: '', qty: 9 }, { name: 'B', qty: -5 }])).toEqual([{ name: 'A', qty: 5 }, { name: 'B', qty: 1 }]);
    expect(lootDelta([{ name: 'A', qty: 5 }], [{ name: 'A', qty: 2 }, { name: 'B', qty: 1 }])).toEqual({ A: 3, B: -1 });
    expect(applyDelta({ A: 1, B: 1 }, { A: 3, B: -4 })).toEqual({ A: 4 });
    expect(lootState([], [])).toBe('none');
    expect(lootState([{ name: 'A', qty: 1 }], [])).toBe('pending');
    expect(lootState([{ name: 'A', qty: 1 }], [{ name: 'A', qty: 1 }])).toBe('applied');
    expect(lootState([{ name: 'A', qty: 2 }], [{ name: 'A', qty: 1 }])).toBe('changed');
  });

  it('převod lootu je výslovný a idempotentní, úprava raidu nic nepřičte', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    a.invSet('Metal Parts', 10);
    const id = a.addRaid({ map: 'dam', ok: true, coins: 1000, min: 10, loot: [{ name: 'Metal Parts', qty: 5 }, { name: 'Fabric', qty: 2 }] });
    expect(st().profile.rounds).toBe(1);
    expect(st().inventory['Metal Parts']).toBe(10); // zápis sám nic nepřičte
    expect(a.applyRaidLoot(id)).toEqual({ 'Metal Parts': 5, Fabric: 2 });
    expect(a.applyRaidLoot(id)).toEqual({}); // druhé stisknutí nic nepřičte
    expect(st().inventory).toMatchObject({ 'Metal Parts': 15, Fabric: 2 });
    /* úprava raidu: kola, mince a zásoba beze změny */
    a.updateRaid(id, { coins: 2000, loot: [{ name: 'Metal Parts', qty: 7 }] });
    expect(st().profile.rounds).toBe(1);
    expect(st().inventory).toMatchObject({ 'Metal Parts': 15, Fabric: 2 });
    expect(st().raids[0].lootApplied).toEqual([{ name: 'Metal Parts', qty: 5 }, { name: 'Fabric', qty: 2 }]);
    /* opakovaný převod převede jen rozdíl */
    expect(a.applyRaidLoot(id)).toEqual({ 'Metal Parts': 2, Fabric: -2 });
    expect(st().inventory['Metal Parts']).toBe(17);
    expect(st().inventory.Fabric).toBeUndefined();
    expect(a.applyRaidLoot(id)).toEqual({});
    /* vrácení odečte přesně převedené */
    expect(a.revertRaidLoot(id)).toBe(true);
    expect(st().inventory['Metal Parts']).toBe(10);
    expect(a.revertRaidLoot(id)).toBe(false);
  });

  it('úprava v zápisu s převodem a mazání raidu', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const id = a.addRaid({ map: 'dam', ok: true, loot: [{ name: 'Wires', qty: 3 }] }, { applyLoot: true });
    expect(st().inventory.Wires).toBe(3);
    a.updateRaid(id, { loot: [{ name: 'Wires', qty: 3 }] }, { applyLoot: true });
    expect(st().inventory.Wires).toBe(3);
    a.deleteRaid(id);
    expect(st().inventory.Wires).toBe(3); // smazání zásobu nemění
    const id2 = a.addRaid({ map: 'dam', ok: true, loot: [{ name: 'Wires', qty: 2 }] }, { applyLoot: true });
    a.deleteRaid(id2, { revertLoot: true });
    expect(st().inventory.Wires).toBe(3);
    expect(st().profile.rounds).toBe(2);
  });

  it('cíl splněný raidem: odebrání z raidu ho otevře, jiný raid ho nepřepíše', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const g = a.addGoal({ title: 'Quest', link: { kind: 'manual', target: 1, progress: 0 } });
    const r1 = a.addRaid({ map: 'dam', ok: true, goals: [g, 'neexistuje'] });
    expect(st().raids[0].goals).toEqual([g]);
    expect(st().goals[0]).toMatchObject({ doneRaid: r1 });
    expect(st().goals[0].doneAt).toBeGreaterThan(0);
    const r2 = a.addRaid({ map: 'dam', ok: true, goals: [g] });
    expect(st().goals[0].doneRaid).toBe(r1);
    a.updateRaid(r2, { goals: [] });
    expect(st().goals[0].doneRaid).toBe(r1); // r2 ho nesplnil, zůstává
    a.updateRaid(r1, { goals: [] });
    expect(st().goals[0].doneAt).toBe(0);
    a.deleteGoal(g);
    expect(st().raids.every(r => r.goals.length === 0)).toBe(true);
  });
});

describe('Goal Tracker', () => {
  it('progres se čte ze stavu a propojený cíl se splní sám', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const g1 = a.addGoal({ title: 'Level 10', link: { kind: 'level', level: 10 } });
    const g2 = a.addGoal({ title: 'Kov', link: { kind: 'material', mat: 'Metal Parts', qty: 20 } });
    const g3 = a.addGoal({ title: 'Ruční', link: { kind: 'manual', target: 3, progress: 0 } });
    expect(goalProgress(st().goals[0], st())).toMatchObject({ value: 1, target: 10, met: false });
    a.setProfile('level', 12);
    expect(st().goals.find(g => g.id === g1)!.doneAt).toBe(NOW);
    a.invSet('Metal Parts', 25);
    expect(st().goals.find(g => g.id === g2)!.doneAt).toBe(NOW);
    a.invSet('Metal Parts', 1); // spotřeba cíl neotevře
    expect(st().goals.find(g => g.id === g2)!.doneAt).toBe(NOW);
    a.setGoalProgress(g3, 2);
    expect(st().goals.find(g => g.id === g3)!.doneAt).toBe(0);
    a.setGoalProgress(g3, 9);
    expect(st().goals.find(g => g.id === g3)!).toMatchObject({ doneAt: NOW, link: { progress: 3 } });
    a.setGoalDone(g3, false);
    expect(st().goals.find(g => g.id === g3)!).toMatchObject({ doneAt: 0, link: { progress: 2 } });
  });

  it('řazení, termín a ořez', () => {
    const g = (id: string, priority: number, due: string, doneAt = 0) => normalizeGoal({ id, title: id, priority, due, doneAt, createdAt: 1 });
    expect(sortGoals([g('a', 3, ''), g('b', 1, '2026-12-01'), g('c', 1, '2026-11-20'), g('d', 1, '', 5)]).map(x => x.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(daysLeft('2026-11-12', NOW)).toBe(1);
    expect(daysLeft('2026-11-10', NOW)).toBe(-1);
    expect(daysLeft('', NOW)).toBeNull();
    const bad = normalizeGoal({ priority: 9, due: 'zítra', link: { kind: 'station', station: 'nic', level: 99 } });
    expect(bad).toMatchObject({ priority: 3, due: '', title: 'Cíl', link: { kind: 'station', station: 'gunsmith', level: 4 } });
  });
});

describe('Material Planner', () => {
  const base = (): AppState => defaultState(1);

  it('plán „další úroveň všech stanic“ dává stejný součet jako nákupní seznam z deníku', () => {
    const s = base();
    s.stations = { ...s.stations, gunsmith: 1, gear: 2, scrappy: 3 };
    s.inventory = { 'Metal Parts': 30, 'ARC Alloy': 2 };
    for (const st of STATIONS) if (s.stations[st.id] < st.max) s.planner.stations[st.id] = s.stations[st.id] + 1;
    const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
    const plan = Object.fromEntries(planNeeds(view, s.planner, []).map(r => [r.mat, r.need]));
    const shop = Object.fromEntries(shopping(view).map(r => [r.mat, r.need]));
    expect(plan).toEqual(shop);
  });

  it('cíl stanice a cílová úroveň plánu se nesčítají dvakrát', () => {
    const s = base();
    s.planner.stations.gunsmith = 2;
    const goal = normalizeGoal({ id: 'g', title: 'Gunsmith 2', link: { kind: 'station', station: 'gunsmith', level: 2 } });
    const view = { stations: s.stations, inventory: {}, profile: s.profile };
    const onlyPlan = planNeeds(view, s.planner, []);
    const both = planNeeds(view, s.planner, [goal]);
    expect(both).toEqual(onlyPlan);
    expect(both.every(r => r.sources.filter(x => x.kind === 'station').length === new Set(r.sources.map(x => x.key)).size)).toBe(true);
    /* vyšší cíl než plán zvedne cílovou úroveň */
    const g3 = normalizeGoal({ id: 'g3', title: 'Gunsmith 3', link: { kind: 'station', station: 'gunsmith', level: 3 } });
    expect(stationTargets(view, s.planner, [g3]).find(t => t.station.id === 'gunsmith')!.target).toBe(3);
    /* bez zahrnutí cílů se cíl ignoruje */
    expect(stationTargets(view, { ...s.planner, includeGoals: false }, [g3]).find(t => t.station.id === 'gunsmith')!.target).toBe(2);
  });

  it('crafting se násobí počtem, vlastní cíle a cíle materiálu se přičtou a souběh se pozná', () => {
    const s = base();
    s.planner.items = [
      { id: 'c', kind: 'craft', name: 'Bandage', qty: 3, mats: [{ name: 'Fabric', qty: 2 }] },
      { id: 'v', kind: 'custom', name: 'Zásoba', qty: 1, mats: [{ name: 'Fabric', qty: 4 }] },
    ];
    const goal = normalizeGoal({ id: 'gm', title: 'Fabric', link: { kind: 'material', mat: 'Fabric', qty: 5 } });
    const view = { stations: s.stations, inventory: { Fabric: 6 }, profile: s.profile };
    const row = planNeeds(view, s.planner, [goal]).find(r => r.mat === 'Fabric')!;
    expect(row.need).toBe(6 + 4 + 5);
    expect(row.missing).toBe(9);
    expect(row.sources.map(x => x.key)).toEqual(['craft:c', 'custom:v', 'goal:gm']);
    expect(row.contention).toBe(true); // 6, 4 i 5 by pokryla zásoba 6 zvlášť
    const done = { ...goal, doneAt: 5 };
    expect(planNeeds(view, s.planner, [done]).find(r => r.mat === 'Fabric')!.need).toBe(10);
    expect(planSummary(planNeeds(view, s.planner, [goal]))).toMatchObject({ rows: 1, need: 15, missing: 9, contention: 1 });
  });

  it('akce planneru nemění zásobu ani stanice', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    a.invSet('Metal Parts', 3);
    const before = JSON.stringify({ inv: st().inventory, stations: st().stations });
    a.plannerAll('max');
    expect(st().planner.stations.gunsmith).toBe(4);
    a.setPlannerTarget('gunsmith', 0);
    expect(st().planner.stations.gunsmith).toBeUndefined();
    a.addPlannerItem({ kind: 'craft', name: 'X', qty: 2, mats: [{ name: 'Metal Parts', qty: 1 }] });
    expect(JSON.stringify({ inv: st().inventory, stations: st().stations })).toBe(before);
    a.plannerAll('clear');
    expect(st().planner.stations).toEqual({});
  });
});

describe('loadouty a doporučení', () => {
  it('statistiky podle loadoutu, ztráty a výbava loadoutu', () => {
    const s = normalize({
      raids: [
        { id: 'a', loadout: 'L1', ok: true, coins: 1000, min: 10, lost: [] },
        { id: 'b', loadout: 'L1', ok: false, coins: 0, min: 5, lost: [{ name: 'Ferro', qty: 1 }, { name: 'Shield', qty: 1 }] },
        { id: 'c', loadout: '', ok: false, min: 5, lost: [{ name: 'Ferro', qty: 1 }] },
      ],
    }, 1);
    const ls = loadoutStats(s.raids);
    expect(ls.find(x => x.id === 'L1')).toMatchObject({ n: 2, ok: 1, rate: 0.5, coins: 1000, lost: 2 });
    expect(tallyItems(s.raids, r => r.lost)[0]).toEqual({ name: 'Ferro', qty: 2, raids: 2 });
    const gear = loadoutGear({ id: 'x', name: 'X', purpose: '', primary: 'w1', secondary: '', augment: 'Aug', shield: '', items: [{ name: 'Aug', qty: 1 }, { name: 'Bandage', qty: 2 }], note: '' }, id => id.toUpperCase());
    expect(gear).toEqual([{ name: 'W1', qty: 1 }, { name: 'Aug', qty: 2 }, { name: 'Bandage', qty: 2 }]);
  });

  it('doporučení vznikají jen z lokálních dat a každé má vysvětlení', () => {
    const empty = recommend(defaultState(NOW), NOW);
    expect(empty.map(r => r.id)).toContain('first-raid');
    expect(empty.some(r => r.id.startsWith('route:'))).toBe(false);

    const s = defaultState(NOW);
    s.inventory = Object.fromEntries(STATIONS.find(x => x.id === 'gunsmith')!.levels[1].map(([m, n]) => [m, n]));
    s.raids = normalize({ raids: [
      ...[1, 2, 3].map(i => ({ id: 'g' + i, type: 'money', route: 'galleria', map: 'buried', ok: true, coins: 30000, min: 10 })),
      ...[1, 2, 3].map(i => ({ id: 'o' + i, type: 'money', route: 'oldbattle', map: 'dam', ok: i === 1, coins: 40000, min: 10 })),
      { id: 'l', type: 'money', ok: true, loot: [{ name: 'Wires', qty: 1 }] },
    ] }, 1).raids;
    s.goals = [normalizeGoal({ id: 'late', title: 'Pozdě', priority: 1, due: '2026-11-09', createdAt: 1 })];
    const recs = recommend(s, NOW);
    const ids = recs.map(r => r.id);
    expect(ids).toContain('upgrade:gunsmith');
    expect(ids).toContain('route:best');
    expect(recs.find(r => r.id === 'route:best')!.title).toContain('Galleria');
    expect(ids).toContain('route:risky:oldbattle');
    expect(ids).toContain('goal:late');
    expect(ids).toContain('loot');
    for (const r of recs) { expect(r.why.length).toBeGreaterThan(0); expect(r.href.startsWith('#')).toBe(true); }
    /* bez dat nic nepředstírá */
    expect(recs.find(r => r.id === 'loadout:best')).toBeUndefined();
  });
});

describe('trasy, ceník a šablony checklistů', () => {
  it('úprava, vrácení, skrytí a vlastní trasa; změna kroků zruší odškrtnutí trasy', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    a.toggleRouteCheck('galleria:0');
    a.editRoute('galleria', { risk: 'Žádné' });
    expect(st().checklists.routeChecks['galleria:0']).toBe(true);
    expect(getRoutes(st().gameData).find(r => r.id === 'galleria')).toMatchObject({ risk: 'Žádné', edited: true, origin: 'denik' });
    a.editRoute('galleria', { steps: ['Jeden krok'] });
    expect(st().checklists.routeChecks['galleria:0']).toBeUndefined();
    a.editRoute('galleria', { risk: ROUTES[0].risk, steps: ROUTES[0].steps });
    expect(st().gameData.routes.galleria).toBeUndefined(); // stejné jako výchozí = žádná úprava
    a.editRoute('galleria', { name: 'Moje Galleria' });
    a.resetRoute('galleria');
    expect(getRoutes(st().gameData)[0].name).toBe(ROUTES[0].name);
    a.setRouteHidden('rna', true);
    expect(getRoutes(st().gameData).some(r => r.id === 'rna')).toBe(false);
    expect(routeLookup(st().gameData).some(r => r.id === 'rna')).toBe(true); // jméno u starších raidů zůstane
    const id = a.addCustomRoute('Moje', 'spaceport');
    a.editRoute(id, { steps: ['a', ' ', 'b'], yield: '50 000' });
    expect(getRoutes(st().gameData).find(r => r.id === id)).toMatchObject({ origin: 'vlastni', steps: ['a', 'b'], yield: '50 000', map: 'spaceport' });
    a.deleteCustomRoute(id);
    expect(getRoutes(st().gameData).some(r => r.id === id)).toBe(false);
  });

  it('prodejní ceník', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    a.editSell('s0', { price: 11000, note: 'moje' });
    expect(getSell(st().gameData)[0]).toMatchObject({ price: 11000, note: 'moje', edited: true });
    a.resetSell('s0');
    expect(getSell(st().gameData)[0]).toMatchObject({ price: 10000, edited: false });
    a.setSellHidden('s1', true);
    expect(getSell(st().gameData).some(x => x.id === 's1')).toBe(false);
    const id = a.addCustomSell('Duck', -5, 'x');
    expect(getSell(st().gameData).find(x => x.id === id)).toMatchObject({ price: 0, origin: 'vlastni' });
  });

  it('víc šablon: přidání, položky, odškrtnutí, smazání; výchozí nejde smazat', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const t = a.addTemplate('Lov ARC', 'raid');
    expect(st().checklists.active).toBe(t);
    const tp = st().checklists.templates.find(x => x.id === t)!;
    expect(tp.items).toHaveLength(8);
    const allIds = st().checklists.templates.flatMap(x => x.items.map(i => i.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    a.addTemplateItem(t, 'Granáty');
    const item = st().checklists.templates.find(x => x.id === t)!.items.at(-1)!;
    a.toggleCheck(item.id);
    a.toggleCheck('r0');
    a.moveTemplateItem(t, item.id, -1);
    expect(st().checklists.templates.find(x => x.id === t)!.items.at(-2)!.id).toBe(item.id);
    a.deleteTemplate(t);
    expect(st().checklists.checked).toEqual({ r0: true });
    expect(st().checklists.active).toBe('raid');
    a.deleteTemplate('raid');
    expect(st().checklists.templates.some(x => x.id === 'raid')).toBe(true);
    a.editTemplateItem('raid', 'r0', 'Upraveno');
    a.restoreDefaultTemplate();
    expect(st().checklists.templates[0].items[0].text).not.toBe('Upraveno');
    /* duplicitní id položek se při načtení rozdělí */
    const n = normalize({ checklists: { templates: [{ id: 'raid', items: [{ id: 'x', text: 'a' }] }, { id: 't2', items: [{ id: 'x', text: 'b' }] }] } }, 1);
    const ids = n.checklists.templates.flatMap(x => x.items.map(i => i.id));
    expect(new Set(ids).size).toBe(2);
  });

  it('reset nových modulů vytvoří snímek a nesmaže nic jiného', async () => {
    const { app, st } = await makeApp();
    const a = app.actions;
    const g = a.addGoal({ title: 'X', link: { kind: 'manual', target: 1, progress: 0 } });
    const l = a.saveLoadout({ name: 'L' });
    a.addRaid({ map: 'dam', ok: true, goals: [g], loadout: l });
    a.setPlannerTarget('gunsmith', 2);
    a.editSell('s0', { price: 1 });
    await a.resetModule('goals');
    expect(st().goals).toEqual([]);
    expect(st().raids[0].goals).toEqual([]);
    expect(st().loadouts).toHaveLength(1);
    await a.resetModule('loadouts');
    expect(st().raids[0].loadout).toBe('');
    await a.resetModule('planner');
    expect(st().planner.stations).toEqual({});
    await a.resetModule('routes');
    expect(st().gameData.sell).toEqual({});
    expect(st().raids).toHaveLength(1);
    expect((await a.listSnapshots()).filter(x => x.kind === 'reset')).toHaveLength(4);
  });
});

describe('poškozená nová pole', () => {
  it('normalize ořízne nesmysly a je idempotentní', () => {
    const junk = [null, 'x', -1, 1e30, NaN, {}, [], true, '5'];
    for (let i = 0; i < 200; i++) {
      const j = () => junk[(i * 7 + junk.length) % junk.length];
      const raw = {
        raids: [{ id: 'a', loot: [{ name: 'A', qty: j() }, { name: 'A', qty: 2 }, j()], lost: j(), gear: [{ name: '', qty: 3 }], goals: ['g', 'g', j()], lootApplied: [{ name: 'A', qty: 1e9 }], loadout: j() }],
        goals: [{ id: 'g', title: j(), priority: j(), due: j(), link: { kind: ['manual', 'level', 'station', 'skill', 'coins', 'material', 'trials', 'zz'][i % 8], target: j(), progress: j(), level: j(), station: j(), skill: j(), points: j(), amount: j(), mat: j(), qty: j(), stars: j() } }, { id: 'g' }, j()],
        planner: { stations: { gunsmith: j(), nic: 3 }, items: [{ id: 'p', kind: j(), qty: j(), mats: [{ name: 'B', qty: j() }] }, { id: 'p' }], includeGoals: j() },
        loadouts: [{ id: 'l', name: j(), items: j() }, { id: 'l' }, j()],
        gameData: { routes: { galleria: { steps: [j(), 'a'], map: 'nic', risk: j() } }, routesCustom: [{ id: 'x', steps: j() }, { id: 'x' }], sell: { s0: { price: j() } }, sellCustom: [{ name: j(), price: j() }], sellHidden: { s1: true, s2: 1 } },
      };
      const once = normalize(raw, 7);
      expect(normalize(JSON.parse(JSON.stringify(once)), 7)).toEqual(once);
      expect(new Set(once.goals.map(g => g.id)).size).toBe(once.goals.length);
      expect(new Set(once.loadouts.map(g => g.id)).size).toBe(once.loadouts.length);
      expect(once.raids[0].goals.filter(g => g === 'g')).toHaveLength(1);
      expect(once.raids[0].loot.filter(x => x.name === 'A')).toHaveLength(1);
      expect(once.raids[0].lootApplied[0].qty).toBe(99999);
    }
  });
});
