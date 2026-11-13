/* 0.21.0 (schéma 18): původ hodnot. Každá cesta zápisu (ruční úpravy, snímek ze souboru i ze zkratky, loot
   FINDINGS, postup ze snímku, automatický zápis raidu a fronta „Ke kontrole“, import zálohy, reset), migrace
   staršího stavu, overlay (relay nesmí podvrhnout zdroj ani čas), velikost stavu a pravidlo rádce „rescan“. */
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/store/app';
import { applyRelay, createMirror, type RelayCall } from '../../src/store/relay';
import { SCHEMA, defaultState, normalize } from '../../src/core/state';
import { makeBackup, parseBackup } from '../../src/core/backup';
import {
  PROV_LOG_MAX, PROV_MAX, emptyProvenance, latestAt, normalizeProvenance, provOf, provSummary, seedMigration, stampChanges, visionConf,
} from '../../src/core/provenance';
import { advisorTips, RESCAN_DAYS, visibleTips } from '../../src/core/advisor';
import { QUESTS } from '../../src/core/quests';
import { SKILLS } from '../../src/core/data/skills';
import { STATIONS } from '../../src/core/data/stations';
import { itemCard } from '../../src/core/itemCard';
import type { AppState } from '../../src/core/types';
import type { ImportGroup, VisionApply } from '../../src/core/visionImport';

const T0 = Date.UTC(2026, 10, 13, 14, 2);
const DAY = 86_400_000;

function memStorage() {
  const box = { content: null as string | null, snaps: [] as string[] };
  const storage = {
    kind: 'browser' as const,
    load: async () => ({ content: box.content, source: box.content ? 'state' as const : 'none' as const, warning: null }),
    save: async (c: string) => { box.content = c; },
    createSnapshot: async (_k: string, label: string) => { box.snaps.push(label); },
    listSnapshots: async () => [], readSnapshot: async () => '', deleteSnapshot: async () => undefined, saveImportRaw: async () => undefined,
    exportBackup: async () => true, importBackup: async () => null, dataDir: async () => '', openDataDir: async () => undefined, openExternal: async () => undefined,
  } as unknown as Parameters<typeof createApp>[0];
  return { box, storage };
}
async function makeApp(stored?: unknown) {
  const { box, storage } = memStorage();
  if (stored) box.content = JSON.stringify(stored);
  const clock = { t: T0 };
  const app = createApp(storage, { debounceMs: 0, weekCheckMs: 0, now: () => clock.t });
  await app.init();
  const state = () => app.store.getState().state;
  return { app, state, clock, box };
}
const group = (over: Partial<ImportGroup> & { key: string; score?: number }): ImportGroup => ({
  id: 'g-' + over.key, cells: [], fp: [1, 2, 3], rarity: 'common', tier: null, count: 3, countSure: true,
  match: { status: 'known', itemKey: over.key, kind: 'material', score: over.score ?? 0.97, source: 'catalog' },
  ...over,
} as ImportGroup);
const vision = (rows: VisionApply['rows'], extra: Partial<VisionApply> = {}): VisionApply =>
  ({ rows, coins: null, zeroMissing: false, canZero: false, profile: null, ...extra });
const quest = QUESTS.find(q => q.prev.length > 0 && q.objectives.length >= 2)!;
const skill = SKILLS[0];
const station = STATIONS.find(s => s.max > s.min)!;

describe('ruční úpravy: zdroj „manual“, čas hlavního okna, potvrzeno', () => {
  it('zásoba, vybavení, profil, stanice, skill, úkol a cíl úkolu', async () => {
    const { app, state, clock } = await makeApp();
    app.actions.invSet('Metal Parts', 12);
    app.actions.itemSave({ name: 'Ferro', category: 'weapon', count: 1 });
    app.actions.setProfile('level', 12);
    app.actions.levelUp(station.id);
    app.actions.skillAdd(skill.id);
    clock.t = T0 + 5_000;
    app.actions.questSet(quest.id, true);
    app.actions.questObjective(quest.id, 1, true);
    const s = state();
    const manual = { src: 'manual', at: T0, ver: true };
    expect(provOf(s, 'inv', 'Metal Parts')).toEqual(manual);
    expect(provOf(s, 'items', 'Ferro')).toEqual(manual);
    expect(provOf(s, 'profile', 'level')).toEqual(manual);
    expect(provOf(s, 'stations', station.id)).toEqual(manual);
    expect(provOf(s, 'skills', skill.id)).toEqual(manual);
    /* zaškrtnutí úkolu doplní i předchozí úkoly řetězu: všechny dostanou původ */
    for (const id of [quest.id, ...quest.prev]) expect(provOf(s, 'quests', id)).toEqual({ ...manual, at: T0 + 5_000 });
    expect(provOf(s, 'objectives', `${quest.id}:1`)).toEqual({ ...manual, at: T0 + 5_000 });
    /* ruční hodnota nemá jistotu */
    expect(provOf(s, 'inv', 'Metal Parts')).not.toHaveProperty('conf');
  });

  it('vynulovaná zásoba si původ nechá, smazaný předmět ho ztratí; nezměněná hodnota se neoznačí', async () => {
    const { app, state, clock } = await makeApp();
    app.actions.invSet('Metal Parts', 4);
    const key = app.actions.itemSave({ name: 'Ferro', category: 'weapon', count: 2 })!;
    clock.t = T0 + 60_000;
    app.actions.invSet('Metal Parts', 0);
    app.actions.itemDelete(key);
    app.actions.setProfile('coins', 0);
    expect(provOf(state(), 'inv', 'Metal Parts')).toMatchObject({ src: 'manual', at: T0 + 60_000 });
    expect(provOf(state(), 'items', key)).toBeNull();
    /* coins už byly 0: žádná změna, žádný záznam */
    expect(provOf(state(), 'profile', 'coins')).toBeNull();
  });

  it('deník zápisů: ruční klikání do minuty se sloučí, deník má nejvýš PROV_LOG_MAX dávek', async () => {
    const { app, state, clock } = await makeApp();
    app.actions.invAdd('Metal Parts', 1);
    clock.t += 10_000;
    app.actions.invAdd('Metal Parts', 1);
    expect(state().provenance.log).toEqual([{ at: T0 + 10_000, src: 'manual', n: 2, dom: ['inv'] }]);
    for (let i = 0; i < PROV_LOG_MAX + 10; i++) { clock.t += 120_000; app.actions.invAdd('Fabric', 1); }
    expect(state().provenance.log.length).toBe(PROV_LOG_MAX);
  });

  it('úprava, která původ nemění (minihra, nastavení), nic neoznačí', async () => {
    const { app, state } = await makeApp();
    app.actions.toggleStep(state().steps[0].id);
    app.actions.setCardHidden('recs', true);
    expect(provSummary(state()).every(x => x.total === 0)).toBe(true);
    expect(state().provenance.log).toEqual([]);
  });
});

describe('snímky obrazovky', () => {
  it('STASH ze souboru: jistota podle rozpoznání, nejistý počet nejvýš 50 %, předchozí zdroj', async () => {
    const { app, state, clock } = await makeApp();
    app.actions.invSet('Metal Parts', 2);
    clock.t = T0 + DAY;
    const sum = await app.actions.importFromScreens(vision([
      { group: group({ key: 'Metal Parts', score: 0.97 }), target: { kind: 'material', name: 'Metal Parts' }, count: 30 },
      { group: group({ key: 'Fabric', score: 0.9, countSure: false }), target: { kind: 'material', name: 'Fabric' }, count: 5 },
      { group: group({ key: 'Ferro', score: 1 }), target: { kind: 'item', name: 'Ferro', category: 'weapon' }, count: 1 },
    ], { coins: 51060, slots: { used: 140, max: 268 } }));
    expect(sum).not.toBeNull();
    const s = state();
    expect(provOf(s, 'inv', 'Metal Parts')).toEqual({ src: 'screenshot-file', at: T0 + DAY, conf: 0.97, ver: true, prev: { src: 'manual', at: T0 } });
    expect(provOf(s, 'inv', 'Fabric')).toEqual({ src: 'screenshot-file', at: T0 + DAY, conf: 0.5, ver: true });
    expect(provOf(s, 'items', 'Ferro')).toEqual({ src: 'screenshot-file', at: T0 + DAY, conf: 1, ver: true });
    expect(provOf(s, 'profile', 'coins')).toEqual({ src: 'screenshot-file', at: T0 + DAY, ver: true });
    expect(provOf(s, 'stash', 'slots')).toEqual({ src: 'screenshot-file', at: T0 + DAY, ver: true });
    expect(s.provenance.log.at(-1)).toEqual({ at: T0 + DAY, src: 'screenshot-file', n: 5, dom: ['inv', 'items', 'profile', 'stash'] });
  });

  it('STASH ze zkratky a z automatického snímání; neznámý zdroj = soubor; neznámý předmět bez jistoty', async () => {
    const { app, state } = await makeApp();
    await app.actions.importFromScreens(vision([{ group: group({ key: 'Metal Parts' }), target: { kind: 'material', name: 'Metal Parts' }, count: 3 }]), 'screenshot-hotkey');
    expect(provOf(state(), 'inv', 'Metal Parts')?.src).toBe('screenshot-hotkey');
    await app.actions.importFromScreens(vision([{ group: group({ key: 'Metal Parts' }), target: { kind: 'material', name: 'Metal Parts' }, count: 4 }]), 'auto-capture');
    expect(provOf(state(), 'inv', 'Metal Parts')).toMatchObject({ src: 'auto-capture', ver: true, prev: { src: 'screenshot-hotkey' } });
    const unknown = group({ key: 'x' });
    unknown.match = { status: 'unknown', itemKey: null, kind: 'item', score: 0.3, source: 'catalog' } as never;
    await app.actions.importFromScreens(vision([{ group: unknown, target: { kind: 'newMaterial', name: 'Battery' }, count: 2 }]), 'evil' as never);
    expect(provOf(state(), 'inv', 'Battery')).toEqual({ src: 'screenshot-file', at: T0, ver: true });
  });

  it('jistota řádku: rozpoznání, nejistý počet, neznámý předmět', () => {
    expect(visionConf({ match: { status: 'known', score: 0.987 }, countSure: true })).toBe(0.99);
    expect(visionConf({ match: { status: 'uncertain', score: 0.8 }, countSure: false })).toBe(0.5);
    expect(visionConf({ match: { status: 'unknown', score: 0.8 }, countSure: true })).toBeUndefined();
  });

  it('loot FINDINGS: nový záznam raidu, kolo a převod do zásoby mají zdroj snímku', async () => {
    const { app, state } = await makeApp();
    const res = await app.actions.importRaidLoot({ raidId: null, map: 'dam', items: [{ name: 'Fabric', qty: 3 }], replace: false, toInventory: true, gearChecked: true }, 'L0123456789abcdef');
    expect(res.ok).toBe(true);
    const id = (res as { raidId: string }).raidId;
    const s = state();
    expect(provOf(s, 'raids', id)).toEqual({ src: 'screenshot-hotkey', at: T0, ver: true });
    expect(provOf(s, 'inv', 'Fabric')).toEqual({ src: 'screenshot-hotkey', at: T0, ver: true });
    expect(provOf(s, 'profile', 'rounds')?.src).toBe('screenshot-hotkey');
  });

  it('postup ze snímku: profil, stanice, skill a cíle úkolu', async () => {
    const { app, state } = await makeApp();
    await app.actions.importProgress({ profile: { level: 20, xp: 1000 }, stations: { [station.id]: station.min + 1 }, skills: { [skill.id]: 1 }, questTicks: [{ id: quest.id, index: 0, on: true }] }, 'screenshot-hotkey');
    const s = state();
    for (const [d, k] of [['profile', 'level'], ['profile', 'xp'], ['stations', station.id], ['skills', skill.id], ['objectives', `${quest.id}:0`]] as const) {
      expect(provOf(s, d, k), `${d}:${k}`).toEqual({ src: 'screenshot-hotkey', at: T0, ver: true });
    }
    await app.actions.importProgress({ profile: { level: 21 } });
    expect(provOf(state(), 'profile', 'level')?.src).toBe('screenshot-file');
  });
});

describe('automatické snímání a fronta „Ke kontrole“', () => {
  it('automatický zápis je nepotvrzený; potvrdí ho až vyřízená fronta; Zpět záznam smaže', async () => {
    const { app, state, clock } = await makeApp();
    const res = await app.actions.autoRaid({ at: T0, outcome: 'survived', sig: null, loot: null }, null);
    expect(res).not.toBeNull();
    let s = state();
    expect(provOf(s, 'raids', res!.raidId)).toEqual({ src: 'auto-capture', at: T0, ver: false });
    expect(provOf(s, 'profile', 'rounds')).toEqual({ src: 'auto-capture', at: T0, ver: true });
    const items = s.review.filter(x => x.raidId === res!.raidId);
    expect(items.length).toBeGreaterThan(0);
    clock.t = T0 + 60_000;
    /* jedna položka vyřízená, ostatní čekají: záznam zůstane nepotvrzený */
    if (items.length > 1) {
      app.actions.reviewApply([{ id: items[0].id, kind: items[0].kind === 'map' ? 'map' : 'dismiss', map: 'dam' }]);
      expect(provOf(state(), 'raids', res!.raidId)?.ver).toBe(false);
    }
    app.actions.reviewApply(state().review.map(x => (x.kind === 'map' ? { id: x.id, kind: 'map', map: 'spaceport' } : { id: x.id, kind: 'dismiss' })));
    s = state();
    expect(s.review).toEqual([]);
    /* potvrzení nemění zdroj ani čas získání */
    expect(provOf(s, 'raids', res!.raidId)).toEqual({ src: 'auto-capture', at: T0, ver: true });
    expect(app.actions.autoUndo(s.autoLog.at(-1)!.id)).toBe(true);
    expect(provOf(state(), 'raids', res!.raidId)).toBeNull();
  });

  it('ruční úprava raidu s nevyřízenou frontou ho nepotvrdí; vyřízení fronty (i zahozením) ano', async () => {
    const { app, state } = await makeApp();
    const res = await app.actions.autoRaid({ at: T0, outcome: 'knockedOut', sig: null, loot: null }, null);
    expect(state().review.length).toBeGreaterThan(0);
    app.actions.updateRaid(res!.raidId, { notes: 'kontrola' });
    expect(provOf(state(), 'raids', res!.raidId)?.ver).toBe(false);
    app.actions.reviewApply(state().review.map(x => ({ id: x.id, kind: 'dismiss' })));
    expect(state().review).toEqual([]);
    expect(provOf(state(), 'raids', res!.raidId)).toEqual({ src: 'auto-capture', at: T0, ver: true });
  });

  it('fronta jen se zahozenou mapou: záznam se nezmění, a přesto je po vyřízení potvrzený', async () => {
    const { app, state } = await makeApp();
    const res = await app.actions.autoRaid({ at: T0, outcome: 'knockedOut', sig: null, loot: null }, null);
    const s = state();
    /* jen položka mapy (ostatní ručně odebrané z fronty pro test) */
    app.store.setState({ state: { ...s, review: s.review.filter(x => x.kind === 'map') } });
    const map = state().review.find(x => x.kind === 'map')!;
    expect(map).toBeDefined();
    app.actions.reviewApply([{ id: map.id, kind: 'dismiss' }]);
    expect(provOf(state(), 'raids', res!.raidId)).toEqual({ src: 'auto-capture', at: T0, ver: true });
  });
});

describe('import zálohy, reset a migrace', () => {
  it('import zálohy: všechny zadané hodnoty mají zdroj „backup-import“, původní zdroj zůstane jako předchozí', async () => {
    const a = await makeApp();
    a.app.actions.invSet('Metal Parts', 9);
    await a.app.actions.importFromScreens(vision([{ group: group({ key: 'Fabric', score: 0.93 }), target: { kind: 'material', name: 'Fabric' }, count: 2 }]), 'screenshot-hotkey');
    const file = makeBackup(a.state());
    const b = await makeApp();
    b.clock.t = T0 + 3 * DAY;
    const p = parseBackup(file, b.clock.t);
    if ('error' in p) throw new Error(p.error);
    expect(await b.app.actions.importState(p.state, file, 'app')).toBe(true);
    const s = b.state();
    expect(provOf(s, 'inv', 'Metal Parts')).toEqual({ src: 'backup-import', at: T0 + 3 * DAY, ver: true, prev: { src: 'manual', at: T0 } });
    expect(provOf(s, 'inv', 'Fabric')).toEqual({ src: 'backup-import', at: T0 + 3 * DAY, conf: 0.93, ver: true, prev: { src: 'screenshot-hotkey', at: T0 } });
    expect(s.provenance.log.at(-1)).toMatchObject({ src: 'backup-import', at: T0 + 3 * DAY });
  });

  it('starší záloha (schéma 17) bez původu: import označí hodnoty a předchozí zdroj je migrace', async () => {
    const b = await makeApp();
    const old = { app: 'arc-raiders-companion', schema: 17, exportedAt: '', state: { schema: 17, inventory: { 'Metal Parts': 3 }, profile: { level: 5 } } };
    const p = parseBackup(JSON.stringify(old), T0);
    if ('error' in p) throw new Error(p.error);
    await b.app.actions.importState(p.state, JSON.stringify(old), 'app');
    expect(provOf(b.state(), 'inv', 'Metal Parts')).toEqual({ src: 'backup-import', at: T0, ver: false, prev: { src: 'migration', at: 0 } });
    expect(provOf(b.state(), 'profile', 'level')?.src).toBe('backup-import');
    expect(provOf(b.state(), 'profile', 'coins')).toBeNull();
  });

  it('reset modulu zahodí původ jeho hodnot, ostatní zůstanou', async () => {
    const { app, state } = await makeApp();
    app.actions.invSet('Metal Parts', 3);
    app.actions.setProfile('level', 9);
    expect(await app.actions.resetModule('inventory')).toBe(true);
    expect(provOf(state(), 'inv', 'Metal Parts')).toBeNull();
    expect(provOf(state(), 'profile', 'level')?.src).toBe('manual');
    expect(await app.actions.resetAll()).toBe(true);
    expect(provSummary(state()).every(x => x.total === 0)).toBe(true);
  });

  it('migrace schématu 17 → 18: zadané hodnoty dostanou „migration“, čas jen tam, kde ho stav zná', () => {
    expect(SCHEMA).toBe(18);
    const s = normalize({
      schema: 17, profile: { level: 14, coins: 0 }, inventory: { 'Metal Parts': 3, Fabric: 0 }, stations: { [station.id]: station.min + 1 },
      skills: { current: { [skill.id]: 1 } }, quests: { done: { [quest.id]: T0 - DAY }, objectives: { [quest.id]: [1] } },
      vision: { stash: { used: 100, max: 268, at: T0 - 2 * DAY } }, raids: [{ id: 'R1', ts: T0 - 3 * DAY }],
      items: { Ferro: { key: 'Ferro', name: 'Ferro', category: 'weapon', count: 1 } },
    }, T0);
    expect(s.schema).toBe(18);
    const mig = (at = 0) => ({ src: 'migration', at, ver: false });
    expect(provOf(s, 'inv', 'Metal Parts')).toEqual(mig());
    expect(provOf(s, 'inv', 'Fabric')).toBeNull();
    expect(provOf(s, 'items', 'Ferro')).toEqual(mig());
    expect(provOf(s, 'profile', 'level')).toEqual(mig());
    expect(provOf(s, 'profile', 'coins')).toBeNull();
    expect(provOf(s, 'stations', station.id)).toEqual(mig());
    expect(provOf(s, 'skills', skill.id)).toEqual(mig());
    expect(provOf(s, 'quests', quest.id)).toEqual(mig(T0 - DAY));
    expect(provOf(s, 'objectives', `${quest.id}:1`)).toEqual(mig());
    expect(provOf(s, 'stash', 'slots')).toEqual(mig(T0 - 2 * DAY));
    expect(provOf(s, 'raids', 'R1')).toEqual(mig(T0 - 3 * DAY));
    /* výchozí stav nemá žádný záznam */
    expect(provSummary(defaultState(T0)).every(x => x.total === 0)).toBe(true);
    expect(provSummary(normalize({ schema: 17 }, T0)).every(x => x.total === 0)).toBe(true);
  });

  it('stav schématu 18 se načte beze ztrát; vadné záznamy a cizí klíče se zahodí, žádná nová migrace', () => {
    const prov = {
      recs: {
        inv: { 'Metal Parts': { src: 'screenshot-hotkey', at: T0, conf: 0.971, ver: true, prev: { src: 'manual', at: 1 } }, Bad: { src: 'hack', at: 1 }, Neg: { src: 'manual', at: -5, conf: 7 } },
        profile: 'nope', nope: { a: { src: 'manual', at: 1, ver: true } },
      },
      log: [{ at: T0, src: 'manual', n: 2, dom: ['inv', 'evil'] }, { at: 1, src: 'evil', n: 1, dom: [] }],
    };
    const s = normalize({ schema: 18, inventory: { 'Metal Parts': 3, Fabric: 2 }, provenance: prov }, T0);
    expect(provOf(s, 'inv', 'Metal Parts')).toEqual({ src: 'screenshot-hotkey', at: T0, conf: 0.97, ver: true, prev: { src: 'manual', at: 1 } });
    expect(provOf(s, 'inv', 'Bad')).toBeNull();
    expect(provOf(s, 'inv', 'Neg')).toEqual({ src: 'manual', at: 0, conf: 1, ver: false });
    /* Fabric nemá záznam (stav 18 se nemigruje znovu) */
    expect(provOf(s, 'inv', 'Fabric')).toBeNull();
    expect(Object.keys(s.provenance.recs)).not.toContain('nope');
    expect(s.provenance.log).toEqual([{ at: T0, src: 'manual', n: 2, dom: ['inv'] }]);
    expect(normalizeProvenance(null)).toEqual(emptyProvenance());
    /* záloha nese původ a vrátí ho beze změny */
    const file = JSON.parse(makeBackup(s));
    expect(file.schema).toBe(18);
    expect(normalize(file.state, T0).provenance).toEqual(s.provenance);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 19, state: {} }), T0)).toHaveProperty('error');
  });

  it('načtení stavu schématu 17 ve storu doplní migraci a uloží schéma 18', async () => {
    const { state, box } = await makeApp({ schema: 17, inventory: { 'Metal Parts': 3 }, settings: { autoSnapshot: false, lang: 'cs' } });
    expect(provOf(state(), 'inv', 'Metal Parts')?.src).toBe('migration');
    expect(state().schema).toBe(18);
    expect(box.content === null || JSON.parse(box.content).schema === 17 || JSON.parse(box.content).schema === 18).toBe(true);
  });
});

describe('overlay: zdroj a čas určuje hlavní okno', () => {
  it('akce z overlaye se zapíše jako ruční s časem hlavního okna; přidaný argument zdroj nepodvrhne', async () => {
    const { app: main, state, clock } = await makeApp();
    const ov = createApp(memStorage().storage, { debounceMs: 0, weekCheckMs: 0, now: () => T0 - 10 * DAY });
    const sent: RelayCall[] = [];
    const mirror = createMirror(ov, { send: c => sent.push(c), now: () => T0 - 10 * DAY, session: 'sess42' });
    mirror.receive(state(), null);
    (ov.actions.invSet as (...a: unknown[]) => number)('Metal Parts', 7, 'auto-capture', { src: 'backup-import', at: 1 });
    clock.t = T0 + 1234;
    for (const c of sent) applyRelay(main, JSON.parse(JSON.stringify(c)));
    expect(state().inventory['Metal Parts']).toBe(7);
    expect(provOf(state(), 'inv', 'Metal Parts')).toEqual({ src: 'manual', at: T0 + 1234, ver: true });
    /* zápis ze snímku přes relay nejde vůbec */
    expect(applyRelay(main, { session: 'sess42', seq: 99, name: 'importFromScreens', args: [], ids: [] })).toEqual({ ack: { session: 'sess42', seq: 99 }, applied: false });
  });
});

describe('velikost stavu', () => {
  it('nejvýš PROV_MAX záznamů na oblast (nejstarší odpadnou); 500 materiálů ze snímku je pod 100 kB', () => {
    const before = defaultState(T0);
    const after = structuredClone(before);
    for (let i = 0; i < PROV_MAX + 200; i++) after.inventory['M' + i] = 1;
    stampChanges(before, after, { src: 'manual', ver: true }, T0);
    expect(Object.keys(after.provenance.recs.inv).length).toBe(PROV_MAX);

    const b2 = defaultState(T0), a2 = structuredClone(b2);
    for (let i = 0; i < 500; i++) { a2.inventory['Material number ' + i] = 5; b2.inventory['Material number ' + i] = 3; }
    b2.provenance = seedMigration(b2);
    a2.provenance = structuredClone(b2.provenance);
    stampChanges(b2, a2, { src: 'screenshot-hotkey', ver: true, conf: () => 0.97 }, T0);
    const bytes = JSON.stringify(a2.provenance).length;
    expect(bytes).toBeLessThan(100_000);
    expect(latestAt(a2, ['inv'])).toBe(T0);
  });
});

describe('rádce: stará zásoba (rescan)', () => {
  const base = (over: Partial<AppState> = {}): AppState => {
    const s = defaultState(T0 - 30 * DAY);
    s.profile.level = 20;
    s.inventory = { 'Metal Parts': 5 };
    s.goals = [{ id: 'g1', title: 'Gear 2', note: '', priority: 2, due: '', createdAt: T0 - 30 * DAY, doneAt: 0, doneRaid: '', link: { kind: 'manual', target: 3, progress: 0 } }];
    return Object.assign(s, over);
  };
  const tipsOf = (s: AppState, now = T0) => advisorTips(s, now, 'cs').filter(x => x.rule === 'rescan');
  const stamp = (s: AppState, at: number) => { s.provenance.recs.inv['Metal Parts'] = { src: 'screenshot-hotkey', at, ver: true }; return s; };

  it('zásoba starší než RESCAN_DAYS dní a otevřený cíl: tip vede na snímek STASH', () => {
    const tips = tipsOf(stamp(base(), T0 - (RESCAN_DAYS + 3) * DAY));
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ id: 'rescan', target: { kind: 'route', route: 'inventory/import' }, tone: 'amber', key: String(T0 - (RESCAN_DAYS + 3) * DAY) });
    expect(tips[0].title).toEqual({ key: 'advisor.rescan.title', params: { count: RESCAN_DAYS + 3 } });
  });

  it('bez dat tip není: čerstvá zásoba, žádný cíl, prázdná zásoba, jen migrace s neznámým časem', () => {
    expect(tipsOf(stamp(base(), T0 - RESCAN_DAYS * DAY))).toEqual([]);
    expect(tipsOf(stamp(base({ goals: [] }), T0 - 20 * DAY))).toEqual([]);
    const done = stamp(base(), T0 - 20 * DAY);
    done.goals[0].doneAt = T0 - DAY;
    expect(tipsOf(done)).toEqual([]);
    expect(tipsOf(stamp(base({ inventory: {} }), T0 - 20 * DAY))).toEqual([]);
    const mig = base();
    mig.provenance = seedMigration(mig);
    expect(tipsOf(mig)).toEqual([]);
    /* cíl v Material Planneru stačí i bez otevřeného cíle */
    const planner = stamp(base({ goals: [] }), T0 - 20 * DAY);
    planner.planner.stations = { [station.id]: station.min + 1 };
    expect(tipsOf(planner)).toHaveLength(1);
  });

  it('skrytí platí do další změny zásoby; odložení podle dnů', async () => {
    const { app, state, clock } = await makeApp(base());
    app.actions.invSet('Metal Parts', 6);
    clock.t = T0 + 10 * DAY;
    const tip = advisorTips(state(), clock.t, 'cs').find(x => x.rule === 'rescan')!;
    expect(tip).toBeDefined();
    app.actions.advisorDismiss(tip.id, tip.key);
    expect(visibleTips(advisorTips(state(), clock.t, 'cs'), state().advisor, clock.t).some(x => x.rule === 'rescan')).toBe(false);
    app.actions.advisorRestore(tip.id);
    app.actions.advisorSnooze(tip.id, 3);
    expect(visibleTips(advisorTips(state(), clock.t, 'cs'), state().advisor, clock.t).some(x => x.rule === 'rescan')).toBe(false);
    expect(visibleTips(advisorTips(state(), clock.t + 4 * DAY, 'cs'), state().advisor, clock.t + 4 * DAY).some(x => x.rule === 'rescan')).toBe(true);
    /* nový zápis do zásoby tip odstraní */
    app.actions.invSet('Metal Parts', 7);
    expect(advisorTips(state(), clock.t, 'cs').some(x => x.rule === 'rescan')).toBe(false);
  });
});

describe('karta předmětu: původ počtu', () => {
  it('nejnovější záznam materiálu; bez záznamu null', async () => {
    const { app, state } = await makeApp();
    expect(itemCard(state(), 'Metal Parts', 'cs', '2026-11-13').origin).toBeNull();
    app.actions.invSet('Metal Parts', 4);
    expect(itemCard(state(), 'Metal Parts', 'cs', '2026-11-13').origin).toEqual({ src: 'manual', at: T0, ver: true });
  });
});
