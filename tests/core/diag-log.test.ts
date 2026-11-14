/* 0.28.0: místní deník chyb z JS. Jen popis chyby (název, zpráva, zásobník), žádné objekty ani stav; úryvek vstupu
   v chybě JSON.parse pryč; meze délky; stejná zpráva jednou za DEDUPE_MS; mimo Tauri nic; chyba deníku nic neshodí. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => undefined as unknown);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: Record<string, unknown>) => invoke(cmd, args) }));

import { DEDUPE_MS, DIAG_FEATURES, DIAG_MAX_MESSAGE, DIAG_MAX_STACK, describeError, diagFeatures, installDiag, reportError, resetDiagForTests } from '../../src/shell/diagLog';
import { defaultState } from '../../src/core/state';

const g = globalThis as unknown as { window?: unknown };
const flush = () => new Promise(r => setTimeout(r, 0));

describe('describeError', () => {
  it('Error: název a zpráva; zásobník bez opakované první řádky', () => {
    const e = new TypeError('x is not a function');
    e.stack = 'TypeError: x is not a function\n    at f (http://tauri.localhost/assets/index.js:1:2)\n    at g (http://tauri.localhost/assets/index.js:3:4)';
    const d = describeError(e);
    expect(d.message).toBe('TypeError: x is not a function');
    expect(d.stack).toBe('    at f (http://tauri.localhost/assets/index.js:1:2)\n    at g (http://tauri.localhost/assets/index.js:3:4)');
  });
  it('chyba JSON.parse: citovaný úryvek vstupu (může to být stav) se vynechá', () => {
    let err: unknown;
    try { JSON.parse('{"inventory":{"Rusted Gear":12}} trailing'); } catch (e) { err = e; }
    const d = describeError(err);
    expect(d.message.startsWith('SyntaxError: ')).toBe(true);
    expect(d.message).not.toContain('Rusted');
    expect(d.message).not.toContain('inventory');
    const fake = new SyntaxError('Unexpected token \'x\', "{"profile":{"name":"Jarda"}}" is not valid JSON');
    expect(describeError(fake).message).toBe('SyntaxError: Unexpected token \'x\', "…" is not valid JSON');
  });
  it('jiné hodnoty než Error se neserializují (zapíše se jen typ)', () => {
    expect(describeError({ inventory: { gear: 1 }, apiKey: 'sk-secret' }).message).toBe('non-Error value (object)');
    expect(describeError([1, 2, 3]).message).toBe('non-Error value (object)');
    expect(describeError(null).message).toBe('non-Error value (null)');
    expect(describeError(undefined).message).toBe('non-Error value (undefined)');
    expect(describeError(() => 1).message).toBe('non-Error value (function)');
    expect(describeError('plain text').message).toBe('plain text');
    expect(describeError(42).message).toBe('42');
  });
});

describe('reportError', () => {
  beforeEach(() => { resetDiagForTests(); invoke.mockClear(); g.window = { __TAURI_INTERNALS__: {} }; });
  afterEach(() => { delete g.window; vi.useRealTimers(); });

  it('pošle jen level, message a stack přes diag_log (okno doplní Rust)', async () => {
    const e = new Error('boom');
    e.stack = 'Error: boom\n    at a (x.js:1:1)';
    reportError(e, 'error', 'render', '\n    in App');
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
    const [cmd, args] = invoke.mock.calls[0];
    expect(cmd).toBe('diag_log');
    expect(Object.keys(args!).sort()).toEqual(['level', 'message', 'stack']);
    expect(args).toEqual({ level: 'error', message: 'render: Error: boom', stack: '    at a (x.js:1:1)\n\n    in App' });
  });

  it('meze délky zprávy a zásobníku', async () => {
    const e = new Error('m'.repeat(10_000));
    e.stack = 's'.repeat(20_000);
    reportError(e);
    await flush();
    const args = invoke.mock.calls[0][1] as { message: string; stack: string };
    expect(args.message.length).toBe(DIAG_MAX_MESSAGE);
    expect(args.stack.length).toBe(DIAG_MAX_STACK);
  });

  it('stejná zpráva jednou za DEDUPE_MS, jiná hned', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    for (let i = 0; i < 50; i++) reportError(new Error('same'));
    reportError(new Error('other'));
    vi.setSystemTime(1_000_000 + DEDUPE_MS + 1);
    reportError(new Error('same'));
    await flush();
    expect(invoke.mock.calls.map(c => (c[1] as { message: string }).message)).toEqual(['Error: same', 'Error: other', 'Error: same']);
  });

  it('mimo Tauri nic neposílá; selhání příkazu nic neshodí', async () => {
    delete g.window;
    reportError(new Error('browser'));
    await flush();
    expect(invoke).not.toHaveBeenCalled();
    g.window = { __TAURI_INTERNALS__: {} };
    invoke.mockRejectedValueOnce(new Error('ipc down'));
    expect(() => reportError(new Error('ipc'))).not.toThrow();
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('installDiag zachytí onerror a unhandledrejection (jednou na okno)', async () => {
    const handlers: Record<string, ((e: unknown) => void)[]> = {};
    g.window = { __TAURI_INTERNALS__: {}, addEventListener: (k: string, f: (e: unknown) => void) => { (handlers[k] ||= []).push(f); } };
    installDiag();
    installDiag();
    expect(handlers.error).toHaveLength(1);
    expect(handlers.unhandledrejection).toHaveLength(1);
    handlers.error[0]({ error: new RangeError('bad') });
    handlers.unhandledrejection[0]({ reason: { secret: 'state' } });
    handlers.error[0]({ error: null, message: 'Script error.', lineno: 0 });
    await flush();
    expect(invoke.mock.calls.map(c => (c[1] as { message: string }).message)).toEqual([
      'onerror: RangeError: bad', 'unhandled rejection: non-Error value (object)', 'onerror: Script error.',
    ]);
  });
});

describe('diagFeatures', () => {
  it('jen pevný seznam volitelných funkcí jako true/false (výchozí stav: vše vypnuto kromě výchozích voleb)', () => {
    const s = defaultState();
    const f = diagFeatures(s);
    expect(Object.keys(f)).toEqual([...DIAG_FEATURES]);
    for (const v of Object.values(f)) expect(typeof v).toBe('boolean');
    expect(f.buddy).toBe(false);
    expect(f.autoCapture).toBe(false);
    expect(f.widgets).toBe(false);
    expect(f.hotkey).toBe(false);
    const on = diagFeatures({ ...s, buddy: { ...s.buddy, enabled: true, hotkey: 'Ctrl+Shift+KeyS' }, autoCapture: { ...s.autoCapture, enabled: true } });
    expect(on.buddy && on.hotkey && on.autoCapture).toBe(true);
    /* hodnota zkratky se neposílá, jen true/false */
    expect(JSON.stringify(on)).not.toContain('KeyS');
  });
  it('seznam sedí s allow-listem v Rustu (src-tauri/src/diag.rs FEATURES)', async () => {
    const { readFileSync } = await import('node:fs');
    const rs = readFileSync(new URL('../../src-tauri/src/diag.rs', import.meta.url), 'utf8');
    const m = rs.match(/pub const FEATURES: \[&str; \d+\] = \[([^\]]*)\];/)!;
    expect([...m[1].matchAll(/"(\w+)"/g)].map(x => x[1])).toEqual([...DIAG_FEATURES]);
  });
});
