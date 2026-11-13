/* 0.20.0: bezpečnost automatického snímání mimo raid (žlutá zóna). Dřív platilo „snímek jen na zkratku nebo
   tlačítko“; teď smí snímat i hlídač, ale jen se zapnutým opt-in nastavením, jen při hře v popředí a jen ve stávající
   hlídací smyčce ops_watch (žádná druhá smyčka ani vlákno). Hlídá:
   - Rust (src-tauri/src/ops.rs): kde se volá plný snímek a pás s nadpisy, kdo zapíná auto_on, podmínka kroku;
   - výchozí stav vypnuto, záloha snímání nezapne, hlavní vypínač napojení na hru vypne vše;
   - hub promítne zapnutí do Rustu jen při zapnutém nastavení a automatický snímek bez zapnutí nic nepřečte. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { defaultState, normalize } from '../src/core/state';
import { autoActive, screenBits, emptyAutoCapture } from '../src/core/autoCapture';
import { createApp } from '../src/store/app';
import { createOpsHub } from '../src/ops/hub';
import type { Bus } from '../src/ops/bus';
import type { Native } from '../src/ops/native';
import { makeBackup } from '../src/core/backup';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const OPS = read('src-tauri/src/ops.rs');
const CODE = OPS.slice(0, OPS.indexOf('#[cfg(test)]'));
/* tělo funkce (od `fn name` po další `\nfn ` / `\npub fn ` / `#[tauri::command]` na začátku řádku) */
function fnBody(name: string): string {
  const i = CODE.search(new RegExp(`fn ${name}\\b`));
  if (i < 0) throw new Error(name);
  const rest = CODE.slice(i + 3);
  const j = rest.search(/\n(?:pub )?(?:async )?fn |\n#\[tauri::command\]|\n\/\/\/ |\n\/\* -----/);
  return CODE.slice(i, j < 0 ? undefined : i + 3 + j);
}

describe('0.20.0: automatické snímání jen s opt-in a při hře v popředí', () => {
  it('plný snímek: zkratka, tlačítko, nebo hlídač s potvrzenou obrazovkou; nic jiného', () => {
    const calls = [...CODE.matchAll(/start_capture(_as)?\(/g)].map(m => CODE.slice(Math.max(0, m.index! - 300), m.index! + 60));
    /* volání (definice mají <R>): on_hotkey, capture_now, start_capture → start_capture_as(None), hlídač */
    expect(calls.length).toBe(4);
    expect(fnBody('on_hotkey')).toMatch(/if !enabled\(app\)[\s\S]*start_capture\(app\.clone\(\)\)/);
    expect(fnBody('capture_now')).toMatch(/only\(&window, &\[MAIN, OVERLAY\]\)\?[\s\S]*if !enabled\(&app\)[\s\S]*start_capture\(app\)/);
    expect(fnBody('start_capture')).toContain('start_capture_as(app, None)');
    const watch = fnBody('ops_watch');
    expect(watch.match(/start_capture_as\(/g)!.length).toBe(1);
    expect(watch).toMatch(/if auto_due\(st\.auto_on\.load\(Ordering::SeqCst\), shown, fg, auto_at, now\) \{[\s\S]*let fire = auto\.update\(seen, now\);[\s\S]*if let Some\(screen\) = fire \{\s*start_capture_as\(app\.clone\(\), Some\(screen\.id\(\)\)\);/);
  });

  it('pás s nadpisy se snímá jen v hlídací smyčce a jen v kroku auto_due', () => {
    const uses = [...CODE.matchAll(/capture_header_strip\(\)/g)].length;
    /* volání v ops_watch + definice ve win modulu (pub fn) + zástupce mimo Windows */
    expect(uses).toBe(3);
    const watch = fnBody('ops_watch');
    const step = watch.slice(watch.indexOf('if auto_due('), watch.indexOf('std::thread::sleep(WATCH_TICK)'));
    expect(step).toContain('capture_header_strip()');
    expect(watch.indexOf('capture_header_strip()')).toBeGreaterThan(watch.indexOf('if auto_due('));
    /* žádná druhá smyčka ani vlákno pro snímání */
    expect(CODE.match(/thread::spawn/g)!.length).toBe(3);
    expect(fnBody('ops_autocapture')).not.toMatch(/spawn|loop|sleep/);
  });

  it('krok jen se zapnutým snímáním, viditelnou hrou v popředí a nejdřív po 2 s', () => {
    const due = fnBody('auto_due');
    expect(due).toContain('on && game_shown && fg == Foreground::Game');
    expect(due).toContain('>= AUTO_EVERY');
    expect(CODE).toMatch(/const AUTO_EVERY: Duration = Duration::from_secs\(2\);/);
    expect(CODE).toMatch(/pub const AUTO_COOLDOWN: Duration = Duration::from_secs\(8\);/);
    /* auto_on zapíná jen ops_autocapture (hlavní okno, zapnutý Ops), vypíná shutdown */
    const stores = [...CODE.matchAll(/auto_on\.store\(([^;]*)\);/g)].map(m => m[1]);
    expect(stores).toEqual(['false, Ordering::SeqCst', 'on && screens & header::ALL_BITS != 0, Ordering::SeqCst']);
    const cmd = fnBody('ops_autocapture');
    expect(cmd).toContain('main_only(&window)?');
    expect(cmd).toMatch(/if on && !st\.enabled\.load\(Ordering::SeqCst\) \{\s*return Err\("ops:off"\.into\(\)\);/);
    expect(fnBody('ops_autostats')).toContain('main_only(&window)?');
    /* vypnutí Ops (shutdown) vypne i automatické snímání */
    expect(fnBody('shutdown')).toContain('st.auto_on.store(false, Ordering::SeqCst);');
  });

  it('automatický snímek nespustí animaci ani zvuk (bez capture-start) a jde stejnou cestou do paměti', () => {
    const asFn = fnBody('start_capture_as');
    expect(asFn).toMatch(/if auto\.is_none\(\) \{\s*emit_native\(&app, MAIN, "capture-start", \(\)\);/);
    expect(asFn).toContain('CaptureReady { id, width, height, auto }');
    expect(asFn).toContain('std::thread::sleep(CAPTURE_TTL)');
    /* vzory nadpisů jsou jen data */
    const bits = read('src-tauri/src/ops_headers.in');
    expect(bits).toMatch(/^\/\/ Vygenerováno/);
    expect(bits).not.toMatch(/\bfn\b|unsafe|use |extern|std::|include/);
    expect(bits.replace(/\/\/.*$/gm, '').replace(/"[#.]*",?|\("[a-z-]+", &\[|\]\),|pub const BITS: &\[\(&str, &\[&str\]\)\] = &\[|\];|\s/g, '')).toBe('');
  });

  it('výchozí stav vypnuto, starší i nesmyslný stav vypnuto, záloha snímání nezapne', async () => {
    expect(emptyAutoCapture().enabled).toBe(false);
    expect(defaultState().autoCapture.enabled).toBe(false);
    expect(defaultState().autoCapture.ackAt).toBe(0);
    expect(normalize({ schema: 16 }).autoCapture.enabled).toBe(false);
    expect(normalize({ autoCapture: { enabled: 'true', screens: { loadout: 1 } } }).autoCapture.enabled).toBe(false);
    expect(autoActive(defaultState())).toBe(false);
    /* import zálohy se zapnutým snímáním: na tomto počítači zůstane vypnuté */
    const app = createApp(memStorage(), { debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    const other = defaultState();
    other.buddy.enabled = true;
    other.autoCapture = { ...emptyAutoCapture(), enabled: true, ackAt: 5 };
    const file = makeBackup(other, new Date());
    expect(await app.actions.importState(normalize(JSON.parse(JSON.stringify(file)).state), JSON.stringify(file), 'app')).toBe(true);
    expect(app.store.getState().state.autoCapture.enabled).toBe(false);
    /* bez potvrzeného vysvětlení se zapnout nedá */
    app.actions.setBuddy({ enabled: true });
    expect(app.actions.setAutoCapture({ enabled: true })).toBe(false);
    expect(app.actions.setAutoCapture({ ack: true, enabled: true })).toBe(true);
    expect(autoActive(app.store.getState().state)).toBe(true);
  });

  it('hub: do Rustu jen při zapnutém nastavení; hlavní vypínač i vypnutí Ops snímání zastaví', async () => {
    const app = createApp(memStorage(), { debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    const calls: string[] = [];
    const native = fakeNative(calls);
    const hub = createOpsHub({ app, bus: nullBus(), native, now: () => 1_000, pushMs: 0 });
    hub.start();
    /* 0.22.1: s propouštěním kliků buddyho běží hlídání okna v popředí vždy (snímání v Rustu ale zůstane vypnuté);
       tady se hlídání sleduje jen kvůli snímání */
    app.actions.setPassClicks(false);
    app.actions.setBuddy({ enabled: true });
    await hub.idle();
    expect(calls.filter(c => c.startsWith('autoCapture') || c.startsWith('watch'))).toEqual([]);
    /* automatický snímek bez zapnutého snímání se nečte */
    expect(await hub.handleAutoCapture({ width: 4, height: 4, data: new Uint8Array(64) }, 'loadout')).toBe('off');
    app.actions.setAutoCapture({ ack: true, enabled: true });
    await hub.idle();
    const bits = screenBits(app.store.getState().state.autoCapture.screens);
    expect(calls.slice(-2)).toEqual([`autoCapture(true,${bits})`, 'watch(true)']);
    app.actions.setAutoCapture({ paused: true });
    await hub.idle();
    expect(calls.slice(-2)).toEqual(['autoCapture(false,0)', 'watch(false)']);
    app.actions.setAutoCapture({ paused: false });
    await hub.idle();
    app.actions.setGameLinkOff(true);
    await hub.idle();
    expect(calls.slice(-2)).toEqual(['autoCapture(false,0)', 'watch(false)']);
    expect(app.store.getState().state.autoCapture.enabled).toBe(false);
    expect(await hub.handleAutoCapture({ width: 4, height: 4, data: new Uint8Array(64) }, 'findings')).toBe('off');
    hub.stop();
  });
});

/* ----- zástupci ----- */
function memStorage() {
  let content: string | null = null;
  const snaps: { name: string; content: string }[] = [];
  return {
    kind: 'browser' as const,
    load: async () => ({ content, source: content ? 'state' as const : 'none' as const, warning: null }),
    save: async (c: string) => { content = c; },
    createSnapshot: async (_k: string, label: string, c: string) => { snaps.push({ name: label, content: c }); },
    listSnapshots: async () => [],
    readSnapshot: async () => '',
    deleteSnapshot: async () => undefined,
    saveImportRaw: async () => undefined,
    exportBackup: async () => true,
    importBackup: async () => null,
    dataDir: async () => '',
    openDataDir: async () => undefined,
  } as unknown as Parameters<typeof createApp>[0];
}
function fakeNative(calls: string[]): Native {
  const rec = (name: string) => async (...a: unknown[]) => { calls.push(a.length ? `${name}(${a.join(',')})` : name); };
  return {
    available: true, enable: rec('enable'), setHotkey: rec('setHotkey'), watch: rec('watch'), buddyOpen: rec('buddyOpen'), buddyClose: rec('buddyClose'),
    buddyReveal: rec('buddyReveal'), overlayOpen: rec('overlayOpen'), overlayClose: rec('overlayClose'), overlayToggle: rec('overlayToggle'),
    mainFocus: rec('mainFocus'), captureNow: rec('captureNow'), place: rec('place'), drag: rec('drag'), widgetsOpen: rec('widgetsOpen'), widgetsClose: rec('widgetsClose'), widgetsEdit: rec('widgetsEdit'), widgetsFit: rec('widgetsFit'), widgetsApp: rec('widgetsApp'), passThrough: rec('passThrough'),
    captureTake: async () => new ArrayBuffer(0), autoCapture: rec('autoCapture'), autoStats: async () => null,
  };
}
function nullBus(): Bus {
  return { label: 'main', send: () => undefined, on: () => () => undefined, onNative: () => () => undefined, ready: async () => undefined };
}
