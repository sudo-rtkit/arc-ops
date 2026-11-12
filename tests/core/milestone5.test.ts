/* Milník 5: buddy Ops (podoby, sbírka, šatník, události levelu, animace, rozvržení), schéma 6 a hub
   (výchozí stav vypnuto, zahozený snímek nic nezapíše, zápis ze snímku jen přes hlavní okno). */
import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPS, OPS_SLOTS, collection, emptyBuddy, formForLevel, levelEvent, normalizeBuddy, resolveOutfit, syncBuddy, unlockedUpTo, validHotkey } from '../../src/core/ops';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { Animator } from '../../src/ops/animator';
import { buddyWindow, clampTo } from '../../src/ops/layout';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { hotkeyFrom, hotkeyLabel } from '../../src/ops/hotkey';
import { readCapture } from '../../src/core/opsCapture';
import { analyzeShots, defaultTarget, type VisionApply } from '../../src/core/visionImport';
import { getMaterials } from '../../src/core/gamedata';
import { matchContext } from '../../src/core/catalog';
import { loadFixture, TOOLTIP } from '../vision/load';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const ASSETS = fileURLToPath(new URL('../../src/assets/ops/', import.meta.url));

function storage() {
  const kv = memoryKV();
  const base = createBrowserStorage(kv, () => NOW);
  const saves: string[] = [], snaps: string[] = [];
  const adapter: StorageAdapter = {
    ...base,
    async save(c) { saves.push(c); return base.save(c); },
    async createSnapshot(k, l, c) { snaps.push(k); return base.createSnapshot(k, l, c); },
  };
  return { adapter, saves, snaps };
}
function fakeNative(): Native & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => async (...a: unknown[]) => { calls.push(a.length ? `${name}(${a.map(x => JSON.stringify(x)).join(',')})` : name); };
  return {
    calls, available: true,
    enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'),
    overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'), mainFocus: rec('mainFocus'),
    captureNow: rec('captureNow'), captureTake: async () => new ArrayBuffer(0),
  };
}
async function setup() {
  const st = storage();
  const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  const buses = memoryBuses();
  const native = fakeNative();
  const hub = createOpsHub({ app, bus: buses('main'), native, now: () => NOW, pushMs: 0 });
  hub.start();
  return { app, st, native, hub, overlay: buses('overlay'), buddy: buses('buddy') };
}

describe('Ops: podoby, sbírka a šatník', () => {
  it('manifest: 5 podob po 15 levelech, 16 slotů, každý level 1–75 odemkne díl, všechny PNG jsou v aplikaci', () => {
    expect(OPS.forms.map(f => f.id)).toEqual(['rookie', 'explorer', 'scavenger', 'veteran', 'legend']);
    expect(OPS_SLOTS).toHaveLength(16);
    expect([0, 14, 15, 29, 30, 45, 59, 60, 75].map(l => formForLevel(l).id)).toEqual(['rookie', 'rookie', 'explorer', 'explorer', 'scavenger', 'veteran', 'veteran', 'legend', 'legend']);
    expect(OPS.unlocks[0].unlockedParts).toEqual([]);
    for (let l = 1; l <= 75; l++) expect(OPS.unlocks[l].unlockedParts.length, `level ${l}`).toBeGreaterThan(0);
    expect(unlockedUpTo(75)).toHaveLength(OPS.parts.length);
    const files = new Set([...OPS.forms.flatMap(f => Object.values(f.states).map(s => s.file)), ...OPS.parts.flatMap(p => [p.file, ...Object.values(p.forms ?? {}).map(x => x.file)]), ...OPS.transforms.map(t => t.file), OPS.fx.sparkle.file]);
    for (const f of files) expect(existsSync(ASSETS + f), f).toBe(true);
    for (const f of OPS.forms) for (const [k, s] of Object.entries(f.states)) expect(s.anchors.length, `${f.id}/${k}`).toBe(OPS.states[k].frameCount);
  });

  it('sbírka se jen rozšiřuje: pokles levelu nic neodebere, auto outfit sleduje level', () => {
    const b = emptyBuddy();
    expect(syncBuddy(b, 40)).toBe(true);
    expect(b.unlocked).toEqual(unlockedUpTo(40));
    expect(syncBuddy(b, 5)).toBe(false);
    expect(b.unlocked).toHaveLength(unlockedUpTo(40).length);
    expect(resolveOutfit(5, b)).toEqual(OPS.unlocks[5].defaultOutfit);
    /* ruční volba dílu z vyššího levelu platí i po poklesu; neodemčený díl se ignoruje */
    b.outfit.antenna = 'antenna-3';
    b.outfit.visor = null;
    b.outfit.radio = 'radio-5';
    const o = resolveOutfit(5, b);
    expect(o.antenna).toBe('antenna-3');
    expect(o.visor).toBeNull();
    expect(o.radio).toBe(OPS.unlocks[5].defaultOutfit.radio);
    expect(collection({ unlocked: [] }, 3)).toEqual(unlockedUpTo(3));
  });

  it('události levelu: jiskra s dílem, proměna na hranici podoby, přeskok více podob, pokles nic', () => {
    expect(levelEvent(22, 23)).toEqual({ kind: 'unlock', level: 23, parts: ['shoulders-2'] });
    expect(levelEvent(14, 15)).toMatchObject({ kind: 'transform', from: 'rookie', to: 'explorer', transform: 'rookie-to-explorer' });
    expect(levelEvent(10, 40)).toMatchObject({ kind: 'transform', from: 'rookie', to: 'scavenger', transform: 'explorer-to-scavenger' });
    expect(levelEvent(40, 30)).toBeNull();
    expect(levelEvent(5, 5)).toBeNull();
  });

  it('normalizace: neznámé díly a sloty se zahodí, krytí 70–100, zkratka jen platná', () => {
    const b = normalizeBuddy({ enabled: 'yes', hotkey: 'KeyS', scale: 3, opacity: 20, unlocked: ['antenna-1', 'nic', 'antenna-1'], outfit: { antenna: 'visor-1', visor: null, bogus: 'x', tool: 'tool-2' }, positions: { a: { x: 10, y: 'y' } } });
    expect(b).toMatchObject({ enabled: false, hotkey: '', scale: 1, opacity: 70, unlocked: ['antenna-1'], outfit: { visor: null, tool: 'tool-2' }, positions: { a: { x: 10, y: 0 } } });
    expect(validHotkey('Ctrl+Shift+KeyS')).toBe(true);
    expect(validHotkey('F9')).toBe(true);
    expect(validHotkey('KeyS')).toBe(false);
    expect(validHotkey('Ctrl+Shift+Nonsense')).toBe(false);
    expect(hotkeyLabel('Ctrl+Shift+KeyS')).toBe('Ctrl+Shift+S');
    expect(hotkeyFrom({ ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, code: 'Digit4' })).toBe('Ctrl+Shift+Digit4');
    expect(hotkeyFrom({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: 'ControlLeft' })).toBeNull();
  });
});

describe('Ops: animace a okno', () => {
  it('jednorázový stav se vrátí na klid, proměna skryje výbavu a skončí jiskrou', () => {
    const a = new Animator();
    a.play('done');
    const total = OPS.states.done.durationsMs.reduce((x, y) => x + y, 0);
    for (let t = 0; t < total; t += 50) a.tick(50);
    a.tick(1);
    expect(a.anim).toBe('idle');
    const end = vi.fn();
    a.startTransform('rookie-to-explorer', end);
    expect(a.pose().transform?.index).toBe(0);
    for (let i = 0; i < 10; i++) a.tick(100);
    expect(end).toHaveBeenCalledOnce();
    expect(a.pose()).toMatchObject({ transform: null, anim: 'idle' });
    expect(a.pose().sparkle).not.toBeNull();
    const r = new Animator(); r.reduced = true;
    const end2 = vi.fn();
    r.startTransform('rookie-to-explorer', end2);
    expect(end2).toHaveBeenCalledOnce();
    expect(r.transform).toBeNull();
  });

  it('bublina se vejde na monitor a Ops zůstane na místě', () => {
    const mon = { x: 0, y: 0, w: 1920, h: 1080 };
    const right = buddyWindow({ x: 1800, y: 900 }, 64, mon, { w: 232, h: 52 });
    expect(right).toMatchObject({ right: true, below: false, win: { x: 1632, y: 848, w: 232, h: 116 }, ops: { x: 168, y: 52 } });
    expect(right.win.x + right.ops.x).toBe(1800);
    const top = buddyWindow({ x: 10, y: 10 }, 64, mon, { w: 232, h: 52 });
    expect(top).toMatchObject({ right: false, below: true, win: { x: 10, y: 10 }, ops: { x: 0, y: 0 } });
    expect(clampTo({ x: 5000, y: -40 }, 64, mon)).toEqual({ x: 1856, y: 0 });
  });
});

describe('schéma 6', () => {
  it('výchozí stav má buddyho vypnutého; stav schématu 5 se načte beze ztrát a dostane výchozí hodnoty', () => {
    expect(SCHEMA).toBe(7);
    const d = defaultState(NOW);
    expect(d.buddy).toEqual(emptyBuddy());
    expect(d.buddy.enabled).toBe(false);
    const old = { schema: 5, profile: { level: 33 }, inventory: { 'Metal Parts': 4 }, tierList: { weapons: { S: ['x'] } } };
    const s = normalize(old, NOW);
    expect(s.schema).toBe(7);
    expect(s.inventory).toEqual({ 'Metal Parts': 4 });
    expect(s.buddy).toEqual(emptyBuddy());
    expect(resolveOutfit(s.profile.level, s.buddy)).toEqual(OPS.unlocks[33].defaultOutfit);
  });

  it('záloha nese šatník a sbírku a vrátí je beze změny; import nezapne buddyho ani nezmění zkratku', async () => {
    const s = defaultState(NOW);
    s.profile.level = 20;
    s.buddy = { ...emptyBuddy(), enabled: true, hotkey: 'Ctrl+Shift+KeyS', scale: 2, opacity: 80, unlocked: unlockedUpTo(50), outfit: { antenna: 'antenna-4', cape: null } };
    const p = parseBackup(makeBackup(s, new Date(NOW)), NOW);
    expect('error' in p).toBe(false);
    if ('error' in p) return;
    expect(p.state.buddy).toEqual(s.buddy);

    const st = storage();
    const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    app.actions.setProfile('level', 3);
    expect(await app.actions.importState(p.state, '{}', 'app')).toBe(true);
    const b = app.store.getState().state.buddy;
    expect(b.enabled).toBe(false);
    expect(b.hotkey).toBe('');
    expect(b.scale).toBe(2);
    expect(b.outfit).toEqual({ antenna: 'antenna-4', cape: null });
    expect(b.unlocked).toEqual(expect.arrayContaining(unlockedUpTo(50)));
  });

  it('akce store: sbírka se doplní změnou levelu, šatník přijme jen díl ze sbírky', async () => {
    const st = storage();
    const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    app.actions.setProfile('level', 46);
    expect(app.store.getState().state.buddy.unlocked).toEqual(unlockedUpTo(46));
    app.actions.setProfile('level', 2);
    expect(app.store.getState().state.buddy.unlocked).toEqual(unlockedUpTo(46));
    app.actions.setBuddyOutfit('antenna', 'antenna-4');
    expect(app.store.getState().state.buddy.outfit.antenna).toBe('antenna-4');
    app.actions.setBuddyOutfit('antenna', 'antenna-5');
    expect(app.store.getState().state.buddy.outfit.antenna).toBe('antenna-4');
    app.actions.setBuddyOutfit('antenna', 'auto');
    expect(app.store.getState().state.buddy.outfit).toEqual({});
    app.actions.setBuddy({ hotkey: 'KeyS', opacity: 150 });
    expect(app.store.getState().state.buddy).toMatchObject({ hotkey: '', opacity: 100 });
    app.actions.setBuddyPosition('DISPLAY1@0,0,1920x1080', 1700, 900);
    expect(app.store.getState().state.buddy).toMatchObject({ monitor: 'DISPLAY1@0,0,1920x1080', positions: { 'DISPLAY1@0,0,1920x1080': { x: 1700, y: 900 } } });
  });
});

describe('hub: přepínač, snímek a zápis přes hlavní okno', () => {
  it('výchozí stav vypnuto: žádné okno, zkratka ani hlídání; zapnutí a vypnutí se promítne do Rustu', async () => {
    const { app, native, hub, buddy } = await setup();
    await hub.idle();
    expect(native.calls).toEqual([]);
    const views: unknown[] = [];
    buddy.on('view', v => views.push(v));
    app.actions.setBuddy({ enabled: true });
    await hub.idle();
    expect(native.calls).toEqual(['enable(true)', 'buddyOpen']);
    expect(views).toHaveLength(1);
    app.actions.setBuddy({ autoOpen: true });
    await hub.idle();
    expect(native.calls.slice(2)).toEqual(['watch(true)', 'buddyClose']);
    app.actions.setBuddy({ enabled: false });
    await hub.idle();
    expect(native.calls.at(-1)).toBe('enable(false)');
  });

  it('zkratka se uloží jen po přijetí systémem', async () => {
    const { app, native, hub } = await setup();
    app.actions.setBuddy({ enabled: true });
    expect(await hub.setHotkey('Ctrl+Shift+KeyS')).toBeNull();
    expect(app.store.getState().state.buddy.hotkey).toBe('Ctrl+Shift+KeyS');
    native.setHotkey = async () => { throw new Error('hotkey:taken'); };
    expect(await hub.setHotkey('Ctrl+KeyQ')).toBe('hotkey:taken');
    expect(app.store.getState().state.buddy.hotkey).toBe('Ctrl+Shift+KeyS');
  });

  it('zahozený snímek (bez inventáře) nic nezapíše: stav, úložiště ani dávka se nezmění', async () => {
    const { app, st, hub, buddy } = await setup();
    app.actions.setBuddy({ enabled: true });
    await app.flush();
    const before = app.store.getState().state, saves = st.saves.length, snaps = st.snaps.length;
    const statuses: unknown[] = [];
    buddy.on('status', s => statuses.push(s));
    const w = 640, h = 360, blank = new Uint8Array(w * h * 4).fill(30);
    expect(readCapture({ width: w, height: h, data: blank })).toEqual({ kind: 'empty', reason: 'noInventory' });
    expect(hub.handleCapture({ width: w, height: h, data: blank })).toBe('empty');
    await app.flush();
    expect(app.store.getState().state).toBe(before);
    expect(st.saves.length).toBe(saves);
    expect(st.snaps.length).toBe(snaps);
    expect(hub.batch().shots).toEqual([]);
    expect(statuses).toEqual([{ anim: 'unsure', msg: { key: 'ops.msg.nothing' } }]);
  });

  it('snímek se STASH přijde do dávky; overlay zapíše přes hlavní okno se snímkem stavu, kopie sama neukládá', async () => {
    const { app, st, hub, overlay } = await setup();
    app.actions.setBuddy({ enabled: true });
    const views: { batch: { shots: unknown[] } }[] = [];
    overlay.on('state', v => views.push(v as { batch: { shots: unknown[] } }));
    overlay.send('main', 'hello', { from: 'overlay' });
    expect(views.length).toBeGreaterThan(0);
    expect(hub.handleCapture(loadFixture(TOOLTIP))).toBe('read');
    expect(hub.batch().shots).toHaveLength(1);
    expect(views.at(-1)!.batch.shots).toHaveLength(1);
    /* dávka drží jen čísla, žádná obrazová data */
    expect(JSON.stringify(hub.batch())).not.toMatch(/"data"/);

    /* replika (okno overlaye) bez init: změny se neprovedou a nic se neuloží */
    const replica = storage();
    const copy = createApp(replica.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    copy.store.setState({ state: app.store.getState().state });
    expect(copy.change(s => { s.profile.coins = 1; })).toBe(false);
    await copy.flush();
    expect(replica.saves).toEqual([]);

    const s = app.store.getState().state;
    const mats = getMaterials(s).map(m => m.name);
    const a = analyzeShots(hub.batch().shots.map(x => x.read), s.vision.learned, matchContext(mats, []));
    const rows = a.groups.map(g => ({ group: g, target: defaultTarget(g, mats, s.items), count: g.count ?? 0 })).filter(r => r.target.kind === 'material');
    expect(rows.length).toBeGreaterThan(0);
    const input: VisionApply = { rows, coins: null, zeroMissing: false, canZero: false, profile: a.profile };
    const done = new Promise(res => overlay.on('imported', res));
    overlay.send('main', 'import', { input });
    const res = await done as { summary: { materials: number } };
    expect(res.summary.materials).toBe(new Set(rows.map(r => r.target.kind === 'material' ? r.target.name : '')).size);
    expect(st.snaps).toContain('import');
    const after = app.store.getState().state;
    for (const r of rows) if (r.target.kind === 'material') expect(after.inventory[r.target.name]).toBeGreaterThan(0);
    expect(hub.batch().shots).toEqual([]);
  });

  it('změna levelu pošle buddymu událost (proměna / jiskra)', async () => {
    const { app, buddy } = await setup();
    app.actions.setBuddy({ enabled: true });
    const events: unknown[] = [];
    buddy.on('event', e => events.push(e));
    app.actions.setProfile('level', 14);
    app.actions.setProfile('level', 15);
    expect(events.at(-1)).toMatchObject({ kind: 'transform', to: 'explorer' });
    app.actions.setProfile('level', 16);
    expect(events.at(-1)).toMatchObject({ kind: 'unlock', level: 16, parts: ['antenna-2'] });
  });
});
