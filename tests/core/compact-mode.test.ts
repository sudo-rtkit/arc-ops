/* 0.9.0: kompaktní režim hlavního okna. Pravidla režimu a připnutí, chování křížku (zeptat se / zapamatovat /
   změna v Nastavení), migrace schématu 6 → 7, záloha a import bez změny nastavení okna tohoto počítače,
   výběr dat kompaktu a snímek z tlačítka okna přes stávající cestu buddyho. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import {
  closeDecision, emptyMainWindow, nativeOnTop, normalizeMainWindow, rememberClose, setPin, switchMode, windowShortcut, withGeometry, MODE_KEY,
} from '../../src/core/mainWindow';
import { activeQuests, compactShopping, isFreshProfile, nextUpgrade, rarityOf } from '../../src/core/compact';
import { createWindowCtl, type WinNative } from '../../src/shell/windowCore';
import { QUESTS, questStatus } from '../../src/core/quests';
import { STATIONS } from '../../src/core/data/stations';
import { nextNeeds, readiness, shopping } from '../../src/core/workshop';
import { stationTargets } from '../../src/core/planner';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import type { MainWindowPrefs } from '../../src/core/types';

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const MINS = Object.fromEntries(STATIONS.map(s => [s.id, s.min]));

async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}

/* Zástupné okno: zaznamená volání, geometrie podle režimu. */
function fakeWin(): WinNative & { calls: string[]; onTop: boolean; cur: 'full' | 'compact' } {
  const calls: string[] = [];
  const w = {
    calls, onTop: false, cur: 'full' as 'full' | 'compact', available: true,
    async mode(a: { mode: 'full' | 'compact'; pin: boolean }) {
      calls.push('mode:' + a.mode);
      const left = { mode: w.cur, rect: w.cur === 'full' ? { x: 10, y: 20, w: 1440, h: 900 } : { x: 900, y: 40, w: 420, h: 720 }, max: false };
      w.cur = a.mode; w.onTop = a.mode === 'compact' && a.pin;
      return left;
    },
    async pin(on: boolean) { calls.push('pin:' + on); w.onTop = w.cur === 'compact' && on; },
    async geometry() { return { mode: w.cur, rect: { x: 5, y: 6, w: 430, h: 700 }, max: false }; },
    drag: async () => { calls.push('drag'); }, minimize: async () => { calls.push('minimize'); }, hide: async () => { calls.push('hide'); },
    show: async () => { calls.push('show'); }, ready: async () => { calls.push('ready'); }, quit: async () => { calls.push('quit'); },
    traySync: async () => { calls.push('tray'); },
  };
  return w;
}
function ctlFor(prefs: MainWindowPrefs) {
  let p = prefs;
  const win = fakeWin();
  const asked: boolean[] = [];
  const flushes: string[] = [];
  const ctl = createWindowCtl({ win, prefs: () => p, save: n => { p = n; }, flush: async () => { flushes.push('flush'); win.calls.push('flush'); }, askClose: o => asked.push(o) });
  return { ctl, win, asked, flushes, prefs: () => p };
}

describe('pravidla okna: režim a připnutí', () => {
  it('výchozí okno je plné, nepřipnuté, křížek se zeptá, 3 úkoly', () => {
    expect(emptyMainWindow()).toEqual({ mode: 'full', pin: false, full: null, fullMax: false, compact: null, close: 'ask', quests: 3, collapsed: {} });
    expect(defaultState().mainWindow).toEqual(emptyMainWindow());
  });

  it('normalizace ořízne nesmysly', () => {
    const m = normalizeMainWindow({ mode: 'x', pin: 'ano', full: { x: 1, y: 2, w: 50, h: 50 }, compact: { x: 1.4, y: 2, w: 420, h: 720 }, close: 'boom', quests: 99, collapsed: { quests: true, nic: true, shop: 1 } });
    expect(m).toEqual({ mode: 'full', pin: false, full: null, fullMax: false, compact: { x: 1, y: 2, w: 420, h: 720 }, close: 'ask', quests: 5, collapsed: { quests: true } });
    expect(normalizeMainWindow({ quests: 0 }).quests).toBe(1);
    expect(normalizeMainWindow({ mode: 'compact', pin: true, close: 'tray' })).toMatchObject({ mode: 'compact', pin: true, close: 'tray' });
  });

  it('připnutí jen v kompaktu; v plném režimu nativně vypnuté, návrat do kompaktu obnoví poslední volbu', () => {
    let p = emptyMainWindow();
    expect(setPin(p, true)).toBe(p); /* v plném režimu se nic nezmění */
    p = switchMode(p, 'compact');
    expect(nativeOnTop(p)).toBe(false); /* výchozí stav vypnuto */
    p = setPin(p, true);
    expect(nativeOnTop(p)).toBe(true);
    p = switchMode(p, 'full');
    expect(p.pin).toBe(true);
    expect(nativeOnTop(p)).toBe(false);
    p = switchMode(p, 'compact');
    expect(nativeOnTop(p)).toBe(true);
  });

  it('geometrie se pamatuje zvlášť pro každý režim; maximalizace plného okna nepřepíše obnovenou velikost', () => {
    let p = switchMode(emptyMainWindow(), 'compact', { mode: 'full', rect: { x: 10, y: 20, w: 1440, h: 900 }, max: false });
    expect(p.full).toEqual({ x: 10, y: 20, w: 1440, h: 900 });
    p = switchMode(p, 'full', { mode: 'compact', rect: { x: 900, y: 40, w: 420, h: 720 }, max: false });
    expect(p.compact).toEqual({ x: 900, y: 40, w: 420, h: 720 });
    p = withGeometry(p, { mode: 'full', rect: { x: -8, y: -8, w: 2576, h: 1400 }, max: true });
    expect(p.full).toEqual({ x: 10, y: 20, w: 1440, h: 900 });
    expect(p.fullMax).toBe(true);
    /* minimalizované okno geometrii nedodá: zůstane poslední známá */
    expect(withGeometry(p, { mode: 'compact', rect: null, max: false }).compact).toEqual(p.compact);
  });

  it('místní zkratky Ctrl+Shift+M / P; globální zkratka buddyho má přednost', () => {
    const ev = (code: string, o: Partial<KeyboardEvent> = {}) => ({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code, ...o });
    expect(windowShortcut(ev('KeyM'))).toBe('mode');
    expect(windowShortcut(ev('KeyP'))).toBe('pin');
    expect(windowShortcut(ev('KeyM', { altKey: true }))).toBe(null);
    expect(windowShortcut(ev('KeyS'))).toBe(null);
    expect(windowShortcut(ev('KeyM'), MODE_KEY)).toBe(null);
  });
});

describe('křížek: zeptat se, zapamatovat, změna v Nastavení', () => {
  it('bez zapamatování se ptá pokaždé', () => {
    let p = emptyMainWindow();
    expect(closeDecision(p)).toBe('ask');
    p = rememberClose(p, 'tray', false);
    expect(closeDecision(p)).toBe('ask');
    p = rememberClose(p, 'quit', true);
    expect(closeDecision(p)).toBe('quit');
  });

  it('řadič: první zavření otevře dialog; volba s zapamatováním pak platí potichu', async () => {
    const c = ctlFor(emptyMainWindow());
    expect(await c.ctl.requestClose()).toBe('ask');
    expect(c.asked).toEqual([true]);
    expect(c.win.calls).toEqual([]);
    await c.ctl.chooseClose('tray', true);
    expect(c.asked).toEqual([true, false]);
    expect(c.prefs().close).toBe('tray');
    /* nejdřív uložit (geometrie + flush), pak skrýt; aplikace běží dál */
    expect(c.win.calls).toEqual(['flush', 'hide']);
    expect(c.prefs().full).toEqual({ x: 5, y: 6, w: 430, h: 700 });
    c.win.calls.length = 0;
    expect(await c.ctl.requestClose(true)).toBe('tray');
    expect(c.asked).toEqual([true, false]);
    expect(c.win.calls).toEqual(['flush', 'hide']);
  });

  it('řadič: volba bez zapamatování se provede, ale příště se zeptá znovu', async () => {
    const c = ctlFor(emptyMainWindow());
    await c.ctl.chooseClose('quit', false);
    expect(c.win.calls).toEqual(['flush', 'quit']);
    expect(c.prefs().close).toBe('ask');
  });

  it('zavření ze systému (minimalizované okno) okno pro dialog ukáže', async () => {
    const c = ctlFor(emptyMainWindow());
    await c.ctl.requestClose(true);
    expect(c.win.calls).toEqual(['show']);
    expect(c.asked).toEqual([true]);
  });

  it('store: změna v Nastavení jde kdykoli, i zpět na „zeptat se“', async () => {
    const app = await makeApp();
    app.actions.setCloseAction('quit');
    expect(app.store.getState().state.mainWindow.close).toBe('quit');
    app.actions.setCloseAction('ask');
    expect(app.store.getState().state.mainWindow.close).toBe('ask');
    app.actions.setCloseAction('nesmysl' as 'ask');
    expect(app.store.getState().state.mainWindow.close).toBe('ask');
  });
});

describe('řadič režimu okna', () => {
  it('přepnutí uloží geometrii opouštěného režimu a předá Rustu připnutí kompaktu', async () => {
    const c = ctlFor({ ...emptyMainWindow(), pin: true });
    await c.ctl.setMode('compact');
    expect(c.win.calls).toEqual(['mode:compact']);
    expect(c.prefs().mode).toBe('compact');
    expect(c.prefs().full).toEqual({ x: 10, y: 20, w: 1440, h: 900 });
    expect(c.win.onTop).toBe(true);
    await c.ctl.setMode('full');
    expect(c.win.onTop).toBe(false);
    expect(c.prefs().compact).toEqual({ x: 900, y: 40, w: 420, h: 720 });
    expect(c.prefs().pin).toBe(true);
    await c.ctl.setMode('full');
    expect(c.win.calls).toEqual(['mode:compact', 'mode:full']);
    expect(c.ctl.justSwitched()).toBe(true);
  });

  it('připnutí v plném režimu nic nedělá; v kompaktu přepíná nativně', async () => {
    const c = ctlFor(emptyMainWindow());
    await c.ctl.togglePin();
    expect(c.win.calls).toEqual([]);
    await c.ctl.toggleMode();
    await c.ctl.togglePin();
    expect(c.win.calls).toEqual(['mode:compact', 'pin:true']);
    expect(c.prefs().pin).toBe(true);
    expect(c.win.onTop).toBe(true);
  });

  it('store: stav okna přes akce, sbalené sekce a počet úkolů', async () => {
    const app = await makeApp();
    const a = app.actions, mw = () => app.store.getState().state.mainWindow;
    a.setMainWindow(switchMode(mw(), 'compact'));
    expect(mw().mode).toBe('compact');
    a.setCompactCollapsed('shop', true);
    expect(mw().collapsed).toEqual({ shop: true });
    a.setCompactCollapsed('shop', false);
    expect(mw().collapsed).toEqual({});
    a.setCompactQuests(9);
    expect(mw().quests).toBe(5);
  });
});

describe('schéma 7: migrace a záloha', () => {
  it('stav schématu 6 se načte beze ztrát a dostane výchozí okno a prázdné připnutí', () => {
    expect(SCHEMA).toBe(18);
    const old = { schema: 6, profile: { level: 30, coins: 1234 }, inventory: { 'Metal Parts': 4 }, quests: { done: { ss1: 5 } }, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' } };
    const s = normalize(old, NOW);
    expect(s.schema).toBe(18);
    expect(s.mainWindow).toEqual(emptyMainWindow());
    expect(s.quests).toEqual({ done: { ss1: 5 }, pinned: [], objectives: {} });
    expect(s.profile).toMatchObject({ level: 30, coins: 1234 });
    expect(s.inventory).toEqual({ 'Metal Parts': 4 });
    expect(s.buddy).toMatchObject({ enabled: true, hotkey: 'Ctrl+Shift+KeyS' });
  });

  it('záloha schématu 6 se načte; záloha schématu 7 nese okno i připnuté úkoly', () => {
    const p6 = parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 6, exportedAt: 'x', state: { schema: 6, profile: { level: 12 } } }), NOW);
    expect('error' in p6).toBe(false);
    if ('error' in p6) return;
    expect(p6.state.mainWindow).toEqual(emptyMainWindow());
    const s = defaultState(NOW);
    s.mainWindow = { ...emptyMainWindow(), mode: 'compact', pin: true, close: 'tray', quests: 4 };
    s.quests.pinned = ['ss1'];
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(18);
    expect(file.state.mainWindow).toMatchObject({ mode: 'compact', pin: true, close: 'tray', quests: 4 });
    expect(file.state.quests.pinned).toEqual(['ss1']);
  });

  it('import zálohy nezmění nastavení okna tohoto počítače (stejně jako polohy buddyho a zkratku)', async () => {
    const here = { ...emptyMainWindow(), mode: 'compact' as const, pin: true, close: 'quit' as const, compact: { x: 1, y: 2, w: 420, h: 720 }, quests: 2 };
    const app = await makeApp({ schema: 7, mainWindow: here, profile: { level: 3 } });
    const other = defaultState(NOW);
    other.profile.level = 44;
    other.quests.pinned = [QUESTS[0].id];
    other.mainWindow = { ...emptyMainWindow(), mode: 'full', close: 'tray', quests: 5, full: { x: 0, y: 0, w: 1440, h: 900 }, collapsed: { quests: true } };
    const p = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(await app.actions.importState(p.state, '{}', 'app')).toBe(true);
    const s = app.store.getState().state;
    expect(s.profile.level).toBe(44);
    expect(s.quests.pinned).toEqual([QUESTS[0].id]); /* připnuté úkoly jsou data, přijdou ze zálohy */
    expect(s.mainWindow).toEqual(normalizeMainWindow(here));
  });

  it('obnova snímku ani reset nezmění okno', async () => {
    const here = { ...emptyMainWindow(), mode: 'compact' as const, close: 'tray' as const };
    const app = await makeApp({ schema: 7, mainWindow: here });
    expect(await app.actions.resetAll()).toBe(true);
    expect(app.store.getState().state.mainWindow).toEqual(normalizeMainWindow(here));
  });
});

describe('data kompaktu', () => {
  const base = () => defaultState(NOW);

  it('úkoly: připnuté první, pak rozpracované, hotové nikdy, nejvýš max', () => {
    const s = base();
    const active = QUESTS.filter(q => questStatus(q, s.quests.done) === 'active');
    const withItems = QUESTS.find(q => q.deliver.length && questStatus(q, s.quests.done) === 'active');
    expect(active.length).toBeGreaterThan(3);
    const pin = active[active.length - 1];
    s.quests.pinned = [pin.id];
    if (withItems) s.inventory[withItems.deliver[0][0]] = 1;
    const list = activeQuests(s, 'cs', 3);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: pin.id, pinned: true });
    if (withItems && withItems.id !== pin.id) expect(list[1].id).toBe(withItems.id);
    expect(activeQuests(s, 'cs', 5)).toHaveLength(5);
    /* hotový připnutý úkol se nezobrazí */
    s.quests.done = { [pin.id]: NOW };
    expect(activeQuests(s, 'cs', 5).some(q => q.id === pin.id)).toBe(false);
  });

  it('store: připnutí úkolu, nejvýš 5, neznámé id nic', async () => {
    const app = await makeApp();
    const ids = QUESTS.slice(0, 6).map(q => q.id);
    for (const id of ids) app.actions.questPin(id, true);
    expect(app.store.getState().state.quests.pinned).toEqual(ids.slice(1));
    app.actions.questPin(ids[3], false);
    expect(app.store.getState().state.quests.pinned).toEqual([ids[1], ids[2], ids[4], ids[5]]);
    app.actions.questPin('neexistuje', true);
    expect(app.store.getState().state.quests.pinned).toHaveLength(4);
  });

  const needsOf = (s: ReturnType<typeof defaultState>) => {
    const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
    return nextNeeds(view, STATIONS).map(n => ({ ...n, ready: readiness(s.inventory, n.mats) }));
  };

  it('další vylepšení: zvolený cíl má přednost, jinak nejbližší dosažitelný; nákupy jen pro něj', () => {
    const s = base();
    s.profile.level = 30;
    const needs = needsOf(s);
    expect(needs.length).toBeGreaterThan(1);
    /* nejpřipravenější: dát materiál jedné stanici */
    const open = needs.filter(n => !n.block);
    expect(open.length).toBeGreaterThan(1);
    const target = open[open.length - 1];
    for (const [m, n] of target.mats) s.inventory[m] = n - (m === target.mats[0][0] ? 1 : 0);
    const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
    const up = nextUpgrade(needsOf(s), stationTargets(view, s.planner, s.goals, STATIONS), s.inventory)!;
    expect(up.station.id).toBe(target.station.id);
    expect(up.missing).toBe(1);
    expect(up.chosen).toBe(false);
    const shop = compactShopping(up, []);
    expect(shop).toMatchObject({ forUpgrade: true, rows: [{ mat: target.mats[0][0], missing: 1 }] });
    expect(shop.rows[0].rarity).toBe(rarityOf(target.mats[0][0]));
    /* zvolený cíl v Planneru vyhrává */
    const other = open[0];
    expect(other.station.id).not.toBe(target.station.id);
    s.planner.stations[other.station.id] = other.level;
    const up2 = nextUpgrade(needsOf(s), stationTargets({ stations: s.stations, inventory: s.inventory, profile: s.profile }, s.planner, s.goals, STATIONS), s.inventory)!;
    expect(up2.station.id).toBe(other.station.id);
    expect(up2.chosen).toBe(true);
  });

  it('nákupy: když upgradu nic nechybí, nejvíc chybějící ze všech cílů, nejvýš 5', () => {
    const s = base();
    const view = { stations: s.stations, inventory: s.inventory, profile: s.profile };
    const all = shopping(view, STATIONS);
    const res = compactShopping(null, all);
    expect(res.forUpgrade).toBe(false);
    expect(res.rows.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < res.rows.length; i++) expect(res.rows[i - 1].missing).toBeGreaterThanOrEqual(res.rows[i].missing);
    expect(nextUpgrade([], [], {})).toBe(null);
  });

  it('prázdný stav jen pro úplně nového hráče', () => {
    const s = base();
    expect(isFreshProfile(s, MINS)).toBe(true);
    s.profile.coins = 10;
    expect(isFreshProfile(s, MINS)).toBe(false);
    const t = base();
    t.inventory['Metal Parts'] = 1;
    expect(isFreshProfile(t, MINS)).toBe(false);
  });
});

describe('snímek z tlačítka okna a buddy z oznamovací oblasti', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  function fakeNative(): Native & { calls: string[] } {
    const calls: string[] = [];
    const rec = (name: string) => async (x?: unknown) => { calls.push(x === undefined ? name : `${name}:${x}`); };
    return {
      calls, available: true,
      enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'), buddyReveal: rec('buddyReveal'),
      overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'), mainFocus: rec('mainFocus'),
      captureNow: rec('captureNow'), place: rec('place'), drag: rec('drag'), widgetsOpen: rec('widgetsOpen'), widgetsClose: rec('widgetsClose'), widgetsEdit: rec('widgetsEdit'), widgetsFit: rec('widgetsFit'), widgetsApp: rec('widgetsApp'), autoCapture: rec('autoCapture'), autoStats: async () => null, captureTake: async () => new Uint8Array(64 * 64 * 4).buffer,
    };
  }

  it('bez zapnutého buddyho se nesnímá', async () => {
    const app = await makeApp();
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => Date.now(), pushMs: 0 });
    hub.start();
    expect(await hub.captureFromApp()).toBe(false);
    expect(native.calls).not.toContain('captureNow');
    hub.stop();
  });

  it('snímek z okna jde stejnou cestou; prázdný snímek se ohlásí v okně, nic se nezapíše', async () => {
    const app = await makeApp({ schema: 7, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' } });
    const native = fakeNative();
    const buses = memoryBuses();
    const hub = createOpsHub({ app, bus: buses('main'), native, now: () => Date.now(), pushMs: 0 });
    hub.start();
    await hub.idle();
    const before = JSON.stringify(app.store.getState().state.inventory);
    expect(await hub.captureFromApp()).toBe(true);
    expect(native.calls).toContain('captureNow');
    buses('buddy').native('main', 'capture-ready', { id: 1, width: 64, height: 64 });
    await vi.advanceTimersByTimeAsync(10);
    expect(app.store.getState().notices.at(-1)?.tone).toBe('warning');
    expect(native.calls.some(c => c.startsWith('overlayOpen'))).toBe(false);
    expect(JSON.stringify(app.store.getState().state.inventory)).toBe(before);
    /* snímek ze zkratky (bez tlačítka) okno nehlásí */
    const n = app.store.getState().notices.length;
    buses('buddy').native('main', 'capture-ready', { id: 2, width: 64, height: 64 });
    await vi.advanceTimersByTimeAsync(10);
    expect(app.store.getState().notices.length).toBe(n);
    hub.stop();
  });

  it('buddy z oznamovací oblasti: skrýt a ukázat, zkratka zůstává; vypnutí v Nastavení skrytí zruší', async () => {
    const app = await makeApp({ schema: 7, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' } });
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => Date.now(), pushMs: 0 });
    let changes = 0;
    hub.onVisibility(() => changes++);
    hub.start();
    await hub.idle();
    expect(hub.buddyVisible()).toBe(true);
    hub.setBuddyVisible(false);
    await hub.idle();
    expect(hub.buddyVisible()).toBe(false);
    expect(native.calls.at(-1)).toBe('buddyClose');
    expect(native.calls).not.toContain('setHotkey:');
    hub.setBuddyVisible(true);
    await hub.idle();
    expect(native.calls.at(-1)).toBe('buddyOpen');
    hub.setBuddyVisible(false);
    app.actions.setBuddy({ enabled: false });
    await hub.idle();
    expect(hub.buddyVisible()).toBe(true);
    expect(changes).toBe(4);
    hub.stop();
  });
});
