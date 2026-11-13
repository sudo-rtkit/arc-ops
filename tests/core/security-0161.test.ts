/* 0.16.1 (bezpečnost): rozměry obrázku z hlavičky a rozpočet před dekódováním, klíče __proto__ / constructor /
   prototype ze zálohy a uloženého stavu, limit velikosti při ukládání stejný jako při načtení. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_PIXELS, MAX_SIDE_PX, dataUrlBytes, dataUrlSize, imageSize, withinBudget } from '../../src/core/imageSize';
import { parseBackup, makeBackup, APP_ID } from '../../src/core/backup';
import { defaultState, normalize, SCHEMA } from '../../src/core/state';
import { MAX_STATE_BYTES, fitsState, safeEntries, safeJsonParse, utf8Bytes } from '../../src/core/util';
import { createApp } from '../../src/store/app';
import { createBrowserStorage, memoryKV } from '../../src/storage/browser';
import { t } from '../../src/i18n';

const NOW = new Date(2026, 10, 12, 12, 0).getTime();
const FIX = fileURLToPath(new URL('../fixtures/vision/', import.meta.url));

const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
/* JPEG: SOI, APP0 (JFIF), APP1 s „EXIF“ výplní, DQT a SOF0 (výška, šířka) */
const jpeg = (w: number, h: number, sof = 0xc0, pad = 100) => {
  const app1 = [0xff, 0xe1, ((pad + 2) >> 8) & 0xff, (pad + 2) & 0xff, ...new Array(pad).fill(0x45)];
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    ...app1,
    0xff, 0xdb, 0, 3, 0,
    0xff, sof, 0, 11, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 2,
  ]);
};
const riff = (chunk: string, data: number[]) => {
  const b = new Uint8Array(20 + Math.max(data.length, 10));
  b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0);
  b.set([...'WEBP'].map(c => c.charCodeAt(0)), 8);
  b.set([...chunk].map(c => c.charCodeAt(0)), 12);
  b.set(data, 20);
  return b;
};

describe('0.16.1: rozměry obrázku z hlavičky', () => {
  it('PNG, JPEG (baseline i progresivní, s metadaty), WebP (VP8, VP8L, VP8X), GIF a BMP', () => {
    expect(imageSize(png(1920, 1080))).toEqual({ kind: 'png', w: 1920, h: 1080 });
    expect(imageSize(jpeg(3840, 2160))).toEqual({ kind: 'jpeg', w: 3840, h: 2160 });
    expect(imageSize(jpeg(800, 600, 0xc2, 5000))).toEqual({ kind: 'jpeg', w: 800, h: 600 });
    /* DHT (C4) není rámec obrázku: bez SOF před daty je výsledek null */
    expect(imageSize(jpeg(800, 600, 0xc4))).toBeNull();
    /* VP8 (ztrátový): rámec 9d 01 2a, 14 bitů šířky a výšky */
    expect(imageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x07, 0x38, 0x04]))).toEqual({ kind: 'webp', w: 1920, h: 1080 });
    /* VP8L (bezztrátový): podpis 0x2f, šířka-1 a výška-1 po 14 bitech */
    const w = 1919, h = 1079;
    expect(imageSize(riff('VP8L', [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]))).toEqual({ kind: 'webp', w: 1920, h: 1080 });
    /* VP8X: plátno šířka-1 a výška-1 po 24 bitech */
    expect(imageSize(riff('VP8X', [0, 0, 0, 0, 0x7f, 0x3e, 0, 0x7f, 0x3e, 0]))).toEqual({ kind: 'webp', w: 16000, h: 16000 });
    expect(imageSize(new Uint8Array([...'GIF89a'].map(c => c.charCodeAt(0)).concat([0x40, 0x01, 0xf0, 0x00])))).toEqual({ kind: 'gif', w: 320, h: 240 });
    const bmp = new Uint8Array(54);
    bmp.set([0x42, 0x4d]);
    new DataView(bmp.buffer).setUint32(14, 40, true);
    new DataView(bmp.buffer).setInt32(18, 640, true);
    new DataView(bmp.buffer).setInt32(22, -480, true);
    expect(imageSize(bmp)).toEqual({ kind: 'bmp', w: 640, h: 480 });
  });

  it('skutečné PNG z testovacích dat', () => {
    const b = new Uint8Array(readFileSync(FIX + 'sample-stash-all-top-1080p.png'));
    const size = imageSize(b);
    expect(size?.kind).toBe('png');
    expect(size!.w).toBeGreaterThan(1000);
    expect(size!.h).toBeGreaterThan(600);
  });

  it('neznámý, zkrácený nebo poškozený soubor dá null (svg, text, prázdný)', () => {
    for (const b of [new Uint8Array(0), new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), png(1, 1).slice(0, 20), new Uint8Array([0xff, 0xd8, 0xff]), new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]), riff('VP8 ', [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7])]) {
      expect(imageSize(b)).toBeNull();
    }
    expect(imageSize(png(0, 100))).toBeNull();
  });

  it('rozpočet: 8192 px na stranu a 40 MP; 8K monitor projde, obří obrázek ne', () => {
    expect(MAX_SIDE_PX).toBe(8192);
    expect(MAX_PIXELS).toBe(40 * 1024 * 1024);
    expect(withinBudget(7680, 4320)).toBe(true);
    expect(withinBudget(8192, 5120)).toBe(true);
    expect(withinBudget(8192, 8192)).toBe(false);
    expect(withinBudget(8193, 10)).toBe(false);
    expect(withinBudget(16000, 16000)).toBe(false);
    expect(withinBudget(0, 10)).toBe(false);
    expect(withinBudget(NaN, 10)).toBe(false);
  });

  it('data URL: jen začátek stačí na hlavičku', () => {
    const url = 'data:image/png;base64,' + Buffer.from(png(16000, 16000)).toString('base64') + 'A'.repeat(1000);
    expect(dataUrlSize(url)).toEqual({ kind: 'png', w: 16000, h: 16000 });
    expect(dataUrlBytes(url, 24)?.length).toBe(24);
    expect(dataUrlBytes('data:image/png,abc')).toBeNull();
    expect(dataUrlBytes('nesmysl')).toBeNull();
  });
});

describe('0.16.1: klíče __proto__, constructor a prototype', () => {
  const evil = JSON.stringify({
    app: APP_ID, schema: SCHEMA, exportedAt: '2026-11-12T10:00:00.000Z',
    state: {
      schema: SCHEMA,
      /* vypočtený klíč ['__proto__'] vytvoří vlastní vlastnost (jako JSON.parse), JSON.stringify ji zapíše */
      inventory: { ['__proto__']: { polluted: 1 }, constructor: 5, prototype: 7, Wires: 3 },
      gameData: { arc: { ['__proto__']: { name: 'Hack', tactic: 'x' }, Tick: { name: 'Tick 2' } }, materials: { ['__proto__']: { category: 'x' } } },
      quests: { objectives: { ['__proto__']: ['a'], constructor: ['b'] } },
      arcNotes: { ['__proto__']: 'x', Tick: 'poznámka' },
      weaponNotes: { ['__proto__']: { tier: 'S', note: 'x' } },
      checklists: { checked: { ['__proto__']: true, 'item-a': true } },
      buddy: { positions: { ['__proto__']: { x: 1, y: 2 } } },
    },
  });

  it('JSON.stringify zachová klíč __proto__ (tak vypadá podvržená záloha)', () => {
    expect(evil).toContain('"__proto__":{"polluted":1}');
    expect(Object.getPrototypeOf(JSON.parse(evil).state.inventory)).toBe(Object.prototype);
    /* obyčejný JSON.parse klíč nechá jako vlastní, safeJsonParse ho zahodí */
    expect(Object.hasOwn(JSON.parse(evil).state.inventory, '__proto__')).toBe(true);
    expect(Object.hasOwn(safeJsonParse(evil) as object, 'state')).toBe(true);
    expect(Object.hasOwn((safeJsonParse(evil) as { state: { inventory: object } }).state.inventory, '__proto__')).toBe(false);
  });

  const check = (s: ReturnType<typeof normalize>) => {
    for (const o of [s.inventory, s.gameData.arc, s.gameData.materials, s.quests.objectives, s.arcNotes, s.weaponNotes, s.checklists.checked, s.buddy.positions]) {
      expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
      for (const k of ['__proto__', 'constructor', 'prototype']) expect(Object.hasOwn(o, k), k).toBe(false);
    }
    expect((s.inventory as Record<string, unknown>).polluted).toBeUndefined();
    expect('name' in s.gameData.arc).toBe(false);
    expect(Array.isArray(s.quests.objectives)).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(s.inventory.Wires).toBe(3);
    expect(s.arcNotes.Tick).toBe('poznámka');
    expect(s.checklists.checked['item-a']).toBe(true);
  };

  it('import podvržené zálohy: záznamy mají běžný prototyp a nebezpečné klíče zmizí', () => {
    const p = parseBackup(evil, NOW);
    if ('error' in p) throw new Error(p.error);
    check(p.state);
  });

  it('normalize je bezpečný i pro objekt z obyčejného JSON.parse (uložený stav, snímek)', () => {
    check(normalize(JSON.parse(evil).state, NOW));
    expect(safeEntries(JSON.parse('{"__proto__":1,"constructor":2,"a":3}'))).toEqual([['a', 3]]);
    expect(safeEntries(null)).toEqual([]);
    expect(safeEntries('abc')).toEqual([]);
  });

  it('načtení uloženého stavu s __proto__ (Tauri i prohlížeč jdou stejnou cestou)', async () => {
    const kv = memoryKV();
    const raw = evil.slice(evil.indexOf('"state":') + 8, -1);
    expect(raw).toContain('"__proto__"');
    kv.setItem('arcops:state', raw);
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    check(app.store.getState().state);
  });
});

describe('0.16.1: limit velikosti při ukládání', () => {
  it('délka v UTF-8 a limit', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('čš')).toBe(4);
    expect(utf8Bytes('€')).toBe(3);
    expect(utf8Bytes('😀')).toBe(4);
    expect(utf8Bytes('\ud800x')).toBe(4);
    expect(MAX_STATE_BYTES).toBe(20 * 1024 * 1024);
    expect(fitsState('x'.repeat(MAX_STATE_BYTES))).toBe(true);
    expect(fitsState('x'.repeat(MAX_STATE_BYTES + 1))).toBe(false);
    expect(fitsState('č'.repeat(MAX_STATE_BYTES / 2))).toBe(true);
    expect(fitsState('č'.repeat(MAX_STATE_BYTES / 2 + 1))).toBe(false);
  });

  it('stav nad 20 MB se neuloží: varování, uložený soubor zůstane a příští start ho načte bez návratu na zálohu', async () => {
    const kv = memoryKV();
    const st = defaultState(NOW);
    kv.setItem('arcops:state', JSON.stringify(st));
    const app = createApp(createBrowserStorage(kv, () => NOW), { now: () => NOW, debounceMs: 0, weekCheckMs: 0 });
    await app.init();
    const saved = kv.getItem('arcops:state');
    app.actions.toggleCheck('item-a');
    await app.flush();
    const good = kv.getItem('arcops:state');
    expect(good).not.toBe(saved);
    /* obří stav (např. tisíce raidů s poznámkami) */
    const big = structuredClone(app.store.getState().state);
    big.arcNotes = Object.fromEntries(Array.from({ length: 6000 }, (_, i) => ['n' + i, 'x'.repeat(4000)]));
    app.store.setState({ state: big });
    app.actions.toggleCheck('item-b');
    await app.flush();
    expect(app.store.getState().save).toBe('error');
    expect(app.store.getState().saveError).toBe(t('save.tooBig'));
    expect(app.store.getState().notices.at(-1)).toMatchObject({ tone: 'danger', text: t('save.tooBig') });
    expect(kv.getItem('arcops:state')).toBe(good);
    /* ruční snímek se také odmítne s varováním */
    expect(await app.actions.createManualSnapshot('x')).toBe(false);
    /* menší stav se zase uloží */
    app.store.setState({ state: { ...app.store.getState().state, arcNotes: {} } });
    app.actions.toggleCheck('item-c');
    await app.flush();
    expect(app.store.getState().save).toBe('saved');
    expect(JSON.parse(kv.getItem('arcops:state')!).checklists.checked['item-c']).toBe(true);
    expect(makeBackup(app.store.getState().state).length).toBeLessThan(MAX_STATE_BYTES);
  });
});
