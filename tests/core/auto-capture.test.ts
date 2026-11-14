/* 0.20.0: automatické snímání mimo raid. Průběh raidu (stavový automat), návrh záznamu, zápis se snímkem stavu
   a tlačítkem Zpět, fronta „Ke kontrole“, hlavní vypínač napojení na hru, schéma 17 a cesta automatického snímku
   přes hub (umělé obrazovky z veřejného vzoru, žádné vlastní snímky hráče). */
import { describe, expect, it } from 'vitest';
import { IN_RAID_QUIET_MS, LOADOUT_STALE_MS, buildDraft, emptyRaidLife, lifeStep, normalizeRaidLife, packKnown, type LoadoutSnap, type RaidLife } from '../../src/core/raidLife';
import { AUTO_SCREENS, RUST_SCREENS, autoActive, autoIndicator, normalizeAutoCapture, normalizeGameLink, normalizeReview, normalizeReviewEdit, screenBits, unseenWrites } from '../../src/core/autoCapture';
import { SCHEMA, defaultState, normalize } from '../../src/core/state';
import { createApp } from '../../src/store/app';
import { createOpsHub } from '../../src/ops/hub';
import type { Bus } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import type { AppState } from '../../src/core/types';
import type { LootAnalysis } from '../../src/core/visionImport';
import { makeBackup } from '../../src/core/backup';
import { syntheticFindings } from '../vision/findings';

const T0 = Date.UTC(2026, 10, 13, 18, 0);
const snap = (over: Partial<LoadoutSnap> = {}): LoadoutSnap => ({
  at: T0, kind: 'custom', value: 12_000,
  fields: [
    { slot: 'augment', state: 'item', name: 'Combat Mk. 1', qty: 1, conf: 'high' },
    { slot: 'shield', state: 'item', name: 'Light Shield', qty: 1, conf: 'high' },
    { slot: 'weapon1', state: 'item', name: null, qty: 1, conf: 'unknown' },
    { slot: 'weapon2', state: 'empty', name: null, qty: 1, conf: 'high' },
    { slot: 'backpack', state: 'item', name: 'Bandage', qty: 3, conf: 'high' },
  ],
  ...over,
});
const loot = (rows: [string | null, number | null, boolean, 'known' | 'uncertain' | 'unknown'][]): LootAnalysis => ({
  groups: rows.map(([name, count, sure, status], i) => ({
    id: 'g' + i, cells: [{ shot: 0, row: 0, col: i, merged: 0, panel: 'backpack' }], fp: [], rarity: 'common', tier: null,
    count, countSure: sure, match: { status, itemKey: name, kind: 'item', score: status === 'known' ? 0.99 : 0.9, source: 'catalog' },
  })),
  backpack: { slots: rows.length, max: 14, cells: rows.length }, quickUse: null, empty: !rows.length, noBackpack: false,
} as LootAnalysis);

describe('průběh raidu (stavový automat)', () => {
  it('loadout → ticho → v raidu → výsledek spáruje loadout', () => {
    let life: RaidLife = emptyRaidLife();
    life = lifeStep(life, { type: 'loadout', at: T0, loadout: snap() }).life;
    expect(life.phase).toBe('loadout');
    life = lifeStep(life, { type: 'screen', at: T0 + 2_000, screen: null }).life;
    expect(life).toMatchObject({ phase: 'loadout', quietSince: T0 + 2_000 });
    life = lifeStep(life, { type: 'screen', at: T0 + 2_000 + IN_RAID_QUIET_MS, screen: null }).life;
    expect(life.phase).toBe('inRaid');
    const r = lifeStep(life, { type: 'result', at: T0 + 30 * 60_000 });
    expect(r.pair).toEqual({ loadout: snap(), stale: false });
    expect(r.life).toEqual(emptyRaidLife());
  });
  it('dva loadouty po sobě: platí poslední; menu před raidem loadout nezahodí', () => {
    let life = lifeStep(emptyRaidLife(), { type: 'loadout', at: T0, loadout: snap({ value: 1 }) }).life;
    life = lifeStep(life, { type: 'screen', at: T0 + 1, screen: 'stash' }).life;
    expect(life.phase).toBe('loadout');
    life = lifeStep(life, { type: 'loadout', at: T0 + 2, loadout: snap({ value: 2, at: T0 + 2 }) }).life;
    expect(lifeStep(life, { type: 'result', at: T0 + 3 }).pair?.loadout?.value).toBe(2);
  });
  it('výsledek bez loadoutu, starý loadout, menu po raidu bez výsledku a vypnutí snímání', () => {
    expect(lifeStep(emptyRaidLife(), { type: 'result', at: T0 }).pair).toEqual({ loadout: null, stale: false });
    const old = lifeStep(emptyRaidLife(), { type: 'loadout', at: T0, loadout: snap() }).life;
    expect(lifeStep(old, { type: 'result', at: T0 + LOADOUT_STALE_MS + 1 }).pair).toEqual({ loadout: null, stale: true });
    const inRaid: RaidLife = { phase: 'inRaid', loadout: snap(), quietSince: T0 };
    expect(lifeStep(inRaid, { type: 'screen', at: T0 + 1, screen: 'profile' }).life).toEqual(emptyRaidLife());
    expect(lifeStep(inRaid, { type: 'disable', at: T0 + 1 }).life).toEqual(emptyRaidLife());
    /* nečinný stav na obrazovky nereaguje */
    expect(lifeStep(emptyRaidLife(), { type: 'screen', at: T0, screen: null }).life).toEqual(emptyRaidLife());
  });
  /* 0.22.1: inventář v raidu (signál z Rustu) posune loadout rovnou do „v raidu“; jinak nic nemění */
  it('inventář v raidu: po loadoutu hned v raidu, bez loadoutu ani v raidu nic', () => {
    const lo = lifeStep(emptyRaidLife(), { type: 'loadout', at: T0, loadout: snap() }).life;
    const r = lifeStep(lo, { type: 'inRaid', at: T0 + 5_000 });
    expect(r.life).toEqual({ phase: 'inRaid', loadout: snap(), quietSince: T0 + 5_000 });
    expect(r.pair).toBeUndefined();
    expect(lifeStep(r.life, { type: 'inRaid', at: T0 + 9_000 }).life).toEqual(r.life);
    expect(lifeStep(emptyRaidLife(), { type: 'inRaid', at: T0 }).life).toEqual(emptyRaidLife());
    /* výsledek pak spáruje loadout */
    expect(lifeStep(r.life, { type: 'result', at: T0 + 20 * 60_000 }).pair).toEqual({ loadout: snap(), stale: false });
  });
  it('restart: uložený průběh se načte a nesmysl se zahodí', () => {
    const life: RaidLife = { phase: 'inRaid', loadout: snap(), quietSince: T0 };
    expect(normalizeRaidLife(JSON.parse(JSON.stringify(life)))).toEqual(life);
    expect(normalizeRaidLife({ phase: 'inRaid' })).toEqual(emptyRaidLife());
    expect(normalizeRaidLife({ phase: 'hack', loadout: snap() })).toEqual(emptyRaidLife());
    expect(normalizeRaidLife(null)).toEqual(emptyRaidLife());
  });
});

describe('návrh záznamu raidu', () => {
  const base = (): AppState => {
    const s = defaultState(T0);
    s.raids.push({ ...normalize({ raids: [{ id: 'R0', map: 'buried', ts: T0 - 1e6 }] }).raids[0] });
    return s;
  };
  it('přežil: mapa z aktivního plánu, jistý loot minus výbava, nejistý řádek ke kontrole, neznámá zbraň ke kontrole', () => {
    const s = base();
    s.raidPlan = { goals: { quests: [], stations: [], projects: [], money: true }, map: 'spaceport', loadout: '', route: '', startedAt: T0 - 10, sig: '', found: [], snap: null, open: [] };
    const d = buildDraft(s, { at: T0, outcome: 'survived', sig: null, loot: loot([['Bandage', 5, true, 'known'], ['Battery', 2, true, 'known'], [null, 1, false, 'unknown']]) }, { loadout: snap() });
    expect(d.raid).toMatchObject({ map: 'spaceport', type: 'money', ok: true, coins: 0, lost: [] });
    expect(d.raid.gear).toEqual([{ name: 'Combat Mk. 1', qty: 1 }, { name: 'Light Shield', qty: 1 }, { name: 'Bandage', qty: 3 }]);
    expect(d.raid.loot).toEqual([{ name: 'Bandage', qty: 2 }, { name: 'Battery', qty: 2 }]);
    expect(d.items).toBe(2);
    expect(d.review.map(r => r.kind)).toEqual(['loadout', 'loot']);
    expect(d.review[0].slots).toEqual(['weapon1']);
    expect(d.review[1].rows).toEqual([{ guess: '', qty: 1, score: 0.9 }]);
    expect(d.raid.auto).toMatchObject({ survived: true, value: 12_000, lostValue: null, kind: 'custom', unsure: ['loadout', 'loot'] });
  });
  it('bez plánu je mapa ke kontrole; bez loadoutu jde celý loot do kontroly', () => {
    const d = buildDraft(base(), { at: T0, outcome: 'survived', sig: null, loot: loot([['Bandage', 5, true, 'known']]) }, { loadout: null });
    expect(d.raid.map).toBe('buried');
    expect(d.raid.loot).toEqual([]);
    expect(d.review.map(r => r.kind)).toEqual(['map', 'loadout', 'loot']);
    expect(d.review[2].rows).toEqual([{ guess: 'Bandage', qty: 5, score: 0.99 }]);
  });
  it('volný loadout: batoh vylosuje hra, loot nejde oddělit (kontrola)', () => {
    const free = snap({ kind: 'free', fields: [{ slot: 'backpack', state: 'random', name: null, qty: 1, conf: 'high' }] });
    expect(packKnown(free)).toBe(false);
    const d = buildDraft(base(), { at: T0, outcome: 'survived', sig: null, loot: loot([['Bandage', 5, true, 'known']]) }, { loadout: free });
    expect(d.raid.loot).toEqual([]);
    expect(d.review.some(r => r.kind === 'loot')).toBe(true);
  });
  it('knocked out: výbava ztracena, hodnota ztraceného loadoutu, žádný loot', () => {
    const d = buildDraft(base(), { at: T0, outcome: 'knockedOut', sig: null, loot: null }, { loadout: snap() });
    expect(d.raid).toMatchObject({ ok: false, loot: [], lost: [{ name: 'Combat Mk. 1', qty: 1 }, { name: 'Light Shield', qty: 1 }, { name: 'Bandage', qty: 3 }] });
    expect(d.raid.auto).toMatchObject({ survived: false, lostValue: 12_000 });
  });
});

describe('nastavení, fronta a schéma 17', () => {
  it('maska obrazovek pro Rust a stav ukazatele', () => {
    const s = defaultState(T0);
    expect(RUST_SCREENS.length).toBe(8);
    expect(screenBits(s.autoCapture.screens)).toBe(0b111);
    expect(screenBits(Object.fromEntries(AUTO_SCREENS.map(k => [k, true])) as never)).toBe(0xff);
    expect(autoIndicator(s)).toBeNull();
    s.buddy.enabled = true; s.autoCapture.enabled = true;
    expect(autoActive(s)).toBe(true);
    expect(autoIndicator(s)).toBe('on');
    s.autoCapture.paused = true;
    expect([autoActive(s), autoIndicator(s)]).toEqual([false, 'paused']);
    s.gameLink.off = true;
    expect(autoIndicator(s)).toBeNull();
  });
  it('normalizace: jen známé hodnoty, fronta jen k existujícím raidům', () => {
    expect(normalizeAutoCapture({ enabled: true, screens: { stash: true, bogus: true }, paused: 1 })).toMatchObject({ enabled: true, paused: false, screens: { stash: true, loadout: true } });
    expect(normalizeGameLink({ off: true, saved: { autoOpen: true, hotkey: 'Ctrl+Shift+KeyS', auto: 'yes' } })).toEqual({ off: true, saved: { autoOpen: true, hotkey: 'Ctrl+Shift+KeyS', auto: false } });
    expect(normalizeReview([{ kind: 'loot', raidId: 'R1', rows: [{ guess: 'X', qty: 0, score: 3 }] }, { kind: 'screen', screen: 'nope' }, { kind: 'map' }])).toEqual([
      expect.objectContaining({ kind: 'loot', raidId: 'R1', rows: [{ guess: 'X', qty: 1, score: 1 }] }),
    ]);
    expect(normalizeReviewEdit({ id: 'a', kind: 'loot', rows: [{ name: ' X ', qty: 2 }, { name: '', qty: 1 }] })).toEqual({ id: 'a', kind: 'loot', rows: [{ name: 'X', qty: 2 }] });
    expect(normalizeReviewEdit({ id: 'a', kind: 'evil' })).toBeNull();
    const n = normalize({ schema: 17, raids: [{ id: 'R1' }], review: [{ id: 'q1', kind: 'map', raidId: 'R1' }, { id: 'q2', kind: 'map', raidId: 'gone' }], autoLog: [{ id: 'w', raidId: 'gone' }] });
    expect(SCHEMA).toBe(19);
    expect(n.schema).toBe(19);
    expect(n.review.map(x => x.id)).toEqual(['q1']);
    expect(n.autoLog).toEqual([]);
    expect(normalize({ schema: 16 })).toMatchObject({ autoCapture: { enabled: false }, gameLink: { off: false, saved: null }, review: [], autoLog: [] });
  });
});

describe('store: automatický zápis, Zpět, fronta a hlavní vypínač', () => {
  it('zápis se snímkem stavu, záznam pro Zpět a fronta; stejný snímek podruhé ne; Zpět vše vrátí', async () => {
    const { app, snaps } = await makeApp();
    const rounds = app.store.getState().state.profile.rounds;
    const cap = { at: T0, outcome: 'survived' as const, sig: 'L0123456789abcdef', loot: loot([['Bandage', 5, true, 'known'], ['Nope', 1, false, 'uncertain']]) };
    const res = await app.actions.autoRaid(cap, { loadout: snap(), stale: false });
    expect(res).not.toBeNull();
    expect(snaps).toEqual(['pred automatickym zapisem']);
    let s = app.store.getState().state;
    const raid = s.raids.find(r => r.id === res!.raidId)!;
    expect(raid).toMatchObject({ ok: true, loot: [{ name: 'Bandage', qty: 2 }], lootScan: { sig: cap.sig } });
    expect(s.profile.rounds).toBe(rounds + 1);
    expect(s.review.map(r => r.kind)).toEqual(['map', 'loadout', 'loot']);
    expect(unseenWrites(s.autoLog)).toEqual([expect.objectContaining({ id: res!.writeId, items: 1, review: 3, survived: true })]);
    /* stejný snímek výsledku podruhé nic nezapíše */
    expect(await app.actions.autoRaid(cap, null)).toBeNull();
    /* fronta najednou: mapa, loot a loadout */
    const [qMap, qLo, qLoot] = s.review;
    expect(app.actions.reviewApply([
      { id: qMap.id, kind: 'map', map: 'dam' }, { id: qLoot.id, kind: 'loot', rows: [{ name: 'Fabric', qty: 4 }] }, { id: qLo.id, kind: 'dismiss' }, { id: 'x', kind: 'map', map: 'dam' },
    ])).toBe(3);
    s = app.store.getState().state;
    expect(s.review).toEqual([]);
    expect(s.raids.find(r => r.id === res!.raidId)).toMatchObject({ map: 'dam', loot: [{ name: 'Bandage', qty: 2 }, { name: 'Fabric', qty: 4 }], auto: { unsure: [] } });
    /* Zpět: záznam pryč, kolo zpět, upozornění vyřízené */
    expect(app.actions.autoUndo(res!.writeId)).toBe(true);
    s = app.store.getState().state;
    expect(s.raids.some(r => r.id === res!.raidId)).toBe(false);
    expect(s.profile.rounds).toBe(rounds);
    expect(unseenWrites(s.autoLog)).toEqual([]);
    expect(app.actions.autoUndo(res!.writeId)).toBe(false);
  });
  it('upozornění „viděno“ a fronta snímků obrazovky (novější téže obrazovky nahradí starší)', async () => {
    const { app } = await makeApp();
    await app.actions.autoRaid({ at: T0, outcome: 'knockedOut', sig: null, loot: null }, null);
    expect(unseenWrites(app.store.getState().state.autoLog).length).toBe(1);
    app.actions.autoSeen();
    expect(unseenWrites(app.store.getState().state.autoLog)).toEqual([]);
    app.actions.reviewAddScreen('stash');
    app.actions.reviewAddScreen('stash');
    app.actions.reviewAddScreen('profile');
    expect(app.store.getState().state.review.filter(r => r.kind === 'screen').map(r => r.screen)).toEqual(['stash', 'profile']);
  });
  it('hlavní vypínač vypne buddyho nad hrou, zkratku i snímání a obnoví předchozí stav', async () => {
    const { app } = await makeApp();
    app.actions.setBuddy({ enabled: true, autoOpen: true, hotkey: 'Ctrl+Shift+KeyS' });
    app.actions.setAutoCapture({ ack: true, enabled: true });
    app.actions.lifeEvent({ type: 'loadout', at: T0, loadout: snap() });
    expect(app.actions.setGameLinkOff(true)).toBe(true);
    let s = app.store.getState().state;
    expect(s.buddy).toMatchObject({ enabled: true, autoOpen: false, hotkey: '' });
    expect(s.autoCapture.enabled).toBe(false);
    expect(s.raidLife).toEqual(emptyRaidLife());
    expect(s.gameLink).toEqual({ off: true, saved: { autoOpen: true, hotkey: 'Ctrl+Shift+KeyS', auto: true } });
    /* při vypnutém napojení nejde nic z toho zapnout */
    app.actions.setBuddy({ autoOpen: true, hotkey: 'Ctrl+Shift+KeyX' });
    expect(app.actions.setAutoCapture({ enabled: true })).toBe(false);
    s = app.store.getState().state;
    expect([s.buddy.autoOpen, s.buddy.hotkey, s.autoCapture.enabled]).toEqual([false, '', false]);
    expect(app.actions.setGameLinkOff(false)).toBe(true);
    s = app.store.getState().state;
    expect(s.buddy).toMatchObject({ autoOpen: true, hotkey: 'Ctrl+Shift+KeyS' });
    expect(s.autoCapture.enabled).toBe(true);
    expect(s.gameLink).toEqual({ off: false, saved: null });
  });
  it('import zálohy: snímání, vypínač, průběh a fronta tohoto počítače zůstanou (fronta jen k existujícím raidům)', async () => {
    const { app } = await makeApp();
    app.actions.setBuddy({ enabled: true });
    app.actions.setAutoCapture({ ack: true, enabled: true, screens: { stash: true } });
    const res = await app.actions.autoRaid({ at: T0, outcome: 'knockedOut', sig: null, loot: null }, { loadout: snap(), stale: false });
    app.actions.reviewAddScreen('stash');
    const other = defaultState(T0);
    other.autoCapture.screens.stash = false;
    other.gameLink.off = true;
    other.raids = app.store.getState().state.raids.filter(r => r.id === res!.raidId);
    const file = makeBackup(other, new Date(T0));
    expect(await app.actions.importState(normalize(JSON.parse(JSON.stringify(file)).state), JSON.stringify(file), 'app')).toBe(true);
    const s = app.store.getState().state;
    expect(s.autoCapture).toMatchObject({ enabled: true, screens: { stash: true } });
    expect(s.gameLink.off).toBe(false);
    expect(s.review.some(r => r.kind === 'screen')).toBe(true);
    expect(s.review.filter(r => r.raidId).every(r => r.raidId === res!.raidId)).toBe(true);
  });
});

describe('hub: automatický snímek → průběh raidu → zápis do Deníku', () => {
  it('loadout (jen quick use) a výsledek FINDINGS: loot minus výbava, podpis proti opakování; restart uprostřed raidu', async () => {
    const storage = memStorage();
    const { app } = await makeApp(storage);
    app.actions.setBuddy({ enabled: true });
    app.actions.setAutoCapture({ ack: true, enabled: true });
    const hub = createOpsHub({ app, bus: nullBus(), native: fakeNative(), now: () => T0, pushMs: 0 });
    hub.start();
    expect(await hub.handleAutoCapture(syntheticFindings({ skip: [0, 1, 2, 3, 4, 5, 6] }), 'loadout')).toBe('loadout');
    const life = app.store.getState().state.raidLife;
    expect(life.phase).toBe('loadout');
    expect(life.loadout!.fields.filter(f => f.state === 'item').map(f => `${f.name} ${f.qty}`)).toEqual(['Shotgun Ammo 3', 'Launcher Ammo 6']);
    await app.flush();
    hub.stop();
    /* restart aplikace uprostřed raidu: průběh je uložený */
    const { app: app2 } = await makeApp(storage);
    expect(app2.store.getState().state.raidLife.phase).toBe('loadout');
    const hub2 = createOpsHub({ app: app2, bus: nullBus(), native: fakeNative(), now: () => T0 + 20 * 60_000, pushMs: 0 });
    hub2.start();
    expect(await hub2.handleAutoCapture(syntheticFindings(), 'findings')).toBe('result');
    const s = app2.store.getState().state;
    const raid = s.raids[s.raids.length - 1];
    expect(raid.ok).toBe(true);
    expect(raid.gear).toEqual([{ name: 'Shotgun Ammo', qty: 3 }, { name: 'Launcher Ammo', qty: 6 }]);
    expect(raid.loot).toEqual([{ name: 'Launcher Ammo', qty: 6 }, { name: 'Light Ammo', qty: 156 }, { name: 'Medium Ammo', qty: 179 }, { name: 'Shotgun Ammo', qty: 3 }]);
    expect(raid.lootScan?.sig).toMatch(/^L[0-9a-f]{16}$/);
    expect(raid.auto?.unsure).toEqual(['map']);
    expect(s.raidLife.phase).toBe('idle');
    /* tentýž výsledek znovu: nic */
    expect(await hub2.handleAutoCapture(syntheticFindings(), 'findings')).toBe('dup');
    expect(app2.store.getState().state.raids.length).toBe(s.raids.length);
    /* KNOCKED OUT bez loadoutu: výbava neznámá, ke kontrole */
    expect(await hub2.handleAutoCapture(syntheticFindings({ button: true }), 'knockedOut')).toBe('result');
    const ko = app2.store.getState().state.raids.at(-1)!;
    expect(ko).toMatchObject({ ok: false, loot: [], lost: [] });
    expect(app2.store.getState().state.review.filter(r => r.raidId === ko.id).map(r => r.kind)).toEqual(['map', 'loadout']);
    /* obrazovka STASH bez stashe na snímku nic nepřidá */
    expect(await hub2.handleAutoCapture(syntheticFindings({ button: false }), 'stash')).toBe('empty');
    hub2.stop();
  });
});

/* ----- zástupci ----- */
function memStorage() {
  const box = { content: null as string | null, snaps: [] as string[] };
  return box;
}
async function makeApp(box = memStorage()) {
  const storage = {
    kind: 'browser' as const,
    load: async () => ({ content: box.content, source: box.content ? 'state' as const : 'none' as const, warning: null }),
    save: async (c: string) => { box.content = c; },
    createSnapshot: async (_k: string, label: string) => { box.snaps.push(label); },
    listSnapshots: async () => [], readSnapshot: async () => '', deleteSnapshot: async () => undefined, saveImportRaw: async () => undefined,
    exportBackup: async () => true, importBackup: async () => null, dataDir: async () => '', openDataDir: async () => undefined, openExternal: async () => undefined,
  } as unknown as Parameters<typeof createApp>[0];
  box.snaps.length = 0;
  const app = createApp(storage, { debounceMs: 0, weekCheckMs: 0, now: () => T0 });
  await app.init();
  return { app, snaps: box.snaps };
}
function fakeNative(): Native {
  const ok = async () => undefined;
  return {
    available: true, enable: ok, setHotkey: ok, watch: ok, buddyOpen: ok, buddyClose: ok, buddyReveal: ok, overlayOpen: ok, overlayClose: ok, overlayToggle: ok,
    mainFocus: ok, captureNow: ok, place: ok, drag: ok, widgetsOpen: ok, widgetsClose: ok, widgetsEdit: ok, widgetsFit: ok, widgetsApp: ok, passThrough: ok, captureTake: async () => new ArrayBuffer(0), autoCapture: ok, autoStats: async () => null,
  };
}
function nullBus(): Bus {
  return { label: 'main', send: () => undefined, on: () => () => undefined, onNative: () => () => undefined, ready: async () => undefined };
}
