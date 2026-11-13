/* 0.22.0: widgety nad hrou v hubu hlavního okna. Okno widgetů se otevře jen se zapnutým přepínačem a viditelným Opsem,
   dostane kopii stavu a smí poslat jen dvě úpravy z allow-listu. Zkratky widgetů registruje Rust; přepínač a zkratky
   jsou nastavení tohoto počítače (import zálohy je nemění) a overlay je přes relay nezmění. */
import { describe, expect, it } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { createOpsHub, type BuddyView, type WidgetView } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { applyWidgetAction, BLOCKED_ACTIONS, isRelayAction, WIDGET_ACTIONS } from '../../src/store/relay';
import { normalizeOpsPrefs } from '../../src/core/opsPrefs';
import { defaultState } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { QUESTS } from '../../src/core/quests';

const NOW = new Date(2026, 10, 13, 12, 0).getTime();

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

describe('hub: okno widgetů', () => {
  it('výchozí vypnuto: bez přepínače se okno widgetů neotevře ani nezaregistruje zkratka', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true } });
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(native.calls.filter(c => c.startsWith('widgets'))).toEqual([]);
    expect(app.store.getState().state.opsPrefs.widgets).toEqual({ on: false, editKey: '', hideKey: '' });
    hub.stop();
  });

  it('zapnutí otevře okno s Opsem, pozdrav dostane stav, vypnutí okno zavře; buddy ví, že klik otevře Úpravy', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true } });
    const native = fakeNative();
    const buses = memoryBuses();
    const hub = createOpsHub({ app, bus: buses('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    const buddy = buses('buddy'), widgets = buses('widgets');
    const views: BuddyView[] = [], states: WidgetView[] = [];
    buddy.on('view', v => views.push(v as BuddyView));
    widgets.on('state', v => states.push(v as WidgetView));
    app.actions.setWidgets({ on: true });
    await flush(hub);
    expect(native.calls).toContain('widgetsOpen');
    expect(views.at(-1)?.widgets).toBe(true);
    widgets.send('main', 'hello', { from: 'widgets' });
    expect(states).toHaveLength(1);
    expect(states[0].pending).toEqual({ stash: 0, loot: false, progress: false });
    /* podvržený pozdrav z jiného okna nic nepošle */
    buses('overlay').send('main', 'hello', { from: 'widgets' });
    expect(states).toHaveLength(1);
    app.actions.setProfile('level', 7);
    expect(states.at(-1)!.state.profile.level).toBe(7);
    app.actions.setWidgets({ on: false });
    await flush(hub);
    expect(native.calls).toContain('widgetsClose');
    expect(views.at(-1)?.widgets).toBe(false);
    hub.stop();
  });

  it('hlavní vypínač napojení na hru widgety zavře; zkratky widgetů jen se zapnutými widgety', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true }, opsPrefs: { widgets: { on: true, editKey: 'Ctrl+Alt+KeyE', hideKey: 'Ctrl+Alt+KeyH' } } });
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(native.calls).toContain('setHotkey:Ctrl+Alt+KeyE,edit');
    expect(native.calls).toContain('setHotkey:Ctrl+Alt+KeyH,hide');
    expect(native.calls).toContain('widgetsOpen');
    native.calls.length = 0;
    app.actions.setGameLinkOff(true);
    await flush(hub);
    expect(native.calls).toContain('widgetsClose');
    expect(native.calls).toContain('setHotkey:,edit');
    hub.stop();
  });

  it('setWidgetKey: stejná zkratka jako snímek nebo druhá zkratka widgetů neprojde', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true, hotkey: 'Ctrl+Shift+KeyS' }, opsPrefs: { widgets: { on: true } } });
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(await hub.setWidgetKey('edit', 'Ctrl+Shift+KeyS')).toBe('hotkey:taken');
    expect(await hub.setWidgetKey('edit', 'Ctrl+Alt+KeyE')).toBeNull();
    expect(await hub.setWidgetKey('hide', 'Ctrl+Alt+KeyE')).toBe('hotkey:taken');
    expect(app.store.getState().state.opsPrefs.widgets.editKey).toBe('Ctrl+Alt+KeyE');
    hub.stop();
  });

  it('úpravy z okna widgetů: jen allow-list, jen od okna widgetů, s mezemi argumentů', async () => {
    const q = QUESTS[0];
    const app = await makeApp({ schema: 18, buddy: { enabled: true }, opsPrefs: { widgets: { on: true } } });
    const buses = memoryBuses();
    const hub = createOpsHub({ app, bus: buses('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    const w = buses('widgets');
    w.send('main', 'widgetAction', { name: 'questObjective', args: [q.id, 0, true] });
    expect(app.store.getState().state.quests.objectives[q.id]).toEqual([0]);
    /* jiné okno ani jiná akce nic nezmění */
    buses('overlay').send('main', 'widgetAction', { name: 'questObjective', args: [q.id, 1, true] });
    w.send('main', 'widgetAction', { name: 'setProfile', args: ['level', 70] });
    w.send('main', 'widgetAction', { name: 'questObjective', args: [q.id, 99, true] });
    w.send('main', 'widgetAction', { name: 'questObjective', args: [q.id, 1, 'yes'] });
    w.send('main', 'widgetAction', { name: 'questObjective', args: ['x'.repeat(81), 1, true] });
    expect(app.store.getState().state.quests.objectives[q.id]).toEqual([0]);
    expect(app.store.getState().state.profile.level).toBe(1);
    hub.stop();
  });
});

describe('přepínač widgetů a zkratky patří tomuto počítači', () => {
  it('allow-list widgetů je pevný a přepínač nejde změnit z overlaye (relay)', () => {
    expect([...WIDGET_ACTIONS]).toEqual(['questObjective', 'setRaidFound']);
    expect(isRelayAction('setWidgets')).toBe(false);
    expect('setWidgets' in BLOCKED_ACTIONS).toBe(true);
  });

  it('setOpsPrefs (i přes relay) přepínač a zkratky nemění; neplatné zkratky se zahodí', async () => {
    const app = await makeApp();
    app.actions.setOpsPrefs({ personality: 'cheeky', widgets: { on: true, editKey: 'Ctrl+KeyA', hideKey: '' } } as never);
    expect(app.store.getState().state.opsPrefs.widgets.on).toBe(false);
    expect(normalizeOpsPrefs({ widgets: { on: 1, editKey: 'A', hideKey: 'Ctrl+KeyH' } }).widgets).toEqual({ on: false, editKey: '', hideKey: 'Ctrl+KeyH' });
    expect(normalizeOpsPrefs({ widgets: { on: true, editKey: 'F9', hideKey: 'F9' } }).widgets).toEqual({ on: true, editKey: 'F9', hideKey: '' });
  });

  it('import zálohy přepínač ani zkratky nezmění', async () => {
    const app = await makeApp();
    app.actions.setWidgets({ on: true, editKey: 'Ctrl+Alt+KeyE' });
    const here = structuredClone(app.store.getState().state.opsPrefs.widgets);
    const other = defaultState(NOW);
    other.opsPrefs.widgets = { on: false, editKey: '', hideKey: 'F8' };
    const file = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in file) throw new Error(file.error);
    expect(await app.actions.importState(file.state, '{}', 'app')).toBe(true);
    expect(app.store.getState().state.opsPrefs.widgets).toEqual(here);
  });

  it('applyWidgetAction: setRaidFound jen s plánem a krátkým názvem', async () => {
    const app = await makeApp();
    expect(applyWidgetAction(app, { name: 'setRaidFound', args: ['Battery', true] })).toBe(false);
    expect(applyWidgetAction(app, { name: 'setRaidFound', args: ['Battery'] })).toBe(false);
    expect(applyWidgetAction(app, null)).toBe(false);
    expect(applyWidgetAction(app, { name: '__proto__', args: [] })).toBe(false);
  });
});
