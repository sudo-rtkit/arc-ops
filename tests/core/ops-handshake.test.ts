/* 0.8.0: buddy a overlay po prvním zapnutí nezůstanou viset na „Načítám“. V Tauri se posluchač registruje
   asynchronně; bus se zpožděnou registrací (memoryBuses({ registerDelayMs })) to napodobí. První data musí
   přijít bez jakékoli změny stavu, pro buddyho i overlay, i pro úplně nového uživatele. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses, type MemoryBus } from '../../src/ops/bus';
import { HELLO_DELAYS, startHello } from '../../src/ops/handshake';
import type { Native } from '../../src/ops/native';
import type { BuddyView, OverlayView } from '../../src/ops/hub';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();
const DELAY = 20;

function fakeNative(): Native & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => async () => { calls.push(name); };
  return {
    calls, available: true,
    enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'), buddyReveal: rec('buddyReveal'),
    overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'), mainFocus: rec('mainFocus'),
    captureNow: rec('captureNow'), place: rec('place'), drag: rec('drag'), autoCapture: rec('autoCapture'), autoStats: async () => null, captureTake: async () => new ArrayBuffer(0),
  };
}

async function makeApp(stored?: unknown): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}
const hellos = (b: MemoryBus, from: string) => b.sent.filter(m => m.to === 'main' && m.type === 'hello' && (m.payload as { from: string }).from === from).length;

describe('úvodní pozdrav buddyho a overlaye (asynchronní registrace posluchačů)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reprodukce chyby 0.7.0: hello hned po on() ztratí odpověď, okno nedostane data', async () => {
    const app = await makeApp({ schema: 6, buddy: { enabled: true } });
    const buses = memoryBuses({ registerDelayMs: DELAY });
    const hub = createOpsHub({ app, bus: buses('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
    hub.start();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    const buddy = buses('buddy');
    const views: unknown[] = [];
    buddy.on('view', v => views.push(v));
    buddy.send('main', 'hello', { from: 'buddy' }); /* staré chování: posluchač ještě neexistuje */
    await vi.advanceTimersByTimeAsync(60_000);
    expect(views).toEqual([]);
    hub.stop();
  });

  it('hub: okna se otevřou až po registraci posluchačů hlavního okna', async () => {
    const app = await makeApp();
    const buses = memoryBuses({ registerDelayMs: DELAY });
    const native = fakeNative();
    const main = buses('main');
    const hub = createOpsHub({ app, bus: main, native, now: () => NOW, pushMs: 0 });
    hub.start();
    app.actions.setBuddy({ enabled: true });
    await vi.advanceTimersByTimeAsync(DELAY - 5);
    expect(native.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(10);
    await hub.idle();
    expect(native.calls).toEqual(['enable', 'buddyOpen']);
    hub.stop();
  });

  for (const fresh of [false, true]) {
    const label = fresh ? 'nový uživatel (prázdný stav)' : 'existující stav';
    it(`buddy (${label}): první view přijde po zapnutí bez jakékoli změny stavu`, async () => {
      const app = await makeApp(fresh ? undefined : { schema: 6, profile: { level: 23 }, inventory: { 'Metal Parts': 4 } });
      const buses = memoryBuses({ registerDelayMs: DELAY });
      const native = fakeNative();
      const hub = createOpsHub({ app, bus: buses('main'), native, now: () => NOW, pushMs: 0 });
      hub.start();
      app.actions.setBuddy({ enabled: true });
      await vi.advanceTimersByTimeAsync(DELAY * 2);
      await hub.idle();
      expect(native.calls).toContain('buddyOpen');
      const before = app.store.getState().state;
      /* okno buddyho se otevře: posluchače se registrují se zpožděním */
      const buddy = buses('buddy');
      const views: BuddyView[] = [];
      buddy.on('view', v => views.push(v as BuddyView));
      const stop = startHello(buddy, 'buddy', () => views.length > 0);
      await vi.advanceTimersByTimeAsync(DELAY * 2);
      expect(views).toHaveLength(1);
      expect(views[0].level).toBe(fresh ? before.profile.level : 23);
      expect(app.store.getState().state).toBe(before);
      /* po první odpovědi se pozdrav už neopakuje */
      await vi.advanceTimersByTimeAsync(60_000);
      expect(hellos(buddy, 'buddy')).toBe(1);
      stop(); hub.stop();
    });

    it(`overlay (${label}): první stav přijde bez jakékoli změny stavu`, async () => {
      const app = await makeApp(fresh ? undefined : { schema: 6, buddy: { enabled: true }, inventory: { 'Metal Parts': 4 } });
      const buses = memoryBuses({ registerDelayMs: DELAY });
      const hub = createOpsHub({ app, bus: buses('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
      hub.start();
      if (fresh) app.actions.setBuddy({ enabled: true });
      await vi.advanceTimersByTimeAsync(DELAY * 2);
      await hub.idle();
      const before = app.store.getState().state;
      const overlay = buses('overlay');
      const states: OverlayView[] = [];
      overlay.on('state', v => states.push(v as OverlayView));
      const stop = startHello(overlay, 'overlay', () => states.length > 0);
      await vi.advanceTimersByTimeAsync(DELAY * 2);
      expect(states).toHaveLength(1);
      expect(states[0].state.inventory).toEqual(fresh ? {} : { 'Metal Parts': 4 });
      expect(app.store.getState().state).toBe(before);
      stop(); hub.stop();
    });
  }

  it('hlavní okno ještě neposlouchá: pozdrav se opakuje a data přijdou, jakmile hub poslouchá', async () => {
    const app = await makeApp({ schema: 6, buddy: { enabled: true } });
    const buses = memoryBuses({ registerDelayMs: DELAY });
    const main = buses('main');
    const buddy = buses('buddy');
    const overlay = buses('overlay');
    const views: unknown[] = [], states: unknown[] = [];
    buddy.on('view', v => views.push(v));
    overlay.on('state', v => states.push(v));
    const stops = [startHello(buddy, 'buddy', () => views.length > 0), startHello(overlay, 'overlay', () => states.length > 0)];
    await vi.advanceTimersByTimeAsync(100);
    expect(hellos(buddy, 'buddy')).toBe(1); /* první pozdrav se ztratil, hub ještě neběží */
    expect(views).toEqual([]);
    const hub = createOpsHub({ app, bus: main, native: fakeNative(), now: () => NOW, pushMs: 0 });
    hub.start();
    await vi.advanceTimersByTimeAsync(HELLO_DELAYS[0] + HELLO_DELAYS[1]);
    expect(views.length).toBeGreaterThan(0);
    expect(states.length).toBeGreaterThan(0);
    /* buddy dostane view i z úvodního odeslání stavu; overlay je jen na pozdrav, takže ho musel zopakovat */
    const n = hellos(overlay, 'overlay');
    expect(n).toBeGreaterThanOrEqual(2);
    const nb = hellos(buddy, 'buddy');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hellos(overlay, 'overlay')).toBe(n);
    expect(hellos(buddy, 'buddy')).toBe(nb);
    stops.forEach(f => f()); hub.stop();
  });

  it('opakování je omezené: bez odpovědi se pozdrav pošle nejvýš HELLO_DELAYS.length + 1krát', async () => {
    const buses = memoryBuses({ registerDelayMs: DELAY });
    const buddy = buses('buddy');
    const stop = startHello(buddy, 'buddy', () => false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(hellos(buddy, 'buddy')).toBe(HELLO_DELAYS.length + 1);
    expect(HELLO_DELAYS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(40_000);
    stop();
  });

  it('zrušení (zavření okna) zastaví další pozdravy', async () => {
    const buses = memoryBuses({ registerDelayMs: DELAY });
    const buddy = buses('buddy');
    const stop = startHello(buddy, 'buddy', () => false);
    await vi.advanceTimersByTimeAsync(DELAY + 1);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hellos(buddy, 'buddy')).toBe(1);
  });

  it('bus bez zpoždění funguje jako dřív (ready se vyřeší hned)', async () => {
    const buses = memoryBuses();
    const a = buses('buddy');
    const got: unknown[] = [];
    a.on('x', p => got.push(p));
    await a.ready();
    buses('main').send('buddy', 'x', 1);
    expect(got).toEqual([1]);
  });
});
