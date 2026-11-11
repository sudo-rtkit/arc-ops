/* Úkoly, workshop a projekty z veřejných dat ARC Tracker (milník 3b): tvar vygenerovaných dat, shoda workshopu se
   stanicemi aplikace, migrace schématu 3 → 4, záloha, zaškrtávání úkolů a jejich potřeby v nákupním seznamu
   a Material Planneru. */
import { describe, expect, it } from 'vitest';
import { AT_HIDEOUT, AT_PROJECTS, AT_QUESTS } from '../../src/core/data/arctracker';
import { STATIONS } from '../../src/core/data/stations';
import { MAPS } from '../../src/core/data/maps';
import { CATALOG } from '../../src/core/data/catalog';
import { QUESTS, locText, normalizeQuestDone, prerequisites, questById, questNeeds, questStatus, setQuestDone } from '../../src/core/quests';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { shopping } from '../../src/core/workshop';
import { planNeeds } from '../../src/core/planner';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const isQty = (x: unknown) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[0].length > 0 && Number.isInteger(x[1]) && x[1] > 0;
const isLoc = (x: unknown) => (typeof x === 'string' && x.length > 0) || (typeof x === 'object' && x !== null && typeof (x as { en: unknown }).en === 'string');

describe('vygenerovaná data ARC Tracker', () => {
  it('počty a tvar úkolů', () => {
    expect(AT_QUESTS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(AT_QUESTS.map(q => q.id)).size).toBe(AT_QUESTS.length);
    const mapIds = new Set(MAPS.map(m => m.id));
    for (const q of AT_QUESTS) {
      expect(isLoc(q.name), q.id).toBe(true);
      expect(q.trader.length, q.id).toBeGreaterThan(0);
      expect(q.objectives.length, q.id).toBeGreaterThan(0);
      for (const o of q.objectives) { expect(isLoc(o)).toBe(true); expect(locText(o, 'en').length).toBeLessThanOrEqual(160); }
      for (const x of [...q.deliver, ...q.questItems, ...q.rewards]) expect(isQty(x), q.id).toBe(true);
      for (const m of q.maps) expect(mapIds.has(m), `${q.id} ${m}`).toBe(true);
      expect(Number.isInteger(q.xp)).toBe(true);
    }
    /* odkazy na předchozí úkoly míří na existující úkoly */
    const ids = new Set(AT_QUESTS.map(q => q.id));
    expect(AT_QUESTS.flatMap(q => q.prev).filter(p => !ids.has(p))).toEqual([]);
  });
  it('workshop a projekty', () => {
    expect(AT_HIDEOUT.length).toBeGreaterThanOrEqual(8);
    for (const m of AT_HIDEOUT) for (const l of m.levels) for (const r of l.req) expect(isQty(r), m.id).toBe(true);
    expect(AT_PROJECTS.length).toBeGreaterThanOrEqual(1);
    for (const p of AT_PROJECTS) {
      expect(isLoc(p.name)).toBe(true);
      expect(p.phases.length).toBeGreaterThan(0);
      for (const ph of p.phases) for (const r of [...ph.req, ...ph.rewards]) expect(isQty(r), p.id).toBe(true);
    }
  });
  it('názvy předmětů v požadavcích odpovídají katalogu MetaForge', () => {
    const names = new Set(CATALOG.map(c => c.name));
    const used = [...AT_QUESTS.flatMap(q => q.deliver), ...AT_HIDEOUT.flatMap(m => m.levels.flatMap(l => l.req)), ...AT_PROJECTS.flatMap(p => p.phases.flatMap(ph => ph.req))].map(([n]) => n);
    expect([...new Set(used)].filter(n => !names.has(n))).toEqual([]);
  });
  it('workshop ARC Tracker se shoduje se stanicemi aplikace (ruční data z deníku)', () => {
    const MAP: Record<string, string> = { weapon_bench: 'gunsmith', equipment_bench: 'gear', med_station: 'medical', refiner: 'refiner', utility_bench: 'utility', explosives_bench: 'explosives', scrappy: 'scrappy', research_station: 'research' };
    const norm = (r: [string, number][]) => [...r].map(([n, q]) => `${q} ${n}`).sort();
    for (const [at, id] of Object.entries(MAP)) {
      const m = AT_HIDEOUT.find(x => x.id === at)!, st = STATIONS.find(s => s.id === id)!;
      expect(m.maxLevel, id).toBe(st.max);
      for (const l of m.levels) {
        expect(norm(l.req), `${id} ${l.level}`).toEqual(norm(st.levels[l.level] || []));
        expect(l.outpost ?? 0, `${id} ${l.level} outpost`).toBe(st.req?.[l.level]?.outpost ?? 0);
      }
    }
  });
});

/* Řetěz: Snap and Salvage ← Cold Storage ← … ; Snap and Salvage chce donést Magnetron a Flow Controller. */
const SNAP = '12_snap_and_salvage';

describe('zaškrtávání úkolů', () => {
  it('stav: dostupný, zamčený, splněný', () => {
    const first = QUESTS.find(q => !q.prev.length)!;
    expect(questStatus(first, {})).toBe('active');
    const snap = questById(SNAP)!;
    expect(snap.deliver.map(d => d[0]).sort()).toEqual(['Flow Controller', 'Magnetron']);
    expect(questStatus(snap, {})).toBe('locked');
    const done = Object.fromEntries(prerequisites(SNAP).map(id => [id, 1]));
    expect(questStatus(snap, done)).toBe('active');
    expect(questStatus(snap, { ...done, [SNAP]: 2 })).toBe('done');
  });
  it('zaškrtnutí doplní předchozí úkoly řetězu, odškrtnutí jen úkol', () => {
    const pre = prerequisites(SNAP);
    expect(pre.length).toBeGreaterThan(1);
    expect(pre).toContain('12_cold_storage');
    const d = setQuestDone({}, SNAP, true, NOW);
    expect(Object.keys(d).sort()).toEqual([SNAP, ...pre].sort());
    /* dřív zaškrtnutý úkol si nechá svůj čas */
    expect(setQuestDone({ '12_cold_storage': 5 }, SNAP, true, NOW)['12_cold_storage']).toBe(5);
    const u = setQuestDone(d, SNAP, false, NOW);
    expect(u[SNAP]).toBeUndefined();
    expect(Object.keys(u).length).toBe(pre.length);
    expect(setQuestDone({}, 'neexistuje', true, NOW)).toEqual({});
  });
  it('normalizace zahodí neplatné hodnoty', () => {
    expect(normalizeQuestDone({ a: 5, b: 'x', c: -1, '': 3, d: 7.6 })).toEqual({ a: 5, d: 8 });
    expect(normalizeQuestDone([1, 2])).toEqual({});
  });
});

describe('potřeby úkolů v nákupním seznamu a Planneru', () => {
  const done = Object.fromEntries(prerequisites(SNAP).map(id => [id, 1]));
  it('dostupný úkol přidá předměty k donesení; zamčený ani splněný ne', () => {
    expect(questNeeds({}, 'en').some(n => n.id === SNAP)).toBe(false);
    const need = questNeeds(done, 'en').find(n => n.id === SNAP)!;
    expect(need.mats).toEqual(expect.arrayContaining([['Magnetron', 1], ['Flow Controller', 1]]));
    expect(questNeeds({ ...done, [SNAP]: 1 }, 'en').some(n => n.id === SNAP)).toBe(false);
  });
  it('nákupní seznam a Planner (s možností úkoly vypnout)', () => {
    const s = defaultState(NOW);
    const view = { stations: s.stations, inventory: { Magnetron: 1 }, profile: s.profile };
    const extra = questNeeds(done, 'en').map(q => ({ label: 'Quest ' + q.label, mats: q.mats }));
    const row = shopping(view, undefined, undefined, extra).find(r => r.mat === 'Magnetron')!;
    expect(row).toMatchObject({ need: 1, have: 1, missing: 0 });
    expect(row.uses).toContain('Quest Snap and Salvage');
    expect(shopping(view).some(r => r.mat === 'Magnetron')).toBe(false);
    const plan = planNeeds(view, s.planner, [], undefined, undefined, questNeeds(done, 'en'));
    expect(plan.find(r => r.mat === 'Flow Controller')?.sources[0]).toMatchObject({ kind: 'quest', key: `quest:${SNAP}` });
    expect(planNeeds(view, { ...s.planner, includeQuests: false }, [], undefined, undefined, questNeeds(done, 'en')).some(r => r.mat === 'Flow Controller')).toBe(false);
  });
});

describe('schéma 4: úkoly ve stavu a v záloze', () => {
  const S3 = { schema: 3, inventory: { 'Metal Parts': 4 }, planner: { stations: {}, items: [], includeGoals: false }, items: {}, vision: { learned: [] }, settings: { autoSnapshot: true, lang: 'cs' } };
  it('migrace 3 → 4 doplní quests a planner.includeQuests a nic neztratí', () => {
    expect(SCHEMA).toBe(5);
    const s = normalize(S3, NOW);
    expect(s.schema).toBe(5);
    expect(s.quests).toEqual({ done: {} });
    expect(s.planner).toEqual({ stations: {}, items: [], includeGoals: false, includeQuests: true });
    expect(s.inventory).toEqual({ 'Metal Parts': 4 });
  });
  it('záloha schématu 3 se načte; záloha obsahuje úkoly a vrátí je beze změny', () => {
    const p3 = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 3, exportedAt: 'x', state: S3 }), NOW);
    expect('error' in p3 ? p3.error : p3.state.quests).toEqual({ done: {} });
    const s = defaultState(NOW);
    s.quests.done = { [SNAP]: NOW };
    s.planner.includeQuests = false;
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(5);
    expect(file.state.quests).toEqual({ done: { [SNAP]: NOW } });
    const p = parseBackup(makeBackup(s), NOW);
    expect('error' in p ? p.error : p.state).toEqual(s);
  });
});

describe('store: úkoly', () => {
  it('zaškrtnutí, počet nově označených, odškrtnutí, reset modulu', async () => {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(defaultState(NOW)));
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
    await app.init();
    const st = () => app.store.getState().state;
    const n = app.actions.questSet(SNAP, true);
    expect(n).toBe(prerequisites(SNAP).length + 1);
    expect(st().quests.done[SNAP]).toBe(NOW);
    expect(app.actions.questSet(SNAP, true)).toBe(0);
    app.actions.questSet(SNAP, false);
    expect(st().quests.done[SNAP]).toBeUndefined();
    expect(Object.keys(st().quests.done).length).toBe(prerequisites(SNAP).length);
    app.actions.setPlannerIncludeQuests(false);
    expect(st().planner.includeQuests).toBe(false);
    await app.actions.resetModule('quests');
    expect(st().quests).toEqual({ done: {} });
  });
});
