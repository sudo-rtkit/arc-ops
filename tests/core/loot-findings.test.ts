/* 0.8.1: snímek FINDINGS po raidu přes buddyho → rozpoznání → revize lootu → potvrzený zápis do raidu.
   Veřejné testy na umělé obrazovce (tests/vision/findings.ts) a v paměti: rozlišení obrazovek, odmítnutí jiných
   obrazovek, oddělené dávky stashe a lootu, odečtení výbavy, ruční kontrola bez výbavy, ochrana opakovaného
   zápisu, nahrazení, žádné mince, snímek stavu před zápisem a záloha (export / import). */
import { describe, expect, it } from 'vitest';
import { readCapture, screenKind } from '../../src/core/opsCapture';
import { analyzeLoot } from '../../src/core/visionImport';
import { applyRaidLoot, checkRaidLoot, lootItems, lootRows, lootSignature, minusItems, raidGear, type RaidLootInput } from '../../src/core/lootImport';
import { defaultState, normalize } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { createOpsHub } from '../../src/ops/hub';
import { memoryBuses } from '../../src/ops/bus';
import type { Native } from '../../src/ops/native';
import type { RaidLootResult } from '../../src/store/app';
import { matchContext } from '../../src/core/catalog';
import { getMaterials } from '../../src/core/gamedata';
import { loadFixture, TOOLTIP } from '../vision/load';
import { BACKPACK_COUNTS, QUICK_COUNTS, syntheticFindings } from '../vision/findings';
import type { AppState } from '../../src/core/types';

const NOW = new Date(2026, 10, 12, 20, 0).getTime();
const FINDINGS = syntheticFindings();
const counts = (r: ReturnType<typeof readCapture>, panel: string) =>
  r.kind === 'read' ? r.read.panels.find(p => p.panel === panel)?.cells.map(c => c.count) ?? null : null;

function storage() {
  const kv = memoryKV();
  const base = createBrowserStorage(kv, () => NOW);
  const saves: string[] = [], snaps: string[] = [];
  let failSnap = false;
  const adapter: StorageAdapter = {
    ...base,
    async save(c) { saves.push(c); return base.save(c); },
    async createSnapshot(k, l, c) { if (failSnap) throw new Error('disk'); snaps.push(k); return base.createSnapshot(k, l, c); },
  };
  return { adapter, saves, snaps, failSnapshots: () => { failSnap = true; } };
}
function fakeNative(): Native {
  const none = async () => undefined;
  return {
    available: true, enable: none, setHotkey: none, watch: none, buddyOpen: none, buddyClose: none,
    overlayOpen: none, overlayClose: none, overlayToggle: none, mainFocus: none, captureNow: none, captureTake: async () => new ArrayBuffer(0),
  };
}
async function setup() {
  const st = storage();
  const app = createApp(st.adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
  await app.init();
  const buses = memoryBuses();
  const hub = createOpsHub({ app, bus: buses('main'), native: fakeNative(), now: () => NOW, pushMs: 0 });
  hub.start();
  app.actions.setBuddy({ enabled: true });
  return { app, st, hub, overlay: buses('overlay'), buddy: buses('buddy') };
}
const input = (p: Partial<RaidLootInput> = {}): RaidLootInput => ({ raidId: null, items: [{ name: 'Medium Ammo', qty: 80 }], replace: false, toInventory: false, gearChecked: true, ...p });
const SIG = 'L0123456789abcdef', SIG2 = 'Lfedcba9876543210';

describe('rozlišení obrazovek snímku', () => {
  it('FINDINGS → loot: čte se jen BACKPACK a QUICK USE, žádné mince, hlavička ani STASH', () => {
    expect(screenKind(FINDINGS)).toBe('findings');
    const r = readCapture(FINDINGS);
    expect(r).toMatchObject({ kind: 'read', screen: 'loot' });
    if (r.kind !== 'read') return;
    expect(r.read.panels.map(p => p.panel)).toEqual(['backpack', 'quickUse']);
    expect(counts(r, 'backpack')).toEqual(BACKPACK_COUNTS);
    expect(counts(r, 'quickUse')).toEqual(QUICK_COUNTS);
    expect([r.read.coins, r.read.premium, r.read.stashValue, r.read.headerSlots]).toEqual([null, null, null, null]);
    /* jen čísla, žádná obrazová data */
    expect(JSON.stringify(r)).not.toMatch(/"data"/);
  });

  it('INVENTORY se STASH → stash: čte se jen STASH (batoh a quick use se do stashe nemíchají)', () => {
    const img = loadFixture(TOOLTIP);
    expect(screenKind(img)).toBe('stash');
    const r = readCapture(img);
    expect(r).toMatchObject({ kind: 'read', screen: 'stash' });
    if (r.kind === 'read') expect(r.read.panels.map(p => p.panel)).toEqual(['stash']);
  });

  it('jiná obrazovka s batohem (bez CONTINUE, např. příprava loadoutu) a snímek bez inventáře se odmítnou', () => {
    const other = syntheticFindings({ button: false });
    expect(screenKind(other)).toBe('backpack');
    expect(readCapture(other)).toEqual({ kind: 'empty', reason: 'otherScreen' });
    const blank = { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4).fill(30) };
    expect(readCapture(blank)).toEqual({ kind: 'empty', reason: 'noInventory' });
    expect(readCapture({ width: 10, height: 10, data: new Uint8ClampedArray(4) })).toEqual({ kind: 'empty', reason: 'noInventory' });
    /* krémová plocha jinde (ne plné tlačítko) obrazovku FINDINGS nedělá */
    const strip = syntheticFindings({ button: false });
    for (let x = 1673; x < 1872; x++) strip.data.set([249, 238, 223, 255], (1030 * strip.width + x) * 4);
    expect(screenKind(strip)).toBe('backpack');
  });

  it('podpis snímku: stejná obrazovka = stejný podpis, jiný obsah = jiný; STASH se nezapočítá', () => {
    const a = readCapture(FINDINGS), b = readCapture(syntheticFindings()), c = readCapture(syntheticFindings({ skip: [1] }));
    if (a.kind !== 'read' || b.kind !== 'read' || c.kind !== 'read') throw new Error('read');
    expect(lootSignature(a.read)).toMatch(/^L[0-9a-f]{16}$/);
    expect(lootSignature(a.read)).toBe(lootSignature(b.read));
    expect(lootSignature(a.read)).not.toBe(lootSignature(c.read));
    const stash = readCapture(loadFixture(TOOLTIP));
    if (stash.kind !== 'read') throw new Error('stash');
    expect(lootSignature({ panels: [...a.read.panels, ...stash.read.panels] })).toBe(lootSignature(a.read));
  });
});

describe('výbava a loot (čisté funkce)', () => {
  it('výbava raidu se odečte po řádcích; neznámý název nic neodečte; jen kladný loot', () => {
    const rows = lootRows([
      { id: 'a', name: 'Medium Ammo', qty: 80 }, { id: 'b', name: 'medium ammo', qty: 80 }, { id: 'c', name: 'Bandage', qty: 2 }, { id: 'd', name: '', qty: 5 },
    ], [{ name: 'Medium Ammo', qty: 100 }, { name: 'Bandage', qty: 3 }]);
    expect(rows.map(r => [r.found, r.gear, r.loot])).toEqual([[80, 80, 0], [80, 20, 60], [2, 2, 0], [5, 0, 0]]);
    expect(lootItems(rows)).toEqual([{ name: 'medium ammo', qty: 60 }]);
  });

  it('výbava: zadaná u raidu, jinak položky loadoutu, jinak neznámá', () => {
    const lo = { id: 'L1', name: 'x', purpose: '', primary: 'Anvil', secondary: '', augment: '', shield: '', items: [{ name: 'Bandage', qty: 3 }], note: '' };
    expect(raidGear({ gear: [{ name: 'Heavy Ammo', qty: 40 }], loadout: 'L1' }, [lo])).toEqual({ items: [{ name: 'Heavy Ammo', qty: 40 }], source: 'raid' });
    expect(raidGear({ gear: [], loadout: 'L1' }, [lo])).toEqual({ items: [{ name: 'Bandage', qty: 3 }], source: 'loadout' });
    expect(raidGear({ gear: [], loadout: '' }, [lo]).source).toBe('none');
    expect(raidGear(null, [lo]).source).toBe('none');
  });

  it('minusItems odečte nahrazovaný loot, zbytek zůstane', () => {
    expect(minusItems([{ name: 'A', qty: 5 }, { name: 'B', qty: 1 }], [{ name: 'A', qty: 2 }, { name: 'B', qty: 4 }])).toEqual([{ name: 'A', qty: 3 }]);
  });

  it('kontrola: prázdný loot, špatný podpis, chybějící raid, bez výbavy bez ruční kontroly, nahrazení, duplicita', () => {
    const s = defaultState(NOW);
    expect(checkRaidLoot(s, input({ items: [] }), SIG)).toBe('empty');
    expect(checkRaidLoot(s, input(), 'L12')).toBe('badSig');
    expect(checkRaidLoot(s, input({ raidId: 'nope' }), SIG)).toBe('noRaid');
    expect(checkRaidLoot(s, input({ gearChecked: false }), SIG)).toBe('gearUnchecked');
    expect(checkRaidLoot(s, input(), SIG)).toBeNull();
    const done = applyRaidLoot(s, input(), SIG, NOW, 'R1');
    expect(done.created).toBe(true);
    expect(checkRaidLoot(s, input({ raidId: 'R1' }), SIG)).toBe('duplicate');
    expect(checkRaidLoot(s, input({ raidId: 'R1' }), SIG2)).toBe('replaceNeeded');
    expect(checkRaidLoot(s, input({ raidId: 'R1', replace: true }), SIG2)).toBeNull();
  });
});

describe('zápis lootu do raidu', () => {
  function withRaid(): AppState {
    const s = defaultState(NOW);
    s.profile.coins = 58313;
    s.raids.push(normalize({ ...s, raids: [{ id: 'R1', ts: NOW - 600_000, map: 'buried', coins: 1200, gear: [{ name: 'Medium Ammo', qty: 100 }], loot: [{ name: 'Rusted Tools', qty: 1 }] }] }, NOW).raids[0]);
    return s;
  }

  it('existující raid: loot přidán k ručnímu, mince profilu i výdělek raidu beze změny, převod jen rozdílu', () => {
    const s = withRaid();
    const items = lootItems(lootRows([{ id: 'a', name: 'Medium Ammo', qty: 320 }, { id: 'b', name: 'Bandage', qty: 2 }], s.raids[0].gear));
    expect(items).toEqual([{ name: 'Medium Ammo', qty: 220 }, { name: 'Bandage', qty: 2 }]);
    const r = applyRaidLoot(s, input({ raidId: 'R1', items, toInventory: true, gearChecked: false }), SIG, NOW, 'x');
    const raid = s.raids[0];
    expect(raid.loot).toEqual([{ name: 'Rusted Tools', qty: 1 }, { name: 'Medium Ammo', qty: 220 }, { name: 'Bandage', qty: 2 }]);
    expect(raid.lootScan).toEqual({ sig: SIG, at: NOW, items });
    expect([s.profile.coins, raid.coins, s.profile.rounds]).toEqual([58313, 1200, 0]);
    expect(r.inventory).toEqual({ 'Rusted Tools': 1, 'Medium Ammo': 220, Bandage: 2 });
    expect(s.inventory['Medium Ammo']).toBe(220);
  });

  it('nahrazení: nový snímek téhož raidu loot nahradí (nepřičte), Inventory dostane jen rozdíl', () => {
    const s = withRaid();
    applyRaidLoot(s, input({ raidId: 'R1', items: [{ name: 'Bandage', qty: 2 }], toInventory: true }), SIG, NOW, 'x');
    const r = applyRaidLoot(s, input({ raidId: 'R1', items: [{ name: 'Bandage', qty: 3 }], replace: true, toInventory: true }), SIG2, NOW + 1, 'y');
    expect(r.replaced).toEqual([{ name: 'Bandage', qty: 2 }]);
    expect(s.raids[0].loot).toEqual([{ name: 'Rusted Tools', qty: 1 }, { name: 'Bandage', qty: 3 }]);
    expect(r.inventory).toEqual({ Bandage: 1 });
    expect(s.inventory.Bandage).toBe(3);
  });

  it('nový raid: mapa z volby, přežitý, výdělek 0, započítá se kolo; mince se nemění', () => {
    const s = defaultState(NOW);
    s.profile.coins = 58313;
    const r = applyRaidLoot(s, input({ map: 'stella' }), SIG, NOW, 'NEW');
    expect(r).toMatchObject({ raidId: 'NEW', created: true });
    expect(s.raids[0]).toMatchObject({ id: 'NEW', map: 'stella', ok: true, coins: 0, loot: [{ name: 'Medium Ammo', qty: 80 }], lootApplied: [] });
    expect([s.profile.rounds, s.profile.coins]).toEqual([1, 58313]);
    expect(s.inventory).toEqual({});
  });

  it('záloha: loot ze snímku se exportuje i importuje; neplatný podpis se zahodí', () => {
    const s = defaultState(NOW);
    applyRaidLoot(s, input(), SIG, NOW, 'R9');
    const back = parseBackup(makeBackup(s, new Date(NOW)), NOW);
    if ('error' in back) throw new Error('backup');
    expect(back.state.raids[0].lootScan).toEqual({ sig: SIG, at: NOW, items: [{ name: 'Medium Ammo', qty: 80 }] });
    const bad = normalize({ ...s, raids: [{ ...s.raids[0], lootScan: { sig: '<script>', at: 1, items: [] } }] }, NOW);
    expect(bad.raids[0].lootScan).toBeUndefined();
    expect('lootScan' in normalize({ ...s, raids: [{ id: 'x' }] }, NOW).raids[0]).toBe(false);
  });
});

describe('hub: snímek FINDINGS, oddělené dávky a zápis přes hlavní okno', () => {
  it('loot jde mimo dávku stashe; stash ho nesmaže; zahození jednoho nechá druhé', async () => {
    const { hub, buddy } = await setup();
    const statuses: unknown[] = [];
    buddy.on('status', x => statuses.push(x));
    expect(hub.handleCapture(FINDINGS)).toBe('loot');
    expect(hub.batch()).toMatchObject({ shots: [], last: 'loot' });
    expect(hub.batch().loot!.read.panels.map(p => p.panel)).toEqual(['backpack', 'quickUse']);
    expect(statuses.at(-1)).toMatchObject({ anim: 'inspect', line: { line: 'loot.found' } });
    expect(hub.handleCapture(loadFixture(TOOLTIP))).toBe('read');
    expect(hub.batch().shots).toHaveLength(1);
    expect(hub.batch().loot).not.toBeNull();
    expect(hub.batch().shots[0].read.panels.map(p => p.panel)).toEqual(['stash']);
    expect(JSON.stringify(hub.batch())).not.toMatch(/"data"/);
  });

  it('batchClear zahodí jen stash, lootClear jen loot; jiná obrazovka nic nezapíše', async () => {
    const { app, hub, overlay, st } = await setup();
    hub.handleCapture(FINDINGS); hub.handleCapture(loadFixture(TOOLTIP));
    overlay.send('main', 'batchClear');
    expect(hub.batch().shots).toEqual([]);
    expect(hub.batch().loot).not.toBeNull();
    hub.handleCapture(loadFixture(TOOLTIP));
    overlay.send('main', 'lootClear');
    expect(hub.batch().loot).toBeNull();
    expect(hub.batch().shots).toHaveLength(1);
    await app.flush();
    const before = app.store.getState().state, saves = st.saves.length;
    expect(hub.handleCapture(syntheticFindings({ button: false }))).toBe('empty');
    expect(hub.batch()).toMatchObject({ rejected: 'otherScreen' });
    await app.flush();
    expect(app.store.getState().state).toBe(before);
    expect(st.saves.length).toBe(saves);
  });

  it('bez výbavy jen s ruční kontrolou; zápis se snímkem stavu; opakovaný snímek se znovu nezapíše; mince beze změny', async () => {
    const { app, hub, overlay, st } = await setup();
    app.actions.setProfile('coins', 58313);
    const results: RaidLootResult[] = [];
    overlay.on('lootImported', p => results.push((p as { result: RaidLootResult }).result));
    const s0 = app.store.getState().state;
    hub.handleCapture(FINDINGS);
    const shot = hub.batch().loot!;
    const a = analyzeLoot(shot.read, s0.vision.learned, matchContext(getMaterials(s0).map(m => m.name)));
    expect(a.groups.length).toBeGreaterThan(0);
    const items = [{ name: 'Light Ammo', qty: 156 }];

    /* bez ruční kontroly výbavy: odmítnuto, žádný snímek stavu ani změna */
    const snaps0 = st.snaps.length;
    await hub.importLoot(shot.id, input({ items, gearChecked: false }));
    expect(results.at(-1)).toEqual({ ok: false, reason: 'gearUnchecked' });
    expect(st.snaps.length).toBe(snaps0);
    expect(app.store.getState().state.raids).toEqual([]);

    /* zastaralé id snímku (overlay se starým výsledkem): nic */
    await hub.importLoot(shot.id + 99, input({ items }));
    expect(results.at(-1)).toEqual({ ok: false, reason: 'empty' });

    /* potvrzený zápis přes zprávu z overlaye */
    const done = new Promise(res => overlay.on('lootImported', res));
    overlay.send('main', 'lootImport', { shotId: shot.id, input: { ...input({ items, toInventory: true, map: 'dam' }), coins: 999999 } });
    await done;
    expect(results.at(-1)).toMatchObject({ ok: true, created: true, items });
    expect(st.snaps.at(-1)).toBe('import');
    const s1 = app.store.getState().state;
    expect(s1.raids).toHaveLength(1);
    expect(s1.raids[0]).toMatchObject({ loot: items, coins: 0, lootScan: { sig: shot.sig } });
    expect(s1.profile.coins).toBe(58313);
    expect(s1.inventory['Light Ammo']).toBe(156);
    expect(hub.batch().loot).toBeNull();

    /* stejná obrazovka znovu (dvojí stisk zkratky): rozpozná se a nezapíše */
    hub.handleCapture(syntheticFindings());
    const again = hub.batch().loot!;
    expect(again.sig).toBe(shot.sig);
    await hub.importLoot(again.id, input({ raidId: s1.raids[0].id, items, replace: true }));
    expect(results.at(-1)).toEqual({ ok: false, reason: 'duplicate' });
    expect(app.store.getState().state.raids[0].loot).toEqual(items);
    expect(app.store.getState().state.inventory['Light Ammo']).toBe(156);
  });

  it('nepovedený snímek stavu: nic se nezapíše', async () => {
    const { app, hub, st } = await setup();
    hub.handleCapture(FINDINGS);
    st.failSnapshots();
    const r = await hub.importLoot(hub.batch().loot!.id, input());
    expect(r).toEqual({ ok: false, reason: 'snapshot' });
    expect(app.store.getState().state.raids).toEqual([]);
    expect(hub.batch().loot).not.toBeNull();
  });

  it('vstup z overlaye se ověří: neplatná zpráva se ignoruje', async () => {
    const { app, hub, overlay } = await setup();
    hub.handleCapture(FINDINGS);
    const id = hub.batch().loot!.id;
    for (const bad of [null, { shotId: 'x' }, { shotId: id, input: { raidId: 5, items: [] } }, { shotId: id, input: { raidId: null, items: 'x' } }]) overlay.send('main', 'lootImport', bad);
    await app.flush();
    expect(app.store.getState().state.raids).toEqual([]);
    expect(hub.batch().loot).not.toBeNull();
  });
});

describe('bezpečnost: loot ze snímku nezná mince ani úložiště', () => {
  it('lootImport a opsCapture nikdy nezapisují mince profilu ani výdělek existujícího raidu; hub nečte mince z FINDINGS', async () => {
    const { readFileSync } = await import('node:fs');
    const src = (f: string) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const li = src('src/core/lootImport.ts'), oc = src('src/core/opsCapture.ts'), hub = src('src/ops/hub.ts');
    expect(li).not.toMatch(/profile\.coins\s*=|\.coins\s*[+-]?=/);
    expect(li.match(/coins/g)).toEqual(['coins']); /* jediný výskyt: nový raid má výdělek 0 */
    expect(oc).toMatch(/coins: null, premium: null/);
    for (const s of [li, oc, hub]) for (const w of ['localStorage', 'storage.save', 'saveImportRaw', 'toDataURL', 'new Blob', 'fetch(']) expect(s.includes(w), w).toBe(false);
  });
});
