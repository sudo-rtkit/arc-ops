/* 0.20.0: čtení výbavy z přípravy loadoutu (MANAGE LOADOUT) a z obrazovky výsledku raidu.
   Vlastní snímky hráče jsou jen lokálně (tests/fixtures/vision/own, v .gitignore); bez nich se testy na nich
   přeskočí. Umělá obrazovka z veřejného vzoru (tests/vision/findings.ts) běží vždy. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../src/core/vision/image';
import { EQUIP_SLOTS, equipBoxes, parseWeight, readLoadout, valueArea } from '../../src/core/vision/loadout';
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

describe('0.23.0: váha z řádku pod LOADOUT', () => {
  it('spojí části před hodnotou a čte jedno desetinné místo; jinak nic nehádá', () => {
    expect(parseWeight(['00/300', '0'])).toEqual({ weight: 0, max: 30 });
    /* mezera po tečce rozdělí „0.0/35.0“ na „00/35“ a „0“ */
    expect(parseWeight(['00/35', '0', '660'])).toEqual({ weight: 0, max: 35 });
    expect(parseWeight(['00/350', '660'])).toEqual({ weight: 0, max: 35 });
    expect(parseWeight(['21', '2/35', '0', '18608'])).toEqual({ weight: 21.2, max: 35 });
    /* bez hodnoty, bez lomítka, nesmyslná mez nebo váha */
    expect(parseWeight(['00/300'])).toBeNull();
    expect(parseWeight(['123', '0'])).toBeNull();
    expect(parseWeight(['00/9999', '0'])).toBeNull();
    expect(parseWeight(['999/300', '0'])).toBeNull();
    expect(parseWeight([])).toBeNull();
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
    /* 0.24.0: augment volného loadoutu se pozná podle tvaru (Free Loadout Augment) */
    expect(s.fields.find(f => f.slot === 'augment')).toMatchObject({ state: 'item', name: 'Free Loadout Augment', conf: 'high' });
    expect(s.fields.find(f => f.slot === 'augment')!.score).toBeGreaterThan(0.9);
    expect(s.fields.filter(f => f.slot === 'backpack' || f.slot === 'quickUse').map(f => f.state)).toEqual(['random', 'random']);
    expect(packKnown(s)).toBe(false);
    expect(unknownSlots(s)).toEqual(['shield', 'weapon1', 'weapon2', 'backpack', 'quickUse']);
  });
  it.skipIf(!has('own-after-raid-survived-findings.png'))('výsledek FINDINGS: štít Light Shield, zbraně jako předměty, hodnota loadoutu', () => {
    /* 0.24.0: Kettle I se pozná; Ferro II (jiná pažba), Anvil IV (tlumič) a Torrente II (doplňky) jsou od ikony
       katalogu moc daleko. 0.25.0: všechny tři jistě přes zásobník (jediná zbraň vzácnosti místa, ke které přečtený
       zásobník sedí, a zároveň první podle tvaru) */
    const weapons: Record<string, (string | null)[]> = { 'own-after-raid-survived-findings.png': ['Kettle I', 'Ferro II'], 'return-and-progression/return-findings.png': ['Anvil IV', 'Torrente II'] };
    for (const [n, value] of [['own-after-raid-survived-findings.png', 26531], ['return-and-progression/return-findings.png', 55551]] as const) {
      if (!has(n)) continue;
      const r = readLoadout(load(n))!;
      expect(r.value, n).toBe(value);
      expect(r.equip.map(e => e.state), n).toEqual(['item', 'item', 'item', 'item']);
      const s = loadoutSnap(r, [], ctx(), 1);
      expect(s.fields.find(f => f.slot === 'shield'), n).toMatchObject({ name: 'Light Shield', conf: 'high' });
      expect(s.fields.filter(f => f.slot === 'weapon1' || f.slot === 'weapon2').map(f => f.name), n).toEqual(weapons[n]);
      expect(s.fields.find(f => f.slot === 'augment'), n).toMatchObject({ name: 'Free Loadout Augment', conf: 'high' });
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
  /* 0.22.1: další vlastní snímky (jen lokálně) */
  it.skipIf(!has('own-manage-loadout-free.png'))('MANAGE LOADOUT, záložka FREE LOADOUT: stejné čtení jako dřívější snímek', () => {
    const r = readLoadout(load('own-manage-loadout-free.png'))!;
    expect([r.kind, r.value, r.backpackMax, r.quickUseMax]).toEqual(['free', 660, 14, 4]);
    expect(r.equip.map(e => `${e.slot}:${e.state}`)).toEqual(['augment:item', 'shield:random', 'weapon1:random', 'weapon2:random']);
  });
  it.skipIf(!has('own-manage-loadout-custom-empty.png'))('MANAGE LOADOUT, záložka CUSTOM LOADOUT s prázdným loadoutem: vlastní, hodnota 0, výbava prázdná', () => {
    const r = readLoadout(load('own-manage-loadout-custom-empty.png'))!;
    expect([r.kind, r.value]).toEqual(['custom', 0]);
    expect(r.equip.map(e => e.state)).toEqual(EQUIP_SLOTS.map(() => 'empty'));
    /* 0.23.0: oprava známé meze z 0.22.1: modrozelený popisek 0/20 a 0/5 se přečte a volná místa „+“ jsou prázdná,
       ne neznámý předmět; váha 0.0/30.0 z řádku pod LOADOUT */
    expect([r.backpackMax, r.quickUseMax]).toEqual([20, 5]);
    expect([r.weight, r.weightMax]).toEqual([0, 30]);
    expect(r.backpack).toEqual([]);
    expect(r.quickUse).toEqual([]);
    const s = loadoutSnap(r, [], ctx(), 1);
    expect(s.fields.filter(f => f.state === 'item')).toEqual([]);
    expect(packKnown(s)).toBe(true);
    expect(unknownSlots(s)).toEqual([]);
  });
  it.skipIf(!has('own-manage-loadout-free.png'))('0.23.0: volný loadout: mez váhy 35.0 z řádku pod LOADOUT', () => {
    const r = readLoadout(load('own-manage-loadout-free.png'))!;
    expect([r.weight, r.weightMax]).toEqual([0, 35]);
  });
  it.skipIf(!has('own-after-raid-survived-findings.png'))('0.23.0: výsledek FINDINGS: váha výbavy proti mezi', () => {
    const r = readLoadout(load('own-after-raid-survived-findings.png'))!;
    expect(r.weightMax).toBe(35);
    expect(r.weight).toBeGreaterThan(0);
    if (has('own-after-raid-survived-findings-2.png')) expect(readLoadout(load('own-after-raid-survived-findings-2.png'))!).toMatchObject({ weight: 21.2, weightMax: 35 });
  });
  it.skipIf(!has('own-after-raid-survived-findings-2.png'))('druhý výsledek FINDINGS: hodnota 18 608, batoh 12/14, quick use 4/4, štít Light Shield', () => {
    const img = load('own-after-raid-survived-findings-2.png');
    const r = readLoadout(img)!;
    expect([r.value, r.backpackMax, r.quickUseMax]).toEqual([18608, 14, 4]);
    expect(r.equip.map(e => e.state)).toEqual(['item', 'item', 'item', 'empty']);
    const s = loadoutSnap(r, [], ctx(), 1);
    expect(s.fields.find(f => f.slot === 'shield')).toMatchObject({ name: 'Light Shield', conf: 'high' });
    /* 0.24.0: zbraň Ferro se pozná podle tvaru, tier I z římské číslice */
    expect(s.fields.find(f => f.slot === 'weapon1')).toMatchObject({ state: 'item', name: 'Ferro I', conf: 'high', tierConf: 'high' });
    const res = readAutoCapture(img, 'findings');
    expect(res).toMatchObject({ kind: 'result', outcome: 'survived' });
    const pack = s.fields.filter(f => f.slot === 'backpack' || f.slot === 'quickUse');
    expect(pack.filter(f => f.slot === 'backpack')).toHaveLength(12);
    expect(pack.filter(f => f.slot === 'quickUse')).toHaveLength(4);
    /* 14 z 16 obsazených políček pojmenovaných s jistotou */
    expect(pack.filter(f => f.conf === 'high' && f.name).length).toBeGreaterThanOrEqual(14);
    expect(pack.find(f => f.name === 'Heavy Ammo')?.qty).toBe(27);
  });
  it.skipIf(!has('own-after-raid-knocked-out-2.png'))('druhý výsledek KNOCKED OUT: prázdný loadout, hodnota 0', () => {
    const img = load('own-after-raid-knocked-out-2.png');
    const r = readLoadout(img)!;
    expect(r.value).toBe(0);
    expect(r.equip.map(e => e.state)).toEqual(EQUIP_SLOTS.map(() => 'empty'));
    expect(readAutoCapture(img, 'knockedOut')).toEqual({ kind: 'result', outcome: 'knockedOut', read: null });
  });
});
