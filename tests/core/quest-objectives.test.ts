/* 0.10.2: postup cílů úkolů (schéma 9, quests.objectives). Normalizace, migrace 8 → 9 i starších schémat, záloha,
   akce store, import ze snímku (snímek stavu před zápisem, odškrtnutí nikdy předem, úkol se nikdy nesplní sám)
   a postup v kompaktu. Všechno synteticky, bez vlastních snímků. */
import { describe, expect, it } from 'vitest';
import { QUESTS, normalizeQuestObjectives, objectiveProgress, questById, setObjective } from '../../src/core/quests';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { activeQuests } from '../../src/core/compact';
import { applyProgress, defaultApply, normalizeProgressApply, proposalChanges, proposeProgress, questTickChanges, type QuestProposal } from '../../src/core/progressImport';
import type { QuestRead } from '../../src/core/vision/progress';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';

const NOW = new Date(2026, 10, 12, 9, 0).getTime();
const SHORING = 'shoring_up_defenses';
const BATTEN = 'battening_down';

function storage(initial?: unknown) {
  const kv = memoryKV();
  if (initial !== undefined) kv.setItem('arcops:state', JSON.stringify(initial));
  const base = createBrowserStorage(kv, () => NOW);
  const snaps: string[] = [];
  let fail = false;
  const adapter: StorageAdapter = { ...base, async createSnapshot(k, l, c) { if (fail) throw new Error('disk'); snaps.push(k + ':' + l); return base.createSnapshot(k, l, c); } };
  return { adapter, snaps, failSnapshots: () => { fail = true; } };
}
async function makeApp(initial?: unknown) {
  const st = storage(initial);
  const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return { app, st, state: () => app.store.getState().state };
}
const questRead = (title: string, objectives: (boolean | null)[], conf = 0.9): QuestRead => ({
  screen: 'quest', trader: { value: 'APOLLO', conf: 0.9, raw: 'APOLLO' }, title: { value: title, conf, raw: title }, objectives,
});

describe('cíle úkolů: čisté funkce', () => {
  it('data: Shoring Up Defenses má 4 cíle, Battening Down 3', () => {
    expect(questById(SHORING)!.objectives).toHaveLength(4);
    expect(questById(BATTEN)!.objectives).toHaveLength(3);
  });
  it('normalizace: jen celá čísla v rozsahu cílů, bez opakování, seřazené; neznámý úkol do 50; prázdné pryč', () => {
    expect(normalizeQuestObjectives(null)).toEqual({});
    expect(normalizeQuestObjectives([1, 2])).toEqual({});
    expect(normalizeQuestObjectives({
      [SHORING]: [3, 1, 1, 4, -1, 2.5, '0', 0], [BATTEN]: [], budouci_ukol: [7, 49, 50], ['x'.repeat(81)]: [0], spatne: 'ano',
    })).toEqual({ [SHORING]: [0, 1, 3], budouci_ukol: [7, 49] });
  });
  it('zaškrtnutí a odškrtnutí jednoho cíle; neplatné vstupy vrátí tentýž objekt', () => {
    const a = setObjective({}, SHORING, 2, true);
    expect(a).toEqual({ [SHORING]: [2] });
    const b = setObjective(a, SHORING, 0, true);
    expect(b).toEqual({ [SHORING]: [0, 2] });
    expect(setObjective(b, SHORING, 0, true)).toBe(b);
    expect(setObjective(b, SHORING, 4, true)).toBe(b);
    expect(setObjective(b, SHORING, 1.5, true)).toBe(b);
    expect(setObjective(b, 'neexistuje', 0, true)).toBe(b);
    expect(setObjective(setObjective(b, SHORING, 0, false), SHORING, 2, false)).toEqual({});
    expect(objectiveProgress(b, questById(SHORING)!)).toEqual({ done: 2, total: 4 });
    expect(objectiveProgress(undefined, questById(SHORING)!)).toEqual({ done: 0, total: 4 });
  });
});

describe('schéma 9: migrace a záloha', () => {
  it('stav schématu 8 se načte beze ztrát a dostane prázdné cíle', () => {
    expect(SCHEMA).toBe(17);
    const old = { schema: 8, profile: { level: 20, coins: 58313 }, inventory: { 'Metal Parts': 4 }, quests: { done: { ss1: 5 }, pinned: [SHORING] }, opsPrefs: { personality: 'cheeky' } };
    const s = normalize(old, NOW);
    expect(s.schema).toBe(17);
    expect(s.quests).toEqual({ done: { ss1: 5 }, pinned: [SHORING], objectives: {} });
    expect(s.profile).toMatchObject({ level: 20, coins: 58313 });
    expect(s.inventory).toEqual({ 'Metal Parts': 4 });
    expect(s.opsPrefs.personality).toBe('cheeky');
  });
  it.each([2, 3, 4, 5, 6, 7])('stav a záloha schématu %i dojdou do schématu 9 s prázdnými cíli', schema => {
    const old = { schema, profile: { level: 7 }, inventory: { Fabric: 2 }, ...(schema >= 4 ? { quests: { done: { ss1: 5 } } } : {}) };
    const s = normalize(old, NOW);
    expect(s.schema).toBe(17);
    expect(s.quests.objectives).toEqual({});
    expect(s.profile.level).toBe(7);
    expect(s.inventory).toEqual({ Fabric: 2 });
    const p = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema, exportedAt: 'x', state: old }), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(p.state.schema).toBe(17);
    expect(p.state.quests.objectives).toEqual({});
    expect(p.state.profile.level).toBe(7);
  });
  it('záloha nese cíle a vrátí je beze změny; schéma 18 je novější verze', () => {
    const s = defaultState(NOW);
    s.quests.objectives = { [SHORING]: [0, 1, 3] };
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(17);
    expect(file.state.quests.objectives).toEqual({ [SHORING]: [0, 1, 3] });
    const p = parseBackup(makeBackup(s), NOW);
    expect('error' in p ? p.error : p.state).toEqual(s);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 18, state: {} }), NOW)).toHaveProperty('error');
  });
});

describe('store: cíle úkolů', () => {
  it('ruční zaškrtnutí se uloží, splnění úkolu se nemění, reset modulu Quests je smaže', async () => {
    const { app, state } = await makeApp(defaultState(NOW));
    for (const i of [0, 1, 2]) app.actions.questObjective(BATTEN, i, true);
    expect(state().quests.objectives).toEqual({ [BATTEN]: [0, 1, 2] });
    /* všechny cíle zaškrtnuté: úkol se sám nesplní */
    expect(state().quests.done[BATTEN]).toBeUndefined();
    app.actions.questObjective(BATTEN, 1, false);
    app.actions.questObjective(BATTEN, 9, true);
    app.actions.questObjective('neexistuje', 0, true);
    expect(state().quests.objectives).toEqual({ [BATTEN]: [0, 2] });
    /* splnění úkolu cíle nemění */
    app.actions.questSet(BATTEN, true);
    expect(state().quests.objectives).toEqual({ [BATTEN]: [0, 2] });
    await app.actions.resetModule('quests');
    expect(state().quests).toEqual({ done: {}, pinned: [], objectives: {} });
  });
  it('import zálohy přinese cíle (herní postup, ne nastavení počítače)', async () => {
    const { app, state } = await makeApp({ schema: 8, quests: { done: {}, pinned: [] } });
    const other = defaultState(NOW);
    other.quests.objectives = { [SHORING]: [1] };
    const p = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(await app.actions.importState(p.state, '{}', 'app')).toBe(true);
    expect(state().quests.objectives).toEqual({ [SHORING]: [1] });
  });
  it('import ze snímku: snímek stavu před zápisem; bez snímku stavu se nic nezapíše', async () => {
    const { app, st, state } = await makeApp(defaultState(NOW));
    expect(await app.actions.importProgress({ questTicks: [{ id: SHORING, index: 0, on: true }, { id: SHORING, index: 3, on: true }, { id: SHORING, index: 7, on: true }] })).toEqual({ fields: 2 });
    expect(st.snaps.at(-1)).toBe('import:pred importem postupu ze snimku');
    expect(state().quests.objectives).toEqual({ [SHORING]: [0, 3] });
    expect(state().quests.done).toEqual({});
    st.failSnapshots();
    expect(await app.actions.importProgress({ questTicks: [{ id: SHORING, index: 1, on: true }] })).toBeNull();
    expect(state().quests.objectives).toEqual({ [SHORING]: [0, 3] });
  });
});

describe('návrh ze snímku úkolu', () => {
  it('zaškrtnuté cíle předvybrané u jistého úkolu, nepřečtený cíl nic, odškrtnutí jen na přání', () => {
    const s = defaultState(NOW);
    s.quests.objectives = { [SHORING]: [2, 3] };
    const p = proposeProgress(questRead('SHORING UP DEFENSES', [true, null, false, true]), s, 'en') as QuestProposal;
    expect([p.questId, p.conf, p.countMatch]).toEqual([SHORING, 'high', true]);
    expect(p.objectives.map(o => o.stored)).toEqual([false, false, true, true]);
    expect(questTickChanges(p)).toEqual([{ id: SHORING, index: 0, on: true }, { id: SHORING, index: 2, on: false }]);
    expect(defaultApply(p)).toEqual({ questTicks: [{ id: SHORING, index: 0, on: true }] });
    /* 2 cíle + připnutí */
    expect(proposalChanges(p)).toBe(3);
    applyProgress(s, defaultApply(p));
    expect(s.quests.objectives).toEqual({ [SHORING]: [0, 2, 3] });
  });
  it('jiný počet cílů než v datech: nic k zaškrtnutí', () => {
    const p = proposeProgress(questRead('SHORING UP DEFENSES', [true, true, true]), defaultState(NOW)) as QuestProposal;
    expect(p.countMatch).toBe(false);
    expect(questTickChanges(p)).toEqual([]);
    expect(defaultApply(p)).toEqual({});
  });
  it('nejistý úkol (název se dvěma chybami čtení) nic nepředvybere, ale cíle nabídne', () => {
    const p = proposeProgress(questRead('SHORNG UP DEFENCES', [true, true, false, true]), defaultState(NOW)) as QuestProposal;
    expect([p.questId, p.conf]).toEqual([SHORING, 'medium']);
    expect(questTickChanges(p)).toHaveLength(3);
    expect(defaultApply(p)).toEqual({});
  });
  it('všechny cíle zaškrtnuté: „splněno“ se nenabízí a nezapíše', () => {
    const s = defaultState(NOW);
    const p = proposeProgress(questRead('BATTENING DOWN', [true, true, true]), s) as QuestProposal;
    const a = defaultApply(p);
    expect(a).toEqual({ questTicks: [0, 1, 2].map(index => ({ id: BATTEN, index, on: true })) });
    applyProgress(s, a);
    expect(s.quests.done).toEqual({});
  });
  it('vstup z overlaye: cíle jen v očekávaném tvaru', () => {
    const a = normalizeProgressApply({ questTicks: [{ id: SHORING, index: 1, on: true }, { id: SHORING, index: '1', on: true }, { id: 5, index: 0, on: true }, { id: SHORING, index: 0, on: 'ano' }, null] });
    expect(a!.questTicks).toEqual([{ id: SHORING, index: 1, on: true }]);
  });
});

describe('kompakt: postup aktivního úkolu', () => {
  it('se zaškrtnutým cílem podle cílů, jinak podle předmětů k odevzdání', () => {
    const s = defaultState(NOW);
    const withItems = QUESTS.find(q => q.deliver.length && q.prev.length === 0)!;
    s.quests.pinned = [SHORING, withItems.id];
    let rows = activeQuests(s, 'en', 5);
    expect(rows.find(r => r.id === SHORING)).toMatchObject({ by: 'items' });
    s.quests.objectives = { [SHORING]: [0, 1, 3], [withItems.id]: [0] };
    rows = activeQuests(s, 'en', 5);
    expect(rows.find(r => r.id === SHORING)).toMatchObject({ by: 'objectives', have: 3, need: 4 });
    expect(rows.find(r => r.id === withItems.id)).toMatchObject({ by: 'objectives', have: 1, need: withItems.objectives.length });
    /* starší tvar bez cílů (např. stav z jiného okna) nespadne */
    const legacy = { ...s, quests: { done: {}, pinned: [SHORING] } } as unknown as typeof s;
    expect(activeQuests(legacy, 'en', 1)[0]).toMatchObject({ id: SHORING, by: 'items' });
  });
});
