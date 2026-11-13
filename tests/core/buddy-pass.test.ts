/* 0.22.1: buddy nikdy nevezme hře fokus. Buddy propouští kliky do hry, dokud je hra v popředí (výchozí zapnuto).
   Hub pošle volbu do Rustu (ops_passthrough) a pustí hlídací smyčku, i když je automatické zobrazení i snímání
   vypnuté (jen ta smyčka ví, které okno je v popředí). Volba patří tomuto počítači: import zálohy ani overlay
   přes relay ji nezmění. Samotné rozhodování (hra / vlastní okno / jiný program) testuje Rust
   (ops::tests::buddy_propousti_kliky_jen_pri_hre_v_popredi), statické stráže tests/safety-acl.test.ts. */
import { describe, expect, it } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { emptyOpsPrefs, normalizeOpsPrefs } from '../../src/core/opsPrefs';
import { defaultState } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { applyRelay } from '../../src/store/relay';

const NOW = new Date(2026, 10, 14, 12, 0).getTime();

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

describe('0.22.1: buddy propouští kliky do hry', () => {
  it('výchozí zapnuto, starší nastavení bez volby taky; vypnout jde jen výslovně', () => {
    expect(emptyOpsPrefs().passClicks).toBe(true);
    expect(normalizeOpsPrefs({}).passClicks).toBe(true);
    expect(normalizeOpsPrefs({ passClicks: 'no' }).passClicks).toBe(true);
    expect(normalizeOpsPrefs({ passClicks: false }).passClicks).toBe(false);
    expect(defaultState(NOW).opsPrefs.passClicks).toBe(true);
  });

  it('zapnutí Opse pošle volbu do Rustu a pustí hlídání okna v popředí i bez automatického zobrazení a snímání', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true, autoOpen: false } });
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(native.calls).toContain('passThrough:true');
    expect(native.calls).toContain('watch:true');
    /* hlídání kvůli propouštění kliků nezapne automatické snímání */
    expect(native.calls.some(c => c.startsWith('autoCapture:true'))).toBe(false);
    /* volba se pošle po zapnutí (Rust ji při vypnutí zapomene) */
    expect(native.calls.indexOf('enable:true')).toBeLessThan(native.calls.indexOf('passThrough:true'));
    native.calls.length = 0;
    app.actions.setPassClicks(false);
    await flush(hub);
    /* vypnuto: buddy jde kliknout i nad hrou; hlídání bez automatického zobrazení a snímání neběží */
    expect(native.calls.sort()).toEqual(['passThrough:false', 'watch:false']);
    native.calls.length = 0;
    app.actions.setPassClicks(true);
    await flush(hub);
    expect(native.calls.sort()).toEqual(['passThrough:true', 'watch:true']);
    hub.stop();
  });

  it('vypnutý Ops nic neposílá; po novém zapnutí se volba pošle znovu', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: false } });
    const native = fakeNative();
    const hub = createOpsHub({ app, bus: memoryBuses()('main'), native, now: () => NOW, pushMs: 0 });
    hub.start();
    await flush(hub);
    expect(native.calls.filter(c => c.startsWith('passThrough') || c.startsWith('watch'))).toEqual([]);
    app.actions.setBuddy({ enabled: true });
    await flush(hub);
    app.actions.setBuddy({ enabled: false });
    await flush(hub);
    native.calls.length = 0;
    app.actions.setBuddy({ enabled: true });
    await flush(hub);
    expect(native.calls).toContain('passThrough:true');
    hub.stop();
  });

  it('volba patří tomuto počítači: import zálohy ani overlay (relay setOpsPrefs) ji nezmění', async () => {
    const app = await makeApp({ schema: 18, buddy: { enabled: true } });
    app.actions.setPassClicks(false);
    const other = defaultState(NOW);
    other.opsPrefs = { ...other.opsPrefs, passClicks: true };
    const file = parseBackup(makeBackup(other, new Date(NOW)), NOW);
    if ('error' in file) throw new Error(file.error);
    expect(await app.actions.importState(file.state, '{}', 'app')).toBe(true);
    expect(app.store.getState().state.opsPrefs.passClicks).toBe(false);
    app.actions.setPassClicks(true);
    /* overlay smí setOpsPrefs přes relay, ale propouštění kliků tím nevypne */
    const r = applyRelay(app, { session: 'abcd1234', seq: 1, name: 'setOpsPrefs', args: [{ passClicks: false, volume: 40 }], ids: [] });
    expect(r?.applied).toBe(true);
    expect(app.store.getState().state.opsPrefs.volume).toBe(40);
    /* a setPassClicks overlay volat nesmí */
    expect(applyRelay(app, { session: 'abcd1234', seq: 2, name: 'setPassClicks', args: [false], ids: [] })?.applied).toBe(false);
    app.actions.setOpsPrefs({ passClicks: false } as never);
    expect(app.store.getState().state.opsPrefs.passClicks).toBe(true);
  });
});
