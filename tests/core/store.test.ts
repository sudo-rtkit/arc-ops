import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { snapshotsToPrune, parseSnapshotName, snapshotName } from '../../src/storage/adapter';
import { defaultState } from '../../src/core/state';
import { parseBackup } from '../../src/core/backup';
import { SAMPLE_V1 } from './sample';

const NOW = new Date(2026, 10, 10, 12, 0).getTime();

function fakeStorage(content: string | null = null) {
  const kv = memoryKV();
  const base = createBrowserStorage(kv, () => NOW);
  if (content !== null) kv.setItem('arcops:state', content);
  let fail = 0;
  const saves: string[] = [];
  const adapter: StorageAdapter = {
    ...base,
    async save(c) { if (fail > 0) { fail--; throw new Error('Disk je plný'); } saves.push(c); return base.save(c); },
  };
  return { adapter, kv, saves, failNext: (n: number) => { fail = n; } };
}

describe('store a ukládání', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('více změn rychle za sebou se uloží jednou', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    app.actions.setProfile('level', 10);
    app.actions.setProfile('coins', 5000);
    app.actions.invAdd('Metal Parts', 3);
    expect(app.store.getState().save).not.toBe('saved');
    await vi.advanceTimersByTimeAsync(600);
    expect(f.saves).toHaveLength(1);
    expect(app.store.getState().save).toBe('saved');
    const saved = JSON.parse(f.saves[0]);
    expect(saved.profile.level).toBe(10);
    expect(saved.inventory['Metal Parts']).toBe(3);
    expect(saved.profileLog).toHaveLength(1);
    expect(saved.profileLog[0]).toMatchObject({ day: '2026-11-10', level: 10, coins: 5000 });
  });

  it('chyba zápisu nastaví error a zápis se zopakuje', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW, retryMs: 1000 });
    await app.init();
    f.failNext(1);
    app.actions.setProfile('level', 33);
    await vi.advanceTimersByTimeAsync(600);
    expect(app.store.getState().save).toBe('error');
    expect(app.store.getState().saveError).toMatch(/plný/);
    expect(app.store.getState().state.profile.level).toBe(33);
    await vi.advanceTimersByTimeAsync(1100);
    expect(app.store.getState().save).toBe('saved');
    expect(JSON.parse(f.saves[0]).profile.level).toBe(33);
  });

  it('init po poškozeném obsahu vrátí výchozí stav s varováním', async () => {
    const f = fakeStorage('{tohle není json');
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    const s = app.store.getState();
    expect(s.ready).toBe(true);
    expect(s.state.profile).toEqual(defaultState(NOW).profile);
    expect(s.load?.warning).toMatch(/nepodařilo/);
    expect(Object.keys(f.kv.dump()).some(k => k.startsWith('arcops:state.corrupt-'))).toBe(true);
  });

  it('při poškozeném stavu načte předchozí zálohu', async () => {
    const f = fakeStorage();
    const good = defaultState(NOW); good.profile.level = 44;
    f.kv.setItem('arcops:state.bak', JSON.stringify(good));
    f.kv.setItem('arcops:state', 'xx');
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    expect(app.store.getState().state.profile.level).toBe(44);
    expect(app.store.getState().load?.source).toBe('bak');
  });

  it('init provede týdenní reset a založí automatický snímek', async () => {
    const s = defaultState(NOW);
    s.trials.week = '2026-W40'; s.trials.stars = [3, 3, 0, 0, 0];
    const f = fakeStorage(JSON.stringify(s));
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    const t = app.store.getState().state.trials;
    expect(t.week).toBe('2026-W46');
    expect(t.stars).toEqual([0, 0, 0, 0, 0]);
    expect(t.history.map(h => h.week)).toEqual(['2026-W40']);
    const snaps = await f.adapter.listSnapshots();
    expect(snaps.filter(x => x.kind === 'auto')).toHaveLength(1);
    expect(app.store.getState().notices.map(n => n.text).join()).toMatch(/historie/);
  });

  it('zápis raidu přidá kolo, mince profilu nemění, smrt dá 0', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    app.actions.setProfile('coins', 1000);
    app.actions.addRaid({ map: 'buried', route: 'galleria', ok: false, coins: 5000, min: 12 });
    const s = app.store.getState().state;
    expect(s.profile.rounds).toBe(1);
    expect(s.profile.coins).toBe(1000);
    expect(s.raids[0]).toMatchObject({ ok: false, coins: 0, type: 'money' });
  });

  it('upgrade odečte materiál, jen zvýšit level neodečte', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    app.actions.invSet('Metal Parts', 25); app.actions.invSet('Rubber Parts', 30);
    expect(app.actions.upgrade('gunsmith')).toBe(true);
    let s = app.store.getState().state;
    expect(s.stations.gunsmith).toBe(1);
    expect(s.inventory).toEqual({ 'Metal Parts': 5 });
    expect(app.actions.upgrade('gunsmith')).toBe(false);
    expect(app.actions.levelUp('gear')).toBe(true);
    s = app.store.getState().state;
    expect(s.stations.gear).toBe(1);
    expect(s.inventory).toEqual({ 'Metal Parts': 5 });
    expect(app.actions.levelUp('outpost')).toBe(false); /* vyžaduje level 18 */
  });

  it('import a reset založí snímek a jdou vrátit obnovou', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    app.actions.setProfile('level', 5);
    const parsed = parseBackup(JSON.stringify(SAMPLE_V1), NOW);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(await app.actions.importState(parsed.state, JSON.stringify(SAMPLE_V1), parsed.kind)).toBe(true);
    expect(app.store.getState().state.profile.level).toBe(23);
    const snaps = await f.adapter.listSnapshots();
    const imp = snaps.find(x => x.kind === 'import')!;
    expect(imp).toBeTruthy();
    expect(Object.keys(f.kv.dump()).some(k => k.startsWith('arcops:import:'))).toBe(true);
    expect(await app.actions.restoreSnapshot(imp.name)).toBe(true);
    expect(app.store.getState().state.profile.level).toBe(5);
    expect(await app.actions.resetAll()).toBe(true);
    expect(app.store.getState().state.profile.level).toBe(1);
    expect((await f.adapter.listSnapshots()).filter(x => x.kind === 'reset')).toHaveLength(1);
  });

  it('plán: další bod a rozdání volných bodů podle plánu', async () => {
    const f = fakeStorage();
    const app = createApp(f.adapter, { now: () => NOW });
    await app.init();
    app.actions.setProfile('level', 9);
    const n = app.actions.planFill();
    expect(n).toBe(10);
    expect(app.actions.planNext()).toBe(false);
  });
});

describe('snímky', () => {
  it('rotace drží 30 automatických a 30 ostatních', async () => {
    let t = 1000;
    const kv = memoryKV();
    const st = createBrowserStorage(kv, () => t++);
    for (let i = 0; i < 40; i++) await st.createSnapshot('auto', 'start', '{}');
    for (let i = 0; i < 35; i++) await st.createSnapshot(i % 2 ? 'manual' : 'import', 'x', '{}');
    const list = await st.listSnapshots();
    expect(list.filter(x => x.kind === 'auto')).toHaveLength(30);
    expect(list.filter(x => x.kind !== 'auto')).toHaveLength(30);
    expect(snapshotsToPrune(list)).toEqual([]);
  });
  it('název snímku nesmí obsahovat cestu', async () => {
    expect(parseSnapshotName('..\\state.json')).toBeNull();
    expect(parseSnapshotName('../1-auto.json')).toBeNull();
    expect(parseSnapshotName(snapshotName(5, 'manual', 'Před úpravou!'))).toMatchObject({ ts: 5, kind: 'manual', label: 'pred upravou' });
    const st = createBrowserStorage(memoryKV());
    await expect(st.readSnapshot('../x')).rejects.toThrow();
  });
});
