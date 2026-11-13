/* Postup ze snímku (0.10.1) v hubu a store: snímek obrazovky postupu se jen přečte (nic nezapíše), zápis jde
   jen z revize přes hlavní okno, jen pro právě zobrazený snímek, a vždy po snímku stavu. */
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { profileScreen, skillScreen } from '../vision/progress-synth';

const NOW = new Date(2026, 10, 12, 8, 0).getTime();

function storage() {
  const kv = memoryKV();
  const base = createBrowserStorage(kv, () => NOW);
  const snaps: string[] = [];
  let fail = false;
  const adapter: StorageAdapter = { ...base, async createSnapshot(k, l, c) { if (fail) throw new Error('disk'); snaps.push(k + ':' + l); return base.createSnapshot(k, l, c); } };
  return { adapter, snaps, failSnapshots: () => { fail = true; } };
}
const native = (): Native => {
  const nop = async () => undefined;
  return { available: true, enable: nop, setHotkey: nop, watch: nop, buddyOpen: nop, buddyClose: nop, buddyReveal: nop, overlayOpen: nop, overlayClose: nop, overlayToggle: nop, mainFocus: nop, captureNow: nop, place: nop, drag: nop, captureTake: async () => new ArrayBuffer(0) };
};
async function setup() {
  const st = storage();
  const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  const buses = memoryBuses();
  const hub = createOpsHub({ app, bus: buses('main'), native: native(), now: () => NOW, pushMs: 0 });
  hub.start();
  app.actions.setBuddy({ enabled: true });
  const overlay = buses('overlay');
  const got: { type: string; p: unknown }[] = [];
  for (const type of ['state', 'status', 'progressImported']) overlay.on(type, p => got.push({ type, p }));
  overlay.send('main', 'hello', { from: 'overlay' });
  return { app, st, hub, overlay, got };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const PROFILE = () => profileScreen({ level: 'LEVEL 20', xp: '2,977/29,000 XP', coins: '58,313' });

describe('hub: obrazovka postupu', () => {
  it('snímek profilu se přečte do vlastního místa a nic nezapíše', async () => {
    const { app, hub, got } = await setup();
    const before = JSON.stringify(app.store.getState().state.profile);
    expect(hub.handleCapture(PROFILE())).toBe('progress');
    const b = hub.batch();
    expect(b.last).toBe('progress');
    expect(b.progress?.read.screen).toBe('profile');
    expect([b.shots.length, b.loot]).toEqual([0, null]);
    expect(JSON.stringify(app.store.getState().state.profile)).toBe(before);
    expect(got.some(x => x.type === 'status' && (x.p as { line?: { line: string } }).line?.line === 'progress.read')).toBe(true);
  });

  it('zápis jen pro zobrazený snímek, po snímku stavu; pak se místo uvolní', async () => {
    const { app, st, hub, overlay, got } = await setup();
    hub.handleCapture(PROFILE());
    const id = hub.batch().progress!.id;
    overlay.send('main', 'progressImport', { shotId: id + 1, input: { profile: { level: 20 } } });
    await tick(); await hub.idle(); await tick();
    expect(app.store.getState().state.profile.level).toBe(1);
    overlay.send('main', 'progressImport', { shotId: id, input: { profile: { level: 20, coins: 58313, evil: 5 } } });
    for (let i = 0; i < 5; i++) await tick();
    expect(app.store.getState().state.profile).toMatchObject({ level: 20, coins: 58313 });
    expect(st.snaps.some(x => x.startsWith('import:'))).toBe(true);
    expect(hub.batch().progress).toBeNull();
    expect(got.filter(x => x.type === 'progressImported').map(x => x.p)).toEqual([{ summary: null }, { summary: { fields: 2 } }]);
  });

  it('zahození snímku postupu nechá ostatní místa', async () => {
    const { hub, overlay } = await setup();
    hub.handleCapture(skillScreen({ name: 'MARATHON RUNNER', current: 5 }));
    expect(hub.batch().progress?.read.screen).toBe('skills');
    overlay.send('main', 'progressClear', null);
    await tick();
    expect(hub.batch()).toMatchObject({ progress: null, last: null });
  });
});

describe('store: importProgress', () => {
  it('bez snímku stavu se nic nezapíše', async () => {
    const st = storage();
    const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    st.failSnapshots();
    expect(await app.actions.importProgress({ profile: { level: 30 } })).toBeNull();
    expect(app.store.getState().state.profile.level).toBe(1);
  });
  it('rank skillu a úroveň stanice; neplatné hodnoty se zahodí', async () => {
    const st = storage();
    const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    expect(await app.actions.importProgress({ skills: { m_marathon: 5, m_spring: 4 }, stations: { gunsmith: 2, gear: 7 } })).toEqual({ fields: 2 });
    const s = app.store.getState().state;
    expect(s.skills.current).toEqual({ m_marathon: 5 });
    expect([s.stations.gunsmith, s.stations.gear]).toEqual([2, 0]);
  });
});

describe('hub: rychlé úpravy z modulů overlaye (milník 6)', () => {
  it('profil, stanice, materiál a skill jdou přes akce store; neznámé operace a hodnoty se zahodí', async () => {
    const { app, overlay } = await setup();
    const edit = async (p: unknown) => { overlay.send('main', 'edit', p); await tick(); };
    await edit({ op: 'profile', field: 'level', value: 33 });
    await edit({ op: 'profile', field: 'expBonus', value: 9 });
    await edit({ op: 'profile', field: 'coins', value: 'x' });
    await edit({ op: 'station', id: 'gunsmith', dir: 1 });
    await edit({ op: 'station', id: 'nope', dir: 1 });
    await edit({ op: 'station', id: 'gear', dir: 5 });
    await edit({ op: 'inv', name: 'Metal Parts', value: 42 });
    await edit({ op: 'inv', name: 'Totally Unknown Thing', value: 3 });
    await edit({ op: 'skill', id: 'm_lungs', dir: 1 });
    await edit({ op: 'skill', id: 'nope', dir: 1 });
    await edit({ op: 'eval', code: 'x' });
    await edit(null);
    const s = app.store.getState().state;
    expect(s.profile).toMatchObject({ level: 33, expBonus: 0, coins: 0 });
    expect([s.stations.gunsmith, s.stations.gear]).toEqual([1, 0]);
    expect(s.inventory['Metal Parts']).toBe(42);
    expect(s.inventory['Totally Unknown Thing']).toBeUndefined();
    expect(s.skills.current).toEqual({ m_lungs: 1 });
  });
  it('s vypnutým buddym overlay nic nezmění', async () => {
    const { app, overlay } = await setup();
    app.actions.setBuddy({ enabled: false });
    overlay.send('main', 'edit', { op: 'profile', field: 'level', value: 40 });
    await tick();
    expect(app.store.getState().state.profile.level).toBe(1);
  });
});
