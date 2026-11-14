/* 0.23.0: režim nízké zátěže, zátěž aplikace a drobnosti k widgetům.
   - čisté funkce: kdy se šetří, odstup obnovy widgetů, kontrola rozlišení, přepočet rádce, CPU % vlastního procesu;
   - hub: se zapnutým režimem a hrou v popředí stojí animace buddyho a emoce, widgety se obnovují méně často;
   - zkratka polní konzole (volitelná, výchozí žádná, nekoliduje s ostatními zkratkami), vysoký kontrast widgetů;
   - vše patří tomuto počítači: overlay je přes relay nezmění a import zálohy je nepřepíše. */
import { describe, expect, it } from 'vitest';
import { ADVISOR_MS, WIDGET_FIT_LOW_MS, WIDGET_FIT_MS, WIDGET_PUSH_LOW_MS, advisorDue, calmNow, cpuPercent, widgetFitMs, widgetPushMs, widgetRefreshHz } from '../../src/core/lowImpact';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { createOpsHub, type BuddyView, type WidgetView } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { BLOCKED_ACTIONS, isRelayAction } from '../../src/store/relay';
import { emptyOpsPrefs, normalizeOpsPrefs } from '../../src/core/opsPrefs';
import { defaultState } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { syntheticFindings } from '../vision/findings';

const NOW = new Date(2026, 10, 14, 12, 0).getTime();

describe('0.23.0: režim nízké zátěže (čisté funkce)', () => {
  it('šetří se jen se zapnutým režimem a hrou v popředí', () => {
    expect([calmNow(false, false), calmNow(false, true), calmNow(true, false), calmNow(true, true)]).toEqual([false, false, false, true]);
  });
  it('widgety: odstup obnovy a kontrola rozlišení', () => {
    expect(widgetPushMs(120, false)).toBe(360);
    expect(widgetPushMs(120, true)).toBe(WIDGET_PUSH_LOW_MS);
    expect(widgetPushMs(1000, true)).toBe(3000);
    expect([widgetFitMs(false), widgetFitMs(true)]).toEqual([WIDGET_FIT_MS, WIDGET_FIT_LOW_MS]);
    expect([widgetRefreshHz(360), widgetRefreshHz(2000), widgetRefreshHz(0)]).toEqual([2.8, 0.5, 0]);
  });
  it('rádce: bez šetření vždy, při šetření nejvýš jednou za ADVISOR_MS', () => {
    expect(advisorDue(1000, 1001, false)).toBe(true);
    expect(advisorDue(null, 5, true)).toBe(true);
    expect(advisorDue(1000, 1000 + ADVISOR_MS - 1, true)).toBe(false);
    expect(advisorDue(1000, 1000 + ADVISOR_MS, true)).toBe(true);
    /* posun hodin zpět: přepočítat */
    expect(advisorDue(5000, 1000, true)).toBe(true);
  });
  it('CPU % vlastního procesu: podíl času CPU na čase hodin a počtu jader, oříznuto 0–100', () => {
    expect(cpuPercent(null, { cpuUs: 5000, at: 1000 }, 8)).toBeNull();
    /* 2 s na hodinách, 4 jádra, 80 ms CPU = 1 % */
    expect(cpuPercent({ cpuUs: 0, at: 0 }, { cpuUs: 80_000, at: 2000 }, 4)).toBe(1);
    expect(cpuPercent({ cpuUs: 0, at: 0 }, { cpuUs: 9e9, at: 2000 }, 1)).toBe(100);
    expect(cpuPercent({ cpuUs: 10, at: 2000 }, { cpuUs: 5, at: 4000 }, 1)).toBeNull();
    expect(cpuPercent({ cpuUs: 10, at: 2000 }, { cpuUs: 20, at: 2000 }, 1)).toBeNull();
  });
});

function fakeNative(): Native & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => async (...a: unknown[]) => { calls.push(a.length ? `${name}:${a.map(x => String(x)).join(',')}` : name); };
  return {
    calls, available: true,
    enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'), buddyReveal: rec('buddyReveal'),
    overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'), mainFocus: rec('mainFocus'),
    captureNow: rec('captureNow'), place: rec('place'), drag: rec('drag'), widgetsOpen: rec('widgetsOpen'), widgetsClose: rec('widgetsClose'), widgetsEdit: rec('widgetsEdit'),
    widgetsFit: rec('widgetsFit'), widgetsApp: rec('widgetsApp'), passThrough: rec('passThrough'), autoCapture: rec('autoCapture'), autoStats: async () => null, captureTake: async () => new ArrayBuffer(0),
  };
}
async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}
const flush = async (hub: { idle: () => Promise<unknown> }) => { for (let i = 0; i < 5; i++) await hub.idle(); };

describe('0.23.0: hub v režimu nízké zátěže', () => {
  async function setup(lowImpact: boolean) {
    const app = await makeApp({ schema: 18, buddy: { enabled: true }, opsPrefs: { lowImpact, widgets: { on: true } } });
    const buses = memoryBuses();
    const main = buses('main'), buddy = buses('buddy'), widgets = buses('widgets');
    const views: BuddyView[] = [];
    const wviews: WidgetView[] = [];
    buddy.on('view', p => views.push(p as BuddyView));
    widgets.on('state', p => wviews.push(p as WidgetView));
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: main, native, now: () => NOW, pushMs: 0 });
    const fronts: boolean[] = [];
    hub.onFront(f => fronts.push(f));
    hub.start();
    await flush(hub);
    return { app, hub, main, buddy, widgets, views, wviews, native, fronts };
  }
  const front = (main: ReturnType<ReturnType<typeof memoryBuses>>, on: boolean) => main.native('main', 'game-visible', on);

  it('vypnutý režim: hra v popředí nic nemění', async () => {
    const { hub, main, views, fronts } = await setup(false);
    front(main, true);
    await flush(hub);
    expect(views.at(-1)!.calm).toBe(false);
    expect(hub.perfInfo()).toMatchObject({ calm: false, lowImpact: false, widgetPushMs: 0 });
    expect(fronts).toEqual([true]);
    hub.stop();
  });

  it('zapnutý režim: šetří jen při hře v popředí (buddy bez animace, widgety méně často)', async () => {
    const { app, hub, main, views, fronts } = await setup(true);
    expect(views.at(-1)!.calm).toBe(false);
    front(main, true);
    await flush(hub);
    expect(views.at(-1)!.calm).toBe(true);
    expect(hub.perfInfo()).toMatchObject({ calm: true, lowImpact: true, widgetPushMs: WIDGET_PUSH_LOW_MS });
    front(main, false);
    await flush(hub);
    expect(views.at(-1)!.calm).toBe(false);
    expect(fronts).toEqual([true, false]);
    /* vypnutí v Nastavení šetření hned ukončí */
    front(main, true);
    await flush(hub);
    app.actions.setLowImpact(false);
    await flush(hub);
    expect(views.at(-1)!.calm).toBe(false);
    hub.stop();
  });

  it('emoce automatického snímku při šetření stojí; po návratu ze hry zase hrají', async () => {
    const { app, hub, main } = await setup(true);
    app.actions.setAutoCapture({ ack: true, enabled: true });
    const emotes = () => main.sent.filter(m => m.type === 'emote').length;
    front(main, true);
    await flush(hub);
    expect(await hub.handleAutoCapture(syntheticFindings({ skip: [0, 1, 2, 3, 4, 5, 6] }), 'loadout', 5)).toBe('loadout');
    expect(emotes()).toBe(0);
    front(main, false);
    await flush(hub);
    expect(await hub.handleAutoCapture(syntheticFindings(), 'findings', 6)).toBe('result');
    expect(emotes()).toBeGreaterThan(0);
    hub.stop();
  });
});

describe('0.23.0: zkratka polní konzole', () => {
  it('výchozí žádná; uloží se až po přijetí systémem; nekoliduje se zkratkou snímku ani widgetů', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' }, opsPrefs: { widgets: { on: true, editKey: 'F9' } } });
    expect(app.store.getState().state.opsPrefs.consoleKey).toBe('');
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(native.calls.filter(c => c.endsWith(',console'))).toEqual([]);
    expect(await hub.setConsoleKey('Ctrl+Shift+KeyS')).toBe('hotkey:taken');
    expect(await hub.setConsoleKey('F9')).toBe('hotkey:taken');
    expect(await hub.setConsoleKey('F7')).toBeNull();
    expect(app.store.getState().state.opsPrefs.consoleKey).toBe('F7');
    expect(native.calls).toContain('setHotkey:F7,console');
    expect(await hub.setConsoleKey('')).toBeNull();
    expect(app.store.getState().state.opsPrefs.consoleKey).toBe('');
    /* hlavní vypínač napojení na hru: zkratka se v Rustu zruší a nová nejde nastavit */
    expect(await hub.setConsoleKey('F7')).toBeNull();
    app.actions.setGameLinkOff(true);
    await flush(hub);
    expect(native.calls.at(-1)).not.toBe('setHotkey:F7,console');
    expect(native.calls).toContain('setHotkey:,console');
    expect(await hub.setConsoleKey('F6')).toBe('hotkey:off');
    hub.stop();
  });
  it('normalizace: neplatná zkratka a zkratka shodná se zkratkou widgetů se zahodí', () => {
    expect(normalizeOpsPrefs({ consoleKey: 'A' }).consoleKey).toBe('');
    expect(normalizeOpsPrefs({ consoleKey: 'F8', widgets: { hideKey: 'F8' } }).consoleKey).toBe('');
    expect(normalizeOpsPrefs({ consoleKey: 'Ctrl+Alt+KeyC' }).consoleKey).toBe('Ctrl+Alt+KeyC');
    expect(emptyOpsPrefs()).toMatchObject({ lowImpact: false, consoleKey: '', widgets: { contrast: false } });
  });
});

describe('0.23.0: nastavení tohoto počítače', () => {
  it('overlay je přes relay nezmění; setOpsPrefs je přepsat nemůže', async () => {
    for (const a of ['setLowImpact', 'setConsoleKey', 'setWidgets']) {
      expect(isRelayAction(a), a).toBe(false);
      expect(a in BLOCKED_ACTIONS, a).toBe(true);
    }
    const app = await makeApp();
    app.actions.setOpsPrefs({ personality: 'cheeky', lowImpact: true, consoleKey: 'F7' } as never);
    expect(app.store.getState().state.opsPrefs).toMatchObject({ personality: 'cheeky', lowImpact: false, consoleKey: '' });
  });
  it('import zálohy režim, zkratku konzole ani kontrast widgetů nezmění', async () => {
    const app = await makeApp();
    app.actions.setLowImpact(true);
    app.actions.setConsoleKey('F7');
    app.actions.setWidgets({ contrast: true });
    const here = structuredClone(app.store.getState().state.opsPrefs);
    const other = defaultState(NOW);
    other.opsPrefs = { ...other.opsPrefs, lowImpact: false, consoleKey: 'F6', widgets: { ...other.opsPrefs.widgets, contrast: false } };
    const file = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in file) throw new Error(file.error);
    expect(await app.actions.importState(file.state, '{}', 'app')).toBe(true);
    expect(app.store.getState().state.opsPrefs).toEqual(here);
  });
  it('vysoký kontrast widgetů: výchozí vypnutý, jde do okna widgetů se stavem', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true }, opsPrefs: { widgets: { on: true } } });
    expect(app.store.getState().state.opsPrefs.widgets.contrast).toBe(false);
    app.actions.setWidgets({ contrast: true });
    expect(app.store.getState().state.opsPrefs.widgets).toMatchObject({ on: true, contrast: true });
  });
});
