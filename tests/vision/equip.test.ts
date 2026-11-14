/* 0.24.0: rozpoznání zbraní (název, tier, munice) a augmentu v místech výbavy podle tvaru.
   Umělé obrazy (tvary zbraní z obdélníků, římské číslice) běží vždy; vlastní snímky hráče jen lokálně
   (tests/fixtures/vision/own, v .gitignore) a bez nich se přeskočí. Na vlastních snímcích se vypíše přesnost
   po polích (zbraň, tier, augment) a ověří se, že žádný název není špatně (nic se nehádá). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { resize, rotate, type RgbaImage } from '../../src/core/vision/image';
import type { Box } from '../../src/core/vision/layout';
import {
  AUGMENT_PAD, SHAPE_LEN, ASPECT_TOL, augmentImageArea, matchShape, readAmmo, readWeaponTier, shapeOf, shapeSimilarity, weaponImageArea, weaponTierArea, type EquipShape,
} from '../../src/core/vision/equip';
import { equipBoxes, readLoadout } from '../../src/core/vision/loadout';
import { detectLayout } from '../../src/core/vision/layout';
import { equipShapes, matchContext } from '../../src/core/catalog';
import { equipField, loadoutSnap, unknownSlots } from '../../src/core/raidLife';
import { getMaterials } from '../../src/core/gamedata';
import { defaultState } from '../../src/core/state';
import { syntheticFindings } from './findings';

/* ----- umělé tvary ----- */
type Rect = [number, number, number, number];
/* tvary v jednotkách 0–100 × 0–40 (hlaveň vlevo, pažba vpravo, rukojeť dole) */
const RIFLE: Rect[] = [[0, 14, 100, 4], [30, 10, 42, 10], [84, 10, 16, 15], [56, 20, 7, 14]];
const PISTOL: Rect[] = [[0, 2, 64, 14], [40, 16, 14, 22], [10, 0, 20, 3]];
const SCOPED: Rect[] = [[0, 16, 100, 3], [38, 3, 28, 7], [48, 18, 9, 18], [78, 13, 22, 13], [20, 12, 50, 6]];
const BG: [number, number, number, number] = [12, 15, 26, 255];
const blank = (w: number, h: number, bg = BG): RgbaImage => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(bg, i * 4);
  return { width: w, height: h, data: d };
};
/* nakreslí tvar s měřítkem k (px na jednotku) od bodu (x0, y0); jas s jemným vzorem jako kov */
function draw(img: RgbaImage, rects: Rect[], x0: number, y0: number, k: number) {
  for (const [rx, ry, rw, rh] of rects) {
    for (let y = Math.round(y0 + ry * k); y < Math.round(y0 + (ry + rh) * k); y++) for (let x = Math.round(x0 + rx * k); x < Math.round(x0 + (rx + rw) * k); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const v = 150 + Math.round(40 * Math.sin((x - x0) / (6 * k)) * Math.cos((y - y0) / (5 * k)));
      img.data.set([v, v, v + 6, 255], (y * img.width + x) * 4);
    }
  }
}
/* „ikona katalogu“: tvar ve velkém měřítku natočený o −32° (jako šikmé ikony MetaForge), pak narovnaný a zmenšený
   stejně jako ve scripts/gen-equip.mjs */
function catalogShape(name: string, rects: Rect[], extra: Partial<EquipShape> = {}): EquipShape {
  const big = blank(560, 260);
  draw(big, rects, 30, 40, 5);
  const tilted = rotate(big, -32, BG);
  const shapes = [30, 32, 34].map(a => {
    const r = rotate(tilted, a, BG);
    const s = resize(r, Math.round(r.width * 0.35), Math.round(r.height * 0.35));
    return shapeOf(s, { x: 0, y: 0, w: s.width, h: s.height }, null, 40)!;
  });
  return { name, kind: 'weapon', rarity: 'common', mag: 20, shapes, ...extra };
}
/* místo zbraně 304 × 200 (1080p) se zbraní vodorovně v horní polovině */
function weaponSlot(rects: Rect[], k: number): { img: RgbaImage; box: Box } {
  const img = blank(340, 240);
  const box: Box = { x: 18, y: 20, w: 304, h: 200 };
  const width = Math.max(...rects.map(r => r[0] + r[2])) * k;
  draw(img, rects, box.x + (box.w - width) / 2, box.y + 20, k);
  return { img, box };
}
const GREY: [number, number, number, number] = [100, 106, 120, 255];
const fill = (img: RgbaImage, x0: number, y0: number, w: number, h: number, c = GREY) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set(c, (y * img.width + x) * 4);
};
/* římská číslice v rohu místa (patky nahoře a dole spojují tahy jako ve hře) */
function tierGlyph(img: RgbaImage, box: Box, tier: 'I' | 'II' | 'IV') {
  const a = weaponTierArea(box);
  const x0 = Math.round(a.x + 3), y0 = Math.round(a.y + 5), h = 20;
  const w = tier === 'I' ? 9 : tier === 'II' ? 15 : 21;
  fill(img, x0, y0, w, 3); fill(img, x0, y0 + h - 3, w, 3);
  if (tier === 'I') fill(img, x0 + 3, y0, 3, h);
  if (tier === 'II') { fill(img, x0 + 3, y0, 3, h); fill(img, x0 + 9, y0, 3, h); }
  if (tier === 'IV') {
    fill(img, x0 + 2, y0, 3, h);
    for (let y = 0; y < h; y++) { const f = y / (h - 1); fill(img, Math.round(x0 + 7 + 5 * f), y0 + y, 3, 1); fill(img, Math.round(x0 + 18 - 5 * f), y0 + y, 3, 1); }
  }
}

const LIST = (): EquipShape[] => [catalogShape('Rifle', RIFLE), catalogShape('Pistol', PISTOL, { mag: 10 }), catalogShape('Scoped', SCOPED, { mag: 5 })];

describe('0.24.0: tvar normalizovaný měřítkem', () => {
  it('stejný tvar v jiném měřítku a natočení se shoduje, jiný tvar ne', () => {
    const list = LIST();
    for (const [name, rects] of [['Rifle', RIFLE], ['Pistol', PISTOL], ['Scoped', SCOPED]] as const) {
      for (const k of [1.6, 2.2, 2.6]) {
        const { img, box } = weaponSlot([...rects], k);
        const sh = shapeOf(img, weaponImageArea(box))!;
        expect(sh.v).toHaveLength(SHAPE_LEN);
        const m = matchShape(sh, 'weapon', 'common', list);
        expect(m, `${name} ×${k}`).toMatchObject({ name, conf: 'high' });
        expect(m.score).toBeGreaterThan(0.85);
      }
    }
    const a = shapeOf(weaponSlot(RIFLE, 2).img, weaponImageArea(weaponSlot(RIFLE, 2).box))!;
    const b = shapeOf(weaponSlot(PISTOL, 2).img, weaponImageArea(weaponSlot(PISTOL, 2).box))!;
    expect(shapeSimilarity(a.v, b.v)).toBeLessThan(0.75);
    expect(shapeSimilarity(a.v, a.v)).toBeCloseTo(1, 5);
    expect(shapeSimilarity(a.v, [1, 2, 3])).toBe(0);
  });
  it('prázdné místo nemá tvar; doplněk (tlumič) změní poměr stran: zbraň zůstane neznámá, nic se nehádá', () => {
    const empty = blank(340, 240);
    expect(shapeOf(empty, weaponImageArea({ x: 18, y: 20, w: 304, h: 200 }))).toBeNull();
    expect(matchShape(null, 'weapon', 'common', LIST())).toMatchObject({ name: null, conf: 'unknown', why: 'none' });
    /* tlumič: hlaveň o 60 % delší vlevo */
    const silenced: Rect[] = [[-60, 14, 60, 4], ...RIFLE].map(([x, y, w, h]) => [x + 60, y, w, h] as Rect);
    const { img, box } = weaponSlot(silenced, 1.5);
    const m = matchShape(shapeOf(img, weaponImageArea(box)), 'weapon', 'common', LIST());
    expect(m.name).toBeNull();
    expect(m.conf).not.toBe('high');
    expect(ASPECT_TOL).toBeLessThan(1.2);
  });
  it('vzácnost místa a přečtený zásobník vyřadí nemožné kandidáty', () => {
    const { img, box } = weaponSlot(RIFLE, 2);
    const sh = shapeOf(img, weaponImageArea(box));
    /* jiná vzácnost: Rifle (common) nepřichází v úvahu u modrého (rare) místa */
    expect(matchShape(sh, 'weapon', 'rare', LIST()).best).not.toBe('Rifle');
    /* zásobník 12 < základní 20: Rifle to být nemůže */
    expect(matchShape(sh, 'weapon', 'common', LIST(), 12).best).not.toBe('Rifle');
    /* zásobník 30 ≥ 20 (doplněk ho zvětší): Rifle dál platí */
    expect(matchShape(sh, 'weapon', 'common', LIST(), 30)).toMatchObject({ name: 'Rifle', conf: 'high' });
    /* jiný druh (augment) se se zbraněmi nepáruje */
    expect(matchShape(sh, 'augment', 'common', LIST()).name).toBeNull();
  });
  it('otočení: tam a zpět vrátí tvar', () => {
    const { img, box } = weaponSlot(RIFLE, 2);
    const back = rotate(rotate(img, 32, BG), -32, BG);
    const dx = (back.width - img.width) / 2, dy = (back.height - img.height) / 2;
    const area = weaponImageArea(box);
    const a = shapeOf(img, area)!, b = shapeOf(back, { ...area, x: area.x + dx, y: area.y + dy })!;
    expect(shapeSimilarity(a.v, b.v)).toBeGreaterThan(0.95);
    expect(rotate(img, 90).width).toBe(img.height);
  });
});

describe('0.24.0: tier a munice v místě zbraně', () => {
  it('římská číslice I, II a IV; bez číslice nic', () => {
    for (const tier of ['I', 'II', 'IV'] as const) {
      const { img, box } = weaponSlot(RIFLE, 2);
      tierGlyph(img, box, tier);
      expect(readWeaponTier(img, box), tier).toBe(tier);
    }
    const { img, box } = weaponSlot(RIFLE, 2);
    expect(readWeaponTier(img, box)).toBeNull();
    expect(readAmmo(img, box)).toBeNull();
  });
});

describe('0.24.0: celé čtení loadoutu (umělá obrazovka z veřejného vzoru)', () => {
  it('zbraň v místě 1 s tierem II se pozná a jde do loadoutu; bez tieru jde tier ke kontrole', () => {
    const img = syntheticFindings({ skip: [4, 5, 6] });
    const bp = detectLayout(img)!.panels.find(p => p.panel === 'backpack')!;
    const b = equipBoxes(bp);
    const width = 100 * 1.8;
    draw(img, RIFLE, b.weapon1.x + (b.weapon1.w - width) / 2, b.weapon1.y + 22, 1.8);
    tierGlyph(img, b.weapon1, 'II');
    draw(img, PISTOL, b.weapon2.x + 90, b.weapon2.y + 20, 1.6);
    const r = readLoadout(img, LIST())!;
    const w1 = r.equip.find(e => e.slot === 'weapon1')!, w2 = r.equip.find(e => e.slot === 'weapon2')!;
    expect(w1).toMatchObject({ state: 'item', tier: 'II', match: { name: 'Rifle', conf: 'high' } });
    expect(w2).toMatchObject({ state: 'item', tier: null, match: { name: 'Pistol', conf: 'high' } });
    const s = loadoutSnap(r, [], matchContext(getMaterials(defaultState()).map(m => m.name), []), 1);
    expect(s.fields.find(f => f.slot === 'weapon1')).toMatchObject({ name: 'Rifle II', conf: 'high', tierConf: 'high' });
    expect(s.fields.find(f => f.slot === 'weapon2')).toMatchObject({ name: 'Pistol', conf: 'high', tierConf: 'unknown' });
    expect(s.fields.find(f => f.slot === 'weapon1')!.score).toBeGreaterThan(0.8);
    /* zbraň bez tieru jde ke kontrole, prázdný augment a štít ne */
    expect(unknownSlots(s)).toEqual(['weapon2']);
  });
  it('pole ze shody: jistá = název, návrh pod prahem jen jako guess, neznámá bez názvu', () => {
    const e = (match: NonNullable<Parameters<typeof equipField>[0]['match']>, tier: 'I' | null = 'I') => equipField({ slot: 'weapon1', box: { x: 0, y: 0, w: 1, h: 1 }, state: 'item', rarity: 'common', fp: [], match, tier, ammo: null });
    expect(e({ name: 'Kettle', score: 0.88, conf: 'high', best: 'Kettle', second: 0.4 })).toEqual({ slot: 'weapon1', state: 'item', name: 'Kettle I', qty: 1, conf: 'high', score: 0.88, tierConf: 'high' });
    expect(e({ name: null, score: 0.79, conf: 'medium', best: 'Stitcher', second: 0.65, why: 'score' })).toEqual({ slot: 'weapon1', state: 'item', name: null, qty: 1, conf: 'unknown', score: 0.79, guess: 'Stitcher I', tierConf: 'high' });
    expect(e({ name: null, score: 0.6, conf: 'unknown', best: 'Anvil', second: 0.58, why: 'score' }, null)).toEqual({ slot: 'weapon1', state: 'item', name: null, qty: 1, conf: 'unknown', score: 0.6, tierConf: 'unknown' });
    const aug = equipField({ slot: 'augment', box: { x: 0, y: 0, w: 1, h: 1 }, state: 'item', rarity: 'common', fp: [], match: { name: 'Free Loadout Augment', score: 0.96, conf: 'high', best: 'Free Loadout Augment', second: 0 } });
    expect(aug).toEqual({ slot: 'augment', state: 'item', name: 'Free Loadout Augment', qty: 1, conf: 'high', score: 0.96 });
  });
});

describe('0.24.0: katalog tvarů (src/core/data/equipShapes.ts)', () => {
  it('zbraně se zásobníkem, augmenty, každý tvar celý', () => {
    const list = equipShapes();
    const weapons = list.filter(e => e.kind === 'weapon'), augments = list.filter(e => e.kind === 'augment');
    expect(weapons.length).toBeGreaterThanOrEqual(20);
    expect(augments.length).toBeGreaterThanOrEqual(10);
    expect(weapons.every(e => e.shapes.length === 3 && (e.mag ?? 0) > 0)).toBe(true);
    expect(list.every(e => e.shapes.every(s => s.v.length === SHAPE_LEN && s.aspect > 0))).toBe(true);
    expect(list.find(e => e.name === 'Free Loadout Augment')).toMatchObject({ kind: 'augment', rarity: 'common' });
    expect(list.find(e => e.name === 'Ferro')).toMatchObject({ kind: 'weapon', rarity: 'common', mag: 1 });
    /* názvy bez tieru (tier se čte z místa) */
    expect(weapons.some(e => /\s(I|II|III|IV)$/.test(e.name))).toBe(false);
    expect(augmentImageArea({ x: 0, y: 0, w: 100, h: 100 }).w).toBeCloseTo(72, 5);
    expect(AUGMENT_PAD).toBeGreaterThan(0);
  });
});

/* ----- vlastní snímky hráče (jen lokálně) ----- */
const OWN = new URL('../fixtures/vision/own/', import.meta.url);
const has = (n: string) => existsSync(new URL(n, OWN));
const load = (n: string): RgbaImage => { const p = PNG.sync.read(readFileSync(new URL(n, OWN))); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }; };
/* Skutečnost podle oka (2026-11-14): zbraň s tierem, augment; '' = prázdné nebo vylosované místo.
   Anvil IV má tlumič, Ferro II jinou pažbu, Torrente II jiný vzhled tieru než ikona katalogu (tier I). */
const TRUTH: Record<string, { weapon1: string; weapon2: string; augment: string }> = {
  'own-prerade-free-loadout.png': { weapon1: '', weapon2: '', augment: 'Free Loadout Augment' },
  'own-manage-loadout-free.png': { weapon1: '', weapon2: '', augment: 'Free Loadout Augment' },
  'own-manage-loadout-custom-empty.png': { weapon1: '', weapon2: '', augment: '' },
  'own-after-raid-survived-findings.png': { weapon1: 'Kettle I', weapon2: 'Ferro II', augment: 'Free Loadout Augment' },
  'own-after-raid-survived-findings-2.png': { weapon1: 'Ferro I', weapon2: '', augment: 'Free Loadout Augment' },
  'own-after-raid-knocked-out.png': { weapon1: '', weapon2: '', augment: '' },
  'own-after-raid-knocked-out-2.png': { weapon1: '', weapon2: '', augment: '' },
  'own-inraid-inventory.png': { weapon1: 'Stitcher I', weapon2: '', augment: 'Free Loadout Augment' },
  'return-and-progression/return-findings.png': { weapon1: 'Anvil IV', weapon2: 'Torrente II', augment: 'Free Loadout Augment' },
};
const OWN_FILES = Object.keys(TRUTH).filter(has);

describe('0.24.0: přesnost na vlastních snímcích (jen lokálně)', () => {
  it.skipIf(!OWN_FILES.length)('žádný špatný název; tier a augment všude, zbraně bez doplňků jistě', () => {
    const tally = { weapon: { n: 0, sure: 0, guess: 0, wrong: 0, top: 0 }, tier: { n: 0, ok: 0, wrong: 0 }, augment: { n: 0, sure: 0, wrong: 0 } };
    const lines: string[] = [];
    for (const n of OWN_FILES) {
      const r = readLoadout(load(n))!;
      const truth = TRUTH[n];
      for (const slot of ['weapon1', 'weapon2'] as const) {
        const e = r.equip.find(x => x.slot === slot)!;
        const want = truth[slot];
        if (!want) { expect(e.state, `${n} ${slot}`).not.toBe('item'); continue; }
        const [wName, wTier] = want.split(' ');
        tally.weapon.n++; tally.tier.n++;
        const m = e.match!;
        if (m.conf === 'high') { if (m.name === wName) tally.weapon.sure++; else tally.weapon.wrong++; }
        if (m.conf === 'medium' && m.best === wName) tally.weapon.guess++;
        if (m.best === wName) tally.weapon.top++;
        if (e.tier === wTier) tally.tier.ok++; else if (e.tier) tally.tier.wrong++;
        lines.push(`${n} ${slot}: ${want} → ${m.conf} ${m.name ?? '(' + m.best + ')'} ${m.score} tier ${e.tier ?? '?'} ammo ${e.ammo ? e.ammo.loaded + '/' + e.ammo.max : '?'}`);
      }
      const a = r.equip.find(x => x.slot === 'augment')!;
      if (!truth.augment) { expect(a.state, `${n} augment`).not.toBe('item'); continue; }
      tally.augment.n++;
      if (a.match?.conf === 'high') { if (a.match.name === truth.augment) tally.augment.sure++; else tally.augment.wrong++; }
      lines.push(`${n} augment: ${truth.augment} → ${a.match?.conf} ${a.match?.name} ${a.match?.score}`);
    }
    console.log(['přesnost po polích (vlastní snímky):', ...lines, JSON.stringify(tally)].join('\n'));
    /* nic se nehádá: žádný jistý název není špatně, žádný tier není špatně */
    expect(tally.weapon.wrong).toBe(0);
    expect(tally.tier.wrong).toBe(0);
    expect(tally.augment.wrong).toBe(0);
    if (has('own-after-raid-survived-findings.png') && has('own-after-raid-survived-findings-2.png')) expect(tally.weapon.sure).toBeGreaterThanOrEqual(2);
    expect(tally.tier.ok).toBe(tally.tier.n);
    expect(tally.augment.sure).toBe(tally.augment.n);
  });
  it.skipIf(!has('own-inraid-inventory.png'))('inventář v raidu: Stitcher je těsně pod prahem, jen návrh ke kontrole; munice 20/20', () => {
    const r = readLoadout(load('own-inraid-inventory.png'))!;
    const w = r.equip.find(e => e.slot === 'weapon1')!;
    expect(w.ammo).toEqual({ loaded: 20, max: 20 });
    const s = loadoutSnap(r, [], matchContext(getMaterials(defaultState()).map(m => m.name), []), 1);
    expect(s.fields.find(f => f.slot === 'weapon1')).toMatchObject({ name: null, conf: 'unknown', guess: 'Stitcher I', tierConf: 'high' });
  });
});
