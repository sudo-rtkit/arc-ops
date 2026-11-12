/* 0.12.0: názvy materiálů a počty „mám/potřeba“ z detailu stanice dílny bez vlastních snímků. Umělé obrazovky se kreslí
   ze vzorů písmen (progress-synth.ts, bodyGlyphs.ts). Ověřuje se čtení textu malými písmeny, přiřazení jen ke známým
   názvům (nikdy vymyšlený název), jistota každého pole a volitelný (nikdy předvybraný) zápis do Zásoby přes revizi
   se snímkem stavu. */
import { describe, expect, it } from 'vitest';
import { resize } from '../../src/core/vision/image';
import { readProgress, type StationRead } from '../../src/core/vision/progress';
import { readMixed } from '../../src/core/vision/mixed';
import { darkInk } from '../../src/core/vision/text';
import { applyProgress, defaultApply, normalizeProgressApply, proposalChanges, proposeProgress, stockChanges, type StationsProposal } from '../../src/core/progressImport';
import { defaultState } from '../../src/core/state';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import type { StorageAdapter } from '../../src/storage/adapter';
import { bodyText, canvas, CREAM, INK, stationScreen } from './progress-synth';

const NOW = new Date(2026, 10, 12, 18, 0).getTime();
const GEAR: [string, number, number][] = [['Power Cable', 1, 3], ['Electrical Components', 3, 5], ['Hornet Driver', 1, 5]];
const at = (img: ReturnType<typeof canvas>, w: number) => (w === 1920 ? img : resize(img, w, Math.round((w * 9) / 16)));
const station = (img: ReturnType<typeof canvas>): StationRead => {
  const r = readProgress(img);
  if (!r || r.screen !== 'station') throw new Error('není detail stanice: ' + r?.screen);
  return r;
};

describe('text malými písmeny', () => {
  it('názvy materiálů se přečtou přesně (umělé písmo ze vzorů)', () => {
    for (const name of ['Power Cable', 'Electrical Components', 'Hornet Driver', 'Rusted Tools', 'Mechanical Components', 'Wasp Driver', 'Metal Parts']) {
      const img = canvas(500, 50, CREAM);
      bodyText(img, 10, 12, 18, name, INK);
      const r = readMixed(img, { x: 0, y: 4, w: 500, h: 42 }, darkInk);
      expect(r.text, name).toBe(name);
      expect(r.conf).toBeGreaterThan(0.5);
    }
  });
  it('prázdný výřez nic nepřečte', () => {
    expect(readMixed(canvas(200, 30, CREAM), { x: 0, y: 0, w: 200, h: 30 }, darkInk)).toEqual({ text: '', conf: 0, scores: [], chars: 0 });
  });
});

describe('detail stanice: materiály na další úroveň', () => {
  it.each([1366, 1920, 2560, 3840])('řádky materiálů: názvy a počty se přečtou i ve zmenšeném a zvětšeném snímku (šířka %i)', w => {
    const r = station(at(stationScreen({ title: 'GEAR BENCH', level: '01', roman: 1, rows: GEAR }), w));
    expect(r.resources.map(x => [x.have.value, x.need.value])).toEqual(GEAR.map(([, h, n]) => [h, n]));
    /* přečtený název je správný, nebo žádný (nikdy jiný materiál) */
    const p = proposeProgress(r, defaultState(NOW)) as StationsProposal;
    p.resources!.forEach((x, i) => expect([GEAR[i][0], null]).toContain(x.name));
    if (w >= 1920) expect(r.resources.map(x => x.name.value)).toEqual(GEAR.map(([n]) => n));
  });

  it.each([1920, 3840])('Gear Bench 1: názvy, mám a potřeba s jistotou každého pole (šířka %i)', w => {
    const r = station(at(stationScreen({ title: 'GEAR BENCH', level: '01', roman: 1, rows: GEAR }), w));
    expect(r.resources.map(x => [x.have.value, x.need.value])).toEqual(GEAR.map(([, h, n]) => [h, n]));
    const s = defaultState(NOW);
    const p = proposeProgress(r, s) as StationsProposal;
    expect(p.recipeMatch).toBe(true);
    expect(p.resources!.map(x => [x.name, x.source, x.nameConf, x.have, x.haveConf, x.need, x.needConf])).toEqual(
      GEAR.map(([n, h, nd]) => [n, 'read', 'high', h, 'high', nd, 'high']));
    /* jistý materiál a počet: zápis do Zásoby se nabídne, ale není předvybraný */
    expect(p.resources!.every(x => x.stockOffer)).toBe(true);
    expect(stockChanges(p).map(x => x.name)).toEqual(GEAR.map(([n]) => n));
    expect(defaultApply(p).inventory).toBeUndefined();
    expect(proposalChanges(p)).toBe(1 + 3);
  });

  it('bez dat úrovně (jiná úroveň ve hře): názvy jen ze snímku; přibližná shoda se známým názvem, nic se nevymýšlí', () => {
    const rows: [string, number, number][] = [['Metal Parts', 4, 9], ['Rusted Tools', 0, 2], ['Abcde Hgrtw', 2, 2]];
    const r = station(stationScreen({ title: 'GEAR BENCH', level: '01', roman: 1, rows }));
    const p = proposeProgress(r, defaultState(NOW)) as StationsProposal;
    expect(p.recipeMatch).toBe(false);
    expect(p.resources!.map(x => [x.name, x.source, x.nameConf])).toEqual([['Metal Parts', 'read', 'high'], ['Rusted Tools', 'read', 'high'], [null, null, 'unknown']]);
    expect(p.resources![2]).toMatchObject({ have: 2, need: 2, stockOffer: false, nameRaw: 'Abcde Hgrtw' });
    /* „mám“ 0 se nabídne taky (zásoba v aplikaci 0 = beze změny) */
    expect(stockChanges(p).map(x => x.name)).toEqual(['Metal Parts']);
  });

  it('název, který data úrovně neodpovídají, je jen nejistý; nepřečtený název přijde z dat jako nejistý', () => {
    const r = station(stationScreen({ title: 'GEAR BENCH', level: '01', roman: 1, rows: GEAR }));
    /* jiný název na místě druhého materiálu: počty sedí s daty, název ne */
    const swapped: StationRead = { ...r, resources: r.resources.map((x, i) => (i === 1 ? { ...x, name: { value: 'Rusted Tools', conf: 0.9, raw: 'Rusted Tools' } } : x)) };
    const p = proposeProgress(swapped, defaultState(NOW)) as StationsProposal;
    expect(p.resources![1]).toMatchObject({ name: 'Rusted Tools', nameConf: 'medium', stockOffer: false });
    const unread: StationRead = { ...r, resources: r.resources.map(x => ({ ...x, name: { value: null, conf: 0, raw: '' } })) };
    const q = proposeProgress(unread, defaultState(NOW)) as StationsProposal;
    expect(q.resources!.map(x => [x.name, x.source, x.nameConf, x.stockOffer])).toEqual(GEAR.map(([n]) => [n, 'data', 'medium', false]));
    /* nejistý počet „mám“: Zásoba se nenabízí */
    const shaky: StationRead = { ...r, resources: r.resources.map(x => ({ ...x, have: { ...x.have, conf: 0.5 } })) };
    const u = proposeProgress(shaky, defaultState(NOW)) as StationsProposal;
    expect(u.resources!.map(x => [x.haveConf, x.stockOffer])).toEqual(Array(3).fill(['medium', false]));
  });

  it('zápis do Zásoby: jen známý materiál, celé číslo v rozsahu; stejná hodnota není změna', () => {
    const s = defaultState(NOW);
    s.inventory['Power Cable'] = 1;
    const sum = applyProgress(s, { inventory: { 'Power Cable': 1, 'Hornet Driver': 4, 'Electrical Components': 0, 'Not A Material': 3, 'Wasp Driver': 2.5, 'Rusted Tools': -1 } });
    expect(sum).toEqual({ fields: 1 });
    expect(s.inventory).toEqual({ 'Power Cable': 1, 'Hornet Driver': 4 });
    applyProgress(s, { inventory: { 'Power Cable': 0 } });
    expect(s.inventory).toEqual({ 'Hornet Driver': 4 });
    expect(normalizeProgressApply({ inventory: { 'Power Cable': 3, x: 'y', ['a'.repeat(90)]: 1 } })!.inventory).toEqual({ 'Power Cable': 3 });
  });

  it('store: zápis do Zásoby jde jen přes importProgress a vždy po snímku stavu', async () => {
    const kv = memoryKV();
    const base = createBrowserStorage(kv, () => NOW);
    const snaps: string[] = [];
    const adapter: StorageAdapter = { ...base, async createSnapshot(k, l, c) { snaps.push(k); return base.createSnapshot(k, l, c); } };
    const app = createApp(adapter, { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    const r = station(stationScreen({ title: 'GEAR BENCH', level: '01', roman: 1, rows: GEAR }));
    const p = proposeProgress(r, app.store.getState().state) as StationsProposal;
    const pick = Object.fromEntries(stockChanges(p).map(x => [x.name!, x.have!]));
    expect(await app.actions.importProgress({ ...defaultApply(p), inventory: pick })).toEqual({ fields: 4 });
    const s = app.store.getState().state;
    expect(s.stations.gear).toBe(1);
    expect(s.inventory).toMatchObject({ 'Power Cable': 1, 'Electrical Components': 3, 'Hornet Driver': 1 });
    expect(snaps).toEqual(['import']);
  });
});
