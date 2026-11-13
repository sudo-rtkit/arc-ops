/* 0.20.0: čtení výbavy z přípravy loadoutu (MANAGE LOADOUT) a z obrazovky výsledku raidu.
   Vlastní snímky hráče jsou jen lokálně (tests/fixtures/vision/own, v .gitignore); bez nich se testy na nich
   přeskočí. Umělá obrazovka z veřejného vzoru (tests/vision/findings.ts) běží vždy. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';
import { EQUIP_SLOTS, equipBoxes, readLoadout, valueArea } from '../../src/core/vision/loadout';
import { readAutoCapture } from '../../src/core/opsCapture';
import { loadoutSnap, packKnown, unknownSlots } from '../../src/core/raidLife';
import { matchContext } from '../../src/core/catalog';
import { getMaterials } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { syntheticFindings } from './findings';

const OWN = new URL('../fixtures/vision/own/', import.meta.url);
const has = (n: string) => existsSync(new URL(n, OWN));
const load = (n: string): RgbaImage => { const p = PNG.sync.read(readFileSync(new URL(n, OWN))); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
const ctx = () => matchContext(getMaterials(defaultState()).map(m => m.name), []);

describe('výbava: geometrie podle mřížky batohu', () => {
  it('místa výbavy a řádek hodnoty se škálují s roztečí políček', () => {
    const b = equipBoxes({ x: 1044, y: 272, pitchX: 104 });
    expect(b.augment).toEqual({ x: 692, y: 272, w: 144, h: 96 });
    expect(b.shield).toEqual({ x: 852, y: 272, w: 144, h: 96 });
    expect(b.weapon1).toEqual({ x: 692, y: 392, w: 304, h: 200 });
    expect(b.weapon2).toEqual({ x: 692, y: 608, w: 304, h: 200 });
    const big = equipBoxes({ x: 1392, y: 362.67, pitchX: 138.67 });
    expect(big.weapon2.w).toBeCloseTo(405.3, 0);
    expect(valueArea({ x: 1044, y: 272, pitchX: 104 })).toEqual({ x: 794, y: 172, w: 230, h: 26 });
  });
});

describe('výbava: umělá obrazovka (veřejný vzor)', () => {
  it('prázdná výbava, předměty v batohu a quick use, neznámý druh loadoutu', () => {
    const r = readLoadout(syntheticFindings({ skip: [4, 5, 6] }))!;
    expect(r.kind).toBe('unknown');
    expect(r.equip.map(e => e.state)).toEqual(['empty', 'empty', 'empty', 'empty']);
    const s = loadoutSnap(r, [], ctx(), 1);
    expect(s.fields.filter(f => f.state === 'item').map(f => `${f.slot}:${f.name}:${f.qty}:${f.conf}`)).toEqual([
      'backpack:Launcher Ammo:12:high', 'backpack:Light Ammo:156:high', 'backpack:Medium Ammo:80:high', 'quickUse:Shotgun Ammo:3:high',
    ]);
    expect(packKnown(s)).toBe(true);
    expect(unknownSlots(s)).toEqual([]);
    /* prázdný nebo vadný obraz */
    expect(readLoadout({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBeNull();
    expect(readAutoCapture({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, 'loadout')).toEqual({ kind: 'empty' });
  });
});

describe('výbava: vlastní snímky hráče (jen lokálně)', () => {
  it.skipIf(!has('own-prerade-free-loadout.png'))('volný loadout: druh, hodnota 660, augment, ostatní vylosuje hra', () => {
    const r = readLoadout(load('own-prerade-free-loadout.png'))!;
    expect(r.kind).toBe('free');
    expect(r.value).toBe(660);
    expect([r.backpackMax, r.quickUseMax]).toEqual([14, 4]);
    expect(r.equip.map(e => `${e.slot}:${e.state}`)).toEqual(['augment:item', 'shield:random', 'weapon1:random', 'weapon2:random']);
    const s = loadoutSnap(r, [], ctx(), 1);
    /* augment volného loadoutu v katalogu není: zůstane neznámý (nic se nehádá) */
    expect(s.fields.find(f => f.slot === 'augment')).toMatchObject({ state: 'item', name: null, conf: 'unknown' });
    expect(s.fields.filter(f => f.slot === 'backpack' || f.slot === 'quickUse').map(f => f.state)).toEqual(['random', 'random']);
    expect(packKnown(s)).toBe(false);
    expect(unknownSlots(s)).toEqual(['augment', 'shield', 'weapon1', 'weapon2', 'backpack', 'quickUse']);
  });
  it.skipIf(!has('own-after-raid-survived-findings.png'))('výsledek FINDINGS: štít Light Shield, zbraně jako předměty, hodnota loadoutu', () => {
    for (const [n, value] of [['own-after-raid-survived-findings.png', 26531], ['return-and-progression/return-findings.png', 55551]] as const) {
      if (!has(n)) continue;
      const r = readLoadout(load(n))!;
      expect(r.value, n).toBe(value);
      expect(r.equip.map(e => e.state), n).toEqual(['item', 'item', 'item', 'item']);
      const s = loadoutSnap(r, [], ctx(), 1);
      expect(s.fields.find(f => f.slot === 'shield'), n).toMatchObject({ name: 'Light Shield', conf: 'high' });
      expect(s.fields.filter(f => f.slot === 'weapon1' || f.slot === 'weapon2').every(f => f.conf === 'unknown' && f.name === null), n).toBe(true);
      expect(readAutoCapture(load(n), 'findings')).toMatchObject({ kind: 'result', outcome: 'survived', read: expect.objectContaining({ coins: null }) });
    }
  });
  it.skipIf(!has('own-after-raid-knocked-out.png'))('výsledek KNOCKED OUT: prázdná výbava, hodnota 0, výsledek bez lootu', () => {
    const img = load('own-after-raid-knocked-out.png');
    const r = readLoadout(img)!;
    expect(r.value).toBe(0);
    expect(r.equip.map(e => e.state)).toEqual(EQUIP_SLOTS.map(() => 'empty'));
    expect(readAutoCapture(img, 'knockedOut')).toEqual({ kind: 'result', outcome: 'knockedOut', read: null });
  });
});
