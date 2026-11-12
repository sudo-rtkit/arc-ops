/* Milník 4: rada nech / recykluj / prodej, úklid stashe, data o předmětech (recyklace, blueprinty, obchodníci),
   porovnání zbraní, vlastní tier list, fáze projektů a schéma 5 (migrace a záloha). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advise, adviseAll, cleanupRows, cleanupSummary, collectNeeds, needIndex, normalizeAdvice, type NeedInput } from '../../src/core/advice';
import { BLUEPRINTS, TRADERS, TRADER_OFFERS, coinPrice, itemData, normalizeBlueprints, recycleMaterials, recycleSources, slotsFor, weaponStats } from '../../src/core/itemdb';
import { bestIndexes, statsRow, tierRank, toggleCompare } from '../../src/core/compare';
import { emptyTierLists, moveWithin, normalizeTierList, placeTier, shiftTier, tierOf } from '../../src/core/tierlist';
import { PROJECTS, normalizeProjects, projectActive, projectNeeds } from '../../src/core/quests';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';

const AEC = 'Advanced Electrical Components';
const need = (mat: string, qty: number, key = 'station:outpost:1', label = 'Outpost 1'): NeedInput => ({ key, kind: 'station', label, mat, qty });
const none = () => 0;

describe('data o předmětech (ARC Tracker /api/items)', () => {
  it('hodnota, stack, recyklace; zbraň bez tieru dostane data tieru I', () => {
    expect(itemData(AEC)).toMatchObject({ v: 1750, s: 5, r: [['Electrical Components', 1], ['Wires', 1]] });
    expect(itemData('advanced electrical components')?.n).toBe(AEC);
    expect(itemData('Anvil')?.n).toBe('Anvil I');
    expect(itemData('Anvil IV')?.n).toBe('Anvil IV');
    expect(itemData('Nic takového')).toBeUndefined();
    expect(slotsFor(11, 5)).toBe(3);
    expect(slotsFor(0, 5)).toBe(0);
  });
  it('obrácená recyklace je seřazená podle výtěžku', () => {
    const src = recycleSources('ARC Alloy');
    expect(src.length).toBeGreaterThan(5);
    for (let i = 1; i < src.length; i++) expect(src[i - 1].qty).toBeGreaterThanOrEqual(src[i].qty);
    expect(src.every(s => s.outputs.some(([n]) => n === 'ARC Alloy'))).toBe(true);
    expect(recycleMaterials()).toContain(AEC);
    expect(recycleSources('Neexistuje')).toEqual([]);
  });
  it('blueprinty a obchodníci', () => {
    expect(BLUEPRINTS.length).toBeGreaterThan(50);
    expect(BLUEPRINTS.every(b => b.ty === 'Blueprint')).toBe(true);
    expect(TRADERS).toEqual(['Apollo', 'Celeste', 'Lance', 'Shani', 'Tian Wen']);
    expect(TRADER_OFFERS.length).toBeGreaterThan(50);
    const limited = TRADER_OFFERS.find(o => o.limit);
    expect(limited?.refreshH).toBe(24);
    expect(coinPrice({ trader: 'x', item: 'y', cost: [['Coins', 900]] })).toBe(900);
    expect(coinPrice({ trader: 'x', item: 'y', cost: [['Assorted Seeds', 5]] })).toBeNull();
  });
  it('statistiky zbraní podle názvu aplikace', () => {
    expect(weaponStats('Anvil')).toMatchObject({ dmg: 40, mag: 6 });
    expect(weaponStats('Aphelion')?.n).toBe('Aphelion Rifle');
    expect(weaponStats('Vlastní zbraň')).toBeUndefined();
  });
});

describe('rada nech / recykluj / prodej', () => {
  it('nech: potřebný počet s důvody, přebytek dostane vlastní radu', () => {
    const needs = needIndex([need(AEC, 3), need(AEC, 5, 'station:gear:3', 'Gear Bench 3'), need(AEC, 3)]);
    expect(needs.get(AEC.toLowerCase())?.total).toBe(8); /* stejný zdroj jen jednou */
    const a = advise({ key: AEC, name: AEC, count: 11, kind: 'material' }, needs, none);
    expect(a.kind).toBe('keep');
    expect(a).toMatchObject({ need: 8, keep: 8, surplus: 3, rest: 'sell', value: 1750, stack: 5, valuePerSlot: 8750, slots: 3, slotsFreed: 1, surplusValue: 5250 });
    expect(a.reasons.map(r => [r.label, r.qty])).toEqual([['Outpost 1', 3], ['Gear Bench 3', 5]]);
  });
  it('recykluj: vznikne chybějící materiál; když už ho mám dost, prodej', () => {
    const needs = needIndex([need(AEC, 3)]);
    const spectro = { key: 'Spectrometer', name: 'Spectrometer', count: 4, kind: 'item' as const };
    const a = advise(spectro, needs, none);
    expect(a.kind).toBe('recycle');
    expect(a.recycle).toEqual([{ name: AEC, qty: 1, needed: true }, { name: 'Sensors', qty: 1, needed: false }]);
    const b = advise(spectro, needs, n => (n === AEC ? 3 : 0));
    expect(b.kind).toBe('sell');
    expect(b).toMatchObject({ value: 3000, stack: 3, valuePerSlot: 9000, slots: 2, slotsFreed: 2 });
  });
  it('bez dat a „vždy nechat“', () => {
    const needs = needIndex([]);
    expect(advise({ key: 'Můj předmět', name: 'Můj předmět', count: 2, kind: 'item' }, needs, none).kind).toBe('unknown');
    const o = advise({ key: 'Spectrometer', name: 'Spectrometer', count: 4, kind: 'item' }, needs, none, true);
    expect(o).toMatchObject({ kind: 'keep', override: true, keep: 4, surplus: 0, slotsFreed: 0 });
  });
  it('potřeby ze stavu: další úroveň stanice, dostupný úkol, projekt, nenaučený blueprint', () => {
    const s = defaultState(1, 'cs');
    s.inventory = { 'Metal Parts': 50 };
    s.items = { 'Anvil Blueprint': { key: 'Anvil Blueprint', name: 'Anvil Blueprint', category: 'other', count: 1 } };
    const needs = collectNeeds(s, '2026-11-11', 'cs');
    const mp = needs.get('metal parts')!;
    expect(mp.sources.some(x => x.label === 'Gunsmith 1' && x.qty === 20)).toBe(true);
    expect(needs.get('anvil blueprint')?.sources[0].kind).toBe('blueprint');
    expect([...needs.values()].some(e => e.sources.some(x => x.kind === 'quest'))).toBe(true);
    expect([...needs.values()].some(e => e.sources.some(x => x.kind === 'project'))).toBe(true);
    const all = adviseAll(s, '2026-11-11', 'cs');
    expect(all.get('Anvil Blueprint')?.kind).toBe('keep');
    s.blueprints = { 'Anvil Blueprint': 5 };
    expect(adviseAll(s, '2026-11-11', 'cs').get('Anvil Blueprint')?.kind).not.toBe('keep');
  });
  it('úklid stashe: jen přebytky bez „vždy nechat“, řazení podle hodnoty na políčko, součet', () => {
    const needs = needIndex([need(AEC, 3)]);
    const rows = [
      advise({ key: AEC, name: AEC, count: 8, kind: 'material' }, needs, none),
      advise({ key: 'Spectrometer', name: 'Spectrometer', count: 4, kind: 'item' }, needs, n => (n === AEC ? 8 : 0)),
      advise({ key: 'Frequency Modulation Box', name: 'Frequency Modulation Box', count: 1, kind: 'item' }, needs, none, true),
      advise({ key: 'Můj', name: 'Můj', count: 1, kind: 'item' }, needs, none),
    ];
    const low = cleanupRows(rows, 'low');
    expect(low.map(r => r.name)).toEqual([AEC, 'Spectrometer', 'Můj']);
    expect(cleanupRows(rows, 'high').map(r => r.name)).toEqual(['Spectrometer', AEC, 'Můj']);
    expect(cleanupSummary(low)).toMatchObject({ items: 3, slots: 1 + 2 + 1, value: 5 * 1750 + 4 * 3000 });
  });
  it('normalizace „vždy nechat“', () => {
    expect(normalizeAdvice({ keep: { a: true, b: 1, '': true } })).toEqual({ keep: { a: true } });
    expect(normalizeAdvice('x')).toEqual({ keep: {} });
  });
});

describe('projekty: hotové fáze a potřeby další fáze', () => {
  it('běžící projekt přispěje další fází; po dokončení fáze tou následující', () => {
    expect(projectActive({ start: '2026-09-28', end: '2026-11-16' }, '2026-11-11')).toBe(true);
    expect(projectActive({ start: '2026-08-04', end: '2026-09-07' }, '2026-11-11')).toBe(false);
    const p = PROJECTS.find(x => x.id === 'souls_offering_project')!;
    const first = projectNeeds({}, '2026-11-11', 'en').find(n => n.id.startsWith(p.id));
    const firstWithReq = [...p.phases].sort((a, b) => a.phase - b.phase)[0];
    expect(first?.id).toBe(`${p.id}:${firstWithReq.phase}`);
    const second = projectNeeds({ [p.id]: 1 }, '2026-11-11', 'en').find(n => n.id.startsWith(p.id));
    expect(second?.id).not.toBe(first?.id);
    expect(projectNeeds({}, '2026-11-11', 'en').some(n => n.id.startsWith('phantom_targets_project'))).toBe(false);
  });
  it('normalizace: jen známé projekty, 0 až počet fází', () => {
    expect(normalizeProjects({ souls_offering_project: 99, neznamy: 2, trophy_display_project: -1 })).toEqual({ souls_offering_project: PROJECTS.find(x => x.id === 'souls_offering_project')!.phases.length });
  });
});

describe('porovnání zbraní', () => {
  it('nejlepší hodnota v řádku; u hmotnosti nižší', () => {
    expect(bestIndexes([40, 25, null, 40])).toEqual([0, 3]);
    expect(bestIndexes([5, 10, 9], true)).toEqual([0]);
    expect(bestIndexes([5, 5])).toEqual([]);
    expect(bestIndexes([5, null])).toEqual([]);
    expect(tierRank('S')).toBe(0);
    expect(tierRank('D')).toBe(4);
    expect(tierRank('')).toBeNull();
    expect(statsRow(['Anvil', 'Neznámá'], 'dmg')).toEqual([40, null]);
  });
  it('výběr nejvýš čtyř zbraní', () => {
    let l: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e']) l = toggleCompare(l, id);
    expect(l).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleCompare(l, 'b')).toEqual(['a', 'c', 'd']);
  });
});

describe('vlastní tier list', () => {
  it('zařazení, pořadí, posun tieru a vyřazení', () => {
    let l = emptyTierLists();
    l = placeTier(l, 'anvil', 'A');
    l = placeTier(l, 'ferro', 'A');
    l = placeTier(l, 'osprey', 'A', 0);
    expect(l.A).toEqual(['osprey', 'anvil', 'ferro']);
    l = placeTier(l, 'anvil', 'S');
    expect(l.A).toEqual(['osprey', 'ferro']);
    expect(tierOf(l, 'anvil')).toBe('S');
    l = moveWithin(l, 'ferro', -1);
    expect(l.A).toEqual(['ferro', 'osprey']);
    expect(moveWithin(l, 'ferro', -1)).toBe(l);
    l = shiftTier(l, 'anvil', -1);
    expect(tierOf(l, 'anvil')).toBe('S'); /* výš než S nejde */
    l = shiftTier(l, 'anvil', 1);
    expect(tierOf(l, 'anvil')).toBe('A');
    l = shiftTier(l, 'kettle', 1);
    expect(tierOf(l, 'kettle')).toBe('D');
    l = placeTier(l, 'kettle', null);
    expect(tierOf(l, 'kettle')).toBeNull();
  });
  it('normalizace: neznámé tiery pryč, položka jen jednou', () => {
    const n = normalizeTierList({ weapons: { S: ['a', 'a', 7, ''], X: ['b'], D: ['a', 'c'] }, items: 'x' });
    expect(n.weapons).toEqual({ S: ['a'], A: [], B: [], C: [], D: ['c'] });
    expect(n.items).toEqual(emptyTierLists());
  });
});

describe('schéma 5: migrace a záloha', () => {
  const S4 = {
    schema: 4, inventory: { 'Metal Parts': 4 }, items: {}, vision: { learned: [] }, quests: { done: { a: 5 } },
    settings: { autoSnapshot: true, lang: 'en' },
  };
  it('stav schématu 4 se načte beze ztrát a dostane výchozí nová pole', () => {
    const s = normalize(S4, 10);
    expect(SCHEMA).toBe(14);
    expect(s.schema).toBe(14);
    expect(s.inventory).toEqual({ 'Metal Parts': 4 });
    expect(s.quests.done).toEqual({ a: 5 });
    expect(s.settings.lang).toBe('en');
    expect(s.advice).toEqual({ keep: {} });
    expect(s.blueprints).toEqual({});
    expect(s.tierList).toEqual({ weapons: emptyTierLists(), items: emptyTierLists() });
    expect(s.projects).toEqual({});
  });
  it('záloha schématu 4 se načte; záloha schématu 5 nese nová pole a vrátí je beze změny', () => {
    const p4 = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 4, exportedAt: 'x', state: S4 }), 10);
    expect('state' in p4 && p4.state.inventory).toEqual({ 'Metal Parts': 4 });
    const s = defaultState(10, 'cs');
    s.advice.keep = { 'Spectrometer': true };
    s.blueprints = { 'Anvil Blueprint': 20 };
    s.tierList.weapons.S = ['anvil'];
    s.tierList.items.B = ['Spectrometer'];
    s.projects = { souls_offering_project: 2 };
    const file = JSON.parse(makeBackup(s, new Date(0)));
    expect(file.schema).toBe(14);
    expect(file.state.tierList.weapons.S).toEqual(['anvil']);
    const back = parseBackup(JSON.stringify(file), 10);
    expect('state' in back && back.state).toEqual(s);
  });
  it('normalizace blueprintů', () => {
    expect(normalizeBlueprints({ 'Anvil Blueprint': 3, x: 'nic', '': 4 })).toEqual({ 'Anvil Blueprint': 3 });
  });
});

describe('store: akce milníku 4', () => {
  const NOW = new Date(2026, 10, 11, 12, 0).getTime();
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });
  it('vždy nechat, blueprint, tier list, fáze projektu; reset modulů', async () => {
    const kv = memoryKV();
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW });
    await app.init();
    const st = () => app.store.getState().state;
    app.actions.adviceKeep('Spectrometer', true);
    expect(st().advice.keep).toEqual({ Spectrometer: true });
    app.actions.adviceKeep('Spectrometer', false);
    expect(st().advice.keep).toEqual({});
    app.actions.blueprintSet('Anvil Blueprint', true);
    expect(st().blueprints).toEqual({ 'Anvil Blueprint': NOW });
    app.actions.tierPlace('weapons', 'anvil', 'A');
    app.actions.tierPlace('weapons', 'ferro', 'A', 0);
    app.actions.tierMove('weapons', 'anvil', 'up');
    expect(st().tierList.weapons).toMatchObject({ S: ['anvil'], A: ['ferro'] });
    app.actions.tierMove('weapons', 'ferro', 'down');
    expect(st().tierList.weapons.B).toEqual(['ferro']);
    app.actions.tierPlace('weapons', 'ferro', null);
    expect(st().tierList.weapons.B).toEqual([]);
    app.actions.projectSetPhases('souls_offering_project', 2);
    app.actions.projectSetPhases('neznamy', 2);
    expect(st().projects).toEqual({ souls_offering_project: 2 });
    app.actions.projectSetPhases('souls_offering_project', 0);
    expect(st().projects).toEqual({});
    expect(await app.actions.resetModule('tiers')).toBe(true);
    expect(st().tierList.weapons.S).toEqual([]);
    expect(await app.actions.resetModule('blueprints')).toBe(true);
    expect(st().blueprints).toEqual({});
  });
});
