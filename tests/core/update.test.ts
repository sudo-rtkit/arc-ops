/* 0.33.0: volitelná kontrola nové verze: normalizace (i nesmyslné hodnoty), výsledek z Rustu, pruh a skrytí verze,
   jedna hláška Opse za verzi, automatická kontrola jen se zapnutím, nejvýš jednou za den a nikdy při hře v popředí.
   Žádná síť: nativní vrstva je zástupná. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { makeBackup } from '../../src/core/backup';
import { APP_VERSION } from '../../src/core/whatsnew';
import {
  announceVersion, autoDue, bannerRelease, emptyUpdate, fromNative, mapUpdateError, newerRelease, newerThanApp, nextDelay, normalizeUpdate,
  plainNotes, releaseUrl, releaseUrlOk, RELEASES_PREFIX, UPDATE_DAY_MS, UPDATE_DEFER_MS, UPDATE_IDLE_MS, UPDATE_START_MS, type UpdatePrefs,
} from '../../src/core/update';
import { createUpdateController } from '../../src/ops/updateHub';
import type { GameInfo } from '../../src/core/ai';
import type { LineRef } from '../../src/core/opsVoice';
import type { UpdateNative } from '../../src/shell/updateNative';

const NOW = new Date(2026, 10, 19, 12, 0).getTime();
const NEXT = '0.99.0';
const info = (latest = NEXT, extra: Record<string, unknown> = {}) => ({
  latest, current: APP_VERSION, newer: true, url: releaseUrl(latest), name: 'Ops ' + latest, publishedAt: '2026-12-01T10:00:00Z',
  notes: '## Novinky\n- **Ops** <b>umí</b> [víc](https://evil.example)', cached: false, ...extra,
});
const ok = (latest = NEXT) => ({ ok: true as const, release: { latest, url: releaseUrl(latest), name: '', publishedAt: '', notes: '' } });
const prefs = (p: Partial<UpdatePrefs> = {}): UpdatePrefs => ({ ...emptyUpdate(), ...p });

async function makeApp(stored?: unknown, now: () => number = () => NOW): Promise<App> {
  const kv = memoryKV();
  if (stored !== undefined) kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, now), { now, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return app;
}

describe('0.33.0: normalizace nastavení kontroly', () => {
  it('výchozí stav vypnuto; ve starším stavu pole chybí; schéma zůstává 19', () => {
    expect(SCHEMA).toBe(19);
    expect(defaultState(NOW).update).toEqual({ enabled: false, lastCheck: 0, lastResult: null, skippedVersion: '', notifiedVersion: '' });
    expect(normalize({ schema: 19 }, NOW).update).toEqual(emptyUpdate());
    expect(normalize({ schema: 12 }, NOW).update).toEqual(emptyUpdate());
  });

  it('nesmyslné hodnoty: výchozí hodnoty, nikdy výjimka', () => {
    for (const raw of [null, undefined, 1, 'x', [], [1, 2], true, { enabled: 'true' }, { enabled: 1 }, JSON.parse('{"__proto__":{"enabled":true}}')]) {
      expect(normalizeUpdate(raw, NOW), JSON.stringify(raw)).toEqual(emptyUpdate());
    }
    const n = normalizeUpdate({
      enabled: true, lastCheck: NOW - 5000, skippedVersion: '0.40.0', notifiedVersion: 'v0.41.0',
      lastResult: { ok: true, release: { latest: '0.40.0', url: 'https://evil.example/x.exe', name: '<img src=x onerror=alert(1)> Ops‮', publishedAt: 'zítra', notes: 42 } },
    }, NOW);
    expect(n.enabled).toBe(true);
    expect(n.lastCheck).toBe(NOW - 5000);
    expect(n.skippedVersion).toBe('0.40.0');
    expect(n.notifiedVersion).toBe('');
    /* adresa se nikdy nepřevezme: spočítá se z ověřené verze */
    expect(n.lastResult).toEqual({ ok: true, release: { latest: '0.40.0', url: RELEASES_PREFIX + 'tag/v0.40.0', name: 'Ops', publishedAt: '', notes: '' } });
    for (const lastCheck of [NaN, Infinity, -Infinity, -5, 0, '123', NOW + 3600_000, 1e300]) expect(normalizeUpdate({ lastCheck }, NOW).lastCheck, String(lastCheck)).toBe(0);
    expect(normalizeUpdate({ lastCheck: NOW + 1.5 }, NOW).lastCheck).toBe(NOW + 1);
    for (const v of ['', 'v1.0.0', '1.0', '1.0.0.0', '1.0.0-beta', ' 1.0.0', 1, null, '1234567890.0.0']) {
      expect(normalizeUpdate({ skippedVersion: v, notifiedVersion: v }, NOW), String(v)).toMatchObject({ skippedVersion: '', notifiedVersion: '' });
    }
    for (const lastResult of [{ ok: 'true', release: { latest: '1.0.0' } }, { ok: true }, { ok: true, release: { latest: 'v1.0.0' } }, { ok: true, release: [] },
      { ok: false, error: 'evil' }, { ok: false }, { ok: false, error: 'toString' }, 'x', [], 5]) {
      expect(normalizeUpdate({ lastResult }, NOW).lastResult, JSON.stringify(lastResult)).toBeNull();
    }
    expect(normalizeUpdate({ lastResult: { ok: false, error: 'rate', url: 'https://evil.example' } }, NOW).lastResult).toEqual({ ok: false, error: 'rate' });
    /* poznámky jen jako prostý text a omezená délka; čas jen ISO */
    const r = normalizeUpdate({ lastResult: { ok: true, release: { latest: '1.0.0', notes: '## A\n**b** <script>x</script> [odkaz](javascript:alert(1)) https://evil.example ' + 'x'.repeat(5000), publishedAt: '2026-12-01T10:00:00Z' } } }, NOW).lastResult;
    expect(r?.ok && r.release.notes.startsWith('A\nb x odkaz')).toBe(true);
    expect(r?.ok && r.release.notes).not.toMatch(/<|>|\*\*|javascript|https?:|##/);
    expect(r?.ok && r.release.notes.length).toBeLessThanOrEqual(2000);
    expect(r?.ok && r.release.publishedAt).toBe('2026-12-01T10:00:00Z');
  });

  it('import zálohy, obnova ani reset nastavení kontroly nemění (nezapne ji, nepřevezme adresu ani skrytou verzi)', async () => {
    const app = await makeApp({ schema: 19, update: { enabled: false, skippedVersion: '0.50.0' } });
    const other = { ...defaultState(NOW), update: { enabled: true, lastCheck: NOW, skippedVersion: '9.9.9', notifiedVersion: '9.9.9', lastResult: { ok: true, release: { latest: '9.9.9', url: 'https://evil.example' } } } };
    expect(await app.actions.importState(normalize(JSON.parse(makeBackup(other as never, new Date(NOW))).state, NOW), '{}', 'app')).toBe(true);
    expect(app.store.getState().state.update).toEqual({ ...emptyUpdate(), skippedVersion: '0.50.0' });
    /* záloha sama projde normalizací: adresa se spočítá z verze */
    expect(normalize(other, NOW).update.lastResult).toEqual({ ok: true, release: { latest: '9.9.9', url: releaseUrl('9.9.9'), name: '', publishedAt: '', notes: '' } });
  });
});

describe('0.33.0: výsledek z Rustu', () => {
  it('verze a adresa se ověří znovu (stejné pravidlo jako v Rustu)', () => {
    expect(fromNative(info())).toEqual({ ok: true, release: { latest: NEXT, url: releaseUrl(NEXT), name: 'Ops ' + NEXT, publishedAt: '2026-12-01T10:00:00Z', notes: 'Novinky\nOps umí víc' } });
    for (const bad of [
      info(NEXT, { url: 'https://github.com.evil.com/sudo-rtkit/arc-ops/releases/tag/v0.99.0' }),
      info(NEXT, { url: 'https://github.com/sudo-rtkit/arc-ops-evil/releases/tag/v0.99.0' }),
      info(NEXT, { url: 'https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.98.0' }),
      info(NEXT, { url: 'https://github.com/sudo-rtkit/arc-ops/releases/tag/v0.99.0/../../../evil' }),
      info(NEXT, { url: 'http://github.com/sudo-rtkit/arc-ops/releases/tag/v0.99.0' }),
      info('v0.99.0'), info('0.99'), null, 'x', [], { latest: NEXT },
    ]) expect(fromNative(bad), JSON.stringify(bad)).toEqual({ ok: false, error: 'bad' });
    expect(releaseUrlOk(releaseUrl('1.2.3'), '1.2.3')).toBe(true);
    expect(releaseUrlOk(releaseUrl('1.2.3') + '?x', '1.2.3')).toBe(false);
    expect(releaseUrl('1.2.3')).toBe('https://github.com/sudo-rtkit/arc-ops/releases/tag/v1.2.3');
  });

  it('kódy chyb z Rustu; cokoli jiného = chybná odpověď', () => {
    for (const c of ['offline', 'timeout', 'rate', 'bad', 'none', 'game', 'window', 'unavailable'] as const) {
      expect(mapUpdateError('update:' + c)).toBe(c);
      expect(mapUpdateError(new Error('update:' + c))).toBe(c);
    }
    for (const x of ['ai:offline', 'update:evil', 'update:', 'offline', null, 42, { message: 'update:rate' }, 'update:rate ']) expect(mapUpdateError(x), String(x)).toBe('bad');
  });

  it('porovnání verzí s verzí aplikace (0.10.0 > 0.9.9, stejná verze = ne)', () => {
    expect(newerThanApp('0.10.0', '0.9.9')).toBe(true);
    expect(newerThanApp('0.9.9', '0.10.0')).toBe(false);
    expect(newerThanApp(APP_VERSION)).toBe(false);
    expect(newerThanApp('99.0.0')).toBe(true);
    expect(newerThanApp('nesmysl')).toBe(false);
  });

  it('poznámky jako prostý text', () => {
    expect(plainNotes('<a href="https://evil.example">klik</a> **tučně** ![obr](https://x/y.png)\n\n\n\nkonec')).toBe('klik tučně obr\n\nkonec');
    expect(plainNotes(null)).toBe('');
  });
});

describe('0.33.0: pruh a skrytí verze', () => {
  it('pruh jen se zapnutou kontrolou, jen pro novější verzi, ne pro skrytou', () => {
    expect(bannerRelease(prefs({ lastResult: ok() }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok() }))?.latest).toBe(NEXT);
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok(APP_VERSION) }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok('0.1.0') }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: { ok: false, error: 'offline' } }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: null }))).toBeNull();
    /* skrytá verze (i starší) se neukáže, novější než skrytá ano */
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok(), skippedVersion: NEXT }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok(), skippedVersion: '1.0.0' }))).toBeNull();
    expect(bannerRelease(prefs({ enabled: true, lastResult: ok(), skippedVersion: '0.98.0' }))?.latest).toBe(NEXT);
    /* výsledek ručního ověření je vidět v Nastavení i s vypnutou kontrolou */
    expect(newerRelease(prefs({ lastResult: ok() }))?.latest).toBe(NEXT);
  });

  it('akce: skrýt jde jen novější verzi z posledního výsledku; čas jen u kontroly, která šla na síť', async () => {
    const app = await makeApp({ schema: 19 });
    const a = app.actions, up = () => app.store.getState().state.update;
    a.setUpdateCheck(true);
    expect(up().enabled).toBe(true);
    a.updateSkip(NEXT);
    expect(up().skippedVersion).toBe('');
    a.updateResult({ ok: false, error: 'game' }, NOW);
    expect(up()).toMatchObject({ lastCheck: 0, lastResult: { ok: false, error: 'game' } });
    a.updateResult({ ok: false, error: 'unavailable' }, NOW);
    expect(up().lastCheck).toBe(0);
    a.updateResult({ ok: false, error: 'offline' }, NOW);
    expect(up().lastCheck).toBe(NOW);
    a.updateResult(ok(), NOW + 1000);
    expect(up()).toMatchObject({ lastCheck: NOW + 1000, lastResult: ok() });
    /* výsledek s cizí adresou: adresa se spočítá z verze */
    a.updateResult({ ok: true, release: { ...ok().release, url: 'https://evil.example' } }, NOW + 2000);
    expect(up().lastResult).toEqual(ok());
    a.updateResult({ ok: true, release: { latest: 'evil' } } as never, NOW + 3000);
    expect(up().lastCheck).toBe(NOW + 2000);
    a.updateSkip('0.98.0');
    expect(up().skippedVersion).toBe('');
    a.updateSkip(NEXT);
    expect(up().skippedVersion).toBe(NEXT);
    expect(bannerRelease(up())).toBeNull();
    a.updateNotified('nesmysl');
    expect(up().notifiedVersion).toBe('');
    a.updateNotified(NEXT);
    expect(up().notifiedVersion).toBe(NEXT);
    a.setUpdateCheck(false);
    expect(up().enabled).toBe(false);
  });
});

describe('0.33.0: kdy kontrolovat a kdy smí Ops promluvit', () => {
  it('automaticky jen se zapnutím a nejvýš jednou za den', () => {
    expect(autoDue(prefs(), NOW)).toBe(false);
    expect(autoDue(prefs({ lastCheck: 0 }), NOW)).toBe(false);
    expect(autoDue(prefs({ enabled: true }), NOW)).toBe(true);
    expect(autoDue(prefs({ enabled: true, lastCheck: NOW - UPDATE_DAY_MS + 1 }), NOW)).toBe(false);
    expect(autoDue(prefs({ enabled: true, lastCheck: NOW - UPDATE_DAY_MS }), NOW)).toBe(true);
    expect(nextDelay(prefs(), NOW)).toBe(UPDATE_IDLE_MS);
    expect(nextDelay(prefs({ enabled: true, lastCheck: NOW }), NOW)).toBe(UPDATE_IDLE_MS);
    expect(nextDelay(prefs({ enabled: true, lastCheck: NOW - UPDATE_DAY_MS + 60_000 }), NOW)).toBe(60_000);
    expect(nextDelay(prefs({ enabled: true, lastCheck: 0 }), NOW)).toBe(1000);
  });

  it('hláška jen jednou za verzi, se zapnutými dialogy a buddym, mimo raid a ne při hře v popředí', () => {
    const base = { ...defaultState(NOW), buddy: { ...defaultState(NOW).buddy, enabled: true }, update: prefs({ enabled: true, lastResult: ok() }) };
    const away: GameInfo = { known: true, running: false, visible: false, screen: null };
    expect(announceVersion(base, away)).toBe(NEXT);
    expect(announceVersion({ ...base, update: { ...base.update, notifiedVersion: NEXT } }, away)).toBeNull();
    expect(announceVersion({ ...base, opsPrefs: { ...base.opsPrefs, dialogs: false } }, away)).toBeNull();
    expect(announceVersion({ ...base, buddy: { ...base.buddy, enabled: false } }, away)).toBeNull();
    expect(announceVersion({ ...base, update: { ...base.update, enabled: false } }, away)).toBeNull();
    expect(announceVersion({ ...base, update: { ...base.update, skippedVersion: NEXT } }, away)).toBeNull();
    /* hra v popředí, hra běží bez jistoty mimo raid, nebo průběh raidu v raidu */
    expect(announceVersion(base, { ...away, running: true, visible: true })).toBeNull();
    expect(announceVersion(base, { ...away, running: true })).toBeNull();
    expect(announceVersion(base, { ...away, known: false })).toBeNull();
    expect(announceVersion({ ...base, raidLife: { ...base.raidLife, phase: 'inRaid' } }, away)).toBeNull();
  });
});

describe('0.33.0: obsluha kontroly (zástupná nativní vrstva, falešné hodiny)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  function setup(stored: Record<string, unknown> = {}, reply: () => Promise<unknown> = () => Promise.resolve(info())) {
    const calls: number[] = [];
    const said: LineRef[] = [];
    const game: GameInfo = { known: true, running: false, visible: false, screen: null };
    const native: UpdateNative = { available: true, check: () => { calls.push(Date.now()); return reply(); } };
    return makeApp({ schema: 19, buddy: { enabled: true }, ...stored }, () => Date.now()).then(app => {
      const c = createUpdateController({ app, native, port: { say: (_a, l) => { said.push(l); }, game: () => game }, now: () => Date.now() });
      return { app, c, calls, said, game, up: () => app.store.getState().state.update };
    });
  }

  it('vypnutá kontrola: nic automaticky, ani po dnech', async () => {
    const { c, calls } = await setup();
    c.start();
    await vi.advanceTimersByTimeAsync(3 * UPDATE_DAY_MS);
    expect(calls).toEqual([]);
    c.stop();
  });

  it('zapnutá: chvíli po startu, pak nejvýš jednou za den; Ops řekne hlášku jednou', async () => {
    const { c, calls, said, up } = await setup({ update: { enabled: true } });
    c.start();
    await vi.advanceTimersByTimeAsync(UPDATE_START_MS - 1000);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.length).toBe(1);
    expect(up()).toMatchObject({ lastCheck: NOW + UPDATE_START_MS, lastResult: { ok: true, release: { latest: NEXT } }, notifiedVersion: NEXT });
    expect(bannerRelease(up())?.latest).toBe(NEXT);
    expect(said).toEqual([{ line: 'update.available', params: { version: NEXT } }]);
    await vi.advanceTimersByTimeAsync(UPDATE_DAY_MS - 60_000);
    expect(calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(UPDATE_IDLE_MS + 60_000);
    expect(calls.length).toBe(2);
    /* stejná verze podruhé: žádná další hláška */
    expect(said.length).toBe(1);
    c.stop();
  });

  it('zapnutí v Nastavení naplánuje kontrolu za chvíli (ne hned)', async () => {
    const { app, c, calls } = await setup();
    c.start();
    await vi.advanceTimersByTimeAsync(UPDATE_START_MS + 1000);
    app.actions.setUpdateCheck(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(UPDATE_START_MS);
    expect(calls.length).toBe(1);
    c.stop();
  });

  it('hra v popředí: kontrola počká a nic se neposílá; pak proběhne', async () => {
    const { c, calls, game, up } = await setup({ update: { enabled: true } });
    game.running = true; game.visible = true;
    c.start();
    await vi.advanceTimersByTimeAsync(UPDATE_START_MS + 1000);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(3 * UPDATE_DEFER_MS);
    expect(calls).toEqual([]);
    expect(up().lastCheck).toBe(0);
    game.visible = false;
    await vi.advanceTimersByTimeAsync(UPDATE_DEFER_MS);
    expect(calls.length).toBe(1);
    expect(up().lastCheck).toBeGreaterThan(0);
    c.stop();
  });

  it('Rust hlásí hru v popředí (update:game): nic se neuloží a kontrola se odloží', async () => {
    let n = 0;
    const { c, calls, up } = await setup({ update: { enabled: true } }, () => (++n === 1 ? Promise.reject('update:game') : Promise.resolve(info())));
    c.start();
    await vi.advanceTimersByTimeAsync(UPDATE_START_MS + 1000);
    expect(calls.length).toBe(1);
    expect(up()).toMatchObject({ lastCheck: 0, lastResult: null });
    await vi.advanceTimersByTimeAsync(UPDATE_DEFER_MS);
    expect(calls.length).toBe(2);
    expect(up().lastResult).toMatchObject({ ok: true });
    c.stop();
  });

  it('ručně i s vypnutou kontrolou; chyba se uloží; bez Opse a bez pruhu', async () => {
    let fail = true;
    const { c, calls, said, up } = await setup({}, () => (fail ? Promise.reject('update:rate') : Promise.resolve(info())));
    expect(await c.check(true)).toEqual({ ok: false, error: 'rate' });
    expect(up()).toMatchObject({ enabled: false, lastCheck: NOW, lastResult: { ok: false, error: 'rate' } });
    fail = false;
    expect((await c.check(true))?.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(newerRelease(up())?.latest).toBe(NEXT);
    expect(bannerRelease(up())).toBeNull();
    expect(said).toEqual([]);
  });

  it('nejvýš jedna kontrola současně; pojistka času v okně; bez nativní vrstvy nic', async () => {
    const { app, c, calls } = await setup({}, () => new Promise(() => undefined));
    const first = c.check(true);
    expect(c.busy()).toBe(true);
    expect(await c.check(true)).toBeNull();
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await first).toEqual({ ok: false, error: 'timeout' });
    expect(c.busy()).toBe(false);
    expect(calls.length).toBe(1);
    /* vypršení v okně je chyba sítě (počítá se); bez nativní vrstvy se na síť nešlo (nepočítá se) */
    const before = app.store.getState().state.update.lastCheck;
    expect(before).toBeGreaterThan(0);
    const none = createUpdateController({ app, native: { available: false, check: () => Promise.reject(new Error('x')) }, port: { say: () => undefined, game: () => ({ known: false, running: false, visible: false, screen: null }) } });
    expect(await none.check(true)).toEqual({ ok: false, error: 'unavailable' });
    expect(app.store.getState().state.update).toMatchObject({ lastCheck: before, lastResult: { ok: false, error: 'unavailable' } });
  });
});
