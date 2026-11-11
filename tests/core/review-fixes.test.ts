/* Opravy z code review po verzi 0.3.0: ukládání při flush, týden Trials za běhu, úpravy vestavěných záznamů,
   ruční cíle se změněným cílem, čísla podle jazyka a poškozený hash. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { baseArc, getWeapons } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { parseNumberInput } from '../../src/ui/format';
import { safeDecode } from '../../src/core/util';

const NOW = new Date(2026, 10, 10, 12, 0).getTime(); // úterý, 2026-W46

async function makeApp(opts: { now?: () => number; adapter?: StorageAdapter } = {}) {
  const kv = memoryKV();
  const adapter = opts.adapter ?? createBrowserStorage(kv, () => NOW);
  const app = createApp(adapter, { now: opts.now ?? (() => NOW), weekCheckMs: 0 });
  await app.init();
  return { app, st: () => app.store.getState().state };
}

describe('flush čeká na dopsání nejnovějšího stavu', () => {
  it('flush během rozběhnutého zápisu se vrátí až po uložení poslední změny', async () => {
    const kv = memoryKV();
    const base = createBrowserStorage(kv, () => NOW);
    const saves: string[] = [];
    let release: (() => void) | null = null;
    const adapter: StorageAdapter = {
      ...base,
      async save(c) {
        if (!saves.length) await new Promise<void>(r => { release = r; }); // první zápis visí
        else await new Promise(r => setTimeout(r, 10)); // další zápisy trvají jako na disku
        saves.push(c);
        return base.save(c);
      },
    };
    const { app } = await makeApp({ adapter });
    app.actions.setProfile('level', 10);
    const first = app.flush();
    await Promise.resolve();
    app.actions.setProfile('level', 20);
    let done = false;
    const second = app.flush().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    release!();
    await second;
    /* ve chvíli, kdy se druhý flush vrátí, už musí být uložená poslední změna */
    expect(done).toBe(true);
    expect(JSON.parse(saves[saves.length - 1]).profile.level).toBe(20);
    await first;
    expect(app.store.getState().save).toBe('saved');
  });
});

describe('týden Trials za běhu', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('kontrola týdne archivuje starý týden bez restartu', async () => {
    let clock = NOW;
    const { app, st } = await makeApp({ now: () => clock });
    app.actions.setStarsExact(0, 2);
    const week = st().trials.week;
    clock = new Date(2026, 10, 16, 0, 5).getTime(); // pondělí další týden
    expect(app.checkWeek()).toBe(true);
    expect(st().trials.week).not.toBe(week);
    expect(st().trials.stars).toEqual([0, 0, 0, 0, 0]);
    expect(st().trials.history.find(h => h.week === week)?.stars[0]).toBe(2);
    expect(app.checkWeek()).toBe(false);
  });

  it('hvězdy zadané po přelomu týdne jdou do nového týdne', async () => {
    let clock = NOW;
    const { app, st } = await makeApp({ now: () => clock });
    app.actions.setStarsExact(0, 3);
    const week = st().trials.week;
    clock = new Date(2026, 10, 16, 9, 0).getTime();
    app.actions.setStarsExact(1, 1);
    expect(st().trials.week).not.toBe(week);
    expect(st().trials.stars).toEqual([0, 1, 0, 0, 0]);
    expect(st().trials.history.find(h => h.week === week)?.stars).toEqual([3, 0, 0, 0, 0]);
  });
});

describe('úprava vestavěných záznamů', () => {
  it('pole vrácené na základ smaže dřívější úpravu ARC', async () => {
    const { app, st } = await makeApp();
    const base = baseArc('tick')!;
    app.actions.editArc('tick', { tactic: 'X', gear: 'G' });
    expect(st().gameData.arc.tick).toEqual({ tactic: 'X', gear: 'G' });
    app.actions.editArc('tick', { tactic: undefined });
    expect(st().gameData.arc.tick).toEqual({ gear: 'G' });
    app.actions.editArc('tick', { gear: undefined });
    expect(st().gameData.arc.tick).toBeUndefined();
    expect(base.tactic).not.toBe('X');
  });

  it('uložení beze změny nevytvoří prázdnou úpravu', async () => {
    const { app, st } = await makeApp();
    const w = getWeapons(defaultState(NOW).gameData)[0];
    app.actions.editArc('tick', {});
    app.actions.editWeapon(w.id, { info: undefined });
    expect(st().gameData.arc.tick).toBeUndefined();
    expect(st().gameData.weapons[w.id]).toBeUndefined();
    app.actions.editWeapon(w.id, { info: 'moje' });
    expect(st().gameData.weapons[w.id]).toEqual({ info: 'moje' });
    app.actions.editWeapon(w.id, { info: undefined });
    expect(st().gameData.weapons[w.id]).toBeUndefined();
  });
});

describe('ruční cíl se změněným cílem', () => {
  it('snížení cíle na progres cíl splní, zvýšení ho znovu otevře', async () => {
    const { app, st } = await makeApp();
    const id = app.actions.addGoal({ title: 'Test', link: { kind: 'manual', target: 10, progress: 0 } });
    app.actions.setGoalProgress(id, 5);
    expect(st().goals[0].doneAt).toBe(0);
    app.actions.updateGoal(id, { link: { kind: 'manual', target: 5, progress: 5 } });
    expect(st().goals[0].doneAt).toBeGreaterThan(0);
    app.actions.updateGoal(id, { link: { kind: 'manual', target: 10, progress: 5 } });
    expect(st().goals[0].doneAt).toBe(0);
  });

  it('úprava názvu splněného cíle ho neotevře', async () => {
    const { app, st } = await makeApp();
    const id = app.actions.addGoal({ title: 'A', link: { kind: 'manual', target: 3, progress: 0 } });
    app.actions.setGoalDone(id, true);
    app.actions.updateGoal(id, { title: 'B' });
    expect(st().goals[0]).toMatchObject({ title: 'B' });
    expect(st().goals[0].doneAt).toBeGreaterThan(0);
  });
});

describe('čísla z textového pole podle jazyka', () => {
  it('angličtina: čárka odděluje tisíce', () => {
    expect(parseNumberInput('125,400', 'en')).toBe(125400);
    expect(parseNumberInput('1,200', 'en')).toBe(1200);
    expect(parseNumberInput('1.5', 'en')).toBe(1.5);
    expect(parseNumberInput(' 7 ', 'en')).toBe(7);
  });
  it('čeština: čárka je desetinná, mezery a tečky v trojicích jsou tisíce', () => {
    expect(parseNumberInput('1,5', 'cs')).toBe(1.5);
    expect(parseNumberInput('125 400', 'cs')).toBe(125400);
    expect(parseNumberInput('125 400', 'cs')).toBe(125400);
    expect(parseNumberInput('1.200', 'cs')).toBe(1200);
    expect(parseNumberInput('12.5', 'cs')).toBe(12.5);
  });
  it('prázdný nebo nesmyslný text není číslo', () => {
    expect(parseNumberInput('', 'cs')).toBeNaN();
    expect(parseNumberInput('abc', 'en')).toBeNaN();
  });
});

describe('hash adresy', () => {
  it('poškozená sekvence nespadne', () => {
    expect(safeDecode('%E0')).toBe('%E0');
    expect(safeDecode('Buried%20City')).toBe('Buried City');
  });
});
