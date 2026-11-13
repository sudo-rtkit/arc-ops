/* 0.14.0 (schéma 13): příprava na raid a vlastní body map. Sečtení seznamu (bez dvojího počítání, odečet zásoby),
   bodování map s důvody, chybějící typ místa, rada nechat / prodat / recyklovat, zvýraznění bodů, migrace schématu,
   záloha a obnova, akce store (plán, „mám“ bez změny inventáře, body). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { backupImages, makeBackup, parseBackup } from '../../src/core/backup';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { setQuestDone } from '../../src/core/quests';
import {
  defaultGoals, emptyGoals, goalLabels, highlightPois, listSig, lookupAdvice, normalizeRaidPlan, phaseRange, questsOnMap, raidList,
  recommendedMap, scoreMaps, validGoals,
} from '../../src/core/raidPrep';
import { itemAreas, LOOT_AREAS, POI_TYPES } from '../../src/core/lootAreas';
import { CATALOG, CATALOG_AREAS } from '../../src/core/data/catalog';
import { AREA_PATHS, POI_PATHS } from '../../src/ui/mapPaths';
import type { AppState, RaidGoals } from '../../src/core/types';

const NOW = new Date(2026, 10, 12, 18, 0).getTime();
const TODAY = '2026-11-12';
const goals = (g: Partial<RaidGoals>): RaidGoals => ({ ...emptyGoals(), ...g });
/* stav s hotovými předchozími úkoly, aby byly After Rain Comes (ss10y) a Broken Monument (ss10h) dostupné */
function base(over: Partial<AppState> = {}): AppState {
  const s = defaultState(NOW);
  s.quests.done = setQuestDone(setQuestDone({}, 'ss10s', true, NOW), 'ss10e', true, NOW);
  s.stations.gear = 1;
  return Object.assign(s, over);
}

describe('typ místa z katalogu', () => {
  it('katalog nese loot_area jako indexy do 13 známých typů', () => {
    expect([...CATALOG_AREAS].sort()).toEqual(LOOT_AREAS.map(a => a.id).sort());
    expect(CATALOG.filter(r => r.a?.length).length).toBeGreaterThan(200);
    expect(itemAreas('Power Cable')).toEqual(['Electrical', 'Commercial', 'Residential']);
    expect(itemAreas('Wires')).toEqual(['Electrical', 'Technological']);
  });
  it('chybějící typ místa je prázdný (neznámé), nic se nedomýšlí', () => {
    expect(itemAreas('First Wave Compass')).toEqual([]);
    expect(itemAreas('Úplně neznámý předmět')).toEqual([]);
  });
  it('ikony v kódu odpovídají sprite návrhu (src/assets/maps/sprite.svg)', () => {
    const sprite = readFileSync(new URL('../../src/assets/maps/sprite.svg', import.meta.url), 'utf8');
    for (const t of POI_TYPES) expect(sprite).toContain(`<symbol id="${t}" viewBox="0 0 24 24"><path d="${POI_PATHS[t]}"/>`);
    for (const a of LOOT_AREAS) expect(sprite).toContain(`<symbol id="area-${a.slug}" viewBox="0 0 24 24"><path d="${AREA_PATHS[a.slug]}"/>`);
  });
});

describe('seznam k hledání', () => {
  it('chybí = požadavek − zásoba, důvody a typ místa; materiál ze Zásoby se odečte', () => {
    const s = base({ inventory: { 'Power Cable': 1, 'Electrical Components': 5 } });
    const rows = raidList(s, goals({ stations: ['gear'] }), 'cs', TODAY);
    const pc = rows.find(r => r.mat === 'Power Cable')!;
    expect(pc).toMatchObject({ need: 3, have: 1, missing: 2, areas: ['Electrical', 'Commercial', 'Residential'] });
    expect(pc.reasons).toEqual([{ kind: 'station', label: 'Gear Bench 2', qty: 3 }]);
    /* hotový materiál v seznamu není */
    expect(rows.some(r => r.mat === 'Electrical Components')).toBe(false);
    expect(rows.find(r => r.mat === 'Hornet Driver')!.missing).toBe(5);
  });
  it('úkol přidá předměty k odevzdání i předměty nalezené během úkolu; neznámý typ místa zůstane prázdný', () => {
    const s = base();
    const rows = raidList(s, goals({ quests: ['ss10y', 'ss10h'] }), 'cs', TODAY);
    expect(rows.find(r => r.mat === 'Wires')).toMatchObject({ missing: 5, reasons: [{ kind: 'quest', label: 'Úkol: After Rain Comes', qty: 5 }] });
    expect(rows.find(r => r.mat === 'First Wave Compass')).toMatchObject({ missing: 1, areas: [] });
  });
  it('nic se nezapočítá dvakrát: stejný cíl dvakrát ani stejný zdroj dvakrát nezvedne potřebu', () => {
    const s = base({ inventory: { Wires: 2 } });
    const once = raidList(s, goals({ quests: ['ss10y'], stations: ['gear'] }), 'cs', TODAY);
    const twice = raidList(s, goals({ quests: ['ss10y', 'ss10y'], stations: ['gear', 'gear'] }), 'cs', TODAY);
    expect(twice).toEqual(once);
    expect(once.find(r => r.mat === 'Wires')).toMatchObject({ need: 5, have: 2, missing: 3 });
  });
  it('výchozí cíle: připnuté a rozpracované úkoly a další vylepšení z kompaktu; neplatné cíle vypadnou', () => {
    const s = base({ inventory: { Wires: 1 } });
    s.quests.pinned = ['ss10h'];
    const g = defaultGoals(s, 'cs');
    expect(g.quests).toContain('ss10h');
    expect(g.quests).toContain('ss10y');
    expect(g.stations.length).toBe(1);
    s.quests.done = setQuestDone(s.quests.done, 'ss10y', true, NOW);
    expect(validGoals(s, goals({ quests: ['ss10y', 'nope'], stations: ['gear', 'nope'] }), 'cs', TODAY)).toEqual(goals({ stations: ['gear'] }));
    expect(goalLabels(s, goals({ stations: ['gear'], quests: ['ss10h'] }), 'cs', TODAY)).toEqual(['Gear Bench 2', 'Broken Monument']);
  });
  it('otisk seznamu se změní se zásobou (plán se přepočítal)', () => {
    const g = goals({ stations: ['gear'] });
    const a = listSig(raidList(base(), g, 'cs', TODAY));
    const b = listSig(raidList(base({ inventory: { 'Power Cable': 2 } }), g, 'cs', TODAY));
    expect(a).toMatch(/^r[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe('doporučená mapa', () => {
  it('úkoly z výběru dávají body a čitelné důvody; zamčená mapa je poslední', () => {
    const s = base();
    const scores = scoreMaps(s, goals({ quests: ['ss10y'] }), 'cs');
    const rec = recommendedMap(scores)!;
    expect(rec.id).toBe('buried');
    expect(rec.reasons[0]).toMatchObject({ key: 'raid.reason.quests', params: { count: 1 } });
    expect(String(rec.reasons[0].params?.names)).toContain('After Rain Comes');
    const locked = scores.filter(x => x.locked);
    expect(locked.length).toBeGreaterThan(0);
    expect(scores.slice(-locked.length).every(x => x.locked)).toBe(true);
    expect(locked[0].reasons.some(r => r.key === 'raid.reason.locked')).toBe(true);
  });
  it('peníze: trasa ve fázi hráče a její loadout; bez cílů rozhodne obtížnost', () => {
    const s = base();
    const m = scoreMaps(s, goals({ money: true }), 'cs');
    const best = recommendedMap(m)!;
    expect(best.route).not.toBeNull();
    expect(best.reasons.some(r => r.key === 'raid.reason.route')).toBe(true);
    expect(recommendedMap(scoreMaps(s, emptyGoals(), 'cs'))!.id).toBe('dam');
    expect(phaseRange('2–4')).toEqual([2, 4]);
    expect(phaseRange('1')).toEqual([1, 1]);
    expect(phaseRange('')).toBeNull();
  });
});

describe('nechat / prodat / recyklovat', () => {
  it('předmět potřebný pro plán: nechat s počtem; přebytek a nepotřebné: prodat nebo recyklovat', () => {
    const s = base({ inventory: { 'Power Cable': 1 } });
    const g = goals({ stations: ['gear'] });
    const rows = raidList(s, g, 'cs', TODAY);
    const keep = lookupAdvice(s, 'Power Cable', g, rows, 'cs', TODAY);
    expect(keep).toMatchObject({ kind: 'keep', have: 1, missing: 2, inPlan: true });
    expect(keep.reasons.map(r => r.label)).toContain('Gear Bench 2');
    /* předmět nalezený během úkolu je potřeba jen díky plánu */
    expect(lookupAdvice(s, 'First Wave Compass', goals({ quests: ['ss10h'] }), [], 'cs', TODAY).kind).toBe('keep');
    expect(lookupAdvice(s, 'First Wave Compass', emptyGoals(), [], 'cs', TODAY).kind).not.toBe('keep');
    const other = lookupAdvice(s, 'Broken Taser', g, rows, 'cs', TODAY);
    expect(['sell', 'recycle']).toContain(other.kind);
    s.advice.keep['Broken Taser'] = true;
    expect(lookupAdvice(s, 'Broken Taser', g, rows, 'cs', TODAY)).toMatchObject({ kind: 'keep', override: true });
  });
});

describe('zvýraznění bodů', () => {
  it('shoda typu místa s chybějícími předměty a cíle úkolů na mapě plánu', () => {
    const s = base();
    const g = goals({ stations: ['gear'], quests: ['ss10y'] });
    const rows = raidList(s, g, 'cs', TODAY);
    const pois = [
      { id: 'a', type: 'crate' as const, area: 'Electrical' },
      { id: 'b', type: 'crate' as const, area: 'Nature' },
      { id: 'c', type: 'quest' as const, area: '' },
      { id: 'd', type: 'note' as const, area: '' },
    ];
    const h = highlightPois(pois, rows, questsOnMap(s, g, 'buried'));
    expect(h.get('a')).toMatchObject({ reason: 'area' });
    expect(h.get('a')!.items).toContain('Power Cable');
    expect(h.has('b')).toBe(false);
    expect(h.get('c')).toEqual({ reason: 'quest', items: [] });
    expect(h.has('d')).toBe(false);
    expect(highlightPois(pois, rows, questsOnMap(s, g, 'dam')).has('c')).toBe(false);
  });
});

describe('schéma 13: migrace, záloha a obnova', () => {
  it('stav schématu 12 se načte beze ztrát: body jen s názvem dostanou typ poznámka, neznámé místo a žádnou polohu', () => {
    const old = {
      schema: 12, profile: { level: 30 }, inventory: { Wires: 4 },
      maps: { dam: { notes: 'pozor', visited: { Dome: true }, pois: [{ id: 'p1', name: 'Bedna u mostu', note: 'dvě' }], todo: [] } },
    };
    const s = normalize(old, NOW);
    expect(SCHEMA).toBe(16);
    expect(s.schema).toBe(16);
    expect(s.raidPlan).toBeNull();
    expect(s.inventory).toEqual({ Wires: 4 });
    expect(s.maps.dam).toEqual({ notes: 'pozor', visited: { Dome: true }, pois: [{ id: 'p1', name: 'Bedna u mostu', note: 'dvě', type: 'note', area: '' }], todo: [], harmonise: true, img: null });
  });
  it('neplatné body a plán se ořežou, platné zůstanou', () => {
    const s = normalize({
      maps: { dam: { pois: [{ id: 'x', name: 'A', type: 'crate', area: 'Electrical', x: 0.25, y: 0.5 }, { id: 'y', type: 'bomb', area: 'Moon', x: 2, y: 0.1 }], img: { w: 1920, h: 1080, at: 5 } } },
      raidPlan: { map: 'nowhere', goals: {} },
    }, NOW);
    expect(s.maps.dam.pois[0]).toEqual({ id: 'x', name: 'A', note: '', type: 'crate', area: 'Electrical', x: 0.25, y: 0.5 });
    expect(s.maps.dam.pois[1]).toEqual({ id: 'y', name: '', note: '', type: 'note', area: '' });
    expect(s.maps.dam.img).toEqual({ w: 1920, h: 1080, at: 5 });
    expect(s.raidPlan).toBeNull();
    expect(normalizeRaidPlan({ map: 'dam', goals: { quests: ['a', 'a', 3], money: true }, found: ['Wires', 'Wires'], sig: 'bad' }))
      .toEqual({ goals: { quests: ['a'], stations: [], projects: [], money: true }, map: 'dam', loadout: '', route: '', startedAt: 0, sig: '', found: ['Wires'], snap: null, open: [] });
  });
  it('záloha nese plán a body; snímky map jen volitelně a jen platné; schéma 17 je novější', () => {
    const s = defaultState(NOW);
    s.raidPlan = { goals: goals({ quests: ['ss10y'] }), map: 'buried', loadout: '', route: '', startedAt: NOW, sig: 'r0000abcd', found: ['Wires'], snap: [{ mat: 'Wires', have: 2, missing: 3 }], open: ['quest:ss10y'] };
    s.maps.buried = { notes: '', visited: {}, todo: [], harmonise: false, img: { w: 10, h: 5, at: NOW }, pois: [{ id: 'p', name: '', note: '', type: 'quest', area: '', x: 0.1, y: 0.2 }] };
    const plain = JSON.parse(makeBackup(s));
    expect(plain.mapImages).toBeUndefined();
    const p = parseBackup(makeBackup(s), NOW);
    if ('error' in p) throw new Error(p.error);
    expect(p.state.raidPlan).toEqual(s.raidPlan);
    expect(p.state.maps.buried).toEqual(s.maps.buried);
    expect(p.mapImages).toBeUndefined();
    /* hlavička PNG (podpis + IHDR) s danými rozměry */
    const png = (w: number, h: number) => {
      const b = new Uint8Array(33);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(b.buffer).setUint32(16, w);
      new DataView(b.buffer).setUint32(20, h);
      return 'data:image/png;base64,' + Buffer.from(b).toString('base64');
    };
    const img = { mapId: 'buried', dataUrl: png(10, 5), w: 10, h: 5 };
    const withImg = parseBackup(makeBackup(s, new Date(NOW), [img]), NOW);
    expect('error' in withImg ? null : withImg.mapImages).toEqual([img]);
    expect(backupImages([img, { ...img, mapId: 'mars' }, { ...img, mapId: 'dam', dataUrl: 'javascript:alert(1)' }])).toEqual([img]);
    /* 0.16.1: rozměry z hlavičky, ne z údajů zálohy; obrázek nad rozpočtem, bez hlavičky nebo s jiným typem se zahodí */
    expect(backupImages([{ ...img, w: 0, h: 99999 }])).toEqual([img]);
    expect(backupImages([{ ...img, dataUrl: png(16000, 16000) }])).toEqual([]);
    expect(backupImages([{ ...img, dataUrl: png(8192, 8192) }])).toEqual([]);
    expect(backupImages([{ ...img, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }])).toEqual([]);
    expect(backupImages([{ ...img, dataUrl: png(10, 5).replace('image/png', 'image/webp') }])).toEqual([]);
    expect(backupImages([{ ...img, dataUrl: 'data:image/png;base64,' + 'A'.repeat(17 * 1024 * 1024) }])).toEqual([]);
    expect(parseBackup(JSON.stringify({ app: 'arc-raiders-companion', schema: 17, state: {} }), NOW)).toHaveProperty('error');
  });
});

describe('store: plán a body', () => {
  async function makeApp() {
    const kv = memoryKV();
    kv.setItem('arcops:state', JSON.stringify(base({ inventory: { 'Power Cable': 1 } })));
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    return { app, state: () => app.store.getState().state };
  }
  it('spuštění plánu uloží jen volby; „mám“ nemění inventář; ukončení plán smaže', async () => {
    const { app, state } = await makeApp();
    expect(app.actions.startRaidPlan({ goals: goals({ stations: ['gear'] }), map: 'dam', loadout: '', route: '', sig: 'r00000001' })).toBe(true);
    expect(state().raidPlan).toMatchObject({ map: 'dam', startedAt: NOW, found: [] });
    const inv = structuredClone(state().inventory), items = structuredClone(state().items);
    app.actions.setRaidFound('Power Cable', true);
    app.actions.setRaidFound('Power Cable', true);
    expect(state().raidPlan!.found).toEqual(['Power Cable']);
    expect(state().inventory).toEqual(inv);
    expect(state().items).toEqual(items);
    app.actions.setRaidFound('Power Cable', false);
    expect(state().raidPlan!.found).toEqual([]);
    expect(app.actions.startRaidPlan({ goals: emptyGoals(), map: 'mars', loadout: '', route: '', sig: '' })).toBe(false);
    app.actions.endRaidPlan();
    expect(state().raidPlan).toBeNull();
    app.actions.setRaidFound('Wires', true);
    expect(state().raidPlan).toBeNull();
  });
  it('body: přidání v relativních souřadnicích, úprava, přesun, smazání a Zpět na stejné místo', async () => {
    const { app, state } = await makeApp();
    app.actions.addPoi('dam', 'Starý bod', '');
    const id = app.actions.addMapPoint('dam', { type: 'crate', area: 'Electrical', name: '', note: 'za zdí', x: 1.4, y: 0.333333333 })!;
    expect(state().maps.dam.pois[1]).toEqual({ id, name: '', note: 'za zdí', type: 'crate', area: 'Electrical', x: 1, y: 0.33333 });
    app.actions.updatePoi('dam', id, { type: 'room', area: 'Moon', name: 'Rozvodna' });
    expect(state().maps.dam.pois[1]).toMatchObject({ type: 'room', area: '', name: 'Rozvodna' });
    app.actions.movePoi('dam', id, { x: 0.5, y: 0.25 });
    expect(state().maps.dam.pois[1]).toMatchObject({ x: 0.5, y: 0.25 });
    const poi = structuredClone(state().maps.dam.pois[1]);
    app.actions.deletePoi('dam', id);
    expect(state().maps.dam.pois.length).toBe(1);
    app.actions.restorePoi('dam', poi, 1);
    expect(state().maps.dam.pois[1]).toEqual(poi);
    app.actions.setMapImage('dam', { w: 1920, h: 1080 }, true);
    expect(state().maps.dam.img).toEqual({ w: 1920, h: 1080, at: NOW });
    expect(state().maps.dam.pois[1].x).toBeUndefined();
    app.actions.setMapHarmonise('dam', false);
    expect(state().maps.dam.harmonise).toBe(false);
    expect(app.actions.addMapPoint('mars', { type: 'crate', area: '', name: '', note: '', x: 0, y: 0 })).toBeNull();
  });
});
