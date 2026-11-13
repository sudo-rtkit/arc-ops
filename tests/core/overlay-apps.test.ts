/* 0.16.0: celá aplikace v overlayi. Overlay vykresluje plné moduly; jejich akce jdou přes zrcadlo do hlavního okna,
   které je jediný zapisovatel. Testuje se: každá akce store je zařazená (posílá se / jen hlavní okno), id nových
   záznamů jsou v obou oknech stejná, stav se po potvrzení shoduje s hlavním oknem, overlay nic neukládá,
   panel zůstane na monitoru a overlay nenačte hub hlavního okna. */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type App } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { createOpsHub, type OverlayView } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import { BLOCKED_ACTIONS, PENDING_MS, RELAY_ACTIONS, applyRelay, createMirror, decodeArgs, encodeArgs, type RelayCall } from '../../src/store/relay';
import { UID_RE, recordIds, replayIds, uid } from '../../src/core/util';
import { PANEL_KEY, clampPanel, defaultPanel, fitPanel, movePanel, normalizePanel, readPanel, resizePanel, writePanel, type Screen } from '../../src/ops/ovPanel';

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function fakeNative(): Native {
  const ok = async () => undefined;
  return { available: true, enable: ok, setHotkey: ok, watch: ok, buddyOpen: ok, buddyClose: ok, buddyReveal: ok, overlayOpen: ok, overlayClose: ok, overlayToggle: ok, mainFocus: ok, captureNow: ok, place: ok, drag: ok, widgetsOpen: ok, widgetsClose: ok, widgetsEdit: ok, widgetsFit: ok, widgetsApp: ok, passThrough: ok, autoCapture: ok, autoStats: async () => null, captureTake: async () => new ArrayBuffer(0) };
}
async function mainApp(stored: unknown = { schema: 14, buddy: { enabled: true } }) {
  const kv = memoryKV();
  kv.setItem('arcops:state', JSON.stringify(stored));
  const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  return { app, kv };
}
/* Overlay: vlastní store (nikdy init), který zrcadlí hlavní okno; úložiště hlídá, že se do něj nic nezapíše. */
function overlayApp() {
  const kv = memoryKV();
  const writes: string[] = [];
  const st = createBrowserStorage(kv, () => NOW);
  const storage = { ...st, save: async (c: string) => { writes.push(c); } };
  return { app: createApp(storage, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 }), writes };
}
/* Hlavní okno s hubem a overlay se zrcadlem na stejném bus v paměti. */
async function pair(stored?: unknown) {
  const { app: main, kv } = await mainApp(stored);
  const buses = memoryBuses();
  const hub = createOpsHub({ app: main, bus: buses('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
  hub.start();
  const ovBus = buses('overlay');
  const ov = overlayApp();
  const mirror = createMirror(ov.app, { send: c => ovBus.send('main', 'action', c), now: () => NOW });
  const views: OverlayView[] = [];
  ovBus.on('state', v => { const x = v as OverlayView; views.push(x); mirror.receive(x.state, x.relay); });
  ovBus.send('main', 'hello', { from: 'overlay' });
  await hub.idle();
  return { main, kv, hub, ov: ov.app, writes: ov.writes, mirror, views };
}
const json = (a: App) => JSON.stringify(a.store.getState().state);

describe('0.16.0: akce store pro overlay', () => {
  it('každá akce store je zařazená: posílá se do hlavního okna, nebo je jen pro hlavní okno', async () => {
    const { app } = await mainApp();
    const names = Object.keys(app.actions).sort();
    const relay = new Set<string>(RELAY_ACTIONS), blocked = new Set(Object.keys(BLOCKED_ACTIONS));
    expect(names.filter(n => !relay.has(n) && !blocked.has(n))).toEqual([]);
    expect([...relay].filter(n => blocked.has(n))).toEqual([]);
    expect([...relay, ...blocked].filter(n => !names.includes(n))).toEqual([]);
    /* nastavení počítače, soubory a úložiště nikdy z overlaye */
    for (const n of ['setBuddy', 'setMainWindow', 'importState', 'exportBackup', 'resetAll', 'resetModule', 'restoreSnapshot', 'mapEdit', 'setMapImage', 'importFromScreens', 'importRaidLoot', 'importProgress', 'setWidgets', 'setPassClicks']) expect(blocked.has(n), n).toBe(true);
  });

  it('id: zaznamenaná id se přehrají ve stejném pořadí, jen platná, jinak nová', () => {
    const { value, ids } = recordIds(() => [uid(), uid()]);
    expect(ids).toEqual(value);
    expect(ids.every(x => UID_RE.test(x))).toBe(true);
    expect(replayIds(ids, () => [uid(), uid(), uid()]).slice(0, 2)).toEqual(ids);
    const bad = replayIds(['<script>', 'x'], () => uid());
    expect(bad).not.toBe('<script>');
    expect(UID_RE.test(bad)).toBe(true);
    /* mimo záznam se nic nehromadí */
    expect(recordIds(() => 1).ids).toEqual([]);
  });

  it('argumenty přežijí JSON beze ztráty undefined a NaN; funkce a třídy se neposílají', () => {
    const args = ['arc1', { hp: undefined, note: 'x', list: [1, undefined, NaN] }, -Infinity];
    const wire = JSON.parse(JSON.stringify(encodeArgs(args)));
    const back = decodeArgs(wire) as unknown[];
    expect(back[0]).toBe('arc1');
    expect(Object.keys(back[1] as object)).toEqual(['hp', 'note', 'list']);
    expect((back[1] as { hp: unknown }).hp).toBeUndefined();
    expect((back[1] as { list: unknown[] }).list[2]).toBeNaN();
    expect(back[2]).toBe(-Infinity);
    expect(() => encodeArgs([() => 1])).toThrow();
    expect(() => encodeArgs([new Map()])).toThrow();
    expect(decodeArgs({ __proto__x: 1, ['__proto__']: { polluted: 1 } })).not.toHaveProperty('polluted');
    /* 0.16.1: klíče z JSON.parse (vlastní klíč __proto__) prototyp nevymění; constructor ani prototype neprojdou */
    const evil = decodeArgs(JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1},"prototype":1,"ok":2}')) as Record<string, unknown>;
    expect(Object.getPrototypeOf(evil)).toBe(Object.prototype);
    expect(Object.keys(evil)).toEqual(['ok']);
    expect((evil as { polluted?: unknown }).polluted).toBeUndefined();
    expect(() => decodeArgs({ [String.fromCharCode(0) + 'n']: 'constructor' })).not.toThrow();
  });
});

describe('0.16.0: zrcadlo overlaye a hlavní okno jako jediný zapisovatel', () => {
  it('úprava v overlayi: hned v kopii, zapíše ji hlavní okno, po potvrzení jsou stavy stejné', async () => {
    const p = await pair();
    expect(p.views.length).toBeGreaterThan(0);
    p.ov.actions.toggleCheck('item-x');
    expect(p.ov.store.getState().state.checklists.checked['item-x']).toBe(true);
    expect(p.mirror.pending()).toBe(0);
    expect(p.main.store.getState().state.checklists.checked['item-x']).toBe(true);
    expect(json(p.ov)).toBe(json(p.main));
    await p.main.flush();
    expect(JSON.parse(p.kv.getItem('arcops:state')!).checklists.checked['item-x']).toBe(true);
    /* overlay nikdy neukládá */
    expect(p.writes).toEqual([]);
    expect(p.ov.store.getState().ready).toBe(false);
    p.hub.stop();
  });

  it('nový záznam má v obou oknech stejné id (bod mapy, vlastní trasa, raid)', async () => {
    const p = await pair();
    const poi = p.ov.actions.addMapPoint('dam', { type: 'note', area: '', name: 'Bunkr', note: '', x: 0.4, y: 0.6 });
    const route = p.ov.actions.addCustomRoute('Moje trasa', 'dam');
    const raid = p.ov.actions.addRaid({ map: 'dam', result: 'extracted' } as never);
    const st = p.main.store.getState().state;
    expect(st.maps.dam.pois.map(x => x.id)).toContain(poi);
    expect(st.gameData.routesCustom.map(x => x.id)).toContain(route);
    expect(st.raids.map(x => x.id)).toContain(raid);
    expect(json(p.ov)).toBe(json(p.main));
    p.hub.stop();
  });

  it('vnořená akce (invAdd → invSet) jde do hlavního okna jen jednou', async () => {
    const { app: main } = await mainApp();
    const ov = overlayApp();
    const sent: RelayCall[] = [];
    const mirror = createMirror(ov.app, { send: c => sent.push(c), now: () => NOW });
    mirror.receive(main.store.getState().state, null);
    ov.app.actions.invAdd('Metal Parts', 3);
    expect(sent.map(c => c.name)).toEqual(['invAdd']);
    for (const c of sent) applyRelay(main, JSON.parse(JSON.stringify(c)));
    expect(main.store.getState().state.inventory['Metal Parts']).toBe(3);
  });

  it('starší stav z hlavního okna nesmaže nepotvrzenou úpravu; potvrzený stav je stav hlavního okna', async () => {
    const { app: main } = await mainApp();
    const ov = overlayApp();
    const sent: RelayCall[] = [];
    let t = NOW;
    const mirror = createMirror(ov.app, { send: c => sent.push(c), now: () => t, session: 'sess01' });
    const base = main.store.getState().state;
    mirror.receive(base, null);
    ov.app.actions.setProfile('coins', 1234);
    /* mezitím hlavní okno změnilo něco jiného a poslalo stav bez potvrzení naší akce */
    main.actions.setProfile('level', 7);
    expect(mirror.receive(main.store.getState().state, null)).toBe(1);
    expect(ov.app.store.getState().state.profile).toMatchObject({ coins: 1234, level: 7 });
    /* hlavní okno akci provede a potvrdí */
    const r = applyRelay(main, JSON.parse(JSON.stringify(sent[0])));
    expect(r).toEqual({ ack: { session: 'sess01', seq: 1 }, applied: true });
    expect(mirror.receive(main.store.getState().state, r!.ack)).toBe(0);
    expect(json(ov.app)).toBe(json(main));
    /* potvrzení jiné relace (staré okno overlaye) se nepočítá; nepotvrzená akce po PENDING_MS vyprší */
    ov.app.actions.setProfile('coins', 99);
    expect(mirror.receive(main.store.getState().state, { session: 'other', seq: 99 })).toBe(1);
    t += PENDING_MS + 1;
    expect(mirror.receive(main.store.getState().state, null)).toBe(0);
    expect(ov.app.store.getState().state.profile.coins).toBe(1234);
  });

  it('akce jen pro hlavní okno v overlayi nic neudělají a nic neposílají', async () => {
    const ov = overlayApp();
    const sent: RelayCall[] = [];
    createMirror(ov.app, { send: c => sent.push(c) });
    await expect(ov.app.actions.exportBackup('x.json')).resolves.toBe(false);
    await expect(ov.app.actions.resetAll()).resolves.toBe(false);
    await expect(ov.app.actions.listSnapshots()).resolves.toEqual([]);
    expect(ov.app.actions.setBuddy({ enabled: false })).toBeUndefined();
    ov.app.actions.mapEdit('dam', () => undefined);
    expect(sent).toEqual([]);
    expect(ov.writes).toEqual([]);
    await ov.app.init();
    expect(ov.app.store.getState().ready).toBe(false);
  });

  it('hlavní okno: neznámá akce, špatná relace, velká data a chybné argumenty se nezapíšou', async () => {
    const { app: main } = await mainApp();
    const before = JSON.stringify(main.store.getState().state);
    expect(applyRelay(main, null)).toBeNull();
    expect(applyRelay(main, { session: 'BAD SESSION', seq: 1, name: 'toggleCheck', args: ['a'], ids: [] })).toBeNull();
    expect(applyRelay(main, { session: 'sess01', seq: 0, name: 'toggleCheck', args: ['a'], ids: [] })).toBeNull();
    for (const call of [
      { name: 'setBuddy', args: [{ enabled: false }] },
      { name: 'resetAll', args: [] },
      { name: 'constructor', args: [] },
      { name: 'setMapNotes', args: ['dam', 'x'.repeat(300 * 1024)] },
      { name: 'toggleCheck', args: 'a' },
      { name: 'toggleCheck', args: [1, 2, 3, 4, 5, 6, 7] },
      /* 0.16.1: jména z prototypu, nebezpečné klíče a příliš velké hodnoty */
      { name: '__proto__', args: [] },
      { name: 'toString', args: [] },
      { name: 'hasOwnProperty', args: ['setProfile'] },
      { name: 'setMapNotes', args: ['dam', 'x'.repeat(70 * 1024)] },
      { name: 'toggleCheck', args: [Array.from({ length: 5001 }, () => 0)] },
    ]) expect(applyRelay(main, { session: 'sess01', seq: 2, ids: [], ...call }), call.name).toEqual({ ack: { session: 'sess01', seq: 2 }, applied: false });
    expect(JSON.stringify(main.store.getState().state)).toBe(before);
  });

  it('hub: s vypnutým buddym hlavní okno akce z overlaye nepřijme', async () => {
    const p = await pair({ schema: 14, buddy: { enabled: false } });
    p.mirror.receive(p.main.store.getState().state, null);
    p.ov.actions.toggleCheck('item-y');
    expect(p.main.store.getState().state.checklists.checked['item-y']).toBeUndefined();
    p.hub.stop();
  });
});

describe('0.16.0: velký panel overlaye', () => {
  const A: Screen = { work: { x: 0, y: 0, w: 2560, h: 1400 }, sf: 1 };
  const B: Screen = { work: { x: 2560, y: 0, w: 3840, h: 2100 }, sf: 1.5 };
  it('bez uložení: vycentrovaný, nejvýš výchozí velikost, nikdy větší než pracovní plocha', () => {
    expect(fitPanel(null, [A, B], A)).toEqual({ x: 500, y: 200, w: 1560, h: 1000 });
    const small: Screen = { work: { x: 0, y: 0, w: 1280, h: 680 }, sf: 1 };
    const r = defaultPanel(small);
    expect(r.w).toBeLessThanOrEqual(1280);
    expect(r.h).toBeLessThanOrEqual(680);
  });
  it('uložený panel zůstane na svém monitoru a celý v pracovní ploše; mimo monitory se vycentruje', () => {
    expect(fitPanel({ x: 3000, y: 100, w: 2000, h: 1200 }, [A, B], A)).toEqual({ x: 3000, y: 100, w: 2000, h: 1200 });
    expect(fitPanel({ x: 2000, y: 900, w: 1000, h: 800 }, [A], A)).toEqual({ x: 1560, y: 600, w: 1000, h: 800 });
    expect(fitPanel({ x: 9000, y: 9000, w: 1000, h: 800 }, [A, B], A)).toEqual(defaultPanel(A));
  });
  it('změna velikosti a přesun drží minimum a hranice monitoru (měřítko monitoru)', () => {
    const r = { x: 2600, y: 50, w: 2000, h: 1200 };
    expect(resizePanel(r, -5000, -5000, B)).toMatchObject({ w: 1350, h: 900 });
    expect(resizePanel(r, 9000, 9000, B)).toMatchObject({ w: 3840, h: 2100, x: 2560, y: 0 });
    expect(movePanel(r, -9000, 9000, B)).toEqual({ x: 2560, y: 900, w: 2000, h: 1200 });
    expect(clampPanel({ x: 0, y: 0, w: 100, h: 100 }, A)).toMatchObject({ w: 900, h: 600 });
  });
  it('uložení jen v místním úložišti tohoto počítače, nesmysl se ignoruje', () => {
    const kv = memoryKV();
    writePanel({ x: 10.4, y: 20, w: 1300, h: 900 }, kv);
    expect(JSON.parse(kv.getItem(PANEL_KEY)!)).toEqual({ x: 10, y: 20, w: 1300, h: 900 });
    expect(readPanel(kv)).toEqual({ x: 10, y: 20, w: 1300, h: 900 });
    kv.setItem(PANEL_KEY, '{"x":"a"}');
    expect(readPanel(kv)).toBeNull();
    kv.setItem(PANEL_KEY, 'not json');
    expect(readPanel(kv)).toBeNull();
    expect(normalizePanel({ x: 0, y: 0, w: 50, h: 900 })).toBeNull();
    writePanel(null, kv);
    expect(kv.getItem(PANEL_KEY)).toBeNull();
  });
});

/* Overlay nesmí načíst hub hlavního okna ani ovládání hlavního okna (druhý hub = druhý zapisovatel). */
describe('0.16.0: overlay nenačte moduly jen pro hlavní okno', () => {
  const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
  function resolveImport(from: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(from), spec);
    for (const c of [base, base + '.ts', base + '.tsx', join(base, 'index.ts')]) if (existsSync(c) && !c.endsWith('.css') && /\.(tsx?)$/.test(c)) return c;
    return null;
  }
  function graph(entry: string): Set<string> {
    const seen = new Set<string>();
    const todo = [entry];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(IMPORT_RE)) { const r = resolveImport(f, m[1] || m[2] || m[3]); if (r) todo.push(r); }
    }
    return seen;
  }
  it('z overlay-main.tsx nevede import do mainHub, windowCtl, Compact, Tutorial ani Nastavení', () => {
    const files = [...graph(join(ROOT, 'src/ops/overlay-main.tsx'))].map(f => f.slice(ROOT.length).split('\\').join('/'));
    expect(files).toContain('src/ops/OverlayApps.tsx');
    expect(files).toContain('src/modules/Journal.tsx');
    for (const bad of ['src/ops/mainHub.ts', 'src/shell/windowCtl.ts', 'src/shell/Compact.tsx', 'src/shell/Tutorial.tsx', 'src/modules/Settings.tsx', 'src/modules/OpsSettings.tsx', 'src/modules/WindowSettings.tsx'])
      expect(files, bad).not.toContain(bad);
  });
});
